# ARCH-DWE-01 · 原生功能替换与保留

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [最小类型／使用者](e0-minimal-contract-cutover.md)。当前 **Draft / Paused**。

## 唯一数据归属

| 内容 | 原 owner | 读取／派生用途 |
| --- | --- | --- |
| 法则／初始设定／作者表达 | WorldRevision/Package/ActorProfile | 起点实例化、Studio、合法 Context；Play 不覆盖作者原件 |
| 主体、当前状态／关系／事件 | Native Session/原 Domain State/Event/History | Effective World、Timeline、UI、任务；HCM/Prompt 不反写 |
| 正式效果与提交结果 | 原 Native publication/Revision/Receipt | V3、叙事与 UI 引用，未知结果读取原操作 |
| 游戏时间／历史／分支 | 原 Clock、Revision/Save/Branch/History | 合法 as-known/as-of；不以墙钟、楼层或全局 latest 替代 |
| 单方认知／意图／情绪 | 原 Information/Cognition/HCM/Memory | 个人 Context、记忆与行为，不自动形成共同关系／合同 |
| 媒体与表现 | 原 Speech/Visual/Asset | 有来源的呈现，不倒推世界真实身份或效果 |

## 随功能替换的旧假设

- **Manifest Actor 就是所有运行人物**：改为正式 Subject/Participant、可选 ActorProfile 与 Host Perspective。保留模板资产的原身份，不直接把所有 actorId 改名。
- **世界书正文被激活就是真相**：改为来源／用途／有效期明确的 Context；保留正文、关键词／Regex 的合法检索价值。
- **写出了效果就算已发生**：正式效果由原 Domain 提交，叙事只承认确认结果；不以 HCM 记录或 V3 confirmed 代替。
- **每个 NPC 常驻 Agent**：改为原事件／时间驱动分层调度，重要角色按需模型提案。
- **全局最新值可回答所有历史**：改为 Revision/领域时间与合法受众读取，共同祖先之后独立演化。
- **新世界模块独立一套界面／存储**：沿原 Session/Library/Studio/Play、统一前端与原 Resource/Save/GC 完成。

## 替换顺序

主体／提交→历史与存档→动态视角／NPC 和世界 Context→Timeline/Play/媒体→作者装配／有效预览。作者正文编辑可并行。直接调用方的 schema、读取和资源引用跟随相应功能更新，旧 WorldInfo/注入／Actor-only 路径在对应替代完成时清退。

保留有效 Memory/Goals/Experience、检索、Visual Director、原插件／作品的受支持能力；不按 `legacy` 目录名整树删除，也不为了省改动保留 ST 旧数据双写／旧模式 fallback。实际原接口缺项记为该功能的接线工作，不另安排全量审计、测试或性能阶段。
