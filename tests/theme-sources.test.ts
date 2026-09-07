import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Browser } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDevServer, type DevServer } from '../src/dev/server.ts'
import { type Deck, parseDeck, stringifyDeck } from '../src/model/deck.ts'
import { rethemeDeck } from '../src/model/retheme.ts'
import { runThemeQa, themeQaProblems } from '../src/qa/theme-qa.ts'
import {
  findTheme,
  listLayoutIdsFor,
  listThemeIds,
  listThemes,
  loadLayout,
  loadTheme,
  PROJECT_ROOT,
  themeSearchDirs,
  userThemesDir,
} from '../src/render/assets.ts'
import { renderDeckDocument } from '../src/render/deck.ts'

// A theme can live in three places, and the nearest one wins: the deck's own folder, the user's
// directory, then the repo. These tests build both external places in a temp dir from copies of
// ink-paper so that every other rule (lint, QA) still holds for them.
const REPO = { userThemesDir: null }
let tmp: string
let userDir: string
let deckDir: string

function copyTheme(from: string, to: string, patch: (json: Record<string, unknown>) => void) {
  mkdirSync(to, { recursive: true })
  const json = JSON.parse(readFileSync(join(from, 'theme.json'), 'utf8')) as Record<string, unknown>
  patch(json)
  writeFileSync(join(to, 'theme.json'), `${JSON.stringify(json, null, 2)}\n`)
  writeFileSync(join(to, 'theme.css'), readFileSync(join(from, 'theme.css'), 'utf8'))
}

function setAccent(json: Record<string, unknown>, value: string) {
  const accent = (json.colors as Record<string, { value: string }>).accent
  if (!accent) throw new Error('theme has no accent colour')
  accent.value = value
}

function sample(): Deck {
  const r = parseDeck(readFileSync(resolve('examples/deck.sample.json'), 'utf8'))
  if (!r.ok) throw new Error('sample deck does not parse')
  return r.deck
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'slide-themes-'))
  userDir = join(tmp, 'home', 'themes')
  deckDir = join(tmp, 'deck')
  const inkPaper = join(PROJECT_ROOT, 'themes', 'ink-paper')
  // the user directory: a new theme id with one layout of its own
  copyTheme(inkPaper, join(userDir, 'ext-blue'), (j) => {
    j.id = 'ext-blue'
    j.name = '外部主題'
    setAccent(j, '#0000ee')
  })
  cpSync(join(PROJECT_ROOT, 'layouts', 'cover'), join(userDir, 'ext-blue', 'layouts', 'cover'), {
    recursive: true,
  })
  writeFileSync(
    join(userDir, 'ext-blue', 'layouts', 'cover', 'layout.css'),
    `/* ext-blue cover */\n${readFileSync(join(PROJECT_ROOT, 'layouts', 'cover', 'layout.css'), 'utf8')}`,
  )
  // the deck folder: a copy of ink-paper that shadows the repo's under the same id
  copyTheme(inkPaper, join(deckDir, 'themes', 'ink-paper'), (j) => {
    setAccent(j, '#123456')
  })
  writeFileSync(join(deckDir, 'deck.json'), stringifyDeck(sample()))
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('theme lookup order', () => {
  it('searches the deck folder, then the user directory, then the repo', () => {
    const dirs = themeSearchDirs({ deckDir, userThemesDir: userDir })
    expect(dirs.map((d) => d.origin)).toEqual(['deck', 'user', 'repo'])
    expect(dirs[0]?.dir).toBe(join(deckDir, 'themes'))
    expect(dirs[1]?.dir).toBe(userDir)
    expect(dirs[2]?.dir).toBe(join(PROJECT_ROOT, 'themes'))
    expect(themeSearchDirs(REPO).map((d) => d.origin)).toEqual(['repo'])
    expect(themeSearchDirs('/elsewhere').map((d) => d.dir)).toContain(join('/elsewhere', 'themes'))
  })

  it('reads the user directory from SLIDE_NEXTUP_HOME, else ~/.slide-nextup', () => {
    expect(userThemesDir({ SLIDE_NEXTUP_HOME: '/srv/nextup' })).toBe(
      join(resolve('/srv/nextup'), 'themes'),
    )
    expect(userThemesDir({})).toMatch(/[\\/]\.slide-nextup[\\/]themes$/)
  })

  it('lists every theme once, the nearest copy winning, and says where each came from', () => {
    const themes = listThemes({ deckDir, userThemesDir: userDir })
    const byId = new Map(themes.map((t) => [t.id, t]))
    expect(byId.get('ext-blue')).toMatchObject({ origin: 'user', dir: join(userDir, 'ext-blue') })
    expect(byId.get('ink-paper')).toMatchObject({
      origin: 'deck',
      dir: join(deckDir, 'themes', 'ink-paper'),
    })
    expect(byId.get('warm-keynote')?.origin).toBe('repo')
    expect(themes.filter((t) => t.id === 'ink-paper')).toHaveLength(1)
    expect(listThemeIds({ deckDir, userThemesDir: userDir })).toContain('ext-blue')
    expect(listThemeIds(REPO)).not.toContain('ext-blue')
    expect(listThemeIds(REPO)).toEqual([...listThemeIds(REPO)].sort())
  })

  it('a theme in the deck folder shadows the repo copy with the same id', () => {
    expect(
      loadTheme('ink-paper', { deckDir, userThemesDir: userDir }).json.colors.accent?.value,
    ).toBe('#123456')
    expect(loadTheme('ink-paper', REPO).json.colors.accent?.value).not.toBe('#123456')
    expect(findTheme('ink-paper', { deckDir, userThemesDir: null })?.origin).toBe('deck')
    expect(findTheme('ink-paper', REPO)?.origin).toBe('repo')
  })

  it('a user-directory theme brings its own layouts and falls back to the generic library', () => {
    const lookup = { userThemesDir: userDir }
    expect(loadTheme('ext-blue', lookup).json.colors.accent?.value).toBe('#0000ee')
    const cover = loadLayout('cover', 'ext-blue', lookup)
    expect(cover.dir).toBe(join(userDir, 'ext-blue', 'layouts', 'cover'))
    expect(cover.css.startsWith('/* ext-blue cover */')).toBe(true)
    expect(loadLayout('cards', 'ext-blue', lookup).dir).toBe(join(PROJECT_ROOT, 'layouts', 'cards'))
    expect(listLayoutIdsFor('ext-blue', lookup)).toEqual(listLayoutIdsFor(undefined, REPO))
  })

  it('names every folder it searched when a theme is missing', () => {
    expect(() => loadTheme('nope', { deckDir, userThemesDir: userDir })).toThrow(
      new RegExp(
        [
          join(deckDir, 'themes', 'nope'),
          join(userDir, 'nope'),
          join(PROJECT_ROOT, 'themes', 'nope'),
        ]
          .map((p) => p.replace(/[\\/.]/g, '\\$&'))
          .join('.*'),
      ),
    )
    expect(() => loadLayout('nope', 'ext-blue', { userThemesDir: userDir })).toThrow(
      /searched: .*ext-blue.*layouts.*nope.*, .*layouts.*nope/,
    )
  })
})

describe('external themes flow through render, retheme, QA and the dev server', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
  })
  afterAll(async () => {
    await browser?.close()
  })

  it('renders with the deck-folder theme and with a user-directory theme', () => {
    const deck = sample()
    const local = renderDeckDocument(deck, { deckDir, outDir: deckDir, userThemesDir: null })
    expect(local.html).toContain('--color-accent: #123456;')
    const repo = renderDeckDocument(deck, {
      deckDir: join(tmp, 'elsewhere'),
      outDir: tmp,
      userThemesDir: null,
    })
    expect(repo.html).not.toContain('--color-accent: #123456;')
    const ext = { ...deck, theme: 'ext-blue' }
    const external = renderDeckDocument(ext, { deckDir: tmp, outDir: tmp, userThemesDir: userDir })
    expect(external.html).toContain('--color-accent: #0000ee;')
    expect(external.html).toContain('/* ext-blue cover */')
    expect(() =>
      renderDeckDocument(ext, { deckDir: tmp, outDir: tmp, userThemesDir: null }),
    ).toThrow(/theme `ext-blue` not found; searched: /)
  })

  it('rethemes onto a user-directory theme and marks its own layout as a pack layout', () => {
    const { deck, report } = rethemeDeck(sample(), 'ext-blue', { userThemesDir: userDir })
    expect(deck.theme).toBe('ext-blue')
    expect(report.layoutSource.s1).toBe('pack')
    expect(report.layoutSource.s2).toBe('global')
  })

  it('theme QA runs a user-directory theme on its own sample', async () => {
    const report = await runThemeQa('ext-blue', {
      userThemesDir: userDir,
      browser,
      only: ['cover', 'closing'],
    })
    expect(report.slides.map((s) => s.id)).toEqual(['cover', 'closing'])
    expect(themeQaProblems(report)).toEqual([])
  }, 60_000)

  it('the dev server serves a deck whose theme lives in its own folder', async () => {
    let server: DevServer | undefined
    try {
      server = await createDevServer({ deckFile: join(deckDir, 'deck.json'), userThemesDir: null })
      const html = await (await fetch(`${server.url}/`)).text()
      expect(html).toContain('--color-accent: #123456;')
    } finally {
      await server?.close()
    }
  }, 30_000)
})

// The workspace (the folder `init` made, or wherever a command runs) is a fourth place, between
// the deck folder and the user directory; when the workspace is the repo itself its themes/ is
// the repo entry and is not listed twice.
describe('workspace themes', () => {
  it('searches the workspace themes/ after the deck folder and before the user directory', () => {
    const ws = mkdtempSync(join(tmpdir(), 'slide-ws-'))
    copyTheme(join(PROJECT_ROOT, 'themes', 'ink-paper'), join(ws, 'themes', 'ws-red'), (j) => {
      j.id = 'ws-red'
      j.name = 'Workspace theme'
      setAccent(j, '#c02020')
    })
    const dirs = themeSearchDirs({ deckDir, workspaceDir: ws, userThemesDir: userDir })
    expect(dirs.map((d) => d.origin)).toEqual(['deck', 'workspace', 'user', 'repo'])
    expect(findTheme('ws-red', { workspaceDir: ws, userThemesDir: null })).toMatchObject({
      origin: 'workspace',
      dir: join(ws, 'themes', 'ws-red'),
    })
    expect(loadTheme('ws-red', { workspaceDir: ws, userThemesDir: null }).json.id).toBe('ws-red')
    expect(listThemeIds({ workspaceDir: ws, userThemesDir: null })).toContain('ws-red')
    // the same id in the user directory loses to the workspace copy
    copyTheme(join(PROJECT_ROOT, 'themes', 'ink-paper'), join(userDir, 'ws-red'), (j) => {
      j.id = 'ws-red'
      setAccent(j, '#2020c0')
    })
    expect(findTheme('ws-red', { workspaceDir: ws, userThemesDir: userDir })?.origin).toBe(
      'workspace',
    )
    // the repo as workspace, and no workspace at all
    expect(
      themeSearchDirs({ workspaceDir: PROJECT_ROOT, userThemesDir: null }).map((d) => d.origin),
    ).toEqual(['repo'])
    expect(
      themeSearchDirs({ workspaceDir: null, userThemesDir: null }).map((d) => d.origin),
    ).toEqual(['repo'])
    rmSync(ws, { recursive: true, force: true })
  })
})

// A lookup that names another root is a self-contained tree (the QA tests copy the repo into a
// temp folder and patch a theme there): the working directory is not implied as its workspace,
// or the real theme would shadow the patched copy.
describe('workspace themes and another root', () => {
  it('does not imply the working directory for a lookup with its own root', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'slide-root-'))
    expect(themeSearchDirs({ root: elsewhere, userThemesDir: null }).map((d) => d.origin)).toEqual([
      'repo',
    ])
    expect(themeSearchDirs({ root: elsewhere, userThemesDir: null })[0]?.dir).toBe(
      join(elsewhere, 'themes'),
    )
    expect(
      themeSearchDirs({ root: elsewhere, workspaceDir: elsewhere, userThemesDir: null }).map(
        (d) => d.origin,
      ),
    ).toEqual(['repo'])
    rmSync(elsewhere, { recursive: true, force: true })
  })
})
