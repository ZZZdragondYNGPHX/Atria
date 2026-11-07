---
name: atri-native-ui-authoring
description: 创建或修改 Atria Native Frontend v3 Source、组件、局部状态与 typed Bridge 交互，通过正式 Compiler、Preview 和 Studio Review 交付。
metadata:
  author: Atria Team
  version: 2.1.0
  atria-paths: studio,agents
---

# Native Frontend v3

先弄清玩家在这个界面里要完成什么，再决定视图、控件和反馈。沿用作品已有的视觉语言，让文字、留白和交互共同表达作品的气质。

- 从 API catalog 的 `frontend-guide`、`frontend` 查用法与 Source Index；编辑语法、Bridge 或结构化补丁时，再读 `frontend-aui`、`frontend-bridge`、`frontend-authoring`。消息界面加读 `messages`。
- 编辑 `frontend.json`、`.aui`、CSS、Bridge 和 Controller 等 Authoring Source。编译产物由正式 Compiler 生成，Preview 与 Play 共用 Renderer。
- Frontend 可声明在 `package.runtime.experience` 或某个 EntryPoint 的 `runtime.experience`。`frontend` 使用 `kind: native`、`version: 3`、`source: frontend/frontend.json`，沿用已有 owner 和其余 runtime 配置。
- Component 可嵌入 Host 的聊天、输入区或侧栏；Hybrid/Full 的 View 使用 `app.root`，Text 保持正文体验。
- 修改现有 UI 时，先用 `atri_agent_frontend_graph` 找 owner、semantic ID 和 contentHash，再用 `atri_agent_frontend_patch` 修改对应节点或声明。新文件和较大结构调整使用 Source 操作。
- 阅读 [UI 写法与交互](references/ui.md)，通过现有 Studio proposal、Build、Preview 和 Review 交付。Preview 可检查呈现与局部交互，真实 Session 写入需在 Play 中验证。

[frontend.json](examples/frontend.json) 与 [Main.aui](examples/Main.aui) 是使用 `app.root` 的最小界面，适合 Hybrid/Full 起步；它们需要放进 Project 并由对应 Experience 引用。
