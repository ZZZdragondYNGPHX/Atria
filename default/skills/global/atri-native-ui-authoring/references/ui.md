# UI 写法与交互

## 从 Source 到可见界面

`frontend.json` 组织 Views、Components、CSS、assets，以及可选的 Bridge、media、localization。索引中的路径相对于索引文件；Controller 的 `source` 也相对于索引，Controller 内部的静态 import 则相对于导入文件。

`.aui` 包含一个 `<template>`，以及可选的 JSON `<contract>`、组件 `<style>`。每个元素有稳定的 `node-id`。通过 `bind:text`、`bind:value` 和 `on:click` 等声明连接状态与交互；具体支持的标签和属性查 `frontend-aui` / `frontend-guide`。

Component 可使用 `chat.header`、`chat.footer`、`composer.before`、`composer.after`、侧栏等 Host surface。Hybrid/Full 的 View 使用 `app.root`。本 skill 的示例也是 `app.root`，按作品模式选择挂载位置。

## 状态与反馈

局部状态放在 `<contract>.state`，每个作用域声明对象 schema 与 initial：`component` 属于组件实例，`view` 属于路由历史项，`ui` / `draft` 属于当前挂载的 Experience，`prefs` 使用 Host 的账户偏好。组件通过 props 接收数据、emits 传出交互、slots 组合内容。

先用声明式 interactions 完成切换、表单、视图导航和弹层。`set` / `toggle` 改局部状态；世界动作通过 Bridge 的 `action.invoke`，长任务通过 `operation.start` 与 `operation.cancel`。给等待、成功或失败一个符合场景的可见回应，写给玩家的文字说清发生了什么。

使用语义按钮、表单标签和 `:focus-visible`；输入中的 IME 合成由 Renderer 处理。需要自定义交互时继续尊重合成状态和键盘操作。布局可使用环境中的 viewport、safe-area 与 keyboard inset，动效响应 reduced-motion。局部展示状态用于界面，世界事实通过 Host 正式接口改变。

## 连接 Host 能力

Bridge bindings 声明 typed target，组件的 `uses` 提供 Controller 可调用的能力集合；声明式 read/action 会由 Compiler 推导依赖。字段和目标以 `frontend-bridge` 为准。

消息界面分别呈现已提交 Timeline 和生成中的 streaming 内容。正文使用 Safe Prose，保留 Host 提供的状态与操作结果；生成中的文字还不是已落定的世界事实。

复杂可视化可用 JS/TS Controller 和受控 Canvas。Controller 在 QuickJS 中运行，通过 `ctx` 的 scoped handles 连接 Host，无浏览器 DOM、fetch 或 storage。在 `init` 中布置界面和读取数据，写入动作放在玩家交互中；Controller 恢复会保留 Host 状态，但不会重放已发出的写入。具体 ABI 读 `frontend-guide` 的 Controller 部分。

多语言用 localization catalog；图片、音频和视频用声明的 assets。远程图片还需 media catalog、`remote-media` feature 与 permission，并由玩家在 Host 中启用。添加这些能力时读取 `frontend-guide` 对应章节即可。

## 修改与预览

`atri_agent_frontend_graph({ownerId})` 给出 semantic IDs、Source 位置、contentHash 与诊断。`atri_agent_frontend_patch` 支持 `component`、`node`、`view`、`binding`、`style`、`state`、`interaction`、`message`；携带图中对应文件的 contentHash。Node 使用 `field: "text"` 或 AUI 属性名，JSON 声明使用 `path` 数组，message 带 locale；相同节点 ID 分布在不同组件时带 componentId。

Preview 使用正式 Compiler/Renderer 和只读投影，适合检查布局、局部状态与展示交互。它不建立可写 Session；缺少固定投影会报告 `bridge_projection_unavailable`。根据诊断修改 Source，再把完成的提案交给 Studio Review。
