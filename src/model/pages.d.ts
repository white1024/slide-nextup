/** deck.pages: playback order and hidden slides, set from the editor; story.md stays the source. */
export interface Pages {
  order?: string[]
  hidden?: string[]
}

export interface EffectivePages {
  /** every slide id, in playback order (hidden ones included) */
  order: string[]
  hidden: string[]
  /** order minus hidden: what the player steps through */
  visible: string[]
}

export function effectiveOrder(ids: readonly string[], pages: Pages | undefined): EffectivePages
export function followsStory(ids: readonly string[], pages: Pages | undefined): boolean
export function prunePages(
  pages: Pages | undefined,
  ids: readonly string[],
): { pages: Pages | undefined; dropped: string[] }
