import { FtElement, define } from '../lib/element.js'
import { renderMarkdown, highlightSource } from '../lib/markdown.js'
import { usageRows, usageChipText, usageFootText } from '../lib/usage.js'

/**
 * <ft-output-card>：译文卡片（预览 / Markdown 切换、复制、自动复制、用量浮层）。
 *
 * 属性：
 * - `phase`（idle / loading / error / done）
 * - `view`（preview / source）
 * - `output`（译文文本）、`message`（错误信息）
 * - `copyState`（'' / ok / fail）
 * - `autoCopy`
 * - `busy`（翻译中，显示进度条）
 * - `stale`（原文改过，需要重新翻译）
 * - `usage` / `usageCount` / `usageTotal`（token 明细）
 *
 * 事件：`copy`、`toggle-view`、`toggle-auto-copy`
 */
const VIEW_CODE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 7.2 4.4 12l4.2 4.8" /><path d="M15.4 7.2 19.6 12l-4.2 4.8" /></svg>'
const VIEW_EYE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 12S5.8 6.4 12 6.4 21.4 12 21.4 12 18.2 17.6 12 17.6 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>'

const TEMPLATE = `
  <div class="usage-scrim" id="usage-scrim" data-ref="scrim" hidden></div>
  <section class="card card-grow">
    <div class="card-head">
      <span class="card-title">译文</span>
      <div class="card-meta">
        <button type="button" class="card-icon-btn" data-ref="autoCopyIcon" role="switch" aria-checked="false" title="自动复制"><svg viewBox="0 0 48 48" class="icon-auto-copy" aria-hidden="true"><g transform="translate(5 -0.5) scale(0.72)" stroke-width="2.8"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" /><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" /></g><text x="24" y="42.6" font-size="10" font-family="Arial, sans-serif" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700" letter-spacing="0.6">AUTO</text></svg></button>
        <button type="button" class="card-icon-btn" data-ref="viewIcon" title="切换到预览"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 7.2 4.4 12l4.2 4.8" /><path d="M15.4 7.2 19.6 12l-4.2 4.8" /></svg></button>
        <button type="button" class="toggle" data-ref="autoCopy" role="switch" aria-checked="false" title="开启后，翻译完成自动复制译文">
          <span class="toggle-dot" aria-hidden="true"></span>
          <span class="toggle-text">自动复制</span>
        </button>
        <wa-button data-ref="viewToggle" appearance="outlined" size="s" disabled>Markdown</wa-button>
        <wa-button data-ref="copy" appearance="outlined" size="s" disabled>复制</wa-button>
      </div>
    </div>
    <div class="progress-line" id="progress" data-ref="progress" hidden aria-hidden="true">
      <span class="progress-line-runner"></span>
    </div>
    <div class="stale-bar" id="stale" data-ref="stale" hidden>需要重新翻译！</div>
    <div class="output" id="output" data-ref="output"></div>
    <div class="usage-foot" data-ref="usageFoot" hidden>
      <button type="button" class="usage-chip" data-ref="usageChip" aria-expanded="false" title="查看本次翻译的 token 用量">
        <span data-ref="usageChipText">0 tok</span>
      </button>
      <div class="usage-pop" data-ref="usagePop" hidden role="dialog" aria-label="本轮用量">
        <div class="usage-pop-head">
          <span>本轮用量</span>
          <span class="usage-pop-total" data-ref="usagePopTotal">0 tok</span>
        </div>
        <div class="usage-rows" data-ref="usageRows"></div>
        <div class="usage-pop-foot" data-ref="usagePopFoot"></div>
      </div>
    </div>
  </section>
`

class FtOutputCard extends FtElement {
  static template = TEMPLATE

  #phase = 'idle'
  #view = 'preview'
  #output = ''
  #message = ''
  #copyState = ''
  #autoCopy = false
  #busy = false
  #stale = false
  #usage = null
  #usageCount = 0
  #usageTotal = 0
  #outputKey = ''

  get phase() { return this.#phase }
  set phase(value) { this.#phase = String(value ?? 'idle'); this.renderOutput() }

  get view() { return this.#view }
  set view(value) { this.#view = String(value ?? 'preview'); this.renderOutput() }

  get output() { return this.#output }
  set output(value) { this.#output = String(value ?? ''); this.renderOutput() }

  get message() { return this.#message }
  set message(value) { this.#message = String(value ?? ''); this.renderOutput() }

  get copyState() { return this.#copyState }
  set copyState(value) { this.#copyState = String(value ?? ''); this.render() }

  get autoCopy() { return this.#autoCopy }
  set autoCopy(value) { this.#autoCopy = Boolean(value); this.render() }

  get busy() { return this.#busy }
  set busy(value) { this.#busy = Boolean(value); this.render() }

  get stale() { return this.#stale }
  set stale(value) { this.#stale = Boolean(value); this.render() }

  get usage() { return this.#usage }
  set usage(value) { this.#usage = value ?? null; this.renderUsage() }

  get usageCount() { return this.#usageCount }
  set usageCount(value) { this.#usageCount = Number(value) || 0; this.renderUsage() }

  get usageTotal() { return this.#usageTotal }
  set usageTotal(value) { this.#usageTotal = Number(value) || 0; this.renderUsage() }

  onConnect() {
    this.ref('copy').addEventListener('click', () => this.emit('copy'))
    this.ref('viewToggle').addEventListener('click', () => this.emit('toggle-view'))
    this.ref('viewIcon').addEventListener('click', () => this.emit('toggle-view'))
    this.ref('autoCopy').addEventListener('click', () => this.emit('toggle-auto-copy'))
    this.ref('autoCopyIcon').addEventListener('click', () => this.emit('toggle-auto-copy'))

    this.ref('usageChip').addEventListener('click', (event) => {
      event.stopPropagation()
      if (this.ref('usagePop').hidden) this.openUsagePop()
      else this.closeUsagePop()
    })
    this.ref('scrim').addEventListener('click', () => this.closeUsagePop())
    document.addEventListener('click', (event) => {
      if (this.ref('usagePop').hidden) return
      if (this.ref('usageFoot').contains(event.target)) return
      this.closeUsagePop()
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.ref('usagePop').hidden) this.closeUsagePop()
    })
  }

  openUsagePop() {
    this.ref('usagePop').hidden = false
    this.ref('scrim').hidden = false
    this.ref('usageChip').setAttribute('aria-expanded', 'true')
  }

  closeUsagePop() {
    this.ref('usagePop').hidden = true
    this.ref('scrim').hidden = true
    this.ref('usageChip').setAttribute('aria-expanded', 'false')
  }

  render() {
    this.renderOutput()
  }

  syncChrome() {
    const output = this.ref('output')
    if (output === null) return
    const empty = this.#output.length === 0

    this.ref('progress').hidden = !this.#busy
    this.ref('stale').hidden = !this.#stale

    const copy = this.ref('copy')
    copy.disabled = empty
    copy.textContent =
      this.#copyState === 'ok' ? '已复制' : this.#copyState === 'fail' ? '复制失败' : '复制'
    copy.className =
      'btn' + (this.#copyState === 'ok' ? ' btn-ok' : this.#copyState === 'fail' ? ' btn-fail' : '')

    this.ref('viewToggle').disabled = empty
    this.ref('viewToggle').textContent = this.#view === 'preview' ? 'Markdown' : '预览'

    const viewIcon = this.ref('viewIcon')
    viewIcon.disabled = empty
    viewIcon.title = this.#view === 'preview' ? '切换到 Markdown' : '切换到预览'
    viewIcon.innerHTML = this.#view === 'preview' ? VIEW_EYE_ICON : VIEW_CODE_ICON
    viewIcon.dataset.tip = viewIcon.title
    this.ref('autoCopyIcon').dataset.tip = this.#autoCopy ? '自动复制：开' : '自动复制：关'

    for (const key of ['autoCopy', 'autoCopyIcon']) {
      const node = this.ref(key)
      node.setAttribute('aria-checked', String(this.#autoCopy))
      node.classList.toggle('on', this.#autoCopy)
    }
  }

  renderOutput() {
    const out = this.ref('output')
    if (out === null) return

    const key = this.#phase + '|' + this.#view + '|' + this.#output + '|' + this.#message
    if (key === this.#outputKey) {
      this.syncChrome()
      return
    }
    this.#outputKey = key
    out.classList.remove('is-empty')

    if (this.#phase === 'error') {
      out.classList.remove('md-mode')
      const box = document.createElement('div')
      box.className = 'error'
      const text = document.createElement('div')
      text.textContent = this.#message
      box.appendChild(text)
      out.replaceChildren(box)
      this.syncChrome()
      return
    }

    if (this.#output.length === 0) {
      out.classList.remove('md-mode')
      out.classList.add('is-empty')
      const span = document.createElement('span')
      span.className = 'placeholder'
      span.textContent = this.#phase === 'loading' ? '翻译中…' : '译文会显示在这里。'
      out.replaceChildren(span)
      this.syncChrome()
      return
    }

    if (this.#view === 'source') {
      out.classList.remove('md-mode')
      const source = document.createElement('div')
      source.className = 'md-source'
      // 复用输入框的高亮器：输出是 HTML 片段，highlightSource 内部会转义
      source.innerHTML = highlightSource(this.#output)
      out.replaceChildren(source)
      this.syncChrome()
      return
    }

    out.classList.add('md-mode')
    out.innerHTML = '<div class="md">' + renderMarkdown(this.#output) + '</div>'
    this.syncChrome()
  }

  renderUsage() {
    const usage = this.#usage
    if (usage === null) {
      this.ref('usageFoot').hidden = true
      this.closeUsagePop()
      return
    }

    this.ref('usageFoot').hidden = false
    this.ref('usageChipText').textContent = usageChipText(usage)
    this.ref('usagePopTotal').textContent = usageChipText(usage)

    const frag = document.createDocumentFragment()
    for (const [label, value] of usageRows(usage)) {
      const row = document.createElement('div')
      row.className = 'usage-row'
      const key = document.createElement('span')
      key.className = 'usage-k'
      key.textContent = label
      const val = document.createElement('span')
      val.className = 'usage-v'
      val.textContent = value
      row.append(key, val)
      frag.appendChild(row)
    }
    this.ref('usageRows').replaceChildren(frag)
    this.ref('usagePopFoot').textContent = usageFootText(this.#usageCount, this.#usageTotal)
  }
}

define('ft-output-card', FtOutputCard)
