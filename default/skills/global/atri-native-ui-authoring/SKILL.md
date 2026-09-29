---
name: atri-native-ui-authoring
description: 创建或修改 Atria Native Frontend v3 Source、组件、局部状态与 typed Bridge 交互，通过正式 Compiler、Preview 和 Studio Review 交付。
metadata:
  author: Atria Team
  version: 2.0.0
  atria-paths: studio,agents
---

# Native Frontend v3

- 读取 API catalog 的 `frontend-authoring`、`frontend-guide`、`frontend`、`frontend-aui` 和 `frontend-bridge`；需要消息时读取 `messages`。
- 只编辑 Authoring Source：`frontend.json`、`.aui`、style、bridge 等 Source Graph 文件。IR 是 derived-readonly，Preview 与 Production 使用同一 Compiler/Renderer。
- 阅读 [UI 权威与交互边界](references/ui.md)。Package owns presentation；Host owns capabilities and authority。
- 使用 [Source Index](examples/frontend.json) 和 [Native SFC](examples/Main.aui) 验证最小闭环。Project 的 `runtime.experience.frontend` 使用 `kind: native`、`version: 3`、`source: frontend/frontend.json`；合并既有 runtime，不覆盖其他声明。
- 保留 Component/Hybrid/Full 布局所有权；Text 不拥有 Frontend。拒绝旧版 UI，不做兼容或隐式迁移。
- 使用既有 Studio proposal、Build、Preview、human Review；按 semantic ID 修改 Source，保留注释与格式。
- 验证 loading/empty/error/disabled、键盘/焦点、窄屏、IME、恢复与 dispose。只报告实际执行的证据，Preview 不是可写的真实 Session。
