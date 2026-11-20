import { FtElement, define } from '../lib/element.js'

/**
 * <ft-balance-dialog>：余额弹窗。
 *
 * 属性：
 * - `open`    是否显示（布尔属性）
 * - `busy`    是否正在刷新（布尔属性，控制进度条与按钮禁用）
 * - `amount`  余额文本
 *
 * 事件：
 * - `close`   用户点了关闭 / 遮罩
 * - `refresh` 用户点了刷新
 */
const TEMPLATE = `
  <div class="modal-overlay" data-ref="overlay" hidden>
    <div class="modal balance-modal" role="dialog" aria-modal="true" aria-label="余额">
      <div class="modal-head">
        <span class="modal-title">余额</span>
        <button type="button" class="modal-close" data-ref="close" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      </div>
      <div class="progress-line balance-modal-progress is-idle" data-ref="progress" aria-hidden="true">
        <span class="progress-line-runner"></span>
      </div>
      <div class="balance-body">
        <span class="balance-amount" data-ref="amount">--</span>
      </div>
      <div class="modal-foot">
        <wa-button appearance="plain" size="s" data-ref="refresh">刷新</wa-button>
        <wa-button variant="brand" size="s" data-ref="ok">关闭</wa-button>
      </div>
    </div>
  </div>
`

class FtBalanceDialog extends FtElement {
  static template = TEMPLATE

  #open = false
  #busy = false
  #amount = '--'

  get open() {
    return this.#open
  }

  set open(value) {
    const next = Boolean(value)
    if (next === this.#open) return
    this.#open = next
    this.render()
  }

  get busy() {
    return this.#busy
  }

  set busy(value) {
    const next = Boolean(value)
    if (next === this.#busy) return
    this.#busy = next
    this.render()
  }

  get amount() {
    return this.#amount
  }

  set amount(value) {
    const next = String(value ?? '').trim() || '--'
    if (next === this.#amount) return
    this.#amount = next
    this.render()
  }

  onConnect() {
    this.ref('close').addEventListener('click', () => this.emit('close'))
    this.ref('ok').addEventListener('click', () => this.emit('close'))
    this.ref('refresh').addEventListener('click', () => {
      if (this.#busy) return
      this.emit('refresh')
    })
    // 点遮罩空白处关闭
    this.ref('overlay').addEventListener('mousedown', (event) => {
      if (event.target === this.ref('overlay')) this.emit('close')
    })
  }

  render() {
    const overlay = this.ref('overlay')
    if (overlay === null) return // 尚未 connected
    overlay.hidden = !this.#open
    this.ref('amount').textContent = this.#amount
    this.ref('progress').classList.toggle('is-idle', !this.#busy)
    this.ref('refresh').disabled = this.#busy
  }
}

define('ft-balance-dialog', FtBalanceDialog)
