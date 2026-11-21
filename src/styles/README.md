# styles/

这个目录存放应用的全部样式。`src/styles/main.css` 是唯一入口，它用 `@import` 按固定顺序汇总下面这些文件；`scripts/build.mjs` 在构建时交给 esbuild 把它们**内联成一个** `dist/app.css`。

运行时页面只加载 `/app.css` 一个文件，`styles/` 目录本身不会进入产物。

## 顺序规则

**文件顺序 = 层叠顺序。** 编号前缀只是让人一眼看出先后，真正决定顺序的是 `main.css` 里的 `@import` 列表。

不要随意调整 `main.css` 里的顺序，也不要重命名文件后不更新它——`60-responsive.css` 必须排在最后，因为断点覆盖依赖它压在其他规则之后。

## 文件说明

| 文件 | 内容 |
|---|---|
| `main.css` | 唯一入口，只包含 `@import`，不写具体样式 |
| `00-base.css` | 主题变量、重置、排版、自定义标题栏、顶栏工具栏 |
| `10-cards.css` | 卡片系统（卡片、卡片头、底部计数等） |
| `15-verify.css` | OCR 校验弹窗及 Markdown 预览、放弃确认弹窗 |
| `20-settings.css` | 设置弹窗、通用 `.modal` / `.modal-foot` |
| `25-layout.css` | `.grid` / `.col` 网格布局 |
| `30-editor.css` | 原文输入区：textarea、高亮层、图片预览条 |
| `35-terms.css` | 术语面板（卡片与弹窗共用） |
| `40-output.css` | 译文卡片、用量明细 |
| `45-debug-menu.css` | 宽度调试角标、右键菜单 |
| `50-markdown.css` | 译文 / 预览里的 Markdown 排版 |
| `55-progress-dialogs.css` | 进度条、通用对话框、Toast |
| `60-responsive.css` | 所有断点（1004 / 768 / 640 / 480）与响应式细节 |

## 新增文件时

1. 选一个能表达「层级」的编号，并给后续文件留出空隙（例如 `32-foo.css` 比 `31-foo.css` 更不容易和未来的文件撞号）
2. 在 `main.css` 里按正确顺序加一行 `@import`
3. 如果文件里含媒体查询，优先考虑直接放进 `60-responsive.css`，而不是新建一个带断点的文件
4. 改完跑一次 `npm run check`（它会检查 CSS 里引用的 `#id` 是否存在）和 `node scripts/build.mjs`

## 已知约定

- 样式里用到元素 `id` 时，该 `id` 必须真实存在于页面或组件模板中，否则检查脚本会报错
- 组件宿主（自定义元素）本身的布局样式统一放在对应区域文件里，例如 `ft-source-card` 的 flex 规则在 `30-editor.css`
- 移动端断点规则集中在 `60-responsive.css`，不要散落到各区域文件
- 主题色一律使用 `--app-*` 变量，不要在区域文件里写死颜色（主题相关例外集中在 `00-base.css`）
