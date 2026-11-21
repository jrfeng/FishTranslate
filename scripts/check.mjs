#!/usr/bin/env node
/**
 * 静态体检：在没有浏览器的情况下抓「被误删函数」「组件没注册」「标签打错」这类问题。
 *
 * 用法：npm run check
 * 退出码非 0 表示有问题。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')
const componentsDir = join(srcDir, 'components')

const problems = []

// ---------------------------------------------------------------- 1) 未定义函数
const appSource = readFileSync(join(srcDir, 'app.js'), 'utf8')

const defined = new Set()
for (const match of appSource.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(/g)) defined.add(match[1])
for (const match of appSource.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)) defined.add(match[1])
for (const match of appSource.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
  for (const name of match[1].split(',')) defined.add(name.trim().split(/\s+as\s+/).pop())
}

const keywords = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'async',
  'resolve', 'reject', 'not', 'parseInt', 'parseFloat', 'isNaN', 'fetch', 'setTimeout', 'clearTimeout',
  'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'queueMicrotask', 'requestAnimationFrame',
])

const called = new Set()
for (const match of appSource.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(/g)) called.add(match[1])

const missing = [...called].filter((name) => !defined.has(name) && !keywords.has(name))
// 浏览器全局对象不参与检查
const globals = new Set([
  'URL', 'Blob', 'File', 'FileReader', 'Image', 'Event', 'CustomEvent', 'MouseEvent',
  'KeyboardEvent', 'PointerEvent', 'ClipboardEvent', 'HTMLElement', 'HTMLTextAreaElement',
  'HTMLInputElement', 'Element', 'Node', 'DocumentFragment', 'TextEncoder', 'TextDecoder',
  'Intl', 'Number', 'String', 'Object', 'Array', 'JSON', 'Math', 'Promise', 'Map', 'Set', 'Date',
  'RegExp', 'Error', 'TypeError', 'RangeError', 'Boolean', 'Symbol', 'WeakMap', 'URLSearchParams',
  'matchMedia', 'getComputedStyle', 'atob', 'btoa', 'alert', 'confirm', 'prompt', 'console',
])

const realMissing = missing.filter((name) => !globals.has(name) && !name.startsWith('on'))
if (realMissing.length > 0) {
  problems.push(`app.js 里可能有未定义的函数：${[...new Set(realMissing)].join(', ')}`)
}

// ---------------------------------------------------------------- 2) 组件注册
const componentFiles = readdirSync(componentsDir).filter((name) => name.endsWith('.js'))
const registered = new Set()
for (const file of componentFiles) {
  const source = readFileSync(join(componentsDir, file), 'utf8')
  for (const match of source.matchAll(/define\(\s*'([\w-]+)'/g)) registered.add(match[1])
}

const indexHtml = readFileSync(join(srcDir, 'index.html'), 'utf8')
const usedTags = new Set([...indexHtml.matchAll(/<(ft-[\w-]+)/g)].map((m) => m[1]))

for (const tag of usedTags) {
  if (!registered.has(tag)) problems.push(`index.html 用到 <${tag}>，但没有对应组件注册`)
}

// 组件文件必须被 app.js 导入
for (const file of componentFiles) {
  const base = file.replace(/\.js$/, '')
  if (!appSource.includes(`./components/${file}`) && base !== 'index') {
    // ft-picker-dialog 是被继承的基类，不需要直接导入
    if (base !== 'ft-picker-dialog') problems.push(`组件 ${file} 没有被 app.js 导入`)
  }
}

// ---------------------------------------------------------------- 3) 引用了不存在的 id
const ids = new Set([...indexHtml.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]))
const componentIds = new Set()
for (const file of componentFiles) {
  const source = readFileSync(join(componentsDir, file), 'utf8')
  for (const match of source.matchAll(/id="([\w-]+)"/g)) componentIds.add(match[1])
}
for (const match of appSource.matchAll(/el\['([\w-]+)'\]/g)) {
  const id = match[1]
  if (!ids.has(id) && !componentIds.has(id)) {
    problems.push(`app.js 引用了不存在的元素 id：${id}`)
  }
}

// ---------------------------------------------------------------- 3) CSS 引用了不存在的 id
const styleDir = join(root, 'src', 'styles')
const styleFiles = readdirSync(styleDir).filter((name) => name.endsWith('.css'))
const cssIds = new Map()
for (const file of styleFiles) {
  const source = readFileSync(join(styleDir, file), 'utf8')
  for (const match of source.matchAll(/#([A-Za-z][\w-]*)/g)) {
    const id = match[1]
    // 跳过 #fff、#e9e9ef 这类颜色值
    if (/^[0-9a-fA-F]{3,8}$/.test(id)) continue
    if (!cssIds.has(id)) cssIds.set(id, file)
  }
}

// 运行时由 JS 创建、CSS 里正常引用的 id
const runtimeIds = new Set(['fatal-error', 'boot-cover', 'size-badge'])

for (const [id, file] of cssIds) {
  if (ids.has(id) || componentIds.has(id) || runtimeIds.has(id)) continue
  problems.push(`样式 ${file} 引用了不存在的元素 id：${id}`)
}

// ---------------------------------------------------------------- 结果
if (problems.length === 0) {
  console.log('检查通过：没有未定义函数，组件标签与 id 引用一致。')
  process.exit(0)
}

console.log(`发现 ${problems.length} 个问题：`)
for (const problem of [...new Set(problems)]) console.log('  - ' + problem)
process.exit(1)
