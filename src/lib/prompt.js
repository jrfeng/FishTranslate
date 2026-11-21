/**
 * 提示词拼装：任务说明 + 术语提示 + 待翻译原文。
 * 纯函数，方便单独调整措辞和做 A/B。
 */

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

function composeSource(text, terms, target) {
  const blocks = [taskBrief(target)]
  if (terms.length > 0) {
    blocks.push('【术语提示（翻译时必须优先遵守）】\n' + terms.map((term) => '- ' + term).join('\n'))
  }
  blocks.push('【待翻译原文】\n' + text)
  return blocks.join('\n\n')
}

export { taskBrief, composeSource }
