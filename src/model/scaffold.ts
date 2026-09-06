import { basename, dirname } from 'node:path'
import type { LayoutJson } from '../render/assets.ts'
import { DETAILS_ROLES, slotText } from '../render/slot-render.js'
import {
  type Deck,
  type Element,
  type MergeReport,
  mergeSlides,
  type Slide,
  type Slot,
  sha256,
} from './deck.ts'
import type { Story, StorySlide } from './story.ts'

export const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='%23ddd6c6'/><path d='M0 9 L5 4 L8 7 L11 5 L16 9 Z' fill='%23b5ad9c'/><circle cx='12' cy='2.5' r='1.2' fill='%23b5ad9c'/></svg>"

const METRIC = /^(\S{1,12}?)\s*[｜|]\s*(.+?)(?:\s*[｜|]\s*(.+))?$/

export function metricOrText(item: string): Slot {
  const m = METRIC.exec(item.trim())
  if (!m?.[1] || !m[2]) return { type: 'text', value: item.trim() }
  const slot: Slot = { type: 'metric', value: m[1], label: m[2].trim() }
  if (m[3]) slot.delta = m[3].trim()
  return slot
}

export function splitSide(item: string | undefined): { title: string; items: string[] } {
  if (!item) return { title: '', items: [] }
  const idx = item.search(/[：:]/)
  if (idx === -1) return { title: item.trim(), items: [] }
  const title = item.slice(0, idx).trim()
  const items = item
    .slice(idx + 1)
    .split(/\s*(?:→|、|,|，|；|;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
  return { title, items }
}

/** Default layout for a story slide; the agent may override per slide. */
export function autoLayout(slide: StorySlide): string {
  if (slide.scene_role === 'hero') return 'cover'
  if (slide.scene_role === 'close') return 'closing'
  switch (slide.content_relation) {
    case 'comparison':
      return 'comparison'
    case 'list':
    case 'hierarchy':
      return 'cards'
    case 'closing':
      return 'closing'
    case 'evidence':
      return slide.evidence.length >= 2 && slide.evidence.every((e) => METRIC.test(e.trim()))
        ? 'cards'
        : 'statement'
    default:
      return 'statement'
  }
}

function accepts(layout: LayoutJson, slotId: string, type: Slot['type']): boolean {
  const decl = layout.slots[slotId]
  if (!decl) return false
  return (Array.isArray(decl.type) ? decl.type : [decl.type]).includes(type)
}

// ---- page furniture -------------------------------------------------------------------------
// kicker, meta and brand are chips, eyebrows or a top bar: a whole occasion sentence overflows
// them (the warm-keynote meta chip is 261px at 24px). The scaffold therefore fills them with short
// labels and leaves them empty, with a warning, rather than overflow.

// Hangul jamo, CJK radicals through Yi (kana and the CJK unified block included), Hangul
// syllables, CJK compatibility, vertical forms, fullwidth forms and signs, and the en/em dash.
const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u2013\u2014]/
// fullwidth and ASCII comma, full stop, semicolon, colon, exclamation and question marks, opening brackets
const CLAUSE_END = /[\uFF0C,\u3002\uFF0E\uFF1B;\uFF1A:\uFF01!\uFF1F?\uFF08(\u300C\u300E\u3010[]/
// a subtitle separator: a colon, or a spaced dash / bar
const SERIES_END = /[\uFF1A:]|\s[\u2014\u2013|\uFF5C-]\s/

/** Width of a string in CJK character units: a CJK, fullwidth or dash character counts 1, anything else ½. */
export function textUnits(text: string): number {
  let units = 0
  for (const ch of text) units += WIDE_CHAR.test(ch) ? 1 : 0.5
  return units
}

/** The first clause of a sentence: what comes before its first comma, full stop, colon, semicolon or bracket. */
export function firstClause(text: string): string {
  const idx = text.search(CLAUSE_END)
  return (idx === -1 ? text : text.slice(0, idx)).trim()
}

/** A title's series name: what comes before a subtitle separator ("：", ": ", " — ", " | "). */
export function seriesName(title: string): string {
  const idx = title.search(SERIES_END)
  return (idx === -1 ? title : title.slice(0, idx)).trim()
}

/**
 * kicker and meta labels (chips, eyebrows) hold at most this many CJK character units: the
 * tightest slot across the theme packs is warm-keynote's meta chip, 259px at 24px ≈ 10 characters
 * (`pnpm layout:gallery --capacity` measures them).
 */
export const FURNITURE_MAX_UNITS = 10
/** brand (the top-bar series name) is wider: the tightest is 800px at 22px ≈ 29 characters. */
export const BRAND_MAX_UNITS = 24

/** `text` when it fits within `max` units, otherwise '' — the slot is left empty rather than overflow. */
export function fitLabel(text: string, max: number): string {
  return text && textUnits(text) <= max ? text : ''
}

export interface FurnitureDefaults {
  /** the occasion's first clause, for meta and a hero page's kicker; '' when even that is too long */
  occasion: string
  /** the title's series name, for brand; '' when too long */
  brand: string
}

export function furnitureDefaults(story: Story): FurnitureDefaults {
  return {
    occasion: fitLabel(firstClause(story.meta.occasion), FURNITURE_MAX_UNITS),
    brand: fitLabel(seriesName(story.meta.title), BRAND_MAX_UNITS),
  }
}

/**
 * Chapter labels `01 — 骨架` for every slide whose story entry names a chapter; chapters are
 * numbered in order of first appearance, so pages that share a chapter share its number.
 */
export function chapterLabels(story: Story): Map<string, string> {
  const numbers = new Map<string, number>()
  const out = new Map<string, string>()
  for (const s of story.slides) {
    if (!s.chapter) continue
    if (!numbers.has(s.chapter)) numbers.set(s.chapter, numbers.size + 1)
    out.set(s.id, `${String(numbers.get(s.chapter)).padStart(2, '0')} — ${s.chapter}`)
  }
  return out
}

/** Best-effort mapping from story fields to a layout's slots. The agent refines the wording afterwards. */
export function slotsFor(
  slide: StorySlide,
  layout: LayoutJson,
  story: Story,
): Record<string, Slot> {
  const out: Record<string, Slot> = {}
  const ev = slide.evidence
  const text = (value: string): Slot => ({ type: 'text', value })
  const put = (id: string, slot: Slot) => {
    if (accepts(layout, id, slot.type)) out[id] = slot
  }

  put('title', text(slide.title))
  // page furniture: only lands on layouts that declare these slots. The kicker is the chapter
  // label when the story names one; on a hero page without one it is the occasion (series label);
  // elsewhere it stays empty, because the scaffold cannot tell which chapter a page belongs to.
  const furniture = furnitureDefaults(story)
  const chapter = chapterLabels(story).get(slide.id)
  if (chapter) put('kicker', text(chapter))
  else if (slide.scene_role === 'hero' && furniture.occasion)
    put('kicker', text(furniture.occasion))
  if (furniture.brand) put('brand', text(furniture.brand))
  if (furniture.occasion) put('meta', text(furniture.occasion))
  const index = story.slides.findIndex((s) => s.id === slide.id)
  if (index !== -1) {
    const pad = (n: number) => String(n).padStart(2, '0')
    put('page', text(`${pad(index + 1)} / ${pad(story.slides.length)}`))
  }
  put('subtitle', text(slide.message))
  put('body', text(slide.message))
  put('caption', text(slide.message))
  put('cta', text(ev[0] ?? slide.message))
  if (ev.length > 0) put('evidence', { type: 'list', items: ev })
  ev.forEach((item, i) => {
    put(`card-${i + 1}`, metricOrText(item))
  })
  if ('left-title' in layout.slots) {
    const left = splitSide(ev[0])
    const right = splitSide(ev[1])
    if (left.title) put('left-title', text(left.title))
    if (left.items.length) put('left-items', { type: 'list', items: left.items })
    if (right.title) put('right-title', text(right.title))
    if (right.items.length) put('right-items', { type: 'list', items: right.items })
  }
  put('photo', { type: 'image', src: IMAGE_PLACEHOLDER, alt: 'placeholder image, to be replaced' })
  return out
}

export interface ScaffoldInput {
  story: Story
  storyText: string
  /** path of story.md relative to the deck.json that will be written */
  storyRelativePath: string
  deckId: string
  theme: string
  layouts: Map<string, LayoutJson>
  /**
   * element id → data-role per layout id (from the layout html): the details suggestion fires
   * only for a layout that has a boxed role to expand; absent means every layout counts
   */
  roles?: Map<string, Map<string, string>>
  /** explicit layout per slide id; others use autoLayout */
  choices?: Record<string, string>
  existing?: Deck
  /** regenerate only these slide ids (others copied from existing) */
  only?: string[]
  /** agent-authored slides that replace the generated ones, by id */
  replacements?: Record<string, Slide>
}

export interface ScaffoldResult extends MergeReport {
  warnings: string[]
  chosen: Record<string, string>
  /** "s4/card-2=2": reveal steps carried over from the previous version of a regenerated slide */
  stepsKept: string[]
  /** "s4/foo=1": steps whose element does not exist in the regenerated slide's layout */
  stepsDropped: string[]
  /** "s2/card-1=1": steps the scaffold assigned itself on slides new to the deck */
  stepsAuto: string[]
  /** slides whose story text exceeds the layout's density: the scaffold suggests `details` rather than a split */
  detailsSuggested: string[]
}

/** Characters the story puts on the slide, the way QA will count them (markup stripped). */
export function slotChars(slots: Record<string, Slot>): number {
  let n = 0
  for (const slot of Object.values(slots)) {
    if (slot.type === 'image' || slot.type === 'icon') continue
    n += slotText(slot).replace(/[*\n]/g, '').length
  }
  return n
}

/**
 * Default reveal order for a slide that is new to the deck: cards, process steps and KPI
 * stats one by one; the two sides of a comparison or before/after one after the other; a
 * statement's evidence and a closing's call to action after the claim. Hero pages (cover,
 * hero, section, quote) stay still. The editor can change every step afterwards and a
 * regenerated slide keeps what the editor set.
 */
export function autoSteps(
  layoutId: string,
  elements: ReadonlyArray<{ id: string }>,
): Map<string, number> {
  const steps = new Map<string, number>()
  if (/^(cover|hero|section|quote)/.test(layoutId)) return steps
  for (const { id } of elements) {
    const numbered = /^(card|step|stat|icon|node|side)-(\d+)$/.exec(id)
    const arrow = /^arrow-(\d+)$/.exec(id)
    if (numbered) steps.set(id, Number(numbered[2]))
    else if (arrow) steps.set(id, Number(arrow[1]) + 1)
    else if (/^(left|before)/.test(id)) steps.set(id, 1)
    else if (/^(right|after|link|badge)/.test(id) || id === 'arrow') steps.set(id, 2)
    else if (id === 'evidence' || id === 'cta') steps.set(id, 1)
  }
  return steps
}

export function scaffoldDeck(input: ScaffoldInput): ScaffoldResult {
  const warnings: string[] = []
  const chosen: Record<string, string> = {}
  const stepsKept: string[] = []
  const stepsDropped: string[] = []
  const stepsAuto: string[] = []
  const detailsSuggested: string[] = []
  const existingById = new Map((input.existing?.slides ?? []).map((s) => [s.id, s]))
  const only = input.only ? new Set(input.only) : null
  if (only) {
    const known = new Set(input.story.slides.map((s) => s.id))
    const unknown = [...only].filter((id) => !known.has(id))
    if (unknown.length > 0) {
      throw new Error(
        `the story has no slide \`${unknown.join('`, `')}\`; available ids: ${[...known].join(', ')}`,
      )
    }
  }

  const furniture = furnitureDefaults(input.story)
  const emptyMeta: string[] = []
  const emptyBrand: string[] = []

  const slides: Slide[] = input.story.slides.map((s) => {
    const replacement = input.replacements?.[s.id]
    if (replacement) {
      chosen[s.id] = replacement.layout
      return replacement
    }
    const keep = only && !only.has(s.id) ? existingById.get(s.id) : undefined
    if (keep) {
      chosen[s.id] = keep.layout
      return keep
    }
    const layoutId = input.choices?.[s.id] ?? autoLayout(s)
    const layout = input.layouts.get(layoutId)
    if (!layout)
      throw new Error(`layout \`${layoutId}\` chosen for slide \`${s.id}\` does not exist`)
    chosen[s.id] = layoutId
    const slots = slotsFor(s, layout, input.story)
    for (const [slotId, decl] of Object.entries(layout.slots)) {
      if (decl.required && !(slotId in slots)) {
        warnings.push(
          `slide \`${s.id}\` (${layoutId}): required slot \`${slotId}\` cannot be filled from the story, fill it in`,
        )
      }
    }
    if ('photo' in slots)
      warnings.push(
        `slide \`${s.id}\` (${layoutId}): photo is a placeholder, replace it with a real image`,
      )
    // too much evidence for the layout: suggest details (content behind a click) before splitting
    // the page — a suggestion only, the slots are left as the story wrote them
    const chars = slotChars(slots)
    if (chars > layout.density.max_chars) {
      const roles = input.roles?.get(layoutId)
      const over = `slide \`${s.id}\` (${layoutId}): about ${chars} characters filled from the story, over the layout's limit of ${layout.density.max_chars}`
      // only a boxed role can expand, so the advice depends on what the layout offers
      const canExpand =
        !roles || Object.keys(layout.slots).some((id) => DETAILS_ROLES.has(roles.get(id) ?? ''))
      if (canExpand) {
        detailsSuggested.push(s.id)
        warnings.push(
          `${over}: consider moving the detail into the cards' details first (expanded by a click during playback, QA measures only the collapsed state), and split the slide in the story if that is not enough`,
        )
      } else {
        warnings.push(
          `${over}; this layout has no expandable cards, split the slide in the story or switch to a layout with cards`,
        )
      }
    }
    if ('meta' in layout.slots && !furniture.occasion) emptyMeta.push(s.id)
    if ('brand' in layout.slots && !furniture.brand) emptyBrand.push(s.id)
    // reveal steps and entrances live in slides[].elements (set in the editor, not an override):
    // a regenerated slide keeps them on same-id elements, like deck:retheme does, and reports the
    // steps whose element is gone; a slide that is new to the deck gets the layout's default order
    const previous = existingById.get(s.id)
    const prior = new Map((previous?.elements ?? []).map((e) => [e.id, e]))
    const auto = previous ? new Map<string, number>() : autoSteps(layoutId, layout.elements)
    const elements = layout.elements.map((e) => {
      const p = prior.get(e.id)
      const out: Element = { id: e.id, kind: e.kind }
      if (p?.step !== undefined) {
        out.step = p.step
        stepsKept.push(`${s.id}/${e.id}=${p.step}`)
      } else if (auto.has(e.id)) {
        out.step = auto.get(e.id) as number
        stepsAuto.push(`${s.id}/${e.id}=${out.step}`)
      }
      if (p?.enter !== undefined) out.enter = p.enter
      return out
    })
    const newIds = new Set(layout.elements.map((e) => e.id))
    for (const [id, p] of prior)
      if (p.step !== undefined && !newIds.has(id)) stepsDropped.push(`${s.id}/${id}=${p.step}`)
    const slide: Slide = {
      id: s.id,
      layout: layoutId,
      slots,
      elements,
    }
    if (s.notes) slide.notes = s.notes
    return slide
  })

  if (emptyMeta.length > 0) {
    warnings.push(
      `the first clause of occasion "${firstClause(input.story.meta.occasion)}" is over ${FURNITURE_MAX_UNITS} characters, so meta is left empty on ${emptyMeta.join(', ')}: shorten the first clause of occasion, or put a four-to-ten-character occasion in deck.json`,
    )
  }
  if (emptyBrand.length > 0) {
    warnings.push(
      `the series name of title "${seriesName(input.story.meta.title)}" is over ${BRAND_MAX_UNITS} characters, so brand is left empty on ${emptyBrand.join(', ')}: write the title as "series name: subtitle", or put a short series name in deck.json`,
    )
  }

  const base: Deck = input.existing ?? {
    schemaVersion: 1,
    id: input.deckId,
    title: input.story.meta.title,
    theme: input.theme,
    canvas: { width: 1920, height: 1080 },
    // no transition here: the theme's motion.transition applies until the editor picks one
    slides: [],
    overrides: {},
  }
  const merged = mergeSlides(base, slides)
  merged.deck.title = input.story.meta.title
  merged.deck.theme = input.theme
  merged.deck.story = { path: input.storyRelativePath, sha256: sha256(input.storyText) }
  return { ...merged, warnings, chosen, stepsKept, stepsDropped, stepsAuto, detailsSuggested }
}

export function deckIdFromStoryPath(storyFile: string): string {
  const dir = basename(dirname(storyFile))
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(dir) ? dir : 'deck'
}
