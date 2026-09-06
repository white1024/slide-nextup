import { parse as parseYaml } from 'yaml'

export const SCENE_ROLES = ['hero', 'map', 'evidence', 'relationship', 'pause', 'close'] as const
export const CONTENT_RELATIONS = [
  'statement',
  'comparison',
  'sequence',
  'hierarchy',
  'evidence',
  'list',
  'closing',
] as const
export const DENSITIES = ['minimal', 'light', 'standard', 'dense'] as const
export const NARRATIVE_PATTERNS = [
  'problem-solution',
  'timeline',
  'contrast',
  'pyramid',
  'journey',
] as const

export type SceneRole = (typeof SCENE_ROLES)[number]
export type ContentRelation = (typeof CONTENT_RELATIONS)[number]
export type Density = (typeof DENSITIES)[number]
export type NarrativePattern = (typeof NARRATIVE_PATTERNS)[number]

export interface StoryMeta {
  title: string
  audience: string
  occasion: string
  duration_minutes: number
  density: Density
  narrative_pattern: NarrativePattern
  core_message: string
}

export interface StorySlide {
  id: string
  title: string
  scene_role: SceneRole
  intensity: number
  content_relation: ContentRelation
  message: string
  evidence: string[]
  notes: string
  /**
   * Optional chapter name (a skeleton item), e.g. 「骨架」. Pages that share a chapter share its
   * number; the scaffold turns it into the chapter label 「01 — 骨架」 on layouts with a kicker.
   */
  chapter?: string
  /** 1-based line of the slide heading in the source file. */
  line: number
}

export interface StorySections {
  goal: string
  thesis: string
  skeleton: string
}

export interface Story {
  meta: StoryMeta
  sections: StorySections
  slides: StorySlide[]
}

export type Severity = 'error' | 'warning'

export interface Diagnostic {
  severity: Severity
  rule: string
  line: number
  message: string
}

export interface ParseResult {
  story: Story | null
  diagnostics: Diagnostic[]
}

export const SECTION_HEADINGS = {
  goal: '目標與受眾',
  thesis: '核心主張',
  skeleton: '敘事骨架',
  slides: '逐頁',
} as const

const META_STRING_KEYS = ['title', 'audience', 'occasion', 'core_message'] as const
const SLIDE_KNOWN_KEYS = new Set([
  'scene_role',
  'intensity',
  'content_relation',
  'message',
  'evidence',
  'notes',
  'chapter',
])

const SLIDE_HEADING = /^###\s+([A-Za-z][A-Za-z0-9_-]*)\s*(?:[|｜·:：—–-]\s*(.*))?$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function findKeyLine(lines: string[], from: number, to: number, key: string): number {
  const re = new RegExp(`^(?:-\\s+)?${key}\\s*:`)
  for (let i = from; i < to; i++) {
    if (re.test(lines[i] ?? '')) return i + 1
  }
  return from + 1
}

function toYamlText(lines: string[], from: number, to: number): string {
  const out: string[] = []
  for (let i = from; i < to; i++) {
    const raw = lines[i] ?? ''
    out.push(raw.startsWith('- ') ? raw.slice(2) : raw)
  }
  return out.join('\n')
}

function normaliseEvidence(value: unknown): string[] | null {
  if (value === undefined || value === null || value === '') return []
  if (typeof value === 'string') return [value.trim()]
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) {
    return value.map((v) => String(v).trim())
  }
  return null
}

export function parseStory(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const diagnostics: Diagnostic[] = []
  const error = (rule: string, line: number, message: string) =>
    diagnostics.push({ severity: 'error', rule, line, message })
  const warning = (rule: string, line: number, message: string) =>
    diagnostics.push({ severity: 'warning', rule, line, message })

  // ---- frontmatter -------------------------------------------------------
  if ((lines[0] ?? '').trim() !== '---') {
    error('frontmatter/missing', 1, '檔案必須以 `---` 開頭的 YAML frontmatter 開始')
    return { story: null, diagnostics }
  }
  let fmEnd = -1
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      fmEnd = i
      break
    }
  }
  if (fmEnd === -1) {
    error('frontmatter/unterminated', 1, 'frontmatter 沒有結尾的 `---`')
    return { story: null, diagnostics }
  }

  let rawMeta: unknown
  try {
    rawMeta = parseYaml(lines.slice(1, fmEnd).join('\n'))
  } catch (err) {
    error('frontmatter/yaml', 2, `frontmatter 不是合法 YAML：${(err as Error).message}`)
    return { story: null, diagnostics }
  }
  if (!isRecord(rawMeta)) {
    error('frontmatter/shape', 2, 'frontmatter 必須是鍵值對')
    return { story: null, diagnostics }
  }

  const metaLine = (key: string) => findKeyLine(lines, 1, fmEnd, key)
  for (const key of META_STRING_KEYS) {
    const v = rawMeta[key]
    if (typeof v !== 'string' || v.trim() === '') {
      error('frontmatter/field', metaLine(key), `frontmatter 缺少必要欄位 \`${key}\`（非空字串）`)
    }
  }
  const duration = rawMeta.duration_minutes
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    error(
      'frontmatter/field',
      metaLine('duration_minutes'),
      '`duration_minutes` 必須是大於 0 的數字',
    )
  }
  if (!DENSITIES.includes(rawMeta.density as Density)) {
    error(
      'frontmatter/enum',
      metaLine('density'),
      `\`density\` 必須是 ${DENSITIES.join(' | ')}，目前是 ${JSON.stringify(rawMeta.density ?? null)}`,
    )
  }
  if (!NARRATIVE_PATTERNS.includes(rawMeta.narrative_pattern as NarrativePattern)) {
    error(
      'frontmatter/enum',
      metaLine('narrative_pattern'),
      `\`narrative_pattern\` 必須是 ${NARRATIVE_PATTERNS.join(' | ')}，目前是 ${JSON.stringify(rawMeta.narrative_pattern ?? null)}`,
    )
  }

  // ---- sections ----------------------------------------------------------
  const sectionStarts: Array<{ name: string; line: number }> = []
  for (let i = fmEnd + 1; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*$/.exec(lines[i] ?? '')
    if (m?.[1]) sectionStarts.push({ name: m[1], line: i })
  }
  const sectionBody = (name: string): { text: string; from: number; to: number } | null => {
    const idx = sectionStarts.findIndex((s) => s.name === name)
    if (idx === -1) return null
    const from = (sectionStarts[idx]?.line ?? 0) + 1
    const to = sectionStarts[idx + 1]?.line ?? lines.length
    return { text: lines.slice(from, to).join('\n').trim(), from, to }
  }

  const sections: Partial<StorySections> = {}
  for (const key of ['goal', 'thesis', 'skeleton'] as const) {
    const body = sectionBody(SECTION_HEADINGS[key])
    if (!body) {
      error('section/missing', fmEnd + 1, `缺少章節 \`## ${SECTION_HEADINGS[key]}\``)
    } else if (body.text === '') {
      warning('section/empty', body.from, `章節 \`## ${SECTION_HEADINGS[key]}\` 是空的`)
      sections[key] = ''
    } else {
      sections[key] = body.text
    }
  }
  const slidesBody = sectionBody(SECTION_HEADINGS.slides)
  if (!slidesBody) {
    error('section/missing', fmEnd + 1, `缺少章節 \`## ${SECTION_HEADINGS.slides}\``)
  }

  // ---- slides ------------------------------------------------------------
  const slides: StorySlide[] = []
  if (slidesBody) {
    const headings: Array<{ line: number; id: string; title: string }> = []
    for (let i = slidesBody.from; i < slidesBody.to; i++) {
      const raw = lines[i] ?? ''
      if (!raw.startsWith('### ')) continue
      const m = SLIDE_HEADING.exec(raw)
      if (!m?.[1]) {
        error(
          'slide/heading',
          i + 1,
          '逐頁標題格式必須是 `### <id> | <標題>`，id 只能用英數、底線、連字號',
        )
        continue
      }
      const title = (m[2] ?? '').trim()
      if (title === '') error('slide/title', i + 1, `頁面 \`${m[1]}\` 缺少標題`)
      headings.push({ line: i, id: m[1], title })
    }
    if (headings.length === 0) {
      error('slide/none', slidesBody.from + 1, '`## 逐頁` 底下沒有任何 `### <id> | <標題>` 頁面')
    }

    const seen = new Map<string, number>()
    headings.forEach((h, idx) => {
      const from = h.line + 1
      const to = headings[idx + 1]?.line ?? slidesBody.to
      const headingLine = h.line + 1

      if (seen.has(h.id)) {
        error(
          'slide/duplicate-id',
          headingLine,
          `頁面 id \`${h.id}\` 重複（第一次出現在第 ${seen.get(h.id)} 行）`,
        )
      } else {
        seen.set(h.id, headingLine)
      }

      let fields: unknown
      try {
        fields = parseYaml(toYamlText(lines, from, to)) ?? {}
      } catch (err) {
        error(
          'slide/yaml',
          headingLine,
          `頁面 \`${h.id}\` 的欄位無法解析：${(err as Error).message}`,
        )
        return
      }
      if (!isRecord(fields)) {
        error('slide/shape', headingLine, `頁面 \`${h.id}\` 的欄位必須是 \`- key: value\` 清單`)
        return
      }
      const fieldLine = (key: string) => findKeyLine(lines, from, to, key)

      for (const key of Object.keys(fields)) {
        if (!SLIDE_KNOWN_KEYS.has(key)) {
          warning(
            'slide/unknown-field',
            fieldLine(key),
            `頁面 \`${h.id}\` 有未知欄位 \`${key}\`，會被忽略`,
          )
        }
      }

      let ok = true
      const role = fields.scene_role
      if (!SCENE_ROLES.includes(role as SceneRole)) {
        ok = false
        error(
          'slide/enum',
          fieldLine('scene_role'),
          `頁面 \`${h.id}\` 的 \`scene_role\` 必須是 ${SCENE_ROLES.join(' | ')}，目前是 ${JSON.stringify(role ?? null)}`,
        )
      }
      const intensity = fields.intensity
      if (!Number.isInteger(intensity) || (intensity as number) < 1 || (intensity as number) > 5) {
        ok = false
        error(
          'slide/field',
          fieldLine('intensity'),
          `頁面 \`${h.id}\` 的 \`intensity\` 必須是 1 到 5 的整數，目前是 ${JSON.stringify(intensity ?? null)}`,
        )
      }
      const relation = fields.content_relation
      if (!CONTENT_RELATIONS.includes(relation as ContentRelation)) {
        ok = false
        error(
          'slide/enum',
          fieldLine('content_relation'),
          `頁面 \`${h.id}\` 的 \`content_relation\` 必須是 ${CONTENT_RELATIONS.join(' | ')}，目前是 ${JSON.stringify(relation ?? null)}`,
        )
      }
      const message = fields.message
      if (typeof message !== 'string' || message.trim() === '') {
        ok = false
        error(
          'slide/field',
          fieldLine('message'),
          `頁面 \`${h.id}\` 缺少 \`message\`（一句話，非空字串）`,
        )
      } else if (message.includes('\n')) {
        ok = false
        error(
          'message/single',
          fieldLine('message'),
          `頁面 \`${h.id}\` 的 \`message\` 只能是一句話，不能多行`,
        )
      }
      const evidence = normaliseEvidence(fields.evidence)
      if (evidence === null) {
        ok = false
        error(
          'slide/field',
          fieldLine('evidence'),
          `頁面 \`${h.id}\` 的 \`evidence\` 必須是字串或字串清單`,
        )
      }
      const notes = fields.notes
      if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        ok = false
        error('slide/field', fieldLine('notes'), `頁面 \`${h.id}\` 的 \`notes\` 必須是字串`)
      }
      const chapter = fields.chapter
      if (chapter !== undefined && chapter !== null && typeof chapter !== 'string') {
        ok = false
        error(
          'slide/field',
          fieldLine('chapter'),
          `頁面 \`${h.id}\` 的 \`chapter\` 必須是字串（章節名，例如「骨架」）`,
        )
      } else if (typeof chapter === 'string' && /\n/.test(chapter.trim())) {
        ok = false
        error('slide/field', fieldLine('chapter'), `頁面 \`${h.id}\` 的 \`chapter\` 必須是單行`)
      }

      if (!ok) return
      const slide: StorySlide = {
        id: h.id,
        title: h.title,
        scene_role: role as SceneRole,
        intensity: intensity as number,
        content_relation: relation as ContentRelation,
        message: (message as string).trim(),
        evidence: evidence ?? [],
        notes: typeof notes === 'string' ? notes.trim() : '',
        line: headingLine,
      }
      if (typeof chapter === 'string' && chapter.trim() !== '') slide.chapter = chapter.trim()
      slides.push(slide)
    })
  }

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { story: null, diagnostics }
  }

  const story: Story = {
    meta: {
      title: rawMeta.title as string,
      audience: rawMeta.audience as string,
      occasion: rawMeta.occasion as string,
      duration_minutes: duration as number,
      density: rawMeta.density as Density,
      narrative_pattern: rawMeta.narrative_pattern as NarrativePattern,
      core_message: rawMeta.core_message as string,
    },
    sections: {
      goal: sections.goal ?? '',
      thesis: sections.thesis ?? '',
      skeleton: sections.skeleton ?? '',
    },
    slides,
  }
  return { story, diagnostics }
}

/** Narrative rhythm and structure rules. Runs only on a story that parsed cleanly. */
export function checkStory(story: Story): Diagnostic[] {
  const out: Diagnostic[] = []
  const error = (rule: string, line: number, message: string) =>
    out.push({ severity: 'error', rule, line, message })
  const warning = (rule: string, line: number, message: string) =>
    out.push({ severity: 'warning', rule, line, message })
  const { slides, meta } = story
  if (slides.length === 0) return out

  const first = slides[0] as StorySlide
  const last = slides[slides.length - 1] as StorySlide

  const lowest = slides.reduce((a, b) => (b.intensity < a.intensity ? b : a))
  if (lowest.intensity > 2) {
    error(
      'rhythm/pause',
      lowest.line,
      `整份簡報沒有任何一頁強度 ≤ 2 的停頓；最低的是 \`${lowest.id}\`（${lowest.intensity}）。把它降到 1 或 2，或插入一頁 pause`,
    )
  }
  const highest = slides.reduce((a, b) => (b.intensity > a.intensity ? b : a))
  if (highest.intensity < 4) {
    error(
      'rhythm/peak',
      highest.line,
      `整份簡報沒有任何一頁強度 ≥ 4 的高峰；最高的是 \`${highest.id}\`（${highest.intensity}）。至少要有一頁是 4 或 5`,
    )
  }

  let run = 1
  for (let i = 1; i < slides.length; i++) {
    const prev = slides[i - 1] as StorySlide
    const cur = slides[i] as StorySlide
    run = cur.scene_role === prev.scene_role ? run + 1 : 1
    if (run === 4) {
      error(
        'rhythm/run',
        cur.line,
        `\`${cur.scene_role}\` 已連續第 4 頁（從 \`${(slides[i - 3] as StorySlide).id}\` 到 \`${cur.id}\`）；同一 scene_role 最多連續 3 頁，中間換一種角色`,
      )
    }
  }

  for (const s of slides) {
    const terminators = (s.message.match(/[。！？.!?]/g) ?? []).length
    if (terminators > 1) {
      warning(
        'message/single',
        s.line,
        `\`${s.id}\` 的 message 看起來不只一句話（${terminators} 個句號類標點）；一頁只講一件事`,
      )
    }
    if (s.content_relation === 'evidence' && s.evidence.length === 0) {
      warning(
        'evidence/missing',
        s.line,
        `\`${s.id}\` 是 evidence 頁但沒有填 evidence；證據頁要寫出要放的事實、數據或圖`,
      )
    }
  }

  if (first.scene_role !== 'hero') {
    warning(
      'structure/open',
      first.line,
      `第一頁 \`${first.id}\` 的 scene_role 是 ${first.scene_role}，通常第一頁應該是 hero`,
    )
  }
  if (last.scene_role !== 'close') {
    warning(
      'structure/close',
      last.line,
      `最後一頁 \`${last.id}\` 的 scene_role 是 ${last.scene_role}，通常最後一頁應該是 close`,
    )
  }

  const minPages = Math.max(1, Math.floor(meta.duration_minutes / 2))
  const maxPages = Math.ceil(meta.duration_minutes)
  if (slides.length < minPages || slides.length > maxPages) {
    warning(
      'pacing/pages',
      first.line,
      `${meta.duration_minutes} 分鐘的簡報以每頁 1 到 2 分鐘估算，建議 ${minPages} 到 ${maxPages} 頁；目前 ${slides.length} 頁`,
    )
  }

  return out
}

export interface LoadResult extends ParseResult {
  hasErrors: boolean
}

/** Parse and check in one go; diagnostics are sorted by line. */
export function loadStory(text: string): LoadResult {
  const parsed = parseStory(text)
  const diagnostics = [...parsed.diagnostics]
  if (parsed.story) diagnostics.push(...checkStory(parsed.story))
  diagnostics.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
  return {
    story: parsed.story,
    diagnostics,
    hasErrors: diagnostics.some((d) => d.severity === 'error'),
  }
}
