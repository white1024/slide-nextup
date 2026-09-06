import { listLayoutIdsFor, listThemeIds, loadLayout } from '../render/assets.ts'

const args = process.argv.slice(2)
const json = args.includes('--json')
const themeIndex = args.indexOf('--theme')
const themeId = themeIndex === -1 ? undefined : args[themeIndex + 1]
const layouts = listLayoutIdsFor(themeId).map((id) => loadLayout(id, themeId).json)

if (json) {
  console.log(JSON.stringify({ themes: listThemeIds(), theme: themeId ?? null, layouts }, null, 2))
  process.exit(0)
}

console.log(`主題：${listThemeIds().join('、')}`)
if (themeId) console.log(`版型清單依主題 ${themeId}：主題自帶的版型會蓋掉同名的通用版型`)
else console.log('加 --theme <id> 可看該主題自帶的版型')
console.log('')
for (const l of layouts) {
  console.log(`${l.id} — ${l.name}`)
  console.log(`  ${l.description}`)
  console.log(
    `  scene_roles: ${l.scene_roles.join(', ')}   content_relations: ${l.content_relations.join(', ')}`,
  )
  console.log(`  density: ≤${l.density.max_chars} 字、≤${l.density.max_elements} 元件`)
  for (const [slotId, s] of Object.entries(l.slots)) {
    const types = Array.isArray(s.type) ? s.type.join('|') : s.type
    console.log(
      `  slot ${slotId.padEnd(12)} ${types.padEnd(12)} ${s.required ? '必要' : '選填'}${s.hint ? `  ${s.hint}` : ''}`,
    )
  }
  console.log('')
}
