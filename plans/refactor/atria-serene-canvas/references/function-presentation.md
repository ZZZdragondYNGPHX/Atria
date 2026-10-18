# Atria 核心功能呈现 (Editorial & Canvas 范式)

为了响应产品摆脱既有聊天、IDE 刻板印象的目标，本设计摒弃了“屏幕被框线切割”的传统做法，采用 **"Spatial Canvas" (无垠画布)** 与 **"Editorial" (杂志排版)** 的理念来安置复杂的系统功能。

## 1. 结构大重组：悬浮中枢 (Spatial Floating Dock)
全局的 Navigation 不再是占满左侧或顶部的实体边栏，而是一个悬浮在画布左侧的胶囊形 Dock。
- **功能位置映射:** 
  - 上半部分承载核心五域：Play, Library, Build, Agents, Runtime。
  - 下半部分承载全局动作：Search (⌘K 唤出居中的精美毛玻璃搜索框) 与 Account。
- **弥补旧 UI 缺口:** 旧版的隐形顶栏 Logout 已被合并入左下角最下方的 Account Avatar。点击头像会弹出一个优雅的、漂浮在 Dock 旁边的菜单（包含 Profile, Settings, Sync, **Logout**）。

## 2. Play：沉浸式剧本阅读体验 (Editorial Stage)
彻底砸碎旧版 `index.html` 的丑陋群聊和气泡。
- **视觉映射:** 历史对话被渲染成了类似于“小说段落”的排版（Title + Serif Body Text）。AI（Narrator/System）与玩家（Player）通过排版缩进、字体差异（衬线体 vs 无衬线体）和微小的标识符区分，消灭了气泡框。
- **输入框 (Composer) 升级:** 默认收缩为屏幕底部中央的一根优雅的“线”。它独立悬浮，不再死死贴着聊天流底部，只有在聚焦（Focus）时才会展现输入投影。
- **旧工具的重生 (Inspector):** 
  - 旧版的 Context, History, Persona 被提炼为右上角和输入框旁的“药丸形（Pill）”工具按钮。
  - 点击右上角的 `History`，右侧会滑出一张占据 1/3 屏幕的“毛玻璃纸张 (Sheet)”，用于分支树查看和存档导入，而不是传统的黑框 Drawer。
- **条件能力:** 如果有朗读（Speech）或插图（Illustration），图标以极淡的灰色（ink-faint）安静地跟随在段落末尾，悬停时才显影。

## 3. Library：画廊式资源聚合
- **视觉映射:** 摒弃枯燥的列表。Works 使用极具设计感的画廊网格（Masonry/Grid）。分类（Worlds, Prompt Presets）采用大字号、高对比度的下划线 Tab，如同在翻阅一本设计年鉴。
- **详情与操作:** 点击卡片，直接在当前画布上叠加一张全屏大小的半透明 Sheet（配合平滑放大动画），在其中展示版本、依赖以及“Fix Requirements”等状态。

## 4. Build/Agents：错落的“纸张”工作台
面对专业工作台的高密度信息，如何既保留极简之美又不牺牲专业性？
- **呈现方案:** 废除连接紧密的面板分割线（IDE 范式）。取而代之的是，在灰白色底图上，并排排列 3-4 张带有柔软阴影的“白色纸片 (Floating Sheets)”。
- **流转逻辑:** 
  - 左侧 Sheet 是 Project Explorer。
  - 中央宽 Sheet 是编辑器（采用 JetBrains Mono 字体和克制的代码高亮）。
  - 右侧 Sheet 是 AI Project Agent。

## 5. 必须遵守的废弃/剥离红线 (旧层处置)
- **旧聊天控件:** 所有的 Swipe, 重生成, `#message_template`, `#sheld` 面板在新设计中**连遗迹都不留**。新的交互理念是“如同出版物一般确定的文字”，重生成将通过选中整段文字弹出的 Context Menu（轻量级气泡）完成。
- **兼容性底座:** 现阶段源码中的 `#send_textarea` 等隐藏节点，在新 HTML 样稿中已经彻底消失。在随后的技术落地中，要求后端对接新的 API，前端组件将完全用 React/Vue 原生重写。
