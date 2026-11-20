/**
 * 多语言翻译 · 独立版前端
 *
 * 纯原生 JS，没有构建步骤。负责：Markdown 输入高亮、Markdown 预览/源码切换、
 * 术语表、模型选择、自动复制、进度动画，以及把请求发给本机服务。
 */

import { htmlToMarkdown } from './markdown-from-html.js'

/* ------------------------------------------------------------ 常量与状态 */

/** 把致命错误直接显示在页面上，避免出现「一片白」却无从排查 */
function showFatalError(message) {
  try {
    let bar = document.getElementById('fatal-error')
    if (bar === null) {
      bar = document.createElement('pre')
      bar.id = 'fatal-error'
      bar.style.cssText =
        'position:fixed;left:0;right:0;bottom:0;z-index:9999;max-height:45%;overflow:auto;' +
        'margin:0;padding:12px 16px;background:#b3261e;color:#fff;' +
        'font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap'
      document.body.appendChild(bar)
    }
    bar.textContent += '启动出错：' + message + '\n'
  } catch (error) {
    // 连错误条都画不出来就算了
  }
}

window.addEventListener('error', (event) => {
  showFatalError(event.message || String(event.error || '未知错误'))
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  showFatalError(reason && reason.message ? String(reason.message) : String(reason))
})

import './components/ft-balance-dialog.js'
import './components/ft-model-picker.js'
import './components/ft-theme-picker.js'
import './components/ft-more-menu.js'
import './components/ft-icon-menu.js'
import './components/ft-toolbar.js'
import './components/ft-settings-sheet.js'

const MAX_TERMS = 50
const COPIED_MS = 1600

/** 余额提醒阈值：低于该数值时变色（橙色 < 3，红色 < 2） */
const BALANCE_WARN = 3
const BALANCE_DANGER = 2
/** 余额手动刷新的进度条最短显示时长 */
const BALANCE_MIN_PROGRESS_MS = 1000

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

const TASK_STRUCTURE = [
  '【本次任务（优先于其他格式要求）】',
  '先把原文整理成 Markdown，再翻译：',
  '- 并列、分步、逐条的内容用有序或无序列表；',
  '- 有明显分节的内容用标题；',
  '- 代码、命令、文件路径、接口路径、变量名用行内代码（反引号）包裹；',
  '- 纯叙述性段落保持为普通段落。',
  '只做结构整理，不许增删或改写任何信息。',
]

/** 按目标语言生成用户消息里的任务说明 */
function taskBrief(target) {
  return [
    ...TASK_STRUCTURE,
    '',
    `然后把整理出的 Markdown 翻译成${target}：Markdown 标记和代码原样保留，代码块里的代码不翻译。`,
    `只输出${target}译文本身，不要输出原文，不要任何解释或前言。`,
  ].join('\n')
}

const KEYS = {
  settings: 'fish-app.settings',
  terms: 'fish-app.terms',
  autoCopy: 'fish-app.auto-copy',
  immediate: 'fish-app.immediate',
  termsOpen: 'fish-app.terms-open',
  view: 'fish-app.view',
  theme: 'fish-app.theme',
  sourceLang: 'fish-app.source-lang',
  targetLang: 'fish-app.target-lang',
  models: 'fish-app.models',
  balance: 'fish-app.balance',
}


/** 可选的源/目标语言：只收 DeepSeek 表现稳定的语种，中英排最前 */
const LANGS = [
  '简体中文',
  '英语',
  '日语',
  '韩语',
  '法语',
  '德语',
  '西班牙语',
  '俄语',
  '葡萄牙语',
  '意大利语',
  '阿拉伯语',
  '越南语',
  '泰国语',
  '印尼语',
]

const DEFAULT_SOURCE_LANG = '英语'
const DEFAULT_TARGET_LANG = '简体中文'

/** 内置主题：auto 跟随系统 / b 浅色 / a 深色 / c 风格化 */
const THEMES = [
  { id: 'auto', name: '跟随系统' },
  { id: 'b', name: '浅色' },
  { id: 'a', name: '深色' },
  { id: 'c', name: '风格化' },
  { id: 'd', name: '蓝色大肥鱼' },
]

const config = { apiKey: '', baseURL: DEFAULT_BASE_URL, model: DEFAULT_MODEL }

/** 当前是否跑在 Tauri 窗口里（浏览器里调试时为 false） */
function isTauriRuntime() {
  const core = window.__TAURI__ !== undefined ? window.__TAURI__.core : undefined
  return core !== undefined && core !== null && typeof core.invoke === 'function'
}

/** 调用 Rust 侧命令；不在 Tauri 窗口里打开时返回一个可读的错误。 */
function invokeTauri(command, request) {
  const core = window.__TAURI__ !== undefined ? window.__TAURI__.core : undefined
  if (core === undefined || core === null || typeof core.invoke !== 'function') {
    return Promise.resolve({
      ok: false,
      error: { code: 'NO_BRIDGE', message: '请通过打包后的桌面程序打开本页面。' },
    })
  }
  return core.invoke(command, { request })
}

const state = {
  input: '',
  output: '',
  phase: 'idle',
  message: '',
  view: 'preview',
  autoCopy: false,
  immediate: false,
  terms: [],
  termSource: '',
  termTarget: '',
  termsOpen: true,
  sourceLang: DEFAULT_SOURCE_LANG,
  targetLang: DEFAULT_TARGET_LANG,
  translatedText: '',
  translatedTerms: '',
  translatedModel: '',
  translatedSource: '',
  translatedTarget: '',
  copyState: 'idle',
  selectedModel: DEFAULT_MODEL,
  models: [],
  settingsOpen: false,
  /** 窄窗口下术语面板是否以弹层形式打开 */
  termsModalOpen: false,
  /** 640 以下的「更多」菜单 */
  moreMenuOpen: false,
  modelPickerOpen: false,
  themePickerOpen: false,
  balanceOpen: false,
  /** 弹窗里选中、但还没点「完成」的临时值 */
  pendingModel: '',
  pendingTheme: '',
  /** 窄窗口下展开的图标菜单：null / 'model' / 'theme' */
  openIconMenu: null,
  /** 当前主题 id：auto / a / b / c */
  theme: 'auto',
  /** 图片识别状态 */
  ocrBusy: false,
  /** 用户点击余额手动刷新时显示进度条 */
  balanceBusy: false,
  ocrError: false,
  /** 这张图是否已经跑过一次 OCR（跑过才显示「刷新」按钮） */
  ocrDone: false,
  /** 当前预览的图片：{ url, name, width, height } */
  image: null,
  /** 是否正在显示「清空术语」确认框。 */
  confirmClear: false,
  /** 每发起一次翻译自增，用于丢弃过期响应。 */
  runId: 0,
  copyTimer: 0,
  outputKey: '',
  /** 最近一次翻译的 token 用量明细 */
  usage: null,
  /** 本次运行累计的 token 与次数 */
  usageTotal: 0,
  usageCount: 0,
}

const el = {}
for (const id of [
  'toolbar',
  'mobile-image',
  'mobile-terms',
  'mobile-terms-label',
  'mobile-translate',
  'model-picker',
  'theme-picker',
  'balance-dialog',
  'settings-sheet',
  'balance',
  'balance-wrap',
  'balance-progress',
  'balance-divider',
  'pick-image',
  'image-input',
  'ocr-progress',
  'image-preview',
  'image-thumb',
  'image-name',
  'image-size',
  'image-zoom',
  'image-zoom-icon',
  'image-refresh',
  'toast-stack',
  'verify-overlay',
  'verify-image',
  'verify-stage',
  'zoom-in',
  'zoom-out',
  'zoom-reset',
  'zoom-value',
  'verify-editor',
  'verify-confirm',
  'verify-save',
  'verify-close',
  'verify-view',
  'verify-expand',
  'verify-abandon',
  'verify-save-bottom',
  'verify-preview',
  'confirm-keep',
  'confirm-discard',
  'win-min',
  'win-max',
  'win-close',
  'model-select',
  'char-count',
  'char-count-head',
  'clear',
  'translate',
  'hl',
  'source',
  'term-count',
  'term-clear',
  'confirm-modal',
  'confirm-cancel',
  'confirm-ok',
  'terms-toggle',
  'terms-trigger',
  'terms-label',
  'terms-modal',
  'terms-modal-body',
  'terms-modal-count',
  'terms-x',
  'terms-done',
  'terms-clear-modal',
  'terms-card',
  'terms-body',
  'term-source',
  'term-target',
  'term-add',
  'term-add-icon',
  'term-add-foot',
  'terms-list',
  'auto-copy',
  'immediate',
  'immediate-icon',
  'terms-icon',
  'terms-icon-label',
  'clear-icon',
  'auto-copy-icon',
  'view-icon',
  'stale',
  'view-toggle',
  'copy',
  'progress',
  'output',
  'usage-foot',
  'usage-chip',
  'usage-scrim',
  'usage-chip-text',
  'usage-pop',
  'usage-pop-total',
  'usage-rows',
  'usage-pop-foot',
  'ctx-menu',
  'app-version',
]) {
  el[id] = document.getElementById(id)
}

/* ------------------------------------------------------------------ 转义 */

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => {
    if (ch === '&') return '&amp;'
    if (ch === '<') return '&lt;'
    if (ch === '>') return '&gt;'
    if (ch === '"') return '&quot;'
    return '&#39;'
  })
}

function safeHref(value) {
  const url = String(value).trim()
  return /^(https?:|mailto:)/i.test(url) ? url : null
}

/* -------------------------------------------------------- Markdown 解析 */

const MD_FENCE = /^\s*(```|~~~)\s*([^`~]*)$/
const MD_HEADING = /^(#{1,6})\s+(.*)$/
const MD_HR = /^\s*([-*_])(?:\s*\1){2,}\s*$/
const MD_QUOTE = /^\s*>\s?(.*)$/
const MD_BULLET = /^\s*[-*+]\s+(.*)$/
const MD_ORDERED = /^\s*\d+[.)]\s+(.*)$/

function startsBlock(line) {
  return (
    MD_FENCE.test(line) ||
    MD_HEADING.test(line) ||
    MD_HR.test(line) ||
    MD_QUOTE.test(line) ||
    MD_BULLET.test(line) ||
    MD_ORDERED.test(line)
  )
}

function splitTableRow(line) {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map((cell) => cell.trim())
}

function parseMarkdown(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (line.trim().length === 0) {
      index += 1
      continue
    }

    const fence = MD_FENCE.exec(line)
    if (fence !== null) {
      const marker = fence[1].slice(0, 3)
      const lang = fence[2].trim()
      const body = []
      const closing = new RegExp('^\\s*' + marker + '\\s*$')
      index += 1
      while (index < lines.length && !closing.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push({ type: 'code', lang, text: body.join('\n') })
      continue
    }

    const heading = MD_HEADING.exec(line)
    if (heading !== null) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() })
      index += 1
      continue
    }

    if (MD_HR.test(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (MD_QUOTE.test(line)) {
      const body = []
      while (index < lines.length && MD_QUOTE.test(lines[index])) {
        body.push(MD_QUOTE.exec(lines[index])[1])
        index += 1
      }
      blocks.push({ type: 'quote', text: body.join('\n') })
      continue
    }

    if (MD_BULLET.test(line)) {
      const items = []
      while (index < lines.length && MD_BULLET.test(lines[index])) {
        items.push(MD_BULLET.exec(lines[index])[1])
        index += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (MD_ORDERED.test(line)) {
      const items = []
      while (index < lines.length && MD_ORDERED.test(lines[index])) {
        items.push(MD_ORDERED.exec(lines[index])[1])
        index += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    if (line.trimStart().startsWith('|') && index + 1 < lines.length) {
      const separator = lines[index + 1]
      if (/^\s*\|[\s:|-]*$/.test(separator) && separator.indexOf('-') >= 0) {
        const header = splitTableRow(line)
        index += 2
        const rows = []
        while (index < lines.length && lines[index].trimStart().startsWith('|')) {
          rows.push(splitTableRow(lines[index]))
          index += 1
        }
        blocks.push({ type: 'table', header, rows })
        continue
      }
    }

    const body = []
    while (index < lines.length && lines[index].trim().length > 0 && !startsBlock(lines[index])) {
      body.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'p', text: body.join('\n') })
  }

  return blocks
}

function inlineHtml(text) {
  const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g
  let html = ''
  let last = 0
  let match = pattern.exec(text)

  while (match !== null) {
    html += escapeHtml(text.slice(last, match.index))
    if (match[1] !== undefined) {
      html += '<code>' + escapeHtml(match[1]) + '</code>'
    } else if (match[2] !== undefined) {
      html += '<strong>' + escapeHtml(match[2]) + '</strong>'
    } else if (match[3] !== undefined) {
      html += '<strong>' + escapeHtml(match[3]) + '</strong>'
    } else if (match[4] !== undefined) {
      html += '<em>' + escapeHtml(match[4]) + '</em>'
    } else {
      const href = safeHref(match[6])
      if (href === null) {
        html += escapeHtml(match[0])
      } else {
        html +=
          '<a href="' +
          escapeHtml(href) +
          '" target="_blank" rel="noreferrer noopener">' +
          escapeHtml(match[5]) +
          '</a>'
      }
    }
    last = match.index + match[0].length
    match = pattern.exec(text)
  }

  return html + escapeHtml(text.slice(last))
}

function renderMarkdown(source) {
  const blocks = parseMarkdown(source)
  return blocks
    .map((block) => {
      if (block.type === 'code') {
        return '<pre><code>' + escapeHtml(block.text) + '</code></pre>'
      }
      if (block.type === 'heading') {
        const level = Math.min(block.level, 6)
        return '<h' + level + '>' + inlineHtml(block.text) + '</h' + level + '>'
      }
      if (block.type === 'hr') {
        return '<hr>'
      }
      if (block.type === 'quote') {
        return '<blockquote>' + inlineHtml(block.text) + '</blockquote>'
      }
      if (block.type === 'ul' || block.type === 'ol') {
        const items = block.items.map((item) => '<li>' + inlineHtml(item) + '</li>').join('')
        return '<' + block.type + '>' + items + '</' + block.type + '>'
      }
      if (block.type === 'table') {
        const head = block.header.map((cell) => '<th>' + inlineHtml(cell) + '</th>').join('')
        const body = block.rows
          .map((row) => '<tr>' + row.map((cell) => '<td>' + inlineHtml(cell) + '</td>').join('') + '</tr>')
          .join('')
        return (
          '<div class="md-tablewrap"><table class="md-table"><thead><tr>' +
          head +
          '</tr></thead><tbody>' +
          body +
          '</tbody></table></div>'
        )
      }
      return '<p>' + inlineHtml(block.text) + '</p>'
    })
    .join('')
}

/* ------------------------------------------------------ 输入语法高亮 */

function highlightInlineHtml(line) {
  const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g
  let html = ''
  let last = 0
  let match = pattern.exec(line)

  while (match !== null) {
    html += escapeHtml(line.slice(last, match.index))
    if (match[1] !== undefined) {
      html += '<span class="hl-code">' + escapeHtml(match[0]) + '</span>'
    } else if (match[2] !== undefined || match[3] !== undefined) {
      const mark = match[2] !== undefined ? '**' : '__'
      const body = match[2] !== undefined ? match[2] : match[3]
      html +=
        '<span class="hl-marker">' +
        mark +
        '</span>' +
        escapeHtml(body) +
        '<span class="hl-marker">' +
        mark +
        '</span>'
    } else if (match[4] !== undefined) {
      html +=
        '<span class="hl-marker">*</span>' + escapeHtml(match[4]) + '<span class="hl-marker">*</span>'
    } else {
      html +=
        '<span class="hl-marker">[</span>' +
        '<span class="hl-link">' +
        escapeHtml(match[5]) +
        '</span>' +
        '<span class="hl-marker">](' +
        escapeHtml(match[6]) +
        ')</span>'
    }
    last = match.index + match[0].length
    match = pattern.exec(line)
  }

  return html + escapeHtml(line.slice(last))
}

function highlightSource(text) {
  const lines = String(text).split('\n')
  let html = ''
  let inCode = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (index > 0) html += '\n'

    if (/^\s*(```|~~~)/.test(line)) {
      html += '<span class="hl-marker">' + escapeHtml(line) + '</span>'
      inCode = !inCode
      continue
    }
    if (inCode) {
      html += '<span class="hl-code">' + escapeHtml(line) + '</span>'
      continue
    }

    const heading = /^(#{1,6})(\s+)(.*)$/.exec(line)
    if (heading !== null) {
      html +=
        '<span class="hl-marker">' +
        escapeHtml(heading[1]) +
        '</span><span class="hl-heading">' +
        escapeHtml(heading[2] + heading[3]) +
        '</span>'
      continue
    }

    const marker = /^(\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*|\|\s*))/.exec(line)
    if (marker !== null && marker[1].length > 0) {
      html +=
        '<span class="hl-marker">' +
        escapeHtml(marker[1]) +
        '</span>' +
        highlightInlineHtml(line.slice(marker[1].length))
      continue
    }

    html += highlightInlineHtml(line)
  }

  return html + '\n'
}

/** OCR 只有 DeepSeek 官方接口提供，其它兼容地址一律关闭图片功能 */
function usesDeepSeekEndpoint() {
  const raw = String(config.baseURL || '').trim()
  if (raw.length === 0) return true
  try {
    const host = new URL(raw).hostname.toLowerCase()
    return host === 'api.deepseek.com' || host.endsWith('.api.deepseek.com')
  } catch (error) {
    return false
  }
}

const OCR_UNSUPPORTED = '当前接口地址不支持图片识别，请改用 https://api.deepseek.com'

/* ------------------------------------------------------------ 本地存储 */

function readStore(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 浏览器拒绝存储时忽略
  }
}

function removeStore(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 忽略
  }
}

/** 读取 JSON 形式的缓存，坏了就当没有 */
function readJsonStore(key) {
  const raw = readStore(key)
  if (raw === null || raw.length === 0) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeJsonStore(key, value) {
  writeStore(key, JSON.stringify(value))
}

function loadPersisted() {
  try {
    const raw = readStore(KEYS.settings)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      if (typeof parsed.apiKey === 'string') config.apiKey = parsed.apiKey
      if (typeof parsed.baseURL === 'string' && parsed.baseURL.trim().length > 0) {
        config.baseURL = parsed.baseURL.trim()
      }
      if (typeof parsed.model === 'string' && parsed.model.trim().length > 0) config.model = parsed.model.trim()
    }
  } catch {
    // 忽略损坏的设置
  }

  try {
    const raw = readStore(KEYS.terms)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        state.terms = parsed
          .filter((item) => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim().slice(0, 240))
          .slice(0, MAX_TERMS)
      }
    }
  } catch {
    state.terms = []
  }

  state.autoCopy = readStore(KEYS.autoCopy) === '1'
  state.immediate = readStore(KEYS.immediate) === '1'
  state.termsOpen = readStore(KEYS.termsOpen) !== '0'
  // 译文视图不持久化：每次启动都是「预览」
  state.view = 'preview'
  removeStore(KEYS.view)

  const savedTheme = readStore(KEYS.theme)
  state.theme = THEMES.some((item) => item.id === savedTheme) ? savedTheme : 'auto'

  const savedSource = readStore(KEYS.sourceLang)
  state.sourceLang = LANGS.includes(savedSource) ? savedSource : DEFAULT_SOURCE_LANG
  const savedTarget = readStore(KEYS.targetLang)
  state.targetLang = LANGS.includes(savedTarget) ? savedTarget : DEFAULT_TARGET_LANG

  state.selectedModel = config.model
}

function saveSettings() {
  writeStore(KEYS.settings, JSON.stringify(config))
}

/* -------------------------------------------------------------- 组合请求 */

function composeSource(text, terms, target) {
  const blocks = [taskBrief(target)]
  if (terms.length > 0) {
    blocks.push('【术语提示（翻译时必须优先遵守）】\n' + terms.map((term) => '- ' + term).join('\n'))
  }
  blocks.push('【待翻译原文】\n' + text)
  return blocks.join('\n\n')
}

function termsSignature() {
  return state.terms.join('\u0000')
}

/* ---------------------------------------------------------------- 渲染 */

function isStale() {
  return (
    state.output.length > 0 &&
    (state.input.trim() !== state.translatedText ||
      termsSignature() !== state.translatedTerms ||
      state.selectedModel !== state.translatedModel ||
      state.sourceLang !== state.translatedSource ||
      state.targetLang !== state.translatedTarget)
  )
}

function renderChrome() {  const loading = state.phase === 'loading'
  const ocrBusy = state.ocrBusy

  el.translate.disabled = state.input.trim().length === 0 || loading || ocrBusy
  el.translate.textContent = loading ? '翻译中…' : '翻译'
  el.clear.disabled = (state.input.length === 0 && state.image === null) || ocrBusy
  el['clear-icon'].disabled = el.clear.disabled
  el['pick-image'].hidden = !usesDeepSeekEndpoint()
  el['pick-image'].disabled = ocrBusy || loading
  // 非 DeepSeek 地址没有余额接口
  if (!usesDeepSeekEndpoint()) setBalanceVisible(false)
  el['balance-progress'].hidden = !state.balanceBusy
  if (el['balance-dialog'] !== null && el['balance-dialog'] !== undefined) {
    el['balance-dialog'].busy = state.balanceBusy
  }
  
  el['image-refresh'].hidden = !state.ocrDone
  el['image-refresh'].disabled = ocrBusy || loading
  el['image-refresh'].classList.toggle('is-spinning', ocrBusy)

  // 识别还没结束（或失败/重试中）时不开放「校验」：图都还没认完，进去也没内容可改
  const verifyDisabled = ocrBusy || state.image === null
  el['image-zoom'].disabled = verifyDisabled
  el['image-zoom-icon'].disabled = verifyDisabled

  el['image-preview'].hidden = state.image === null
  if (state.image !== null) {
    el['image-name'].textContent = state.image.name
    el['image-size'].textContent =
      state.image.width > 0 ? state.image.width + ' × ' + state.image.height : ''
  }

  el['char-count'].textContent = state.input.length + ' 字符'
  if (el['char-count-head'] !== null && el['char-count-head'] !== undefined) {
    el['char-count-head'].textContent = state.input.length + ' 字符'
  }
  el.progress.hidden = !loading
  el['ocr-progress'].hidden = !ocrBusy
  el.stale.hidden = !isStale()

  el.copy.disabled = state.output.length === 0
  el.copy.textContent =
    state.copyState === 'ok' ? '已复制' : state.copyState === 'fail' ? '复制失败' : '复制'
  el.copy.className = 'btn' + (state.copyState === 'ok' ? ' btn-ok' : state.copyState === 'fail' ? ' btn-fail' : '')

  el['view-toggle'].disabled = state.output.length === 0
  el['view-toggle'].textContent = state.view === 'preview' ? 'Markdown' : '预览'
  syncIconButtons()
  syncMoreUi()

  el['auto-copy'].setAttribute('aria-checked', String(state.autoCopy))
  el['auto-copy'].classList.toggle('on', state.autoCopy)

  el['immediate'].setAttribute('aria-checked', String(state.immediate))
  el['immediate'].classList.toggle('on', state.immediate)
  el['immediate-icon'].setAttribute('aria-checked', String(state.immediate))
  el['immediate-icon'].classList.toggle('on', state.immediate)

  el['auto-copy-icon'].setAttribute('aria-checked', String(state.autoCopy))
  el['auto-copy-icon'].classList.toggle('on', state.autoCopy)

  el['view-icon'].disabled = state.output.length === 0
  el['view-icon'].title = state.view === 'preview' ? '切换到 Markdown' : '切换到预览'
  el['view-icon'].innerHTML = state.view === 'preview' ? VIEW_EYE_ICON : VIEW_CODE_ICON

  // 卡片图标按钮的 hover 提示
  el['terms-icon'].dataset.tip = '术语 ' + state.terms.length + ' 条'
  el['terms-icon-label'].textContent = '术语 ' + state.terms.length + ' 条'
  if (el['mobile-terms-label'] !== null && el['mobile-terms-label'] !== undefined) {
    el['mobile-terms-label'].textContent = '术语 ' + state.terms.length
    el['mobile-translate'].disabled = el.translate.disabled
  }
  el['immediate-icon'].dataset.tip = state.immediate ? '粘贴后翻译：开' : '粘贴后翻译：关'
  el['clear-icon'].dataset.tip = '清除'
  el['auto-copy-icon'].dataset.tip = state.autoCopy ? '自动复制：开' : '自动复制：关'
  el['view-icon'].dataset.tip = el['view-icon'].title
  el['image-zoom-icon'].dataset.tip = '校验识别结果'
  el['image-refresh'].dataset.tip = '重新识别'

  const settingsSheet = el['settings-sheet']
  if (settingsSheet !== null && settingsSheet !== undefined) {
    settingsSheet.open = state.settingsOpen
    settingsSheet.apiKey = config.apiKey
    settingsSheet.baseUrl = config.baseURL === DEFAULT_BASE_URL ? '' : config.baseURL
    settingsSheet.basePlaceholder = DEFAULT_BASE_URL
  }
  if (el['toolbar'] !== null && el['toolbar'] !== undefined) {
    el['toolbar'].settingsOpen = state.settingsOpen
  }

  const narrow = window.matchMedia('(max-width: 768px)').matches
  el['terms-label'].textContent = '术语 ' + state.terms.length + ' 条'
  el['terms-toggle'].textContent = state.termsOpen ? '收起' : '展开'
  el['term-count'].textContent = String(state.terms.length)
  el['terms-modal-count'].textContent = state.terms.length + ' 条'
  el['terms-modal'].hidden = !(narrow && state.termsModalOpen)
  el['terms-body'].hidden = narrow ? false : !state.termsOpen

  // 同一套输入框/列表，按宽度挂到面板或弹窗里
  const host = narrow ? el['terms-modal-body'] : el['terms-card']
  if (el['terms-body'].parentElement !== host) host.appendChild(el['terms-body'])

  el['terms-clear-modal'].disabled = state.terms.length === 0
  el['term-clear'].disabled = state.terms.length === 0
  el['term-add'].disabled = !(
    state.termSource.trim().length > 0 &&
    state.termTarget.trim().length > 0 &&
    state.terms.length < MAX_TERMS
  )
  el['term-add-icon'].disabled = el['term-add'].disabled
  el['term-add-foot'].disabled = el['term-add'].disabled
}

/* ---------------------------------------------------------------- 用量 */

/** 数字加千分位，例如 2626595 → 2,626,595 */
function formatTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
}

/** 接口地址 → 提供方名字，用于明细里的「提供方 / 模型」 */
function providerLabel() {
  const base = String(config.baseURL || '')
  if (base.indexOf('deepseek.com') !== -1) return 'deepseek'
  try {
    return new URL(base).hostname || '自定义'
  } catch {
    return '自定义'
  }
}

/** 记录一次翻译的 usage，并刷新胶囊与浮层 */
function recordUsage(payload) {
  const usage = payload && payload.usage && typeof payload.usage === 'object' ? payload.usage : null
  if (usage === null) {
    state.usage = null
    renderUsage()
    return
  }

  const prompt = Number(usage.prompt_tokens) || 0
  const completion = Number(usage.completion_tokens) || 0
  const total = Number(usage.total_tokens) || prompt + completion
  const hit = Number(usage.prompt_cache_hit_tokens) || 0
  const miss = Number(usage.prompt_cache_miss_tokens) || 0
  const hasCache =
    usage.prompt_cache_hit_tokens !== undefined || usage.prompt_cache_miss_tokens !== undefined

  state.usage = {
    model: typeof payload.model === 'string' && payload.model.length > 0 ? payload.model : config.model,
    provider: providerLabel(),
    prompt,
    completion,
    total,
    hit,
    miss,
    hasCache,
    hitRate: prompt > 0 ? hit / prompt : null,
  }
  state.usageTotal += total
  state.usageCount += 1
  renderUsage()
}

function renderUsage() {
  const usage = state.usage
  if (usage === null) {
    el['usage-foot'].hidden = true
    closeUsagePop()
    return
  }

  el['usage-foot'].hidden = false
  el['usage-chip-text'].textContent = formatTokens(usage.total) + ' tok'
  el['usage-pop-total'].textContent = formatTokens(usage.total) + ' tok'

  const rows = [['提供方 / 模型', usage.provider + ' / ' + usage.model]]
  if (usage.hasCache) {
    rows.push(['缓存命中', usage.hitRate === null ? '—' : (usage.hitRate * 100).toFixed(1) + '%'])
    rows.push(['未缓存输入', formatTokens(usage.miss) + ' tok'])
    rows.push(['缓存读取', formatTokens(usage.hit) + ' tok'])
  } else {
    rows.push(['输入', formatTokens(usage.prompt) + ' tok'])
  }
  rows.push(['输出', formatTokens(usage.completion) + ' tok'])

  const frag = document.createDocumentFragment()
  for (const [label, value] of rows) {
    const row = document.createElement('div')
    row.className = 'usage-row'
    const key = document.createElement('span')
    key.className = 'usage-k'
    key.textContent = label
    const val = document.createElement('span')
    val.className = 'usage-v'
    val.textContent = value
    row.append(key, val)
    frag.appendChild(row)
  }
  el['usage-rows'].replaceChildren(frag)

  el['usage-pop-foot'].textContent =
    '本次运行累计 ' + state.usageCount + ' 次 / ' + formatTokens(state.usageTotal) + ' tok'
}

function isUsagePopOpen() {
  return !el['usage-pop'].hidden
}

function openUsagePop() {
  el['usage-pop'].hidden = false
  el['usage-scrim'].hidden = false
  el['usage-chip'].setAttribute('aria-expanded', 'true')
}

function closeUsagePop() {
  el['usage-pop'].hidden = true
  el['usage-scrim'].hidden = true
  el['usage-chip'].setAttribute('aria-expanded', 'false')
}

function renderOutput() {
  const key = state.phase + '|' + state.view + '|' + state.output + '|' + state.message
  if (key === state.outputKey) return
  state.outputKey = key
  const out = el.output
  out.classList.remove('is-empty')

  if (state.phase === 'error') {
    out.classList.remove('md-mode')
    const box = document.createElement('div')
    box.className = 'error'
    const text = document.createElement('div')
    text.textContent = state.message
    box.appendChild(text)
    out.replaceChildren(box)
    return
  }

  if (state.output.length === 0) {
    out.classList.remove('md-mode')
    out.classList.add('is-empty')
    const span = document.createElement('span')
    span.className = 'placeholder'
    span.textContent = state.phase === 'loading' ? '翻译中…' : '译文会显示在这里。'
    out.replaceChildren(span)
    return
  }

  if (state.view === 'source') {
    out.classList.remove('md-mode')
    const source = document.createElement('div')
    source.className = 'md-source'
    // 复用输入框的高亮器：输出是 HTML 片段，highlightSource 内部会转义
    source.innerHTML = highlightSource(state.output)
    out.replaceChildren(source)
    return
  }

  out.classList.add('md-mode')
  out.innerHTML = '<div class="md">' + renderMarkdown(state.output) + '</div>'
}

const TERM_SEPARATOR = ' 翻译成 '

/** 把「原文 翻译成 译文」拆成两段，渲染时分开显示 */
function splitTerm(term) {
  const index = term.indexOf(TERM_SEPARATOR)
  if (index < 0) return [term, '']
  return [term.slice(0, index), term.slice(index + TERM_SEPARATOR.length)]
}

function renderTerms() {
  const list = el['terms-list']
  list.replaceChildren()

  if (state.terms.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'terms-empty'
    empty.textContent = '还没有术语。添加后会随每次翻译一起发给模型。'
    list.appendChild(empty)
    return
  }

  state.terms.forEach((term, index) => {
    const row = document.createElement('div')
    row.className = 'term'

    const [sourceText, targetText] = splitTerm(term)

    const from = document.createElement('span')
    from.className = 'term-token'
    from.title = term
    from.textContent = sourceText

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'term-remove'
    remove.title = '删除'
    remove.setAttribute('aria-label', '删除')
    remove.textContent = '\u00d7'
    remove.addEventListener('click', () => {
      state.terms.splice(index, 1)
      persistTerms()
      renderTerms()
      renderChrome()
    })

    row.append(from)

    if (targetText.length > 0) {
      const arrow = document.createElement('span')
      arrow.className = 'term-arrow'
      arrow.textContent = window.matchMedia('(max-width: 480px)').matches ? '→' : '翻译成'

      const to = document.createElement('span')
      to.className = 'term-token'
      to.title = term
      to.textContent = targetText

      row.append(arrow, to)
    }

    row.append(remove)
    list.appendChild(row)
  })
}

/** 给 wa-select 补一个下箭头（Web Awesome 自带的 wa-icon 没有注册，默认不可见） */
function renderModels() {
  syncToolbar()
}

function render() {
  renderChrome()
  renderOutput()
}

function renderAll() {
  renderChrome()
  renderOutput()
  renderTerms()
  renderModels()
}

/* ------------------------------------------------------------ 输入同步 */

let highlightFrame = 0

function syncHighlight() {
  if (highlightFrame !== 0) return
  highlightFrame = window.requestAnimationFrame(() => {
    highlightFrame = 0
    el.hl.innerHTML = highlightSource(state.input)
    el.hl.scrollTop = el.source.scrollTop
    el.hl.scrollLeft = el.source.scrollLeft
  })
}

/* ---------------------------------------------------------------- 复制 */

function legacyCopy(text) {
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-9999px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}

async function copyText(text) {
  if (text.length === 0) return false
  let copied = false

  // 走 Rust 的原生剪贴板：不经过 WebView2 的 Clipboard API，不会弹权限询问
  try {
    const payload = await invokeTauri('clipboard_write', { text })
    copied = payload !== null && payload !== undefined && payload.ok === true
  } catch {
    copied = false
  }

  // 浏览器里调试时没有 Tauri，退回 execCommand / Clipboard API
  if (!copied && !isTauriRuntime()) copied = legacyCopy(text)
  if (!copied && !isTauriRuntime()) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text)
        copied = true
      }
    } catch {
      copied = false
    }
  }

  state.copyState = copied ? 'ok' : 'fail'
  renderChrome()
  if (state.copyTimer !== 0) clearTimeout(state.copyTimer)
  state.copyTimer = window.setTimeout(() => {
    state.copyTimer = 0
    state.copyState = 'idle'
    renderChrome()
  }, COPIED_MS)
  return copied
}

/* ---------------------------------------------------------------- 翻译 */

async function run() {
  const text = state.input.trim()
  if (text.length === 0 || state.phase === 'loading') return

  // 原文和译文语言相同时没有翻译的意义，直接提醒
  if (state.sourceLang === state.targetLang) {
    showToast(`原文和译文都是${state.targetLang}，改一下其中一边再翻译。`, 'warn')
    return
  }

  if (config.apiKey.length === 0) {
    state.settingsOpen = true
    renderChrome()
    // 设置面板可能被折叠或滚出视野，再补一条 Toast，避免用户以为按钮没反应
    showToast('未提供 API Key，请提供后再翻译。', 'warn')
    return
  }

  const runId = state.runId + 1
  state.runId = runId

  const model = state.selectedModel || config.model

  // 同一段文本（且术语、模型、语言都没变）已经有结果了，就不再重复发请求
  if (
    state.phase === 'done' &&
    state.output.length > 0 &&
    text === state.translatedText &&
    termsSignature() === state.translatedTerms &&
    model === state.translatedModel &&
    state.sourceLang === state.translatedSource &&
    state.targetLang === state.translatedTarget
  ) {
    return
  }

  state.phase = 'loading'
  state.message = ''
  render()

  try {
    const payload = await invokeTauri('translate', {
      text: composeSource(text, state.terms, state.targetLang),
      source: state.sourceLang,
      target: state.targetLang,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      model,
    })
    if (runId !== state.runId) return
    if (payload === null || payload === undefined || payload.ok !== true) {
      throw new Error(localizeError(payload?.error, '翻译失败，请稍后重试。'))
    }

    state.output = typeof payload.translation === 'string' ? payload.translation : ''
    state.translatedText = text
    state.translatedTerms = termsSignature()
    state.translatedModel = typeof payload.model === 'string' ? payload.model : model
    state.translatedSource = state.sourceLang
    state.translatedTarget = state.targetLang
    state.phase = 'done'
    state.copyState = 'idle'
    recordUsage(payload)
    render()
    void refreshBalance()

    if (state.autoCopy && state.output.length > 0) await copyText(state.output)
  } catch (error) {
    if (runId !== state.runId) return
    state.phase = 'error'
    const raw = error !== null && error !== undefined && error.message ? String(error.message) : String(error)
    state.message = hasChinese(raw) ? raw : '翻译失败，请稍后重试。'
    console.error(error)
    render()
  }
}

/* ------------------------------------------------------------ 术语操作 */

function persistTerms() {
  writeStore(KEYS.terms, JSON.stringify(state.terms))
}

function addTerm() {
  const source = state.termSource.trim()
  const target = state.termTarget.trim()
  if (source.length === 0 || target.length === 0 || state.terms.length >= MAX_TERMS) return

  const entry = source + ' 翻译成 ' + target
  if (!state.terms.includes(entry)) state.terms.push(entry)

  state.termSource = ''
  state.termTarget = ''
  el['term-source'].value = ''
  el['term-target'].value = ''
  el['term-source'].focus()

  persistTerms()
  renderTerms()
  renderChrome()
}

/* ------------------------------------------------------------ 余额显示 */

/**
 * 查询并显示账户余额。DeepSeek 官方接口是 GET /user/balance；
 * 其它 OpenAI 兼容服务通常没有这个接口，失败时就隐藏，不打扰用户。
 */
async function refreshBalance(manual = false) {
  // 用户主动点击余额时才显示进度条，自动刷新不打扰
  const startedAt = Date.now()
  if (manual) {
    state.balanceBusy = true
    renderChrome()
  }

  try {
    // 余额接口只有 DeepSeek 官方提供，其它地址直接关掉
    if (!usesDeepSeekEndpoint()) {
      setBalanceVisible(false)
      return
    }
    if (config.apiKey.length === 0) {
      setBalanceVisible(false)
      return
    }

    // 只有还没有数值时才摆占位；已经显示着余额时刷新，保持原数字不动，
    // 否则每点一次刷新都会先闪一下「余额 --」
    if (el.balance.classList.contains('is-placeholder') || el['balance-wrap'].hidden) {
      showBalancePlaceholder()
    }

    const payload = await invokeTauri('balance', { apiKey: config.apiKey, baseURL: config.baseURL })
    if (payload === null || payload === undefined || payload.ok !== true) {
      // 拿不到就留着旧数字（或占位）不动，只改提示，避免布局和数值回弹
      el.balance.title = '读取余额失败，点击重试'
      return
    }
    if (typeof payload.total !== 'string' || payload.total.length === 0) {
      el.balance.title = '读取余额失败，点击重试'
      return
    }

    const symbol =
      payload.currency === 'USD' ? '$' : payload.currency === 'CNY' ? '¥' : String(payload.currency || '') + ' '
    el.balance.classList.remove('is-placeholder')
    el.balance.textContent = '余额 ' + symbol + payload.total
    el.balance.title =
      '充值 ' + (payload.toppedUp || '0') + ' · 赠送 ' + (payload.granted || '0') + '（点击刷新）'
    // 余额偏低时变色提醒：< 3 橙色，< 2 红色，不可用直接红色
    const total = Number.parseFloat(payload.total)
    const hasTotal = Number.isFinite(total)
    el.balance.variant =
      payload.available === false || (hasTotal && total < BALANCE_DANGER)
        ? 'danger'
        : hasTotal && total < BALANCE_WARN
          ? 'warning'
          : 'brand'
    // 缓存结果，下次启动先显示这个数字，再去请求最新值
    writeJsonStore(KEYS.balance, {
      text: el.balance.textContent,
      title: el.balance.title,
      variant: el.balance.variant,
      savedAt: Date.now(),
    })
    setBalanceVisible(true)
  } finally {
    if (manual) {
      // 请求太快时进度条一闪而过，补足到 1 秒再收起
      const elapsed = Date.now() - startedAt
      if (elapsed < BALANCE_MIN_PROGRESS_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, BALANCE_MIN_PROGRESS_MS - elapsed))
      }
      state.balanceBusy = false
      renderChrome()
    }
  }
}

/** 余额和它左边的分隔线一起显示 / 隐藏 */
function setBalanceVisible(visible) {
  if (el['balance-wrap'] !== undefined && el['balance-wrap'] !== null) {
    el['balance-wrap'].hidden = !visible
  }
  el.balance.hidden = false
  if (el['balance-divider'] !== undefined && el['balance-divider'] !== null) {
    el['balance-divider'].hidden = !visible
  }
}

/**
 * 余额是异步读回来的，先用同宽的占位撑住工具栏，
 * 免得数值到达时整排控件（模型 / 主题 / 设置）被顶得跳一下。
 */
function showBalancePlaceholder() {
  el.balance.classList.add('is-placeholder')
  el.balance.textContent = '余额 --'
  el.balance.title = '正在读取余额…'
  setBalanceVisible(true)
}

/** 启动时先把上次缓存的余额显示出来，联网后再无缝更新 */
function applyCachedBalance() {
  const cached = readJsonStore(KEYS.balance)
  if (cached === null || typeof cached.text !== 'string' || cached.text.length === 0) return false
  el.balance.textContent = cached.text
  el.balance.title = cached.title || '（点击刷新）'
  if (typeof cached.variant === 'string' && cached.variant.length > 0) {
    el.balance.variant = cached.variant
  }
  el.balance.classList.remove('is-placeholder')
  setBalanceVisible(true)
  return true
}

/* ------------------------------------------------------------ 设置与模型 */

async function refreshModels() {
  if (config.apiKey.length === 0) {
    state.models = []
    renderModels()
    setModelStatus('idle', '')
    return
  }

  setModelStatus('loading', '正在读取模型列表…')
  try {
    const payload = await invokeTauri('models', { apiKey: config.apiKey, baseURL: config.baseURL })
    if (payload !== null && payload !== undefined && payload.ok === true && Array.isArray(payload.models)) {
      state.models = payload.models
      // 缓存一份，下次启动先用它把下拉框填上，不用等网络
      writeJsonStore(KEYS.models, { list: payload.models, savedAt: Date.now() })
      setModelStatus(
        'ok',
        payload.models.length > 0
          ? '已读取 ' + payload.models.length + ' 个模型'
          : '接口没有返回模型列表，将使用默认模型',
      )
    } else {
      setModelStatus('fail', modelStatusFailure(payload?.error))
    }
  } catch (error) {
    setModelStatus('fail', '模型列表读取失败：请检查网络后重试。')
  }
  renderModels()
}

/**
 * 模型列表失败的文案。
 * 这里就是「设置」弹窗，所以 Key 无效时不再重复提示「请在『设置』里检查」；
 * 翻译过程的 Toast 仍然走 localizeError，保留那句指引。
 */
function modelStatusFailure(error) {
  const code = String(error?.code ?? '')
  if (code === 'UNAUTHORIZED' || code === 'NO_KEY') return '模型列表读取失败：API Key 无效'
  return '模型列表读取失败：' + localizeError(error, '请检查 API Key 和接口地址。')
}

const VIEW_CODE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 7.2 4.4 12l4.2 4.8" /><path d="M15.4 7.2 19.6 12l-4.2 4.8" /></svg>'
const VIEW_EYE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 12S5.8 6.4 12 6.4 21.4 12 21.4 12 18.2 17.6 12 17.6 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>'

/** 模型列表状态：idle / loading / ok / fail，显示在「接口地址」标签右边 */
function setModelStatus(kind, text) {
  const sheet = el['settings-sheet']
  if (sheet === null || sheet === undefined) return
  sheet.status = { kind, text }
}

/** 启动时先用上次缓存的模型列表渲染，避免下拉框空着 */
function applyCachedModels() {
  const cached = readJsonStore(KEYS.models)
  if (cached === null || !Array.isArray(cached.list) || cached.list.length === 0) return false
  state.models = cached.list
  renderModels()
  return true
}

/* ---------------------------------------------------------------- 绑定 */

/* ------------------------------------------------------------ 右键菜单 */

/** 右键落点所属的区域：source / output / key / input / none */
function contextRegion(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  let region = 'none'
  for (const node of path) {
    if (node === null || node === undefined) continue
    if (node.id === 'source') return 'source'
    if (
      node.id === 'image-preview' ||
      node.id === 'image-thumb' ||
      node.id === 'image-name' ||
      node.id === 'image-size'
    ) {
      return 'image'
    }
    if (node.id === 'output' || node.id === 'verify-preview') return 'output'
    if (node.id === 'api-key' || node.id === 'api-key-legacy') return 'key'
    if (node.dataset !== undefined && node.dataset.field === 'api-key') return 'key'
    if (typeof node.tagName !== 'string') continue
    const tag = node.tagName.toUpperCase()
    if (tag === 'TEXTAREA') return 'source'
    if (tag === 'INPUT') {
      const type = String(node.getAttribute('type') || 'text').toLowerCase()
      if (type === 'password') return 'key'
      if (['text', 'search', 'url', 'email', 'number', 'tel'].includes(type)) region = 'input'
    }
    if (region === 'none' && node.isContentEditable === true) region = 'input'
  }
  return region
}

/** 取右键落点上真正的输入控件（穿透 Web Awesome 的 shadow DOM） */
function contextInputElement(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const node of path) {
    if (node === null || node === undefined || typeof node.tagName !== 'string') continue
    const tag = node.tagName.toUpperCase()
    if (tag === 'TEXTAREA' || tag === 'INPUT') return node
  }
  return null
}

async function clipboardReadText() {
  const payload = await invokeTauri('clipboard_read')
  return payload !== null && payload !== undefined && payload.ok === true && typeof payload.text === 'string'
    ? payload.text
    : ''
}

/** 读剪贴板，返回 { text, html }；html 为空表示来源没有富文本 */
async function clipboardReadContent() {
  const payload = await invokeTauri('clipboard_read')
  const ok = payload !== null && payload !== undefined && payload.ok === true
  return {
    text: ok && typeof payload.text === 'string' ? payload.text : '',
    html: ok && typeof payload.html === 'string' ? payload.html : '',
  }
}

/** 纯文本粘贴前的规整：统一换行、去掉零宽字符与行尾空白 */
function normalizePlainText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
}

/** 把 HTML 片段转成 Markdown；转不动就退回纯文本 */
function htmlToMarkdownOrText(html, fallbackText) {
  if (typeof html === 'string' && html.trim().length > 0) {
    try {
      const markdown = htmlToMarkdown(html)
      if (markdown.length > 0) return markdown
    } catch (error) {
      /* 解析失败就走纯文本 */
    }
  }
  return fallbackText
}

function clipboardWriteText(text) {
  return invokeTauri('clipboard_write', { text })
}

/** 往 textarea / input 里插入文本，并把光标放到插入内容之后 */
function insertInto(input, text) {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  input.setRangeText(text, start, end, 'end')
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function selectionOf(input) {
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? 0
  return start === end ? '' : input.value.slice(start, end)
}

function buildContextItems(region, event) {
  const input = contextInputElement(event)
  const items = []

  if (region === 'source' && input instanceof HTMLTextAreaElement) {
    const hasSelection = selectionOf(input).length > 0
    items.push({
      label: '剪切',
      disabled: !hasSelection,
      run: async () => {
        const selected = selectionOf(input)
        if (selected.length === 0) return
        await clipboardWriteText(selected)
        input.setRangeText('', input.selectionStart, input.selectionEnd, 'start')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      },
    })
    items.push({
      label: '复制',
      disabled: !hasSelection,
      run: async () => {
        await clipboardWriteText(selectionOf(input))
      },
    })
    items.push({
      label: '粘贴',
      run: async () => {
        const { text, html } = await clipboardReadContent()
        const pasted = htmlToMarkdownOrText(html, text)
        if (pasted.length > 0) insertInto(input, pasted)
      },
    })
    items.push({
      label: '粘贴为纯文本',
      run: async () => {
        const raw = await clipboardReadText()
        if (raw.length === 0) return
        const plain = normalizePlainText(raw)
        if (plain.length > 0) insertInto(input, plain)
      },
    })
    items.push({
      label: '全选',
      run: () => {
        input.focus()
        input.select()
      },
    })
    items.push({
      label: '图片翻译',
      run: () => {
        el['image-input'].click()
      },
    })
    return items
  }

  if (region === 'image') {
    const hasImage = state.image !== null
    items.push({
      label: '删除',
      disabled: !hasImage,
      run: () => clearImage(),
    })
    items.push({
      label: '校验',
      disabled: !hasImage || state.ocrBusy,
      run: () => void openVerify(),
    })
    items.push({
      label: '重新识别',
      disabled: !hasImage || state.ocrBusy,
      run: () => refreshOcr(),
    })
    return items
  }

  if (region === 'output') {
    const out = el.output
    const selectedText = String(window.getSelection ? window.getSelection().toString() : '')
    items.push({
      label: '复制',
      disabled: selectedText.length === 0,
      run: async () => {
        await clipboardWriteText(selectedText)
      },
    })
    items.push({
      label: '全选',
      run: () => {
        const range = document.createRange()
        range.selectNodeContents(out)
        const selection = window.getSelection()
        if (selection === null) return
        selection.removeAllRanges()
        selection.addRange(range)
      },
    })
    return items
  }

  if (region === 'key') {
    items.push({
      label: '粘贴',
      run: async () => {
        const text = await clipboardReadText()
        if (text.length > 0 && input !== null) insertInto(input, text)
      },
    })
    return items
  }

  if (region === 'input' && input !== null) {
    const hasSelection = selectionOf(input).length > 0
    items.push({
      label: '复制',
      disabled: !hasSelection,
      run: async () => {
        await clipboardWriteText(selectionOf(input))
      },
    })
    items.push({
      label: '粘贴',
      run: async () => {
        const text = await clipboardReadText()
        if (text.length > 0) insertInto(input, text)
      },
    })
    items.push({
      label: '全选',
      run: () => {
        input.focus()
        input.select()
      },
    })
    return items
  }

  return []
}

let ctxIdleTimer = 0

function hideContextMenu() {
  if (el['ctx-menu'] === null || el['ctx-menu'] === undefined) return
  el['ctx-menu'].hidden = true
  el['ctx-menu'].classList.remove('ctx-idle')
  window.clearTimeout(ctxIdleTimer)
}

function isContextMenuOpen() {
  return el['ctx-menu'] !== null && el['ctx-menu'] !== undefined && !el['ctx-menu'].hidden
}

function showContextMenu(items, x, y) {
  const menu = el['ctx-menu']
  menu.replaceChildren()

  for (const item of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ctx-item'
    button.setAttribute('role', 'menuitem')
    button.textContent = item.label
    if (item.disabled === true) {
      button.disabled = true
      button.classList.add('is-disabled')
      button.setAttribute('aria-disabled', 'true')
    } else {
      button.addEventListener('click', () => {
        hideContextMenu()
        void item.run()
      })
    }
    menu.appendChild(button)
  }

  menu.hidden = false
  menu.style.left = '0px'
  menu.style.top = '0px'

  // 越界时贴边，避免菜单跑到窗口外
  const rect = menu.getBoundingClientRect()
  const margin = 8
  const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))
  const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
  menu.style.left = left + 'px'
  menu.style.top = top + 'px'

  // preventScroll：聚焦菜单项时不要让页面滚动，否则会触发 scroll 监听把菜单关掉
  menu.tabIndex = -1

  // 刚弹出来时先不响应 hover / focus-visible：
  // 鼠标本来就在右键位置，菜单可能正好展开在指针下面；
  // 焦点落在第一项上时浏览器还会按上一次输入方式判断 focus-visible，
  // 表现为「没动鼠标却有一项高亮」。
  menu.classList.add('ctx-idle')
  window.clearTimeout(ctxIdleTimer)
  ctxIdleTimer = window.setTimeout(() => menu.classList.remove('ctx-idle'), 600)

  const releaseIdle = (event) => {
    if (Math.abs(event.clientX - x) < 2 && Math.abs(event.clientY - y) < 2) return
    menu.classList.remove('ctx-idle')
    window.clearTimeout(ctxIdleTimer)
    document.removeEventListener('pointermove', releaseIdle, true)
  }
  document.addEventListener('pointermove', releaseIdle, true)

  // preventScroll：聚焦菜单容器时不要让页面滚动，否则会触发 scroll 事件把菜单关掉
  menu.focus({ preventScroll: true })
}

function handleContextMenuKeydown(event) {
  if (!isContextMenuOpen()) return
  const items = Array.from(el['ctx-menu'].querySelectorAll('.ctx-item:not(:disabled)'))
  if (items.length === 0) return
  const index = items.indexOf(document.activeElement)

  if (event.key === 'Escape') {
    event.preventDefault()
    hideContextMenu()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    items[(index + 1 + items.length) % items.length].focus()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    items[(index - 1 + items.length) % items.length].focus()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    if (index >= 0) items[index].click()
  }
}

/* ------------------------------------------------------------ 宽度调试角标 */

function renderSizeBadge() {
  const badge = document.getElementById('size-badge')
  if (badge === null) return
  const width = Math.round(window.innerWidth)
  const height = Math.round(window.innerHeight)
  badge.textContent = width + ' × ' + height
}

/**
 * 宽度调试角标：Ctrl+Shift+D 开关（默认关闭）
 * 只在 FISH_DEBUG=1 的构建里存在，release 包会被 esbuild 整段剔除
 */
function initSizeBadge() {
  if (__FISH_DEBUG__ !== true) return

  // debug 构建默认就显示，按 Ctrl+Shift+D 可以关掉
  const stored = readStore('fish-app.debug-size')
  const enabled = stored === null ? true : stored === '1'

  const badge = document.createElement('div')
  badge.id = 'size-badge'
  badge.hidden = !enabled
  badge.setAttribute('aria-hidden', 'true')
  document.body.appendChild(badge)
  renderSizeBadge()

  window.addEventListener('resize', renderSizeBadge)

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey !== true || event.shiftKey !== true) return
    if (String(event.key).toLowerCase() !== 'd') return
    event.preventDefault()
    badge.hidden = !badge.hidden
    writeStore('fish-app.debug-size', badge.hidden ? '0' : '1')
    renderSizeBadge()
  })
}

/** Ctrl/Cmd+Shift+V 的「粘贴为纯文本」：下一次 paste 不要转 Markdown */
let plainPastePending = false
let plainPasteTimer = 0

function markPlainPasteIntent() {
  plainPastePending = true
  window.clearTimeout(plainPasteTimer)
  // 按了快捷键却没粘贴时，2 秒后自动失效
  plainPasteTimer = window.setTimeout(() => {
    plainPastePending = false
  }, 2000)
}

function bind() {
  // Ctrl+V：带格式的内容（网页、Word、Notion 等）先转成 Markdown 再插入；
  // 纯文本仍然走浏览器原生粘贴，不干预
  el.source.addEventListener('paste', (event) => {
    const data = event.clipboardData
    if (data === null || data === undefined) return

    // 「粘贴为纯文本」：即使剪贴板里带着 HTML，也只取纯文本
    if (plainPastePending) {
      plainPastePending = false
      window.clearTimeout(plainPasteTimer)
      event.preventDefault()
      const plain = normalizePlainText(data.getData('text/plain'))
      if (plain.length > 0) insertInto(el.source, plain)
      return
    }

    const html = data.getData('text/html')
    if (typeof html !== 'string' || html.trim().length === 0) return
    event.preventDefault()
    const pasted = htmlToMarkdownOrText(html, data.getData('text/plain'))
    if (pasted.length > 0) insertInto(el.source, pasted)
  })

  // 记录「纯文本粘贴」的快捷键意图，供上面的 paste 处理使用
  document.addEventListener(
    'keydown',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) return
      if (String(event.key).toLowerCase() !== 'v') return
      markPlainPasteIntent()
    },
    true,
  )

  // 右键：屏蔽浏览器菜单，改用自绘菜单（样式跟随主题）
  document.addEventListener('contextmenu', (event) => {
    // 任何地方都不弹浏览器原生菜单，没有可用项时干脆什么都不弹
    event.preventDefault()
    const items = buildContextItems(contextRegion(event), event)
    if (items.length === 0) {
      hideContextMenu()
      return
    }
    showContextMenu(items, event.clientX, event.clientY)
  })

  document.addEventListener('mousedown', (event) => {
    if (!isContextMenuOpen()) return
    if (el['ctx-menu'].contains(event.target)) return
    hideContextMenu()
  })

  document.addEventListener('keydown', handleContextMenuKeydown)

  // 设置弹窗：Esc 关闭
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.termsModalOpen) {
    state.termsModalOpen = false
    renderChrome()
    return
  }

  if (event.key !== 'Escape' || !state.settingsOpen) return
    state.settingsOpen = false
    renderChrome()
  })

  window.addEventListener('blur', hideContextMenu)
  window.addEventListener('resize', hideContextMenu)
  document.addEventListener('scroll', hideContextMenu, true)
  el['usage-scrim'].addEventListener('click', () => closeUsagePop())

  el['usage-chip'].addEventListener('click', (event) => {
    event.stopPropagation()
    if (isUsagePopOpen()) {
      closeUsagePop()
    } else {
      openUsagePop()
    }
  })

  document.addEventListener('click', (event) => {
    if (!isUsagePopOpen()) return
    if (el['usage-foot'].contains(event.target)) return
    closeUsagePop()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isUsagePopOpen()) closeUsagePop()
  })

  el.source.addEventListener('input', () => {
    state.input = el.source.value
    syncHighlight()

    if (state.input.length === 0) {
      state.runId += 1
      state.output = ''
      state.phase = 'idle'
      state.message = ''
      state.translatedText = ''
      state.translatedTerms = ''
      state.translatedModel = ''
      state.translatedSource = ''
      state.translatedTarget = ''
      render()
      return
    }

    renderChrome()
  })

  el.source.addEventListener('scroll', () => {
    el.hl.scrollTop = el.source.scrollTop
    el.hl.scrollLeft = el.source.scrollLeft
  })

  // 勾选「粘贴后翻译」后，粘贴完成即触发一次翻译；粘贴图片时走 OCR
  el.source.addEventListener('paste', (event) => {
    const items = event.clipboardData?.items ?? []
    for (const item of items) {
      if (item.kind === 'file' && String(item.type || '').startsWith('image/')) {
        const file = item.getAsFile()
        if (file !== null) {
          event.preventDefault()
          if (!usesDeepSeekEndpoint()) {
            ocrFail(OCR_UNSUPPORTED)
            return
          }
          void handleImageFile(file, 'paste')
          return
        }
      }
    }

    if (!state.immediate) return
    window.setTimeout(() => {
      state.input = el.source.value
      syncHighlight()
      renderChrome()
      if (state.input.trim().length > 0) void run()
    }, 0)
  })

  el['pick-image'].addEventListener('click', () => el['image-input'].click())

  el['image-input'].addEventListener('change', () => {
    const file = el['image-input'].files?.[0] ?? null
    el['image-input'].value = ''
    if (file !== null) void handleImageFile(file, 'file')
  })

  el['image-thumb'].addEventListener('click', () => void openVerify())
  el['image-refresh'].addEventListener('click', refreshOcr)
  el['image-zoom'].addEventListener('click', () => void openVerify())
  el['image-zoom-icon'].addEventListener('click', () => void openVerify())

  el['verify-overlay'].addEventListener('click', (event) => {
    if (event.target === el['verify-overlay']) closeVerify()
  })
  el['verify-save'].addEventListener('click', saveVerify)
  el['verify-close'].addEventListener('click', () => closeVerify())
  el['verify-abandon'].addEventListener('click', () => closeVerify())
  el['verify-save-bottom'].addEventListener('click', saveVerify)
  el['verify-expand'].addEventListener('click', () => {
    const stage = el['verify-stage']
    const full = stage.classList.toggle('is-full')
    el['verify-expand'].textContent = full ? '⤢ 收起' : '⤢ 放大'
  })

  el['verify-view'].addEventListener('click', () => {
    verifyView = verifyView === 'preview' ? 'edit' : 'preview'
    renderVerifyView()
    if (verifyView === 'edit') el['verify-editor'].focus()
  })
  el['confirm-keep'].addEventListener('click', () => {
    el['verify-confirm'].hidden = true
  })
  el['confirm-discard'].addEventListener('click', () => {
    el['verify-confirm'].hidden = true
    closeVerify(true)
  })

  /* 图片区域：滚轮缩放 + 拖拽平移（缩放控件与关闭按钮上的操作不参与） */
  const stage = el['verify-stage']
  const isStageControl = (target) =>
    target instanceof Element &&
    target.closest('.verify-zoom, .verify-head-close, .verify-expand') !== null

  stage.addEventListener(
    'wheel',
    (event) => {
      if (isStageControl(event.target)) return
      event.preventDefault()
      const rect = stage.getBoundingClientRect()
      const originX = event.clientX - rect.left - rect.width / 2
      const originY = event.clientY - rect.top - rect.height / 2
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      setVerifyZoom(verifyZoom * factor, originX, originY)
    },
    { passive: false },
  )

  let dragging = false
  let dragStartX = 0
  let dragStartY = 0
  let panStartX = 0
  let panStartY = 0

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    // 点控件时不要抢指针，否则 setPointerCapture 会让按钮收不到 click
    if (isStageControl(event.target)) return
    dragging = true
    dragStartX = event.clientX
    dragStartY = event.clientY
    panStartX = verifyPanX
    panStartY = verifyPanY
    stage.classList.add('is-dragging')
    stage.setPointerCapture?.(event.pointerId)
  })

  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return
    verifyPanX = panStartX + (event.clientX - dragStartX)
    verifyPanY = panStartY + (event.clientY - dragStartY)
    applyVerifyTransform()
  })

  const endDrag = (event) => {
    if (!dragging) return
    dragging = false
    stage.classList.remove('is-dragging')
    stage.releasePointerCapture?.(event.pointerId)
  }

  stage.addEventListener('pointerup', endDrag)
  stage.addEventListener('pointercancel', endDrag)
  stage.addEventListener('dblclick', (event) => {
    if (isStageControl(event.target)) return
    resetVerifyZoom()
  })

  el['zoom-in'].addEventListener('click', () => setVerifyZoom(verifyZoom * 1.25))
  el['zoom-out'].addEventListener('click', () => setVerifyZoom(verifyZoom / 1.25))
  el['zoom-reset'].addEventListener('click', resetVerifyZoom)

  el['image-thumb'].addEventListener('load', () => {
    if (state.image === null) return
    state.image.width = el['image-thumb'].naturalWidth
    state.image.height = el['image-thumb'].naturalHeight
    el['image-size'].textContent = state.image.width + ' × ' + state.image.height
  })

  el.source.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void run()
    }
  })

  el.translate.addEventListener('click', () => void run())
  function clearAll() {
    state.runId += 1
    state.input = ''
    state.output = ''
    state.phase = 'idle'
    state.message = ''
    state.translatedText = ''
    state.translatedTerms = ''
    state.translatedModel = ''
    state.translatedSource = ''
    state.translatedTarget = ''
    state.ocrError = false
    el.source.value = ''
    clearImage()
    syncHighlight()
    render()
    el.source.focus()
  }

  el.clear.addEventListener('click', clearAll)

  el.copy.addEventListener('click', () => void copyText(state.output))

  function toggleView() {
    state.view = state.view === 'preview' ? 'source' : 'preview'
    render()
  }

  el['view-toggle'].addEventListener('click', toggleView)
  el['view-icon'].addEventListener('click', toggleView)

  function toggleAutoCopy() {
    state.autoCopy = !state.autoCopy
    writeStore(KEYS.autoCopy, state.autoCopy ? '1' : '0')
    renderChrome()
  }

  el['auto-copy'].addEventListener('click', toggleAutoCopy)
  el['auto-copy-icon'].addEventListener('click', toggleAutoCopy)

  function toggleImmediate() {
    state.immediate = !state.immediate
    writeStore(KEYS.immediate, state.immediate ? '1' : '0')
    renderChrome()
  }

  el['immediate'].addEventListener('click', toggleImmediate)
  el['immediate-icon'].addEventListener('click', toggleImmediate)

  // 图标版「清除」和文字版走同一个函数
  el['clear-icon'].addEventListener('click', clearAll)

  el['terms-trigger'].addEventListener('click', () => {
    state.termsModalOpen = true
    renderChrome()
    el['term-source'].focus()
  })

  // 手机底部操作条
  el['mobile-image'].addEventListener('click', () => el['image-input'].click())

  el['mobile-terms'].addEventListener('click', () => {
    state.termsModalOpen = true
    renderChrome()
    el['term-source'].focus()
  })

  el['mobile-translate'].addEventListener('click', () => {
    if (el['mobile-translate'].disabled) return
    void run()
  })

  // 触屏长按 = 右键：向落点补发一个 contextmenu，复用现有菜单逻辑
  let longPressTimer = 0
  let longPressOrigin = null

  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch') return
      longPressOrigin = { x: event.clientX, y: event.clientY, target: event.target }
      window.clearTimeout(longPressTimer)
      longPressTimer = window.setTimeout(() => {
        const origin = longPressOrigin
        longPressOrigin = null
        if (origin === null) return
        origin.target.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: origin.x,
            clientY: origin.y,
          }),
        )
      }, 500)
    },
    { passive: true },
  )

  document.addEventListener(
    'pointermove',
    (event) => {
      if (longPressOrigin === null) return
      if (
        Math.abs(event.clientX - longPressOrigin.x) > 8 ||
        Math.abs(event.clientY - longPressOrigin.y) > 8
      ) {
        window.clearTimeout(longPressTimer)
        longPressOrigin = null
      }
    },
    { passive: true },
  )

  for (const type of ['pointerup', 'pointercancel']) {
    document.addEventListener(
      type,
      () => {
        window.clearTimeout(longPressTimer)
        longPressOrigin = null
      },
      { passive: true },
    )
  }

  // 点外部关闭「更多」菜单
  document.addEventListener('mousedown', (event) => {
    if (!state.moreMenuOpen) return
    if (el['toolbar'].contains(event.target)) return
    state.moreMenuOpen = false
    renderChrome()
  })

  // Esc：先关菜单，再关各弹窗
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (state.moreMenuOpen) {
      state.moreMenuOpen = false
      renderChrome()
      return
    }
    if (!state.modelPickerOpen && !state.themePickerOpen && !state.balanceOpen) return
    state.modelPickerOpen = false
    state.themePickerOpen = false
    state.balanceOpen = false
    renderChrome()
  })

  el['model-picker'].addEventListener('select', (event) => {
    state.pendingModel = event.detail
    renderChrome()
  })
  el['model-picker'].addEventListener('confirm', (event) => {
    state.modelPickerOpen = false
    state.selectedModel = event.detail
    config.model = event.detail
    saveSettings()
    renderModels()
    renderChrome()
  })
  el['model-picker'].addEventListener('close', () => {
    state.modelPickerOpen = false
    renderChrome()
  })

  el['theme-picker'].addEventListener('select', (event) => {
    // 主题点一下就生效，弹窗留着让用户继续比较
    state.pendingTheme = event.detail
    applyTheme(event.detail)
    writeStore(KEYS.theme, state.theme)
    renderChrome()
  })
  el['theme-picker'].addEventListener('close', () => {
    state.themePickerOpen = false
    renderChrome()
  })

  el['balance-dialog'].addEventListener('close', () => {
    state.balanceOpen = false
    renderChrome()
  })
  el['balance-dialog'].addEventListener('refresh', () => void refreshBalance(true))

  el['terms-icon'].addEventListener('click', () => {
    state.termsModalOpen = true
    renderChrome()
    el['term-source'].focus()
  })

  el['terms-toggle'].addEventListener('click', () => {
    state.termsOpen = !state.termsOpen
    writeStore(KEYS.termsOpen, state.termsOpen ? '1' : '0')
    renderChrome()
  })

  el['terms-x'].addEventListener('click', () => {
    state.termsModalOpen = false
    renderChrome()
  })

  el['terms-done'].addEventListener('click', () => {
    state.termsModalOpen = false
    renderChrome()
  })

  el['terms-modal'].addEventListener('mousedown', (event) => {
    if (event.target !== el['terms-modal']) return
    state.termsModalOpen = false
    renderChrome()
  })

  el['terms-clear-modal'].addEventListener('click', () => {
    // 和面板上的「清空」一致：先弹二次确认，不直接关掉术语弹窗
    if (state.terms.length === 0) return
    state.confirmClear = true
    el['confirm-modal'].open = true
  })

  // 宽度跨过 768 时，编辑区要在面板和弹窗之间搬回去/搬过来，
  // 所以每次 resize 都要重渲染（否则宽屏面板会只剩一个空壳）
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 768px)').matches) state.termsModalOpen = false
    renderChrome()
  })
  el['term-clear'].addEventListener('click', () => {
    if (state.terms.length === 0) return
    state.confirmClear = true
    el['confirm-modal'].open = true
  })

  el['confirm-modal'].addEventListener('wa-after-hide', () => {
    state.confirmClear = false
  })

  el['confirm-cancel'].addEventListener('click', () => {
    el['confirm-modal'].open = false
  })

  el['confirm-ok'].addEventListener('click', () => {
    state.terms = []
    persistTerms()
    renderTerms()
    renderChrome()
    el['confirm-modal'].open = false
  })

  el['term-source'].addEventListener('input', () => {
    state.termSource = el['term-source'].value
    renderChrome()
  })
  el['term-target'].addEventListener('input', () => {
    state.termTarget = el['term-target'].value
    renderChrome()
  })
  for (const input of [el['term-source'], el['term-target']]) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        addTerm()
      }
    })
  }
  el['term-add'].addEventListener('click', addTerm)
  el['term-add-icon'].addEventListener('click', addTerm)
  el['term-add-foot'].addEventListener('click', addTerm)

  el['settings-sheet'].addEventListener('close', () => {
    state.settingsOpen = false
    renderChrome()
  })

  el['settings-sheet'].addEventListener('save', (event) => {
    const previousKey = config.apiKey
    const previousBase = config.baseURL
    config.apiKey = event.detail.apiKey
    const base = event.detail.baseUrl
    config.baseURL = base.length > 0 ? base : DEFAULT_BASE_URL
    saveSettings()
    // 换了 Key 或接口地址，旧缓存就属于另一个账号了，先清掉免得显示错数据
    if (config.apiKey !== previousKey || config.baseURL !== previousBase) {
      removeStore(KEYS.models)
      removeStore(KEYS.balance)
    }
    // 换成不支持 OCR 的地址时，把已经选的图片也清掉
    if (!usesDeepSeekEndpoint() && state.image !== null) clearImage()
    renderChrome()
    void refreshModels()
    void refreshBalance()
  })

  el['balance'].addEventListener('click', () => void refreshBalance(true))

  bindWindowControls()

  el['toolbar'].addEventListener('settings', () => {
    state.settingsOpen = true
    renderChrome()
  })

  el['toolbar'].addEventListener('menu-toggle', (event) => {
    toggleIconMenu(event.detail.menu)
  })

  el['toolbar'].addEventListener('more-toggle', () => {
    state.moreMenuOpen = !state.moreMenuOpen
    renderChrome()
  })

  el['toolbar'].addEventListener('select-change', (event) => {
    const { field, value } = event.detail
    if (field === 'source') {
      state.sourceLang = value
      writeStore(KEYS.sourceLang, value)
      renderChrome()
    } else if (field === 'target') {
      state.targetLang = value
      writeStore(KEYS.targetLang, value)
      renderChrome()
    } else if (field === 'model') {
      state.selectedModel = value
      config.model = value
      saveSettings()
      renderChrome()
    } else if (field === 'theme') {
      applyTheme(value)
      writeStore(KEYS.theme, state.theme)
    }
  })

  el['toolbar'].addEventListener('menu-select', (event) => {
    const { menu, value } = event.detail
    closeIconMenu()
    if (menu === 'model') {
      state.selectedModel = value
      config.model = value
      saveSettings()
      renderModels()
      renderChrome()
    } else {
      applyTheme(value)
      writeStore(KEYS.theme, state.theme)
      renderChrome()
    }
  })

  el['toolbar'].addEventListener('more-select', (event) => {
    state.moreMenuOpen = false
    const key = event.detail
    if (key === 'model') openModelPicker()
    else if (key === 'theme') openThemePicker()
    else if (key === 'settings') state.settingsOpen = true
    else openBalanceModal()
    renderChrome()
  })

  // 工具栏图标按钮的 hover 提示（组件里设置了 data-tip）
  el['toolbar'].addEventListener('mouseover', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.icon-btn[data-tip]') : null
    if (button !== null) showToolbarTip(button)
  })
  el['toolbar'].addEventListener('mouseout', (event) => {
    const button = event.target instanceof Element ? event.target.closest('.icon-btn[data-tip]') : null
    if (button !== null) hideToolbarTip()
  })
  el['toolbar'].addEventListener('click', hideToolbarTip)

  const tipButtons = [
    el['terms-icon'],
    el['immediate-icon'],
    el['clear-icon'],
    el['auto-copy-icon'],
    el['view-icon'],
    el['image-refresh'],
    el['image-zoom-icon'],
  ]

  for (const button of tipButtons) {
    button.addEventListener('mouseenter', () => showToolbarTip(button))
    button.addEventListener('mouseleave', hideToolbarTip)
    button.addEventListener('blur', hideToolbarTip)
    button.addEventListener('click', hideToolbarTip)
  }

  document.addEventListener('click', (event) => {
    if (state.openIconMenu === null) return
    if (el['toolbar'].inMenu(event.target)) return
    closeIconMenu()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeIconMenu()
  })

  window.addEventListener('resize', () => {
    hideToolbarTip()
    closeIconMenu()
  })

}

/* ------------------------------------------------------------ 图片识别 */

/** 单张图片上限，超过直接拒绝（OCR 接口本身允许 100 MiB，但上传很慢） */
const OCR_MAX_BYTES = 20 * 1024 * 1024

/** 文件读成 base64（去掉 data: 前缀） */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** OCR 输出里会带 <｜ref｜>、<｜box｜>[[x1,y1,x2,y2]]<｜/box｜> 这类定位标记，去掉 */
function cleanupOcrText(raw) {
  return String(raw ?? '')
    .replace(/<｜box｜>\[\[[^\]]*\]\]<｜\/box｜>/g, '')
    .replace(/<｜ref｜>/g, '')
    .replace(/<｜\/ref｜>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 把图片显示到预览条（OCR 完成后仍然保留，方便对照）。用 data URL，跨页面也能带过去 */
function showImage(dataUrl, name, source) {
  state.image = { dataUrl, name: name || 'clipboard.png', source, width: 0, height: 0 }
  state.ocrDone = false
  el['image-thumb'].src = dataUrl
  renderChrome()
}

function clearImage() {
  state.image = null
  state.ocrDone = false
  el['image-thumb'].removeAttribute('src')
  renderChrome()
}

/** 校验弹窗里图片的缩放/平移状态 */
let verifyZoom = 1
let verifyPanX = 0
let verifyPanY = 0

function applyVerifyTransform() {
  el['verify-image'].style.transform =
    'translate(' + verifyPanX + 'px, ' + verifyPanY + 'px) scale(' + verifyZoom + ')'
  el['zoom-value'].textContent = Math.round(verifyZoom * 100) + '%'
}

/** 以 (originX, originY) 为中心缩放，坐标是相对舞台中心的偏移 */
function setVerifyZoom(next, originX = 0, originY = 0) {
  const clamped = Math.min(8, Math.max(0.2, next))
  const ratio = clamped / verifyZoom
  verifyPanX = originX - (originX - verifyPanX) * ratio
  verifyPanY = originY - (originY - verifyPanY) * ratio
  verifyZoom = clamped
  applyVerifyTransform()
}

function resetVerifyZoom() {
  verifyZoom = 1
  verifyPanX = 0
  verifyPanY = 0
  applyVerifyTransform()
}

/** 校验弹窗的编辑 / 预览模式 */
let verifyView = 'edit'

function renderVerifyView() {
  const previewing = verifyView === 'preview'
  el['verify-editor'].hidden = previewing
  el['verify-preview'].hidden = !previewing
  el['verify-view'].textContent = previewing ? '编辑' : '预览'
  if (previewing) {
    el['verify-preview'].innerHTML = '<div class="md">' + renderMarkdown(el['verify-editor'].value) + '</div>'
  }
}

/** 打开校验弹窗：整页大小的浮层，上面看图片、下面改文字 */
function openVerify() {
  // 识别中直接忽略，避免打开一个空弹窗
  if (state.ocrBusy) return
  resetVerifyStage()
  if (state.image === null) return
  el['verify-image'].src = state.image.dataUrl
  el['verify-editor'].value = state.input
  el['verify-confirm'].hidden = true
  el['verify-overlay'].hidden = false
  verifyView = 'preview'
  renderVerifyView()
  resetVerifyZoom()
}

/** 弹窗里的文字有没有改过 */
function verifyDirty() {
  return !el['verify-overlay'].hidden && el['verify-editor'].value !== state.input
}

function resetVerifyStage() {
  const stage = el['verify-stage']
  if (stage === null || stage === undefined) return
  stage.classList.remove('is-full')
  if (el['verify-expand'] !== null && el['verify-expand'] !== undefined) {
    el['verify-expand'].textContent = '⤢ 放大'
  }
}

function closeVerify(force = false) {
  if (el['verify-overlay'].hidden) return
  if (!force && verifyDirty()) {
    el['verify-confirm'].hidden = false
    return
  }
  el['verify-overlay'].hidden = true
  el['verify-confirm'].hidden = true
  el['verify-image'].removeAttribute('src')
}

/** 保存弹窗里的文字到输入框，然后关闭 */
function saveVerify() {
  const text = el['verify-editor'].value
  if (text !== state.input) {
    state.input = text
    el.source.value = text
    syncHighlight()
    render()
  }
  closeVerify(true)
}

/** 错误信息里出现这些英文原文时，统一翻成中文给用户看 */
function hasChinese(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ''))
}

/** 把 { code, message } 形式的错误翻成中文；不认识的一律用兜底中文 */
function localizeError(error, fallback) {
  const code = String(error?.code ?? '')
  const raw = String(error?.message ?? '').trim()

  if (code === 'NO_KEY') return '请先在「设置」里填写 API Key。'
  if (code === 'UNAUTHORIZED') return 'API Key 无效，请在「设置」里检查。'
  if (code === 'QUOTA') return '余额不足，请充值后再试。'
  if (code === 'RATE_LIMIT') return '请求过于频繁，请稍后再试。'
  if (code === 'NETWORK') return '网络异常，请检查网络或接口地址。'
  if (code === 'UPSTREAM') return '模型服务暂时不可用，请稍后重试。'
  if (code === 'INTERNAL') return '程序内部错误，请重试一次。'
  if (code === 'EMPTY_INPUT') return '请先输入要翻译的英文。'
  if (code === 'TOO_LONG') return '文本太长，请分段翻译。'
  if (code === 'BAD_IMAGE') return '图片数据无法解析，请重新选一张。'

  // 上游偶尔会给中文，这时候直接用
  if (hasChinese(raw)) return raw
  return fallback
}

/** Toast 提示：右上角浮块，几秒后自动消失 */
const TOAST_MS = 6000
const TOAST_MAX = 3

function showToast(message, kind = 'error') {
  const stack = el['toast-stack']
  if (stack === null || stack === undefined) return

  while (stack.children.length >= TOAST_MAX) stack.firstElementChild.remove()

  const toast = document.createElement('div')
  toast.className = 'toast toast-' + kind

  const text = document.createElement('span')
  text.className = 'toast-text'
  text.textContent = message

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'toast-close'
  close.textContent = '\u00d7'
  close.setAttribute('aria-label', '关闭提示')
  close.addEventListener('click', () => toast.remove())

  toast.append(text, close)
  stack.appendChild(toast)
  window.setTimeout(() => toast.remove(), TOAST_MS)
}

/** 把 OCR 错误翻成中文（对照官方文档的错误表） */
function ocrErrorMessage(error) {
  const code = String(error?.code ?? '')
  const raw = String(error?.message ?? '').trim()

  // 先按文档里的英文原文匹配
  if (/password-protected/i.test(raw)) return '文件有打开密码，请移除密码后重试。'
  if (/more than 1000 pages/i.test(raw)) return '文档超过 1000 页。'
  if (/too large/i.test(raw)) return '文件超过 100 MB。'
  if (/did not finish/i.test(raw)) return '识别超时，试试更小的文件。'
  if (/could not be parsed|could not be decoded|format is not supported/i.test(raw)) {
    return '文件无法解析或格式不支持。'
  }
  if (/temporarily unavailable|Internal Server Error/i.test(raw)) {
    return 'OCR 服务暂时不可用，请稍后重试。'
  }

  // 再按状态码
  if (code === 'BAD_IMAGE') return '图片数据无法解析，请重新选一张。'
  if (code === 'BAD_REQUEST') return '请求参数不合法，或文件无法处理。'
  if (code === 'UPLOAD_SLOW') return '上传过慢，请换网络或换更小的文件重试。'
  if (code === 'TOO_LARGE') return '文件超过 100 MB。'
  if (code === 'TIMEOUT') return '上传与识别超过 180 秒上限，换小一点的文件吧。'
  if (code === 'BUSY') return 'OCR 服务繁忙，请稍后重试。'
  if (code === 'UPLOAD_FAILED') return '文件上传或提交识别失败，请重试。'

  return localizeError(error, 'OCR 识别失败，请稍后重试。')
}

/** OCR 出错：行内状态 + Toast 一起提示 */
function ocrFail(message) {
  showToast(message)
}

/** 从 data URL 里取 mime 类型 */
function dataUrlMime(dataUrl) {
  const match = /^data:([^;,]+)/.exec(String(dataUrl || ''))
  return match ? match[1] : 'image/png'
}

/** 对给定图片跑一次 OCR，把结果写进输入框 */
async function runOcr(dataUrl, name, mime) {
  // 只要这次识别结束（成功 / 空结果 / 报错），都应该把「重新识别」露出来
  const failEarly = (message) => {
    state.ocrBusy = false
    state.ocrDone = true
    renderChrome()
    ocrFail(message)
  }

  if (!usesDeepSeekEndpoint()) {
    failEarly(OCR_UNSUPPORTED)
    return
  }
  if (config.apiKey.length === 0) {
    failEarly('请先在「设置」里填写 API Key。')
    return
  }

  const text = String(dataUrl || '')
  const comma = text.indexOf(',')
  const data = comma >= 0 ? text.slice(comma + 1) : text
  if (data.length === 0) {
    failEarly('图片数据为空，请重新选一张图片。')
    return
  }

  state.ocrBusy = true
  // 进度条靠 renderChrome 里的 ocr-progress 控制，这里是唯一的触发点
  renderChrome()

  const payload = await invokeTauri('ocr', {
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    fileName: name || 'clipboard.png',
    mime: mime || 'image/png',
    data,
  })

  // 先标记完成，再渲染，这样下面的任何分支都不会把「重新识别」藏起来
  state.ocrBusy = false
  state.ocrDone = true
  renderChrome()

  if (payload === null || payload === undefined || payload.ok !== true) {
    ocrFail(ocrErrorMessage(payload?.error))
    return
  }

  const recognized = cleanupOcrText(payload.text)
  if (recognized.length === 0) {
    showToast('没有识别到文字，换一张更清晰的图片试试。')
    return
  }

  el.source.value = recognized
  state.input = recognized
  syncHighlight()
  render()

  if (state.immediate) void run()
}

/** 用当前图片重新识别一次 */
function refreshOcr() {
  if (state.image === null) return
  void runOcr(state.image.dataUrl, state.image.name, dataUrlMime(state.image.dataUrl))
}

async function handleImageFile(file, source = 'file') {
  if (file === null || file === undefined) return

  if (!usesDeepSeekEndpoint()) {
    ocrFail(OCR_UNSUPPORTED)
    return
  }
  if (!String(file.type || '').startsWith('image/')) {
    ocrFail('这不是图片文件，请选 PNG / JPEG / WebP 等图片。')
    return
  }
  if (file.size > OCR_MAX_BYTES) {
    ocrFail('图片超过 20 MB，换一张小一点的。')
    return
  }
  if (config.apiKey.length === 0) {
    ocrFail('请先在「设置」里填写 API Key。')
    return
  }

  let data = ''
  try {
    data = await fileToBase64(file)
  } catch (error) {
    ocrFail('读取图片失败，请重试。')
    return
  }

  const dataUrl = 'data:' + (file.type || 'image/png') + ';base64,' + data
  showImage(dataUrl, file.name, source)
  await runOcr(dataUrl, file.name, file.type || 'image/png')
}

/* ------------------------------------------------------------ 窗口控制 */

/** 自定义标题栏的窗口按钮（关掉原生外框后自己实现） */
function bindWindowControls() {
  const appWindow = window.__TAURI__?.window?.getCurrentWindow?.() ?? null

  if (appWindow === null) {
    // 拿不到 Tauri 窗口对象时至少保证能关掉窗口
    el['win-close'].addEventListener('click', () => window.close())
    return
  }

  el['win-min'].addEventListener('click', () => void appWindow.minimize())
  el['win-max'].addEventListener('click', () => void appWindow.toggleMaximize())
  el['win-close'].addEventListener('click', () => void appWindow.close())

  const syncMaxState = async () => {
    try {
      const maximized = await appWindow.isMaximized()
      el['win-max'].classList.toggle('is-maximized', maximized)
      el['win-max'].title = maximized ? '还原' : '最大化'
    } catch (error) {
      // 拿不到状态就用默认图标
    }
  }

  void syncMaxState()
  void appWindow.onResized(() => void syncMaxState())
}

/* ---------------------------------------------------------------- 主题 */

const DARK_QUERY = window.matchMedia('(prefers-color-scheme: dark)')

/** 把主题 id 解析成实际生效的 a / b / c / d（auto 跟随系统深浅色） */
function resolveTheme(theme) {
  if (theme === 'auto') return DARK_QUERY.matches ? 'a' : 'b'
  return THEMES.some((item) => item.id === theme) ? theme : 'b'
}

/** 应用主题：切换 html 上的 data-theme，并同步 Web Awesome 的深色类 */
function applyTheme(theme) {
  const chosen = THEMES.some((item) => item.id === theme) ? theme : 'auto'
  state.theme = chosen
  const id = resolveTheme(chosen)
  document.documentElement.dataset.theme = id
  document.documentElement.classList.toggle('wa-dark', id === 'a')
  // 把解析后的主题交给 Rust：下次启动窗口的底色直接用它，避免深浅色闪烁
  void invokeTauri('save_theme', { theme: id })
}

// 选「跟随系统」时，系统深浅色一变就跟着变
DARK_QUERY.addEventListener('change', () => {
  if (state.theme === 'auto') applyTheme('auto')
})

function renderThemeSelect() {
  syncToolbar()
}

/* ------------------------------------------------- 窄窗口图标按钮（模型 / 主题） */

const THEME_ICONS = {
  // 跟随系统：半填充圆
  auto: '<circle cx="8" cy="8" r="5.6" /><path class="icon-fill" d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" />',
  // 浅色：空心圆 + 光线
  b: '<circle cx="8" cy="8" r="3.4" /><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />',
  // 深色：实心圆（月相）
  a: '<circle cx="8" cy="8" r="5.4" class="icon-fill" />',
  // 风格化：半填充 + 直角
  c: '<rect x="2.6" y="2.6" width="10.8" height="10.8" /><path class="icon-fill" d="M13.4 2.6v10.8H2.6z" />',
  // 蓝色大肥鱼：半填充 + 圆
  d: '<circle cx="8" cy="8" r="5.6" /><path class="icon-fill" d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" />',
}

/** 主题 id → 显示名（跟随系统 / 浅色 / 深色 …） */
function themeName(id) {
  const found = THEMES.find((item) => item.id === id)
  return found === undefined ? THEMES[0].name : found.name
}

function currentModelId() {
  return state.selectedModel || config.model || DEFAULT_MODEL
}

function moreMenuItems() {
  const balanceText = String(el.balance.textContent || '').replace(/^余额\s*/, '')
  return [
    { key: 'model', label: '模型', value: currentModelId() },
    { key: 'theme', label: '主题', value: themeName(state.theme) },
    { key: 'settings', label: '设置', value: '' },
    { key: 'balance', label: '余额', value: balanceText },
  ]
}

/// 窗口从 ≤640 被拉宽后，「更多」按钮会消失，菜单必须一起收起
const compactMoreQuery = window.matchMedia('(max-width: 640px)')

/** 拉宽到 >640 后，从「更多」打开的模型 / 主题 / 余额弹窗要一起收起。
    设置除外：它任何宽度下都是独立弹窗，和工具栏布局无关。 */
function closeCompactDialogs() {
  if (!state.modelPickerOpen && !state.themePickerOpen && !state.balanceOpen) return
  state.modelPickerOpen = false
  state.themePickerOpen = false
  state.balanceOpen = false
  renderChrome()
}

function handleCompactExit() {
  state.moreMenuOpen = false
  closeCompactDialogs()
  renderChrome()
}

let compactWidth = window.innerWidth <= 640

/// 同步一次「是否处于窄布局」，从窄变宽时收起菜单和弹窗
function syncCompactWidth() {
  const compact = window.innerWidth <= 640
  if (compact === compactWidth) return
  compactWidth = compact
  if (!compact) handleCompactExit()
}

compactMoreQuery.addEventListener('change', syncCompactWidth)
// matchMedia 在部分环境（弹窗打开、虚拟时间等）不一定派发 change，resize 同步兜一道
window.addEventListener('resize', syncCompactWidth)

function openModelPicker() {
  state.pendingModel = currentModelId()
  state.modelPickerOpen = true
}

function openThemePicker() {
  state.pendingTheme = state.theme
  state.themePickerOpen = true
}

function openBalanceModal() {
  state.balanceOpen = true
}

function syncMoreUi() {
  const modelPicker = el['model-picker']
  if (modelPicker !== null && modelPicker !== undefined) {
    modelPicker.open = state.modelPickerOpen
    modelPicker.value = state.pendingModel
    if (state.modelPickerOpen) {
      modelPicker.items = state.models.length > 0 ? state.models : [{ id: currentModelId() }]
    }
  }
  const themePicker = el['theme-picker']
  if (themePicker !== null && themePicker !== undefined) {
    themePicker.open = state.themePickerOpen
    themePicker.value = state.pendingTheme
    if (state.themePickerOpen) themePicker.items = THEMES
  }
  const balanceDialog = el['balance-dialog']
  if (balanceDialog !== null && balanceDialog !== undefined) {
    balanceDialog.open = state.balanceOpen
    balanceDialog.busy = state.balanceBusy
    if (state.balanceOpen) {
      balanceDialog.amount = String(el.balance.textContent || '').replace(/^余额\s*/, '')
    }
  }
}

let toolbarTipTimer = 0
let toolbarTipEl = null

function currentThemeIcon() {
  const id = state.theme === 'auto' ? 'auto' : state.theme
  return THEME_ICONS[id] || THEME_ICONS.auto
}

function syncIconButtons() {
  syncToolbar()
}

function modelMenuItems() {
  const list = state.models.length > 0 ? state.models : [{ id: config.model || DEFAULT_MODEL }]
  return list.map((item) => ({ id: item.id, label: item.id }))
}

function themeMenuItems() {
  return THEMES.map((item) => ({ id: item.id, label: item.name }))
}

/** 把状态推给工具栏组件（语言 / 模型 / 主题 / 菜单 / 提示） */
function syncToolbar() {
  const toolbar = el['toolbar']
  if (toolbar === null || toolbar === undefined) return
  toolbar.languages = LANGS
  toolbar.source = state.sourceLang
  toolbar.target = state.targetLang
  toolbar.models = state.models.length > 0 ? state.models : [{ id: currentModelId() }]
  toolbar.model = currentModelId()
  toolbar.themes = THEMES
  toolbar.theme = state.theme
  toolbar.settingsOpen = state.settingsOpen
  toolbar.moreOpen = state.moreMenuOpen
  toolbar.moreItems = moreMenuItems()
  toolbar.modelMenuOpen = state.openIconMenu === 'model'
  toolbar.modelMenuItems = modelMenuItems()
  toolbar.modelMenuCurrent = currentModelId()
  toolbar.themeMenuOpen = state.openIconMenu === 'theme'
  toolbar.themeMenuItems = themeMenuItems()
  toolbar.themeMenuCurrent = state.theme
  toolbar.tips = {
    model: '模型：' + currentModelId(),
    theme: '主题：' + themeName(state.theme),
    themeIcon: currentThemeIcon(),
    settings: '设置',
  }
}

function closeIconMenu() {
  if (state.openIconMenu === null) return
  state.openIconMenu = null
  syncToolbar()
}

function openIconMenu(kind) {
  closeIconMenu()
  state.openIconMenu = kind
  syncToolbar()
}

function toggleIconMenu(kind) {
  if (state.openIconMenu === kind) {
    closeIconMenu()
  } else {
    openIconMenu(kind)
  }
}

function showToolbarTip(button) {
  const text = button.dataset.tip
  if (typeof text !== 'string' || text.length === 0) return
  hideToolbarTip()
  toolbarTipTimer = window.setTimeout(() => {
    toolbarTipTimer = 0
    if (toolbarTipEl === null) {
      toolbarTipEl = document.createElement('div')
      toolbarTipEl.className = 'toolbar-tip'
      document.body.appendChild(toolbarTipEl)
    }
    const rect = button.getBoundingClientRect()
    toolbarTipEl.textContent = text
    toolbarTipEl.hidden = false
    const tipRect = toolbarTipEl.getBoundingClientRect()
    const left = Math.round(rect.left + rect.width / 2 - tipRect.width / 2)
    const top = Math.round(rect.top - tipRect.height - 8)
    toolbarTipEl.style.left = Math.max(6, left) + 'px'
    toolbarTipEl.style.top = Math.max(6, top) + 'px'
  }, 200)
}

function hideToolbarTip() {
  if (toolbarTipTimer !== 0) {
    window.clearTimeout(toolbarTipTimer)
    toolbarTipTimer = 0
  }
  if (toolbarTipEl !== null) toolbarTipEl.hidden = true
}

/** 原文 / 译文语言下拉 */
function renderLangSelects() {
  syncToolbar()
}

/* ---------------------------------------------------------------- 启动 */

loadPersisted()
if (el['app-version'] !== null && el['app-version'] !== undefined) {
  el['app-version'].textContent = 'v' + __APP_VERSION__
}
applyTheme(state.theme)
renderThemeSelect()
renderLangSelects()
el.source.value = state.input
bind()
initSizeBadge()
renderAll()
syncHighlight()
if (config.apiKey.length > 0) {
  // 先用上次缓存把界面填满（工具栏和下拉框立刻就是最终形态），再去请求最新数据
  applyCachedModels()
  if (usesDeepSeekEndpoint()) applyCachedBalance()
  void refreshModels()
  void refreshBalance()
}
