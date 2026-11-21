/**
 * Markdown 解析与高亮。
 *
 * - `renderMarkdown`：把模型输出的 Markdown 渲染成 HTML（预览模式用）
 * - `highlightSource`：把原文里的 `==高亮==` 转成高亮层 HTML（编辑区用）
 *
 * 全部是纯函数，不依赖 DOM 状态，方便单测和被多个组件复用。
 */

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

export { escapeHtml, safeHref, startsBlock, splitTableRow, parseMarkdown, inlineHtml, renderMarkdown, highlightInlineHtml, highlightSource }
