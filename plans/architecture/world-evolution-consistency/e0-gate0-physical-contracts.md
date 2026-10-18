# ARCH-DWE-01 · 主体持久化与事实时间读取

[唯一入口](index.md) · [主体／效果分工](e0-preflight-execution.md) · [P2 选择](e0-handoff-evidence-review.md)。当前 **Draft / Paused**；以下为实现方向，具体字段沿原代码落实。

## 主体身份：P2 优先

在原 Native SessionRevision 管理的 `sessionState` 中，保存一个受保护的最小 Subject 区域：稳定身份、类别、作者定义／正式接纳来源、Session/World 作用域、原提交引用。业务值仍由原 Domain State/Event/History 持有，不复制金钱、债务、位置、社会关系或私人记忆。

- `session-snapshot.js` 的原保留区与 `SessionCore` 的 Typed publication 一起接入；Generic Patch、World reducer 的任意 JSON、插件和模型正文不能直接写此区域。
- 开局从原 WorldRevision/EntryPoint 已声明对象实例化；运行时持续后果涉及新对象时随合法效果接纳。普通背景名词不强制创建对象。
- Subject 属 Session，支持 Worldless 与多 World；同一作者定义在不同 Session 是不同实例。改名、死亡、伪装或换模板不新建 Subject。
- admittedAt/原 Revision 等提交引用由原 Native publication 产生，不让客户端自填作为凭据。
- 原 `SessionRepo.commitSnapshot` 同次发布相应 stateHeads、Revision 与 Receipt。`save-system`、`reachabilitySnapshot`、maintenance/GC 沿原引用闭包处理；如果增加独立子资源，直接补相应引用，不假设 GC 会自动识别。
- `updateResources/worldSelection` 改变的是合法资源／Scope 关系，不能静默重新生成主体身份或丢掉已提交来源。

## 事实：优先复用原领域

对持续因果／规则／历史需要的事实使用 Domain-owned FactKey 与来源；普通文学细节保留自由正文。既有 Domain Event/History 已能得出值与变化时直接引用，只有缺失时才补必要的有效区间、结束或更正关联。不存在统一复制所有值的 FactDB。

事实有效性按所属领域规则：债务直到清偿／免除等正式效果发生前持续成立；到期不自动等于债务消失。具体类型可有明确期限或事件终止规则，不能让查询者从“没召回记录”推断不存在。

## 两个时间锚点与个人所知

1. 原 Session Observation 读取合法、可达的指定 Branch/Revision；后提交的更正不会出现在旧修订。
2. 有规范领域 Clock 时，按所问 GameTick 与有效区间取事实；没有 Clock 时只提供修订顺序，不用现实时间／聊天轮数代替。
3. 原 Information/Perspective 再限定可读结果与个人获知范围；授权入口在读取前确认，私有结果不进入公共检索／缓存。知道过去事实的 Host 不代表当时的 NPC 已知道。
4. 后来发现“其实在 T10 已死亡”只在其正式录入之后的 Revision 可用；它不改写旧快照。真正改变过去沿原作品明确授权的 Retcon／分支机制。
5. 历史因保留策略不可达时准确返回缺失；不从当前值或模型推断重造旧事实。查询使用原 heads／事件来源与有限分页，不从开局全量重放。

读投影按 Session/Branch/Revision、适用领域 Clock/时间、WorldScope、Audience/Grant/用途区分。它可重建，不能反向写世界；也不新增一套缓存／摘要权威。
