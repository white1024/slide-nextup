import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Ajv, type ErrorObject } from 'ajv'
import { type Pages, prunePages } from './pages.js'

export const CANVAS = { width: 1920, height: 1080 } as const

export type ElementKind = 'text' | 'image' | 'shape'

export interface Element {
  id: string
  kind: ElementKind
  /** reveal on the n-th "next" press (1-based); absent = visible from the start */
  step?: number
  /** how it enters when its step is reached; absent = the theme default for its role */
  enter?: Enter
}

/**
 * page transition families, each an exit on the page being left and an entrance on the new one
 * (140–280ms, at most 12px of travel, opacity always part of it): rise (6px up, the house default),
 * settle (12px up with a touch of blur, for covers), dissolve (opacity only), breath (a full exit, a
 * beat, then the entrance; for section breaks), fade (a plain crossfade over the old page), push
 * (both pages move 12px sideways, mirrored going back), lift (8px up at 0.99), none (a cut).
 * `slide-left` is the pre-T-0036 name and plays as push; absent means the theme's
 * motion.transition, else fade.
 */
export type TransitionFamily =
  | 'none'
  | 'fade'
  | 'rise'
  | 'settle'
  | 'dissolve'
  | 'breath'
  | 'push'
  | 'lift'
export type Transition = TransitionFamily | 'slide-left'
export const TRANSITION_FAMILIES: readonly TransitionFamily[] = [
  'none',
  'fade',
  'rise',
  'settle',
  'dissolve',
  'breath',
  'push',
  'lift',
]
export const TRANSITIONS: readonly Transition[] = [...TRANSITION_FAMILIES, 'slide-left']
/** The family the player uses for a transition value (the legacy alias folded in). */
export function transitionFamily(value: Transition): TransitionFamily {
  return value === 'slide-left' ? 'push' : value
}

/** the deck-wide switch for element motion (reveal steps and entrances); page transitions are separate */
export type Motion = 'on' | 'off'

/**
 * entrance of a step element when its step is reached; the theme supplies a default per role.
 * Each one is a keyframe run that ends on the element's resting state: pop overshoots, blur
 * sharpens while rising, cascade plays fade-up on the element's items 50ms apart. The last three
 * play from the data: grow and draw run a chart's bars, rings and lines out to their real values
 * (either name works for every chart kind), count runs a number up to its real value.
 */
export type Enter =
  | 'fade-up'
  | 'fade'
  | 'scale-in'
  | 'slide-left'
  | 'slide-right'
  | 'wipe'
  | 'pop'
  | 'blur'
  | 'cascade'
  | 'grow'
  | 'draw'
  | 'count'
export const ENTERS: readonly Enter[] = [
  'fade-up',
  'fade',
  'scale-in',
  'slide-left',
  'slide-right',
  'wipe',
  'pop',
  'blur',
  'cascade',
  'grow',
  'draw',
  'count',
]

/** the motion personality of a theme: the pace and curve its entrances default to, and the band they must stay in */
export type MotionFamily = 'crisp' | 'soft' | 'minimal'
export const MOTION_FAMILIES: readonly MotionFamily[] = ['crisp', 'soft', 'minimal']

export type ChartKind = 'bar' | 'line' | 'donut' | 'progress'

export interface ChartPoint {
  label: string
  value: number
}

/** A clickable region on an image (percent of the image box) that jumps to another slide. */
export interface Hotspot {
  target: string
  x: number
  y: number
  w: number
  h: number
  label?: string
}

export interface TabPanel {
  label: string
  content: Slot
}

export type Slot =
  /** `details`: more content behind a click while playing (collapsed by default; QA measures the collapsed state) */
  | { type: 'text'; value: string; details?: Slot }
  | { type: 'list'; items: string[]; details?: Slot }
  | { type: 'image'; src: string; alt?: string; hotspots?: Hotspot[] }
  | { type: 'metric'; value: string; label: string; delta?: string; details?: Slot }
  /** `toggle`: a clickable legend that hides items and rescales the rest */
  | {
      type: 'chart'
      kind: ChartKind
      series: ChartPoint[]
      unit?: string
      max?: number
      toggle?: boolean
    }
  | { type: 'table'; header?: string[]; rows: string[][] }
  | { type: 'code'; value: string; lang?: string }
  | { type: 'icon'; name: string }
  /** several panels in one box; the first is shown until a tab is clicked */
  | { type: 'tabs'; panels: TabPanel[] }

/** Slot types that may carry `details`. */
export const DETAILS_TYPES: ReadonlySet<Slot['type']> = new Set(['text', 'list', 'metric'])

export interface Slide {
  id: string
  layout: string
  /**
   * this page's own transition, played when it comes in (going back into it too); absent = the
   * deck's. The scaffold writes breath on a pause page and settle on a hero page after the first
   */
  transition?: Transition
  slots: Record<string, Slot>
  elements: Element[]
  notes?: string
}

export interface OverrideStyle {
  color?: string
  background?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'left' | 'center' | 'right'
  fontStyle?: 'italic' | 'normal'
  textDecoration?: 'underline' | 'line-through' | 'none'
  opacity?: number
  borderRadius?: number
}

export interface Override {
  x?: number
  y?: number
  w?: number
  h?: number
  rotation?: number
  z?: number
  hidden?: boolean
  text?: string
  src?: string
  /** text form of the details slot (text elements); '' removes the details */
  details?: string
  /** replaces the image's hotspots (image elements); [] removes them */
  hotspots?: Hotspot[]
  style?: OverrideStyle
}

export interface StoryRef {
  path: string
  sha256: string
}

export interface Deck {
  schemaVersion: 1
  id: string
  title: string
  theme: string
  canvas: { width: 1920; height: 1080 }
  transition?: Transition
  /** "off": every step element shows at once and nothing enters; absent means on */
  motion?: Motion
  /** BCP 47 tag of the content (en, zh-Hant…); absent means detected from the text when rendering */
  lang?: string
  story?: StoryRef
  slides: Slide[]
  overrides: Record<string, Override>
  /** playback order and hidden slides, written by the editor; story.md stays the narrative source */
  pages?: Pages
}

export interface DeckError {
  /** JSON pointer into the document, e.g. `/slides/2/id`. */
  path: string
  message: string
}

export type ValidateResult = { ok: true; deck: Deck } | { ok: false; errors: DeckError[] }

const schemaUrl = new URL('../../schemas/deck.schema.json', import.meta.url)
const schema = JSON.parse(readFileSync(schemaUrl, 'utf8')) as Record<string, unknown>
const ajv = new Ajv({ allErrors: true, strict: true })
const validateShape = ajv.compile(schema)

function describeAjvError(e: ErrorObject): DeckError {
  const path = (e.instancePath || '/').replace(/~1/g, '/').replace(/~0/g, '~')
  switch (e.keyword) {
    case 'required':
      return {
        path,
        message: `missing required field \`${(e.params as { missingProperty: string }).missingProperty}\``,
      }
    case 'additionalProperties':
      return {
        path,
        message: `field \`${(e.params as { additionalProperty: string }).additionalProperty}\` is not allowed`,
      }
    case 'enum':
      return {
        path,
        message: `value must be ${(e.params as { allowedValues: unknown[] }).allowedValues.map((v) => JSON.stringify(v)).join(' | ')}`,
      }
    case 'const':
      return {
        path,
        message: `value must be ${JSON.stringify((e.params as { allowedValue: unknown }).allowedValue)}`,
      }
    case 'pattern':
      return {
        path,
        message: `does not match the pattern (${(e.params as { pattern: string }).pattern})`,
      }
    case 'propertyNames':
      return {
        path,
        message: `key \`${(e.params as { propertyName: string }).propertyName}\` does not match the pattern`,
      }
    case 'oneOf':
      return {
        path,
        message:
          'a slot must be one of text | list | image | metric | chart | table | code | icon | tabs, with all of its fields',
      }
    default:
      return { path, message: e.message ?? e.keyword }
  }
}

/** Cross-reference rules the JSON Schema cannot express. */
function crossCheck(deck: Deck): DeckError[] {
  const errors: DeckError[] = []
  const slideIndex = new Map<string, number>()
  const elementsBySlide = new Map<string, Map<string, ElementKind>>()

  deck.slides.forEach((slide, i) => {
    if (slideIndex.has(slide.id)) {
      errors.push({
        path: `/slides/${i}/id`,
        message: `duplicate slide id \`${slide.id}\` (first at /slides/${slideIndex.get(slide.id)})`,
      })
    } else {
      slideIndex.set(slide.id, i)
    }

    const elements = new Map<string, ElementKind>()
    slide.elements.forEach((el, j) => {
      if (elements.has(el.id)) {
        errors.push({
          path: `/slides/${i}/elements/${j}/id`,
          message: `duplicate element id \`${el.id}\` in slide \`${slide.id}\``,
        })
      } else {
        elements.set(el.id, el.kind)
      }
    })
    elementsBySlide.set(slide.id, elements)

    for (const slotId of Object.keys(slide.slots)) {
      if (!elements.has(slotId)) {
        errors.push({
          path: `/slides/${i}/slots/${slotId}`,
          message: `slot \`${slotId}\` of slide \`${slide.id}\` is not in elements; every slot must have an element of the same id`,
        })
      }
    }
  })

  // hotspots jump to slides: every target must exist (checked after all ids are known)
  const known = new Set(deck.slides.map((s) => s.id))
  const checkHotspots = (list: Hotspot[] | undefined, path: string) => {
    list?.forEach((h, j) => {
      if (!known.has(h.target))
        errors.push({
          path: `${path}/${j}/target`,
          message: `hotspot points to non-existent slide \`${h.target}\``,
        })
    })
  }
  deck.slides.forEach((slide, i) => {
    for (const [slotId, slot] of Object.entries(slide.slots)) {
      if (slot.type === 'image')
        checkHotspots(slot.hotspots, `/slides/${i}/slots/${slotId}/hotspots`)
    }
  })

  for (const [key, override] of Object.entries(deck.overrides)) {
    const [slideId, elementId] = key.split('/') as [string, string]
    const elements = elementsBySlide.get(slideId)
    if (!elements) {
      errors.push({
        path: `/overrides/${key}`,
        message: `override points to non-existent slide \`${slideId}\``,
      })
      continue
    }
    const kind = elements.get(elementId)
    if (!kind) {
      errors.push({
        path: `/overrides/${key}`,
        message: `override points to non-existent element \`${elementId}\` in slide \`${slideId}\``,
      })
      continue
    }
    if (override.text !== undefined && kind !== 'text') {
      errors.push({
        path: `/overrides/${key}/text`,
        message: `a \`text\` override can only apply to an element of kind text, \`${elementId}\` is ${kind}`,
      })
    }
    if (override.src !== undefined && kind !== 'image') {
      errors.push({
        path: `/overrides/${key}/src`,
        message: `a \`src\` override can only apply to an element of kind image, \`${elementId}\` is ${kind}`,
      })
    }
    if (override.details !== undefined && kind !== 'text') {
      errors.push({
        path: `/overrides/${key}/details`,
        message: `a \`details\` override can only apply to an element of kind text, \`${elementId}\` is ${kind}`,
      })
    }
    if (override.hotspots !== undefined) {
      if (kind !== 'image') {
        errors.push({
          path: `/overrides/${key}/hotspots`,
          message: `a \`hotspots\` override can only apply to an element of kind image, \`${elementId}\` is ${kind}`,
        })
      } else checkHotspots(override.hotspots, `/overrides/${key}/hotspots`)
    }
  }

  if (deck.pages) {
    const known = new Set(deck.slides.map((s) => s.id))
    const lists: Array<[string, string[] | undefined]> = [
      ['order', deck.pages.order],
      ['hidden', deck.pages.hidden],
    ]
    for (const [field, list] of lists) {
      list?.forEach((id, i) => {
        if (!known.has(id))
          errors.push({
            path: `/pages/${field}/${i}`,
            message: `page arrangement points to non-existent slide \`${id}\``,
          })
      })
    }
  }

  return errors
}

export function validateDeck(input: unknown): ValidateResult {
  if (!validateShape(input)) {
    const errors = (validateShape.errors ?? []).map(describeAjvError)
    return { ok: false, errors: dedupe(errors) }
  }
  const deck = input as Deck
  const errors = crossCheck(deck)
  return errors.length === 0 ? { ok: true, deck } : { ok: false, errors }
}

function dedupe(errors: DeckError[]): DeckError[] {
  const seen = new Set<string>()
  return errors.filter((e) => {
    const k = `${e.path}\u0000${e.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function parseDeck(text: string): ValidateResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    return {
      ok: false,
      errors: [{ path: '/', message: `not valid JSON: ${(err as Error).message}` }],
    }
  }
  return validateDeck(json)
}

// ---- deterministic serialisation -------------------------------------------

const OVERRIDE_KEYS: Array<keyof Override> = [
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'z',
  'hidden',
  'text',
  'src',
  'details',
  'hotspots',
  'style',
]
const STYLE_KEYS: Array<keyof OverrideStyle> = [
  'color',
  'background',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'fontStyle',
  'textDecoration',
  'opacity',
  'borderRadius',
]

function pick<T extends object>(obj: T, keys: Array<keyof T>): T {
  const out: Partial<T> = {}
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k]
  return out as T
}

function normaliseHotspot(h: Hotspot): Hotspot {
  const out: Hotspot = { target: h.target, x: h.x, y: h.y, w: h.w, h: h.h }
  if (h.label !== undefined) out.label = h.label
  return out
}

function normaliseSlot(slot: Slot): Slot {
  switch (slot.type) {
    case 'text': {
      const out: Slot = { type: 'text', value: slot.value }
      if (slot.details) out.details = normaliseSlot(slot.details)
      return out
    }
    case 'list': {
      const out: Slot = { type: 'list', items: [...slot.items] }
      if (slot.details) out.details = normaliseSlot(slot.details)
      return out
    }
    case 'image': {
      const out: Slot = { type: 'image', src: slot.src }
      if (slot.alt !== undefined) out.alt = slot.alt
      if (slot.hotspots) out.hotspots = slot.hotspots.map(normaliseHotspot)
      return out
    }
    case 'metric': {
      const out: Slot = { type: 'metric', value: slot.value, label: slot.label }
      if (slot.delta !== undefined) out.delta = slot.delta
      if (slot.details) out.details = normaliseSlot(slot.details)
      return out
    }
    case 'chart': {
      const out: Slot = {
        type: 'chart',
        kind: slot.kind,
        series: slot.series.map((p) => ({ label: p.label, value: p.value })),
      }
      if (slot.unit !== undefined) out.unit = slot.unit
      if (slot.max !== undefined) out.max = slot.max
      if (slot.toggle !== undefined) out.toggle = slot.toggle
      return out
    }
    case 'tabs':
      return {
        type: 'tabs',
        panels: slot.panels.map((p) => ({ label: p.label, content: normaliseSlot(p.content) })),
      }
    case 'table': {
      const out: Slot = { type: 'table', rows: slot.rows.map((r) => [...r]) }
      if (slot.header !== undefined) out.header = [...slot.header]
      return out
    }
    case 'code':
      return slot.lang === undefined
        ? { type: 'code', value: slot.value }
        : { type: 'code', value: slot.value, lang: slot.lang }
    case 'icon':
      return { type: 'icon', name: slot.name }
  }
}

function normaliseOverride(o: Override): Override {
  const out = pick(o, OVERRIDE_KEYS)
  if (out.style) out.style = pick(out.style, STYLE_KEYS)
  if (out.hotspots) out.hotspots = out.hotspots.map(normaliseHotspot)
  return out
}

/**
 * Rebuild the deck with a canonical key order: slides and slots keep their
 * order (they are authored sequences); override keys are sorted so the
 * editor's write order never changes the file.
 */
export function normaliseDeck(deck: Deck): Deck {
  const slides = deck.slides.map((s) => {
    const slots: Record<string, Slot> = {}
    for (const [k, v] of Object.entries(s.slots)) slots[k] = normaliseSlot(v)
    const slide: Slide = {
      id: s.id,
      layout: s.layout,
      ...(s.transition !== undefined ? { transition: s.transition } : {}),
      slots,
      elements: s.elements.map((e) => {
        const out: Element = { id: e.id, kind: e.kind }
        if (e.step !== undefined) out.step = e.step
        if (e.enter !== undefined) out.enter = e.enter
        return out
      }),
    }
    if (s.notes !== undefined) slide.notes = s.notes
    return slide
  })
  const overrides: Record<string, Override> = {}
  for (const key of Object.keys(deck.overrides).sort()) {
    overrides[key] = normaliseOverride(deck.overrides[key] as Override)
  }
  const pages = normalisePages(deck.pages)
  // fixed key order: schemaVersion, id, title, theme, canvas, transition?, motion?, lang?, story?, slides, overrides, pages?
  const out: Deck = {
    schemaVersion: 1,
    id: deck.id,
    title: deck.title,
    theme: deck.theme,
    canvas: { width: 1920, height: 1080 },
    ...(deck.transition !== undefined ? { transition: deck.transition } : {}),
    ...(deck.motion !== undefined ? { motion: deck.motion } : {}),
    ...(deck.lang !== undefined ? { lang: deck.lang } : {}),
    ...(deck.story ? { story: { path: deck.story.path, sha256: deck.story.sha256 } } : {}),
    slides,
    overrides,
    ...(pages ? { pages } : {}),
  }
  return out
}

function normalisePages(pages: Pages | undefined): Pages | undefined {
  if (!pages) return undefined
  const out: Pages = {}
  if (pages.order && pages.order.length > 0) out.order = [...pages.order]
  if (pages.hidden && pages.hidden.length > 0) out.hidden = [...pages.hidden]
  return Object.keys(out).length > 0 ? out : undefined
}

export function stringifyDeck(deck: Deck): string {
  return `${JSON.stringify(normaliseDeck(deck), null, 2)}\n`
}

// ---- overrides vs generated content ----------------------------------------

export function overrideKey(slideId: string, elementId: string): string {
  return `${slideId}/${elementId}`
}

export interface MergeReport {
  deck: Deck
  /** override keys that still point at an existing element */
  kept: string[]
  /** override keys whose slide still exists but whose element does not (kept in the file, reported) */
  orphaned: string[]
  /** override keys whose slide is gone from the story (removed: nothing could ever re-attach them) */
  overridesDropped: string[]
  /** "order:s9" / "hidden:s9": page-level override entries whose slide is gone (removed, not kept) */
  pagesDropped: string[]
  /** "order": the playback order now equals the story's, so the override was redundant and is gone */
  pagesCleared: string[]
}

/**
 * Replace generated slides while keeping every manual override. Overrides
 * whose element disappeared (a layout change) are reported, not deleted: that
 * decision belongs to the user (see T-0005 regenerate --reset-overrides).
 * Overrides whose whole slide left the story go away, like page entries do:
 * kept, they would only make the deck fail validation with no way back.
 */
export function mergeSlides(deck: Deck, slides: Slide[]): MergeReport {
  const next: Deck = { ...deck, slides, overrides: { ...deck.overrides } }
  // page-level overrides reference slides by id: entries for slides the story dropped go away
  const ids = slides.map((s) => s.id)
  const pruned = prunePages(deck.pages, ids)
  const pagesCleared: string[] = []
  // an order that lists the story's pages in the story's own sequence says nothing: after
  // story:apply-deck wrote the order back (and the user confirmed), this is what clears it.
  // A partial list is left alone (the editor always writes the whole order).
  let pages = pruned.pages
  const order = pages?.order
  if (pages && order && order.length === ids.length && order.every((id, i) => id === ids[i])) {
    const { order: _redundant, ...rest } = pages
    pagesCleared.push('order')
    pages = Object.keys(rest).length > 0 ? rest : undefined
  }
  if (pages) next.pages = pages
  else delete next.pages
  const elements = new Map<string, Set<string>>()
  for (const s of slides) elements.set(s.id, new Set(s.elements.map((e) => e.id)))
  const kept: string[] = []
  const orphaned: string[] = []
  const overridesDropped: string[] = []
  for (const key of Object.keys(next.overrides).sort()) {
    const [slideId, elementId] = key.split('/') as [string, string]
    const slide = elements.get(slideId)
    if (!slide) {
      delete next.overrides[key]
      overridesDropped.push(key)
    } else if (slide.has(elementId)) kept.push(key)
    else orphaned.push(key)
  }
  return {
    deck: next,
    kept,
    orphaned,
    overridesDropped,
    pagesDropped: pruned.dropped,
    pagesCleared,
  }
}

/** Replace one slide by id; a new id appends at the end. */
export function replaceSlide(deck: Deck, slide: Slide): MergeReport {
  const idx = deck.slides.findIndex((s) => s.id === slide.id)
  const slides =
    idx === -1 ? [...deck.slides, slide] : deck.slides.map((s, i) => (i === idx ? slide : s))
  return mergeSlides(deck, slides)
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
