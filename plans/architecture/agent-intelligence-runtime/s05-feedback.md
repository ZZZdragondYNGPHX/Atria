# S05：反馈、诊断与生命周期

本阶段是 M1 授权范围内的工程细化；不增加模型调用、不发布候选，也不建立第二个 source / task / 配置 authority。

## 资源、隔离与容量

新增 additive `atri_agent_experience`，key 为 authenticated handle + scopeId；scopeId 是原 S02 scope 与 Host 解析 subject 的 SHA-256。单资源 v1 ledger 保存 feedback 与 diagnosis，sequence / integrity CAS，复用 StorageEngine native_resources / FS native kind。owner 仅来自 key；内嵌 EvidenceSet 的 owner 消费时仍须核对，跨账户 restore 不成为可用来源。无 DDL、backfill 或旧 schema 改写。

Project subject 固定 Project identity；普通单角色 chat 固定 charDir，group 仅按 exact message identity 隔离，不凭显示名字合并角色；Native message 从原 timeline actorId 解析 subject，非角色 task receipt 按 entryPoint 隔离。Session / chat / Project 不相互扩散。单 ledger 上限 512 KiB、256 feedback、64 diagnoses；达到容量明确拒绝，不淘汰仍有效的数据。

Feedback 的 Host UUID、时间、source descriptor 与来源 hash 不接受客户端伪造。source descriptor 引用原 EvidenceRecord 或 durable Project task，另保存原 S02 exact sources；不复制 trace、正文、对话、Workspace、私有 reasoning 或 provider state。原 source 更新、variant / branch / revision / hash / owner 变化都要重新捕获。普通 chat / Project 历史反馈可记录但不可作为当前诊断依据；Native subject 必须从仍可重验的 exact output / receipt 解析，失效来源拒绝新建反馈。

## 分层与消费者

- explicit：authenticated 用户提交 correction / prefer / avoid，dimension 与有限公开 note；只证明该用户对此 exact target 的表态。
- observation：regenerate / edit / abandon / accept / review_reject；始终 client_observation，不转换为 preference。
- technical：从 Host 保存的 validation / Review / changeset 或 Native receipt 解析。客户端只能选择 source，不能提交技术结论；unknown 保持 unknown。
- diagnosis：用户提交的有限公开假设，保存适用条件、反例、方向与 exact feedback revision / hash。弱观察单独只能产生 undetermined 方向，技术 failure 与显式反馈可提出候选方向；诊断不证明原因、质量、World fact 或自动 publication 权限。

Authenticated generation router 的 `/experience/*` 是双入口共享 consumer；`target` 从原 authority 返回 exact hash / subject，避免客户端自行推断指纹；每次 inspect / export / reflection / diagnose 重验原 authority。变更需 expectedSequence，correct 固定原 source 并递增反馈 revision；重绑定来源必须新建反馈。相同 technical source 去重。纠正 / 撤回使相关 diagnosis stale；删除反馈同时物理删除相关 diagnosis 的内容。`withdrawDiagnosis` / `deleteDiagnosis` 可独立撤回 / 删除假设，不改写原反馈。

Reflection consumer 只返回有限批次与 fingerprint：显式事件或失败技术事件可就绪，弱观察至少三个不同 exact execution source 才就绪（仍是 client_observation，不证明独立质量样本）。成功技术结果与单个 regenerate 不触发。相同 batch 已有诊断即去重；不建立每轮自动调用或另一个 scheduler。S06 以后任务调度仍沿现有 NativeTaskScheduler 与预算 authority。

## 生命周期、失败与删除

默认保留 30 天，可显式选择 1–365 天。feedback / diagnosis 都有 Host expiresAt；policy 缩短会收紧现有期限，延长不复活旧记录。消费时立即过滤过期数据；writable reconcile / purge 物理删除过期 feedback 及其 diagnosis，read-only 仅生成过滤后的 view，无存储写入。没有后台定时唤醒；不承诺关闭应用时准点物理清理。

`purgeSources` 显式选择原 S02 scope、1–365 天和每批 1–128 项；建议 30 天，按 evidence storage updatedAt / terminal task updatedAt 清理旧记录，原 source consumer 不擅自引入 TTL。只删除 completed / cancelled / taken_over Project task，保留 active / Review / pending commit；Project source / Git receipt 不被 retention 清理。重读 schema / integrity 后，expectedIntegrity 与原资源锁防止清理期间更新的 source 被删除，冲突单独计数。StorageEngine 可先加载全量 native kind 列表，limit 只约束删除批次，不声称扫描 IO 有硬上限。

原 evidence / task 显式删除先清除相关 feedback / diagnosis，再走原 deleteResource；Project 删除清除该 Project 的 ledger。原 evidence 尚存但 chat / Session / Project 已删除时下次消费 purge；source 已变时反馈与 diagnosis 标记 stale（writable 持久化），恢复旧来源不会自动重启已失效记录。未观察到的瞬时 source 修改不被 metadata hash 推断为已观察事件。FS 跨资源没有整体事务，evidence / task 清理失败阻止后续 source 删除；Project HTTP 原 authority 删除先完成、再清理任务 / ledger，后半步失败由下次消费按 missing source 清理；竞态或部分失败均在消费前重新校验，不向调用方返回 eligible 的旧 diagnosis。原 source authority 删除 / deleteUser / generic dump / restore / 迁移路径保留。

导出是显式 owner 操作，仅返回有限 feedback / diagnosis、refs、时间与适用性；不展开正文或私有执行状态。scope delete 删除整个 ledger；withdraw 留有限反馈历史、停止其使用；delete 物理清除对应内容。未来 candidate / report / publication 尚不存在，后续消费者必须使用同一 exact dependency 与撤回规则，不注册未来空资源。

## 本地最小验证

FS / SQLite 持久 reopen、CAS、纠正 / 撤回 / 删除、source invalidation、retention、owner / subject / Project 隔离、read-only、容量 / corruption、dump / restore / generic kind 与 HTTP consumer。复核 S03 capture、S04 recovery 与 S02 source 触及路径；没有新增反馈 UI，后续 S10 接完整产品控制；无 UI 修改，无真实模型 / 外部 DB / build / Android / 远程 CI 结论。

## 交付状态

S05 已完成；产品 Tested HEAD `caf662842941d3261dc1840242278f5529db10af`。本地五个相关 suites / 137 个不同 tests 通过，反馈 suite 33 tests；详细实际验证与限制见同一 [Record](../../../records/refactor/agent-intelligence-runtime.md)。下一正式阶段仅 S06。

## M1 后续契约补充（尚未实施）

U13确认的自动分析来源、零模型反馈供给、根因路由和v1/v2兼容计划见 [m1-feedback-evaluation §2–§5](m1-feedback-evaluation.md)。该模块是新逻辑字段的唯一设计来源；本模块继续管理原source/subject、容量、retention、CAS、撤回/删除/失效生命周期。v1现有实现仍是explicit/observation/technical与旧diagnosis，不因Plan增加类型就称已支持；assessment不冒充Host正式outcome，weak-only不取得确定方向。
