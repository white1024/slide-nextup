import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Diagnostic, loadStory, type Story } from '../model/story.ts'
import { confirmationStatus, describeStatus } from '../model/story-confirm.ts'

function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    width +=
      cp >= 0x1100 &&
      (cp <= 0x115f ||
        (cp >= 0x2e80 && cp <= 0xa4cf) ||
        (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xfe30 && cp <= 0xfe4f) ||
        (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6) ||
        cp >= 0x20000)
        ? 2
        : 1
  }
  return width
}

function pad(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

function renderTable(story: Story): string {
  const header = ['#', 'id', 'role', 'int', 'relation', 'title']
  const rows = story.slides.map((s, i) => [
    String(i + 1),
    s.id,
    s.scene_role,
    String(s.intensity),
    s.content_relation,
    s.title,
  ])
  const widths = header.map((h, col) =>
    Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[col] ?? ''))),
  )
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i] ?? 0)).join('  ')
  return [line(header), ...rows.map(line)].join('\n')
}

const BARS = ['', '▁', '▃', '▅', '▆', '█']

function renderRhythm(story: Story): string {
  return story.slides.map((s) => BARS[s.intensity] ?? '?').join('')
}

function renderDiagnostic(file: string, d: Diagnostic): string {
  const mark = d.severity === 'error' ? '✖' : '⚠'
  return `${mark} ${file}:${d.line}  [${d.rule}] ${d.message}`
}

const args = process.argv.slice(2)
const requireConfirmed = args.includes('--require-confirmed')
const target = args.find((a) => !a.startsWith('--'))
if (!target) {
  console.error('Usage: pnpm story:check <story.md> [--require-confirmed]')
  process.exit(2)
}
const file = resolve(target)
const text = readFileSync(file, 'utf8')
const result = loadStory(text)

if (result.story) {
  const m = result.story.meta
  console.log(`${m.title} (${m.duration_minutes} min · ${m.density} · ${m.narrative_pattern})`)
  console.log(`core message: ${m.core_message}`)
  console.log('')
  console.log(renderTable(result.story))
  console.log('')
  console.log(`rhythm  ${renderRhythm(result.story)}`)
  console.log('')
}

for (const d of result.diagnostics) console.log(renderDiagnostic(target, d))

const errors = result.diagnostics.filter((d) => d.severity === 'error').length
const warnings = result.diagnostics.length - errors
console.log(`${errors === 0 ? 'passed' : 'failed'}: ${errors} errors, ${warnings} warnings`)
if (result.hasErrors) process.exit(1)

if (requireConfirmed) {
  const status = confirmationStatus(file, text)
  console.log(`${status.state === 'confirmed' ? '✓' : '✖'} ${describeStatus(status)}`)
  process.exit(status.state === 'confirmed' ? 0 : 1)
}
