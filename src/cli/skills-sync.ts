import { join } from 'node:path'
import { PROJECT_ROOT } from '../render/assets.ts'
import { checkSkills, isClean, syncSkills } from '../skills/sync.ts'

const source = join(PROJECT_ROOT, '.agents', 'skills')
const target = join(PROJECT_ROOT, '.claude', 'skills')
const mode = process.argv[2] === 'check' ? 'check' : 'sync'

if (mode === 'sync') {
  const r = syncSkills(source, target)
  console.log(
    `.agents/skills → .claude/skills：複製 ${r.copied} 個檔案，移除 ${r.removed} 個多餘檔案`,
  )
  process.exit(0)
}

const report = checkSkills(source, target)
for (const f of report.missing) console.log(`✖ .claude/skills 缺少 ${f}`)
for (const f of report.extra)
  console.log(`✖ .claude/skills 多出 ${f}（正本在 .agents/skills，請改那邊）`)
for (const f of report.changed)
  console.log(`✖ ${f} 兩邊內容不同（正本在 .agents/skills，跑 pnpm skills:sync）`)
if (report.lockStale)
  console.log('✖ .claude/skills/.sync-lock.json 與正本不符，跑 pnpm skills:sync')
console.log(isClean(report) ? '通過：skills 副本與正本一致' : '未通過：skills 副本已漂移')
process.exit(isClean(report) ? 0 : 1)
