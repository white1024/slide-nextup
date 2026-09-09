import type { ErrorObject } from 'ajv'
import {
  type Layout,
  motionFor,
  type Theme,
  validateLayoutJson,
  validateThemeJson,
} from '../render/assets.ts'
import { type CssLintIssue, lintCss, lintLayoutScope, lintThemeHover } from './css-ownership.ts'

export interface CheckIssue {
  severity: 'error' | 'warning'
  file: string
  line?: number
  message: string
}

function ajvIssues(file: string, errors: ErrorObject[] | null | undefined): CheckIssue[] {
  return (errors ?? []).map((e) => ({
    severity: 'error',
    file,
    message: `${e.instancePath || '/'} ${e.message ?? e.keyword}${e.keyword === 'additionalProperties' ? ` (${(e.params as { additionalProperty: string }).additionalProperty})` : ''}`,
  }))
}

function cssIssues(file: string, issues: CssLintIssue[]): CheckIssue[] {
  return issues.map((i) => ({
    severity: i.severity,
    file,
    line: i.line,
    message: `${i.selector} { ${i.property ? `${i.property}: … ` : ''}}  ${i.message}`,
  }))
}

interface HtmlElement {
  tag: string
  el?: string
  slot?: string
  role?: string
  line: number
}

export function scanLayoutHtml(html: string): {
  elements: HtmlElement[]
  placeholders: string[]
  hasTone: boolean
  /** every data-tone value the layout asks the theme for */
  tones: string[]
} {
  const elements: HtmlElement[] = []
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let m: RegExpExecArray | null = tagRe.exec(html)
  while (m) {
    const attrs = m[2] ?? ''
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]
    const el = attr('data-el')
    const slot = attr('data-slot')
    const role = attr('data-role')
    if (el !== undefined || slot !== undefined || role !== undefined) {
      const line = html.slice(0, m.index).split('\n').length
      const item: HtmlElement = { tag: m[1] ?? '', line }
      if (el !== undefined) item.el = el
      if (slot !== undefined) item.slot = slot
      if (role !== undefined) item.role = role
      elements.push(item)
    }
    m = tagRe.exec(html)
  }
  const placeholders = [...html.matchAll(/\{\{([A-Za-z][A-Za-z0-9_-]*)\}\}/g)].map(
    (x) => x[1] as string,
  )
  const tones = [...new Set([...html.matchAll(/data-tone="([^"]*)"/g)].map((x) => x[1] as string))]
  return { elements, placeholders, hasTone: tones.length > 0, tones }
}

const SLOT_KIND: Record<string, 'text' | 'image'> = {
  text: 'text',
  list: 'text',
  metric: 'text',
  chart: 'text',
  table: 'text',
  code: 'text',
  icon: 'text',
  tabs: 'text',
  image: 'image',
}

export function checkLayout(layout: Layout): CheckIssue[] {
  const issues: CheckIssue[] = []
  const jsonFile = `${layout.dir}/layout.json`
  const htmlFile = `${layout.dir}/layout.html`
  const cssFile = `${layout.dir}/layout.css`

  if (!validateLayoutJson(layout.json)) {
    issues.push(...ajvIssues(jsonFile, validateLayoutJson.errors))
    return issues
  }
  const { json } = layout
  if (json.id !== layout.id) {
    issues.push({
      severity: 'error',
      file: jsonFile,
      message: `id \`${json.id}\` differs from the folder name \`${layout.id}\``,
    })
  }

  const declared = new Map(json.elements.map((e) => [e.id, e.kind]))
  const dupes = json.elements.map((e) => e.id).filter((id, i, all) => all.indexOf(id) !== i)
  for (const id of new Set(dupes)) {
    issues.push({
      severity: 'error',
      file: jsonFile,
      message: `duplicate id \`${id}\` in elements`,
    })
  }
  if (json.elements.length > json.density.max_elements) {
    issues.push({
      severity: 'warning',
      file: jsonFile,
      message: `${json.elements.length} elements, over its own density.max_elements ${json.density.max_elements}`,
    })
  }

  for (const [slotId, slot] of Object.entries(json.slots)) {
    const types = Array.isArray(slot.type) ? slot.type : [slot.type]
    if (slot.fit && !types.includes('image')) {
      issues.push({
        severity: 'error',
        file: jsonFile,
        message: `slot \`${slotId}\` declares fit but is not an image slot; fit says how a picture fills its box`,
      })
    }
  }

  for (const [slotId, slot] of Object.entries(json.slots)) {
    const kind = declared.get(slotId)
    if (!kind) {
      issues.push({
        severity: 'error',
        file: jsonFile,
        message: `slot \`${slotId}\` has no element of the same name`,
      })
    } else if (kind === 'shape') {
      issues.push({
        severity: 'error',
        file: jsonFile,
        message: `the element for slot \`${slotId}\` is a shape; an element with content must be text or image`,
      })
    } else {
      for (const t of Array.isArray(slot.type) ? slot.type : [slot.type]) {
        if (SLOT_KIND[t] !== kind) {
          issues.push({
            severity: 'error',
            file: jsonFile,
            message: `slot \`${slotId}\` type ${t} needs an element of kind ${SLOT_KIND[t]}, got ${kind}`,
          })
        }
      }
    }
  }
  for (const key of Object.keys(json.sample)) {
    if (!(key in json.slots))
      issues.push({
        severity: 'error',
        file: jsonFile,
        message: `sample key \`${key}\` is not one of the slots`,
      })
  }
  for (const [slotId, slot] of Object.entries(json.slots)) {
    if (slot.required && !(slotId in json.sample)) {
      issues.push({
        severity: 'warning',
        file: jsonFile,
        message: `required slot \`${slotId}\` has no sample content`,
      })
    }
  }

  const scan = scanLayoutHtml(layout.html)
  if (!/^\s*<section\b[^>]*\bdata-layout="([^"]+)"/.test(layout.html)) {
    issues.push({
      severity: 'error',
      file: htmlFile,
      line: 1,
      message: 'the root element must be <section class="slide" data-layout="<id>">',
    })
  } else {
    const rootId = /data-layout="([^"]+)"/.exec(layout.html)?.[1]
    if (rootId !== layout.id) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: 1,
        message: `the root element's data-layout is \`${rootId}\`, expected \`${layout.id}\``,
      })
    }
  }

  const inHtml = new Map<string, HtmlElement>()
  for (const e of scan.elements) {
    if (e.el === undefined) {
      if (e.slot !== undefined)
        issues.push({
          severity: 'error',
          file: htmlFile,
          line: e.line,
          message: `data-slot="${e.slot}" must sit on an element that has data-el`,
        })
      continue
    }
    if (inHtml.has(e.el)) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-el="${e.el}" appears more than once`,
      })
      continue
    }
    inHtml.set(e.el, e)
    if (!declared.has(e.el)) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-el="${e.el}" is not declared in layout.json elements`,
      })
    }
    if (e.slot !== undefined && e.slot !== e.el) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-slot="${e.slot}" must match the same element's data-el="${e.el}"`,
      })
    }
    if (e.role === undefined) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-el="${e.el}" is missing data-role; themes paint by role alone`,
      })
    }
  }
  for (const id of declared.keys()) {
    if (!inHtml.has(id))
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `layout.json declares element \`${id}\` but layout.html has no data-el="${id}"`,
      })
  }
  for (const slotId of Object.keys(json.slots)) {
    const e = inHtml.get(slotId)
    if (e && e.slot === undefined) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `the element for slot \`${slotId}\` is missing data-slot="${slotId}"`,
      })
    }
  }

  const counts = new Map<string, number>()
  for (const p of scan.placeholders) counts.set(p, (counts.get(p) ?? 0) + 1)
  for (const [p, n] of counts) {
    if (!(p in json.slots))
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `placeholder {{${p}}} is not a slot`,
      })
    else if (n > 1)
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `placeholder {{${p}}} appears ${n} times, only once allowed`,
      })
  }
  for (const slotId of Object.keys(json.slots)) {
    if (!counts.has(slotId))
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `slot \`${slotId}\` has no {{${slotId}}} placeholder`,
      })
  }

  issues.push(...cssIssues(cssFile, lintCss(layout.css, 'layout')))
  issues.push(...cssIssues(cssFile, lintLayoutScope(layout.css, layout.id)))
  return issues
}

export function checkTheme(theme: Theme): CheckIssue[] {
  const issues: CheckIssue[] = []
  const jsonFile = `${theme.dir}/theme.json`
  if (!validateThemeJson(theme.json)) {
    issues.push(...ajvIssues(jsonFile, validateThemeJson.errors))
    return issues
  }
  if (theme.json.id !== theme.id) {
    issues.push({
      severity: 'error',
      file: jsonFile,
      message: `id \`${theme.json.id}\` differs from the folder name \`${theme.id}\``,
    })
  }
  issues.push(...cssIssues(`${theme.dir}/theme.css`, lintCss(theme.css, 'theme')))
  issues.push(...cssIssues(`${theme.dir}/theme.css`, lintThemeHover(theme.css)))
  issues.push(...lintThemeMotion(theme))
  return issues
}

/** the most travel one keyframe run may ask of an element (open-slide's measured entrances stay well under it) */
export const MOTION_TRAVEL_MAX = 64

/**
 * The motion rules a pack must keep: an explicit duration inside its family's band (150–800ms
 * without a family; the schema already holds enter values to the vocabulary and family to one
 * of three), and no keyframes in theme.css that move an element more than 64px.
 */
export function lintThemeMotion(theme: Theme): CheckIssue[] {
  const issues: CheckIssue[] = []
  const motion = theme.json.motion
  if (motion?.duration !== undefined) {
    const { family, band } = motionFor(theme.json)
    if (motion.duration < band[0] || motion.duration > band[1]) {
      issues.push({
        severity: 'error',
        file: `${theme.dir}/theme.json`,
        message: `motion.duration ${motion.duration}ms is outside ${family ? `the ${family} family's band` : 'the entrance band'} ${band[0]}–${band[1]}ms`,
      })
    }
  }
  // the ownership parser skips keyframes (frames carry no ownership), so the travel check reads them itself
  for (const block of keyframesBlocks(theme.css)) {
    for (const m of block.body.matchAll(/transform\s*:\s*([^;}]+)/g)) {
      const value = (m[1] ?? '').trim()
      for (const t of value.matchAll(/translate(?:X|Y|3d)?\(([^)]*)\)/g)) {
        const px = (t[1] ?? '')
          .split(',')
          .map((v) => /^\s*(-?[0-9.]+)px\s*$/.exec(v)?.[1])
          .filter((v): v is string => v !== undefined)
          .map(Number)
        const over = px.find((v) => Math.abs(v) > MOTION_TRAVEL_MAX)
        if (over === undefined) continue
        issues.push({
          severity: 'error',
          file: `${theme.dir}/theme.css`,
          line: block.line + block.body.slice(0, m.index).split('\n').length - 1,
          message: `@keyframes ${block.name} { transform: ${value} }  keyframes may move an element at most ${MOTION_TRAVEL_MAX}px (this one moves ${over}px)`,
        })
      }
    }
  }
  return issues
}

/** every @keyframes block in a stylesheet: its name, its body and the line it starts on */
function keyframesBlocks(css: string): { name: string; body: string; line: number }[] {
  const out: { name: string; body: string; line: number }[] = []
  for (const m of css.matchAll(/@keyframes\s+([^\s{]+)\s*\{/g)) {
    const open = m.index + m[0].length
    let depth = 1
    let i = open
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    out.push({
      name: m[1] ?? '',
      body: css.slice(open, i - 1),
      line: css.slice(0, m.index).split('\n').length,
    })
  }
  return out
}
