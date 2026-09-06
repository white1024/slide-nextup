import { effectiveOrder, type Pages } from './pages.js'
import { SECTION_HEADINGS, type Story } from './story.ts'

/**
 * Writing the deck's page-level overrides (playback order, hidden slides) back into story.md:
 * the `### id | title` blocks under `## 逐頁` are re-sequenced to the effective order and the
 * hidden ones are removed. Everything else in the file (frontmatter, the prose sections, the
 * skeleton) is copied byte for byte — the skeleton may now disagree with the pages, and that is
 * the author's call, so the CLI only says so.
 */

export interface AppliedPages {
  /** the rewritten story.md (identical to the input when nothing had to change) */
  text: string
  /** slide ids in the story's new order */
  order: string[]
  /** slides removed because the deck hides them */
  removed: Array<{ id: string; title: string }>
  /** ids the deck's pages name but the story does not have (ignored) */
  unknown: string[]
  changed: boolean
}

const SLIDES_HEADING = new RegExp(`^##\\s+${SECTION_HEADINGS.slides}\\s*$`)

function trimTrailingBlank(lines: string[]): string[] {
  const out = lines.slice()
  while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop()
  return out
}

export function applyPagesToStory(
  storyText: string,
  story: Story,
  pages: Pages | undefined,
): AppliedPages {
  const ids = story.slides.map((s) => s.id)
  const eff = effectiveOrder(ids, pages)
  const known = new Set(ids)
  const unknown = [...(pages?.order ?? []), ...(pages?.hidden ?? [])].filter(
    (id, i, all) => !known.has(id) && all.indexOf(id) === i,
  )
  const removed = eff.hidden.map((id) => ({
    id,
    title: story.slides.find((s) => s.id === id)?.title ?? '',
  }))
  const changed = removed.length > 0 || eff.visible.some((id, i) => id !== ids[i])
  if (!changed) return { text: storyText, order: ids, removed: [], unknown, changed: false }

  const lines = storyText.replace(/\r\n?/g, '\n').split('\n')
  const sectionStart = lines.findIndex((l) => SLIDES_HEADING.test(l))
  if (sectionStart === -1) throw new Error(`story.md 沒有 \`## ${SECTION_HEADINGS.slides}\` 章節`)
  let sectionEnd = lines.length
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? '')) {
      sectionEnd = i
      break
    }
  }
  // each slide block runs from its heading to the next heading (or the end of the section)
  const starts = story.slides.map((s) => s.line - 1)
  const blocks = new Map<string, string[]>()
  story.slides.forEach((s, i) => {
    const from = starts[i] as number
    const to = i + 1 < starts.length ? (starts[i + 1] as number) : sectionEnd
    blocks.set(s.id, trimTrailingBlank(lines.slice(from, to)))
  })
  const prefix = trimTrailingBlank(lines.slice(0, starts[0] ?? sectionEnd))
  const suffix = lines.slice(sectionEnd)
  const body = eff.visible.map((id) => (blocks.get(id) as string[]).join('\n'))
  const parts = [prefix.join('\n'), ...body]
  let text = parts.join('\n\n')
  if (trimTrailingBlank(suffix).length > 0) text += `\n\n${trimTrailingBlank(suffix).join('\n')}`
  return { text: `${text}\n`, order: eff.visible, removed, unknown, changed: true }
}
