import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readVersion(pkgDir: string): string {
  const file = join(root, 'node_modules', pkgDir, 'package.json')
  if (!existsSync(file)) return '(not installed)'
  return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version
}

function shellVersion(cmd: string): string {
  try {
    return execSync(`${cmd} --version`, { encoding: 'utf8' }).trim()
  } catch {
    return '(not found)'
  }
}

const rows: Array<[string, string]> = [
  ['node', process.version],
  ['platform', `${process.platform} ${process.arch}`],
  ['pnpm', shellVersion('pnpm')],
  ['typescript', readVersion('typescript')],
  ['vitest', readVersion('vitest')],
  ['biome', readVersion('@biomejs/biome')],
  ['playwright', readVersion('playwright')],
]

let chromiumStatus = 'skipped'
try {
  const outDir = join(root, 'artifacts', 'preflight')
  mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await page.setContent(
    '<!doctype html><title>preflight</title><body style="margin:0;background:#123;color:#fff;font:64px sans-serif;display:grid;place-items:center;height:100vh">slide-nextup preflight</body>',
  )
  const shot = join(outDir, 'chromium-smoke.png')
  await page.screenshot({ path: shot })
  rows.push(['chromium', `${browser.version()} @ ${chromium.executablePath()}`])
  chromiumStatus = `ok, screenshot: ${shot}`
  await browser.close()
} catch (err) {
  chromiumStatus = `FAILED: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`
}
rows.push(['chromium smoke', chromiumStatus])

const width = Math.max(...rows.map(([k]) => k.length))
for (const [k, v] of rows) console.log(`${k.padEnd(width)}  ${v}`)

if (chromiumStatus.startsWith('FAILED')) process.exit(1)
