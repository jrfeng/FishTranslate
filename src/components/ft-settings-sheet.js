import { FtElement, define } from '../lib/element.js'

/**
 * <ft-settings-sheet>：设置弹窗（API Key / 接口地址 / 模型状态）。
 *
 * 属性：
 * - `open`
 * - `apiKey` / `baseUrl`：打开时写入输入框（正在输入时不覆盖）
 * - `status`：{ kind: idle|loading|ok|fail, text }
 *
 * 事件：
 * - `close`
 * - `save`（detail: { apiKey, baseUrl }）
 */
const TEMPLATE = `
  <div class="modal-overlay" data-ref="overlay" hidden>
    <div class="modal settings-modal" role="dialog" aria-modal="true" aria-label="设置">
      <div class="modal-head">
        <span class="modal-title">设置</span>
        <button type="button" class="modal-close" data-ref="close" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      </div>
      <div class="settings-form">
        <div class="field">
          <span class="field-label">API Key</span>
          <wa-input data-ref="apiKey" data-field="api-key" type="text" size="s" appearance="outlined" placeholder="sk-…" class="field-key is-secret" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></wa-input>
          <span class="field-hint">只保存在本机。</span>
        </div>
        <div class="field">
          <div class="label-row">
            <span class="field-label">接口地址</span>
            <span class="model-status" data-ref="status" hidden>
              <svg class="status-icon icon-ok" viewBox="0 0 12 12" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M2 6.4 4.8 9 10 3.2" />
              </svg>
              <svg class="status-icon icon-fail" viewBox="0 0 12 12" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
              <svg class="status-icon icon-loading" viewBox="0 0 12 12" fill="none" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
                <circle cx="6" cy="6" r="4.6" class="spinner-track" />
                <path d="M6 1.4a4.6 4.6 0 0 1 4.6 4.6" class="spinner-arc" />
              </svg>
              <span class="model-status-text" data-ref="statusText"></span>
            </span>
          </div>
          <wa-input data-ref="baseUrl" data-field="base-url" size="s" appearance="outlined" class="field-url" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></wa-input>
          <span class="field-hint">默认 DeepSeek 官方地址；换成第三方地址时，图片识别与余额不可用。</span>
        </div>
      </div>
      <div class="modal-foot">
        <wa-button variant="brand" size="s" data-ref="save">保存并读取模型</wa-button>
      </div>
    </div>
  </div>
`

class FtSettingsSheet extends FtElement {
  static template = TEMPLATE

  #open = false
  #apiKey = ''
  #baseUrl = ''
  #status = { kind: 'idle', text: '' }
  #basePlaceholder = 'https://api.deepseek.com'

  get open() {
    return this.#open
  }

  set open(value) {
    const next = Boolean(value)
    if (next === this.#open) return
    this.#open = next
    this.render()
    if (next) {
      this.applyValues(true)
      const input = this.ref('apiKey')
      if (input !== null && typeof input.focus === 'function') input.focus()
    }
  }

  get apiKey() {
    return this.#apiKey
  }

  set apiKey(value) {
    this.#apiKey = String(value ?? '')
    this.applyValues(false)
  }

  get baseUrl() {
    return this.#baseUrl
  }

  set baseUrl(value) {
    this.#baseUrl = String(value ?? '')
    this.applyValues(false)
  }

  get basePlaceholder() {
    return this.#basePlaceholder
  }

  set basePlaceholder(value) {
    this.#basePlaceholder = String(value ?? '')
    this.applyValues(false)
  }

  get status() {
    return this.#status
  }

  set status(value) {
    this.#status = value ?? { kind: 'idle', text: '' }
    this.render()
  }

  /** 打开时强制同步；平时只在没有焦点在输入框里时才写，避免打断输入 */
  applyValues(force) {
    const apiKey = this.ref('apiKey')
    const baseUrl = this.ref('baseUrl')
    if (apiKey === null || baseUrl === null) return
    const active = document.activeElement
    const typing = active !== null && (active === apiKey || active === baseUrl || (active.closest !== undefined && active.closest('wa-input') !== null))
    if (typing && !force) return
    if (apiKey.value !== this.#apiKey) apiKey.value = this.#apiKey
    if (baseUrl.value !== this.#baseUrl) baseUrl.value = this.#baseUrl
    baseUrl.placeholder = this.#basePlaceholder
  }

  onConnect() {
    this.ref('close').addEventListener('click', () => this.emit('close'))
    this.ref('overlay').addEventListener('mousedown', (event) => {
      if (event.target === this.ref('overlay')) this.emit('close')
    })
    this.ref('save').addEventListener('click', () => {
      this.emit('save', {
        apiKey: String(this.ref('apiKey').value ?? '').trim(),
        baseUrl: String(this.ref('baseUrl').value ?? '').trim(),
      })
    })
  }

  render() {
    const overlay = this.ref('overlay')
    if (overlay === null) return
    overlay.hidden = !this.#open

    const box = this.ref('status')
    box.hidden = this.#status.kind === 'idle'
    box.classList.remove('is-ok', 'is-fail', 'is-loading')
    if (this.#status.kind === 'ok') box.classList.add('is-ok')
    if (this.#status.kind === 'fail') box.classList.add('is-fail')
    if (this.#status.kind === 'loading') box.classList.add('is-loading')
    this.ref('statusText').textContent = this.#status.text ?? ''
    box.title = this.#status.kind === 'fail' ? this.#status.text ?? '' : ''
  }
}

define('ft-settings-sheet', FtSettingsSheet)
