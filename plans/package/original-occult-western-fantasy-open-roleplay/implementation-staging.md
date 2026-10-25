# 实施阶段与

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

全任务共用 index指定的 Task ID、Primary Workspace、任务分支及唯一 Record。通用执行流程见 [Governance §8](../../../README.md#8-task-lifecycle)。

## Phase 0 企划与换设备交接

产出：完整 Plan Bundle；原样参考 HTML／TXT与来源说明；package派生任务分支；初始 Record；唯一 HANDOFF；相关 refs推送。只做文档与参考资产，不改产品或发布 .atria。该阶段已完成。

## Phase 2 Core最小支持

只实现Phase 1确认的Core缺口，独立main派生辅助分支。记录同一Record。

## Phase 3 Package体验与内容

问答组合背景、多个非调查开局、可自由表达的实际路径，第一批成熟机构超凡机制和可玩的非法探索路线，有限演化、动态内容与模式规则接入。旧调查可作为情境内容重新评估，不保留它的默认主导地位。

明确schema、版本身份、编译产物与历史资产保护；不覆盖旧releases。

## Phase 4 真实前端重构

按用户视觉护栏重构入口、问答、叙事流、草稿建议与辅助抽屉，接入已确定真实运行状态与保存服务。重构允许调整模板、CSS和展示控制器，不只换色，不创建平行聊天authority。

不能以静态HTML或合成模型演示冒充运行证据。

## Phase 5 集成、版本化与收尾

仅在这些目标有足够证据后创建新版本资产；版本号和发布方式根据原项目契约决定。

完成后更新永久Record、移除live HANDOFF并清理短期分支。不能把package任务分支合并main。

## 共同提交与证据

每阶段尽量形成清楚可审阅的提交。docs记录可引用实现／测试HEAD；实现分支不反向存当前docs提交，避免循环。

新设备恢复不重新开展已完成方向讨论，不重复保存参考，不先运行全部历史soak，不恢复旧Plan中已被本任务替代的默认产品方向。

## Phase 2 完成与 Phase 3 入口

A/B/C 已在 `refactor/open-roleplay-core` 实施，精确 tested HEAD 见唯一 Record / HANDOFF。未启动 MySQL/PostgreSQL 服务，未运行远端 CI、生产模型或浏览器/设备。

辅助 Core 保持独立待集成，main 仍为原审计基线；本阶段按分阶段交付保留辅助分支，主线集成留在后续阶段；

## Phase 3 完成与 Phase 4 入口

默认 Open Lives 内容 profile 已在 `2aa07d7adfdfd51552d82545d3457dd003fe6675` 完成；精确 Core 仍为 `5f9e8feb0c7166b45e30c330104a7444beb7692e`，主线未集成。实际问答、故事阅读流、草稿建议、抽屉和保存/终局显示留 Phase 4。

静态槽推广聚合设计和实际绑定入口见 runtime-contracts Phase 3 / 游戏 `runtime/ROLEPLAY.md`，精确报告在唯一 Record。

下一次只执行 Phase 4。按已归档 HTML/TXT 与冻结视觉护栏接入新默认 compiler/profile，不把 placeholder 或旧 Inquiry 页面当新 UI。

## Phase 4 完成与 Phase 5 入口

实际 Native 问卷、单列故事、草稿建议、右缘资料/保存抽屉、普通/铁人终局显示完成，默认 compiler 已替换 neutral shell。真实接入中的两个必要 Host 读口缺口在原 Core 辅助分支修复：有界 recent-message read 与清理后受限终局图重开。前期记录保留。旧发布/参考未改，无新 `.atria`。

## Phase 5 完成

Core 辅助分支已快进集成 main；游戏任务分支已快进集成 package，新 3.0.0 发布保留在游戏 releases，旧两个版本和参考字节不变。发布工具新增新 profile 的 release-only，保留排他构建及历史选择。精确 HEAD、命令、原始报告、发送数和未测边界见唯一 Record Phase 5。

两个短期任务分支及 live HANDOFF 已清理；整体完成，不存在下一正式阶段。
