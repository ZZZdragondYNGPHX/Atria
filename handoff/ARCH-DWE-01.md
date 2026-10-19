# ARCH-DWE-01 · 动态世界／知识重构暂停交接

- **状态**：**Draft / Paused**。用户于 2026-10-17 暂缓产品实施，先完成排队的 Native Orchestration、Prompt Preset 与整体前端重构，再主动指示 Codex 接手；本次文档整理不解除暂停。
- **入口**：[Plan Index](../plans/architecture/world-evolution-consistency/index.md) · [当前架构](../plans/architecture/world-evolution-consistency/design.md) · [功能分工](../plans/architecture/world-evolution-consistency/e0-preflight-execution.md) · [唯一 Record](../records/architecture/world-evolution-consistency.md)。本文件保存恢复所需状态，执行方式以 Plan 入口和当前仓库治理为准。

## 已确定的方向

W1-B～W22-B 架构方向已确认：World Model + Source Library、自由文本与关键事实绑定、运行时涌现主体、私人认知与客观事实分离、事件驱动的有限 NPC 自主性、Revision／领域游戏时间的历史读取，以及 Library/Studio/Play 的完整功能。

P2 优先：同一 Native SessionRevision 的受保护 SessionState 只保存最小身份、origin、scope 和 admission 来源。业务值归原 Domain；V3、HCM、Context 与 Prompt 使用合法结果，不成为第二世界写入权威。

上述属于已确定设计，产品接线尚未实施。暂停前源码位置与 SHA 是历史参照，详见 Record；恢复时使用届时实际整合后的代码。

## 尚需落实的功能

| 工作包 | 主要工作 |
| --- | --- |
| WP-A | 开局与运行时 Subject 接纳、受保护写入、持续效果及原 Domain Receipt／叙事衔接 |
| WP-B | 事实历史、有效时间、纠错、Save/Branch/GC 与作用域引用 |
| WP-C | 动态 Perspective、私人记忆、目标、实际通信与有限自主行为 |
| WP-D | 合法 Effective World／Source Claim 进入现有 Context/Prompt |
| WP-E | 实际 Participant、可见别名、表达模板与 Play／媒体读取 |
| WP-F | 世界／资料创作、起点装配与预览、档案／历史和旧入口替换 |

## 恢复后的接手方式

读取 Plan 入口和对应功能模块，结合用户当时授权的范围，在实际代码中完成以上接线。已有字段和接口改变时同步直接使用者，普通实现选择由执行者处理。

用户授权实施后连续推进到整体完成，结果记录在同一 Record；具体执行方式见[Plan 入口](../plans/architecture/world-evolution-consistency/index.md#实施时的连续推进)。
