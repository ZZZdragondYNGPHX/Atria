---
name: atri-native-ui-authoring
description: 创建或修改 Atria Native Component Model v2 界面、局部状态、偏好、typed actions、Opening 和消息呈现；通过真实编译器与 Studio Review 交付。
metadata:
  author: Atria Team
  version: 1.0.0
  atria-paths: studio,agents
---

# Native UI v2

先判断当前文档是 v1 还是 v2，保留现有体验模式。不要通过改一个版本号把动态 v1 文档冒充 v2。

- 通过当前 API catalog 读取 `ui-document`、`ui-actions`、`capabilities`；涉及消息时加读 `messages`。使用其明确支持的节点、surface、绑定和动作字段。
- 阅读 [UI 权威与交互边界](references/ui.md)。把 UI 草稿与游戏事实分开；同一 action 最多一个权威写入，其余步骤不能偷偷绕过该上限。
- 从 [可编译的局部交互示例](examples/ui.json) 开始验证：输入修改本地名称，按钮填入示例值。它不需要模型、World 或网络，也不提交游戏事实。
- 将文档作为独立 UI Source 文件，Project runtime.experience 指向该文件并明确 componentModelVersion: 2。按当前契约配齐使用的 capability 和资源闭包，使用既有 Studio 提案、编译、Preview、Review。
- 验证空状态、错误、禁用、键盘/焦点、320px 窄屏、恢复后状态与挂载释放。只报告实际执行的验证；不把静态作者 Preview 当作可操作的真实 Session。
