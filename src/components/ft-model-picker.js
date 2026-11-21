import { define } from '../lib/element.js'
import { FtPickerDialog } from './ft-picker-dialog.js'

/**
 * <ft-model-picker>：模型选择弹窗。
 *
 * 属性：`open` / `value`（待确认模型）/ `items`（[{ id }]）
 * 事件：`select`（点击某一行，detail 为 id）、`confirm`（点「完成」，detail 为 id）、`close`
 */
const TEMPLATE = `
  <div class="modal-overlay" data-ref="overlay" hidden>
    <div class="modal picker-modal" role="dialog" aria-modal="true" aria-label="模型">
      <div class="modal-head">
        <span class="modal-title">模型</span>
        <button type="button" class="modal-close" data-ref="close" title="关闭" aria-label="关闭">
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
        </button>
      </div>
      <div class="picker-list" data-ref="list"></div>
      <div class="modal-foot">
        <wa-button appearance="plain" size="s" data-ref="cancel">取消</wa-button>
        <wa-button variant="brand" size="s" data-ref="done">完成</wa-button>
      </div>
    </div>
  </div>
`

class FtModelPicker extends FtPickerDialog {
  static template = TEMPLATE

  onConnect() {
    super.onConnect()
    this.ref('cancel').addEventListener('click', () => this.emit('close'))
    this.ref('done').addEventListener('click', () => this.emit('confirm', this.value))
  }
}

define('ft-model-picker', FtModelPicker)
