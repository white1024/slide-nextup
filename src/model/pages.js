/*
 * Page-level overrides: the deck's playback order and its hidden slides (deck.pages =
 * { order?: string[], hidden?: string[] }). story.md stays the narrative's source of truth; this
 * layer only changes how the deck plays. Shared by Node (validate, QA, scaffold) and the browser
 * runtime (injected as window.__pages) so the two can never disagree about the order.
 */

/**
 * The effective playback order. Ids that `order` does not list slot back in right after their
 * nearest story predecessor that is present (the first slide goes to the front); ids the deck no
 * longer has are ignored; duplicates count once. `visible` is `order` minus the hidden slides.
 */
export function effectiveOrder(ids, pages) {
  const known = new Set(ids)
  const order = []
  for (const id of pages?.order || []) {
    if (known.has(id) && !order.includes(id)) order.push(id)
  }
  ids.forEach((id, index) => {
    if (order.includes(id)) return
    let at = -1
    for (let j = index - 1; j >= 0 && at === -1; j--) at = order.indexOf(ids[j])
    order.splice(at + 1, 0, id)
  })
  const hidden = []
  for (const id of pages?.hidden || []) {
    if (known.has(id) && !hidden.includes(id)) hidden.push(id)
  }
  return { order, hidden, visible: order.filter((id) => !hidden.includes(id)) }
}

/** True when the deck plays exactly as the story lists it: same order, nothing hidden. */
export function followsStory(ids, pages) {
  const eff = effectiveOrder(ids, pages)
  return eff.hidden.length === 0 && eff.order.every((id, i) => id === ids[i])
}

/**
 * After a regenerate the story may have lost slides: drop ids that no longer exist and empty
 * arrays. Returns the cleaned pages (undefined when nothing is left) and what was dropped, as
 * "order:s9" / "hidden:s9", so the caller can report it.
 */
export function prunePages(pages, ids) {
  if (!pages) return { pages: undefined, dropped: [] }
  const known = new Set(ids)
  const dropped = []
  const keep = (list, field) => {
    const out = []
    for (const id of list || []) {
      if (!known.has(id)) dropped.push(`${field}:${id}`)
      else if (!out.includes(id)) out.push(id)
    }
    return out
  }
  const order = keep(pages.order, 'order')
  const hidden = keep(pages.hidden, 'hidden')
  const next = {}
  if (order.length > 0) next.order = order
  if (hidden.length > 0) next.hidden = hidden
  return { pages: Object.keys(next).length > 0 ? next : undefined, dropped }
}
