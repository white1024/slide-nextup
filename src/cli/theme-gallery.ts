import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import {
  type Layout,
  type Lookup,
  listThemeLayoutIds,
  listThemes,
  loadLayout,
  loadTheme,
  type Theme,
} from '../render/assets.ts'
import { renderPreviewDocument } from '../render/preview.ts'
import { refusePathArgs } from './args.ts'

/**
 * Every theme pack with the layouts it designed, as real pages: one self-contained HTML per
 * theme × layout (the same document QA measures, rendered from the layout's own sample), one page
 * per theme that shows them as live, scaled frames, and a short index of the packs. No browser
 * runs and no picture is written; the gallery is HTML all the way down, so it can be committed and
 * served as it is. The generic library is left out: a pack is its own layouts.
 */
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    [
      'Usage: pnpm theme:gallery [--theme <id>]… [-o dir] [--check]',
      '  Renders every layout a theme pack ships (its own layouts, not the generic library) from its sample into',
      '  <dir>/<theme>/<layout>.html, writes <dir>/<theme>/index.html (live frames that open full size) and <dir>/index.html',
      '  (one entry per pack). Without --theme the packs of the repo and the workspace are rendered; --theme (repeatable)',
      '  picks packs, the user directory included. The default dir is docs/gallery, the folder GitHub Pages serves.',
      '  --check renders to memory and compares: a missing, stale or stray page fails (exit 1), nothing is written.',
    ].join('\n'),
  )
  process.exit(0)
}
const themeIds: string[] = []
let outDir = resolve('docs', 'gallery')
let check = false
for (let i = 0; i < args.length; i++) {
  const a = args[i] as string
  if (a === '--theme') themeIds.push(args[++i] ?? '')
  else if (a === '-o') outDir = resolve(args[++i] ?? outDir)
  else if (a === '--check') check = true
  else {
    console.error(`unknown argument \`${a}\`; see --help`)
    process.exit(2)
  }
}
// the shipped and workspace packs make the committed gallery; a named pack may also be the user's
const lookup: Lookup = themeIds.length > 0 ? {} : { userThemesDir: null }
refusePathArgs(
  themeIds,
  'theme:gallery',
  'Use `--theme <id>` for the pack.',
  listThemes(lookup).map((t) => t.id),
)
const ids = themeIds.length > 0 ? themeIds : listThemes(lookup).map((t) => t.id)

interface Entry {
  id: string
  name: string
  description: string
  file: string
}
interface Section {
  theme: Theme
  entries: Entry[]
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// the cover opens a pack's page and the closing ends it; everything else reads in id order
const rank = (id: string) => (id === 'cover' ? 0 : id === 'closing' ? 2 : 1)
const pages = new Map<string, string>()
const sections: Section[] = []
for (const id of ids) {
  const theme = loadTheme(id, lookup)
  const entries: Entry[] = []
  for (const layoutId of listThemeLayoutIds(id, lookup)) {
    const layout: Layout = loadLayout(layoutId, id, lookup)
    const file = `${layoutId}.html`
    pages.set(
      `${id}/${file}`,
      renderPreviewDocument({ theme, layout, slideId: layoutId, slots: layout.json.sample }),
    )
    entries.push({
      id: layoutId,
      name: layout.json.name,
      description: layout.json.description,
      file,
    })
  }
  entries.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
  sections.push({ theme, entries })
}

const STYLE = `<style>
  :root { --bg: #f6f5fa; --panel: #ffffff; --ink: #1a1930; --muted: #767490; --rule: #dcdae8; --accent: #4f47c8; }
  @media (prefers-color-scheme: dark) { :root { --bg: #121120; --panel: #1a1929; --ink: #ecebf6; --muted: #8b899f; --rule: #2a2940; --accent: #9c95ff; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px clamp(16px, 4vw, 48px) 64px; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 0 0 6px; }
  a { color: var(--accent); }
  code { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: 0.85em; color: var(--muted); font-weight: 400; }
  .lead, .about, .count { color: var(--muted); margin: 0 0 8px; max-width: 80ch; }
  .count { font-size: 13px; margin-bottom: 16px; }
  .crumbs { font-size: 14px; margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 24px 20px; }
  figure { margin: 0; }
  .frame { --s: 0.25; position: relative; aspect-ratio: 16 / 9; overflow: hidden; border: 1px solid var(--rule); border-radius: 6px; background: #808080; }
  .frame iframe { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; border: 0; transform-origin: 0 0; transform: scale(var(--s)); pointer-events: none; }
  .frame .open { position: absolute; inset: 0; }
  .frame:hover { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); }
  figcaption { margin-top: 8px; font-size: 13px; line-height: 1.45; color: var(--muted); }
  figcaption b { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-weight: 600; color: var(--ink); }
  figcaption a { color: inherit; text-decoration: none; }
  figcaption a:hover { text-decoration: underline; }
  .desc { display: block; margin-top: 2px; }
  .packs { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 28px 24px; margin-top: 24px; }
  .pack h2 { margin-top: 12px; }
</style>`
const SCRIPT = `<script>
  const frames = document.querySelectorAll('.frame')
  const fit = () => { for (const f of frames) f.style.setProperty('--s', String(f.clientWidth / 1920)) }
  new ResizeObserver(fit).observe(document.body)
  fit()
</script>`
const head = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="color-scheme" content="light dark">
${STYLE}
</head>
<body>`
const frame = (src: string, title: string, label: string) =>
  `<div class="frame"><iframe src="${src}" loading="lazy" tabindex="-1" title="${esc(title)}"></iframe><a class="open" href="${src}" target="_blank" rel="noopener" aria-label="${esc(label)}"></a></div>`

const figure = (e: Entry) => `    <figure>
      ${frame(e.file, e.name, `open ${e.id} full size`)}
      <figcaption><b>${esc(e.id)}</b> <span class="desc">${esc(e.description)}</span></figcaption>
    </figure>`
const themePage = ({ theme, entries }: Section) => `${head(`${theme.json.name} · layouts`)}
<p class="crumbs"><a href="../index.html">Themes</a> › ${esc(theme.json.name)}</p>
<h1>${esc(theme.json.name)} <code>${esc(theme.id)}</code></h1>
<p class="about">${esc(theme.json.description)}</p>
<p class="count">${entries.length} layouts, each rendered with its own sample content; click one to open it full size.</p>
<div class="grid">
${entries.map(figure).join('\n')}
</div>
${SCRIPT}
</body>
</html>
`
const total = sections.reduce((n, s) => n + s.entries.length, 0)
const packCard = ({ theme, entries }: Section) => {
  const first = entries[0] as Entry
  return `  <figure class="pack">
    ${frame(`${theme.id}/${first.file}`, theme.json.name, `open the ${theme.json.name} cover full size`)}
    <h2><a href="${esc(theme.id)}/index.html">${esc(theme.json.name)}</a> <code>${esc(theme.id)}</code></h2>
    <p class="about">${esc(theme.json.description)}</p>
    <p class="count"><a href="${esc(theme.id)}/index.html">${entries.length} layouts →</a></p>
  </figure>`
}
const index = `${head('slide-nextup themes')}
<h1>Themes</h1>
<p class="lead">${sections.length} theme packs, ${total} layouts. Every frame is a real page rendered from the layout's sample content, the same document the quality checks measure. Open a pack to see each of its layouts.</p>
<div class="packs">
${sections.map(packCard).join('\n')}
</div>
${SCRIPT}
</body>
</html>
`
for (const s of sections) pages.set(`${s.theme.id}/index.html`, themePage(s))
pages.set('index.html', index)

const rel = (p: string) => relative(process.cwd(), p).split('\\').join('/')
const existing = (dir: string, prefix = ''): string[] => {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = prefix ? `${prefix}/${d.name}` : d.name
    if (d.isDirectory()) out.push(...existing(join(dir, d.name), p))
    else if (d.name.endsWith('.html')) out.push(p)
  }
  return out
}
const lf = (s: string) => s.replace(/\r\n/g, '\n')

if (check) {
  const onDisk = new Set(existing(outDir))
  const problems: string[] = []
  for (const [file, html] of pages) {
    if (!onDisk.has(file)) problems.push(`missing  ${file}`)
    else if (lf(readFileSync(join(outDir, file), 'utf8')) !== html)
      problems.push(`stale    ${file}`)
  }
  for (const file of onDisk) if (!pages.has(file)) problems.push(`stray    ${file}`)
  if (problems.length > 0) {
    console.log(`✖ ${rel(outDir)} is behind the themes and layouts (${problems.length}):`)
    for (const p of problems.slice(0, 40)) console.log(`  ${p}`)
    if (problems.length > 40) console.log(`  … ${problems.length - 40} more`)
    console.log('run pnpm theme:gallery and commit the result')
    process.exit(1)
  }
  console.log(`✓ ${rel(outDir)} is current: ${total} layouts for ${sections.length} themes`)
  process.exit(0)
}

for (const file of existing(outDir)) {
  if (!pages.has(file)) rmSync(join(outDir, file))
}
for (const [file, html] of pages) {
  const abs = join(outDir, file)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, html, 'utf8')
}
// folders left empty by a removed theme go too
for (const d of readdirSync(outDir, { withFileTypes: true })) {
  if (d.isDirectory() && readdirSync(join(outDir, d.name)).length === 0)
    rmSync(join(outDir, d.name), { recursive: true })
}
for (const s of sections) {
  console.log(
    `✓ ${s.theme.id.padEnd(18)} ${String(s.entries.length).padStart(2)} layouts → ${rel(join(outDir, s.theme.id, 'index.html'))}`,
  )
}
console.log(`${total} layouts for ${sections.length} themes → ${rel(join(outDir, 'index.html'))}`)
