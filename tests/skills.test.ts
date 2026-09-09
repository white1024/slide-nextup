import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SLIDE_SKILLS } from '../src/cli/commands.ts'
import { checkSkills, isClean, listFiles, syncSkills } from '../src/skills/sync.ts'

// editor internals that must never leak into a skill: markup, event and class names, not the words a user sees in the toolbar
const EDITOR_WORDS = [
  'contenteditable',
  'pointerdown',
  'ed-panel',
  'ed-float',
  'ed-btn',
  'localstorage',
]
const CJK = /[一-鿿]/

describe('skills mirror', () => {
  it('syncs a source tree into a mirror and detects every kind of drift', () => {
    const root = mkdtempSync(join(tmpdir(), 'skills-'))
    const src = join(root, 'src')
    const dst = join(root, 'dst')
    mkdirSync(join(src, 'a'), { recursive: true })
    writeFileSync(join(src, 'a', 'SKILL.md'), '# a\n')
    writeFileSync(join(src, 'a', 'ref.md'), 'ref\n')
    expect(isClean(checkSkills(src, dst))).toBe(false)

    expect(syncSkills(src, dst)).toEqual({ copied: 2, removed: 0 })
    expect(listFiles(dst)).toEqual(['a/SKILL.md', 'a/ref.md'])
    expect(isClean(checkSkills(src, dst))).toBe(true)

    writeFileSync(join(dst, 'a', 'SKILL.md'), '# changed\n')
    expect(checkSkills(src, dst).changed).toEqual(['a/SKILL.md'])
    writeFileSync(join(dst, 'stray.md'), 'x\n')
    expect(checkSkills(src, dst).extra).toEqual(['stray.md'])
    rmSync(join(dst, 'a', 'ref.md'))
    expect(checkSkills(src, dst).missing).toEqual(['a/ref.md'])

    expect(syncSkills(src, dst)).toEqual({ copied: 2, removed: 1 })
    expect(isClean(checkSkills(src, dst))).toBe(true)

    writeFileSync(join(src, 'a', 'SKILL.md'), '# v2\n')
    expect(checkSkills(src, dst).lockStale).toBe(true)
    syncSkills(src, dst)
    expect(isClean(checkSkills(src, dst))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('the repository mirror is clean', () => {
    const report = checkSkills(resolve('.agents/skills'), resolve('.claude/skills'))
    expect(report).toEqual({ missing: [], extra: [], changed: [], lockStale: false })
  })
})

describe('slide skills', () => {
  it.each(SLIDE_SKILLS)('%s exists in the source tree, is short and has frontmatter', (name) => {
    const file = resolve('.agents/skills', name, 'SKILL.md')
    expect(existsSync(file)).toBe(true)
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    expect(lines.length).toBeLessThanOrEqual(150)
    expect(lines[0]).toBe('---')
    expect(text).toMatch(new RegExp(`^name: ${name}$`, 'm'))
    expect(text).toMatch(/^description: .+/m)
    for (const word of EDITOR_WORDS)
      expect(text.toLowerCase(), `${name} mentions ${word}`).not.toContain(word)
    // the skills are written in English; the Chinese story headings survive only as aliases described in prose
    const dir = resolve('.agents/skills', name)
    for (const rel of listFiles(dir))
      expect(
        readFileSync(join(dir, rel), 'utf8'),
        `${name}/${rel} still contains Chinese text`,
      ).not.toMatch(CJK)
  })

  it('every relative link inside a skill resolves', () => {
    for (const name of SLIDE_SKILLS) {
      const dir = resolve('.agents/skills', name)
      const text = readFileSync(join(dir, 'SKILL.md'), 'utf8')
      for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = m[1] as string
        if (/^https?:/.test(target)) continue
        expect(existsSync(resolve(dir, target)), `${name} → ${target}`).toBe(true)
      }
    }
  })

  it('the story skill stops for confirmation and the build skill enforces the gate', () => {
    const storySkill = readFileSync(resolve('.agents/skills/slide-story/SKILL.md'), 'utf8')
    expect(storySkill).toContain('pnpm story:confirm')
    expect(storySkill).toMatch(/confirm/i)
    expect(storySkill).toMatch(/before you confirm/)
    const buildSkill = readFileSync(resolve('.agents/skills/slide-build/SKILL.md'), 'utf8')
    expect(buildSkill).toContain('pnpm deck:scaffold')
    expect(buildSkill).toContain('--require-confirmed')
  })
})
