---
name: atri-native-runtime-authoring
description: 设计 Atria Native Turn、Model Task、Session App、Workflow、Activity 结算和 Scene 呈现；维护事实先提交再叙述、精确资源与取消恢复边界。
metadata:
  author: Atria Team
  version: 1.0.0
  atria-paths: studio,agents
---

# Native Task / 生命周期 / Activity / Scene

根据请求选择需要的契约，不默认引入后台自动化或模型调用。

1. 查 catalog `tasks`、`lifecycle`；涉及 Activity/媒体才读 `presentation`，涉及 Turn 正文/Variant 读 `messages`。
3. Source 只声明语义需求；Model/Connection/Secret/调度/并发/超时/取消由 Host 控制。不要在 Package 中写 provider URL 或执行脚本来补齐能力。
4. 没有 recorded fixture 或设备证据时明确相应未测。
