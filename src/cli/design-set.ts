import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseDeck } from '../model/deck.ts'
import { type Design, readDesign, writeDesign } from '../model/design.ts'
import { describeOrigin, findTheme, themeSearchDirs } from '../render/assets.ts'

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const consumed = new Set<number>()
for (const name of ['--theme', '--direction']) {
  const i = args.indexOf(name)
  if (i !== -1) {
    consumed.add(i)
    consumed.add(i + 1)
  }
}
const target = args.find((a, i) => !a.startsWith('-') && !consumed.has(i))
const themeId = opt('--theme')
if (!target || !themeId || args.includes('--help') || args.includes('-h')) {
  console.error(
    [
      'Usage: pnpm design:set <story.md | deck folder> --theme <id> [--direction <name>]',
      "  Records the visual direction the user chose in the deck folder's design.json (theme, the direction's name, when),",
      '  after checking that the theme pack can be found from that folder (deck folder, workspace, user directory, package).',
      '  deck:scaffold takes its default theme from design.json; deck:validate reports a deck that sits on another theme.',
    ].join('\n'),
  )
  process.exit(2)
}

const given = resolve(target)
if (!existsSync(given)) {
  console.log(`✖ ${target} does not exist; point at the deck's story.md or at its folder`)
  process.exit(1)
}
const deckDir = statSync(given).isDirectory() ? given : dirname(given)
const rel = (p: string) => relative(process.cwd(), p).replace(/\\/g, '/')

const found = findTheme(themeId, { deckDir })
if (!found) {
  const searched = themeSearchDirs({ deckDir }).map((s) => join(s.dir, themeId))
  console.log(`✖ theme \`${themeId}\` not found; searched: ${searched.join(', ')}`)
  console.log(
    '  port or import the theme pack first (pnpm theme:import), or check the id with pnpm layouts; nothing written',
  )
  process.exit(1)
}

const previous = readDesign(deckDir)
if (previous && !previous.ok) {
  for (const e of previous.errors) console.log(`⚠ ${rel(previous.path)} ${e}`)
  console.log('  the existing design.json does not match its schema; it is replaced')
}

const design: Design = { theme: themeId, chosenAt: new Date().toISOString() }
const direction = opt('--direction')
if (direction) design.direction = direction
const path = writeDesign(deckDir, design)
const was =
  previous?.ok && previous.design.theme !== themeId ? ` (was ${previous.design.theme})` : ''
console.log(`theme ${themeId} (${describeOrigin(found.origin)}) → ${rel(path)}${was}`)

// a deck that is already built keeps its own theme; say how to move it
const deckFile = join(deckDir, 'deck.json')
if (existsSync(deckFile)) {
  const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
  if (parsed.ok && parsed.deck.theme !== themeId) {
    console.log(
      `⚠ ${rel(deckFile)} is on ${parsed.deck.theme}; pnpm deck:retheme ${rel(deckFile)} --theme ${themeId} moves it (deck:scaffold keeps a built deck's theme)`,
    )
  }
} else {
  console.log('next: pnpm deck:scaffold <story.md> picks this theme up without --theme')
}
process.exit(0)
