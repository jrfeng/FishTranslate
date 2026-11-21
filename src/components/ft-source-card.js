import { FtElement, define } from '../lib/element.js'

/**
 * <ft-source-card>：原文卡片外壳（卡片头按钮、图片预览条、OCR 进度、编辑区、字数）。
 *
 * 目前只接管结构；内部保留原有 id（translate / clear / immediate / image-* 等），
 * 外壳仍按 id 取用，下一步再逐步换成属性与事件。
 */
const TEMPLATE = `
  <section class="card card-grow">
    <div class="card-head">
      <span class="card-title">原文</span>
      <span class="count card-count-head" id="char-count-head">0 字符</span>
      <div class="card-meta">
        <button type="button" class="card-icon-btn with-label" id="terms-icon" title="术语"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.2V3.5a1 1 0 0 1 1-1h3.7a1 1 0 0 1 .7.3l5.3 5.3a1 1 0 0 1 0 1.4l-3.7 3.7a1 1 0 0 1-1.4 0L2.8 7.9a1 1 0 0 1-.3-.7z" /><circle cx="5.6" cy="5.6" r=".9" /></svg><span class="card-icon-label" id="terms-icon-label">术语 0 条</span></button>
        <button type="button" class="card-icon-btn" id="immediate-icon" role="switch" aria-checked="false" title="粘贴后翻译"><svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="14.4" font-size="13" font-family="Microsoft YaHei, sans-serif" text-anchor="middle" fill="currentColor" font-weight="700">译</text><text x="12" y="21.2" font-size="5.6" font-family="Arial, sans-serif" text-anchor="middle" fill="currentColor" font-weight="700" letter-spacing="0.2">AUTO</text></svg></button>
        <button type="button" class="card-icon-btn" id="clear-icon" title="清除原文"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M20 5.91406H28V13.9141H43V21.9141H5V13.9141H20V5.91406Z" /><path d="M8 40H40V22H8V40Z" /><path d="M16 39.8976V33.9141" /><path d="M24 39.8977V33.8977" /><path d="M32 39.8976V33.9141" /><path d="M12 40H36" /></svg></button>
        <button type="button" class="toggle" id="immediate" role="switch" aria-checked="false" title="开启后，粘贴文本即自动翻译">
          <span class="toggle-dot" aria-hidden="true"></span>
          <span class="toggle-text">粘贴后翻译</span>
        </button>
        <wa-button id="clear" appearance="plain" size="s">清除</wa-button>
        <wa-button id="translate" variant="brand" size="s">翻译</wa-button>
      </div>
    </div>
    <div class="image-preview" id="image-preview" hidden>
      <img class="image-thumb" id="image-thumb" alt="待识别的图片" title="点击校验" />
      <div class="image-meta">
        <span class="image-name" id="image-name"></span>
        <span class="image-size" id="image-size"></span>
      </div>
      <wa-button id="image-refresh" class="image-refresh-btn" appearance="plain" size="s" title="重新识别这张图片" aria-label="重新识别这张图片">
        <svg class="image-refresh-icon" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </wa-button>
      <button type="button" class="image-strip-icon" id="image-zoom-icon" title="校验识别结果" aria-label="校验识别结果"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9" /><path d="M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9" /><path d="M20 15v3.4a1.6 1.6 0 0 1-1.6 1.6H15" /><path d="M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15" /><path d="m8.4 12 2.4 2.4 4.8-4.8" /></svg></button>
      <wa-button id="image-zoom" appearance="outlined" size="s" title="放大图片，核对识别结果">校验</wa-button>
    </div>
    <div class="progress-line" id="ocr-progress" hidden aria-hidden="true">
      <span class="progress-line-runner"></span>
    </div>
    <ft-source-editor id="source-editor"></ft-source-editor>
    <div class="card-foot">
      <span class="count" id="char-count">0 字符</span>
    </div>
  </section>
`

class FtSourceCard extends FtElement {
  static template = TEMPLATE

  #inputLength = 0
  #hasImage = false
  #loading = false
  #ocrBusy = false
  #termsCount = 0
  #immediate = false

  get inputLength() { return this.#inputLength }
  set inputLength(value) { this.#inputLength = Number(value) || 0; this.render() }

  get hasImage() { return this.#hasImage }
  set hasImage(value) { this.#hasImage = Boolean(value); this.render() }

  get loading() { return this.#loading }
  set loading(value) { this.#loading = Boolean(value); this.render() }

  get ocrBusy() { return this.#ocrBusy }
  set ocrBusy(value) { this.#ocrBusy = Boolean(value); this.render() }

  get termsCount() { return this.#termsCount }
  set termsCount(value) { this.#termsCount = Number(value) || 0; this.render() }

  get immediate() { return this.#immediate }
  set immediate(value) { this.#immediate = Boolean(value); this.render() }

  render() {
    const count = this.#inputLength + ' 字符'
    const countEl = this.querySelector('#char-count')
    const countHead = this.querySelector('#char-count-head')
    if (countEl !== null) countEl.textContent = count
    if (countHead !== null) countHead.textContent = count

    const translate = this.querySelector('#translate')
    if (translate !== null) {
      translate.disabled = this.#inputLength === 0 || this.#loading || this.#ocrBusy
      translate.textContent = this.#loading ? '翻译中…' : '翻译'
    }

    const clear = this.querySelector('#clear')
    const clearDisabled = (this.#inputLength === 0 && !this.#hasImage) || this.#ocrBusy
    if (clear !== null) clear.disabled = clearDisabled
    const clearIcon = this.querySelector('#clear-icon')
    if (clearIcon !== null) clearIcon.disabled = clearDisabled

    for (const selector of ['#immediate', '#immediate-icon']) {
      const node = this.querySelector(selector)
      if (node === null) continue
      node.setAttribute('aria-checked', String(this.#immediate))
      node.classList.toggle('on', this.#immediate)
    }

    const label = this.querySelector('#terms-icon-label')
    if (label !== null) label.textContent = '术语 ' + this.#termsCount + ' 条'
    const mobileLabel = document.getElementById('mobile-terms-label')
    if (mobileLabel !== null) mobileLabel.textContent = '术语 ' + this.#termsCount
  }
}

define('ft-source-card', FtSourceCard)
