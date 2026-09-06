import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadStory } from '../model/story.ts'
import { confirmationPath, writeConfirmation } from '../model/story-confirm.ts'

const target = process.argv[2]
if (!target) {
  console.error('用法：pnpm story:confirm <story.md>   （只在使用者明確同意逐頁摘要之後執行）')
  process.exit(2)
}
const file = resolve(target)
const text = readFileSync(file, 'utf8')
const result = loadStory(text)
if (result.hasErrors || !result.story) {
  for (const d of result.diagnostics) console.log(`✖ ${target}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('未通過檢查的敘事不能確認')
  process.exit(1)
}
const c = writeConfirmation(file, text, result.story.slides.length)
console.log(
  `已記錄確認：${confirmationPath(target)}（${c.slides} 頁，sha256 ${c.sha256.slice(0, 8)}）`,
)
