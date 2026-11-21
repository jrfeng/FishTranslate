import { define } from '../lib/element.js'
import { FtPickerDialog } from './ft-picker-dialog.js'

/**
 * <ft-theme-picker>：主题选择弹窗。
 *
 * 属性：`open` / `value`（当前主题 id）/ `items`（[{ id, name }]）
 * 事件：`select`（点一行，外部应立即应用主题并保持弹窗打开）、`close`
 */
const TEMPLATE = `
  <div class="modal-overlay" data-ref="overlay" hidden>
    <div class="modal picker-modal" role="dialog" aria-modal="true" aria-label="主题">
      <div class="modal-head">
        <span class="modal-title">主题</span>
        <button type="button" class="modal-close" data-ref="close" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      </div>
      <div class="picker-list" data-ref="list"></div>
      <div class="modal-foot">
        <wa-button variant="brand" size="s" data-ref="done">完成</wa-button>
      </div>
    </div>
  </div>
`

class FtThemePicker extends FtPickerDialog {
  static template = TEMPLATE

  onConnect() {
    super.onConnect()
    this.ref('done').addEventListener('click', () => this.emit('close'))
  }
}

define('ft-theme-picker', FtThemePicker)
