/*
 * Dev-server client: autosaves editor overrides to deck.json and reloads the
 * page when files change on disk. Injected only by `pnpm dev`; never part of
 * a rendered deck.
 */
;(() => {
  const cfg = window.__devConfig || {}
  const deck = window.__deck
  if (!deck) return
  let base = cfg.overridesHash || ''
  let timer = 0
  let saving = null
  let dirty = false
  // an edit arrived while a save was in flight: save again once it settles
  let pending = false

  const badge = document.createElement('div')
  badge.className = 'dev-status'
  const FLOATING =
    'position:fixed;left:12px;bottom:12px;z-index:3000;padding:4px 8px;border-radius:4px;background:rgba(30,30,30,.9);color:#eee;font:12px system-ui,sans-serif;pointer-events:none'
  const DOCKED = 'display:inline-flex;align-items:center;gap:6px;font:12px system-ui,sans-serif'
  // the editor's top toolbar has a status slot; outside edit mode the badge floats bottom-left
  function mount() {
    const slot = document.querySelector('.ed-topbar [data-status]')
    if (slot) {
      badge.style.cssText = DOCKED
      slot.appendChild(badge)
    } else {
      badge.style.cssText = FLOATING
      document.body.appendChild(badge)
    }
  }
  const setStatus = (text) => {
    badge.textContent = text
    badge.dataset.state = text
  }
  setStatus(cfg.warnings?.length ? `已連線 · ${cfg.warnings.length} 個警告` : '已連線')
  mount()
  document.addEventListener('deck:editmode', mount)

  function schedule() {
    dirty = true
    setStatus('未儲存…')
    clearTimeout(timer)
    timer = setTimeout(() => save(false), 1500)
  }

  async function save(force) {
    clearTimeout(timer)
    if (saving) {
      pending = true
      return saving
    }
    const model = deck.exportModel()
    // element steps (逐步顯示) live in slides[].elements; send them all so cleared steps are removed too
    const steps = {}
    const enters = {}
    for (const s of model.slides)
      for (const e of s.elements) {
        steps[`${s.id}/${e.id}`] = e.step || 0
        enters[`${s.id}/${e.id}`] = e.enter || ''
      }
    saving = fetch('/__save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        overrides: model.overrides,
        steps,
        enters,
        pages: model.pages || null,
        motion: model.motion === 'off' ? 'off' : 'on',
        transition: model.transition || '',
        base,
        force: Boolean(force),
      }),
    })
      .then(async (res) => {
        if (res.status === 409) {
          const keepMine = window.confirm(
            'deck.json 裡的覆寫在你載入之後被改過。\n確定：用你目前的版本覆蓋磁碟\n取消：放棄目前修改，重新載入磁碟上的版本',
          )
          saving = null
          if (keepMine) return save(true)
          dirty = false // the disk version wins: do not let beforeunload block the reload
          location.reload()
          return false
        }
        if (!res.ok) {
          setStatus(`儲存失敗（${res.status}）`)
          return false
        }
        const json = await res.json()
        base = json.overridesHash
        if (!pending) dirty = false
        setStatus(`已儲存 ${new Date().toLocaleTimeString()}`)
        return true
      })
      .catch(() => {
        setStatus('儲存失敗（連線）')
        return false
      })
      .finally(() => {
        saving = null
        if (pending) {
          pending = false
          save(false)
        }
      })
    return saving
  }

  document.addEventListener('deck:edit', schedule)
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  const events = new EventSource('/__events')
  events.onmessage = async (e) => {
    if (e.data !== 'reload') return
    if (dirty) await save(false)
    location.reload()
  }
  events.onerror = () => setStatus('與 dev server 斷線')

  window.__dev = {
    save: () => save(false),
    get dirty() {
      return dirty
    },
    get base() {
      return base
    },
  }
})()
