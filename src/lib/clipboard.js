/**
 * 剪贴板相关的纯工具：文本规整、HTML→Markdown、选区插入、老式复制兜底。
 * 真正调用系统剪贴板的函数留在 app.js（需要 Tauri 桥接）。
 */

import { htmlToMarkdown } from '../markdown-from-html.js'

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

export { normalizePlainText, htmlToMarkdownOrText, insertInto, selectionOf, legacyCopy }
