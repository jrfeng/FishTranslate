/**
 * token 用量：统计与展示。
 *
 * 全部是纯函数，输入 `usage` 对象或原始 payload，输出数值/文案/表格行，
 * 方便单独测试，也让 app.js 只负责把结果塞进 DOM。
 */

/** 数字 → 千分位字符串 */
function formatTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-US')
}

/** 接口地址 → 提供方名字（明细里的「提供方 / 模型」） */
function providerLabel(baseURL) {
  const base = String(baseURL || '')
  if (base.indexOf('deepseek.com') !== -1) return 'deepseek'
  try {
    return new URL(base).hostname || '自定义'
  } catch {
    return '自定义'
  }
}

/**
 * 把接口返回的 usage 归一化成展示用的结构；没有 usage 时返回 null。
 * @param {{ usage?: object, model?: string }} payload
 * @param {{ baseURL?: string, fallbackModel?: string }} context
 */
function buildUsage(payload, context) {
  const usage = payload && payload.usage && typeof payload.usage === 'object' ? payload.usage : null
  if (usage === null) return null

  const prompt = Number(usage.prompt_tokens) || 0
  const completion = Number(usage.completion_tokens) || 0
  const total = Number(usage.total_tokens) || prompt + completion
  const hit = Number(usage.prompt_cache_hit_tokens) || 0
  const miss = Number(usage.prompt_cache_miss_tokens) || 0
  const hasCache =
    usage.prompt_cache_hit_tokens !== undefined || usage.prompt_cache_miss_tokens !== undefined

  return {
    model: typeof payload.model === 'string' && payload.model.length > 0 ? payload.model : context.fallbackModel,
    provider: providerLabel(context.baseURL),
    prompt,
    completion,
    total,
    hit,
    miss,
    hasCache,
    hitRate: prompt > 0 ? hit / prompt : null,
  }
}

/** 明细行（标签 + 值），交给调用方决定怎么渲染 */
function usageRows(usage) {
  const rows = [['提供方 / 模型', usage.provider + ' / ' + usage.model]]
  if (usage.hasCache) {
    rows.push(['缓存命中', usage.hitRate === null ? '—' : (usage.hitRate * 100).toFixed(1) + '%'])
    rows.push(['未缓存输入', formatTokens(usage.miss) + ' tok'])
    rows.push(['缓存读取', formatTokens(usage.hit) + ' tok'])
  } else {
    rows.push(['输入', formatTokens(usage.prompt) + ' tok'])
  }
  rows.push(['输出', formatTokens(usage.completion) + ' tok'])
  return rows
}

/** 胶囊文案：「12,345 tok」 */
function usageChipText(usage) {
  return formatTokens(usage.total) + ' tok'
}

/** 浮层底部：「本次运行累计 3 次 / 12,345 tok」 */
function usageFootText(count, total) {
  return '本次运行累计 ' + count + ' 次 / ' + formatTokens(total) + ' tok'
}

export { formatTokens, providerLabel, buildUsage, usageRows, usageChipText, usageFootText }
