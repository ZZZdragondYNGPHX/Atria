---
name: atri-native-verification
description: 用 Atria Studio 的真实编译、精确 Preview、recorded Scenario 与 Play Health 验证 Native 作品；区分预览、Review、提交与设备证据，不调用付费模型代替测试。
metadata:
  author: Atria Team
  version: 1.0.0
  atria-paths: studio,agents
---

# Native Studio / Scenario / Health 验证

用于已经有 Source 或变更提案的验收与诊断；不要把验收扩展成重写作品。

1. 读当前目录的 `scenario`、`project`、`capabilities` 和本次修改涉及的契约。用生产 compiler/validator 检查，不能只验证 JSON 可解析。
2. 阅读 [验证层次与边界](references/verification.md)。从 [无模型 Scenario](examples/scenario.json) 开始；它只验证 checkpoint/restore，不声称覆盖业务流程。
3. 将涉及的业务步骤与断言加入 `scenarios/main.json` 提案，使用 recorded/mock Task 结果，不触发真实 provider。按现有 Studio Review 和 Test Bench 流程运行。
4. 对错误读取实际诊断，区分 Source schema、exact dependency、Task binding、Host required capability、权限和过期 revision。修复限定于原因，不以取消权限检查或任意 state patch 让测试变绿。
5. 输出具体证据：Source/Package 版本、已执行用例、通过/失败、未测设备或外部行为。Review 不等于 Commit；模拟成功不等于真实模型质量或物理设备验证。
