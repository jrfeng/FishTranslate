/**
 * 轻量 Web Component 基类。
 *
 * 约定：
 * - 使用 **light DOM**（不用 shadow root），这样现有的 `app.css` 全局样式、
 *   主题变量和 `wa-*` 组件都能直接复用，迁移成本最低。
 * - 子类通过 `static template` 提供初始结构；带 `data-ref="name"` 的节点
 *   可以用 `this.ref('name')` 取到。
 * - 子类通过 `onConnect()` 绑定一次性事件，`render()` 负责同步视图。
 */

export class FtElement extends HTMLElement {
  static template = ''

  #refs = null
  #connected = false

  connectedCallback() {
    if (!this.#connected) {
      this.#connected = true
      this.innerHTML = this.constructor.template
      this.#refs = new Map()
      for (const node of this.querySelectorAll('[data-ref]')) {
        this.#refs.set(node.dataset.ref, node)
      }
      this.onConnect?.()
    }
    this.render()
  }

  /** 取模板里带 data-ref 的节点 */
  ref(name) {
    return this.#refs?.get(name) ?? null
  }

  /** 子类覆盖，做一次视图同步 */
  render() {}

  /** 派发一个自定义事件（默认冒泡，便于外层统一监听） */
  emit(name, detail = null) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }
}

/** 注册自定义元素；重复注册直接忽略 */
export function define(tagName, ctor) {
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, ctor)
  }
}
