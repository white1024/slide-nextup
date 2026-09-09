import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { type Deck, parseDeck, type Slide, stringifyDeck, validateDeck } from '../model/deck.ts'
import { readDesign } from '../model/design.ts'
import { deckIdFromStoryPath, scaffoldDeck } from '../model/scaffold.ts'
import { loadStory } from '../model/story.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'
import {
  type LayoutJson,
  layoutRoles,
  listLayoutIdsFor,
  loadLayout,
  loadTheme,
} from '../render/assets.ts'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const consumed = new Set<number>()
for (const name of ['--theme', '--layouts', '--slide', '--from', '-o', '--id']) {
  const i = args.indexOf(name)
  if (i !== -1) {
    consumed.add(i)
    consumed.add(i + 1)
  }
}
const target = args.find((a, i) => !a.startsWith('-') && !consumed.has(i))

if (!target) {
  console.error(
    [
      'Usage: pnpm deck:scaffold <story.md> [--theme id] [--layouts s1=cover,s4=comparison] [--slide s3] [--from slide.json] [--reset-overrides] [--force] [-o deck.json]',
      '  --layouts        pin the layout of certain slides; the rest are chosen from the story',
      '  --slide          regenerate only this slide, keeping the others from the existing deck.json; manual overrides are always kept',
      '  --from           replace that slide with a single-slide JSON written by the agent (requires --slide)',
      '  --reset-overrides clear the manual overrides of the regenerated slides',
      '  --force          skip the "story confirmed" gate (only when the user explicitly asks for it)',
    ].join('\n'),
  )
  process.exit(2)
}

const storyFile = resolve(target)
const storyText = readFileSync(storyFile, 'utf8')
const loaded = loadStory(storyText)
if (loaded.hasErrors || !loaded.story) {
  for (const d of loaded.diagnostics) console.log(`✖ ${target}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('the story file failed its checks; fix it before scaffolding')
  process.exit(1)
}
const status = confirmationStatus(storyFile, storyText)
if (status.state !== 'confirmed' && !flag('--force')) {
  console.log(`✖ ${describeStatus(status)}`)
  console.log(
    'an unconfirmed story cannot be scaffolded; this is a gate in the workflow, not a reminder',
  )
  process.exit(1)
}

const outFile = resolve(opt('-o') ?? join(dirname(storyFile), 'deck.json'))
let existing: Deck | undefined
if (existsSync(outFile)) {
  const parsed = parseDeck(readFileSync(outFile, 'utf8'))
  if (!parsed.ok) {
    for (const e of parsed.errors) console.log(`✖ ${outFile} ${e.path}  ${e.message}`)
    console.log('the existing deck.json cannot be parsed; fix it or choose another output path')
    process.exit(1)
  }
  existing = parsed.deck
}

// the choice slide-design recorded next to the story (pnpm design:set) is the default theme; a deck
// that is already built keeps its own, because moving one is deck:retheme's job
const design = readDesign(dirname(storyFile))
if (design && !design.ok) {
  for (const e of design.errors) console.log(`✖ ${relative(process.cwd(), design.path)} ${e}`)
  console.log(
    'design.json failed its schema; fix it or record the choice again with pnpm design:set',
  )
  process.exit(1)
}
const chosen = design?.ok ? design.design.theme : undefined
const theme = opt('--theme') ?? existing?.theme ?? chosen ?? 'blue-professional'
if (chosen && chosen !== theme) {
  console.log(
    opt('--theme')
      ? `⚠ --theme ${theme} differs from design.json (${chosen}); record the change with pnpm design:set`
      : `⚠ design.json chooses ${chosen} but deck.json is on ${theme}; keeping the deck's theme (pnpm deck:retheme moves a built deck, --theme overrides for this run)`,
  )
}
// the deck's own folder may carry the theme (decks/<id>/themes/<theme>/), so look from there
const lookup = { deckDir: dirname(outFile) }
try {
  loadTheme(theme, lookup)
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}
const layouts = new Map<string, LayoutJson>()
const roles = new Map<string, Map<string, string>>()
for (const id of listLayoutIdsFor(theme, lookup)) {
  const layout = loadLayout(id, theme, lookup)
  layouts.set(id, layout.json)
  roles.set(id, layoutRoles(layout))
}

const choices: Record<string, string> = {}
for (const pair of (opt('--layouts') ?? '').split(',').filter(Boolean)) {
  const [slideId, layoutId] = pair.split('=')
  if (!slideId || !layoutId) {
    console.log(`✖ --layouts takes the form s1=cover,s2=cards; cannot parse \`${pair}\``)
    process.exit(2)
  }
  choices[slideId] = layoutId
}

const only = opt('--slide')?.split(',').filter(Boolean)
const replacements: Record<string, Slide> = {}
const from = opt('--from')
if (from) {
  if (only?.length !== 1) {
    console.log('✖ --from requires a single --slide <id>')
    process.exit(2)
  }
  const slide = JSON.parse(readFileSync(resolve(from), 'utf8')) as Slide
  if (slide.id !== only[0]) {
    console.log(`✖ the id in ${from} is \`${slide.id}\`, which differs from --slide ${only[0]}`)
    process.exit(2)
  }
  replacements[slide.id] = slide
}

let result: ReturnType<typeof scaffoldDeck>
try {
  result = scaffoldDeck({
    story: loaded.story,
    storyText,
    storyRelativePath: relative(dirname(outFile), storyFile).replace(/\\/g, '/'),
    deckId: opt('--id') ?? existing?.id ?? deckIdFromStoryPath(storyFile),
    theme,
    layouts,
    roles,
    choices,
    existing,
    only,
    replacements,
  })
} catch (err) {
  console.log(`✖ ${(err as Error).message}`)
  process.exit(1)
}

if (flag('--reset-overrides')) {
  const targets = new Set(only ?? loaded.story.slides.map((s) => s.id))
  for (const key of Object.keys(result.deck.overrides)) {
    if (targets.has(key.split('/')[0] as string)) delete result.deck.overrides[key]
  }
}

const validation = validateDeck(result.deck)
if (!validation.ok) {
  for (const e of validation.errors) console.log(`✖ ${e.path}  ${e.message}`)
  console.log(
    'the scaffolded deck failed validation (usually a required slot has no content yet); the file was written for you to fix',
  )
}
writeFileSync(outFile, stringifyDeck(result.deck), 'utf8')

console.log(
  `${result.deck.title}: ${result.deck.slides.length} slides → ${relative(process.cwd(), outFile).replace(/\\/g, '/')}`,
)
for (const [id, layout] of Object.entries(result.chosen)) console.log(`  ${id.padEnd(6)} ${layout}`)
const overrideCount = Object.keys(result.deck.overrides).length
if (existing) {
  console.log(
    `overrides: ${result.kept.length} kept, ${result.orphaned.length} orphaned, ${overrideCount} in total`,
  )
  for (const k of result.orphaned)
    console.log(
      `  ⚠ ${k} points at an element that no longer exists (kept in the file; --reset-overrides clears it)`,
    )
  if (result.overridesDropped.length > 0)
    console.log(
      `  ⚠ ${result.overridesDropped.join(', ')} point at slides no longer in the story; the overrides were removed with the slides`,
    )
  if (result.pagesDropped.length > 0)
    console.log(
      `  ⚠ ${result.pagesDropped.join(', ')} in the page arrangement are no longer in the story, removed`,
    )
  if (result.pagesCleared.length > 0)
    console.log(
      `  page arrangement for ${result.pagesCleared.join(', ')} now matches the story, cleared${result.deck.pages ? '' : ' (pages removed, playback order unchanged)'}`,
    )
  if (result.stepsKept.length > 0 || result.stepsDropped.length > 0) {
    console.log(
      `reveal steps: ${result.stepsKept.length} kept, ${result.stepsDropped.length} dropped`,
    )
    for (const k of result.stepsDropped)
      console.log(`  ⚠ the element of ${k} does not exist in the new layout, step dropped`)
  }
}
if (result.stepsAuto.length > 0) {
  const pages = new Set(result.stepsAuto.map((k) => k.split('/')[0]))
  console.log(
    `reveal steps: ${result.stepsAuto.length} elements sequenced by the story across ${pages.size} slides (evidence and relationship pages build up, map pages only their items, hero, pause, close and intensity 4+ show whole; editable in the editor panel, and your edits are kept when the slide is redone)`,
  )
}
if (result.transitionsAuto.length > 0)
  console.log(
    `page transitions: ${result.transitionsAuto.join(', ')} (from the story: a pause page breathes, a hero page after the first settles; the toolbar's "This page" menu changes it)`,
  )
for (const w of result.warnings) console.log(`⚠ ${w}`)
process.exit(validation.ok ? 0 : 1)
