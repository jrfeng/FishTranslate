/**
 * 常量表：语言、主题、存储键、默认值。
 * 集中在一处，避免 app.js 顶部堆成一大段。
 */

const MAX_TERMS = 50
const COPIED_MS = 1600

/** 余额提醒阈值：低于该数值时变色（橙色 < 3，红色 < 2） */
const BALANCE_WARN = 3
const BALANCE_DANGER = 2
/** 余额手动刷新的进度条最短显示时长 */
const BALANCE_MIN_PROGRESS_MS = 1000

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'

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

export {
  MAX_TERMS,
  COPIED_MS,
  BALANCE_WARN,
  BALANCE_DANGER,
  BALANCE_MIN_PROGRESS_MS,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  KEYS,
  LANGS,
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  THEMES,
}
