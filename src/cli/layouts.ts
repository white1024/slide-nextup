import {
  deckDirOfPath,
  describeOrigin,
  listLayoutIdsFor,
  listThemes,
  loadLayout,
} from '../render/assets.ts'

const args = process.argv.slice(2)
const json = args.includes('--json')
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
// --deck <deck.json|dir>: also look in that deck's own themes/ folder
const deckIndex = args.indexOf('--deck')
const lookup = { deckDir: deckIndex === -1 ? undefined : deckDirOfPath(args[deckIndex + 1] ?? '.') }
const themes = listThemes(lookup)
const layouts = listLayoutIdsFor(themeId, lookup).map((id) => loadLayout(id, themeId, lookup).json)

if (json) {
  console.log(
    JSON.stringify(
      { themes: themes.map((t) => t.id), themeSources: themes, theme: themeId ?? null, layouts },
      null,
      2,
    ),
  )
  process.exit(0)
}

console.log(
  `themes: ${themes.map((t) => (t.origin === 'repo' ? t.id : `${t.id} (${describeOrigin(t.origin)})`)).join(', ')}`,
)
if (themeId)
  console.log(
    `layouts for theme ${themeId}: the theme's own layouts override generic layouts of the same id`,
  )
else
  console.log(
    'add --theme <id> to see the layouts a theme brings; --deck <deck.json> also searches the deck folder for themes',
  )
console.log(
  'character counts in hints are full-width units: a CJK glyph counts 1, a Latin letter or digit ½',
)
console.log('')
for (const l of layouts) {
  console.log(`${l.id} — ${l.name}`)
  console.log(`  ${l.description}`)
  console.log(
    `  scene_roles: ${l.scene_roles.join(', ')}   content_relations: ${l.content_relations.join(', ')}`,
  )
  console.log(`  density: ≤${l.density.max_chars} chars, ≤${l.density.max_elements} elements`)
  for (const [slotId, s] of Object.entries(l.slots)) {
    const types = Array.isArray(s.type) ? s.type.join('|') : s.type
    console.log(
      `  slot ${slotId.padEnd(12)} ${types.padEnd(12)} ${s.required ? 'required' : 'optional'}${s.hint ? `  ${s.hint}` : ''}`,
    )
  }
  console.log('')
}
