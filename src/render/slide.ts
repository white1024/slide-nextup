import type { Override, Slot } from '../model/deck.ts'
import type { Layout } from './assets.ts'
import {
  applyTextOverride,
  chartSvg,
  countValue,
  effectiveSlot,
  escapeHtml,
  inlineMarkup,
  renderSlot,
  slotText,
} from './slot-render.js'

export {
  applyTextOverride,
  chartSvg,
  countValue,
  effectiveSlot,
  escapeHtml,
  inlineMarkup,
  renderSlot,
  slotText,
}

/**
 * Renderer-owned base CSS: the stage box model that layouts and themes both rely
 * on, plus the structural defaults of the composite slots (chart, table, code,
 * icon). Themes override the colours through the same class names.
 */
export const BASE_CSS = `*, *::before, *::after { box-sizing: border-box; }
.slide { position: relative; width: 1920px; height: 1080px; overflow: hidden; margin: 0; }
.slide [data-el] { position: absolute; margin: 0; overflow: hidden; }
.slide h1, .slide h2, .slide p { margin: 0; }
.slide ul { list-style: none; margin: 0; padding: 0; }
.slide li { margin: 0; }
.slide img { display: block; width: 100%; height: 100%; object-fit: cover; }
.slide .metric { display: flex; flex-direction: column; justify-content: center; height: 100%; }
.slide [data-hidden="true"] { visibility: hidden; }
.slide svg.chart { display: block; width: 100%; height: 100%; }
.slide .chart text { font-family: inherit; }
.chart-track { fill: var(--color-line); }
.chart-fill { fill: var(--color-accent); }
.chart-line { fill: none; stroke: var(--color-accent); stroke-width: 6; stroke-linejoin: round; stroke-linecap: round; }
.chart-area { fill: var(--color-accent); opacity: 0.12; }
.chart-dot { fill: var(--color-accent); }
.chart-grid { stroke: var(--color-line); stroke-width: 2; }
.chart-label { fill: currentColor; opacity: 0.75; }
.chart-value { fill: currentColor; font-weight: 700; }
.chart-ring-track { fill: none; stroke: var(--color-line); stroke-width: 44; }
.chart-ring-fill { fill: none; stroke: var(--color-accent); stroke-width: 44; }
.chart-center { fill: currentColor; font-weight: 800; }
.chart .chart-hit { fill: transparent; }
.chart .chart-row, .chart .chart-point, .chart .chart-ring-fill { transition: opacity 0.18s ease; }
.chart.has-hover .chart-row:not(.is-hover), .chart.has-hover .chart-point:not(.is-hover), .chart.has-hover .chart-ring-fill:not(.is-hover) { opacity: 0.4; }
.chart-tip rect { fill: var(--color-ink, #111); }
.chart-tip text { fill: var(--color-paper, #fff); font-size: 28px; font-weight: 600; }
.slide a { color: inherit; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 0.18em; }
.slide table.table { border-collapse: collapse; width: 100%; }
.slide .table th, .slide .table td { text-align: left; vertical-align: top; padding: 0.35em 0.6em; }
.slide .table th { font-weight: 700; }
.slide pre.code { margin: 0; white-space: pre; tab-size: 2; font-family: 'Cascadia Code', 'JetBrains Mono', 'Consolas', 'Noto Sans Mono CJK TC', monospace; }
.slide svg.icon { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icon-sprite { position: absolute; width: 0; height: 0; overflow: hidden; }
/* interactive slots (behaviour in runtime.ts): the default state is what static mode, QA and the editor show */
.slide .tabs { display: flex; flex-wrap: wrap; gap: 0 0.25em; margin: 0; border-bottom: 1px solid var(--color-line); }
.slide .tab { flex: none; margin: 0; padding: 0.35em 0.8em; border: 0; border-bottom: 3px solid transparent; background: none; color: inherit; font: inherit; font-size: 0.875em; line-height: 1.3; opacity: 0.6; }
.slide .tab.is-active { opacity: 1; border-bottom-color: var(--color-accent); }
.slide .tab-panel { padding-top: 0.6em; }
.slide [data-el] > .hotspot { position: absolute; display: block; border-radius: 8px; outline: 2px dashed transparent; outline-offset: -2px; }
.slide .hotspot[data-label]::after { content: attr(data-label); position: absolute; left: 0; bottom: 100%; margin-bottom: 8px; padding: 6px 14px; border-radius: 8px; background: var(--color-ink, #111); color: var(--color-paper, #fff); font-size: 24px; line-height: 1.3; white-space: nowrap; visibility: hidden; }
html[data-interactive] .slide .hotspot:hover, html[data-interactive] .slide .hotspot:focus-visible { outline-color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 18%, transparent); }
html[data-interactive] .slide .hotspot:hover::after, html[data-interactive] .slide .hotspot:focus-visible::after { visibility: visible; }
html[data-interactive] .slide [data-details] { cursor: pointer; }
html[data-interactive] .slide [data-details]::after { content: '+'; position: absolute; right: 14px; bottom: 14px; width: 40px; height: 40px; border-radius: 50%; background: var(--color-accent); color: var(--color-paper, #fff); font-size: 30px; font-weight: 700; line-height: 40px; text-align: center; }
/* a surface under the panel whatever the role, at role specificity so the theme's own box styling still wins */
.deck-details { background: var(--color-surface, var(--color-paper, #fff)); }
.slide .deck-details { position: absolute; z-index: 60; box-sizing: border-box; overflow: hidden; cursor: pointer; }
/* the source stays in the tree and keeps focus (Enter toggles it) but nothing of it may show through a translucent theme surface */
.slide [data-el][data-details].is-open { opacity: 0; transition: none; }
.slide .deck-details .metric { height: auto; }
.slide .deck-details .details { margin-top: 0.6em; padding-top: 0.6em; border-top: 1px solid var(--color-line); }
.slide .deck-details .details .list li { padding-left: 1.1em; margin-bottom: 0.3em; }
.slide .deck-details .details .table th, .slide .deck-details .details .table td { padding: 0.3em 0.5em; }
html[data-interactive] .slide .tab, html[data-interactive] .chart-key { cursor: pointer; }
.chart-key text { fill: currentColor; }
.chart-swatch { fill: var(--color-accent); }
.chart-key.is-off { opacity: 0.4; }
.chart .chart-row.is-off, .chart .chart-point.is-off { opacity: 0.35; }
html[data-interactive] .slide :is([data-details], .tab, .hotspot):focus-visible, html[data-interactive] .chart-key:focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
`

const STYLE_PROPERTY: Record<string, string> = {
  color: 'color',
  background: 'background',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  textAlign: 'text-align',
  fontStyle: 'font-style',
  textDecoration: 'text-decoration',
  opacity: 'opacity',
  borderRadius: 'border-radius',
}
const PX_PROPERTIES = new Set(['fontSize', 'letterSpacing', 'borderRadius'])

export function overrideToInlineStyle(o: Override): string {
  const parts: string[] = []
  if (o.x !== undefined) parts.push(`left:${o.x}px`)
  if (o.y !== undefined) parts.push(`top:${o.y}px`)
  if (o.w !== undefined) parts.push(`width:${o.w}px`)
  if (o.h !== undefined) parts.push(`height:${o.h}px`)
  if (o.rotation !== undefined) parts.push(`transform:rotate(${o.rotation}deg)`)
  if (o.z !== undefined) parts.push(`z-index:${o.z}`)
  if (o.style) {
    for (const [key, value] of Object.entries(o.style)) {
      if (value === undefined) continue
      const prop = STYLE_PROPERTY[key]
      if (!prop) continue
      parts.push(`${prop}:${PX_PROPERTIES.has(key) ? `${value}px` : String(value)}`)
    }
  }
  return parts.join(';')
}

export interface RenderSlideInput {
  layout: Layout
  slideId: string
  slots: Record<string, Slot>
  overrides?: Record<string, Override>
  /** element id → reveal step (from slide.elements[].step); rendered as data-step */
  steps?: Record<string, number>
  /** element id → entrance (explicit or theme default); rendered as data-enter on step elements */
  enters?: Record<string, string>
  /** 1-based position and total in the playback order; the section carries them as --page-index / --page-count for furniture like progress ticks */
  page?: { index: number; count: number }
  /** this page's own transition family (from slide.transition); rendered as data-transition on the section, which the player reads when the page comes in */
  transition?: string
}

/**
 * Fill a layout's HTML with slot content and apply element overrides as
 * inline attributes. Pure string work: the layout HTML is our own contract
 * (one tag per element, `{{slot}}` placeholders), so no DOM library is needed.
 */
export function renderSlideHtml(input: RenderSlideInput): string {
  const { layout, slideId, slots } = input
  const overrides = input.overrides ?? {}
  const elementKind = new Map(layout.json.elements.map((e) => [e.id, e.kind]))

  let html = layout.html.trim()
  const pageVars = input.page
    ? ` style="--page-index:${Math.trunc(input.page.index)};--page-count:${Math.trunc(input.page.count)}"`
    : ''
  const own = input.transition ? ` data-transition="${escapeHtml(input.transition)}"` : ''
  html = html.replace(
    /<section\b([^>]*)>/,
    (_m, attrs: string) => `<section${attrs} data-slide="${escapeHtml(slideId)}"${own}${pageVars}>`,
  )

  // elements whose content carries details get data-details, so the player knows what opens
  const detailed: string[] = []
  html = html.replace(/\{\{([A-Za-z][A-Za-z0-9_-]*)\}\}/g, (_m, slotId: string) => {
    const kind = elementKind.get(slotId) ?? null
    const slot = effectiveSlot(slots[slotId], overrides[`${slideId}/${slotId}`], kind)
    if (!slot) return ''
    if ('details' in slot && slot.details) detailed.push(slotId)
    return renderSlot(slot)
  })

  for (const [key, override] of Object.entries(overrides)) {
    const [sid, elementId] = key.split('/') as [string, string]
    if (sid !== slideId || !elementKind.has(elementId)) continue
    const style = overrideToInlineStyle(override)
    const extra = `${style ? ` style="${escapeHtml(style)}"` : ''}${override.hidden ? ' data-hidden="true"' : ''}`
    if (!extra) continue
    const re = new RegExp(`(<[a-zA-Z0-9]+\\b[^>]*\\bdata-el="${elementId}")`)
    html = html.replace(re, `$1${extra}`)
  }
  for (const [elementId, step] of Object.entries(input.steps ?? {})) {
    if (!elementKind.has(elementId) || !(step >= 1)) continue
    const re = new RegExp(`(<[a-zA-Z0-9]+\\b[^>]*\\bdata-el="${elementId}")`)
    html = html.replace(re, `$1 data-step="${Math.floor(step)}"`)
  }
  for (const [elementId, enter] of Object.entries(input.enters ?? {})) {
    if (!elementKind.has(elementId) || !enter) continue
    const re = new RegExp(`(<[a-zA-Z0-9]+\\b[^>]*\\bdata-el="${elementId}")`)
    html = html.replace(re, `$1 data-enter="${escapeHtml(enter)}"`)
  }
  for (const elementId of detailed) {
    const re = new RegExp(`(<[a-zA-Z0-9]+\\b[^>]*\\bdata-el="${elementId}")`)
    html = html.replace(re, '$1 data-details="true"')
  }
  return html
}
