import { FtElement, define } from '../lib/element.js'

/**
 * <ft-toolbar>：顶部工具栏（语言 / 模型 / 主题 / 设置 / 更多）。
 *
 * 宿主用 `display: contents` 参与 `.head` 的 flex 布局，视觉上和原来的直接子元素一致；
 * 余额标签仍由外壳管理，留在 `<header class="head">` 里。
 *
 * 属性（都用 setter 传）：
 * - `languages`  语言列表（字符串数组）
 * - `source` / `target`  原文 / 译文语言
 * - `models`     模型列表 [{ id }]
 * - `model`      当前模型
 * - `themes`     主题列表 [{ id, name }]
 * - `theme`      当前主题
 * - `settingsOpen`  设置面板是否打开（只用于 aria-expanded）
 * - `moreOpen` / `moreItems`
 * - `modelMenuOpen` / `modelMenuItems` / `modelMenuCurrent`
 * - `themeMenuOpen` / `themeMenuItems` / `themeMenuCurrent`
 * - `tips`       { model, theme, settings }
 *
 * 事件：
 * - `select-change` { field: source|target|model|theme, value }
 * - `menu-toggle`   { menu: model|theme }
 * - `menu-select`   { menu: model|theme, value }
 * - `more-toggle`
 * - `more-select`   value
 * - `settings`
 */
const TEMPLATE = `
  <div class="lang-pair">
    <span class="field-label">原文</span>
    <wa-select data-ref="source" size="s" appearance="outlined" class="lang-select" title="选择原文语言"></wa-select>
    <span class="lang-arrow" aria-hidden="true">→</span>
    <span class="field-label">译文</span>
    <wa-select data-ref="target" size="s" appearance="outlined" class="lang-select" title="选择译文语言"></wa-select>
  </div>
  <div class="head-model">
    <span class="field-label">模型</span>
    <wa-select data-ref="model" size="s" appearance="outlined" class="model-select" title="选择翻译使用的模型"></wa-select>
    <button type="button" class="icon-btn" data-ref="modelBtn" data-role="model-icon" aria-haspopup="true" aria-expanded="false" aria-label="选择模型">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2 14 5.2 8 8.4 2 5.2z" />
        <path d="M2 8.2 8 11.4 14 8.2" />
        <path d="M2 11.2 8 14.4 14 11.2" />
      </svg>
    </button>
    <ft-icon-menu class="icon-menu" data-ref="modelMenu" role="menu" hidden></ft-icon-menu>
  </div>
  <div class="head-tools">
    <span class="field-label">主题</span>
    <wa-select data-ref="theme" size="s" appearance="outlined" class="theme-select" title="切换界面主题"></wa-select>
    <button type="button" class="icon-btn" data-ref="themeBtn" data-role="theme-icon" aria-haspopup="true" aria-expanded="false" aria-label="切换界面主题">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" /></svg>
    </button>
    <ft-icon-menu class="icon-menu" data-ref="themeMenu" role="menu" hidden></ft-icon-menu>
    <span class="settings-wrap">
      <wa-button data-ref="settingsBtn" class="settings-text" appearance="plain" size="s">设置</wa-button>
      <button type="button" class="icon-btn" data-ref="settingsIcon" data-role="settings-icon" aria-label="设置">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
      </button>
    </span>
    <button type="button" class="icon-btn more-btn" id="more-btn" data-ref="moreBtn" aria-haspopup="true" aria-expanded="false" aria-label="更多">
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none" /></svg>
    </button>
    <ft-more-menu class="more-menu" data-ref="moreMenu" role="menu" hidden></ft-more-menu>
  </div>
`

/** 给 wa-select 注入下拉箭头（幂等） */
function ensureSelectChevron(select) {
  if (select === null || select === undefined) return
  if (select.querySelector('[slot="expand-icon"]') !== null) return
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('slot', 'expand-icon')
  svg.setAttribute('class', 'select-chevron')
  svg.setAttribute('viewBox', '0 0 12 12')
  svg.setAttribute('width', '10')
  svg.setAttribute('height', '10')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'M2.5 4.4 6 7.9l3.5-3.5')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.4')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  select.appendChild(svg)
}

/** 用给定值重建 select 的选项（值和选项都没变就跳过，避免闪烁） */
function fillSelect(select, entries, value) {
  if (select === null) return
  const key = entries.map((entry) => entry.value + ':' + entry.label).join('|') + '#' + value
  if (select.dataset.fillKey === key) return
  select.dataset.fillKey = key
  select.replaceChildren()
  for (const entry of entries) {
    const option = document.createElement('wa-option')
    option.value = entry.value
    option.textContent = entry.label
    select.appendChild(option)
  }
  select.value = value
  ensureSelectChevron(select)
}

class FtToolbar extends FtElement {
  static template = TEMPLATE

  #state = {
    languages: [],
    source: '简体中文',
    target: '简体中文',
    models: [],
    model: '',
    themes: [],
    theme: 'auto',
    settingsOpen: false,
    moreOpen: false,
    moreItems: [],
    modelMenuOpen: false,
    modelMenuItems: [],
    modelMenuCurrent: '',
    themeMenuOpen: false,
    themeMenuItems: [],
    themeMenuCurrent: '',
    tips: {},
  }

  get languages() { return this.#state.languages }
  set languages(value) { this.#state.languages = value ?? []; this.render() }
  get source() { return this.#state.source }
  set source(value) { this.#state.source = String(value ?? ''); this.render() }
  get target() { return this.#state.target }
  set target(value) { this.#state.target = String(value ?? ''); this.render() }
  get models() { return this.#state.models }
  set models(value) { this.#state.models = value ?? []; this.render() }
  get model() { return this.#state.model }
  set model(value) { this.#state.model = String(value ?? ''); this.render() }
  get themes() { return this.#state.themes }
  set themes(value) { this.#state.themes = value ?? []; this.render() }
  get theme() { return this.#state.theme }
  set theme(value) { this.#state.theme = String(value ?? ''); this.render() }
  get settingsOpen() { return this.#state.settingsOpen }
  set settingsOpen(value) { this.#state.settingsOpen = Boolean(value); this.render() }
  get moreOpen() { return this.#state.moreOpen }
  set moreOpen(value) { this.#state.moreOpen = Boolean(value); this.render() }
  get moreItems() { return this.#state.moreItems }
  set moreItems(value) { this.#state.moreItems = value ?? []; this.render() }
  get modelMenuOpen() { return this.#state.modelMenuOpen }
  set modelMenuOpen(value) { this.#state.modelMenuOpen = Boolean(value); this.render() }
  get modelMenuItems() { return this.#state.modelMenuItems }
  set modelMenuItems(value) { this.#state.modelMenuItems = value ?? []; this.render() }
  get modelMenuCurrent() { return this.#state.modelMenuCurrent }
  set modelMenuCurrent(value) { this.#state.modelMenuCurrent = String(value ?? ''); this.render() }
  get themeMenuOpen() { return this.#state.themeMenuOpen }
  set themeMenuOpen(value) { this.#state.themeMenuOpen = Boolean(value); this.render() }
  get themeMenuItems() { return this.#state.themeMenuItems }
  set themeMenuItems(value) { this.#state.themeMenuItems = value ?? []; this.render() }
  get themeMenuCurrent() { return this.#state.themeMenuCurrent }
  set themeMenuCurrent(value) { this.#state.themeMenuCurrent = String(value ?? ''); this.render() }
  get tips() { return this.#state.tips }
  set tips(value) { this.#state.tips = value ?? {}; this.render() }

  /** 供外壳做「点外部关闭」判断：点是否落在某个下拉菜单里 */
  inMenu(target) {
    return target instanceof Element && target.closest('.icon-menu, .more-menu') !== null
  }

  onConnect() {
    const s = this.#state
    this.ref('source').addEventListener('change', () => {
      s.source = this.ref('source').value
      this.emit('select-change', { field: 'source', value: s.source })
    })
    this.ref('target').addEventListener('change', () => {
      s.target = this.ref('target').value
      this.emit('select-change', { field: 'target', value: s.target })
    })
    this.ref('model').addEventListener('change', () => {
      s.model = this.ref('model').value
      this.emit('select-change', { field: 'model', value: s.model })
    })
    this.ref('theme').addEventListener('change', () => {
      s.theme = this.ref('theme').value
      this.emit('select-change', { field: 'theme', value: s.theme })
    })

    this.ref('modelBtn').addEventListener('click', (event) => {
      event.stopPropagation()
      this.emit('menu-toggle', { menu: 'model' })
    })
    this.ref('themeBtn').addEventListener('click', (event) => {
      event.stopPropagation()
      this.emit('menu-toggle', { menu: 'theme' })
    })
    this.ref('settingsBtn').addEventListener('click', () => this.emit('settings'))
    this.ref('settingsIcon').addEventListener('click', () => this.emit('settings'))
    this.ref('moreBtn').addEventListener('click', (event) => {
      event.stopPropagation()
      this.emit('more-toggle')
    })

    this.ref('modelMenu').addEventListener('select', (event) => {
      this.emit('menu-select', { menu: 'model', value: event.detail })
    })
    this.ref('themeMenu').addEventListener('select', (event) => {
      this.emit('menu-select', { menu: 'theme', value: event.detail })
    })
    this.ref('moreMenu').addEventListener('select', (event) => {
      this.emit('more-select', event.detail)
    })
  }

  render() {
    const s = this.#state
    if (this.ref('source') === null) return

    fillSelect(this.ref('source'), s.languages.map((lang) => ({ value: lang, label: lang })), s.source)
    fillSelect(this.ref('target'), s.languages.map((lang) => ({ value: lang, label: lang })), s.target)
    fillSelect(this.ref('model'), s.models.map((item) => ({ value: item.id, label: item.id })), s.model)
    fillSelect(this.ref('theme'), s.themes.map((item) => ({ value: item.id, label: item.name })), s.theme)

    this.ref('settingsBtn').setAttribute('aria-expanded', String(s.settingsOpen))

    const modelBtn = this.ref('modelBtn')
    modelBtn.classList.toggle('is-open', s.modelMenuOpen)
    modelBtn.setAttribute('aria-expanded', String(s.modelMenuOpen))
    modelBtn.dataset.tip = s.tips.model ?? ''

    const themeBtn = this.ref('themeBtn')
    themeBtn.classList.toggle('is-open', s.themeMenuOpen)
    themeBtn.setAttribute('aria-expanded', String(s.themeMenuOpen))
    themeBtn.dataset.tip = s.tips.theme ?? ''
    const themeSvg = themeBtn.querySelector('svg')
    if (themeSvg !== null && typeof s.tips.themeIcon === 'string') themeSvg.innerHTML = s.tips.themeIcon

    this.ref('settingsIcon').dataset.tip = s.tips.settings ?? ''

    const modelMenu = this.ref('modelMenu')
    modelMenu.items = s.modelMenuItems
    modelMenu.current = s.modelMenuCurrent
    modelMenu.open = s.modelMenuOpen

    const themeMenu = this.ref('themeMenu')
    themeMenu.items = s.themeMenuItems
    themeMenu.current = s.themeMenuCurrent
    themeMenu.open = s.themeMenuOpen

    const moreBtn = this.ref('moreBtn')
    moreBtn.classList.toggle('is-open', s.moreOpen)
    moreBtn.setAttribute('aria-expanded', String(s.moreOpen))

    const moreMenu = this.ref('moreMenu')
    moreMenu.items = s.moreItems
    moreMenu.open = s.moreOpen
  }
}

define('ft-toolbar', FtToolbar)
