# 西幻开放式文字扮演重构企划

- Task ID: `refactor/original-occult-western-fantasy-open-roleplay`
- Primary Workspace: `package`
- Implementation branch: `refactor/original-occult-western-fantasy-open-roleplay`
- Base: `package@48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e`
- Core baseline: `main@c8d2d0e0c11c283ade2fa3c730740a0dc480c746`
- Status: Complete; Phase 0–5 finished; Core integrated into main; Open Lives 3.0.0 retained on package
- 当前阶段：整体完成。最终 Core / Package HEAD、发布哈希、实际本地验证与未测边界见唯一 Record Phase 5；live HANDOFF 与两个任务短期分支已清理。
- 日期：2026-10-04。

## 目标与问题

当前游戏以独立民事核验者、Second Death、调查与卷宗为开局和主要表达，偏离用户要求的开放式文字扮演。此次同时调整产品方向、游戏资产、必要的运行契约与前端，不只换皮。

玩家可以选择生活和职业方向，以自然语言表达言行。超凡体系是特色核心；成熟机构路线为主流，非法野路子允许探索。短期经历应能完整体验机制；长生、跨世代和长期经营是可选延伸。

本企划替代旧玩法对本任务的默认约束。旧版本及其已完成 Plan/Record 保留历史事实，不回写为失败或删除成果。

## 冻结原则与权威

跨模块冻结决策只以 [decisions.md](decisions.md) 为权威；各模块拥有本领域详细规则。用户当前指令优先，不能因旧 UI、目录、动作 schema 或旧 Plan 而恢复固定调查职业。

Primary Workspace 为 package，因为目标是这个游戏。用户明确要求创建分支，因此本多阶段任务使用从 package 派生的上述短期分支；全部阶段沿用它，最终集成回 package。Core 只有在 Phase 1 确认缺口后才使用 main 派生辅助分支；不把游戏分支合并 main，不把 main 合并 package/docs。全任务只有一份 Record。

## 模块图

| 模块 | 拥有的设计领域 | 依赖 |
| --- | --- | --- |
| [decisions.md](decisions.md) | 跨领域已确认方向与未定边界 | 用户讨论 |
| [player-experience.md](player-experience.md) | 开局、自由表达、叙事、短篇与人生路线 | decisions |
| [world-supernatural.md](world-supernatural.md) | 超凡路线、机构、成长、有限世界演化与扩展 | decisions、player-experience |
| [runtime-contracts.md](runtime-contracts.md) | 契约审计、意图解析、权威结果、状态与保存模式 | player-experience、world-supernatural |
| [frontend.md](frontend.md) | 用户视觉护栏、入口、抽屉、输入与前端状态 | player-experience、runtime-contracts |
| [implementation-staging.md](implementation-staging.md) | 阶段顺序、产出与验收 | 各领域模块 |
| [verification.md](verification.md) | 按风险分层的实际验证及证据边界 | staging、runtime-contracts、frontend |

依赖路径：用户方向 → 玩家体验／世界规则 → 运行契约 → 游戏内容与前端 → 集成验证。UI 与规则设计可以在阶段内配合，不为演示先造另一套运行时。

## 阶段与按需阅读

| 阶段 | 目标 | 本阶段必读模块 |
| --- | --- | --- |
| 0 | 建企划、保存用户参考、建立 Record/HANDOFF 并推送 | index、decisions、staging |
| 1 | 核对真实契约，明确最小可玩闭环与缺口；本阶段不实现产品 | index、decisions、player-experience、world-supernatural、runtime-contracts、staging；verification 的 Phase 1 |
| 2 | 只补已确认的 Core 契约缺口 | index、runtime-contracts、staging；verification 的 Core 部分 |
| 3 | 新游戏开局、内容与超凡闭环 | index、player-experience、world-supernatural、runtime-contracts、staging；verification 的游戏部分 |
| 4 | 按用户参考重构真实 Native 前端 | index、frontend、player-experience、已定运行接口；verification 的 UI 部分 |
| 5 | 集成、模式与风险验证、版本化交付 | index、staging、verification，必要的对应领域模块 |

任务续接时先读 live HANDOFF → 本 index → 当前阶段模块 → 同一 Record 的相关章节；本任务完成后以唯一 Record 为历史入口。不要全量扫描其它 Plans、Records、skills 或 reference 分支。

## 设计状态与本轮边界

已冻结产品方向及视觉护栏；Phase 3 内容闭环保留，Phase 4 已接入真实 Native 问答、阅读、草稿建议、随身记事与保存/终局页面。Core 铁人支持以 Phase 2 实际接口及 Phase 4 最小读口修复为准。

Phase 1已定位实际authority resolver/准备与提交、动态提案反应、保存闭包和Native桥接；确定Core A无模型开始、B持久续接/发送预算、C铁人模式与死亡清理。Package拥有问答、生活原语、超凡路径、8槽动态内容及有限世界策略。具体设计权威见对应模块，不复制到index。

默认 Open Lives 3.0.0 保持 19 个事务/17 个玩家原语、2 个模拟 job；P4 替换 neutral shell 编译路径为真实 Native 页面。为支持有界最近消息和清理后的铁人终局展示，在原 Core 辅助分支补固定只读服务及终局受限 epoch，Core 已以相同 HEAD `1661af11245c856363bfc1084275c02b55a97452` 快进集成 main。实际接口以 runtime-contracts Phase 2/3/4 和游戏 `runtime/ROLEPLAY.md` 为准；精确实施 HEAD、本地浏览器/局部 Core 证据及限制见同一 Record / HANDOFF。Phase 5 已完成最终文件的内容/Native UI/发布安装校验，3.0.0 已保留在 package；生产模型叙述质量仍未测。

每阶段及任务完成时，只在本地执行最小相关验证。详见同一 Record Phase 2 / HANDOFF；远端 refs 核对只属于发布确认，不启动/等待/依赖远端 CI。
