// Renders brand/icon-source.svg to PNG with headless Chromium, the same way the deck QA
// takes its screenshots. The SVG is the single source; the PNG is what README and GitHub show.
// usage: node tools/render-icon.mjs            -> brand/icon.png (512) and brand/icon-128.png
//        node tools/render-icon.mjs <size>...   -> brand/icon-<size>.png for every size given
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'brand', 'icon-source.svg'), 'utf8')
const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0)
const outputs = sizes.length
  ? sizes.map((s) => [s, `icon-${s}.png`])
  : [
      [512, 'icon.png'],
      [128, 'icon-128.png'],
    ]

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  for (const [size, name] of outputs) {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    )
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } })
    writeFileSync(join(root, 'brand', name), png)
    console.log(`brand/${name} ${size}x${size}`)
  }
} finally {
  await browser.close()
}
