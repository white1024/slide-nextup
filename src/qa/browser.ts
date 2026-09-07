import { type Browser, chromium, type LaunchOptions } from 'playwright'

/**
 * Headless Chromium for QA, previews, galleries and the import gate. When the browser build that
 * this Playwright version wants has not been downloaded, Playwright's own hint says
 * `npx playwright install` (every browser, hundreds of MB); ours downloads Chromium alone.
 */
export async function launchChromium(
  options: LaunchOptions = { headless: true },
): Promise<Browser> {
  try {
    return await chromium.launch(options)
  } catch (err) {
    const message = (err as Error).message ?? String(err)
    if (/Executable doesn't exist/i.test(message)) {
      throw new Error(
        `Chromium is not installed for this Playwright version; run \`pnpm browsers:install\` once (it downloads Chromium only), then try again.\n${message.split('\n')[0]}`,
      )
    }
    throw err
  }
}
