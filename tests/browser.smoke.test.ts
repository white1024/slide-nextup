import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const outDir = join(process.cwd(), 'artifacts', 'preflight')
let browser: Browser

beforeAll(async () => {
  mkdirSync(outDir, { recursive: true })
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
})

describe('headless chromium', () => {
  it('renders a fixed 1920x1080 stage and screenshots it', async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
    await page.setContent(
      '<!doctype html><title>stage</title><div id="stage" style="width:1920px;height:1080px;background:#fafafa"></div>',
    )
    const box = await page.locator('#stage').boundingBox()
    expect(box).toMatchObject({ width: 1920, height: 1080 })
    const file = join(outDir, 'browser-smoke.png')
    await page.screenshot({ path: file })
    expect(existsSync(file)).toBe(true)
    expect(statSync(file).size).toBeGreaterThan(0)
    await page.close()
  })
})
