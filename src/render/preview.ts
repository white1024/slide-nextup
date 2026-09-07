import type { Override, Slot } from '../model/deck.ts'
import { detectLang } from '../model/lang.ts'
import { type Layout, type Theme, themeCssVariables } from './assets.ts'
import { iconSprite } from './icons.ts'
import { FIT_JS } from './runtime.ts'
import { BASE_CSS, escapeHtml, renderSlideHtml } from './slide.ts'

export interface PreviewInput {
  theme: Theme
  layout: Layout
  slideId?: string
  slots: Record<string, Slot>
  overrides?: Record<string, Override>
  /** when true theme.css is left out, so geometry can be compared against the themed render */
  withoutTheme?: boolean
}

/** One slide as a complete, unscaled 1920×1080 document. Used by the gallery and by QA. */
export function renderPreviewDocument(input: PreviewInput): string {
  const { theme, layout } = input
  const slideId = input.slideId ?? 'preview'
  const css = [
    BASE_CSS,
    themeCssVariables(theme.json),
    input.withoutTheme ? '' : theme.css,
    layout.css,
    'html, body { margin: 0; padding: 0; background: #808080; }',
  ].join('\n')
  const body = renderSlideHtml({ layout, slideId, slots: input.slots, overrides: input.overrides })
  return `<!doctype html>
<html lang="${escapeHtml(detectLang(JSON.stringify(input.slots)))}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`${layout.json.name} · ${theme.json.name}`)}</title>
<style>
${css}
</style>
</head>
<body>
${iconSprite()}
${body}
<script>
${FIT_JS}
</script>
</body>
</html>
`
}
