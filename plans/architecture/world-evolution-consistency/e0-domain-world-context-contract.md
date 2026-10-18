# ARCH-DWE-01 · Domain → 有效世界 → Context 接线

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md)。沿 W17-B 的 Domain-first 方向；当前 **Draft / Paused**。以下是目标调用职责，不声明新 API 已存在。

## 正式效果的写入

```text
玩家输入／NPC 行为／模型提案
  → 原 Domain 规则、权限、分支与前置状态
  → 必要 Subject 接纳 + 正式状态／事件／参与者
  → 原 Native Session publication / Revision / Domain Receipt
  → 合法观察、Timeline、HCM 与只读世界投影
```

- `SessionCore`、原 World reducer、Authority transaction 与 Task/Simulation 各沿原合法入口提交；能同次发布的状态与事件共用原 Revision，不能同事务的文本／媒体保留单独结果。
- 世界效果已提交而 Narrator 尚未发表时，恢复正文引用原结果，不能再执行交易；未知提交读取原 Receipt，再决定下一动作。
- V3 Effect/Result/Run 只观察原 Domain 结果；`confirmed` 不能代替世界提交来源。`rp_chat` 等不同领域不能强行合成同一个 Session 事务。
- 玩家授权与世界效果仍属原领域；Prompt、Knowledge、HCM、媒体产物都不能直接写世界。

## 只读的世界与上下文

```text
合法 Source/Audience/用途 + 指定 Session/Branch/Revision
  → 原 Native State/Event/History + 固定 WorldRevision
  → 适用领域时间与当前／历史／法则／来源说法
  → 合法 Perspective 的可读投影
  → 原 Knowledge/HCM/ContextPlan 的关联选择与预算
  → PromptCompiler SemanticBlocks / Provider lowering
```

授权先限定可读取的范围；Host 内部结算投影不直接进入模型或 UI。角色信念、观察时间、别名与披露仍受原 Information 管理。来源已过期或当前分支变化时，只重建相应读投影／请求，不改写已发布作者资源。

## 最小接口职责

| 逻辑输入／结果 | 归属与用途 |
| --- | --- |
| Subject/Participant | 原 Session 确立持续主体与实际参与者；ActorProfile 仅为可选表达模板 |
| WorldEffectProposal | 玩家／NPC／模型可提议效果；实际参数与执行许可由原 Domain 处理 |
| DomainReceipt | 原提交身份、结果、Branch/Revision/Event 来源；供 V3、UI、叙事引用 |
| EffectiveWorldRead | 原 Host 只读当前／历史／law/claim/belief，带合法来源与适用锚点 |
| ContextEvidenceBinding | 原 ContextPort 提供受众／来源／认识状态及完整度，Compiler 不重判世界真相 |

沿原引用可推导的数据无需逐项复制持久化。Play 看真实分支，Studio 预览固定起点，Prompt Preview 展示编译结果；它们共用来源机制但不是同一内容，也不构成相互授权。
