import { FtElement, define } from '../lib/element.js'

/**
 * <ft-more-menu>：窄窗口下工具栏的「更多」菜单。
 *
 * 属性：
 * - `open`   是否展开（布尔属性）
 * - `items`  [{ key, label, value }]，value 为空则不显示右侧数值
 *
 * 事件：
 * - `select`（detail 为 item.key）
 *
 * 图标策略：模型 / 主题 / 设置直接复用工具栏按钮里的 svg，
 * 这样两边永远一致；余额用内置的小卡片图标。
 */

const FALLBACK_ICONS = {
  balance:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="4.6" width="12" height="6.8" rx="1.4" /><circle cx="8" cy="8" r="1.6" /></svg>',
}

/// 菜单项 → 工具栏按钮（用 data-role 定位，图标随主题实时变化）
const TOOLBAR_SOURCES = {
  model: '[data-role="model-icon"]',
  theme: '[data-role="theme-icon"]',
  settings: '[data-role="settings-icon"]',
}

/** 克隆工具栏按钮里的 svg，并按画布尺寸补偿线宽，保证 16px 下粗细一致 */
function cloneToolbarIcon(selector) {
  const button = document.querySelector(selector)
  if (button === null) return null
  const source = button.querySelector('svg')
  if (source === null) return null
  const clone = source.cloneNode(true)
  const box = String(clone.getAttribute('viewBox') || '0 0 16 16').split(/[\s,]+/)
  const gridSize = Number(box[2]) || 16
  clone.setAttribute('width', '16')
  clone.setAttribute('height', '16')
  // 目标渲染线宽 1.4px：16 网格 → 1.4，24 网格 → 2.1
  clone.style.strokeWidth = String((1.4 * gridSize) / 16)
  clone.removeAttribute('class')
  return clone
}

class FtMoreMenu extends FtElement {
  static template = ''

  #open = false
  #items = []

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

  render() {
    this.hidden = !this.#open
    if (this.#open) this.renderRows()
  }

  renderRows() {
    this.replaceChildren()
    for (const item of this.#items) {
      const row = document.createElement('div')
      row.className = 'more-item'
      row.setAttribute('role', 'menuitem')

      const ico = document.createElement('span')
      ico.className = 'ico'
      const sourceId = TOOLBAR_SOURCES[item.key]
      const icon = sourceId === undefined ? null : cloneToolbarIcon(sourceId)
      if (icon !== null) {
        ico.appendChild(icon)
      } else {
        ico.innerHTML = FALLBACK_ICONS[item.key] ?? ''
      }

      const label = document.createElement('span')
      label.textContent = item.label
      row.append(ico, label)

      if (item.value !== undefined && String(item.value).length > 0) {
        const val = document.createElement('span')
        val.className = 'val'
        val.textContent = item.value
        row.appendChild(val)
      }

      row.addEventListener('click', () => this.emit('select', item.key))
      this.appendChild(row)
    }
  }
}

define('ft-more-menu', FtMoreMenu)
