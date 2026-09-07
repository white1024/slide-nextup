import { existsSync, readFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import {
  type Deck,
  normaliseDeck,
  type Override,
  type Slide,
  type Slot,
  transitionFamily,
} from '../model/deck.ts'
import { langOf } from '../model/lang.ts'
import {
  enterFor,
  type Layout,
  layoutRoles,
  loadLayout,
  loadTheme,
  type ThemeJson,
  themeCssVariables,
} from './assets.ts'
import { iconSprite } from './icons.ts'
import { FIT_JS, RUNTIME_JS, VIEWER_CSS } from './runtime.ts'
import { BASE_CSS, escapeHtml, renderSlideHtml } from './slide.ts'
import { DETAILS_ROLES } from './slot-render.js'

export interface RenderDeckOptions {
  /** directory the deck.json lives in; relative image paths resolve against it */
  deckDir: string
  /** directory the HTML will be written to; relative image paths are rewritten against it */
  outDir: string
  /** embed images as data URLs so the HTML is a single file */
  inlineAssets?: boolean
  root?: string
  /** the user directory's themes folder; undefined reads the environment, null turns it off */
  userThemesDir?: string | null
  /** leave theme.css out (QA uses this to prove the theme moves no box) */
  omitThemeCss?: boolean
  /** every step element visible and no transitions (QA and exports); same as opening with ?static=1 */
  staticMode?: boolean
}

export interface RenderDeckResult {
  html: string
  warnings: string[]
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
}

function isRemote(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src)
}

export function resolveAsset(src: string, opts: RenderDeckOptions, warnings: string[]): string {
  if (isRemote(src)) return src
  const abs = isAbsolute(src) ? src : resolve(opts.deckDir, src)
  if (!existsSync(abs)) {
    warnings.push(`image ${src} not found (resolved to ${abs})`)
    return src
  }
  if (opts.inlineAssets) {
    const mime = MIME[extname(abs).toLowerCase()]
    if (!mime) {
      warnings.push(`unrecognised image format ${src}, path kept as is`)
    } else {
      return `data:${mime};base64,${readFileSync(abs).toString('base64')}`
    }
  }
  return relative(opts.outDir, abs).replace(/\\/g, '/')
}

function withResolvedAssets(
  slots: Record<string, Slot>,
  opts: RenderDeckOptions,
  warnings: string[],
): Record<string, Slot> {
  const out: Record<string, Slot> = {}
  for (const [k, slot] of Object.entries(slots)) {
    out[k] = slot.type === 'image' ? { ...slot, src: resolveAsset(slot.src, opts, warnings) } : slot
  }
  return out
}

/** A slide generated against one version of a layout must still match that layout's elements. */
export function checkSlideAgainstLayout(
  slide: Slide,
  layout: Layout,
  overrides: Record<string, Override> = {},
): string[] {
  const problems: string[] = []
  const declared = new Map(layout.json.elements.map((e) => [e.id, e.kind]))
  const inSlide = new Map(slide.elements.map((e) => [e.id, e.kind]))
  for (const [id, kind] of declared) {
    const k = inSlide.get(id)
    if (!k)
      problems.push(`slide \`${slide.id}\` is missing element \`${id}\` of layout \`${layout.id}\``)
    else if (k !== kind)
      problems.push(
        `element \`${id}\` of slide \`${slide.id}\` is ${k}, layout \`${layout.id}\` declares ${kind}`,
      )
  }
  for (const id of inSlide.keys()) {
    if (!declared.has(id))
      problems.push(
        `slide \`${slide.id}\` has element \`${id}\` that layout \`${layout.id}\` does not`,
      )
  }
  for (const [slotId, slot] of Object.entries(slide.slots)) {
    const decl = layout.json.slots[slotId]
    if (!decl)
      problems.push(
        `slot \`${slotId}\` of slide \`${slide.id}\` is not among the slots of layout \`${layout.id}\``,
      )
    else {
      const accepted = Array.isArray(decl.type) ? decl.type : [decl.type]
      if (!accepted.includes(slot.type))
        problems.push(
          `slot \`${slotId}\` of slide \`${slide.id}\` is ${slot.type}, the layout only accepts ${accepted.join(' | ')}`,
        )
    }
  }
  for (const [slotId, decl] of Object.entries(layout.json.slots)) {
    if (decl.required && !(slotId in slide.slots))
      problems.push(
        `slide \`${slide.id}\` is missing required slot \`${slotId}\` of layout \`${layout.id}\``,
      )
  }
  // content expands only behind a role the theme paints as a box (the panel copies that look)
  const roles = layoutRoles(layout)
  const boxed = (id: string) => DETAILS_ROLES.has(roles.get(id) ?? '')
  const notBoxed = (id: string) =>
    `\`${id}\` on slide \`${slide.id}\` carries details but its role is ${roles.get(id) ?? '(none)'}; only the boxed roles ${[...DETAILS_ROLES].join(', ')} can expand`
  for (const [slotId, slot] of Object.entries(slide.slots)) {
    if ('details' in slot && slot.details && !boxed(slotId)) problems.push(notBoxed(slotId))
  }
  for (const [key, override] of Object.entries(overrides)) {
    const [sid, elementId] = key.split('/') as [string, string]
    if (sid === slide.id && override.details && !boxed(elementId))
      problems.push(notBoxed(elementId))
  }
  return problems
}

const EDITOR_JS = readFileSync(new URL('../editor/editor.js', import.meta.url), 'utf8')
const EDITOR_CSS = readFileSync(new URL('../editor/editor.css', import.meta.url), 'utf8')
/** The shared slot renderer, exposed to the editor as `window.__slotRender` (same source as Node uses). */
const SLOT_RENDER_JS = `window.__slotRender = (() => {
${readFileSync(new URL('./slot-render.js', import.meta.url), 'utf8').replace(/^export /gm, '')}
return { escapeHtml, inlineMarkup, chartSvg, renderSlot, slotText, applyTextOverride, effectiveSlot, DETAILS_ROLES };
})();`

/** Page-order helpers shared with the runtime (window.__pages); same source as Node uses. */
const PAGES_JS = `window.__pages = (() => {
${readFileSync(new URL('../model/pages.js', import.meta.url), 'utf8').replace(/^export /gm, '')}
return { effectiveOrder, followsStory, prunePages };
})();`

/** The page transition the player starts with: the deck's own, else the theme's motion.transition, else fade. */
export function resolveTransition(
  deck: Pick<Deck, 'transition'>,
  theme: ThemeJson,
): {
  transition: 'none' | 'fade' | 'push' | 'lift'
  themeTransition: 'none' | 'fade' | 'push' | 'lift'
} {
  const themeTransition = theme.motion?.transition ?? 'fade'
  return {
    transition: deck.transition ? transitionFamily(deck.transition) : themeTransition,
    themeTransition,
  }
}

function modelScript(deck: Deck): string {
  const json = JSON.stringify(normaliseDeck(deck)).replace(/</g, '\\u003c')
  return `<script type="application/json" id="deck-model">${json}</script>`
}

export function renderDeckDocument(deck: Deck, opts: RenderDeckOptions): RenderDeckResult {
  const lookup = { root: opts.root, deckDir: opts.deckDir, userThemesDir: opts.userThemesDir }
  const warnings: string[] = []
  const theme = loadTheme(deck.theme, lookup)
  const layouts = new Map<string, Layout>()
  const problems: string[] = []

  const sections = deck.slides.map((slide) => {
    let layout = layouts.get(slide.layout)
    if (!layout) {
      layout = loadLayout(slide.layout, deck.theme, lookup)
      layouts.set(slide.layout, layout)
    }
    problems.push(...checkSlideAgainstLayout(slide, layout, deck.overrides))
    const steps: Record<string, number> = {}
    const enters: Record<string, string> = {}
    const roles = layoutRoles(layout)
    for (const e of slide.elements) {
      if (e.step === undefined) continue
      steps[e.id] = e.step
      enters[e.id] = e.enter ?? enterFor(theme.json, roles.get(e.id))
    }
    return renderSlideHtml({
      layout,
      slideId: slide.id,
      slots: withResolvedAssets(slide.slots, opts, warnings),
      overrides: deck.overrides,
      steps,
      enters,
      // story order at render time; the player renumbers by the playback order (hidden pages dropped)
      page: { index: deck.slides.indexOf(slide) + 1, count: deck.slides.length },
    })
  })
  if (problems.length > 0) {
    throw new Error(
      `deck does not match its layouts:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    )
  }

  const css = [
    BASE_CSS,
    VIEWER_CSS,
    themeCssVariables(theme.json),
    opts.omitThemeCss ? '' : theme.css,
    ...[...layouts.values()].map((l) => l.css),
    EDITOR_CSS,
  ].join('\n')

  const { transition, themeTransition } = resolveTransition(deck, theme.json)
  const html = `<!doctype html>
<html lang="${escapeHtml(langOf(deck.lang, JSON.stringify([deck.title, deck.slides, deck.overrides])))}"${opts.staticMode ? ' data-static="true"' : ''}${deck.motion === 'off' ? ' data-motion="off"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(deck.title)}</title>
<style>
${css}
</style>
</head>
<body>
${iconSprite()}
<div class="deck-viewport">
<div class="deck-stage"${transition === 'none' ? '' : ` data-transition="${transition}"`} data-transition-default="${themeTransition}">
${sections.join('\n')}
</div>
</div>
${modelScript(deck)}
<script>
${PAGES_JS}
</script>
<script>
${RUNTIME_JS}
</script>
<script>
${FIT_JS}
</script>
<script>
${SLOT_RENDER_JS}
</script>
<script>
${EDITOR_JS}
</script>
</body>
</html>
`
  return { html, warnings }
}

export function defaultOutputPath(deck: Deck, root = process.cwd()): string {
  return resolve(root, 'dist', `${deck.id}.html`)
}

export function deckDirOf(deckFile: string): string {
  return dirname(resolve(deckFile))
}
