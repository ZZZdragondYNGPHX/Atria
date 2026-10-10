# G01：执行路径证据与 M8 有限实施矩阵

> 2026-10-10 从 HM1 main `3ee1332ef` 进入 M8，source checkpoint `c62ecc937`。G01 当前基础 checkpoint 已实现；完整 M8 / HM2 未验收。阶段职责以 delivery §8 和 model-routing 为准，执行规则只引用 Governance。

## 已冻结的工程范围

- 复用原 ConnectionProfile、ModelProfile（Callable Target）、RuntimeRoute、VersionedJsonResourceHandler 和 StorageEngine。不新增 profile registry、发送器或 dependency authority。
- Model CapabilityDecision 可附 v1 binding：owner/account/endpoint/target/adapter/transport/options 的 canonical path fingerprint，observedAt/expiresAt、declared/verified。它不把模型字符串当 canonical upstream identity。
- Verified 发布仅接受服务端 adapter observation 的非 JSON marker；普通配置不可伪造。既有 exact 观测可原样保留，改 endpoint/account/model 时仍须消费路径核验。来源缺失、过期或改路径降 unknown；当前明确 unsupported 优先。配置与 runtime 预览不自行 probe。
- 原 Route 可选 executionPolicy v1：有限目标 allowlist（1–16）、verified requirements、continuity 与 reuse 许可。旧无该字段的 Route 原样精确读取，不迁移 Package、Prompt、Generation refs。政策决定和非秘密证据随原 EffectiveRequestSnapshot 固定。
- 当前 continuation consumer 仅 none；active_execution/task/adaptive 已严格识别但 unavailable，不能凭字段可构造宣布能力。原生 handle、lineage、完整 block/签名与 restore/delete 的实际消费者在 G04 补齐后才可启用。
- 价格、实际上游与网关内 retries 未知时明确 unknown；三层 cache 分开。不用用户声明或 adapter metadata 冒充 gateway measurements。

## 本地支持矩阵与继续顺序

| 对象 | 当前已验证 | 未验证 / 下一消费者 |
| --- | --- | --- |
| 原 registry | FS 精确读写、SQLite 真实 dump/restore | 本轮未跑 MySQL/Postgres；codec/key 未变化 |
| 基础执行 | 原 OpenAI-compatible/raw-text Core 52项保留 | G02 compiler binding、G03 failure/reuse、G05 charge |
| Path evidence | 新10项：失效、账号/路径、send前过期、不可伪造、SQL恢复 | G04 真实 adapter/probe observation |
| Continuation | none；其它模式发送前拒绝 | G04 按 delivery 原生协议顺序，不以兼容接口假充实现 |
| HM2 | 不开启深检索或缓存 | H3/H4 继续等待相应 G 消费者和 G06 实测 |

具体结果与失败修复保留在同一 Record。G02 沿原 Prompt Module target 保护 behavior/character/style/context，canonical 仅处理结构化 JSON、保留 history/tool/opaque 顺序；G03 沿原 artifact authority 校验；G04 沿原 Provider Port；G05 沿原 RunControl/send；G06 最终评价。不存在跨阶段停工或另加 API 审批。
