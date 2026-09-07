import { createHash } from 'node:crypto'
import {
  existsSync,
  type FSWatcher,
  readFileSync,
  renameSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import {
  type Deck,
  type Element,
  ENTERS,
  type Enter,
  parseDeck,
  stringifyDeck,
  TRANSITIONS,
  type Transition,
  validateDeck,
} from '../model/deck.ts'
import { PROJECT_ROOT, userThemesDir } from '../render/assets.ts'
import { renderDeckDocument } from '../render/deck.ts'

const DEV_CLIENT_JS = readFileSync(new URL('./client.js', import.meta.url), 'utf8')

export interface DevServerOptions {
  deckFile: string
  port?: number
  host?: string
  root?: string
  /** the user directory's themes folder; undefined reads the environment, null turns it off */
  userThemesDir?: string | null
}

export interface DevServer {
  url: string
  port: number
  close: () => Promise<void>
  /** hash of the overrides currently on disk; exposed for tests */
  overridesHash: () => string
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * JSON with object keys sorted at every level. The editor builds an override in
 * edit order ({style, x, y}) while normaliseDeck writes it as {x, y, style}; the
 * conflict check must not tell those two apart.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const body = Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
    return `{${body.join(',')}}`
  }
  return JSON.stringify(value)
}

/** What the editor may write and the conflict check therefore covers: overrides and page-level overrides. */
function editable(deck: Deck): unknown {
  return {
    overrides: deck.overrides,
    pages: deck.pages ?? null,
    motion: deck.motion ?? null,
    transition: deck.transition ?? null,
  }
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function readBody(req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function send(
  res: ServerResponse,
  status: number,
  body: string | Buffer,
  type: string,
  extra: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    ...extra,
  })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8')
}

/**
 * Same-origin guard for mutating requests. A browser always sends Origin
 * and/or Sec-Fetch-Site; a DNS-rebinding page would carry a foreign Host,
 * Origin or a cross-site fetch flag. Header-less requests come from local
 * tools and are allowed.
 */
export function requestAllowed(req: IncomingMessage, expectedHost: string): boolean {
  const host = req.headers.host
  if (host !== expectedHost) return false
  const origin = req.headers.origin
  if (origin !== undefined && origin !== `http://${expectedHost}`) return false
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false
  return true
}

/** Resolve a URL path inside a directory; null when it escapes or does not exist as a file. */
export function confinedFile(dir: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const target = normalize(join(dir, decoded))
  const rel = relative(dir, target)
  if (rel === '' || rel.startsWith('..') || rel.includes(`..${sep}`) || resolve(target) !== target)
    return null
  if (!existsSync(target) || !statSync(target).isFile()) return null
  return target
}

export async function createDevServer(opts: DevServerOptions): Promise<DevServer> {
  const deckFile = resolve(opts.deckFile)
  const deckDir = dirname(deckFile)
  const root = opts.root ?? PROJECT_ROOT
  const host = opts.host ?? '127.0.0.1'
  const clients = new Set<ServerResponse>()
  let lastWrittenHash = ''
  let expectedHost = ''

  const readDeck = (): Deck => {
    const parsed = parseDeck(readFileSync(deckFile, 'utf8'))
    if (!parsed.ok) throw new Error(parsed.errors.map((e) => `${e.path} ${e.message}`).join('\n'))
    return parsed.deck
  }

  const overridesHash = () => hashJson(editable(readDeck()))

  const page = (): string => {
    const deck = readDeck()
    const { html, warnings } = renderDeckDocument(deck, {
      deckDir,
      outDir: deckDir,
      root,
      userThemesDir: opts.userThemesDir,
    })
    const config = { overridesHash: hashJson(editable(deck)), warnings }
    const inject = `<script>window.__devConfig=${JSON.stringify(config).replace(/</g, '\\u003c')}</script>\n<script>\n${DEV_CLIENT_JS}\n</script>\n</body>`
    return html.replace(/<\/body>/, inject)
  }

  const broadcast = (event: string) => {
    for (const c of clients) c.write(`data: ${event}\n\n`)
  }

  const save = async (req: IncomingMessage, res: ServerResponse) => {
    if (!requestAllowed(req, expectedHost))
      return sendJson(res, 403, { error: 'same-origin requests only' })
    let body: {
      overrides?: unknown
      steps?: unknown
      enters?: unknown
      pages?: unknown
      base?: string
      force?: boolean
    }
    try {
      body = JSON.parse(await readBody(req)) as typeof body
    } catch {
      return sendJson(res, 400, { error: 'request body is not valid JSON' })
    }
    const current = readDeck()
    const currentHash = hashJson(editable(current))
    if (!body.force && body.base !== currentHash) {
      return sendJson(res, 409, {
        error: 'the overrides on disk are newer than the ones you loaded',
        overrides: current.overrides,
        overridesHash: currentHash,
      })
    }
    const candidate: Deck = { ...current, overrides: (body.overrides ?? {}) as Deck['overrides'] }
    // element steps and entrances are the one part of slides[] the editor may write: slots stay
    // as they are on disk. A key that is present replaces the field (0 / "" clears it); a missing
    // key leaves the disk value alone.
    const steps = (body.steps && typeof body.steps === 'object' ? body.steps : {}) as Record<
      string,
      unknown
    >
    const enters = (body.enters && typeof body.enters === 'object' ? body.enters : {}) as Record<
      string,
      unknown
    >
    if (Object.keys(steps).length > 0 || Object.keys(enters).length > 0) {
      candidate.slides = current.slides.map((s) => ({
        ...s,
        elements: s.elements.map((e) => {
          const key = `${s.id}/${e.id}`
          const out: Element = { id: e.id, kind: e.kind }
          if (!(key in steps)) {
            if (e.step !== undefined) out.step = e.step
          } else {
            const n = Number(steps[key])
            if (Number.isInteger(n) && n >= 1) out.step = n
          }
          if (!(key in enters)) {
            if (e.enter !== undefined) out.enter = e.enter
          } else {
            const v = enters[key]
            if (typeof v === 'string' && (ENTERS as readonly string[]).includes(v))
              out.enter = v as Enter
          }
          return out
        }),
      }))
    }
    // page-level overrides (playback order, hidden slides): present replaces, null clears, absent keeps
    if ('pages' in body) {
      if (body.pages && typeof body.pages === 'object')
        candidate.pages = body.pages as Deck['pages']
      else delete candidate.pages
    }
    // the deck-wide motion switch: "off" is written, anything else removes the field
    if ('motion' in body) {
      if (body.motion === 'off') candidate.motion = 'off'
      else delete candidate.motion
    }
    // the page transition: a family is written, anything else ('' = theme default) removes the field
    if ('transition' in body) {
      if (
        typeof body.transition === 'string' &&
        (TRANSITIONS as readonly string[]).includes(body.transition)
      )
        candidate.transition = body.transition as Transition
      else delete candidate.transition
    }
    const validation = validateDeck(candidate)
    if (!validation.ok)
      return sendJson(res, 400, {
        error: 'overrides failed validation',
        problems: validation.errors,
      })
    const text = stringifyDeck(validation.deck)
    lastWrittenHash = createHash('sha256').update(text).digest('hex')
    const tmp = `${deckFile}.tmp`
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, deckFile)
    return sendJson(res, 200, { saved: true, overridesHash: hashJson(editable(validation.deck)) })
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${expectedHost}`)
    try {
      if (req.method === 'POST' && url.pathname === '/__save') return await save(req, res)
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return sendJson(res, 405, { error: 'method not allowed' })
      if (url.pathname === '/' || url.pathname === '/index.html')
        return send(res, 200, page(), MIME['.html'] as string)
      if (url.pathname === '/__deck') return sendJson(res, 200, readDeck())
      if (url.pathname === '/__export') {
        // the deck as one portable file: rendered from what is on disk, images inlined, no dev client
        const deck = readDeck()
        const { html } = renderDeckDocument(deck, {
          deckDir,
          outDir: deckDir,
          root,
          userThemesDir: opts.userThemesDir,
          inlineAssets: true,
        })
        const name = `${deck.id.replace(/[^A-Za-z0-9._-]+/g, '-') || 'deck'}.html`
        return send(res, 200, html, MIME['.html'] as string, {
          'content-disposition': `attachment; filename="${name}"`,
        })
      }
      if (url.pathname === '/__events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        })
        res.write('data: ready\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
        return
      }
      if (url.pathname.startsWith('/__')) return sendJson(res, 404, { error: 'not found' })
      const file = confinedFile(deckDir, url.pathname)
      if (!file || file === deckFile) return send(res, 404, 'not found', MIME['.txt'] as string)
      return send(
        res,
        200,
        readFileSync(file),
        MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      )
    } catch (err) {
      return send(res, 500, `✖ ${(err as Error).message}`, MIME['.txt'] as string)
    }
  }

  const server: Server = createServer((req, res) => {
    void handler(req, res)
  })
  await new Promise<void>((resolvePromise) => server.listen(opts.port ?? 0, host, resolvePromise))
  const port = (server.address() as AddressInfo).port
  expectedHost = `${host}:${port}`

  let timer: ReturnType<typeof setTimeout> | null = null
  const onChange = (_event: string, filename: string | Buffer | null) => {
    const name = String(filename ?? '')
    if (name.endsWith('.tmp')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (existsSync(deckFile)) {
        const hash = createHash('sha256').update(readFileSync(deckFile)).digest('hex')
        if (name.endsWith('deck.json') && hash === lastWrittenHash) return
      }
      broadcast('reload')
    }, 250)
  }
  const watchers: FSWatcher[] = []
  // external themes reload the page too: the deck folder (recursive) already covers decks/<id>/themes/
  const userDir = opts.userThemesDir === undefined ? userThemesDir() : opts.userThemesDir
  const workspaceThemes = resolve('themes')
  const watched = [
    deckDir,
    join(root, 'themes'),
    join(root, 'layouts'),
    ...(relative(workspaceThemes, join(root, 'themes')) === '' ? [] : [workspaceThemes]),
    ...(userDir ? [userDir] : []),
  ]
  for (const dir of watched) {
    if (existsSync(dir)) watchers.push(watch(dir, { recursive: true }, onChange))
  }

  return {
    url: `http://${expectedHost}`,
    port,
    overridesHash,
    close: () =>
      new Promise<void>((resolvePromise) => {
        for (const w of watchers) w.close()
        for (const c of clients) c.end()
        clients.clear()
        server.close(() => resolvePromise())
      }),
  }
}
