/**
 * CSS ownership: a layout decides where boxes are and how big they are; a theme
 * decides what existing boxes look like. This module parses plain CSS (no
 * dependency) and reports declarations that cross that line.
 */

export type CssOwner = 'theme' | 'layout'

export interface CssDeclaration {
  selector: string
  property: string
  value: string
  important: boolean
  line: number
  /** enclosing at-rule name without '@', e.g. 'font-face' or 'media' */
  atRule?: string
}

export interface CssLintIssue {
  severity: 'error' | 'warning'
  line: number
  selector: string
  property?: string
  message: string
}

const GEOMETRY_EXACT = new Set([
  'position',
  'inset',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'display',
  'gap',
  'row-gap',
  'column-gap',
  'transform',
  'transform-origin',
  'translate',
  'rotate',
  'scale',
  'writing-mode',
  'text-align',
  'font-size',
  'line-height',
  'white-space',
  'box-sizing',
  'z-index',
  'aspect-ratio',
  'object-fit',
  'object-position',
  'text-overflow',
  'word-break',
  'overflow-wrap',
  'hyphens',
  'text-wrap',
  'vertical-align',
  'float',
  'clear',
  'visibility',
  'text-indent',
  'columns',
  'clip-path',
])
const GEOMETRY_PREFIXES = [
  'grid',
  'flex',
  'padding',
  'margin',
  'inset-',
  'place-',
  'overflow',
  'align-',
  'justify-',
  'column-',
  'list-style',
  'min-',
  'max-',
]

const APPEARANCE_EXACT = new Set([
  'color',
  'box-shadow',
  'text-shadow',
  'font-family',
  'font-weight',
  'font-style',
  'font-stretch',
  'font-feature-settings',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-underline-offset',
  'opacity',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'fill',
  'caret-color',
  'accent-color',
  '-webkit-font-smoothing',
  'text-rendering',
])
const APPEARANCE_PREFIXES = [
  'background',
  'border',
  'text-decoration',
  'font-variant',
  'outline',
  'stroke',
  '-webkit-text-stroke',
]

const FORBIDDEN_EVERYWHERE = new Set(['font', 'content', 'cursor', 'pointer-events', 'user-select'])

/**
 * `content` values that generate nothing. A decorative pseudo-element (the rule that trails an
 * eyebrow, the dot before a label) may carry one on either side of the ownership line; text,
 * attr() and counter() generate content the editor cannot reach and stay forbidden.
 */
const EMPTY_CONTENT = /^(""|''|none|normal)$/i
export function isEmptyContent(value: string): boolean {
  return EMPTY_CONTENT.test(value.trim())
}

function forbiddenMessage(property: string): string {
  if (property.toLowerCase() === 'content') {
    return '`content` may only be empty ("", none or normal) on a decorative pseudo-element; text, attr() and counter() generate content the editor cannot reach'
  }
  return `\`${property}\` belongs to neither theme nor layout; use longhands instead of \`font\`, the rest belongs to the editor/player`
}

/**
 * What a theme may additionally set inside a `:hover` rule: a lift or a slight scale is a
 * transient state of a box the layout placed, not a change of layout. The player drops the
 * `[data-interactive]` gate in static and edit modes, so QA and dragging never see it.
 */
const HOVER_ONLY = new Set(['transform', 'transform-origin', 'translate', 'scale', 'rotate'])
export const HOVER_GATE = '[data-interactive]'
/** Roles whose resting look a theme defines must also get a hover state. */
export const HOVER_ROLES = ['card', 'pill', 'cta', 'photo', 'table']

export function isHoverSelector(selector: string): boolean {
  return /:hover\b/.test(selector)
}

const THEME_SELECTOR_FORBIDDEN: Array<[RegExp, string]> = [
  [/data-layout/, 'theme selectors must not bind to a layout (data-layout)'],
  [/data-slide/, 'theme selectors must not bind to a specific slide (data-slide)'],
  [
    /data-el\s*[=~|^$*]?=/,
    'theme selectors must not bind to an element id (data-el=...); use data-role',
  ],
  [/:nth-/, 'theme selectors must not use :nth-*, which quietly picks elements by position'],
  [/(^|[\s>+~,])#/, 'theme selectors must not use #id'],
  [/(^|[\s>+~,])\*(\s|$|[{,])/, 'theme selectors must not use the universal *'],
]

const LENGTH_UNIT = /\d(px|rem|em|vw|vh|%)\b/
const APPEARANCE_VAR_NAME = /(radius|shadow|stroke|letter|border|blur|opacity)/

export function classifyProperty(
  property: string,
): 'geometry' | 'appearance' | 'custom' | 'forbidden' | 'unknown' {
  const p = property.toLowerCase()
  if (p.startsWith('--')) return 'custom'
  if (FORBIDDEN_EVERYWHERE.has(p)) return 'forbidden'
  if (GEOMETRY_EXACT.has(p) || GEOMETRY_PREFIXES.some((x) => p.startsWith(x))) return 'geometry'
  if (APPEARANCE_EXACT.has(p) || APPEARANCE_PREFIXES.some((x) => p.startsWith(x)))
    return 'appearance'
  return 'unknown'
}

function stripComments(css: string): string {
  // keep newlines so line numbers survive
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

const NESTING_AT_RULES = new Set(['media', 'supports', 'container', 'layer'])

export function parseCss(css: string): CssDeclaration[] {
  const text = stripComments(css)
  const out: CssDeclaration[] = []

  function parseDeclarations(body: string, offset: number, selector: string, atRule?: string) {
    let start = 0
    let depthParen = 0
    let quote: string | null = null
    for (let i = 0; i <= body.length; i++) {
      const ch = body[i]
      if (quote) {
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'") {
        quote = ch
        continue
      }
      if (ch === '(') depthParen++
      else if (ch === ')') depthParen--
      if ((ch === ';' && depthParen === 0) || i === body.length) {
        const chunk = body.slice(start, i)
        start = i + 1
        const colon = chunk.indexOf(':')
        if (colon === -1) continue
        const property = chunk.slice(0, colon).trim()
        if (!property) continue
        let value = chunk.slice(colon + 1).trim()
        const important = /!\s*important\s*$/i.test(value)
        if (important) value = value.replace(/!\s*important\s*$/i, '').trim()
        const declStart =
          offset + start - chunk.length - 1 + (chunk.length - chunk.trimStart().length)
        out.push({ selector, property, value, important, line: lineAt(text, declStart), atRule })
      }
    }
  }

  function parseRules(from: number, to: number, atRule?: string) {
    let i = from
    let prelude = ''
    let preludeStart = from
    while (i < to) {
      const ch = text[i] as string
      if (ch === '{') {
        const selector = prelude.trim()
        const close = matchingBrace(text, i)
        const inner = text.slice(i + 1, close)
        if (selector.startsWith('@')) {
          const name = selector.slice(1).split(/[\s(]/)[0]?.toLowerCase() ?? ''
          if (NESTING_AT_RULES.has(name)) parseRules(i + 1, close, name)
          else if (name === 'keyframes') {
            /* animation frames carry no ownership information */
          } else parseDeclarations(inner, i + 1, selector, name)
        } else {
          parseDeclarations(inner, i + 1, selector, atRule)
        }
        i = close + 1
        prelude = ''
        preludeStart = i
        continue
      }
      if (ch === ';' && prelude.trim().startsWith('@')) {
        prelude = ''
        preludeStart = i + 1
        i++
        continue
      }
      prelude += ch
      i++
    }
    void preludeStart
  }

  parseRules(0, text.length)
  return out
}

function matchingBrace(text: string, open: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return text.length
}

export function lintCss(css: string, owner: CssOwner): CssLintIssue[] {
  const issues: CssLintIssue[] = []
  const decls = parseCss(css)
  const seenSelectors = new Set<string>()

  for (const d of decls) {
    const base = { line: d.line, selector: d.selector }
    if (d.important) {
      issues.push({
        ...base,
        severity: 'error',
        property: d.property,
        message: '!important is not allowed; needing it means ownership has already broken down',
      })
    }
    const cls = classifyProperty(d.property)

    if (owner === 'theme') {
      if (d.atRule === 'font-face') continue
      if (!seenSelectors.has(d.selector)) {
        seenSelectors.add(d.selector)
        for (const [re, message] of THEME_SELECTOR_FORBIDDEN) {
          if (re.test(d.selector)) issues.push({ ...base, severity: 'error', message })
        }
      }
      if (cls === 'geometry') {
        if (isHoverSelector(d.selector) && HOVER_ONLY.has(d.property.toLowerCase())) continue
        issues.push({
          ...base,
          severity: 'error',
          property: d.property,
          message: `geometry property \`${d.property}\` can only be set by the layout (layout.css)${HOVER_ONLY.has(d.property.toLowerCase()) ? ' (only a hover rule may use it for a lift or a slight scale)' : ''}`,
        })
      } else if (cls === 'forbidden') {
        if (d.property.toLowerCase() === 'content' && isEmptyContent(d.value)) continue
        issues.push({
          ...base,
          severity: 'error',
          property: d.property,
          message: forbiddenMessage(d.property),
        })
      } else if (cls === 'custom') {
        if (LENGTH_UNIT.test(d.value) && !APPEARANCE_VAR_NAME.test(d.property)) {
          issues.push({
            ...base,
            severity: 'error',
            property: d.property,
            message: `custom property \`${d.property}\` carries a length, which smuggles geometry through a variable`,
          })
        }
      } else if (cls === 'unknown') {
        issues.push({
          ...base,
          severity: 'warning',
          property: d.property,
          message: `\`${d.property}\` is not in the ownership list; confirm it only affects appearance`,
        })
      }
    } else {
      if (d.atRule === 'font-face') {
        issues.push({
          ...base,
          severity: 'error',
          message: 'layouts must not declare @font-face; fonts belong to the theme',
        })
        continue
      }
      if (cls === 'appearance') {
        issues.push({
          ...base,
          severity: 'error',
          property: d.property,
          message: `appearance property \`${d.property}\` can only be set by the theme (theme.css)`,
        })
      } else if (cls === 'forbidden') {
        if (d.property.toLowerCase() === 'content' && isEmptyContent(d.value)) continue
        issues.push({
          ...base,
          severity: 'error',
          property: d.property,
          message: forbiddenMessage(d.property),
        })
      } else if (cls === 'custom') {
        issues.push({
          ...base,
          severity: 'error',
          property: d.property,
          message: `layouts must not define custom property \`${d.property}\`; tokens belong to the theme`,
        })
      } else if (cls === 'unknown') {
        issues.push({
          ...base,
          severity: 'warning',
          property: d.property,
          message: `\`${d.property}\` is not in the ownership list; confirm it only affects geometry`,
        })
      }
    }
  }
  return issues
}

/**
 * Hover rules in a theme: every `:hover` selector starts with `[data-interactive]` (the player
 * drops that attribute in static and edit modes, so QA and dragging never meet a hover) and picks
 * its element by data-role; and every hover-able role the theme styles (HOVER_ROLES) has one.
 */
export function lintThemeHover(css: string): CssLintIssue[] {
  const issues: CssLintIssue[] = []
  const firstLine = new Map<string, number>()
  for (const d of parseCss(css)) {
    if (d.atRule === 'font-face' || d.atRule === 'keyframes') continue
    if (!firstLine.has(d.selector)) firstLine.set(d.selector, d.line)
  }
  const styled = new Set<string>()
  const hovered = new Set<string>()
  for (const [selector, line] of firstLine) {
    for (const part of selector.split(',').map((s) => s.trim())) {
      const roles = [...part.matchAll(/\[data-role="([a-z0-9-]+)"\]/g)].map((m) => m[1] as string)
      if (!isHoverSelector(part)) {
        for (const r of roles) styled.add(r)
        continue
      }
      for (const r of roles) hovered.add(r)
      if (!part.startsWith(HOVER_GATE)) {
        issues.push({
          severity: 'error',
          line,
          selector,
          message: `hover rules must start with ${HOVER_GATE} so static and edit modes can switch them off`,
        })
      }
      if (roles.length === 0) {
        issues.push({
          severity: 'error',
          line,
          selector,
          message:
            'hover rules can only pick elements by data-role (data-tone or descendant elements may be added)',
        })
      }
    }
  }
  for (const role of HOVER_ROLES) {
    if (styled.has(role) && !hovered.has(role)) {
      issues.push({
        severity: 'error',
        line: 0,
        selector: `[data-role="${role}"]`,
        message: `the theme styles ${role} but has no ${HOVER_GATE} [data-role="${role}"]:hover state; elements must respond to the mouse during playback`,
      })
    }
  }
  return issues
}

/** Layout rules must be scoped to their own layout so two layouts never fight. */
export function lintLayoutScope(css: string, layoutId: string): CssLintIssue[] {
  const scope = `[data-layout="${layoutId}"]`
  const issues: CssLintIssue[] = []
  const seen = new Set<string>()
  for (const d of parseCss(css)) {
    if (seen.has(d.selector)) continue
    seen.add(d.selector)
    const parts = d.selector.split(',').map((s) => s.trim())
    for (const part of parts) {
      if (!part.startsWith(scope)) {
        issues.push({
          severity: 'error',
          line: d.line,
          selector: d.selector,
          message: `layout selectors must start with ${scope} so they do not affect other layouts`,
        })
      }
    }
  }
  return issues
}
