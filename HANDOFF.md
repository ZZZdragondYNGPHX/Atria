# Atria 原生 Package Runtime — Live Handoff

## 当前真实状态

- Task ID：`ARCH-NATIVE-PACKAGE-RUNTIME`；Primary Workspace：main 产品，docs 为独立文档空间。
- S0–S5 完成；**CP2 体验与作者闭环完成，按用户要求停止，S6 尚未开始。**
- 产品分支：`feat/native-package-runtime`；HEAD `8f86a4e9f8450dc27b3c3d0818adcbd7a1ce4fb3`，已提交并推送。
- S4 产品：`bffd30f3d`；S5 产品：`8f86a4e9f`；S4 docs：`e14041ce4`，CP2 docs HEAD 以实际远端 ref 为准。
- main 仍为 `4ac8affbf01bfb5fb576834bb7eedbeefd03c007`，本任务未合并。
- Plan：[index](plans/architecture/native-package-runtime/index.md)；Record：[native-package-runtime](records/architecture/native-package-runtime.md)。

## 已完成与保留

CP1 的固定 Domain computation、Task uses / production / once 消费、动态 Context / Knowledge 与单 Session CAS 已保持，不重做 S1–S3。

S4 的固定 Lifecycle Bridge 声明工作流推进/取消、Clock advance、proposal schedule，进入原 SessionCore/CAS；Task/Tool/Controller 沿原 Authority/scheduler。outbox cause 记录真实触发 Revision / Branch / invocation，Task lifecycleCause 从 durable 数据派生，不采信外来同名 JSON。

S5 新 required Processing：固定 trim / 字面 replace / JS/TS transform（纯同步 QuickJS）。输出候选在 Turn finalize 前处理；获准 recent_raw 历史在预算前处理；呈现保留 canonical content，displayContent 通过新读取与原生 Play 消费。旧 message Schema、Task payload / uses、MessageProjection、Knowledge 主链和 Regex 保持兼容。处理不取得 State/Task/Bridge/I/O/提交句柄。

Runtime Design 的同一契约草稿/Source 支持 Processor 增删排序，经原 Review/ChangeSet 保存；已保存项目精确 Revision 的 sample preview 只读，不发送模型请求或写正式状态。Diagnostics 连接现有快照、固定资源/hash、Task/Receipt 和 outbox 原因；错误提供安全阶段/Processor，呈现失败保留原文与控制项。

## 实际验证与限制

S4 155 个不同相关用例（Fs/SQLite、Bridge/Controller、Lifecycle/scheduler、Authority Turn）；S5 137 个不同相关用例（Processing、Studio saved preview、Context/Prompt/computation、Conversation、作者/Play jsdom、错误/本地化），具体命令和修正见同一 Record。触及 JS ESLint、JSON、whitespace 和文档编码/链接通过。仅本地最小相关验证，重复不累计，不主动发起远端 CI。

没有运行全库测试、产品构建、真正浏览器视觉、Android/设备、外部 MySQL/Postgres 或远端模型。S5 UI 为 jsdom；本机 HTTP fixture 不代表远端模型。原子保证只到单 Session。Processing output 只接 Turn narrator 正文；context 只接获准 recent_raw，不额外读取 Information 私有内容/Persona/当前事实；presentation 只用数据式转换，其他组件/Controller 能力仍为原路径。未声称整套设备/领域矩阵验收。

## 工作树保护

产品 AGENTS.md，以及原 docs 工作树 README / WEB-PERSISTENT-PROMPT / templates 的既有 dirty changes 保持未提交。任务文档继续使用独立 docs detached 工作树并推送 HEAD:docs；没有 main merge 到 docs。package/plugin/skills/reference 未修改或读取，未启动子 Agent。

## 下一目标：S6 → CP3

用户本轮只授权到 CP2，当前停止。续接时：真实 Git/远端与 dirty changes → docs Governance → 本 HANDOFF → Plan index / decisions → Record 的 CP1、S4、S5 → 仅按实际集成变更读取权威模块与代码。S6 完成原生场景/相关回归后再执行 main 集成、最小 main 验证、永久记录、分支清理和删除 live HANDOFF。

## 新对话接手提示词

> 继续 ARCH-NATIVE-PACKAGE-RUNTIME，从 CP2 后的 S6 推进到 CP3。先核对真实 main / docs / feat/native-package-runtime 和 dirty changes，按 docs:HANDOFF.md → Plan index / decisions → 同一 Record 的 CP1、S4、S5读取。产品 HEAD `8f86a4e9f8450dc27b3c3d0818adcbd7a1ce4fb3` 已 push，main 仍为 4ac8affbf。S1–S5 已完成，不重做；复用固定 Domain Logic、Task uses/production、Knowledge adoption、Lifecycle outbox/cause、Processing 与 Studio saved-revision preview。每阶段只执行本地最小相关验证，不主动运行远端 CI。S6 才做最终原生 Package 场景、main 集成与验证、任务分支和 live HANDOFF 清理。保护全部既有 dirty changes；不读 reference，不建立平行 State/Authority/scheduler/事实缓存；用户只把控范围、职责边界和关键取舍。
