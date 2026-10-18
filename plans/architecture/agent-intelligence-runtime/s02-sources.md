# S02：来源 / 引用 / 有效性最小契约

本阶段是已授权 M1 范围内的局部工程细化。仅交付只读来源 adapter、EvidenceSet v1 与 Evaluation v1 consumer；不注册远期资源，不增加模型调用。

## 来源与唯一 authority

两个 adapter：RP（普通 chat 与 Native Session 分域）和 Project。

| 域 | scope / selector | 原 authority / 存储定位 | exact anchor |
| --- | --- | --- | --- |
| rp_chat | charDir、name、isGroup、groupId；persisted messageId + floor | ChatRepo → 既有 chat key；owner 来自独立 authenticated handle |不合成旧消息 ID|
| rp_session | sessionId；messageId 或 invocationId + context grant | SessionCore 当前 HEAD → 既有 Session / timeline / task results | packageVersion、branch、revision；消息 active variant 或 artifact production revision |
| project | projectId；taskId | StudioService Git revision + ProjectAgentService task |Review 与 committed receipt 分开|

普通 chat 的内容身份复用 Memory source-provenance；重复 ID、floor 移动、variant 更换、正文编辑都不能复用旧证据。镜像 Native 消息只能通过 Session 读取。
Native 历史 revision 不作为 current 的替代。operation / rule grant 不被转换为读取权限，不标记 consumption。
Project Review 只证明真实 Review 状态；completed 使用原 service 的 changeset resultingRevision。human edit、任务变更、takeover / cancel / conflict 或任务来源缺失均不能当 current。持久恢复与 legacy missing 边界见 [s04-project-recovery.md](s04-project-recovery.md)。

## 最小 schema 与消费

不接受 raw result、client owner 或 self-declared current / trusted 字段。
capture 读取原 authority 生成引用；
正文展开为显式 expand；任何来源失败均不返回整组正文。

## 预算、生命周期与兼容

无静默截断、无 token / price 推断。scan / expansion 预算不足明确失败或 incomplete。
既有 authority 自身加载完整 chat / Session 的 IO 不宣称已变成流式或受该正文展开预算限制；预算限制下游选择、扫描和正文释放。后续可靠捕获独立细化。
本阶段 EvidenceSet / Evaluation 为调用返回值，**没有持久 key、新 registry kind 或数据迁移**。持久 EvidenceRecord 共用层在 S03，Project task 在 S04，S05 retention / 删除策略已由 [s05-feedback.md](s05-feedback.md) 独立交付；这些仍非 S02 当时能力。
删除原 chat / Session / Project、消息、artifact 或 task 后，每次消费沿原 authority 失效；unknown schema / representation 拒绝。旧运行与原存储布局继续可用；撤回本阶段只需移除调用 / exports，无数据转换。
仅使用原 ChatRepo、SessionCore 与 Studio / ProjectAgentService；不写 World、Project source、原 task 或配置，不创建另一套有效配置读取器。Studio 的既有 getRevision 可同步外部 human edit 到自身历史，该行为沿原 authority 保持。
