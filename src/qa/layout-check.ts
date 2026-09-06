import type { ErrorObject } from 'ajv'
import { type Layout, type Theme, validateLayoutJson, validateThemeJson } from '../render/assets.ts'
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
  return { elements, placeholders, hasTone: /data-tone="/.test(html) }
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
      message: `id \`${json.id}\` 與目錄名 \`${layout.id}\` 不同`,
    })
  }

  const declared = new Map(json.elements.map((e) => [e.id, e.kind]))
  const dupes = json.elements.map((e) => e.id).filter((id, i, all) => all.indexOf(id) !== i)
  for (const id of new Set(dupes)) {
    issues.push({ severity: 'error', file: jsonFile, message: `elements 裡的 id \`${id}\` 重複` })
  }
  if (json.elements.length > json.density.max_elements) {
    issues.push({
      severity: 'warning',
      file: jsonFile,
      message: `elements 有 ${json.elements.length} 個，超過自己宣告的 density.max_elements ${json.density.max_elements}`,
    })
  }

  for (const [slotId, slot] of Object.entries(json.slots)) {
    const kind = declared.get(slotId)
    if (!kind) {
      issues.push({
        severity: 'error',
        file: jsonFile,
        message: `slot \`${slotId}\` 沒有同名的 element`,
      })
    } else if (kind === 'shape') {
      issues.push({
        severity: 'error',
        file: jsonFile,
        message: `slot \`${slotId}\` 對應的 element 是 shape；有內容的元件必須是 text 或 image`,
      })
    } else {
      for (const t of Array.isArray(slot.type) ? slot.type : [slot.type]) {
        if (SLOT_KIND[t] !== kind) {
          issues.push({
            severity: 'error',
            file: jsonFile,
            message: `slot \`${slotId}\` 型別 ${t} 需要 kind 為 ${SLOT_KIND[t]} 的 element，目前是 ${kind}`,
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
        message: `sample 的 \`${key}\` 不是 slots 之一`,
      })
  }
  for (const [slotId, slot] of Object.entries(json.slots)) {
    if (slot.required && !(slotId in json.sample)) {
      issues.push({
        severity: 'warning',
        file: jsonFile,
        message: `必要 slot \`${slotId}\` 在 sample 裡沒有範例內容`,
      })
    }
  }

  const scan = scanLayoutHtml(layout.html)
  if (!/^\s*<section\b[^>]*\bdata-layout="([^"]+)"/.test(layout.html)) {
    issues.push({
      severity: 'error',
      file: htmlFile,
      line: 1,
      message: '根元素必須是 <section class="slide" data-layout="<id>">',
    })
  } else {
    const rootId = /data-layout="([^"]+)"/.exec(layout.html)?.[1]
    if (rootId !== layout.id) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: 1,
        message: `根元素的 data-layout 是 \`${rootId}\`，應為 \`${layout.id}\``,
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
          message: `data-slot="${e.slot}" 必須放在有 data-el 的元件上`,
        })
      continue
    }
    if (inHtml.has(e.el)) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-el="${e.el}" 出現超過一次`,
      })
      continue
    }
    inHtml.set(e.el, e)
    if (!declared.has(e.el)) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-el="${e.el}" 沒有在 layout.json 的 elements 宣告`,
      })
    }
    if (e.slot !== undefined && e.slot !== e.el) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-slot="${e.slot}" 必須與同元件的 data-el="${e.el}" 相同`,
      })
    }
    if (e.role === undefined) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `data-el="${e.el}" 缺少 data-role；主題只靠 role 上色`,
      })
    }
  }
  for (const id of declared.keys()) {
    if (!inHtml.has(id))
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `layout.json 宣告了 element \`${id}\`，但 layout.html 沒有 data-el="${id}"`,
      })
  }
  for (const slotId of Object.keys(json.slots)) {
    const e = inHtml.get(slotId)
    if (e && e.slot === undefined) {
      issues.push({
        severity: 'error',
        file: htmlFile,
        line: e.line,
        message: `slot \`${slotId}\` 的元件缺少 data-slot="${slotId}"`,
      })
    }
  }

  const counts = new Map<string, number>()
  for (const p of scan.placeholders) counts.set(p, (counts.get(p) ?? 0) + 1)
  for (const [p, n] of counts) {
    if (!(p in json.slots))
      issues.push({ severity: 'error', file: htmlFile, message: `佔位符 {{${p}}} 不是任何 slot` })
    else if (n > 1)
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `佔位符 {{${p}}} 出現 ${n} 次，只能一次`,
      })
  }
  for (const slotId of Object.keys(json.slots)) {
    if (!counts.has(slotId))
      issues.push({
        severity: 'error',
        file: htmlFile,
        message: `slot \`${slotId}\` 沒有 {{${slotId}}} 佔位符`,
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
      message: `id \`${theme.json.id}\` 與目錄名 \`${theme.id}\` 不同`,
    })
  }
  issues.push(...cssIssues(`${theme.dir}/theme.css`, lintCss(theme.css, 'theme')))
  issues.push(...cssIssues(`${theme.dir}/theme.css`, lintThemeHover(theme.css)))
  return issues
}
