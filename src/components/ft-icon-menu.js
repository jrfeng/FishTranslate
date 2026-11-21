import { FtElement, define } from '../lib/element.js'

/**
 * <ft-icon-menu>：工具栏图标按钮下方的下拉菜单（模型 / 主题）。
 *
 * 属性：
 * - `open`     是否展开
 * - `items`    [{ id, label }]
 * - `current`  当前选中 id（显示勾）
 *
 * 事件：
 * - `select`（detail 为 id）
 *
 * 位置：宿主即原来的 `.icon-menu` 容器，绝对定位沿用全局样式；
 * 展开时若超出窗口右边会自动加 `is-right` 改为右对齐。
 */
class FtIconMenu extends FtElement {
  static template = ''

  #open = false
  #items = []
  #current = ''

  get open() {
    return this.#open
  }

  set open(value) {
    const next = Boolean(value)
    if (next === this.#open) return
    this.#open = next
    this.render()
  }

  get items() {
    return this.#items
  }

  set items(value) {
    this.#items = Array.isArray(value) ? value : []
    if (this.#open) this.renderRows()
  }

  get current() {
    return this.#current
  }

  set current(value) {
    this.#current = String(value ?? '')
    if (this.#open) this.renderRows()
  }

  render() {
    this.hidden = !this.#open
    if (!this.#open) return
    this.renderRows()
    this.adjustSide()
  }

  /** 靠近窗口右边时改成右对齐，避免菜单出界 */
  adjustSide() {
    this.classList.remove('is-right')
    const rect = this.getBoundingClientRect()
    if (rect.right > window.innerWidth - 8) this.classList.add('is-right')
  }

  renderRows() {
    this.replaceChildren()
    for (const item of this.#items) {
      const current = item.id === this.#current
      const row = document.createElement('div')
      row.className = 'icon-menu-item' + (current ? ' is-current' : '')
      row.setAttribute('role', 'menuitem')
      const tick = document.createElement('span')
      tick.className = 'tick'
      if (current) {
        tick.innerHTML =
          '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 4.8 9 10 3.2" /></svg>'
      }
      const label = document.createElement('span')
      label.textContent = item.label
      row.append(tick, label)
      row.addEventListener('click', () => this.emit('select', item.id))
      this.appendChild(row)
    }
  }
}

define('ft-icon-menu', FtIconMenu)
