import { type LayoutJson, loadLayout, PROJECT_ROOT } from '../render/assets.ts'
import type { Deck, Element, Override, Slide, Slot } from './deck.ts'

export interface RethemeOptions {
  root?: string
  /** drop x / y / w / h / rotation from the overrides that survive, because the new pack's geometry differs */
  resetPositions?: boolean
}

export interface RethemeReport {
  theme: string
  /** slide id → where its layout came from under the new theme */
  layoutSource: Record<string, 'pack' | 'global'>
  /** `slideId/slotId` content the new layout has no slot for (or accepts a different type); dropped */
  droppedSlots: string[]
  /** `slideId/slotId` required slots the new layout wants but the slide did not have; filled with empty text */
  filledRequired: string[]
  keptOverrides: string[]
  orphanedOverrides: string[]
  /** overrides whose position fields were removed (only with resetPositions) */
  resetPositions: string[]
}

function accepts(layout: LayoutJson, slotId: string, slot: Slot): boolean {
  const decl = layout.slots[slotId]
  if (!decl) return false
  return (Array.isArray(decl.type) ? decl.type : [decl.type]).includes(slot.type)
}

/**
 * Switch a deck to another theme without regenerating it from the story: every
 * slide keeps its layout id (resolved again under the new theme, pack layout
 * first), keeps the slots the new layout accepts, rebuilds its element list from
 * the new layout and keeps the overrides whose element still exists. Wording the
 * agent refined survives; only what the new pack cannot hold is dropped, and the
 * report says exactly what.
 */
export function rethemeDeck(
  deck: Deck,
  theme: string,
  opts: RethemeOptions = {},
): { deck: Deck; report: RethemeReport } {
  const root = opts.root ?? PROJECT_ROOT
  const report: RethemeReport = {
    theme,
    layoutSource: {},
    droppedSlots: [],
    filledRequired: [],
    keptOverrides: [],
    orphanedOverrides: [],
    resetPositions: [],
  }

  const slides: Slide[] = deck.slides.map((slide) => {
    const layout = loadLayout(slide.layout, theme, root)
    report.layoutSource[slide.id] = layout.dir.includes(`themes`) ? 'pack' : 'global'
    const prior = new Map(slide.elements.map((e) => [e.id, e]))
    const elements = layout.json.elements.map((e) => {
      const p = prior.get(e.id)
      const out: Element = { id: e.id, kind: e.kind }
      if (p?.step !== undefined) out.step = p.step
      if (p?.enter !== undefined) out.enter = p.enter
      return out
    })
    const slots: Record<string, Slot> = {}
    for (const [slotId, slot] of Object.entries(slide.slots)) {
      if (accepts(layout.json, slotId, slot)) slots[slotId] = slot
      else report.droppedSlots.push(`${slide.id}/${slotId}`)
    }
    for (const [slotId, decl] of Object.entries(layout.json.slots)) {
      if (decl.required && !(slotId in slots)) {
        const kinds = Array.isArray(decl.type) ? decl.type : [decl.type]
        if (kinds.includes('text')) {
          slots[slotId] = { type: 'text', value: '' }
          report.filledRequired.push(`${slide.id}/${slotId}`)
        } else if (kinds.includes('list')) {
          slots[slotId] = { type: 'list', items: [] }
          report.filledRequired.push(`${slide.id}/${slotId}`)
        } else {
          report.droppedSlots.push(`${slide.id}/${slotId}（必要，型別 ${kinds.join('|')}，請補上）`)
        }
      }
    }
    const next: Slide = { id: slide.id, layout: slide.layout, slots, elements }
    if (slide.notes) next.notes = slide.notes
    return next
  })

  const kinds = new Map(slides.map((s) => [s.id, new Map(s.elements.map((e) => [e.id, e.kind]))]))
  const overrides: Record<string, Override> = {}
  for (const key of Object.keys(deck.overrides).sort()) {
    const [slideId, elementId] = key.split('/') as [string, string]
    const kind = kinds.get(slideId)?.get(elementId)
    const o = deck.overrides[key] as Override
    const compatible =
      kind !== undefined &&
      !(o.text !== undefined && kind !== 'text') &&
      !(o.src !== undefined && kind !== 'image')
    if (!compatible) {
      report.orphanedOverrides.push(key)
      continue
    }
    let kept: Override = { ...o }
    if (opts.resetPositions) {
      const { x: _x, y: _y, w: _w, h: _h, rotation: _r, ...rest } = kept
      if (Object.keys(rest).length !== Object.keys(kept).length) report.resetPositions.push(key)
      kept = rest
    }
    if (Object.keys(kept).length > 0) {
      overrides[key] = kept
      report.keptOverrides.push(key)
    }
  }

  return { deck: { ...deck, theme, slides, overrides }, report }
}
