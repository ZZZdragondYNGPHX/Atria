# S03：可靠 RP 捕获与公共持久层

本阶段沿 S02 来源 authority 增加 metadata-only EvidenceRecord v1，不捕获 Prompt、工具参数、结果全文或 credentials。后续 S04 的 Project task 持久恢复已交付，详细契约见 [s04-project-recovery.md](s04-project-recovery.md)；反馈、容量与 retention 产品策略在 S05。

## 持久契约

注册 `atri_agent_evidence`，key 为 authenticated `handle` + SHA-256 `evidenceId`（scope + rootRunId）；FS 使用既有 nativeResources kind/hash JSON，SQL 使用既有 native_resources 表。Document 包含 schemaVersion、scope、rootRunId、origin（client_observation / host）、sequence、status、trace、sources、outcome、outputRef。owner 由 storage key 决定，record 本身不内嵌 owner；S02 sources 自带 owner，跨账户消费仍须重新捕获来源。

begin 先持久化 capturing marker；更新按同一资源锁 / integrity CAS 写排序。每次快照 sequence 单调，旧更新拒绝，相同更新可幂等重放。未知版本 / 额外字段 / hash corruption 拒绝。读取 capturing marker 明确 incomplete，Host 重启不自动重做 generation 或 authority effect。FS 只支持单 Host writer，不声称跨进程 compare-and-write 原子性。

Trace 有限 512 events / 256 KiB，仅保留 identity、状态、generation、step、effect、parent、request、attempt、lane、usage 等 allowlist。不能序列化、重复 identity 内容冲突、容量不足逐项记 missing 计数 / 固定 reason；没有事件也 incomplete。event sequence 保留观察顺序，不冒充上游尝试编号。浏览器 transport / storage 失败在 run evidenceCapture 中可检查，不能被 projection event bus 吞掉而计 complete。

## 来源与执行边界

普通 RP 绑定运行开始时的 chat / source message，结束重读同一来源；Director 的输出消息 / variant 仅在原 chat 已持久化且内容匹配时取得 S02 source ref；独立 outputRef 不能借用开始时的 user input。GENERATION_ENDED 与 bind 的先后均沿同一次冻结绑定串行提交；capsule-only / 其它未绑定正文模式、legacy 无 source ID 保留 incomplete。缺失 / 取消 / placeholder 未保存明确 incomplete，不借用下一次生成的 variant。客户端轨迹永远是 client_observation，不能声明 host outcome。

Native executeTurn / standalone executeTask 在调度前保存 marker；每次新执行使用 invocation + UUID 的 root，失败重试不重写旧 trace；相同并发请求共享 capture，已存在正式 receipt 的重放只走原幂等路径。沿既有 scheduler、provider send/retry、SessionCore finalization 自动采集。每个 send 有独立本地 attempt identity，原 scheduler operationId 作为 effect 关联，role / request / root / foreground-background 可归因。Native attemptScope=provider_send；浏览器 attemptScope=host_facade 仅表示已观察到的 facade 调用，未观察到的 upstream 内部 retry 不伪装完整。OpenAI-compatible / Anthropic / Gemini parser 保留最终直接报告的 usage；缺失为 null，不将 subdivisions 加到 total，不推断 Anthropic total 或价格。outcome.kind=turn 仅由 Host 使用正式返回 snapshot 的 task receipt / message active variant / branch / revision 生成；kind=task 绑定原 task receipt hash 与当前 branch / revision，不展开 operation artifact，不推断 message authority。后续消费继续走 S02 currentness 重验。正式写入成功后 evidence 失败不能诱发 authority 重放，返回独立 failed capture 状态；pending marker仍可恢复检查。

Director bridge 返回同一次 loop 的 metadata trace，并绑定传入 turn anchor；不返回 null，不从 finalProse 推断 authority 成功。原 UI projection / checkpoint / result authority 保持职责，捕获不增加模型调用。

## Authenticated consumer

`POST /api/native/generation/evidence/{begin,update,inspect,delete}` 复用原 generation router / authenticated handle / StorageEngine；no-store。浏览器不能指定 owner / host origin / outcome；RP begin 和 output update 均由服务重新捕获 S02 exact ref / hash。inspect 默认 metadata-only，消费仍重验 source currentness；来源 hash 不授予 mutation / publication。输出绑定不接受同 ID 的新内容、不同 floor / variant 或未保存消息。现有 S02 有限 source / byte / scan 预算沿用；trace 不保存 raw body。

## 兼容、迁移、删除与验证

Additive kind，无历史 backfill、无 SQL DDL / 存储版本升级。原 native kind 遍历覆盖 list / migration / backup dump / restore；删除记录走原 transaction deleteResource，用户删除保持原 engine/user-directory 语义。来源删除使消费失效，S05 再交付级联 lesson / feedback 与 retention。撤回新增 subscriber / kind consumer 即可，旧运行继续原路径。

最小本地验证覆盖 FS / SQLite durable reopen / CAS / corrupt / unknown schema / read-only / roundtrip，以及 registry key 与 MySQL/Postgres generic handler contract；无外部 DB 服务。RP 实际 Runtime / Director root-child / 取消 / late events / bridge；Native 使用现有 isolated generation / Session fixtures，验证 request retry 与正式 receipt 分开、保存失败不重做 effect。没有真实模型或行为收益验收。

Reasoning Continuity 的详细规则仍由 [model-routing §7](model-routing.md#7-reasoning-continuity执行状态与生命周期) 管理；本 EvidenceRecord 不保存 opaque continuation payload，M8 / G01–G06 未提前实施。此阶段不增加模型调用； captured 仅代表当前 metadata / 来源关联，不等同真实行为质量或晋升资格。
