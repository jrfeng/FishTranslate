# Web Component 重构方案

> 状态：进行中（本地分支 `refactor-web-component`，未提交）
> 目标：把 3400 行的 `app.js` 单文件和 3400 行的全局 `app.css` 拆成**按界面区域划分的 Web Component**，让状态、视图、事件各自归位。

## 为什么重构

当前结构的问题：

| 现象 | 原因 |
|---|---|
| `app.js` 3368 行、121 个函数 | 所有界面逻辑挤在一个文件里 |
| `bind()` 单函数 668 行 | 事件绑定按「页面顺序」而不是按组件组织 |
| `renderChrome()` 106 行、被调用上百次 | 全局重绘代替局部更新，改一处要读全文 |
| `state` 35 个字段 + 大量模块级变量 | 状态没有归属，任何函数都能改 |
| `app.css` 3443 行 | 选择器互相覆盖，改样式靠试 |
| `index.html` 391 行 | 静态骨架 + 动态创建混在一起 |

## 技术选型

**原生 Custom Elements + light DOM**，不引入框架、不用 shadow DOM。

理由：

1. 项目已经有 Web Awesome（`wa-*` 本身就是自定义元素），原生 API 足够
2. light DOM 能继续复用现有全局样式与 `--app-*` 主题变量，**不用重写 3443 行 CSS**
3. 无构建框架依赖，esbuild 照旧打包，Tauri 体积不变
4. 需要样式隔离时，个别组件再升级为 shadow root（`FtElement` 已预留改造点）

## 目标结构

```
src/
  index.html          只剩骨架：<ft-app> + 四个弹窗标签
  main.js             启动装配（保留现有的 boot 逻辑）
  app.js              逐步缩小 → 最终只做「创建 store、mount <ft-app>」
  lib/
    element.js        FtElement 基类（template / refs / emit）      ✅ 已建
    markdown.js       Markdown 渲染 + 输入高亮（纯函数）            ✅
    storage.js        localStorage 读写封装                         ✅
    constants.js      语言 / 主题 / 存储键 / 默认值                  ✅
    prompt.js         提示词拼装（任务说明 + 术语 + 原文）          ✅
    usage.js          token 统计与用量文案（纯函数）                  ✅
    clipboard.js      文本规整 / HTML→Markdown / 选区插入           ✅
    store.js          极简响应式 store（下一步）
    tauri.js          invoke 封装（从 app.js 抽出）
  components/
    ft-balance-dialog.js    ✅ 已迁移
    ft-picker-dialog.js    弹窗基类（列表 + 勾选）      ✅
    ft-model-picker.js     模型选择                     ✅
    ft-theme-picker.js     主题选择                     ✅
    ft-more-menu.js        「更多」菜单                  ✅
    ft-icon-menu.js        工具栏下拉菜单                ✅
    ft-toolbar.js          顶部工具栏                    ✅
    ft-settings-sheet.js   设置弹窗                      ✅
    ft-terms.js            术语面板                      ✅
    ft-source-editor.js    原文编辑区（高亮层）          ✅
    ft-source-card.js      原文卡片外壳                  ✅
    ft-size-badge.js       调试角标（仅 debug 构建）     ✅
    ft-verify-dialog.js    校验识别结果弹窗              ✅
    ft-output-card.js      译文卡片（预览 / 复制 / 用量）  ✅
    ft-settings-sheet.js
    ft-terms-sheet.js
    ft-toolbar.js
    ft-editor-panel.js
    ft-result-panel.js
    ft-verify-dialog.js
    ft-status-bar.js
  styles/
    main.css          样式入口（@import 汇总，构建时内联）
    00-base.css       基础 / 标题栏 / 工具栏
    10-cards.css      卡片系统
    15-verify.css     校验弹窗
    20-settings.css   设置弹窗
    25-layout.css     网格布局
    30-editor.css     输入区 / 原文卡片
    35-terms.css      术语面板
    40-output.css     译文与用量
    45-debug-menu.css 调试角标 / 右键菜单
    50-markdown.css   Markdown 排版
    55-progress-dialogs.css 进度条 / 对话框 / Toast
    60-responsive.css 响应式与各断点
```

## 组件边界与数据流

```
                 ┌──────────────┐
                 │    store     │  state + 订阅
                 └──────┬───────┘
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  <ft-toolbar>   <ft-editor-panel>  <ft-result-panel>
        │               │                │
        └────── events ─┴────────────────┘
                        ▼
                   app shell
             （调用 Tauri、管理状态）
```

约定：

- 组件**不直接 import store**，通过属性和事件与外壳通信（可测试、可复用）
- 组件内部状态（hover、展开、焦点）自管，全局状态由 store 持有
- 一个组件一个文件，文件内 `template` + `class` + `define()` 三段式

## 迁移顺序（每步都可发布）

| 阶段 | 内容 | 风险 | 状态 |
|---|---|---|---|
| 0 | 基类 `FtElement` + 目录结构 | 低 | ✅ |
| 1 | 余额弹窗（最小闭环，验证模式） | 低 | ✅ |
| 2 | 模型 / 主题选择弹窗（结构类似） | 低 | ✅ |
| 3a | 「更多」菜单 | 中 | ✅ |
| 3b | 工具栏下拉菜单（模型 / 主题） | 中 | ✅ |
| 3c | 工具栏外壳（语言/模型/主题选择、设置、更多） | 中（状态最密） | ✅ |
| 4a | 设置弹窗 | 低 | ✅ |
| 4b | 术语面板（卡片 / 弹窗共用列表） | 中 | ✅ |
| 5a | 原文编辑区（高亮层 + 滚动同步） | 高 | ✅ |
| 5b | 原文卡片（结构 + 字数/按钮/术语条数/立即翻译状态） | 中 | ✅ |
| 5c | 译文面板（预览切换 / 复制 / 用量浮层） | 中 | ✅ |
| 5d | 校验识别结果弹窗（缩放 / 预览 / 未保存确认） | 高 | ✅ |
| 6 | 校验弹窗 + 状态栏 | 中 | 待做 |
| 6 | 纯函数模块拆分（markdown / storage / constants / prompt） | 低 | ✅ |
| 7 | 收尾：CSS 拆分、bind 拆分、静态检查、文档 | 中 | ✅ |

阶段 5 最危险：高亮层、字符数、粘贴、图片缩放都有历史 bug 修复，迁移时必须配套回归清单。

## 阶段 1 的收益（已完成）

- `index.html` 少 20 行静态骨架
- `app.js` 少约 60 行（弹窗 DOM、显隐、按钮禁用、进度条状态）
- 弹窗行为（打开/刷新/进度条/关闭/高度）由组件自己负责，外层只传 `open / busy / amount`
- 测试可单独针对组件写

## 风险与对策

| 风险 | 对策 |
|---|---|
| 迁移过程中功能回归 | 每阶段用 headless 快照对比关键状态（宽度断点、弹窗、列表渲染） |
| 自定义元素未升级时骨架闪烁 | 组件模板默认隐藏，`connectedCallback` 后再显示 |
| 全局 CSS 与新标签选择器冲突 | 保留原有 class 名，CSS 只替换 id 选择器 |
| `wa-*` 组件在自定义元素内初始化顺序 | 继续沿用 `main.js` 里的 `customElements.whenDefined` 等待 |

## 静态体检

每次拆完代码跑一次：

```bash
npm run check
```

它会在没有浏览器的情况下检查三件事：

1. `app.js` 里调用了但没定义的函数（上次 `renderModels` 被误删就是靠这个发现的）
2. `index.html` 用到的 `<ft-*>` 标签是否都有组件注册
3. `app.js` 引用的 `el['...']` 是否在页面或组件里存在

## 怎么验证一次改动

1. `npm run check`：静态检查未定义函数、组件注册、id 引用
2. `node scripts/build.mjs`：构建 `dist/`
3. 用测试版窗口手动过一遍：工具栏 / 原文卡片 / 译文卡片 / 术语 / 设置 / 校验弹窗
4. 窄屏（≤768、≤480）各看一次布局

## 当前分支状态

```
分支：refactor-web-component（本地，未推送、未提交）
基线：dev @ 00afeac（v0.8.2）
状态：结构重构完成，待验收合并
新增：src/lib/element.js、src/components/ft-balance-dialog.js
改动：src/app.js、src/index.html
```
