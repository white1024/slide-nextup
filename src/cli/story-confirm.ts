import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadStory } from '../model/story.ts'
import { confirmationPath, writeConfirmation } from '../model/story-confirm.ts'

const target = process.argv[2]
if (!target) {
  console.error(
    'Usage: pnpm story:confirm <story.md>   (run only after the user has explicitly approved the per-slide summary)',
  )
  process.exit(2)
}
const file = resolve(target)
const text = readFileSync(file, 'utf8')
const result = loadStory(text)
if (result.hasErrors || !result.story) {
  for (const d of result.diagnostics) console.log(`✖ ${target}:${d.line}  [${d.rule}] ${d.message}`)
  console.log('a story that fails its checks cannot be confirmed')
  process.exit(1)
}
const c = writeConfirmation(file, text, result.story.slides.length)
console.log(
  `confirmation recorded: ${confirmationPath(target)} (${c.slides} slides, sha256 ${c.sha256.slice(0, 8)})`,
)
