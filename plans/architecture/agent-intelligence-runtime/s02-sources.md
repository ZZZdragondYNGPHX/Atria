# S02：来源 / 引用 / 有效性最小契约

本阶段是已授权 M1 范围内的局部工程细化。仅交付只读来源 adapter、EvidenceSet v1 与 Evaluation v1 consumer；不注册远期资源，不增加模型调用。

## 来源与唯一 authority

两个 adapter：RP（普通 chat 与 Native Session 分域）和 Project。

| 域 | scope / selector | 原 authority / 存储定位 | exact anchor |
| --- | --- | --- | --- |
| rp_chat | charDir、name、isGroup、groupId；persisted messageId + floor | ChatRepo → 既有 chat key；owner 来自独立 authenticated handle | 当前 swipe_id + sourceContent 的 SHA-256；不合成旧消息 ID |
| rp_session | sessionId；messageId 或 invocationId + context grant | SessionCore 当前 HEAD → 既有 Session / timeline / task results | packageVersion、branch、revision；消息 active variant 或 artifact production revision |
| project | projectId；taskId | StudioService Git revision + ProjectAgentService task | baseRevision、当前 revision、完整 task hash；Review 与 committed receipt 分开 |

普通 chat 的内容身份复用 Memory source-provenance；重复 ID、floor 移动、variant 更换、正文编辑都不能复用旧证据。镜像 Native 消息只能通过 Session 读取。
Native 历史 revision 不作为 current 的替代。Artifact 仅沿 readTaskArtifact 的 reusable context grant 读取，保留其 task definition、dependency、scope epoch、branch 与 hash 检查；operation / rule grant 不被转换为读取权限，不标记 consumption。
Project Review 只证明真实 Review 状态；completed 使用原 service 的 changeset resultingRevision。human edit、任务变更、takeover / cancel / conflict 或任务 Map 在重启后缺失均不能当 current。持久恢复由 S04 交付。

## 最小 schema 与消费

EvidenceSet v1：schemaVersion、owner、单域 scope、1–32 个 references、canonical SHA-256 integrity。
每个 reference 仅包含 selector、authority 派生的 anchor、contentHash；不接受 raw result、client owner 或 self-declared current / trusted 字段。
capture 读取原 authority 生成引用；evaluate 对未经信任的引用逐项重读，校验独立 handle / expected scope、anchor 与 hash。SHA-256 只证明内容关系，不提供授权。
Evaluation v1 返回 evidenceSetHash、current / incomplete、每个源的 current / missing / stale / denied / unavailable / budget_blocked 与预算消耗；这是来源有效性检查，不是模型效果、完整轨迹或晋升结论。
正文展开为显式 expand；任何来源失败均不返回整组正文。同一 scope 的来源在同一 authority 快照中同步解析，再统一重验；最后核验到返回之间无 await，捕获变更的源不得释放旧内容。有效性是此次读取的观察，后续用途须重新核验，不授予 mutation 或 publication。

## 预算、生命周期与兼容

调用方必须提供有限 maxSources（1–32）、maxBytes（1–131072 UTF-8 JSON bytes）和 maxScanMessages（1–8192，包含重验）。无静默截断、无 token / price 推断。scan / expansion 预算不足明确失败或 incomplete。
既有 authority 自身加载完整 chat / Session 的 IO 不宣称已变成流式或受该正文展开预算限制；预算限制下游选择、扫描和正文释放。后续可靠捕获独立细化。
本阶段 EvidenceSet / Evaluation 为调用返回值，**没有持久 key、新 registry kind 或数据迁移**。持久 EvidenceRecord 共用层在 S03，Project task 在 S04，retention / 删除策略在 S05；不得把这些能力提前计为完成。
删除原 chat / Session / Project、消息、artifact 或 task 后，每次消费沿原 authority 失效；unknown schema / representation 拒绝。旧运行与原存储布局继续可用；撤回本阶段只需移除调用 / exports，无数据转换。
仅使用原 ChatRepo、SessionCore 与 Studio / ProjectAgentService；不写 World、Project source、原 task 或配置，不创建另一套有效配置读取器。Studio 的既有 getRevision 可同步外部 human edit 到自身历史，该行为沿原 authority 保持。

## 验收

本地最小测试覆盖 FS / SQLite 的真实 chat 与 Native Session、原 Task Artifact authority 的 grant / dependency 失效、真实 Studio Review / commit / human revision conflict，以及伪造正文 / owner / scope / anchor / hash、删除、重复身份、读中变更、预算和 unknown schema。ProjectStore 原本使用 FS / Git，不宣称 Project 已具备 SQL task 持久化。
无生产用户数据、Secret、网络、真实模型或 UI 改动；S03 / S04 尚未执行。
