import { FtElement, define } from '../lib/element.js'

/**
 * <ft-terms>：术语面板（宽屏是卡片，窄屏是弹窗，共用同一份列表 DOM）。
 *
 * 属性：
 * - `terms`      术语条目数组（字符串，形如「attention 翻译成 注意力」）
 * - `narrow`     是否窄屏（决定列表挂在卡片里还是弹窗里）
 * - `expanded`   宽屏卡片是否展开
 * - `modalOpen`  窄屏弹窗是否打开
 * - `maxReached` 是否已经达到条数上限（禁用添加）
 *
 * 事件：
 * - `add`（detail: { source, target }）
 * - `remove`（detail: index）
 * - `clear`
 * - `toggle`
 * - `close-modal`
 *
 * 点击统一用宿主上的事件委托：组件内部既有 `wa-button` 也有原生 `button`，
 * 各自绑监听时行为不一致，委托能避开这个坑。
 */
const TEMPLATE = `
  <section class="card terms" data-ref="card">
    <div class="card-head">
      <span class="card-title">术语</span>
      <span class="count" data-ref="cardCount">0</span>
      <div class="card-meta">
        <wa-button variant="warning" appearance="plain" size="s" data-action="clear" data-ref="cardClear" disabled>清空</wa-button>
        <wa-button appearance="plain" size="s" data-action="toggle" data-ref="toggle">收起</wa-button>
      </div>
    </div>
    <div class="terms-body" id="terms-body" data-ref="body">
      <div class="terms-add">
        <wa-input data-ref="source" data-field="term-source" placeholder="术语" aria-label="术语" size="s" appearance="outlined" class="term-field" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></wa-input>
        <span class="term-join">翻译成</span>
        <span class="term-join-arrow" aria-hidden="true">→</span>
        <wa-input data-ref="target" data-field="term-target" placeholder="译法" aria-label="译法" size="s" appearance="outlined" class="term-field" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></wa-input>
        <wa-button variant="brand" size="s" data-action="submit" data-ref="add" disabled>添加</wa-button>
        <button type="button" class="term-add-icon" data-action="submit" data-ref="addIcon" disabled aria-label="添加术语">+</button>
      </div>
      <div class="terms-list" data-ref="list"></div>
    </div>
  </section>

  <div class="modal-overlay" data-ref="overlay" hidden>
    <div class="modal terms-modal" role="dialog" aria-modal="true" aria-label="术语">
      <div class="modal-head">
        <span class="modal-title">术语</span>
        <span class="modal-count" data-ref="modalCount">0 条</span>
        <button type="button" class="modal-close" data-action="close-modal" data-ref="close" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      </div>
      <div class="terms-modal-body" data-ref="modalBody"></div>
      <div class="modal-foot terms-modal-foot">
        <wa-button variant="warning" appearance="plain" size="s" data-action="clear" data-ref="modalClear" disabled>清空全部</wa-button>
        <span class="terms-foot-gap"></span>
        <wa-button variant="brand" size="s" data-action="submit" data-ref="modalAdd" disabled>添加</wa-button>
        <wa-button id="terms-done" variant="brand" size="s" data-action="close-modal" data-ref="done">完成</wa-button>
      </div>
    </div>
  </div>
`

class FtTerms extends FtElement {
  static template = TEMPLATE

  #terms = []
  #narrow = false
  #expanded = true
  #modalOpen = false
  #maxReached = false

  get terms() {
    return this.#terms
  }

  set terms(value) {
    this.#terms = Array.isArray(value) ? value : []
    this.renderTerms()
  }

  get narrow() {
    return this.#narrow
  }

  set narrow(value) {
    this.#narrow = Boolean(value)
    this.render()
  }

  get expanded() {
    return this.#expanded
  }

  set expanded(value) {
    this.#expanded = Boolean(value)
    this.render()
  }

  get modalOpen() {
    return this.#modalOpen
  }

  set modalOpen(value) {
    const next = Boolean(value)
    if (next === this.#modalOpen) return
    this.#modalOpen = next
    this.render()
    if (next) this.focusDraft()
  }

  get maxReached() {
    return this.#maxReached
  }

  set maxReached(value) {
    this.#maxReached = Boolean(value)
    this.updateAddState()
  }

  onConnect() {
    const handle = (event) => {
      const action = event.target instanceof Element ? event.target.closest('[data-action]') : null
      if (action === null) return
      const name = action.dataset.action
      if (name === 'submit') this.submit()
      else if (name === 'clear') this.emit('clear')
      else if (name === 'toggle') this.emit('toggle')
      else if (name === 'close-modal') this.emit('close-modal')
    }
    // 「添加」的 wa-button 在 pointerdown 阶段就能拿到（合成 click 可能被吞），
    // 其它按钮用标准 click 即可；两者之间用一个时间窗去重，避免重复触发
    let lastSubmitPointerAt = 0
    this.addEventListener('pointerdown', (event) => {
      const action = event.target instanceof Element ? event.target.closest('[data-action="submit"]') : null
      if (action === null) return
      lastSubmitPointerAt = performance.now()
      this.submit()
    })
    this.addEventListener('click', (event) => {
      const action = event.target instanceof Element ? event.target.closest('[data-action]') : null
      if (action === null) return
      if (action.dataset.action === 'submit') {
        if (performance.now() - lastSubmitPointerAt < 500) return
        this.submit()
        return
      }
      if (action.dataset.action === 'clear') this.emit('clear')
      else if (action.dataset.action === 'toggle') this.emit('toggle')
      else if (action.dataset.action === 'close-modal') this.emit('close-modal')
    })

    this.ref('overlay').addEventListener('mousedown', (event) => {
      if (event.target === this.ref('overlay')) this.emit('close-modal')
    })

    for (const key of ['source', 'target']) {
      const input = this.ref(key)
      input.addEventListener('input', () => this.updateAddState())
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          this.submit()
        }
      })
    }
  }

  focusDraft() {
    const input = this.ref('source')
    if (input !== null && typeof input.focus === 'function') input.focus()
  }

  draft() {
    return {
      source: String(this.ref('source')?.value ?? '').trim(),
      target: String(this.ref('target')?.value ?? '').trim(),
    }
  }

  updateAddState() {
    const { source, target } = this.draft()
    const disabled = source.length === 0 || target.length === 0 || this.#maxReached
    for (const key of ['add', 'addIcon', 'modalAdd']) {
      const button = this.ref(key)
      if (button === null) continue
      // wa-button 只认 attribute，直接改 property 不会真正启用
      button.toggleAttribute('disabled', disabled)
      button.disabled = disabled
    }
  }

  submit() {
    const { source, target } = this.draft()
    if (source.length === 0 || target.length === 0 || this.#maxReached) return
    this.emit('add', { source, target })
    this.ref('source').value = ''
    this.ref('target').value = ''
    this.focusDraft()
    this.updateAddState()
  }

  render() {
    const body = this.ref('body')
    const overlay = this.ref('overlay')
    if (body === null || overlay === null) return

    overlay.hidden = !(this.#narrow && this.#modalOpen)
    body.hidden = this.#narrow ? false : !this.#expanded
    this.ref('toggle').textContent = this.#expanded ? '收起' : '展开'

    const host = this.#narrow ? this.ref('modalBody') : this.ref('card')
    if (body.parentElement !== host) host.appendChild(body)
  }

  renderTerms() {
    const list = this.ref('list')
    if (list === null) return
    list.replaceChildren()

    this.ref('cardCount').textContent = String(this.#terms.length)
    this.ref('modalCount').textContent = this.#terms.length + ' 条'
    for (const key of ['cardClear', 'modalClear']) {
      const button = this.ref(key)
      if (button === null) continue
      button.toggleAttribute('disabled', this.#terms.length === 0)
      button.disabled = this.#terms.length === 0
    }

    if (this.#terms.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'terms-empty'
      empty.textContent = '还没有术语。添加后会随每次翻译一起发给模型。'
      list.appendChild(empty)
      this.updateAddState()
      return
    }

    const compact = window.matchMedia('(max-width: 480px)').matches
    this.#terms.forEach((term, index) => {
      const row = document.createElement('div')
      row.className = 'term'

      const [sourceText, targetText] = splitTerm(term)

      const from = document.createElement('span')
      from.className = 'term-token'
      from.title = term
      from.textContent = sourceText
      row.append(from)

      if (targetText.length > 0) {
        const arrow = document.createElement('span')
        arrow.className = 'term-arrow'
        arrow.textContent = compact ? '→' : '翻译成'

        const to = document.createElement('span')
        to.className = 'term-token'
        to.title = term
        to.textContent = targetText
        row.append(arrow, to)
      }

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'term-remove'
      remove.title = '删除'
      remove.setAttribute('aria-label', '删除')
      remove.textContent = '\u00d7'
      remove.addEventListener('click', () => this.emit('remove', index))
      row.append(remove)

      list.appendChild(row)
    })
    this.updateAddState()
  }

  /** 供外壳判断点击是否落在术语面板里 */
  contains(target) {
    return target instanceof Node && HTMLElement.prototype.contains.call(this, target)
  }
}

/** 「原文 翻译成 译文」拆成两段；只写原文时整段都是原文 */
function splitTerm(term) {
  const marker = ' 翻译成 '
  const index = term.indexOf(marker)
  if (index < 0) return [term, '']
  return [term.slice(0, index), term.slice(index + marker.length)]
}

define('ft-terms', FtTerms)
