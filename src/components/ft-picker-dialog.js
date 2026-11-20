import { FtElement, define } from '../lib/element.js'

/**
 * 选项弹窗的公共渲染：一个列表 + 若干行，选中行带勾。
 * 模型 / 主题两个弹窗结构一致，抽成一个基类避免重复。
 */
export class FtPickerDialog extends FtElement {
  #open = false
  #value = ''
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

  /** 当前选中/待确认的 id */
  get value() {
    return this.#value
  }

  set value(value) {
    const next = String(value ?? '')
    if (next === this.#value) return
    this.#value = next
    this.render()
  }

  /** [{ id, name }] */
  get items() {
    return this.#items
  }

  set items(value) {
    this.#items = Array.isArray(value) ? value : []
    this.render()
  }

  onConnect() {
    this.ref('close').addEventListener('click', () => this.emit('close'))
    this.ref('overlay').addEventListener('mousedown', (event) => {
      if (event.target === this.ref('overlay')) this.emit('close')
    })
  }

  render() {
    const overlay = this.ref('overlay')
    if (overlay === null) return
    overlay.hidden = !this.#open
    this.renderItems()
  }

  renderItems() {
    const list = this.ref('list')
    if (list === null) return
    list.replaceChildren()
    for (const item of this.#items) {
      const current = item.id === this.#value
      const row = document.createElement('div')
      row.className = 'picker-item' + (current ? ' is-current' : '')
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', String(current))
      const tick = document.createElement('span')
      tick.className = 'tick'
      if (current) {
        tick.innerHTML =
          '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.4 4.8 9 10 3.2" /></svg>'
      }
      const label = document.createElement('span')
      label.textContent = item.name ?? item.id
      row.append(tick, label)
      row.addEventListener('click', () => this.emit('select', item.id))
      list.appendChild(row)
    }
  }
}
