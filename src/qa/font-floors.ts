/**
 * The legibility floors, one table for everything that enforces or applies them: the QA rule
 * (min-font, min-font-inner), the player's auto-fit (FIT_JS shrinks a `data-fit` text down to its
 * role's floor and no further) and the docs. Content stays at 32px because a projected deck is read
 * from the back row; page furniture (meta, chip, eyebrow) goes down to 20px, small labels (chapter,
 * pill, caption, cta, kicker, flow) to 24px, table cells to 22px. A deck read up close lowers the
 * floors for one run with `pnpm qa --min-font <px> --min-inner-font <px>`.
 */
export const MIN_FONT_BY_ROLE: Record<string, number> = {
  default: 32,
  meta: 20,
  chip: 20,
  eyebrow: 20,
  'eyebrow-accent': 20,
  chapter: 24,
  pill: 24,
  caption: 24,
  cta: 24,
  kicker: 24,
  flow: 24,
  'flow-accent': 24,
  table: 22,
}

/** the floor for text elements without a graded role (`--min-font`) */
export const DEFAULT_MIN_FONT = MIN_FONT_BY_ROLE.default as number
/** the floor for the smallest text node inside an element (`--min-inner-font`) */
export const DEFAULT_MIN_INNER_FONT = 28

/**
 * The table entry a role falls under: itself when graded, else its longest graded prefix
 * (`eyebrow-accent-2` → `eyebrow-accent`, `meta-right` → `meta`), so a theme's own variant of a
 * furniture role keeps the furniture floor; undefined means content.
 */
export function floorRoleOf(role: string): string | undefined {
  let r = role
  while (r) {
    if (r !== 'default' && MIN_FONT_BY_ROLE[r] !== undefined) return r
    const cut = r.lastIndexOf('-')
    if (cut === -1) return undefined
    r = r.slice(0, cut)
  }
  return undefined
}

/**
 * The floor for a role: the graded value of the entry it falls under, capped by the base so a
 * lowered base (`--min-font 20`) also lowers furniture that sits above it.
 */
export function minFontFor(role: string, base: number = DEFAULT_MIN_FONT): number {
  const key = floorRoleOf(role)
  const floor = key === undefined ? undefined : MIN_FONT_BY_ROLE[key]
  return floor === undefined ? base : Math.min(base, floor)
}

/** The sentence a floor finding ends with: why the floor exists and where the exit is. */
export function floorExit(flag: '--min-font' | '--min-inner-font', role?: string): string {
  const what = role && floorRoleOf(role) !== undefined ? `${role} furniture` : 'content'
  return `the legibility floor for ${what} is deliberate (a projected deck is read from the back row); pnpm qa ${flag} <px> lowers it for a deck read up close`
}
