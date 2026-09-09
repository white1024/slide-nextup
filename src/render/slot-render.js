/**
 * Slot rendering shared by the Node renderer (src/render/slide.ts) and the
 * browser editor (src/editor/editor.js, where this file is injected as
 * `window.__slotRender`). Plain JavaScript on purpose: no imports, no types,
 * so the same source runs in both places and the two can never drift.
 */

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Inline markup for text slots: `*word*` becomes `<em>word</em>` so a theme can
 * set the emphasised word in another face or colour; `\*` is a literal asterisk.
 * The text is escaped first, so slot content can never inject markup.
 */
export function inlineMarkup(text) {
  const emphasised = escapeHtml(text).replace(/\\\*|\*([^*\n]+?)\*/g, (m, inner) =>
    m === '\\*' ? '*' : `<em>${inner}</em>`,
  )
  // `[文字](https://…)` becomes a link: http(s) and mailto open in a new tab, `#s3` jumps to that
  // slide; any other target stays literal text, and `\[` is a literal bracket
  return emphasised.replace(/\\\[|\[([^\]\n]+?)\]\(([^\s)]+)\)/g, (m, label, href) => {
    if (m === '\\[') return '['
    if (!LINK_TARGET.test(href)) return m
    const external = !href.startsWith('#')
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`
  })
}

const LINK_TARGET = /^(https?:\/\/|mailto:|#)/

function multiline(text) {
  return inlineMarkup(text).replace(/\n/g, '<br>')
}

/** a short prefix, one number (thousands separators and decimals allowed), a short suffix: what a count entrance can run up to */
export const COUNTABLE = /^\s*([^\d\s-]{0,3})\s*(-?\d[\d,]*(?:\.\d+)?)\s*([^\d]{0,12})\s*$/

/** The number a one-line value counts up to (62 for "62 min", 104411 for "104,411", 0.8 for "0.8x"), or null when it is not a number. */
export function countValue(text) {
  const m = COUNTABLE.exec(String(text).replace(/\*/g, ''))
  if (!m) return null
  const n = Number.parseFloat(m[2].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const SEP = /\s*[|｜]\s*/
/** slot types that may carry `details` (the content behind a click while playing) */
const DETAILS_TYPES = new Set(['text', 'list', 'metric'])
/** element roles a theme paints as a box with its own surface: the only ones whose content may expand (the panel copies that look) */
export const DETAILS_ROLES = new Set(['card', 'stat', 'tint', 'alert', 'sunk'])

function num(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}

/** Items still counted after the legend toggles: `off` holds the indices that are switched off. */
function onValues(slot, off) {
  return slot.series.filter((_, i) => !off.has(i)).map((p) => p.value)
}

function chartMax(slot, off) {
  const values = onValues(slot, off)
  if (slot.max !== undefined) return slot.max
  if (slot.kind === 'donut')
    return slot.series.length > 1
      ? Math.max(
          1,
          values.reduce((a, b) => a + b, 0),
        )
      : 100
  if (slot.kind === 'progress') return 100
  return Math.max(1, ...values)
}

function svgOpen(kind, w, h, toggle) {
  return `<svg class="chart chart-${kind}${toggle ? ' chart-toggle' : ''}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin meet" role="img"${toggle ? ' data-toggle="true"' : ''}>`
}

/** What the player's hover tooltip shows for one series entry (label without emphasis marks, value with unit). */
function hoverData(p, slot) {
  return `data-label="${escapeHtml(String(p.label).replace(/\*/g, ''))}" data-text="${escapeHtml(num(p.value) + (slot.unit || ''))}"`
}

const partClass = (base, i, off) => `${base}${off.has(i) ? ' is-off' : ''}`

function barChart(slot, off) {
  const max = chartMax(slot, off)
  const rowH = 96
  const h = slot.series.length * rowH + 16
  const parts = []
  slot.series.forEach((p, i) => {
    const y = 16 + i * rowH
    const w = off.has(i) ? 0 : Math.max(0, Math.min(560, (560 * p.value) / max))
    parts.push(
      `<g class="${partClass('chart-row', i, off)}" data-index="${i}" ${hoverData(p, slot)}>`,
      `<text class="chart-label" x="0" y="${y + 44}" font-size="32" dominant-baseline="middle">${inlineMarkup(p.label)}</text>`,
      `<rect class="chart-track" x="320" y="${y + 24}" width="560" height="40" rx="4"/>`,
      `<rect class="chart-fill" x="320" y="${y + 24}" width="${num(w)}" height="40" rx="4"/>`,
      `<text class="chart-value" x="1000" y="${y + 44}" font-size="32" text-anchor="end" dominant-baseline="middle">${escapeHtml(num(p.value) + (slot.unit || ''))}</text>`,
      '</g>',
    )
  })
  return { w: 1000, h, body: parts.join('') }
}

function lineChart(slot, off) {
  const max = chartMax(slot, off)
  const left = 40
  const right = 960
  const top = 60
  const bottom = 500
  const n = slot.series.length
  const step = n > 1 ? (right - left) / (n - 1) : 0
  const pts = slot.series.map((p, i) => {
    const x = n > 1 ? left + i * step : (left + right) / 2
    const y = bottom - ((bottom - top) * Math.max(0, p.value)) / max
    return { x, y, p, i }
  })
  const parts = []
  for (let g = 0; g <= 4; g++) {
    const y = top + ((bottom - top) * g) / 4
    parts.push(
      `<line class="chart-grid" x1="${left}" y1="${num(y)}" x2="${right}" y2="${num(y)}"/>`,
    )
  }
  const on = pts.filter((q) => !off.has(q.i))
  const poly = on.map((q) => `${num(q.x)},${num(q.y)}`).join(' ')
  if (on.length > 1) {
    parts.push(
      `<polygon class="chart-area" points="${num(on[0].x)},${bottom} ${poly} ${num(on[on.length - 1].x)},${bottom}"/>`,
      // pathLength 1: the draw entrance dashes the line in path units, whatever its real length
      `<polyline class="chart-line" points="${poly}" pathLength="1"/>`,
    )
  }
  for (const q of pts) {
    const isOff = off.has(q.i)
    // --t: where along the line this point sits (0..1), so the draw entrance can show it as the line arrives
    const t = on.length > 1 ? on.findIndex((o) => o.i === q.i) / (on.length - 1) : 0
    parts.push(
      `<g class="${partClass('chart-point', q.i, off)}" data-index="${q.i}" ${hoverData(q.p, slot)} style="--t:${num(Math.max(0, t))}">`,
      isOff ? '' : `<circle class="chart-hit" cx="${num(q.x)}" cy="${num(q.y)}" r="36"/>`,
      isOff ? '' : `<circle class="chart-dot" cx="${num(q.x)}" cy="${num(q.y)}" r="10"/>`,
      isOff
        ? ''
        : `<text class="chart-value" x="${num(q.x)}" y="${num(q.y - 26)}" font-size="28" text-anchor="middle">${escapeHtml(num(q.p.value) + (slot.unit || ''))}</text>`,
      `<text class="chart-label" x="${num(q.x)}" y="560" font-size="28" text-anchor="middle">${inlineMarkup(q.p.label)}</text>`,
      '</g>',
    )
  }
  return { w: 1000, h: 600, body: parts.join('') }
}

function donutChart(slot, off) {
  const max = chartMax(slot, off)
  const first = slot.series.find((_, i) => !off.has(i)) || slot.series[0]
  const r = 220
  const parts = [`<circle class="chart-ring-track" cx="300" cy="300" r="${r}"/>`]
  // every ring is pathLength 1: a segment's dash is its share of the whole, its offset the shares
  // before it, and --share lets the grow entrance run the dash from 0 to the real share
  let offset = 0
  slot.series.forEach((p, i) => {
    const share = off.has(i) ? 0 : Math.max(0, Math.min(1, p.value / max))
    parts.push(
      `<circle class="${partClass(`chart-ring-fill chart-seg-${i + 1}`, i, off)}" data-index="${i}" ${hoverData(p, slot)} cx="300" cy="300" r="${r}" pathLength="1" stroke-dasharray="${num(share)} 1" stroke-dashoffset="${num(-offset)}" transform="rotate(-90 300 300)" style="--share:${num(share)}"/>`,
    )
    offset += share
  })
  parts.push(
    `<text class="chart-center" x="300" y="290" font-size="96" text-anchor="middle" dominant-baseline="middle">${escapeHtml(num(first.value) + (slot.unit || ''))}</text>`,
    `<text class="chart-label" x="300" y="380" font-size="32" text-anchor="middle">${inlineMarkup(first.label)}</text>`,
  )
  return { w: 600, h: 600, body: parts.join('') }
}

function progressChart(slot, off) {
  const max = chartMax(slot, off)
  const rowH = 140
  const h = slot.series.length * rowH
  const parts = []
  slot.series.forEach((p, i) => {
    const y = i * rowH
    const w = off.has(i) ? 0 : Math.max(0, Math.min(1000, (1000 * p.value) / max))
    parts.push(
      `<g class="${partClass('chart-row', i, off)}" data-index="${i}" ${hoverData(p, slot)}>`,
      `<text class="chart-label" x="0" y="${y + 44}" font-size="32">${inlineMarkup(p.label)}</text>`,
      `<text class="chart-value" x="1000" y="${y + 44}" font-size="32" text-anchor="end">${escapeHtml(num(p.value) + (slot.unit || ''))}</text>`,
      `<rect class="chart-track" x="0" y="${y + 76}" width="1000" height="28" rx="14"/>`,
      `<rect class="chart-fill" x="0" y="${y + 76}" width="${num(w)}" height="28" rx="14"/>`,
      '</g>',
    )
  })
  return { w: 1000, h, body: parts.join('') }
}

// Hangul, CJK (kana and the unified block included), fullwidth forms: one em wide; the rest ≈ 0.58em
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/
function textWidth(text, fontSize) {
  let em = 0
  for (const ch of String(text).replace(/\*/g, '')) em += WIDE.test(ch) ? 1 : 0.58
  return em * fontSize
}

/**
 * The clickable legend of a `toggle` chart: one key per item (swatch plus label), wrapped into
 * rows across the chart's width. Keys are focusable so the keyboard can toggle them too.
 */
function legendSvg(slot, off, width) {
  const fontSize = 28
  const swatch = 28
  const rowH = 52
  const gap = 40
  const parts = []
  let x = 0
  let row = 0
  slot.series.forEach((p, i) => {
    const keyW = swatch + 14 + textWidth(p.label, fontSize)
    if (x > 0 && x + keyW > width) {
      x = 0
      row++
    }
    const y = row * rowH
    parts.push(
      `<g class="chart-key${off.has(i) ? ' is-off' : ''}" data-index="${i}" tabindex="-1" role="button" aria-pressed="${!off.has(i)}">`,
      `<rect class="chart-swatch chart-seg-${i + 1}" x="${num(x)}" y="${y + 12}" width="${swatch}" height="${swatch}" rx="6"/>`,
      `<text class="chart-key-label" x="${num(x + swatch + 14)}" y="${y + 26}" font-size="${fontSize}" dominant-baseline="middle">${inlineMarkup(p.label)}</text>`,
      '</g>',
    )
    x += keyW + gap
  })
  return { h: (row + 1) * rowH + 8, svg: `<g class="chart-legend">${parts.join('')}</g>` }
}

/**
 * The chart as inline SVG. `opts.off` lists the indices the legend has switched off: they stay in
 * place (label kept, bar or point gone) and drop out of the scale, so the rest rescales.
 */
export function chartSvg(slot, opts) {
  if (!slot.series || slot.series.length === 0) return ''
  const off = new Set(opts?.off || [])
  let drawn
  switch (slot.kind) {
    case 'bar':
      drawn = barChart(slot, off)
      break
    case 'line':
      drawn = lineChart(slot, off)
      break
    case 'donut':
      drawn = donutChart(slot, off)
      break
    case 'progress':
      drawn = progressChart(slot, off)
      break
    default:
      return ''
  }
  if (!slot.toggle) return `${svgOpen(slot.kind, drawn.w, drawn.h, false)}${drawn.body}</svg>`
  const legend = legendSvg(slot, off, drawn.w)
  return `${svgOpen(slot.kind, drawn.w, drawn.h + legend.h, true)}${legend.svg}<g class="chart-body" transform="translate(0 ${legend.h})">${drawn.body}</g></svg>`
}

function tableHtml(slot) {
  const head = slot.header
    ? `<thead><tr>${slot.header.map((h) => `<th>${inlineMarkup(h)}</th>`).join('')}</tr></thead>`
    : ''
  const body = slot.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkup(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table class="table">${head}<tbody>${body}</tbody></table>`
}

/** Tab strip plus one panel per tab; only the first panel is shown until the player switches. */
function tabsHtml(slot) {
  const strip = slot.panels
    .map(
      (p, i) =>
        `<button type="button" class="tab${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-tab="${i}" tabindex="-1">${inlineMarkup(p.label)}</button>`,
    )
    .join('')
  const panels = slot.panels
    .map(
      (p, i) =>
        `<div class="tab-panel" role="tabpanel" data-tab="${i}"${i === 0 ? '' : ' hidden'}>${renderBase(p.content)}</div>`,
    )
    .join('')
  return `<div class="tabs" role="tablist">${strip}</div>${panels}`
}

/**
 * Hotspots on an image: one anchor per region, positioned in percent of the image box. The label
 * travels as an attribute (the base CSS shows it on hover) so it never counts as slide text.
 */
function hotspotsHtml(list) {
  return (list || [])
    .map(
      (h, i) =>
        `<a class="hotspot" href="#${escapeHtml(h.target)}" data-hotspot="${i}" data-target="${escapeHtml(h.target)}"${h.label ? ` data-label="${escapeHtml(h.label)}"` : ''} aria-label="${escapeHtml(h.label || h.target)}" tabindex="-1" style="left:${num(h.x)}%;top:${num(h.y)}%;width:${num(h.w)}%;height:${num(h.h)}%"></a>`,
    )
    .join('')
}

/** The slot without its `details` part. */
function renderBase(slot) {
  switch (slot.type) {
    case 'text':
      return multiline(slot.value)
    case 'list':
      return `<ul class="list">${slot.items.map((i) => `<li>${multiline(i)}</li>`).join('')}</ul>`
    case 'image':
      return `<img src="${escapeHtml(slot.src)}" alt="${escapeHtml(slot.alt || '')}">${hotspotsHtml(slot.hotspots)}`
    case 'metric': {
      const delta =
        slot.delta === undefined ? '' : `<span class="metric-delta">${multiline(slot.delta)}</span>`
      // data-count: the number inside the value (62 in "62 min", 104411 in "104,411"), the hook the
      // count entrance runs up to; the text itself stays exactly as written
      const n = countValue(slot.value)
      const count = n === null ? '' : ` data-count="${num(n)}"`
      return `<div class="metric"><span class="metric-value"${count}>${multiline(slot.value)}</span><span class="metric-label">${multiline(slot.label)}</span>${delta}</div>`
    }
    case 'chart':
      return chartSvg(slot)
    case 'table':
      return tableHtml(slot)
    case 'code':
      return `<pre class="code"${slot.lang ? ` data-lang="${escapeHtml(slot.lang)}"` : ''}><code>${escapeHtml(slot.value)}</code></pre>`
    case 'icon':
      return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${escapeHtml(slot.name)}"/></svg>`
    case 'tabs':
      return tabsHtml(slot)
    default:
      return ''
  }
}

/**
 * The slot's HTML. Details ride along in an inert `<template class="details">`: they are not in
 * the rendered tree (QA measures the collapsed state), and the player clones them into the
 * expanded panel on click.
 */
export function renderSlot(slot) {
  const base = renderBase(slot)
  if (!slot.details || !DETAILS_TYPES.has(slot.type)) return base
  return `${base}<template class="details">${renderBase(slot.details)}</template>`
}

/** The plain-text form of a slot: what the editor shows and what a text override replaces. */
export function slotText(slot) {
  if (!slot) return ''
  switch (slot.type) {
    case 'text':
      return slot.value
    case 'list':
      return slot.items.join('\n')
    case 'metric':
      return [slot.value, slot.label, slot.delta].filter((x) => x !== undefined).join('\n')
    case 'chart':
      return slot.series.map((p) => `${p.label}｜${p.value}`).join('\n')
    case 'table':
      return [slot.header, ...slot.rows]
        .filter((r) => r !== undefined)
        .map((r) => r.join(' | '))
        .join('\n')
    case 'code':
      return slot.value
    case 'icon':
      return slot.name
    case 'tabs':
      return slot.panels.map((p) => `## ${p.label}\n${slotText(p.content)}`).join('\n')
    default:
      return ''
  }
}

/** A text override edits whatever the slot renders as: lines become list items, metric parts, chart rows… */
export function applyTextOverride(slot, text) {
  const lines = text.split('\n')
  if (!slot) return { type: 'text', value: text }
  const withDetails = (out) => (slot.details ? { ...out, details: slot.details } : out)
  switch (slot.type) {
    case 'list':
      return withDetails({ type: 'list', items: lines.filter((l) => l.trim() !== '') })
    case 'metric': {
      const out = { type: 'metric', value: lines[0] || '', label: lines[1] || '' }
      if (lines[2] !== undefined) out.delta = lines[2]
      return withDetails(out)
    }
    case 'image':
      return slot
    case 'chart': {
      const series = []
      for (const line of lines) {
        const [label, raw] = line.split(SEP)
        const value = Number.parseFloat(raw)
        if (label !== undefined && Number.isFinite(value))
          series.push({ label: label.trim(), value })
      }
      const out = {
        type: 'chart',
        kind: slot.kind,
        series: series.length > 0 ? series : slot.series,
      }
      if (slot.unit !== undefined) out.unit = slot.unit
      if (slot.max !== undefined) out.max = slot.max
      if (slot.toggle !== undefined) out.toggle = slot.toggle
      return out
    }
    case 'table': {
      const rows = lines.filter((l) => l.trim() !== '').map((l) => l.split(SEP))
      if (rows.length === 0) return slot
      if (slot.header && rows.length > 1)
        return { type: 'table', header: rows[0], rows: rows.slice(1) }
      return slot.header
        ? { type: 'table', header: rows[0], rows: slot.rows }
        : { type: 'table', rows }
    }
    case 'code':
      return slot.lang === undefined
        ? { type: 'code', value: text }
        : { type: 'code', value: text, lang: slot.lang }
    case 'icon':
      return { type: 'icon', name: (lines[0] || '').trim() }
    case 'tabs': {
      // `## 標籤` opens a panel; the lines under it are that panel's text, read the way its
      // current content type reads a text override (a table panel takes `格 | 格` rows, and so on)
      const panels = []
      let cur = null
      for (const line of lines) {
        const m = /^##\s*(.+?)\s*$/.exec(line)
        if (m) {
          cur = { label: m[1], body: [] }
          panels.push(cur)
          continue
        }
        if (!cur) {
          cur = { label: slot.panels[0] ? slot.panels[0].label : '1', body: [] }
          panels.push(cur)
        }
        cur.body.push(line)
      }
      const out = panels.map((p, i) => ({
        label: p.label,
        content: applyTextOverride(
          slot.panels[i] ? slot.panels[i].content : undefined,
          p.body.join('\n').replace(/\n+$/, ''),
        ),
      }))
      return out.length > 0 ? { type: 'tabs', panels: out } : slot
    }
    default:
      return withDetails({ type: 'text', value: text })
  }
}

/**
 * The slot as the override makes it: text and details overrides on text elements, src and
 * hotspots overrides on image elements. Undefined when there is nothing to render.
 */
export function effectiveSlot(slot, override, kind) {
  const o = override || {}
  let out = slot
  if (kind === 'text') {
    if (o.text != null) out = applyTextOverride(out, o.text)
    if (o.details != null && out && DETAILS_TYPES.has(out.type)) {
      if (o.details === '') {
        const { details: _dropped, ...rest } = out
        out = rest
      } else out = { ...out, details: applyTextOverride(out.details, o.details) }
    }
  } else if (kind === 'image' && out && out.type === 'image') {
    if (o.src != null) out = { ...out, src: o.src }
    if (o.hotspots != null) {
      const { hotspots: _replaced, ...rest } = out
      out = o.hotspots.length > 0 ? { ...rest, hotspots: o.hotspots } : rest
    }
  }
  return out
}
