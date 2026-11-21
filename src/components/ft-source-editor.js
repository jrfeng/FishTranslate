import { FtElement, define } from '../lib/element.js'

/**
 * <ft-source-editor>：原文编辑区（高亮层 + 文本域 + 插图按钮）。
 *
 * 说明：文本域与高亮层必须逐像素对齐，滚动同步和「写高亮」放在组件内部，
 * 避免外部每次改内容都要手动搬 scrollTop。
 *
 * 属性：
 * - `value`          文本内容（会同步到 textarea）
 * - `highlightHtml`  高亮层 HTML
 *
 * 事件：
 * - `input`（detail: value）
 * - `pick-image`
 *
 * 兼容：内部保留 `id="source"` / `id="hl"` / `id="image-input"`，
 * 外壳里仍有少量代码按 id 取用，后续可继续替换成组件方法。
 */
const TEMPLATE = `
  <div class="editor">
    <pre class="hl" id="hl" data-ref="hl" aria-hidden="true"></pre>
    <textarea class="input" id="source" data-ref="source" spellcheck="false" placeholder="在这里输入或粘贴要翻译的文本…"></textarea>
    <wa-button id="pick-image" class="pick-image-fab" appearance="outlined" size="s" data-ref="pick" title="从本地选一张图片，识别文字后翻译" aria-label="从本地选一张图片">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    </wa-button>
    <input type="file" id="image-input" data-ref="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff" hidden />
  </div>
`

class FtSourceEditor extends FtElement {
  static template = TEMPLATE

  #value = ''
  #highlight = ''
  #syncing = false

  get value() {
    return this.ref('source')?.value ?? this.#value
  }

  set value(next) {
    this.#value = String(next ?? '')
    const source = this.ref('source')
    if (source !== null && source.value !== this.#value) source.value = this.#value
    this.applyHighlight()
  }

  get highlightHtml() {
    return this.#highlight
  }

  set highlightHtml(next) {
    this.#highlight = String(next ?? '')
    this.applyHighlight()
  }

  /** 写高亮（只在内容变化时调用），并同步一次滚动位置 */
  applyHighlight() {
    const hl = this.ref('hl')
    const source = this.ref('source')
    if (hl === null || source === null) return
    hl.innerHTML = this.#highlight
    this.syncScroll()
  }

  /** 只同步滚动位置：滚动时绝不能重建高亮层，否则会清空已渲染的内容 */
  syncScroll() {
    const hl = this.ref('hl')
    const source = this.ref('source')
    if (hl === null || source === null) return
    hl.scrollTop = source.scrollTop
    hl.scrollLeft = source.scrollLeft
  }

  focus() {
    const source = this.ref('source')
    if (source !== null && typeof source.focus === 'function') source.focus()
  }

  onConnect() {
    const source = this.ref('source')
    source.addEventListener('input', () => {
      this.#value = source.value
      this.emit('input', source.value)
    })
    source.addEventListener('scroll', () => this.syncScroll())
    this.ref('pick').addEventListener('click', () => this.emit('pick-image'))
  }
}

define('ft-source-editor', FtSourceEditor)
