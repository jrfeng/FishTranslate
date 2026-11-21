import { FtElement, define } from '../lib/element.js'
import { renderMarkdown } from '../lib/markdown.js'

/**
 * <ft-verify-dialog>：校验识别结果弹窗（上图片、下文字）。
 *
 * 属性：
 * - `open`     是否显示
 * - `imageSrc` 待校验图片地址
 * - `text`     识别出的文本（打开时写入编辑框）
 *
 * 事件：
 * - `save`（detail: { text }）用户点「确认 / 保存」
 * - `close` 用户放弃并关闭
 *
 * 内部自己管理：缩放/平移、全屏放大、编辑/预览切换、未保存确认。
 */
const TEMPLATE = `
  <div class="verify-overlay" id="verify-overlay" data-ref="overlay" hidden>
    <div class="verify-dialog">
      <div class="verify-stage" id="verify-stage" data-ref="stage">
        <img id="verify-image" data-ref="image" alt="待校验的图片" />
        <button type="button" class="verify-expand" data-ref="expand">⤢ 放大</button>
        <div class="verify-zoom">
          <button type="button" class="verify-zoom-btn" data-ref="zoomOut" title="缩小">−</button>
          <span class="verify-zoom-value" data-ref="zoomValue">100%</span>
          <button type="button" class="verify-zoom-btn" data-ref="zoomIn" title="放大">＋</button>
          <button type="button" class="verify-zoom-btn" data-ref="zoomReset" title="还原">重置</button>
        </div>
      </div>
      <div class="verify-panel">
        <div class="verify-head">
          <span class="verify-head-hint">识别文本 · 改完点「确认」</span>
          <span class="verify-head-title">校验识别结果</span>
          <button type="button" class="verify-btn" data-ref="view" title="切换预览 / 编辑">预览</button>
          <button type="button" class="verify-btn verify-btn-primary" data-ref="save">确认</button>
          <button type="button" class="verify-head-close" data-ref="close" title="关闭" aria-label="关闭">
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" /></svg>
          </button>
        </div>
        <textarea data-ref="editor" spellcheck="false" placeholder="这里显示识别出的文字，可直接修改。"></textarea>
        <div class="verify-preview" id="verify-preview" data-ref="preview" hidden></div>
        <div class="verify-actions" data-ref="actions">
          <button type="button" class="verify-btn verify-abandon" data-ref="abandon">放弃</button>
          <button type="button" class="verify-btn verify-btn-primary" data-ref="saveBottom">保存</button>
        </div>
        <div class="verify-confirm" data-ref="confirm" hidden>
          <span>有未保存的修改，确定放弃吗？</span>
          <button type="button" class="verify-btn" data-ref="keep">继续编辑</button>
          <button type="button" class="verify-btn verify-btn-danger" data-ref="discard">放弃修改</button>
        </div>
      </div>
    </div>
  </div>
`

class FtVerifyDialog extends FtElement {
  static template = TEMPLATE

  #open = false
  #imageSrc = ''
  #text = ''
  #zoom = 1
  #panX = 0
  #panY = 0
  #view = 'preview'
  #dragging = false
  #dragStartX = 0
  #dragStartY = 0
  #panStartX = 0
  #panStartY = 0

  get open() {
    return this.#open
  }

  set open(value) {
    const next = Boolean(value)
    if (next === this.#open) return
    this.#open = next
    if (next) {
      this.#view = 'preview'
      this.ref('confirm').hidden = true
      this.resetStage()
      this.resetZoom()
      this.renderView()
    } else {
      this.ref('overlay').hidden = true
      this.ref('confirm').hidden = true
      this.ref('image').removeAttribute('src')
    }
    this.render()
  }

  get imageSrc() {
    return this.#imageSrc
  }

  set imageSrc(value) {
    this.#imageSrc = String(value ?? '')
    const image = this.ref('image')
    if (image === null) return
    if (this.#imageSrc.length > 0) image.src = this.#imageSrc
    else image.removeAttribute('src')
  }

  get text() {
    return this.#text
  }

  set text(value) {
    this.#text = String(value ?? '')
    const editor = this.ref('editor')
    if (editor !== null) editor.value = this.#text
  }

  onConnect() {
    this.ref('close').addEventListener('click', () => this.requestClose())
    this.ref('abandon').addEventListener('click', () => this.requestClose())
    this.ref('save').addEventListener('click', () => this.emitSave())
    this.ref('saveBottom').addEventListener('click', () => this.emitSave())
    this.ref('overlay').addEventListener('click', (event) => {
      if (event.target === this.ref('overlay')) this.requestClose()
    })

    this.ref('expand').addEventListener('click', () => {
      const stage = this.ref('stage')
      const full = stage.classList.toggle('is-full')
      this.ref('expand').textContent = full ? '⤢ 收起' : '⤢ 放大'
    })

    this.ref('view').addEventListener('click', () => {
      this.#view = this.#view === 'preview' ? 'edit' : 'preview'
      this.renderView()
      if (this.#view === 'edit') this.ref('editor').focus()
    })

    this.ref('keep').addEventListener('click', () => {
      this.ref('confirm').hidden = true
    })
    this.ref('discard').addEventListener('click', () => {
      this.ref('confirm').hidden = true
      this.finishClose()
    })

    this.bindStage()
    this.ref('zoomIn').addEventListener('click', () => this.setZoom(this.#zoom * 1.25))
    this.ref('zoomOut').addEventListener('click', () => this.setZoom(this.#zoom / 1.25))
    this.ref('zoomReset').addEventListener('click', () => this.resetZoom())
  }

  bindStage() {
    const stage = this.ref('stage')
    const isControl = (target) =>
      target instanceof Element &&
      target.closest('.verify-zoom, .verify-head-close, .verify-expand') !== null

    stage.addEventListener(
      'wheel',
      (event) => {
        if (isControl(event.target)) return
        event.preventDefault()
        const rect = stage.getBoundingClientRect()
        const originX = event.clientX - rect.left - rect.width / 2
        const originY = event.clientY - rect.top - rect.height / 2
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
        this.setZoom(this.#zoom * factor, originX, originY)
      },
      { passive: false },
    )

    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      // 点控件时不要抢指针，否则按钮收不到 click
      if (isControl(event.target)) return
      this.#dragging = true
      this.#dragStartX = event.clientX
      this.#dragStartY = event.clientY
      this.#panStartX = this.#panX
      this.#panStartY = this.#panY
      stage.classList.add('is-dragging')
      stage.setPointerCapture?.(event.pointerId)
    })

    stage.addEventListener('pointermove', (event) => {
      if (!this.#dragging) return
      this.#panX = this.#panStartX + (event.clientX - this.#dragStartX)
      this.#panY = this.#panStartY + (event.clientY - this.#dragStartY)
      this.applyTransform()
    })

    const endDrag = (event) => {
      if (!this.#dragging) return
      this.#dragging = false
      stage.classList.remove('is-dragging')
      stage.releasePointerCapture?.(event.pointerId)
    }
    stage.addEventListener('pointerup', endDrag)
    stage.addEventListener('pointercancel', endDrag)
    stage.addEventListener('dblclick', (event) => {
      if (isControl(event.target)) return
      this.resetZoom()
    })
  }

  applyTransform() {
    this.ref('image').style.transform =
      'translate(' + this.#panX + 'px, ' + this.#panY + 'px) scale(' + this.#zoom + ')'
    this.ref('zoomValue').textContent = Math.round(this.#zoom * 100) + '%'
  }

  /** 以 (originX, originY) 为中心缩放，坐标相对舞台中心 */
  setZoom(next, originX = 0, originY = 0) {
    const clamped = Math.min(8, Math.max(0.2, next))
    const ratio = clamped / this.#zoom
    this.#panX = originX - (originX - this.#panX) * ratio
    this.#panY = originY - (originY - this.#panY) * ratio
    this.#zoom = clamped
    this.applyTransform()
  }

  resetZoom() {
    this.#zoom = 1
    this.#panX = 0
    this.#panY = 0
    this.applyTransform()
  }

  resetStage() {
    this.ref('stage').classList.remove('is-full')
    this.ref('expand').textContent = '⤢ 放大'
  }

  renderView() {
    const previewing = this.#view === 'preview'
    this.ref('editor').hidden = previewing
    this.ref('preview').hidden = !previewing
    this.ref('view').textContent = previewing ? '编辑' : '预览'
    if (previewing) {
      this.ref('preview').innerHTML =
        '<div class="md">' + renderMarkdown(this.ref('editor').value) + '</div>'
    }
  }

  /** 弹窗里的文字有没有改过 */
  isDirty() {
    return this.#open && this.ref('editor').value !== this.#text
  }

  requestClose() {
    if (!this.#open) return
    if (this.isDirty()) {
      this.ref('confirm').hidden = false
      return
    }
    this.finishClose()
  }

  finishClose() {
    this.#open = false
    this.render()
    this.ref('overlay').hidden = true
    this.ref('confirm').hidden = true
    this.ref('image').removeAttribute('src')
    this.emit('close')
  }

  emitSave() {
    this.emit('save', { text: this.ref('editor').value })
  }

  render() {
    const overlay = this.ref('overlay')
    if (overlay === null) return
    overlay.hidden = !this.#open
  }
}

define('ft-verify-dialog', FtVerifyDialog)
