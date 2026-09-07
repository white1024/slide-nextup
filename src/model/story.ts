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
  /** optional BCP 47 tag; the scaffold copies it into deck.json, else it guesses from the text */
  lang?: string
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
   * Optional chapter name (a skeleton item), e.g. `骨架`. Pages that share a chapter share its
   * number; the scaffold turns it into the chapter label `01 — 骨架` on layouts with a kicker.
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

/** The canonical `##` headings of story.md. */
export const SECTION_HEADINGS = {
  goal: 'Goal and audience',
  thesis: 'Core message',
  skeleton: 'Narrative skeleton',
  slides: 'Slides',
} as const

/** Headings still accepted for each section (the original Chinese format); matching is case-insensitive. */
export const SECTION_ALIASES: Record<keyof typeof SECTION_HEADINGS, readonly string[]> = {
  goal: ['目標與受眾'],
  thesis: ['核心主張'],
  skeleton: ['敘事骨架'],
  slides: ['逐頁'],
}

/** Whether a `## heading` names the given section, canonical or alias. */
export function isSectionHeading(key: keyof typeof SECTION_HEADINGS, name: string): boolean {
  const n = name.trim().toLowerCase()
  return (
    n === SECTION_HEADINGS[key].toLowerCase() ||
    SECTION_ALIASES[key].some((a) => a.toLowerCase() === n)
  )
}

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
    error('frontmatter/missing', 1, 'the file must start with a YAML frontmatter opened by `---`')
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
    error('frontmatter/unterminated', 1, 'frontmatter has no closing `---`')
    return { story: null, diagnostics }
  }

  let rawMeta: unknown
  try {
    rawMeta = parseYaml(lines.slice(1, fmEnd).join('\n'))
  } catch (err) {
    error('frontmatter/yaml', 2, `frontmatter is not valid YAML: ${(err as Error).message}`)
    return { story: null, diagnostics }
  }
  if (!isRecord(rawMeta)) {
    error('frontmatter/shape', 2, 'frontmatter must be a key-value mapping')
    return { story: null, diagnostics }
  }

  const metaLine = (key: string) => findKeyLine(lines, 1, fmEnd, key)
  for (const key of META_STRING_KEYS) {
    const v = rawMeta[key]
    if (typeof v !== 'string' || v.trim() === '') {
      error(
        'frontmatter/field',
        metaLine(key),
        `frontmatter is missing the required field \`${key}\` (non-empty string)`,
      )
    }
  }
  const duration = rawMeta.duration_minutes
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    error(
      'frontmatter/field',
      metaLine('duration_minutes'),
      '`duration_minutes` must be a number greater than 0',
    )
  }
  if (!DENSITIES.includes(rawMeta.density as Density)) {
    error(
      'frontmatter/enum',
      metaLine('density'),
      `\`density\` must be ${DENSITIES.join(' | ')}, currently ${JSON.stringify(rawMeta.density ?? null)}`,
    )
  }
  if (!NARRATIVE_PATTERNS.includes(rawMeta.narrative_pattern as NarrativePattern)) {
    error(
      'frontmatter/enum',
      metaLine('narrative_pattern'),
      `\`narrative_pattern\` must be ${NARRATIVE_PATTERNS.join(' | ')}, currently ${JSON.stringify(rawMeta.narrative_pattern ?? null)}`,
    )
  }

  // ---- sections ----------------------------------------------------------
  const sectionStarts: Array<{ name: string; line: number }> = []
  for (let i = fmEnd + 1; i < lines.length; i++) {
    const m = /^##\s+(.+?)\s*$/.exec(lines[i] ?? '')
    if (m?.[1]) sectionStarts.push({ name: m[1], line: i })
  }
  const sectionBody = (
    key: keyof typeof SECTION_HEADINGS,
  ): { text: string; from: number; to: number } | null => {
    const idx = sectionStarts.findIndex((s) => isSectionHeading(key, s.name))
    if (idx === -1) return null
    const from = (sectionStarts[idx]?.line ?? 0) + 1
    const to = sectionStarts[idx + 1]?.line ?? lines.length
    return { text: lines.slice(from, to).join('\n').trim(), from, to }
  }
  const headingName = (key: keyof typeof SECTION_HEADINGS) =>
    `\`## ${SECTION_HEADINGS[key]}\` (or \`## ${SECTION_ALIASES[key][0]}\`)`

  const sections: Partial<StorySections> = {}
  for (const key of ['goal', 'thesis', 'skeleton'] as const) {
    const body = sectionBody(key)
    if (!body) {
      error('section/missing', fmEnd + 1, `missing section ${headingName(key)}`)
    } else if (body.text === '') {
      warning('section/empty', body.from, `section ${headingName(key)} is empty`)
      sections[key] = ''
    } else {
      sections[key] = body.text
    }
  }
  const slidesBody = sectionBody('slides')
  if (!slidesBody) {
    error('section/missing', fmEnd + 1, `missing section ${headingName('slides')}`)
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
          'a slide heading must be `### <id> | <title>`, and the id can only use letters, digits, underscores and hyphens',
        )
        continue
      }
      const title = (m[2] ?? '').trim()
      if (title === '') error('slide/title', i + 1, `slide \`${m[1]}\` is missing a title`)
      headings.push({ line: i, id: m[1], title })
    }
    if (headings.length === 0) {
      error(
        'slide/none',
        slidesBody.from + 1,
        `no \`### <id> | <title>\` slides under \`## ${SECTION_HEADINGS.slides}\``,
      )
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
          `duplicate slide id \`${h.id}\` (first seen on line ${seen.get(h.id)})`,
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
          `cannot parse the fields of slide \`${h.id}\`: ${(err as Error).message}`,
        )
        return
      }
      if (!isRecord(fields)) {
        error(
          'slide/shape',
          headingLine,
          `the fields of slide \`${h.id}\` must be a \`- key: value\` list`,
        )
        return
      }
      const fieldLine = (key: string) => findKeyLine(lines, from, to, key)

      for (const key of Object.keys(fields)) {
        if (!SLIDE_KNOWN_KEYS.has(key)) {
          warning(
            'slide/unknown-field',
            fieldLine(key),
            `slide \`${h.id}\` has an unrecognised field \`${key}\`, which will be ignored`,
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
          `\`scene_role\` of slide \`${h.id}\` must be ${SCENE_ROLES.join(' | ')}, currently ${JSON.stringify(role ?? null)}`,
        )
      }
      const intensity = fields.intensity
      if (!Number.isInteger(intensity) || (intensity as number) < 1 || (intensity as number) > 5) {
        ok = false
        error(
          'slide/field',
          fieldLine('intensity'),
          `\`intensity\` of slide \`${h.id}\` must be an integer from 1 to 5, currently ${JSON.stringify(intensity ?? null)}`,
        )
      }
      const relation = fields.content_relation
      if (!CONTENT_RELATIONS.includes(relation as ContentRelation)) {
        ok = false
        error(
          'slide/enum',
          fieldLine('content_relation'),
          `\`content_relation\` of slide \`${h.id}\` must be ${CONTENT_RELATIONS.join(' | ')}, currently ${JSON.stringify(relation ?? null)}`,
        )
      }
      const message = fields.message
      if (typeof message !== 'string' || message.trim() === '') {
        ok = false
        error(
          'slide/field',
          fieldLine('message'),
          `slide \`${h.id}\` is missing \`message\` (one sentence, non-empty string)`,
        )
      } else if (message.includes('\n')) {
        ok = false
        error(
          'message/single',
          fieldLine('message'),
          `\`message\` of slide \`${h.id}\` must be a single sentence, not multiple lines`,
        )
      }
      const evidence = normaliseEvidence(fields.evidence)
      if (evidence === null) {
        ok = false
        error(
          'slide/field',
          fieldLine('evidence'),
          `\`evidence\` of slide \`${h.id}\` must be a string or a list of strings`,
        )
      }
      const notes = fields.notes
      if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        ok = false
        error('slide/field', fieldLine('notes'), `\`notes\` of slide \`${h.id}\` must be a string`)
      }
      const chapter = fields.chapter
      if (chapter !== undefined && chapter !== null && typeof chapter !== 'string') {
        ok = false
        error(
          'slide/field',
          fieldLine('chapter'),
          `\`chapter\` of slide \`${h.id}\` must be a string (a chapter name, e.g. \`骨架\`)`,
        )
      } else if (typeof chapter === 'string' && /\n/.test(chapter.trim())) {
        ok = false
        error(
          'slide/field',
          fieldLine('chapter'),
          `\`chapter\` of slide \`${h.id}\` must be a single line`,
        )
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
      ...(typeof rawMeta.lang === 'string' && rawMeta.lang.trim() !== ''
        ? { lang: rawMeta.lang.trim() }
        : {}),
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
      `no slide in the deck pauses at intensity <= 2; the lowest is \`${lowest.id}\` (${lowest.intensity}). Lower it to 1 or 2, or insert a pause slide`,
    )
  }
  const highest = slides.reduce((a, b) => (b.intensity > a.intensity ? b : a))
  if (highest.intensity < 4) {
    error(
      'rhythm/peak',
      highest.line,
      `no slide in the deck peaks at intensity >= 4; the highest is \`${highest.id}\` (${highest.intensity}). At least one slide must be 4 or 5`,
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
        `\`${cur.scene_role}\` runs for a 4th consecutive slide (from \`${(slides[i - 3] as StorySlide).id}\` to \`${cur.id}\`); the same scene_role can run for at most 3 slides, switch roles in between`,
      )
    }
  }

  for (const s of slides) {
    const terminators = (s.message.match(/[。！？.!?]/g) ?? []).length
    if (terminators > 1) {
      warning(
        'message/single',
        s.line,
        `the message of \`${s.id}\` looks like more than one sentence (${terminators} sentence terminators); one slide says one thing`,
      )
    }
    if (s.content_relation === 'evidence' && s.evidence.length === 0) {
      warning(
        'evidence/missing',
        s.line,
        `\`${s.id}\` is an evidence slide but has no evidence; an evidence slide must name the facts, figures or charts it will show`,
      )
    }
  }

  if (first.scene_role !== 'hero') {
    warning(
      'structure/open',
      first.line,
      `the first slide \`${first.id}\` has scene_role ${first.scene_role}; the first slide is usually hero`,
    )
  }
  if (last.scene_role !== 'close') {
    warning(
      'structure/close',
      last.line,
      `the last slide \`${last.id}\` has scene_role ${last.scene_role}; the last slide is usually close`,
    )
  }

  const minPages = Math.max(1, Math.floor(meta.duration_minutes / 2))
  const maxPages = Math.ceil(meta.duration_minutes)
  if (slides.length < minPages || slides.length > maxPages) {
    warning(
      'pacing/pages',
      first.line,
      `a ${meta.duration_minutes}-minute deck at 1 to 2 minutes per slide suggests ${minPages} to ${maxPages} slides; currently ${slides.length}`,
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
