# Live HANDOFF — Agent Intelligence Runtime

> 2026-10-09 本地/远端整理已完成本地集成，存储同步待最终核对。本地主导、远端仅存储，Actions 全部停用；验证以 [Governance §12](README.md#12-execution-adapters) 为准。整理结果见 [local-first-normalization Record](records/fix/local-first-normalization.md)。Runtime 仍只续当前 M1/F2，不因治理整理进入下一阶段或集成 main。

- Task ID: `agent-intelligence-runtime`
- Updated: 2026-10-09
- 当前任务：M1；F1 工程已完成，F2 评价/source 仍待验收，F3 未开始。M1 pending，main 尚未集成。
- 本轮整理时观察到的产品 HEAD：`feat/agent-intelligence-runtime@4638b1f9c`；包含并行工程提交及治理入口更新，不声称该 HEAD 已完成新的 F2 实证验收。分支仍可能继续前进，开始前核对实际本地 Git 并保护现有修改。
- 稳定 main：`cfbe51eda`（治理入口统一、Actions 工作流移除及相关检查依赖清理；Runtime 产品实现尚未集成）。
- 最近已记录的真实执行：run-1791524899036-18298dde 新增 21 请求 / 62624 tokens，其后一次 transport_failed 保留 11631 上界，最新记录累计 805 / 3154587、unknown18/86579、pending0。这是上次结果，不宣称当前私有账目仍精确相同；不把历史累计当 API 终身额度。
- 文档当前规则：[Governance §13.1](README.md#131-api-测试执行规则) → [Plan index](plans/architecture/agent-intelligence-runtime/index.md) → [acceptance §0](plans/architecture/agent-intelligence-runtime/m1-acceptance.md#0-当前-api-测试规则覆盖全部历史封包) / [feedback §7](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#7-成本调用范围与失败处理) → [Record 最新节](records/refactor/agent-intelligence-runtime.md)。旧 acceptance/feedback 执行封包仅供定位具体历史问题。

## 当前 API 测试执行

用户最新硬限制仅每日 2000 次调用、20 RPM，发送端自动计数与排队/等待。取消累计 1000、封包 60/72、Step 12/18/24、token/输出配额、逐轮次数许可与人工额度审计。已授权当前阶段内必要探测、诊断、修复及复测继续推进，不因旧 breach/stop/claim 停工或另请豁免；保留真实结果，生产权限与正式阶段边界保持。

## 当前证据与下一工作

最新并行产品 0479f5bd3e924c6031b09eaa4103e28684bc086a 修复 F2 retry0 误用 timeout/4（75 秒）的问题，改用原 Route 300000ms 完整单次 deadline。一次 transport_failed 未取得 usage，保留 11631 上界；最新记录累计 805 / 3154587、unknown18/86579、pending0，复用原 21 个已完成请求证据。必要修复复测按当前规则继续，旧 claim/首失败撤销不增加次数许可或停测条件。

RP 12/12 双 judge / 两顺序 controls 通过，三个 baseline 的 hard checks 通过；语义 headroom 尚未建立。Project 第四次校准的解释 552 > parser 512，旧 runner 首失败停止；其方向与六维符号正确，不能称质量退步。产品 ac0344879 已增加明确 512 输出提示和基线证据核对；最新 dd80d8583 又修复 quote 换行在 JSON 表示层被误拒绝的问题，复用已完成 RP 12 controls/3 baseline/首份有效观察，必要后续不重复这些请求。source/config/parser 问题须沿原消费者定位、修复并做必要真实复测，不直接以一次无效结果交接收尾。

沿现有 `tests/agent-intelligence/m1-live.mjs`、ledger/quota/rate 与私有 Document 继续 F2。先保护当前工作树改动，清理原消费者中残留的 token/封包/Step permission/历史 stop guard，保持真实 source/configuration/request/usage 记录。正常运行不要求每轮逐字重建账本或提交许可文件。频率达到限制等待，日额度用尽等待恢复；确需用户权限/Provider 配置才请求介入。

六 development synthetic 与六独立 promotion metadata 保留，promotion 正文/答案不回流开发；legacy12/case revision、质量维度和 production gate 不因测试限额清理降级。原 raw/partial/失败与累计统计保留，不伪造验收通过。F2 正式阶段完成后更新同一 Record / HANDOFF 并停止，不自动进入 F3/S11/G 或集成 main。

本轮整理未执行真实 API、产品全量 tests/build、CI、UI 或 Android/实机验证；实际验证见整理 Record。未修改并行产品逻辑或私有数据；企划工作树的五份原 CRLF dirty 与三份未跟踪草稿内容保持。正式 docs 目录为 `Atria-worktrees/docs`，Runtime 实现为 `Atria-worktrees/tasks/agent-intelligence-runtime/source`，企划辅助为同任务 `docs`；机器绝对路径与迁移证据只保存在本地 Git 配置目录。

接手提示词：**先核对 actual Git 并保护现有修改，再读 Governance §13.1 → 本 HANDOFF → index → acceptance §0 / feedback §7 → 同一 Record 最新节。当前只续 M1/F2，沿原测试消费者清理额外限额与逐轮许可，必要诊断、修复、复测持续推进；API 硬限只有每日 2000 / 20 RPM，由发送端自动执行。历史 1000/60/72/Step/token/breach/stop/claim 不恢复为当前配额；不逐轮人工审计，不要求用户手测，保持真实验收与独立来源边界。**
