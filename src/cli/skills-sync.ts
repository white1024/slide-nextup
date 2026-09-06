import { join } from 'node:path'
import { PROJECT_ROOT } from '../render/assets.ts'
import { checkSkills, isClean, syncSkills } from '../skills/sync.ts'

const source = join(PROJECT_ROOT, '.agents', 'skills')
const target = join(PROJECT_ROOT, '.claude', 'skills')
const mode = process.argv[2] === 'check' ? 'check' : 'sync'

if (mode === 'sync') {
  const r = syncSkills(source, target)
  console.log(
    `.agents/skills → .claude/skills: copied ${r.copied} files, removed ${r.removed} stray files`,
  )
  process.exit(0)
}

const report = checkSkills(source, target)
for (const f of report.missing) console.log(`✖ .claude/skills is missing ${f}`)
for (const f of report.extra)
  console.log(
    `✖ .claude/skills has an extra ${f} (the canonical copy is in .agents/skills; edit that one)`,
  )
for (const f of report.changed)
  console.log(
    `✖ ${f} differs between the two copies (the canonical copy is in .agents/skills; run pnpm skills:sync)`,
  )
if (report.lockStale)
  console.log(
    '✖ .claude/skills/.sync-lock.json does not match the canonical copies; run pnpm skills:sync',
  )
console.log(
  isClean(report)
    ? 'passed: the skills mirror matches the canonical copies'
    : 'failed: the skills mirror has drifted',
)
process.exit(isClean(report) ? 0 : 1)
