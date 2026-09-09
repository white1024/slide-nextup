/*
 * In-browser editor for rendered decks. Embedded verbatim by the renderer.
 * It only ever writes to the embedded model's `overrides`; generated slide
 * content is re-derived from the model, never from the DOM. No theme or
 * layout knowledge lives here: elements are addressed by data-el only, theme
 * colours and fonts are read back from the :root custom properties.
 *
 * Chrome: a fixed top toolbar (undo/redo, toggles, download, leave), a slide
 * rail on the left with live thumbnails (playback order and hidden pages) and
 * a floating toolbar that follows the selection. Its controls sit in fixed
 * groups (text, text style, element, position and size, appearance, arrange,
 * animation, expandable content); the last five open behind the "more" button
 * when floating and are always open when the toolbar is docked as a side panel.
 * Colours are picked from a palette that lists the theme's tokens by name.
 * Several elements can be selected at once (Shift+click, marquee, Ctrl+A);
 * style changes, moves, alignment and distribution then apply to all of them.
 * Without a dev server, every change is also kept as a localStorage draft that
 * the next visit offers to restore.
 */
;(() => {
  const deck = window.__deck
  if (!deck) return
  const model = deck.model
  const stage = document.querySelector('.deck-stage')
  const overrides = model.overrides
  const slidesById = new Map(model.slides.map((s) => [s.id, s]))
  const MAX_HISTORY = 100
  const SNAP = 8
  const W = 1920
  const H = 1080

  const STYLE_PROPS = {
    color: 'color',
    background: 'background',
    fontFamily: 'fontFamily',
    fontSize: 'fontSize',
    fontWeight: 'fontWeight',
    lineHeight: 'lineHeight',
    letterSpacing: 'letterSpacing',
    textAlign: 'textAlign',
    fontStyle: 'fontStyle',
    textDecoration: 'textDecoration',
    opacity: 'opacity',
    borderRadius: 'borderRadius',
  }
  const PX_PROPS = new Set(['fontSize', 'letterSpacing', 'borderRadius'])

  // ---- chrome icons (inline SVG paths from lucide, ISC; see ATTRIBUTIONS.md) -----

  const ICON = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/>',
    magnet:
      '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/><path d="m5 8 4 4"/><path d="m12 15 4 4"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:
      '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
    download:
      '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    alignLeft: '<path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/>',
    alignCenter: '<path d="M17 12H7"/><path d="M19 18H5"/><path d="M21 6H3"/>',
    alignRight: '<path d="M21 12H9"/><path d="M21 18H7"/><path d="M21 6H3"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    image:
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    bold: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    italic:
      '<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>',
    objLeft:
      '<rect width="9" height="6" x="6" y="14" rx="2"/><rect width="16" height="6" x="6" y="4" rx="2"/><path d="M2 2v20"/>',
    objCenterX:
      '<path d="M12 2v20"/><path d="M8 10H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h4"/><path d="M16 10h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"/><path d="M8 20H7a2 2 0 0 1-2-2v-2c0-1.1.9-2 2-2h1"/><path d="M16 14h1a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1"/>',
    objRight:
      '<rect width="16" height="6" x="2" y="4" rx="2"/><rect width="9" height="6" x="9" y="14" rx="2"/><path d="M22 22V2"/>',
    objTop:
      '<rect width="6" height="16" x="4" y="6" rx="2"/><rect width="6" height="9" x="14" y="6" rx="2"/><path d="M22 2H2"/>',
    objMiddle:
      '<path d="M2 12h20"/><path d="M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/><path d="M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4"/><path d="M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1"/><path d="M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1"/>',
    objBottom:
      '<rect width="6" height="16" x="4" y="2" rx="2"/><rect width="6" height="9" x="14" y="9" rx="2"/><path d="M22 22H2"/>',
    distH:
      '<rect width="6" height="10" x="9" y="7" rx="2"/><path d="M4 22V2"/><path d="M20 22V2"/>',
    distV:
      '<rect width="10" height="6" x="7" y="9" rx="2"/><path d="M22 20H2"/><path d="M22 4H2"/>',
    front: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
    back: '<rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 8v10a2 2 0 0 1-2 2H8"/>',
    brush:
      '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
    paste:
      '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    expand:
      '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    spot: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    trash:
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  }
  const icon = (name) =>
    `<svg class="ed-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`
  const pad2 = (n) => String(n).padStart(2, '0')

  // ---- model → DOM ---------------------------------------------------------

  // Slot rendering is shared with the Node renderer: src/render/slot-render.js is
  // injected into the page as window.__slotRender, so the editor can never drift.
  const shared = window.__slotRender
  const escapeHtml = shared.escapeHtml
  const renderSlot = shared.renderSlot
  const slotText = shared.slotText
  const effectiveSlot = shared.effectiveSlot
  // slots whose plain-text form is structured (rows, names…): edited in the toolbar, not inline
  const DATA_SLOT_TYPES = new Set(['chart', 'table', 'code', 'icon', 'tabs'])
  // slots that may carry details (the content behind a click while playing)
  const DETAILS_TYPES = new Set(['text', 'list', 'metric'])
  // only an element whose role the theme paints as a box may expand (the renderer's list)
  const DETAILS_ROLES = shared.DETAILS_ROLES

  const keyOf = (slideId, elId) => `${slideId}/${elId}`
  const elementOf = (slideId, elId) =>
    stage.querySelector(`[data-slide="${slideId}"] [data-el="${elId}"]`)
  const kindOf = (slideId, elId) => {
    const s = slidesById.get(slideId)
    const e = s?.elements.find((x) => x.id === elId)
    return e ? e.kind : null
  }
  const slotOf = (slideId, elId) => {
    const s = slidesById.get(slideId)
    return s ? s.slots[elId] : undefined
  }

  function apply(slideId, elId) {
    const el = elementOf(slideId, elId)
    if (!el) return
    const o = overrides[keyOf(slideId, elId)] || {}
    el.style.left = o.x != null ? `${o.x}px` : ''
    el.style.top = o.y != null ? `${o.y}px` : ''
    el.style.width = o.w != null ? `${o.w}px` : ''
    el.style.height = o.h != null ? `${o.h}px` : ''
    el.style.transform = o.rotation != null ? `rotate(${o.rotation}deg)` : ''
    el.style.zIndex = o.z != null ? String(o.z) : ''
    for (const k of Object.keys(STYLE_PROPS)) {
      const v = o.style ? o.style[k] : undefined
      el.style[STYLE_PROPS[k]] = v == null ? '' : PX_PROPS.has(k) ? `${v}px` : String(v)
    }
    // auto-fit (data-fit): an explicit font-size override wins; otherwise keep the fitted size
    const fitLocked = !!(o.style && o.style.fontSize != null)
    if (el.hasAttribute('data-fit')) {
      el.dataset.fitLock = fitLocked ? 'true' : 'false'
      if (!fitLocked && el.dataset.fitSize) el.style.fontSize = el.dataset.fitSize
    }
    if (o.hidden) el.setAttribute('data-hidden', 'true')
    else el.removeAttribute('data-hidden')
    const kind = kindOf(slideId, elId)
    const slot = slotOf(slideId, elId)
    if (kind === 'text') {
      if (el.isContentEditable) return
      const eff = effectiveSlot(slot, o, 'text')
      const content = eff ? renderSlot(eff) : ''
      if (el.innerHTML !== content) {
        el.innerHTML = content
        if (el.hasAttribute('data-fit') && window.__fit) window.__fit.fitOne(el)
        if (elId === 'page' && deck.renumber) deck.renumber()
      }
      // the player opens details on elements flagged data-details
      if (eff?.details) el.setAttribute('data-details', 'true')
      else el.removeAttribute('data-details')
    } else if (kind === 'image') {
      const eff = effectiveSlot(slot, o, 'image')
      const img = el.querySelector('img')
      const src = eff ? eff.src : null
      if (img && src != null && img.getAttribute('src') !== src) img.setAttribute('src', src)
      // hotspots are the anchors after the img; rebuild them when their markup changed
      const wanted = eff ? renderSlot(eff).replace(/^<img[^>]*>/, '') : ''
      const current = Array.from(el.querySelectorAll(':scope > .hotspot'))
        .map((a) => a.outerHTML)
        .join('')
      if (wanted !== current) {
        for (const a of el.querySelectorAll(':scope > .hotspot')) a.remove()
        el.insertAdjacentHTML('beforeend', wanted)
      }
    }
  }

  function applyAll() {
    for (const s of model.slides) for (const e of s.elements) apply(s.id, e.id)
  }

  /**
   * A file saved by the editor carries its edits in the model only (its page is the renderer's
   * original): put them back on the page when it opens. Overrides, reveal steps, entrances and
   * the page transition live here; the motion switch and the page arrangement the player reads
   * from the file itself.
   */
  function applyEditedModel() {
    applyAll()
    for (const s of model.slides) {
      for (const e of s.elements) {
        const node = elementOf(s.id, e.id)
        if (!node) continue
        if (e.step) node.dataset.step = String(e.step)
        else node.removeAttribute('data-step')
        if (e.enter) node.dataset.enter = e.enter
        else node.removeAttribute('data-enter')
      }
    }
    if (deck.rescan) deck.rescan()
    if (deck.refresh) deck.refresh()
    if (deck.setTransition) deck.setTransition(model.transition || '')
    if (deck.setPageTransition)
      for (const s of model.slides) deck.setPageTransition(s.id, s.transition || '')
  }

  // ---- overrides + history -------------------------------------------------

  const history = []
  const future = []
  const snapshot = () => JSON.stringify({ o: overrides, p: model.pages || null })
  let last = snapshot()
  const loaded = last // what the file held when the page opened; drafts are measured against it

  function exportModel() {
    const out = JSON.parse(JSON.stringify(model))
    const sorted = {}
    for (const k of Object.keys(out.overrides).sort()) sorted[k] = out.overrides[k]
    out.overrides = sorted
    return out
  }

  function syncModelScript() {
    const script = document.getElementById('deck-model')
    if (script) script.textContent = JSON.stringify(exportModel()).replace(/</g, '\\u003c')
  }

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }))
  }

  function commit() {
    const now = snapshot()
    if (now === last) return
    history.push(last)
    if (history.length > MAX_HISTORY) history.shift()
    future.length = 0
    last = now
    syncModelScript()
    emit('deck:edit', { overrides: JSON.parse(now).o })
    saveDraft()
    scheduleThumb(activeSlideId())
    refreshTopbar()
  }

  function restore(json) {
    const next = JSON.parse(json)
    for (const k of Object.keys(overrides)) delete overrides[k]
    Object.assign(overrides, next.o)
    if (next.p) model.pages = next.p
    else delete model.pages
    if (deck.setPages) deck.setPages(model.pages)
    last = json
    syncModelScript()
    applyAll()
    refreshSelection()
    refreshPanel()
    renderPagesList(true)
    emit('deck:edit', { overrides: next.o })
    saveDraft()
  }

  function undo() {
    if (history.length === 0) return
    future.push(last)
    restore(history.pop())
  }

  function redo() {
    if (future.length === 0) return
    history.push(last)
    restore(future.pop())
  }

  /** Merge a patch into one element's override; null values delete fields. */
  function set(slideId, elId, patch) {
    const key = keyOf(slideId, elId)
    const cur = Object.assign({}, overrides[key])
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'style') {
        const style = Object.assign({}, cur.style)
        for (const [sk, sv] of Object.entries(v || {})) {
          if (sv == null || sv === '') delete style[sk]
          else style[sk] = sv
        }
        if (Object.keys(style).length) cur.style = style
        else delete cur.style
      } else if (v == null) delete cur[k]
      else cur[k] = v
    }
    if (Object.keys(cur).length) overrides[key] = cur
    else delete overrides[key]
    apply(slideId, elId)
    refreshSelection()
  }

  function reset(slideId, elId) {
    delete overrides[keyOf(slideId, elId)]
    apply(slideId, elId)
    refreshSelection()
    refreshPanel()
    commit()
  }

  // ---- drafts (no dev server: localStorage keeps unsaved edits) -------------------

  const hasDevServer = () => Boolean(window.__devConfig)
  const hash32 = (s) => {
    let h = 5381
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(36)
  }
  // keyed by deck id and the loaded state, so a regenerated deck never gets an old draft
  const draftKey = () => `deck-draft:${model.id || 'deck'}:${hash32(loaded)}`

  function saveDraft() {
    if (hasDevServer()) return
    try {
      if (last === loaded) localStorage.removeItem(draftKey())
      else localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), snapshot: last }))
    } catch (_) {}
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(draftKey())
      if (!raw) return null
      const d = JSON.parse(raw)
      return d && typeof d.snapshot === 'string' && d.snapshot !== last ? d : null
    } catch (_) {
      return null
    }
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey())
    } catch (_) {}
    closeDraftBar()
  }

  /** Restoring is one undoable step. */
  function restoreDraft(d) {
    history.push(last)
    if (history.length > MAX_HISTORY) history.shift()
    future.length = 0
    restore(d.snapshot)
    closeDraftBar()
  }

  let draftBar = null
  function offerDraft() {
    if (!active || hasDevServer()) return
    const d = readDraft()
    if (!d) return
    closeDraftBar()
    draftBar = document.createElement('div')
    draftBar.className = 'ed-draft'
    const when = new Date(d.at || Date.now()).toLocaleString()
    draftBar.innerHTML =
      `<span>Unsaved edits from your last visit: <b>${escapeHtml(when)}</b></span>` +
      `<button type="button" class="ed-btn ed-btn-primary" data-draft="restore">Restore</button>` +
      `<button type="button" class="ed-btn" data-draft="discard">Discard</button>`
    draftBar.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-draft]')
      if (!btn) return
      if (btn.dataset.draft === 'restore') restoreDraft(d)
      else discardDraft()
    })
    document.body.appendChild(draftBar)
  }

  function closeDraftBar() {
    if (draftBar) draftBar.remove()
    draftBar = null
  }

  // ---- edit mode ----------------------------------------------------------

  let active = false
  let selection = [] // [{ slideId, elId }], the last one is the primary
  let snapEnabled = true
  let revealHidden = false
  let alignToSlide = false
  let copiedStyle = null
  let overlay = null
  let box = null
  let multi = null // thin boxes around the other selected elements
  let marquee = null
  let guides = null
  let panel = null // the top toolbar
  let float = null // the floating toolbar next to the selection
  let pagesPanel = null // the slide rail
  let editing = null
  let moreOpen = false // the floating toolbar's "more" row (position, size, reveal)
  // the same toolbar can sit docked on the right as a column with every row open; a viewer
  // preference (localStorage), never part of the deck
  const DOCK_KEY = 'slide-editor:toolbar'
  let docked = false
  try {
    docked = localStorage.getItem(DOCK_KEY) === 'docked'
  } catch (_) {
    docked = false
  }
  let detailsOpen = null // { key, open }: the expandable-content box opened or closed by hand
  let palette = null // the colour palette that is open: { prop, key }
  const palettes = {} // prop → palette node, kept on the body so no panel can clip it
  // hotspot mode: an image's jump regions are drawn, moved, resized and retargeted on the picture
  let spot = null // { slideId, elId, index } while it is on; index is the selected region or null
  let spotBox = null // overlay box with corner handles around the selected region
  let spotBar = null // the settings bar under it: target page, label, delete, done
  let spotDrag = null
  const handles = {}
  const scale = () => (typeof deck.scale === 'function' ? deck.scale() : 1)
  const activeSlideId = () => deck.ids[deck.current]
  const primary = () => (selection.length ? selection[selection.length - 1] : null)
  const isSelected = (slideId, elId) =>
    selection.some((s) => s.slideId === slideId && s.elId === elId)

  let staticBefore = null
  function enter() {
    if (active) return
    active = true
    document.body.classList.add('ed-active')
    // editing happens on the final state: every step element visible, no transitions
    staticBefore = document.documentElement.dataset.static ?? null
    document.documentElement.dataset.static = 'true'
    if (deck.refresh) deck.refresh()
    buildOverlay()
    buildTopbar()
    buildFloat()
    buildPagesPanel()
    applyInsets()
    stage.addEventListener('pointerdown', onPointerDown, true)
    stage.addEventListener('dblclick', onDoubleClick, true)
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('deck:change', onSlideChange)
    window.addEventListener('resize', onResize)
    emit('deck:editmode', { active: true })
    // the dev server announces itself in a later script; decide about drafts and the portable-HTML
    // button once every script ran (while the page is still parsing, a timer can fire in between)
    const settle = () => {
      offerDraft()
      refreshTopbar()
    }
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', settle, { once: true })
    else setTimeout(settle, 0)
  }

  function exit() {
    if (!active) return
    commitTextEdit()
    leaveSpotMode()
    select(null)
    stage.removeEventListener('pointerdown', onPointerDown, true)
    stage.removeEventListener('dblclick', onDoubleClick, true)
    window.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('deck:change', onSlideChange)
    window.removeEventListener('resize', onResize)
    clearTimeout(thumbTimer)
    closeDraftBar()
    overlay.remove()
    panel.remove()
    float.remove()
    pagesPanel.remove()
    if (spotBar) spotBar.remove()
    closePalette()
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    for (const prop of Object.keys(palettes)) {
      palettes[prop].remove()
      delete palettes[prop]
    }
    detailsOpen = null
    overlay = box = multi = marquee = guides = panel = float = pagesPanel = null
    spotBox = spotBar = null
    document.body.classList.remove('ed-active', 'ed-reveal')
    if (staticBefore == null) delete document.documentElement.dataset.static
    else document.documentElement.dataset.static = staticBefore
    if (deck.refresh) deck.refresh()
    if (deck.setInsets) deck.setInsets({ top: 0, right: 0, left: 0 })
    active = false
    emit('deck:editmode', { active: false })
  }

  function applyInsets() {
    // the top bar wraps onto a second row when the window is narrow: the panels below it and the
    // stage follow its real height
    document.documentElement.style.setProperty('--ed-top', `${panel.offsetHeight}px`)
    if (deck.setInsets)
      deck.setInsets({
        top: panel.offsetHeight,
        left: pagesPanel.offsetWidth,
        right: docked && float ? float.offsetWidth : 0,
      })
  }

  function onResize() {
    applyInsets()
    refreshSelection()
    paintAllThumbs()
  }

  function buildOverlay() {
    overlay = document.createElement('div')
    overlay.className = 'ed-overlay'
    box = document.createElement('div')
    box.className = 'ed-box'
    box.hidden = true
    for (const name of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      const h = document.createElement('div')
      h.className = `ed-handle ed-handle-${name}`
      h.dataset.handle = name
      box.appendChild(h)
      handles[name] = h
    }
    multi = document.createElement('div')
    multi.className = 'ed-multi'
    marquee = document.createElement('div')
    marquee.className = 'ed-marquee'
    marquee.hidden = true
    guides = document.createElement('div')
    guides.className = 'ed-guides'
    overlay.appendChild(multi)
    overlay.appendChild(box)
    overlay.appendChild(marquee)
    overlay.appendChild(guides)
    stage.appendChild(overlay)
  }

  /** Replace the selection: one element, several, or none. */
  function selectMany(targets) {
    const next = (targets || []).filter((t) => t && elementOf(t.slideId, t.elId))
    const p = next.length ? next[next.length - 1] : null
    if (editing && (!p || editing.elId !== p.elId || editing.slideId !== p.slideId))
      commitTextEdit()
    // hotspot mode belongs to one picture: it ends when the selection moves off it
    if (spot && !(p && p.slideId === spot.slideId && p.elId === spot.elId)) leaveSpotMode()
    selection = next
    refreshSelection()
    refreshPanel()
    emit('deck:select', { selected: primary(), selection: selection.slice() })
  }

  function select(target) {
    selectMany(target ? [target] : [])
  }

  function toggleInSelection(target) {
    if (isSelected(target.slideId, target.elId))
      selectMany(selection.filter((s) => !(s.slideId === target.slideId && s.elId === target.elId)))
    else selectMany(selection.concat(target))
  }

  function selectedElement() {
    const p = primary()
    return p ? elementOf(p.slideId, p.elId) : null
  }

  /** The selected elements that exist on the current slide, with their geometry. */
  function selectedEntries() {
    const out = []
    for (const s of selection) {
      const el = elementOf(s.slideId, s.elId)
      if (el) out.push({ slideId: s.slideId, elId: s.elId, el, g: geometryOf(el) })
    }
    return out
  }

  function unionOf(rects) {
    const x = Math.min(...rects.map((r) => r.x))
    const y = Math.min(...rects.map((r) => r.y))
    const r = Math.max(...rects.map((r) => r.x + r.w))
    const b = Math.max(...rects.map((r) => r.y + r.h))
    return { x, y, w: r - x, h: b - y }
  }

  function refreshSelection() {
    if (!box) return
    const entries = selectedEntries()
    multi.textContent = ''
    if (!entries.length) {
      box.hidden = true
      if (float) float.hidden = true
      return
    }
    const s = scale()
    const g = entries.length === 1 ? entries[0].g : unionOf(entries.map((e) => e.g))
    box.hidden = false
    box.classList.toggle('is-multi', entries.length > 1)
    box.style.left = `${g.x}px`
    box.style.top = `${g.y}px`
    box.style.width = `${g.w}px`
    box.style.height = `${g.h}px`
    box.style.outlineWidth = `${2 / s}px`
    const size = 14 / s
    for (const h of Object.values(handles)) {
      h.hidden = entries.length > 1 // resizing several at once is not a thing
      h.style.width = `${size}px`
      h.style.height = `${size}px`
      h.style.borderWidth = `${2 / s}px`
    }
    if (entries.length > 1) {
      for (const e of entries) {
        const thin = document.createElement('div')
        thin.className = 'ed-box-thin'
        thin.style.left = `${e.g.x}px`
        thin.style.top = `${e.g.y}px`
        thin.style.width = `${e.g.w}px`
        thin.style.height = `${e.g.h}px`
        thin.style.outlineWidth = `${1 / s}px`
        multi.appendChild(thin)
      }
    }
    positionFloat()
    refreshSpot()
  }

  function geometryOf(el) {
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
  }

  // ---- pointer: move / resize / marquee ------------------------------------------

  let drag = null

  function stagePoint(e) {
    const r = stage.getBoundingClientRect()
    const s = scale()
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
  }

  function onPointerDown(e) {
    if (e.button !== 0) return
    const focused = document.activeElement
    if (
      focused &&
      (panel?.contains(focused) || float?.contains(focused) || spotBar?.contains(focused))
    )
      focused.blur()
    if (spot && onSpotPointerDown(e)) return
    const handle = e.target.closest?.('.ed-handle')
    if (handle && selection.length === 1) {
      const el = selectedElement()
      if (!el) return
      startDrag(e, 'resize', el, handle.dataset.handle)
      return
    }
    const el = e.target.closest ? e.target.closest('.slide.is-active [data-el]') : null
    if (!el) {
      if (editing) return
      // empty stage: a marquee starts here; releasing without moving clears the selection
      startDrag(e, 'marquee', null, null)
      return
    }
    if (el.getAttribute('data-hidden') === 'true' && !revealHidden) return
    const target = { slideId: activeSlideId(), elId: el.dataset.el }
    if (editing && editing.elId === target.elId && editing.slideId === target.slideId) return
    if (e.shiftKey) {
      toggleInSelection(target)
      if (!isSelected(target.slideId, target.elId)) return
    } else if (!(isSelected(target.slideId, target.elId) && selection.length > 1)) {
      select(target)
    }
    startDrag(e, 'move', el, null)
  }

  function startDrag(e, mode, el, handle) {
    e.preventDefault()
    e.stopPropagation()
    const s = scale()
    const p = primary()
    const origins = new Map()
    for (const entry of selectedEntries()) origins.set(keyOf(entry.slideId, entry.elId), entry.g)
    drag = {
      mode,
      handle,
      startX: e.clientX / s,
      startY: e.clientY / s,
      start: stagePoint(e),
      origin: el ? geometryOf(el) : null,
      origins,
      moved: false,
      slideId: p ? p.slideId : activeSlideId(),
      elId: p ? p.elId : null,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  function onPointerMove(e) {
    if (!drag) return
    const s = scale()
    const dx = e.clientX / s - drag.startX
    const dy = e.clientY / s - drag.startY
    if (!drag.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    drag.moved = true
    if (drag.mode === 'marquee') {
      const cur = stagePoint(e)
      const x = Math.min(drag.start.x, cur.x)
      const y = Math.min(drag.start.y, cur.y)
      marquee.hidden = false
      marquee.style.left = `${x}px`
      marquee.style.top = `${y}px`
      marquee.style.width = `${Math.abs(cur.x - drag.start.x)}px`
      marquee.style.height = `${Math.abs(cur.y - drag.start.y)}px`
      marquee.style.outlineWidth = `${1 / s}px`
      return
    }
    if (float) float.classList.add('is-dragging')
    const o = drag.origin
    if (drag.mode === 'move') {
      let x = Math.round(o.x + dx)
      let y = Math.round(o.y + dy)
      clearGuides()
      if (snapEnabled) {
        const snapped = snapMove(x, y, o.w, o.h)
        x = snapped.x
        y = snapped.y
      }
      // every selected element follows the primary by the same (snapped) delta
      const ddx = x - o.x
      const ddy = y - o.y
      for (const [key, g] of drag.origins) {
        const slash = key.indexOf('/')
        set(key.slice(0, slash), key.slice(slash + 1), { x: g.x + ddx, y: g.y + ddy })
      }
      return
    }
    let { x, y, w, h } = o
    const hnd = drag.handle
    if (hnd.includes('e')) w = Math.max(20, Math.round(o.w + dx))
    if (hnd.includes('s')) h = Math.max(20, Math.round(o.h + dy))
    if (hnd.includes('w')) {
      w = Math.max(20, Math.round(o.w - dx))
      x = Math.round(o.x + o.w - w)
    }
    if (hnd.includes('n')) {
      h = Math.max(20, Math.round(o.h - dy))
      y = Math.round(o.y + o.h - h)
    }
    set(drag.slideId, drag.elId, { x, y, w, h })
  }

  function onPointerUp(e) {
    window.removeEventListener('pointermove', onPointerMove)
    clearGuides()
    if (float) float.classList.remove('is-dragging')
    if (drag?.mode === 'marquee') {
      marquee.hidden = true
      if (drag.moved) {
        const cur = stagePoint(e)
        const r = {
          x: Math.min(drag.start.x, cur.x),
          y: Math.min(drag.start.y, cur.y),
          w: Math.abs(cur.x - drag.start.x),
          h: Math.abs(cur.y - drag.start.y),
        }
        selectMany(elementsIn(r))
      } else select(null)
    } else if (drag?.moved) commit()
    drag = null
    refreshPanel()
  }

  // ---- hotspot mode: an image's jump regions are edited on the picture itself ----------
  // Regions are percent of the image box (the model's shape); the overlay works in stage px.

  const SPOT_MIN = 1 // percent: the smallest region a drag creates or a handle leaves
  const pct = (v) => Math.round(v * 10) / 10

  function spotHost() {
    return spot ? elementOf(spot.slideId, spot.elId) : null
  }

  /** The image's regions as the page shows them: the override when set, else the slot's. */
  function currentSpots() {
    if (!spot) return []
    const o = overrides[keyOf(spot.slideId, spot.elId)] || {}
    const slot = slotOf(spot.slideId, spot.elId)
    const list = o.hotspots != null ? o.hotspots : (slot?.hotspots ?? [])
    return list.map((h) => Object.assign({}, h))
  }

  /** Write the regions as an override; the slot's own list again means no override. */
  function writeSpots(list) {
    if (!spot) return
    const slot = slotOf(spot.slideId, spot.elId)
    const base = JSON.stringify(slot?.hotspots ?? [])
    set(spot.slideId, spot.elId, { hotspots: JSON.stringify(list) === base ? null : list })
  }

  /** A region's box in stage px, from the host's geometry. */
  function spotRect(h, g) {
    return {
      x: g.x + (h.x / 100) * g.w,
      y: g.y + (h.y / 100) * g.h,
      w: (h.w / 100) * g.w,
      h: (h.h / 100) * g.h,
    }
  }

  /** Stage px → percent of the host box, clamped to the picture. */
  function toPct(p, g) {
    return {
      x: Math.min(100, Math.max(0, ((p.x - g.x) / g.w) * 100)),
      y: Math.min(100, Math.max(0, ((p.y - g.y) / g.h) * 100)),
    }
  }

  /** Rounded to 0.1 and kept inside the picture, never thinner than SPOT_MIN. */
  function clampSpot(h) {
    const w = pct(Math.min(100, Math.max(SPOT_MIN, h.w)))
    const hh = pct(Math.min(100, Math.max(SPOT_MIN, h.h)))
    const x = pct(Math.min(100 - w, Math.max(0, h.x)))
    const y = pct(Math.min(100 - hh, Math.max(0, h.y)))
    return Object.assign({}, h, { x, y, w, h: hh })
  }

  function enterSpotMode(slideId, elId) {
    if (kindOf(slideId, elId) !== 'image' || !elementOf(slideId, elId)) return
    if (!spot || spot.slideId !== slideId || spot.elId !== elId) {
      if (!isSelected(slideId, elId) || selection.length > 1) select({ slideId, elId })
      spot = { slideId, elId, index: null }
    }
    document.body.classList.add('ed-spot')
    const host = spotHost()
    if (host) host.classList.add('ed-spot-host')
    buildSpotChrome()
    refreshSpot()
    refreshPanel()
  }

  function leaveSpotMode() {
    if (!spot) return
    const host = spotHost()
    if (host) host.classList.remove('ed-spot-host')
    spot = null
    spotDrag = null
    document.body.classList.remove('ed-spot')
    refreshSpot()
    refreshPanel()
  }

  function selectSpot(index) {
    if (!spot) return
    spot.index = index
    refreshSpot()
  }

  function deleteSpot() {
    if (!spot || spot.index == null) return
    const list = currentSpots()
    list.splice(spot.index, 1)
    spot.index = null
    writeSpots(list)
    commit()
    refreshSpot()
    refreshPanel()
  }

  /** Change fields of the selected region (an empty label is dropped). */
  function updateSpot(patch) {
    if (!spot || spot.index == null) return
    const list = currentSpots()
    const cur = list[spot.index]
    if (!cur) return
    const next = Object.assign({}, cur, patch)
    if (!next.label) delete next.label
    list[spot.index] = next
    writeSpots(list)
    commit()
    refreshSpot()
  }

  /** The page a new region jumps to: the next one in the deck (the last wraps to the first). */
  function defaultSpotTarget() {
    const ids = deck.ids || []
    const i = ids.indexOf(spot ? spot.slideId : '')
    return ids[(i + 1) % ids.length] || ids[0] || ''
  }

  function buildSpotChrome() {
    if (spotBox || !overlay) return
    spotBox = document.createElement('div')
    spotBox.className = 'ed-spot-box'
    spotBox.hidden = true
    for (const name of ['nw', 'ne', 'se', 'sw']) {
      const h = document.createElement('div')
      h.className = `ed-handle ed-spot-handle ed-handle-${name}`
      h.dataset.spotHandle = name
      spotBox.appendChild(h)
    }
    overlay.appendChild(spotBox)
    spotBar = document.createElement('div')
    spotBar.className = 'ed-spot-bar'
    spotBar.hidden = true
    spotBar.innerHTML = [
      '<span class="ed-lbl">Go to</span>',
      '<select data-spot-target title="Which page this hotspot jumps to"></select>',
      '<input type="text" data-spot-label placeholder="Label (shown on hover during playback)" title="Label">',
      `<button type="button" class="ed-ibtn" data-spot-delete title="Delete this hotspot (Delete)">${icon('trash')}</button>`,
      `<button type="button" class="ed-ibtn" data-spot-done title="Finish editing hotspots (Esc)">${icon('close')}</button>`,
    ].join('')
    document.body.appendChild(spotBar)
    const target = spotBar.querySelector('[data-spot-target]')
    target.addEventListener('change', (e) => updateSpot({ target: e.target.value }))
    const label = spotBar.querySelector('[data-spot-label]')
    label.addEventListener('change', (e) => updateSpot({ label: e.target.value.trim() }))
    // Enter or Esc in a field just leaves the field; the stage keys take over from there
    for (const field of [target, label])
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          field.blur()
        }
      })
    spotBar.querySelector('[data-spot-delete]').addEventListener('click', deleteSpot)
    spotBar.querySelector('[data-spot-done]').addEventListener('click', leaveSpotMode)
  }

  /** Place the selection box and the settings bar on the selected region (or hide them). */
  function refreshSpot() {
    if (!spotBox || !spotBar) return
    const host = spotHost()
    const list = currentSpots()
    const h = spot && spot.index != null ? list[spot.index] : null
    if (!spot || !host || !h) {
      spotBox.hidden = true
      spotBar.hidden = true
      return
    }
    const s = scale()
    const r = spotRect(h, geometryOf(host))
    spotBox.hidden = false
    spotBox.style.left = `${r.x}px`
    spotBox.style.top = `${r.y}px`
    spotBox.style.width = `${r.w}px`
    spotBox.style.height = `${r.h}px`
    spotBox.style.outlineWidth = `${2 / s}px`
    const size = 12 / s
    for (const hd of spotBox.querySelectorAll('.ed-spot-handle')) {
      hd.style.width = `${size}px`
      hd.style.height = `${size}px`
      hd.style.borderWidth = `${2 / s}px`
    }
    // the bar lists every other page by id and title, and sits under the region in page coordinates
    const sel = spotBar.querySelector('[data-spot-target]')
    const pages = (deck.ids || []).filter((id) => id !== spot.slideId)
    if (sel.dataset.pages !== pages.join(',')) {
      sel.innerHTML = pages
        .map((id) => {
          const text = `${id} · ${pageTitle(id)}`.replace(/ · $/, '')
          return `<option value="${escapeHtml(id)}">${escapeHtml(text)}</option>`
        })
        .join('')
      sel.dataset.pages = pages.join(',')
    }
    if (document.activeElement !== sel) sel.value = h.target
    const label = spotBar.querySelector('[data-spot-label]')
    if (document.activeElement !== label) label.value = h.label || ''
    spotBar.hidden = false
    const sr = stage.getBoundingClientRect()
    const bw = spotBar.offsetWidth
    const bh = spotBar.offsetHeight
    const left = sr.left + (r.x + r.w / 2) * s - bw / 2
    let top = sr.top + (r.y + r.h) * s + 8
    if (top + bh > window.innerHeight - 8) top = sr.top + r.y * s - bh - 8
    // never under the slide rail or the top toolbar, like the floating toolbar
    const minLeft = (pagesPanel ? pagesPanel.offsetWidth : 0) + 8
    const minTop = (panel ? panel.offsetHeight : 0) + 8
    spotBar.style.left = `${Math.round(Math.max(minLeft, Math.min(window.innerWidth - bw - 8, left)))}px`
    if (top < minTop) top = minTop
    spotBar.style.top = `${Math.round(top)}px`
  }

  /** Index of the topmost region under a stage point, or -1. */
  function spotAt(p, g) {
    const list = currentSpots()
    for (let i = list.length - 1; i >= 0; i--) {
      const r = spotRect(list[i], g)
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i
    }
    return -1
  }

  /**
   * Pointer down in hotspot mode: a corner handle resizes, a region moves, the empty picture
   * draws a new one; a press anywhere else ends the mode and is handled as usual.
   */
  function onSpotPointerDown(e) {
    const host = spotHost()
    if (!host?.closest('.slide.is-active')) {
      leaveSpotMode()
      return false
    }
    const g = geometryOf(host)
    const p = stagePoint(e)
    const handle = e.target.closest?.('.ed-spot-handle')
    const list = currentSpots()
    let mode
    if (handle && spot.index != null && list[spot.index]) {
      mode = { kind: 'resize', handle: handle.dataset.spotHandle, index: spot.index }
    } else {
      const inside = p.x >= g.x && p.x <= g.x + g.w && p.y >= g.y && p.y <= g.y + g.h
      if (!inside) {
        leaveSpotMode()
        return false
      }
      const hit = spotAt(p, g)
      if (hit !== -1) {
        selectSpot(hit)
        mode = { kind: 'move', index: hit }
      } else {
        selectSpot(null)
        mode = { kind: 'draw', index: null }
      }
    }
    e.preventDefault()
    e.stopPropagation()
    spotDrag = Object.assign(mode, {
      start: p,
      g,
      origin: mode.index != null ? Object.assign({}, list[mode.index]) : null,
      moved: false,
    })
    window.addEventListener('pointermove', onSpotMove)
    window.addEventListener('pointerup', onSpotUp, { once: true })
    return true
  }

  function onSpotMove(e) {
    if (!spotDrag || !spot) return
    const p = stagePoint(e)
    const dx = p.x - spotDrag.start.x
    const dy = p.y - spotDrag.start.y
    if (!spotDrag.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    spotDrag.moved = true
    const g = spotDrag.g
    const list = currentSpots()
    if (spotDrag.kind === 'draw') {
      const a = toPct(spotDrag.start, g)
      const b = toPct(p, g)
      const box = clampSpot({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
      })
      // the region exists as soon as the drag does, aimed at the next page until retargeted
      if (spotDrag.index == null) {
        list.push(Object.assign({ target: defaultSpotTarget() }, box))
        spotDrag.index = list.length - 1
        spot.index = spotDrag.index
      } else list[spotDrag.index] = Object.assign(list[spotDrag.index], box)
      writeSpots(list)
      refreshSpot()
      return
    }
    const o = spotDrag.origin
    const ddx = (dx / g.w) * 100
    const ddy = (dy / g.h) * 100
    let next
    if (spotDrag.kind === 'move') {
      next = clampSpot(Object.assign({}, o, { x: o.x + ddx, y: o.y + ddy }))
    } else {
      let { x, y, w, h } = o
      const hnd = spotDrag.handle
      if (hnd.includes('e')) w = o.w + ddx
      if (hnd.includes('s')) h = o.h + ddy
      if (hnd.includes('w')) {
        w = o.w - ddx
        x = o.x + o.w - w
      }
      if (hnd.includes('n')) {
        h = o.h - ddy
        y = o.y + o.h - h
      }
      if (w < SPOT_MIN) {
        if (hnd.includes('w')) x = o.x + o.w - SPOT_MIN
        w = SPOT_MIN
      }
      if (h < SPOT_MIN) {
        if (hnd.includes('n')) y = o.y + o.h - SPOT_MIN
        h = SPOT_MIN
      }
      next = clampSpot(Object.assign({}, o, { x, y, w, h }))
    }
    list[spotDrag.index] = next
    writeSpots(list)
    refreshSpot()
  }

  function onSpotUp() {
    window.removeEventListener('pointermove', onSpotMove)
    const d = spotDrag
    spotDrag = null
    if (!d || !spot) return
    if (d.kind === 'draw' && !d.moved) {
      // a plain click on the picture only drops the region selection
      refreshSpot()
      refreshPanel()
      return
    }
    commit()
    refreshSpot()
    refreshPanel()
    // a freshly drawn region most likely wants another target than the default
    if (d.kind === 'draw' && spotBar && !spotBar.hidden)
      spotBar.querySelector('[data-spot-target]').focus()
  }

  /** Every selectable element of the current slide whose box intersects the rect. */
  function elementsIn(r) {
    const slideId = activeSlideId()
    const out = []
    for (const el of stage.querySelectorAll('.slide.is-active [data-el]')) {
      if (el.getAttribute('data-hidden') === 'true' && !revealHidden) continue
      const g = geometryOf(el)
      if (g.x < r.x + r.w && g.x + g.w > r.x && g.y < r.y + r.h && g.y + g.h > r.y)
        out.push({ slideId, elId: el.dataset.el })
    }
    return out
  }

  function snapMove(x, y, w, h) {
    const xs = [0, W / 2, W]
    const ys = [0, H / 2, H]
    const slide = stage.querySelector('.slide.is-active')
    for (const other of slide.querySelectorAll('[data-el]')) {
      if (drag.origins.has(keyOf(drag.slideId, other.dataset.el))) continue
      if (other.getAttribute('data-hidden') === 'true') continue
      const g = geometryOf(other)
      xs.push(g.x, g.x + g.w / 2, g.x + g.w)
      ys.push(g.y, g.y + g.h / 2, g.y + g.h)
    }
    const tryAxis = (value, size, candidates) => {
      let best = null
      for (const edge of [0, size / 2, size]) {
        for (const c of candidates) {
          const d = c - (value + edge)
          if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d)))
            best = { d, line: c }
        }
      }
      return best
    }
    const sx = tryAxis(x, w, xs)
    const sy = tryAxis(y, h, ys)
    if (sx) {
      x += sx.d
      drawGuide('v', sx.line)
    }
    if (sy) {
      y += sy.d
      drawGuide('h', sy.line)
    }
    return { x, y }
  }

  function drawGuide(axis, at) {
    const g = document.createElement('div')
    g.className = `ed-guide ed-guide-${axis}`
    const thickness = `${1 / scale()}px`
    if (axis === 'v') {
      g.style.left = `${at}px`
      g.style.width = thickness
    } else {
      g.style.top = `${at}px`
      g.style.height = thickness
    }
    guides.appendChild(g)
  }

  function clearGuides() {
    if (guides) guides.textContent = ''
  }

  // ---- text editing ---------------------------------------------------------

  function onDoubleClick(e) {
    const el = e.target.closest ? e.target.closest('.slide.is-active [data-el]') : null
    if (!el) return
    const slideId = activeSlideId()
    const elId = el.dataset.el
    if (kindOf(slideId, elId) !== 'text') return
    e.preventDefault()
    e.stopPropagation()
    select({ slideId, elId })
    const slot = slotOf(slideId, elId)
    if (slot && DATA_SLOT_TYPES.has(slot.type)) {
      // charts, tables, code and icons are edited as rows of text in the floating toolbar
      const ta = float?.querySelector('[data-content]')
      if (ta) {
        ta.focus()
        ta.select()
      }
      return
    }
    startTextEdit(el, slideId, elId)
  }

  // ---- reveal steps (slides[].elements[].step, not an override) ----------------

  function setStep(slideId, elId, step) {
    const s = slidesById.get(slideId)
    const def = s?.elements.find((x) => x.id === elId)
    if (!def) return
    if (step) def.step = step
    else delete def.step
    const node = elementOf(slideId, elId)
    if (node) {
      if (step) node.dataset.step = String(step)
      else node.removeAttribute('data-step')
    }
    if (deck.rescan) deck.rescan()
  }

  /** The page transition: a deck field like steps; '' hands it back to the theme default. */
  function setTransitionSetting(value) {
    if (value) model.transition = value
    else delete model.transition
    syncModelScript()
    if (deck.setTransition) deck.setTransition(value)
    emit('deck:edit', { overrides: JSON.parse(snapshot()).o })
  }

  /** One page's own transition: a slide field like steps; '' hands it back to the deck's. */
  function setPageTransitionSetting(slideId, value) {
    const s = slidesById.get(slideId)
    if (!s) return
    if (value) s.transition = value
    else delete s.transition
    syncModelScript()
    if (deck.setPageTransition) deck.setPageTransition(slideId, value)
    emit('deck:edit', { overrides: JSON.parse(snapshot()).o })
  }

  /** The deck-wide motion switch: a deck field like steps, so it syncs and saves directly, outside undo. */
  function setMotionSetting(on) {
    if (on) delete model.motion
    else model.motion = 'off'
    syncModelScript()
    // the player follows the file from now on: drop this browser's remembered M choice
    if (deck.setMotion) deck.setMotion(on, false)
    emit('deck:edit', { overrides: JSON.parse(snapshot()).o })
  }

  function onStepChange(e) {
    const p = primary()
    if (!p) return
    const n = Math.floor(Number(e.target.value))
    setStep(p.slideId, p.elId, Number.isFinite(n) && n > 0 ? n : null)
    // steps live outside overrides, so commit() would see "no change": sync and notify directly
    syncModelScript()
    emit('deck:edit', { overrides: JSON.parse(snapshot()).o })
    refreshPanel()
  }

  // entrances live next to steps in slides[].elements; the theme default applies when unset
  function setEnter(slideId, elId, enter) {
    const s = slidesById.get(slideId)
    const def = s?.elements.find((x) => x.id === elId)
    if (!def) return
    if (enter) def.enter = enter
    else delete def.enter
    const node = elementOf(slideId, elId)
    if (node) {
      if (enter) node.dataset.enter = enter
      else node.removeAttribute('data-enter')
    }
  }

  function onEnterChange(e) {
    const p = primary()
    if (!p) return
    setEnter(p.slideId, p.elId, e.target.value || '')
    syncModelScript()
    emit('deck:edit', { overrides: JSON.parse(snapshot()).o })
    refreshPanel()
  }

  function onContentChange(e) {
    const p = primary()
    if (!p) return
    const text = e.target.value
    const base = slotText(slotOf(p.slideId, p.elId))
    set(p.slideId, p.elId, { text: text === base ? null : text })
    commit()
    refreshPanel()
  }

  /** The details textarea: same text rules as the content; empty removes the details the slot had. */
  function onDetailsChange(e) {
    const p = primary()
    if (!p) return
    const text = e.target.value.replace(/\n+$/, '')
    const slot = slotOf(p.slideId, p.elId)
    const base = slot?.details ? slotText(slot.details) : ''
    set(p.slideId, p.elId, { details: text === base ? null : text })
    commit()
    refreshPanel()
  }

  function startTextEdit(el, slideId, elId) {
    if (editing) commitTextEdit()
    editing = { el, slideId, elId }
    el.contentEditable = 'true'
    el.classList.add('ed-editing')
    el.focus()
    el.addEventListener('blur', commitTextEdit, { once: true })
  }

  function commitTextEdit() {
    if (!editing) return
    const { el, slideId, elId } = editing
    editing = null
    el.removeEventListener('blur', commitTextEdit)
    // emphasis and links survive a round trip: <em>word</em> is written back as *word* and
    // <a href="…">text</a> as [text](…); innermost first, so one nested in the other keeps both
    for (const node of Array.from(el.querySelectorAll('em, a')).reverse()) {
      const inner = node.textContent
      node.replaceWith(
        document.createTextNode(
          node.tagName === 'A' ? `[${inner}](${node.getAttribute('href')})` : `*${inner}*`,
        ),
      )
    }
    const text = el.innerText.replace(/\n+$/, '')
    el.contentEditable = 'false'
    el.classList.remove('ed-editing')
    const base = slotText(slotOf(slideId, elId))
    set(slideId, elId, { text: text === base ? null : text })
    commit()
    refreshPanel()
  }

  // ---- operations on the whole selection ---------------------------------------------

  function forSelection(fn) {
    for (const s of selection) fn(s.slideId, s.elId)
  }

  /** A style patch for every selected element (text kinds only when `textOnly`). */
  function applyStyle(patch, textOnly) {
    forSelection((slideId, elId) => {
      if (textOnly && kindOf(slideId, elId) !== 'text') return
      set(slideId, elId, { style: patch })
    })
    commit()
    refreshPanel()
  }

  function hideSelected() {
    if (!selection.length) return
    forSelection((slideId, elId) => set(slideId, elId, { hidden: true }))
    commit()
    select(null)
  }

  /** Every selected element carries a hidden override (they are selectable only while revealed). */
  const allHidden = () =>
    selection.length > 0 &&
    selection.every((s) => overrides[keyOf(s.slideId, s.elId)]?.hidden === true)

  /** The eye button: hides the selection, or shows it again when all of it is hidden. */
  function toggleHidden() {
    if (!selection.length) return
    if (!allHidden()) return hideSelected()
    forSelection((slideId, elId) => set(slideId, elId, { hidden: null }))
    commit()
    refreshPanel()
  }

  /** Align to the selection's bounding box, or to the slide (always when only one is selected). */
  function alignSelection(edge, toSlide) {
    const entries = selectedEntries()
    if (!entries.length) return
    const target =
      toSlide || entries.length < 2 ? { x: 0, y: 0, w: W, h: H } : unionOf(entries.map((e) => e.g))
    for (const e of entries) {
      const patch = {}
      if (edge === 'left') patch.x = target.x
      else if (edge === 'centerX') patch.x = Math.round(target.x + target.w / 2 - e.g.w / 2)
      else if (edge === 'right') patch.x = target.x + target.w - e.g.w
      else if (edge === 'top') patch.y = target.y
      else if (edge === 'middle') patch.y = Math.round(target.y + target.h / 2 - e.g.h / 2)
      else if (edge === 'bottom') patch.y = target.y + target.h - e.g.h
      set(e.slideId, e.elId, patch)
    }
    commit()
    refreshPanel()
  }

  /** Equal gaps between three or more elements; the outermost two stay where they are. */
  function distributeSelection(axis) {
    const entries = selectedEntries()
    if (entries.length < 3) return
    const pos = axis === 'h' ? 'x' : 'y'
    const size = axis === 'h' ? 'w' : 'h'
    const sorted = entries.slice().sort((a, b) => a.g[pos] - b.g[pos])
    const first = sorted[0]
    const lastEntry = sorted[sorted.length - 1]
    const span = lastEntry.g[pos] + lastEntry.g[size] - first.g[pos]
    const total = sorted.reduce((n, e) => n + e.g[size], 0)
    const gap = (span - total) / (sorted.length - 1)
    let cursor = first.g[pos]
    for (const e of sorted) {
      set(e.slideId, e.elId, { [pos]: Math.round(cursor) })
      cursor += e.g[size] + gap
    }
    commit()
    refreshPanel()
  }

  /** z above (or below) every other element of the slide, override or rendered z-index. */
  function zOrder(where) {
    const entries = selectedEntries()
    if (!entries.length) return
    const slideId = entries[0].slideId
    const slide = slidesById.get(slideId)
    const zs = [0]
    for (const e of slide.elements) {
      if (isSelected(slideId, e.id)) continue
      const o = overrides[keyOf(slideId, e.id)]
      if (o && o.z != null) {
        zs.push(o.z)
        continue
      }
      const el = elementOf(slideId, e.id)
      const z = el ? Number.parseInt(getComputedStyle(el).zIndex, 10) : 0
      zs.push(Number.isFinite(z) ? z : 0)
    }
    const z = where === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
    forSelection((sId, elId) => set(sId, elId, { z }))
    commit()
    refreshPanel()
  }

  function copyStyle() {
    const p = primary()
    if (!p) return
    const o = overrides[keyOf(p.slideId, p.elId)]
    copiedStyle = Object.assign({}, o?.style)
    refreshPanel()
  }

  /** Replace the style override of every selected element with the copied one. */
  function pasteStyle() {
    if (!copiedStyle || !selection.length) return
    const patch = {}
    for (const k of Object.keys(STYLE_PROPS)) patch[k] = null
    Object.assign(patch, copiedStyle)
    applyStyle(patch, false)
  }

  // ---- keyboard ---------------------------------------------------------------

  let nudgeTimer = 0

  function onKeyDown(e) {
    const tag = e.target?.tagName
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return
    if (editing) {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        e.stopImmediatePropagation()
        commitTextEdit()
      }
      return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    const handled = () => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    if (mod && key === 'z') {
      handled()
      if (e.shiftKey) redo()
      else undo()
      return
    }
    if (mod && key === 'y') {
      handled()
      redo()
      return
    }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      handled()
      movePage(activeSlideId(), e.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (mod && e.shiftKey && key === 'h') {
      handled()
      toggleHiddenPage(activeSlideId())
      return
    }
    if (mod && !e.shiftKey && !e.altKey && key === 'a') {
      handled()
      selectMany(elementsIn({ x: 0, y: 0, w: W, h: H }))
      return
    }
    if (mod && e.altKey && key === 'c') {
      handled()
      copyStyle()
      return
    }
    if (mod && e.altKey && key === 'v') {
      handled()
      pasteStyle()
      return
    }
    if (palette && e.key === 'Escape') {
      handled()
      closePalette()
      return
    }
    if (spot) {
      // hotspot mode owns Esc, Delete and the arrows: they act on the region, never the picture
      if (e.key === 'Escape') {
        handled()
        leaveSpotMode()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        handled()
        deleteSpot()
        return
      }
      const arrow = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.key
      ]
      if (arrow && spot.index != null) {
        handled()
        const n = e.shiftKey ? 2 : 0.5
        const cur = currentSpots()[spot.index]
        if (cur) updateSpot(clampSpot({ ...cur, x: cur.x + arrow[0] * n, y: cur.y + arrow[1] * n }))
        return
      }
    }
    if (!selection.length) return
    const step = e.shiftKey ? 10 : 1
    const nudge = (dx, dy) => {
      handled()
      for (const entry of selectedEntries())
        set(entry.slideId, entry.elId, { x: entry.g.x + dx, y: entry.g.y + dy })
      clearTimeout(nudgeTimer)
      nudgeTimer = setTimeout(() => {
        commit()
        refreshPanel()
      }, 250)
    }
    switch (e.key) {
      case 'ArrowLeft':
        return nudge(-step, 0)
      case 'ArrowRight':
        return nudge(step, 0)
      case 'ArrowUp':
        return nudge(0, -step)
      case 'ArrowDown':
        return nudge(0, step)
      case 'Delete':
      case 'Backspace':
        handled()
        hideSelected()
        return
      case 'Escape':
        handled()
        select(null)
        return
      default:
    }
  }

  function onSlideChange() {
    select(null)
    renderPagesList(false)
    refreshTopbar()
  }

  // ---- slide rail: live thumbnails, playback order and hidden slides (model.pages) ----

  function pageTitle(id) {
    const t = slidesById.get(id)?.slots.title
    return t ? slotText(t).replace(/\*/g, '').slice(0, 40) : ''
  }

  function buildPagesPanel() {
    pagesPanel = document.createElement('aside')
    pagesPanel.className = 'ed-pages'
    pagesPanel.innerHTML = [
      '<div class="ed-pages-head"><span class="ed-panel-title">Slides</span>',
      '<span class="ed-pages-hint" title="Click to jump · drag or ↑↓ to reorder playback · hidden pages are skipped&#10;Ctrl+Shift+↑↓ moves the current page, Ctrl+Shift+H hides or shows it">Drag thumbnails to reorder</span></div>',
      '<ol class="ed-pages-list"></ol>',
      '<div class="ed-pages-note" hidden>Differs from the story: the playback order or hidden pages have changed. story.md is still the source of truth; regenerating pages keeps this.</div>',
    ].join('')
    document.body.appendChild(pagesPanel)
    const list = pagesPanel.querySelector('.ed-pages-list')
    list.addEventListener('click', (e) => {
      const row = e.target.closest('li[data-page]')
      if (!row) return
      const id = row.dataset.page
      const btn = e.target.closest('button[data-page-action]')
      if (!btn) {
        if (deck.pages().visible.includes(id)) deck.go(id)
        return
      }
      if (btn.dataset.pageAction === 'up') movePage(id, -1)
      else if (btn.dataset.pageAction === 'down') movePage(id, 1)
      else if (btn.dataset.pageAction === 'toggle') toggleHiddenPage(id)
    })
    let dragId = null
    list.addEventListener('dragstart', (e) => {
      const row = e.target.closest('li[data-page]')
      if (!row) return
      dragId = row.dataset.page
      e.dataTransfer.effectAllowed = 'move'
    })
    list.addEventListener('dragover', (e) => {
      if (!dragId) return
      e.preventDefault()
      const row = e.target.closest('li[data-page]')
      for (const li of list.children) li.classList.toggle('is-dragover', li === row)
    })
    list.addEventListener('drop', (e) => {
      const row = e.target.closest('li[data-page]')
      for (const li of list.children) li.classList.remove('is-dragover')
      if (!row || !dragId) return
      e.preventDefault()
      placeBefore(dragId, row.dataset.page)
      dragId = null
    })
    list.addEventListener('dragend', () => {
      dragId = null
      for (const li of list.children) li.classList.remove('is-dragover')
    })
    renderPagesList(true)
  }

  let listKey = ''

  /** Rebuild the rail rows when order or hidden pages changed; otherwise only move the highlight. */
  function renderPagesList(force) {
    if (!pagesPanel) return
    const eff = deck.pages()
    const activeId = deck.ids[deck.current]
    const list = pagesPanel.querySelector('.ed-pages-list')
    const key = JSON.stringify([eff.order, eff.hidden])
    if (force || key !== listKey) {
      listKey = key
      list.innerHTML = eff.order
        .map((id) => {
          const hidden = eff.hidden.includes(id)
          const no = hidden ? '－' : pad2(eff.visible.indexOf(id) + 1)
          return (
            `<li data-page="${escapeHtml(id)}" draggable="true" class="${hidden ? 'is-hidden' : ''}"` +
            ` title="${escapeHtml(id)} · ${escapeHtml(pageTitle(id))}">` +
            `<span class="ed-page-no">${no}</span>` +
            '<div class="ed-thumb"></div>' +
            '<span class="ed-page-actions">' +
            `<button type="button" data-page-action="up" title="Move earlier">${icon('up')}</button>` +
            `<button type="button" data-page-action="down" title="Move later">${icon('down')}</button>` +
            `<button type="button" data-page-action="toggle" title="${hidden ? 'Show' : 'Hide'}">${icon(hidden ? 'eye' : 'eyeOff')}<span>${hidden ? 'Show' : 'Hide'}</span></button>` +
            '</span></li>'
          )
        })
        .join('')
      paintAllThumbs()
    }
    for (const li of list.children) li.classList.toggle('is-current', li.dataset.page === activeId)
    list.querySelector('li.is-current')?.scrollIntoView({ block: 'nearest' })
    pagesPanel.querySelector('.ed-pages-note').hidden = window.__pages.followsStory(
      deck.storyIds(),
      model.pages,
    )
  }

  /** A thumbnail is the real slide, cloned and scaled down; it never takes pointer events. */
  function paintThumb(id) {
    const host = pagesPanel?.querySelector(`li[data-page="${id}"] .ed-thumb`)
    const section = stage.querySelector(`:scope > .slide[data-slide="${id}"]`)
    if (!host || !section) return
    const clone = section.cloneNode(true)
    clone.classList.remove('is-active')
    clone.removeAttribute('data-hidden-slide')
    for (const n of clone.querySelectorAll('.is-pending')) n.classList.remove('is-pending')
    for (const n of clone.querySelectorAll('[contenteditable]')) {
      n.removeAttribute('contenteditable')
      n.classList.remove('ed-editing')
    }
    clone.style.transform = `scale(${host.clientWidth / W})`
    host.replaceChildren(clone)
  }

  function paintAllThumbs() {
    if (!pagesPanel) return
    for (const li of pagesPanel.querySelectorAll('li[data-page]')) paintThumb(li.dataset.page)
  }

  let thumbTimer = 0
  function scheduleThumb(id) {
    if (!pagesPanel || !id) return
    clearTimeout(thumbTimer)
    thumbTimer = setTimeout(() => paintThumb(id), 120)
  }

  function writePages(order, hidden) {
    const story = deck.storyIds()
    const pages = {}
    if (order.some((id, i) => id !== story[i])) pages.order = order
    if (hidden.length) pages.hidden = hidden
    if (Object.keys(pages).length) model.pages = pages
    else delete model.pages
    deck.setPages(model.pages)
    commit()
    renderPagesList(false)
  }

  function movePage(id, delta) {
    const eff = deck.pages()
    const order = eff.order.slice()
    const i = order.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= order.length) return
    order.splice(i, 1)
    order.splice(j, 0, id)
    writePages(order, eff.hidden)
  }

  function placeBefore(id, beforeId) {
    if (id === beforeId) return
    const eff = deck.pages()
    const order = eff.order.filter((x) => x !== id)
    const at = order.indexOf(beforeId)
    order.splice(at === -1 ? order.length : at, 0, id)
    writePages(order, eff.hidden)
  }

  function toggleHiddenPage(id) {
    const eff = deck.pages()
    const hidden = eff.hidden.includes(id)
      ? eff.hidden.filter((x) => x !== id)
      : eff.hidden.concat(id)
    if (hidden.length >= eff.order.length) return // the last visible slide stays
    writePages(eff.order, hidden)
  }

  // ---- top toolbar --------------------------------------------------------------

  function buildTopbar() {
    panel = document.createElement('div')
    panel.className = 'ed-panel ed-topbar'
    panel.innerHTML = [
      '<div class="ed-tb-group ed-tb-mode"><span class="ed-dot"></span>Edit mode</div>',
      '<div class="ed-tb-sep"></div>',
      '<div class="ed-tb-group">',
      `<button type="button" class="ed-btn" data-action="undo" title="Undo (Ctrl+Z)">${icon('undo')}<span>Undo</span><kbd>Ctrl+Z</kbd></button>`,
      `<button type="button" class="ed-btn" data-action="redo" title="Redo (Ctrl+Y)">${icon('redo')}<span>Redo</span><kbd>Ctrl+Y</kbd></button>`,
      '</div>',
      '<div class="ed-tb-sep"></div>',
      '<div class="ed-tb-group">',
      `<label class="ed-toggle" title="While dragging, snap to the slide edges, the centre lines and other elements"><input type="checkbox" data-toggle="snap" checked>${icon('magnet')}<span>Snap to guides</span></label>`,
      `<label class="ed-toggle" title="Show the hidden elements so they can be selected again"><input type="checkbox" data-toggle="reveal">${icon('eye')}<span>Show hidden items</span></label>`,
      `<label class="ed-toggle" title="Elements appear step by step with their entrance effects. When off, every element shows at once and each press turns the page (saved to deck.json; press M during playback to override it in this browser)"><input type="checkbox" data-toggle="motion"${model.motion === 'off' ? '' : ' checked'}>${icon('play')}<span>Animations</span></label>`,
      `<label class="ed-toggle" title="Keep the element toolbar as a panel on the right with every group open, instead of floating next to the selection; remembered by this browser"><input type="checkbox" data-toggle="dock"${docked ? ' checked' : ''}>${icon('objRight')}<span>Side panel</span></label>`,
      '<div class="ed-ctl ed-tb-select"><span class="ed-lbl">Transition</span><select data-transition title="The deck: how one slide changes to the next, saved to deck.json; “Theme” follows the theme pack’s source template"><option value="">Theme</option><option value="none">None</option><option value="rise">Rise</option><option value="settle">Settle</option><option value="dissolve">Dissolve</option><option value="breath">Breath</option><option value="fade">Fade</option><option value="push">Push</option><option value="lift">Lift</option></select><select data-page-transition title="This page only, played when it comes in and saved to deck.json; “Deck” follows the deck’s. The scaffold writes Breath on a pause page and Settle on a hero page after the first"><option value="">Deck</option><option value="none">None</option><option value="rise">Rise</option><option value="settle">Settle</option><option value="dissolve">Dissolve</option><option value="breath">Breath</option><option value="fade">Fade</option><option value="push">Push</option><option value="lift">Lift</option></select></div>',
      '</div>',
      '<div class="ed-tb-sep"></div>',
      `<button type="button" class="ed-btn" data-action="download" title="Save the current model as deck.json">${icon('download')}<span><span class="ed-long">Download </span>deck.json</span></button>`,
      `<button type="button" class="ed-btn" data-action="download-html" hidden title="Save the deck as one HTML file with your edits: rendered on disk with the images inlined while the dev server runs, otherwise this page as it is (pictures keep their relative paths)">${icon('download')}<span><span class="ed-long">Download </span>deck.html</span></button>`,
      '<div class="ed-tb-spacer"></div>',
      '<div class="ed-tb-status" data-status></div>',
      '<span class="ed-tb-help" title="Click an element to drag or resize · Shift+click or drag on empty space to select several · Ctrl+A selects the page · double-click to edit text · arrow keys nudge (Shift: 10px) · Delete hides · Esc clears the selection&#10;Ctrl+Z undo · Ctrl+Y redo · Ctrl+Alt+C copy style · Ctrl+Alt+V paste style · Ctrl+Shift+↑↓ move the current page · Ctrl+Shift+H hide or show the current page · ←→ turn the page with nothing selected · F fullscreen · E leave">?</span>',
      `<button type="button" class="ed-btn" data-action="fullscreen" title="Fill the screen with the deck (F; Esc or F again leaves)">${icon('expand')}<span>Fullscreen</span><kbd>F</kbd></button>`,
      `<button type="button" class="ed-btn ed-btn-primary" data-action="exit" title="Leave edit mode and go back to playback (E)">${icon('play')}<span>Present</span><kbd>E</kbd></button>`,
    ].join('')
    document.body.appendChild(panel)
    panel.querySelector('[data-toggle="snap"]').addEventListener('change', (e) => {
      snapEnabled = e.target.checked
    })
    panel.querySelector('[data-toggle="reveal"]').addEventListener('change', (e) => {
      setRevealHidden(e.target.checked)
    })
    panel.querySelector('[data-toggle="motion"]').addEventListener('change', (e) => {
      setMotionSetting(e.target.checked)
    })
    panel.querySelector('[data-toggle="dock"]').addEventListener('change', (e) => {
      setDocked(e.target.checked)
    })
    const transitionSelect = panel.querySelector('[data-transition]')
    // the pre-T-0036 name plays as push, so that is what the menu shows for it
    transitionSelect.value = model.transition === 'slide-left' ? 'push' : model.transition || ''
    transitionSelect.addEventListener('change', (e) => {
      setTransitionSetting(e.target.value)
    })
    panel.querySelector('[data-page-transition]').addEventListener('change', (e) => {
      setPageTransitionSetting(activeSlideId(), e.target.value)
    })
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]')
      if (!btn) return
      if (btn.dataset.action === 'undo') undo()
      else if (btn.dataset.action === 'redo') redo()
      else if (btn.dataset.action === 'exit') exit()
      else if (btn.dataset.action === 'fullscreen') deck.fullscreen?.()
      else if (btn.dataset.action === 'download') exportFile()
      else if (btn.dataset.action === 'download-html') exportHtml()
    })
    refreshTopbar()
  }

  function refreshTopbar() {
    if (!panel) return
    panel.querySelector('[data-action="undo"]').disabled = history.length === 0
    panel.querySelector('[data-action="redo"]').disabled = future.length === 0
    // the current page's own transition (the pre-T-0036 name plays as push)
    const pageSelect = panel.querySelector('[data-page-transition]')
    const own = slidesById.get(activeSlideId())?.transition || ''
    if (document.activeElement !== pageSelect)
      pageSelect.value = own === 'slide-left' ? 'push' : own
    // the portable HTML comes from the dev server (it announces itself after the editor loads), or
    // from the page itself when the renderer kept its pristine copy
    panel.querySelector('[data-action="download-html"]').hidden = !(hasDevServer() || hasPortable())
  }

  let statusTimer = 0
  /** A line in the top bar for a moment (an empty text clears it). */
  function setStatus(text) {
    const el = panel?.querySelector('[data-status]')
    if (!el) return
    el.textContent = text
    clearTimeout(statusTimer)
    if (text)
      statusTimer = setTimeout(() => {
        if (el.textContent === text) el.textContent = ''
      }, 8000)
  }

  // ---- theme tokens, read back from :root (names only; no theme id is known here) ------

  /** Every `--color-*` custom property declared on :root, in declaration order. */
  function themeColors() {
    const out = []
    const seen = new Set()
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch (_) {
        continue
      }
      for (const rule of rules) {
        if (rule.selectorText !== ':root') continue
        for (let i = 0; i < rule.style.length; i++) {
          const name = rule.style[i]
          if (!name.startsWith('--color-') || name.endsWith('-use') || seen.has(name)) continue
          seen.add(name)
          // the renderer writes each token's purpose next to it as a CSS string (--color-<name>-use)
          const use = rule.style
            .getPropertyValue(`${name}-use`)
            .trim()
            .replace(/^"(.*)"$/s, '$1')
            .replace(/\\(["\\])/g, '$1')
          out.push({ name: name.slice(8), value: rule.style.getPropertyValue(name).trim(), use })
        }
      }
    }
    return out
  }

  function fontOptions() {
    const cs = getComputedStyle(document.documentElement)
    const display = cs.getPropertyValue('--font-display').trim()
    const body = cs.getPropertyValue('--font-body').trim()
    const opts = []
    if (display) opts.push({ label: 'Theme display font', value: display })
    if (body && body !== display) opts.push({ label: 'Theme body font', value: body })
    opts.push(
      {
        label: 'Noto Sans TC',
        value: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
      },
      { label: 'Noto Serif TC', value: "'Noto Serif TC', 'Songti TC', 'PMingLiU', serif" },
      { label: 'System sans-serif', value: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
      { label: 'Monospace', value: "ui-monospace, 'Cascadia Code', Consolas, monospace" },
    )
    return opts
  }

  // ---- floating toolbar (follows the selection) ------------------------------------

  const fields = {}
  let themeColours = [] // the theme's --color-* tokens, read once when the toolbar is built
  const ENTER_OPTIONS = [
    ['fade-up', 'Fade up'],
    ['fade', 'Fade'],
    ['scale-in', 'Zoom in'],
    ['slide-left', 'Slide left'],
    ['slide-right', 'Slide right'],
    ['wipe', 'Wipe'],
    ['pop', 'Pop'],
    ['blur', 'Blur in'],
    ['cascade', 'Cascade'],
    ['grow', 'Grow (bars, rings)'],
    ['draw', 'Draw (lines)'],
    ['count', 'Count up'],
  ]
  // number field + slider pairs: the slider's range, the number field's floor, the scale between
  // the shown unit and the override (opacity is shown as a percentage), the decimals shown, and
  // whether only text elements take the value
  const RANGES = {
    fontSize: { min: 12, max: 240, step: 1, floor: 8, text: true },
    lineHeight: { min: 0.8, max: 2.4, step: 0.05, floor: 0.5, text: true, digits: 2 },
    letterSpacing: { min: -2, max: 20, step: 0.5, text: true, digits: 1 },
    opacity: { min: 0, max: 100, step: 5, floor: 0, scale: 100 },
    borderRadius: { min: 0, max: 80, step: 1, floor: 0 },
  }

  /** A number field with a slider beside it; the font size also gets −2 / +2 buttons. */
  function sliderCtl(prop, label, title, cls) {
    const r = RANGES[prop]
    const scale = r.scale ? ` data-scale="${r.scale}"` : ''
    const floor = r.floor == null ? '' : ` min="${r.floor}"`
    const stepper = (d) =>
      prop === 'fontSize'
        ? `<button type="button" class="ed-ibtn" data-size-step="${d}" title="${d < 0 ? 'Smaller (−2)' : 'Larger (+2)'}">${icon(d < 0 ? 'minus' : 'plus')}</button>`
        : ''
    return (
      `<div class="ed-ctl ed-slider${cls ? ` ${cls}` : ''}"><span class="ed-lbl">${label}</span>` +
      stepper(-2) +
      `<input type="number" class="ed-num" data-style="${prop}"${scale}${floor} step="${r.step}" title="${title}">` +
      stepper(2) +
      `<input type="range" class="ed-range" data-style-range="${prop}"${scale} min="${r.min}" max="${r.max}" step="${r.step}" title="${title}">` +
      '</div>'
    )
  }

  /** A button showing the current colour of one property; it opens that property's palette. */
  const colourCtl = (prop, label, title) =>
    `<div class="ed-ctl ed-colour-ctl"><span class="ed-lbl">${label}</span><button type="button" class="ed-colour" data-palette="${prop}" title="${title}" aria-haspopup="dialog" aria-expanded="false"><span class="ed-colour-dot"></span><span class="ed-colour-name">Default</span>${icon('down')}</button></div>`

  /** The palette of one property: every theme colour by name, the theme default, a custom colour. */
  function buildPalette(prop, label, colours) {
    const node = document.createElement('div')
    node.className = 'ed-palette'
    node.hidden = true
    node.dataset.palette = prop
    node.innerHTML = [
      `<div class="ed-pal-head"><span>${label}</span><button type="button" class="ed-ibtn" data-pal-close title="Close">${icon('close')}</button></div>`,
      '<div class="ed-pal-list">',
      ...colours.map(
        (c) =>
          `<button type="button" class="ed-chip" data-swatch-for="${prop}" data-color="${escapeHtml(c.value)}" title="${escapeHtml(c.value)}" style="--chip:${escapeHtml(c.value)}"><i></i><span>${escapeHtml(c.name)}</span><small>${escapeHtml(c.use || '')}</small></button>`,
      ),
      '</div>',
      '<div class="ed-pal-foot">',
      `<button type="button" class="ed-chip ed-chip-clear" data-swatch-for="${prop}" data-color="" title="Remove the colour override and use the theme’s colour"><i>${icon('close')}</i><span>Theme default</span></button>`,
      `<label class="ed-swatch" title="Pick any colour"><input type="color" data-style="${prop}" id="ed-${prop}"><span>Custom…</span></label>`,
      '</div>',
    ].join('')
    node.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn) return
      if ('palClose' in btn.dataset) closePalette()
      else if (btn.dataset.swatchFor && selection.length)
        applyStyle({ [btn.dataset.swatchFor]: btn.dataset.color || null }, true)
    })
    document.body.appendChild(node)
    return node
  }

  function buildFloat() {
    float = document.createElement('div')
    float.className = 'ed-float'
    float.hidden = true
    applyDock()
    const weights = ['300', '400', '500', '600', '700', '800', '900']
    themeColours = themeColors()
    const fonts = fontOptions()
    float.innerHTML = [
      // 1. text: the font and its size (an image gets its own tools here)
      '<div class="ed-float-row ed-float-main" data-title="Text">',
      '<span class="ed-key" data-field="key"></span>',
      `<div class="ed-ctl ed-text-only"><span class="ed-lbl">Font</span><select class="ed-font" data-style="fontFamily" title="Font"><option value="">Default</option>${fonts.map((f) => `<option value="${escapeHtml(f.value)}">${escapeHtml(f.label)}</option>`).join('')}</select></div>`,
      sliderCtl('fontSize', 'Size', 'Font size (px)', 'ed-text-only'),
      '<div class="ed-ctl ed-seg ed-text-only" title="Bold, italic, underline">',
      `<button type="button" class="ed-ibtn" data-toggle-style="fontWeight" data-value="700" title="Bold">${icon('bold')}</button>`,
      `<button type="button" class="ed-ibtn" data-toggle-style="fontStyle" data-value="italic" title="Italic">${icon('italic')}</button>`,
      `<button type="button" class="ed-ibtn" data-toggle-style="textDecoration" data-value="underline" title="Underline">${icon('underline')}</button>`,
      '</div>',
      '<div class="ed-ctl ed-seg ed-text-only" data-seg="textAlign" title="Text alignment">',
      `<button type="button" class="ed-ibtn" data-seg-value="left" title="Align text left">${icon('alignLeft')}</button>`,
      `<button type="button" class="ed-ibtn" data-seg-value="center" title="Centre text">${icon('alignCenter')}</button>`,
      `<button type="button" class="ed-ibtn" data-seg-value="right" title="Align text right">${icon('alignRight')}</button>`,
      '</div>',
      `<label class="ed-btn ed-file ed-image-only" title="Replace with an image file from this computer">${icon('image')}<span>Replace image</span><input type="file" accept="image/*" data-image id="ed-image"></label>`,
      `<button type="button" class="ed-btn ed-image-only" data-action="hotspots" title="Clickable areas: press and drag on the image to draw an area that jumps to another slide when clicked; drag or pull a corner to adjust, pick the target slide under the box; Esc to finish">${icon('spot')}<span>Clickable areas</span></button>`,
      '</div>',
      // 2. text style: weight, spacing and colours
      '<div class="ed-float-row ed-float-style ed-text-only" data-title="Text style">',
      `<div class="ed-ctl"><span class="ed-lbl">Weight</span><select data-style="fontWeight" title="Font weight"><option value="">Default</option>${weights.map((w) => `<option value="${w}">${w}</option>`).join('')}</select></div>`,
      sliderCtl('lineHeight', 'Line height', 'Line height, as a multiple of the font size'),
      sliderCtl('letterSpacing', 'Letter spacing', 'Space between letters (px)'),
      colourCtl('color', 'Text colour', 'Text colour: one of the theme colours, or a custom one'),
      colourCtl(
        'background',
        'Fill',
        'Fill behind the element: one of the theme colours, or a custom one',
      ),
      '</div>',
      // 3. content boxes: data slots edit their rows here; expandable content when the element has some
      '<div class="ed-float-row ed-data-only ed-titled" data-title="Content"><label class="ed-content-lbl"><small>One item per line; charts as “label | value”, tables with “|” between cells, icons by name, tabs open a panel with “## label”</small><textarea data-content rows="5" spellcheck="false"></textarea></label></div>',
      `<div class="ed-float-row ed-details-only ed-titled" data-title="Expandable content"><label class="ed-content-lbl"><small>Opens when this element is clicked during playback; one paragraph per line, clear it to remove</small><textarea data-details rows="3" spellcheck="false"></textarea></label><button type="button" class="ed-ibtn ed-row-close" data-action="close-details" title="Close this box (the content stays)">${icon('close')}</button></div>`,
      // 4. element: what applies to any element
      '<div class="ed-float-row ed-float-element" data-title="Element">',
      `<button type="button" class="ed-ibtn" data-action="hide" data-state="visible" title="Hide the selected elements (Delete)">${icon('eyeOff')}<span>Hide</span></button>`,
      `<button type="button" class="ed-btn" data-action="copy-style" title="Copy the selected element’s style (Ctrl+Alt+C)">${icon('brush')}<span>Copy style</span></button>`,
      `<button type="button" class="ed-btn" data-action="paste-style" title="Apply the copied style to the selected elements (Ctrl+Alt+V)">${icon('paste')}<span>Paste style</span></button>`,
      `<button type="button" class="ed-btn" data-action="reset" title="Remove every change made to the selected elements in the editor and go back to the generated slide">${icon('reset')}<span>Reset to generated</span></button>`,
      `<button type="button" class="ed-ibtn" data-action="more" title="More: position and size, appearance, arrange, animation, expandable content" aria-expanded="false">${icon('more')}</button>`,
      '</div>',
      // 5. arrange: several elements against each other, or one against the slide
      '<div class="ed-float-row ed-float-arrange ed-titled" data-title="Arrange">',
      '<div class="ed-ctl ed-seg" title="Align the selected elements">',
      `<button type="button" class="ed-ibtn" data-align="left" title="Align left edges">${icon('objLeft')}</button>`,
      `<button type="button" class="ed-ibtn" data-align="centerX" title="Centre horizontally">${icon('objCenterX')}</button>`,
      `<button type="button" class="ed-ibtn" data-align="right" title="Align right edges">${icon('objRight')}</button>`,
      `<button type="button" class="ed-ibtn" data-align="top" title="Align top edges">${icon('objTop')}</button>`,
      `<button type="button" class="ed-ibtn" data-align="middle" title="Centre vertically">${icon('objMiddle')}</button>`,
      `<button type="button" class="ed-ibtn" data-align="bottom" title="Align bottom edges">${icon('objBottom')}</button>`,
      '</div>',
      '<div class="ed-ctl ed-seg" title="Space evenly (three or more elements)">',
      `<button type="button" class="ed-ibtn" data-distribute="h" title="Space evenly, left to right">${icon('distH')}</button>`,
      `<button type="button" class="ed-ibtn" data-distribute="v" title="Space evenly, top to bottom">${icon('distV')}</button>`,
      '</div>',
      '<div class="ed-ctl ed-seg" title="Which element is in front">',
      `<button type="button" class="ed-ibtn" data-z="front" title="Bring to front">${icon('front')}</button>`,
      `<button type="button" class="ed-ibtn" data-z="back" title="Send to back">${icon('back')}</button>`,
      '</div>',
      '<label class="ed-toggle" title="Align to the whole slide instead of to the selection (a single element always aligns to the slide)"><input type="checkbox" data-align-slide><span>Align to slide</span></label>',
      '</div>',
      // 6. behind "more" when floating, always open when docked
      '<div class="ed-float-more" hidden>',
      '<div class="ed-float-row ed-float-geometry ed-titled" data-title="Position and size">',
      '<div class="ed-ctl ed-half"><span class="ed-lbl">X</span><input type="number" class="ed-num" data-prop="x" step="1" title="Left edge (px)"></div>',
      '<div class="ed-ctl ed-half"><span class="ed-lbl">Y</span><input type="number" class="ed-num" data-prop="y" step="1" title="Top edge (px)"></div>',
      '<div class="ed-ctl ed-half"><span class="ed-lbl">Width</span><input type="number" class="ed-num" data-prop="w" step="1" min="20" title="Width (px)"></div>',
      '<div class="ed-ctl ed-half"><span class="ed-lbl">Height</span><input type="number" class="ed-num" data-prop="h" step="1" min="20" title="Height (px)"></div>',
      '<div class="ed-ctl ed-half"><span class="ed-lbl">Rotation</span><input type="number" class="ed-num" data-prop="rotation" step="1" placeholder="0" title="Rotation (degrees)"></div>',
      '<div class="ed-ctl ed-half"><span class="ed-lbl">Layer order</span><input type="number" class="ed-num" data-prop="z" step="1" placeholder="auto" title="Which element is in front: a higher number is in front of a lower one"></div>',
      '</div>',
      '<div class="ed-float-row ed-float-look ed-titled" data-title="Appearance">',
      sliderCtl('opacity', 'Opacity', 'Opacity (%)'),
      sliderCtl('borderRadius', 'Corner radius', 'Corner radius (px)'),
      '</div>',
      '<div class="ed-float-row ed-float-motion ed-titled" data-title="Animation">',
      '<div class="ed-ctl"><span class="ed-lbl">Appears on click</span><input type="number" class="ed-num" data-el-step step="1" min="0" placeholder="0" title="Which press of “next” shows this element; blank or 0 means it is there from the start"></div>',
      `<div class="ed-ctl"><span class="ed-lbl">Entrance effect</span><select data-el-enter title="How the element comes in when its turn comes; “Theme default” depends on the element’s role"><option value="">Theme default</option>${ENTER_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>`,
      '</div>',
      '<div class="ed-float-row ed-float-expand ed-titled" data-title="Expandable content">',
      `<button type="button" class="ed-btn" data-action="add-details" title="Content that opens when this element is clicked during playback">${icon('plus')}<span>Add expandable content</span></button>`,
      '</div>',
      '</div>',
    ].join('')
    document.body.appendChild(float)
    palettes.color = buildPalette('color', 'Text colour', themeColours)
    palettes.background = buildPalette('background', 'Fill', themeColours)

    const bindField = (input) => {
      fields[input.dataset.prop ? `prop:${input.dataset.prop}` : `style:${input.dataset.style}`] =
        input
      input.addEventListener('change', () => onFieldChange(input))
      if (input.type === 'color' || input.type === 'range')
        input.addEventListener('input', () => onFieldInput(input))
    }
    for (const input of float.querySelectorAll('[data-prop],[data-style]')) bindField(input)
    for (const n of Object.values(palettes))
      for (const input of n.querySelectorAll('[data-style]')) bindField(input)
    // sliders: live while dragging, one history step on release
    for (const range of float.querySelectorAll('[data-style-range]')) {
      const prop = range.dataset.styleRange
      const spec = RANGES[prop]
      range.addEventListener('input', () => {
        if (!selection.length) return
        const v = fieldValue(range)
        forSelection((slideId, elId) => {
          if (spec.text && kindOf(slideId, elId) !== 'text') return
          set(slideId, elId, { style: { [prop]: v } })
        })
        fields[`style:${prop}`].value = range.value
      })
      range.addEventListener('change', () => {
        commit()
        refreshPanel()
      })
    }
    float.querySelector('[data-align-slide]').addEventListener('change', (e) => {
      alignToSlide = e.target.checked
    })
    float.querySelector('[data-image]').addEventListener('change', onImageChosen)
    float.querySelector('[data-content]').addEventListener('change', onContentChange)
    float.querySelector('[data-details]').addEventListener('change', onDetailsChange)
    float.querySelector('[data-el-step]').addEventListener('change', onStepChange)
    float.querySelector('[data-el-enter]').addEventListener('change', onEnterChange)
    float.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn || !selection.length) return
      const d = btn.dataset
      if (d.action === 'reset') {
        forSelection((slideId, elId) => {
          delete overrides[keyOf(slideId, elId)]
          apply(slideId, elId)
        })
        refreshSelection()
        commit()
        refreshPanel()
      } else if (d.action === 'hide') toggleHidden()
      else if (d.action === 'add-details' || d.action === 'close-details') {
        // the box shows on request (or when the element already has content); a close keeps the content
        const p = primary()
        detailsOpen = { key: keyOf(p.slideId, p.elId), open: d.action === 'add-details' }
        refreshPanel()
        if (d.action === 'add-details') float.querySelector('[data-details]').focus()
      } else if (d.action === 'hotspots') {
        const p = primary()
        if (spot && spot.slideId === p.slideId && spot.elId === p.elId) leaveSpotMode()
        else enterSpotMode(p.slideId, p.elId)
      } else if (d.action === 'more') {
        moreOpen = !moreOpen
        refreshPanel()
      } else if (d.action === 'copy-style') copyStyle()
      else if (d.action === 'paste-style') pasteStyle()
      else if (d.palette) {
        if (palette && palette.prop === d.palette) closePalette()
        else openPalette(d.palette)
      } else if (d.sizeStep) stepFontSize(Number(d.sizeStep))
      else if (d.segValue) toggleStyleValue(btn.closest('[data-seg]').dataset.seg, d.segValue)
      else if (d.toggleStyle) toggleStyleValue(d.toggleStyle, d.value)
      else if (d.align) alignSelection(d.align, alignToSlide)
      else if (d.distribute) distributeSelection(d.distribute)
      else if (d.z) zOrder(d.z)
    })
    document.addEventListener('pointerdown', onDocPointerDown, true)
  }

  // ---- colour palette -------------------------------------------------------------

  /** Open the palette of one property under its button; the other one goes away. */
  function openPalette(prop) {
    const node = palettes[prop]
    const p = primary()
    if (!node || !p || !float) return
    if (palette && palette.prop !== prop) closePalette()
    palette = { prop, key: keyOf(p.slideId, p.elId) }
    node.hidden = false
    float.querySelector(`[data-palette="${prop}"]`)?.setAttribute('aria-expanded', 'true')
    refreshPalette()
    positionPalette()
  }

  function closePalette() {
    if (!palette) return
    palettes[palette.prop].hidden = true
    float?.querySelector(`[data-palette="${palette.prop}"]`)?.setAttribute('aria-expanded', 'false')
    palette = null
  }

  /** A press outside the open palette and its button closes it (the press still does its job). */
  function onDocPointerDown(e) {
    if (!palette) return
    const node = palettes[palette.prop]
    const btn = float?.querySelector(`[data-palette="${palette.prop}"]`)
    if (node.contains(e.target) || btn?.contains(e.target)) return
    closePalette()
  }

  /** Below its button, left-aligned; above it when the bottom would run out; kept on screen. */
  function positionPalette() {
    if (!palette || !float) return
    const node = palettes[palette.prop]
    const btn = float.querySelector(`[data-palette="${palette.prop}"]`)
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const pw = node.offsetWidth
    const ph = node.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.max(8, Math.min(vw - pw - 8, r.left))
    let top = r.bottom + 6
    if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 6)
    node.style.left = `${Math.round(left)}px`
    node.style.top = `${Math.round(top)}px`
  }

  /** Mark the current colour in the open palette. */
  function refreshPalette() {
    if (!palette) return
    const p = primary()
    if (!p) return
    const o = overrides[keyOf(p.slideId, p.elId)] || {}
    const cur = o.style ? o.style[palette.prop] : undefined
    for (const c of palettes[palette.prop].querySelectorAll('.ed-chip[data-color]'))
      c.classList.toggle(
        'is-on',
        c.dataset.color === ''
          ? cur == null
          : cur != null && String(cur).toLowerCase() === c.dataset.color.toLowerCase(),
      )
  }

  /** The colour buttons show the colour the page renders and name the theme token it matches. */
  function refreshColourButtons(cs, style) {
    for (const btn of float.querySelectorAll('[data-palette]')) {
      const prop = btn.dataset.palette
      const v = style[prop]
      const rendered = prop === 'color' ? toHex(cs.color) : toHex(cs.backgroundColor)
      const value = v != null ? String(v) : rendered
      const token = value
        ? themeColours.find((c) => c.value.toLowerCase() === value.toLowerCase())
        : null
      btn.style.setProperty('--chip', value || 'transparent')
      btn.classList.toggle('is-unset', !value)
      let name = 'None'
      if (token) name = token.name
      else if (v != null) name = 'Custom'
      else if (value) name = 'Default'
      btn.querySelector('.ed-colour-name').textContent = name
    }
  }

  /** "Page 3" by playback position, as the rail numbers it; a hidden page has no number. */
  function pageLabel(slideId) {
    const eff = deck.pages()
    const n = eff.visible.indexOf(slideId)
    return n >= 0 ? `Page ${n + 1}` : 'Hidden page'
  }

  /** The value the page renders for a slider property: the override when set, else the computed style. */
  function effectiveStyle(el, cs, style, prop, kind) {
    if (style[prop] != null) return Number(style[prop])
    if (prop === 'fontSize') return kind === 'text' ? effectiveFontSize(el, {}) : 0
    if (prop === 'lineHeight') {
      const lh = Number.parseFloat(cs.lineHeight)
      const fs = Number.parseFloat(cs.fontSize)
      return Number.isFinite(lh) && fs ? lh / fs : 1.2
    }
    if (prop === 'letterSpacing') return Number.parseFloat(cs.letterSpacing) || 0
    if (prop === 'opacity') return Number.parseFloat(cs.opacity)
    if (prop === 'borderRadius') return Number.parseFloat(cs.borderTopLeftRadius) || 0
    return 0
  }

  /** A slider value in the units the field shows, rounded to the field's precision. */
  function shown(prop, value) {
    const r = RANGES[prop]
    const v = (r.scale ? value * r.scale : value) || 0
    const f = 10 ** (r.digits || 0)
    return String(Math.round(v * f) / f)
  }

  /** The effective font size: the override when set, otherwise what the page renders. */
  function effectiveFontSize(el, o) {
    if (o.style && o.style.fontSize != null) return Number(o.style.fontSize)
    return Math.round(Number.parseFloat(getComputedStyle(el).fontSize)) || 0
  }

  function stepFontSize(delta) {
    for (const entry of selectedEntries()) {
      if (kindOf(entry.slideId, entry.elId) !== 'text') continue
      const o = overrides[keyOf(entry.slideId, entry.elId)] || {}
      const next = Math.max(8, effectiveFontSize(entry.el, o) + delta)
      set(entry.slideId, entry.elId, { style: { fontSize: next } })
    }
    commit()
    refreshPanel()
  }

  /** Toggle buttons: clicking the active value clears the override; numbers stay numbers. */
  function toggleStyleValue(prop, value) {
    const p = primary()
    if (!p) return
    const o = overrides[keyOf(p.slideId, p.elId)] || {}
    const cur = o.style ? o.style[prop] : undefined
    const on = String(cur) === String(value)
    const next = on ? null : prop === 'fontWeight' ? Number(value) : value
    applyStyle({ [prop]: next }, true)
  }

  function fieldValue(input) {
    if (input.type === 'checkbox') return input.checked ? true : null
    if (input.value === '') return null
    if (input.type === 'number' || input.type === 'range') {
      const n = Number(input.value)
      // a field shown in other units than the override keeps (opacity as a percentage)
      return input.dataset.scale ? n / Number(input.dataset.scale) : n
    }
    if (input.dataset.style === 'fontWeight') return Number(input.value)
    return input.value
  }

  function onFieldInput(input) {
    if (!selection.length) return
    const v = fieldValue(input)
    if (input.dataset.style)
      forSelection((slideId, elId) => set(slideId, elId, { style: { [input.dataset.style]: v } }))
  }

  function onFieldChange(input) {
    if (!selection.length) return
    const v = fieldValue(input)
    if (input.dataset.prop)
      forSelection((slideId, elId) => set(slideId, elId, { [input.dataset.prop]: v }))
    else
      forSelection((slideId, elId) => set(slideId, elId, { style: { [input.dataset.style]: v } }))
    commit()
    refreshPanel()
  }

  function onImageChosen(e) {
    const file = e.target.files?.[0]
    const p = primary()
    if (!file || !p) return
    const { slideId, elId } = p
    const reader = new FileReader()
    reader.onload = () => {
      set(slideId, elId, { src: String(reader.result) })
      commit()
      refreshPanel()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
    e.target.blur()
  }

  /** `rgb(a)` from getComputedStyle → `#rrggbb`, or null when fully transparent / unparsable. */
  function toHex(color) {
    const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color || '')
    if (!m) return null
    if (m[4] != null && Number(m[4]) === 0) return null
    return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`
  }

  /** Refresh everything that reflects the selection or the history: top toolbar and floating toolbar. */
  function refreshPanel() {
    refreshTopbar()
    if (!float) return
    const p = primary()
    const el = selectedElement()
    if (!p || !el) {
      closePalette()
      // the docked column stays, with a placeholder, so the stage does not jump around
      float.hidden = !docked
      if (docked) float.dataset.empty = 'true'
      return
    }
    delete float.dataset.empty
    const key = keyOf(p.slideId, p.elId)
    if (palette && palette.key !== key) closePalette()
    const kind = kindOf(p.slideId, p.elId)
    const o = overrides[key] || {}
    const slot = slotOf(p.slideId, p.elId)
    const isData = kind === 'text' && !!slot && DATA_SLOT_TYPES.has(slot.type)
    const many = selection.length > 1
    const anyText = many
      ? selection.some((s) => kindOf(s.slideId, s.elId) === 'text')
      : kind === 'text'
    float.hidden = false
    float.dataset.kind = kind
    float.dataset.count = String(selection.length)
    float.querySelector('[data-field="key"]').textContent = many
      ? `${pageLabel(p.slideId)} · ${selection.length} elements`
      : `${pageLabel(p.slideId)} · ${p.elId}`
    const mainRow = float.querySelector('.ed-float-main')
    mainRow.dataset.title = anyText ? 'Text' : kind === 'image' ? 'Image' : 'Selection'
    for (const n of float.querySelectorAll('.ed-text-only')) n.hidden = !anyText
    for (const n of float.querySelectorAll('.ed-image-only')) n.hidden = many || kind !== 'image'
    float.querySelector('.ed-data-only').hidden = many || !isData
    // expandable content rides on boxed plain content (text, list, metric). Its box is big, so it
    // shows when the element already has some or when asked for from "more", and closes on request
    const canDetail =
      !many &&
      kind === 'text' &&
      (!slot || DETAILS_TYPES.has(slot.type)) &&
      DETAILS_ROLES.has(el.dataset.role || '')
    const hasDetails = canDetail && (o.details != null || Boolean(slot?.details))
    const detailsShown =
      canDetail && (detailsOpen && detailsOpen.key === key ? detailsOpen.open : hasDetails)
    float.querySelector('.ed-details-only').hidden = !detailsShown
    float.querySelector('.ed-float-expand').hidden = !canDetail || detailsShown
    const addDetails = float.querySelector('[data-action="add-details"]')
    addDetails.hidden = !canDetail || detailsShown
    addDetails.querySelector('span').textContent = hasDetails
      ? 'Edit expandable content'
      : 'Add expandable content'
    // the clickable-areas button (an image-only control) lights up while its mode is on for this picture
    const spotOn = Boolean(spot && !many && spot.slideId === p.slideId && spot.elId === p.elId)
    float.querySelector('[data-action="hotspots"]').classList.toggle('is-on', spotOn)
    // docked: every group is open and the "more" button has nothing left to reveal
    float.querySelector('.ed-float-arrange').hidden = !(many || moreOpen || docked)
    float.querySelector('.ed-float-more').hidden = !(moreOpen || docked)
    const more = float.querySelector('[data-action="more"]')
    more.hidden = docked
    more.setAttribute('aria-expanded', String(moreOpen || docked))
    more.classList.toggle('is-on', moreOpen)
    // one eye button hides and shows: it reads "show" only when everything selected is hidden
    const hiddenAll = allHidden()
    const eye = float.querySelector('[data-action="hide"]')
    eye.dataset.state = hiddenAll ? 'hidden' : 'visible'
    eye.title = hiddenAll ? 'Show the selected elements' : 'Hide the selected elements (Delete)'
    eye.innerHTML = `${icon(hiddenAll ? 'eye' : 'eyeOff')}<span>${hiddenAll ? 'Show' : 'Hide'}</span>`
    eye.classList.toggle('is-on', hiddenAll)
    for (const b of float.querySelectorAll('[data-distribute]')) b.disabled = selection.length < 3
    const alignSlideToggle = float.querySelector('[data-align-slide]')
    alignSlideToggle.checked = alignToSlide
    alignSlideToggle.disabled = !many
    float.querySelector('[data-action="paste-style"]').disabled = !copiedStyle
    const def = slidesById.get(p.slideId)?.elements.find((x) => x.id === p.elId)
    // a background refresh (thumbnails, timers) must not clobber a value being typed
    const stepInput = float.querySelector('[data-el-step]')
    if (document.activeElement !== stepInput) stepInput.value = def?.step ? String(def.step) : ''
    const enterInput = float.querySelector('[data-el-enter]')
    if (document.activeElement !== enterInput) enterInput.value = def?.enter || ''
    if (isData) {
      const ta = float.querySelector('[data-content]')
      if (document.activeElement !== ta) ta.value = o.text != null ? o.text : slotText(slot)
    }
    if (canDetail) {
      const ta = float.querySelector('[data-details]')
      if (document.activeElement !== ta)
        ta.value = o.details != null ? o.details : slot?.details ? slotText(slot.details) : ''
    }
    const g = geometryOf(el)
    const cs = getComputedStyle(el)
    const style = o.style || {}
    for (const [name, input] of Object.entries(fields)) {
      const [group, prop] = name.split(':')
      let v = group === 'prop' ? o[prop] : style[prop]
      if (group === 'prop' && v == null && prop in g) v = g[prop]
      if (input.type === 'checkbox') input.checked = Boolean(v)
      else if (input.type === 'color') {
        // no override: show what the page renders, so the picker never opens on a blind #000000
        const rendered = prop === 'color' ? toHex(cs.color) : toHex(cs.backgroundColor)
        const hex = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : rendered
        input.value = hex || '#ffffff'
      } else if (RANGES[prop]) {
        // the field shows what the page renders, so its slider starts from the real value
        if (document.activeElement !== input)
          input.value = shown(prop, effectiveStyle(el, cs, style, prop, kind))
      } else if (input.tagName === 'SELECT' && prop === 'fontFamily') {
        setFontSelect(input, v)
      } else input.value = v == null ? '' : String(v)
    }
    for (const range of float.querySelectorAll('[data-style-range]')) {
      const prop = range.dataset.styleRange
      range.value = shown(prop, effectiveStyle(el, cs, style, prop, kind))
    }
    if (kind === 'text') {
      for (const b of float.querySelectorAll('[data-seg-value]'))
        b.classList.toggle('is-on', b.dataset.segValue === style.textAlign)
      for (const b of float.querySelectorAll('[data-toggle-style]'))
        b.classList.toggle('is-on', String(style[b.dataset.toggleStyle]) === b.dataset.value)
    }
    refreshColourButtons(cs, style)
    refreshPalette()
    positionFloat()
    positionPalette()
  }

  /** A fontFamily override that is none of the listed fonts shows up as its own option. */
  function setFontSelect(select, value) {
    let custom = select.querySelector('option[data-custom]')
    if (value == null) {
      select.value = ''
    } else {
      const known = Array.from(select.options).some(
        (opt) => !opt.dataset.custom && opt.value === value,
      )
      if (!known) {
        if (!custom) {
          custom = document.createElement('option')
          custom.dataset.custom = 'true'
          select.appendChild(custom)
        }
        custom.value = value
        custom.textContent = `Custom: ${value.slice(0, 24)}`
      }
      select.value = value
    }
    if (custom && select.value !== custom.value) custom.remove()
  }

  /**
   * Below the selection box, centred; above it when the bottom would run out. When neither side
   * has the room for every open group, the toolbar takes the bigger side and scrolls inside it,
   * so it never overlaps the element it edits; pinned to the bottom edge only when even that fails.
   */
  function positionFloat() {
    if (!float) return
    if (docked) {
      // the column is placed by CSS; nothing here may move it
      float.style.left = ''
      float.style.top = ''
      float.style.maxHeight = ''
      float.dataset.placement = 'docked'
      return
    }
    if (float.hidden || !box || box.hidden) return
    const r = box.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const minLeft = (pagesPanel ? pagesPanel.offsetWidth : 0) + 8
    const minTop = (panel ? panel.offsetHeight : 0) + 8
    float.style.maxHeight = ''
    let fh = float.offsetHeight
    const fw = float.offsetWidth
    const below = vh - 8 - (r.bottom + 12)
    const above = r.top - 12 - minTop
    let top
    let placement
    if (fh <= below) {
      top = r.bottom + 12
      placement = 'below'
    } else if (fh <= above) {
      top = r.top - fh - 12
      placement = 'above'
    } else if (Math.max(below, above) >= 120) {
      float.style.maxHeight = `${Math.floor(Math.max(below, above))}px`
      fh = float.offsetHeight
      if (below >= above) {
        top = r.bottom + 12
        placement = 'below'
      } else {
        top = r.top - fh - 12
        placement = 'above'
      }
    } else {
      float.style.maxHeight = `${Math.max(120, vh - minTop - 8)}px`
      fh = float.offsetHeight
      top = vh - fh - 8
      placement = 'pinned'
    }
    const left = Math.max(minLeft, Math.min(vw - fw - 8, r.left + r.width / 2 - fw / 2))
    float.style.left = `${Math.round(left)}px`
    float.style.top = `${Math.round(top)}px`
    float.dataset.placement = placement
  }

  function setRevealHidden(on) {
    revealHidden = on
    document.body.classList.toggle('ed-reveal', on)
    const toggle = panel?.querySelector('[data-toggle="reveal"]')
    if (toggle) toggle.checked = on
  }

  function applyDock() {
    if (!float) return
    float.classList.toggle('is-docked', docked)
    if (docked) {
      float.hidden = false
      if (!selection.length) float.dataset.empty = 'true'
    } else delete float.dataset.empty
  }

  /** Dock the element toolbar on the right (a column, every row open) or let it float again. */
  function setDocked(on) {
    docked = Boolean(on)
    try {
      localStorage.setItem(DOCK_KEY, docked ? 'docked' : 'floating')
    } catch (_) {
      // a viewer preference only; nothing to do without storage
    }
    const toggle = panel?.querySelector('[data-toggle="dock"]')
    if (toggle) toggle.checked = docked
    applyDock()
    if (active) {
      applyInsets()
      refreshSelection()
      refreshPanel()
      positionFloat()
    }
  }

  // ---- export to a file ----------------------------------------------------------

  /** Hand text to the user as a file: the save dialog where the browser has one, else a download. */
  async function saveAs(text, name, mime, ext, description) {
    if (typeof window.showSaveFilePicker === 'function' && !navigator.webdriver) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description, accept: { [mime]: [ext] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(text)
        await writable.close()
        return 'saved'
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled'
      }
    }
    const url = URL.createObjectURL(new Blob([text], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'downloaded'
  }

  /** The current model as deck.json (the way to keep edits without a dev server). */
  function exportFile() {
    const text = `${JSON.stringify(exportModel(), null, 2)}\n`
    return saveAs(text, `${model.id || 'deck'}.json`, 'application/json', '.json', 'deck.json')
  }

  // ---- the page itself as a file (no dev server) ---------------------------------

  const MODEL_TAG = '<script type="application/json" id="deck-model"'
  // this source sits inside an inline script tag, so the tag that ends a script never appears in it
  // whole; the tags that end the body and the document are spelled the same way, because the dev
  // server splices its client in at the body end tag of the document itself
  const endTag = (name) => ['<', `/${name}>`].join('')
  const SCRIPT_END = endTag('script')
  const DOCUMENT_END = `\n${endTag('body')}\n${endTag('html')}\n`
  const PRISTINE_TAG = `<script id="deck-pristine">window.__pristine = document.documentElement.outerHTML;${SCRIPT_END}`
  const hasPortable = () =>
    typeof window.__pristine === 'string' && window.__pristine.includes(MODEL_TAG)

  /**
   * This deck as one HTML file with the edits: the document as the renderer wrote it (kept by the
   * pristine script before any script touched the page), the current model in place of the
   * rendered one, flagged so the editor puts the model back on the page when the file opens, and
   * the same scripts after it. Pictures keep their relative paths. Null for a page rendered
   * before the pristine script existed.
   */
  function portableHtml() {
    if (!hasPortable()) return null
    const pristine = window.__pristine
    let head = pristine.slice(0, pristine.lastIndexOf(MODEL_TAG))
    // the deck-wide motion switch is read from <html data-motion> before any script runs
    head = head.replace(/^<html([^>]*)>/, (_, attrs) => {
      const rest = attrs.replace(/\s+data-motion="[^"]*"/, '')
      return `<html${rest}${model.motion === 'off' ? ' data-motion="off"' : ''}>`
    })
    const json = JSON.stringify(exportModel()).replace(/</g, '\\u003c')
    const scripts = Array.from(document.querySelectorAll('body > script'))
      .filter((s) => !s.id && !s.src && !s.type)
      .map((s) => `<script>\n${s.textContent.trim()}\n${SCRIPT_END}`)
    return `<!doctype html>\n${head}${MODEL_TAG} data-edited="true">${json}${SCRIPT_END}\n${PRISTINE_TAG}\n${scripts.join('\n')}${DOCUMENT_END}`
  }

  /**
   * The deck as one HTML file: rendered on disk with the images inlined by the dev server (whatever
   * is still unsaved is written first so the file matches what is on screen), or, without one,
   * this page with its edits.
   */
  async function exportHtml() {
    let text
    if (hasDevServer()) {
      if (window.__dev?.dirty) await window.__dev.save()
      const res = await fetch('/__export')
      if (!res.ok) return 'failed'
      text = await res.text()
    } else {
      text = portableHtml()
      if (text == null) return 'unavailable'
    }
    const result = await saveAs(
      text,
      `${model.id || 'deck'}.html`,
      'text/html',
      '.html',
      'deck.html',
    )
    if (!hasDevServer() && (result === 'saved' || result === 'downloaded')) {
      const relative = Array.from(stage.querySelectorAll('img')).some((img) => {
        const src = img.getAttribute('src') || ''
        return src && !/^(data:|blob:|https?:)/i.test(src)
      })
      setStatus(
        relative
          ? 'Saved with your edits. Its pictures are relative paths: keep it next to the original deck.html, or render with --inline-assets first.'
          : 'Saved with your edits.',
      )
    }
    return result
  }

  // ---- public api ----------------------------------------------------------------

  deck.exportModel = exportModel
  deck.editor = {
    enter,
    exit,
    get active() {
      return active
    },
    get selected() {
      return primary()
    },
    get selection() {
      return selection.slice()
    },
    select(elId, slideId) {
      select(elId ? { slideId: slideId || activeSlideId(), elId } : null)
    },
    selectMany(elIds, slideId) {
      const sId = slideId || activeSlideId()
      selectMany((elIds || []).map((elId) => ({ slideId: sId, elId })))
    },
    set(elId, patch, slideId) {
      set(slideId || activeSlideId(), elId, patch)
      commit()
      refreshPanel()
    },
    reset(elId, slideId) {
      reset(slideId || activeSlideId(), elId)
    },
    undo,
    redo,
    get canUndo() {
      return history.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
    setSnap(on) {
      snapEnabled = Boolean(on)
      const toggle = panel?.querySelector('[data-toggle="snap"]')
      if (toggle) toggle.checked = snapEnabled
    },
    setRevealHidden,
    setMore(on) {
      moreOpen = Boolean(on)
      refreshPanel()
    },
    get moreOpen() {
      return moreOpen
    },
    align: alignSelection,
    distribute: distributeSelection,
    zOrder,
    copyStyle,
    pasteStyle,
    get copiedStyle() {
      return copiedStyle ? Object.assign({}, copiedStyle) : null
    },
    themeColors,
    get draftKey() {
      return draftKey()
    },
    exportFile,
    exportHtml,
    /** The deck as one HTML file with the edits, as text (null when the page has no pristine copy). */
    portableHtml,
    get editingText() {
      return editing ? { slideId: editing.slideId, elId: editing.elId } : null
    },
    commitTextEdit,
    get docked() {
      return docked
    },
    setDocked,
    /** The colour palette of one property ('color' or 'background'); tests and screenshots use it. */
    openPalette,
    closePalette,
    get paletteOpen() {
      return palette ? palette.prop : null
    },
    /** Open or close the expandable-content box of the primary selection by hand. */
    setDetailsOpen(on) {
      const p = primary()
      if (!p) return
      detailsOpen = { key: keyOf(p.slideId, p.elId), open: Boolean(on) }
      refreshPanel()
    },
    /** Hotspot mode on an image: its jump regions are drawn and adjusted on the picture. */
    hotspots: {
      enter(elId, slideId) {
        enterSpotMode(slideId || activeSlideId(), elId)
      },
      leave: leaveSpotMode,
      select: selectSpot,
      remove: deleteSpot,
      get active() {
        return spot ? { slideId: spot.slideId, elId: spot.elId, index: spot.index } : null
      },
    },
  }

  window.addEventListener('keydown', (e) => {
    const isE = e.key === 'e' || e.key === 'E'
    if (!isE && e.key !== 'Escape') return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const tag = e.target?.tagName
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable) return
    if (isE) {
      e.preventDefault()
      if (active) exit()
      else enter()
      return
    }
    // Esc leaves playback for the editor once the runtime had nothing left to close (it claims the
    // key for a lightbox or an open details panel); the presenter window only ever plays
    if (active || e.defaultPrevented || deck.isPresenter) return
    e.preventDefault()
    enter()
  })

  // a file saved by "Download deck.html" without a dev server: the edits are in its model only
  if (document.getElementById('deck-model')?.dataset.edited === 'true') applyEditedModel()

  if (new URLSearchParams(location.search).get('edit') === '1') enter()
})()
