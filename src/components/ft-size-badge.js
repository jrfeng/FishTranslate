import { FtElement, define } from '../lib/element.js'
import { readStore, writeStore } from '../lib/storage.js'

/**
 * <ft-size-badge>：窗口宽度调试角标。
 *
 * 只在 `FISH_DEBUG=1` 的构建里生效（release 构建整段被 esbuild 剔除）。
 * 显示当前视口 `宽 × 高`，Ctrl+Shift+D 开关，状态存 localStorage。
 */
class FtSizeBadge extends FtElement {
  static template = '<div id="size-badge" hidden aria-hidden="true"></div>'

  #enabled = false

  onConnect() {
    if (__FISH_DEBUG__ !== true) return

    const stored = readStore('fish-app.debug-size')
    this.#enabled = stored === null ? true : stored === '1'
    this.refresh()

    window.addEventListener('resize', () => this.refresh())

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey !== true || event.shiftKey !== true) return
      if (String(event.key).toLowerCase() !== 'd') return
      event.preventDefault()
      this.#enabled = !this.#enabled
      writeStore('fish-app.debug-size', this.#enabled ? '1' : '0')
      this.refresh()
    })
  }

  refresh() {
    const badge = this.querySelector('#size-badge')
    if (badge === null) return
    badge.hidden = !this.#enabled
    if (!this.#enabled) return
    badge.textContent = Math.round(window.innerWidth) + ' × ' + Math.round(window.innerHeight)
  }
}

define('ft-size-badge', FtSizeBadge)
