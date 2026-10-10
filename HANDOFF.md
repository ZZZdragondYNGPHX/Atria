# 换设备继续 M1、准备 H0 — 用户已暂停，M1 未通过

用户只需转移 `Atria-Document-private-20261010.zip` 及其 `.zip.sha256` 校验文件，并告诉接手 AI：**“校验并解压私有包，读取 docs/HANDOFF.md，继续 M1、准备 H0。”** Git、依赖、私有路径和恢复操作由接手 AI 完成。

- Task ID：`agent-intelligence-runtime`；Primary Workspace：`main`；Repository：`ZZZdragondYNGPHX/Atria`。
- 实现分支：`feat/agent-intelligence-runtime`，HEAD / origin 均为 `4bf78ff7748937eb233fc12e2fa40509a1ef348d`，已提交推送，工作树干净。
- main / origin/main：`6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`，工作树干净，feature未合入。
- docs：包含本次交接的最新提交已push；交接前基线 `f58698aa11a3472e8f276ef1d771724810314e07`，最终docs HEAD见包内 `MIGRATION-MANIFEST.json`。仅保护未跟踪目录 `plans/feat/agent-experience-evolution/`，保持原状并排除本任务提交/迁移包。
- Plan：[index](plans/architecture/agent-intelligence-runtime/index.md) → [feedback §17](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#17-2026-10-10-实测结论与有限来源更新提案) / [acceptance §1–§2](plans/architecture/agent-intelligence-runtime/m1-acceptance.md#1-验收语义) / [acceptance §14](plans/architecture/agent-intelligence-runtime/m1-acceptance.md#14-2026-10-09-当前主模型准入)。
- Record：[同一实施记录](records/refactor/agent-intelligence-runtime.md)，先读末尾“2026-10-10 用户要求换设备暂停与私有迁移”，按需回查前一节新材料包。

## 停止状态与实际结果

用户明确要求换设备暂停。当前F2资格批次自然退出、所有费用settle、私有fixture保存后停止；没有活跃M1/worker进程，pending0/lock0，没有新候选或新promotion/publication。M1工程S01–S10已完成，但实测验收未通过，main未集成。

累计 **1497 requests /10850633 accounted tokens**：1182 reported requests、63 unknown、252 historical carry。ledger内容hash `fa64d70643f1f5950cabc9fa2839ef2edac61cf7e2cb6e63b80955811844b56c`。未知上界、历史carry、不利结果及原费用全部保留；humanPreference=not_observed，currencyCost=unavailable。

当前run `run-1791614087966-32f919e6`，scope文件 `m1-f2-config-renewal-review-retry1-20261010.json`，scope hash `4ab2ecdbc0e55ca4d198e407942a78006a6103d854c2d67966b266605fc6b47f`。caseSetRevision `661f990e145ad5c3f089f3f0becfb80d11d3c63f58eff8ce047ceb47a4363df4`；evaluatorRevision `51742d8cbb18e8782f71d43db40406b7426a85c2b5aa599332b4695460688791`；runnerRevision `65e5d58771968992244e81c9f61984526921ce41e65347089354dd96cd826c76`。完整私有只读审计：`m1-device-pause-audit-20261010-complete.json`。

- RP：五source控制/六原比较控制有效；三真实baseline原checks完整。新high source判断d1 knowledge gap、d2六维met、d3 knowledge与player_agency gap；两条gap，primary_observed_gap，免费F3来源门qualified。
- Project：六比较/四source控制exact旧协议复用；三真实baseline全部完成、原checks完整。d1复用原试验，d2/d3契约修正版新执行。随后第一条source assessment在请求编译阶段报 `generation_context_budget_exceeded`，没有该assessment付费请求，尚无完整语义资格/至少两gap结论。异常不属于baseline生成失败。
- 最新输出完整性修复本地检查：F2 sources28 + renewal11 + F3 38，共77项通过；此前原worker/归档/生命周期工程检查保留。没有新全量测试、build、UI、模型性能或H0基准。

旧有效未达标结果保持：Project旧冻结候选九promotion五胜/四tie、六维非负；RP旧包development一胜/两tie、六维非负。旧双模型失败、low新包RP零gap、Project旧字段契约错误、不完整控制和unknown响应均为历史证据，不覆盖或改分。

## 新有限包与隔离

用户已授权每域三development、新密封三promotion、每域一个新候选；不要再次要求独立作者许可或重新抽样凑通过。独立作者已完成且只接收公共契约，没有候选/development输出/promotion评分；三密封Project字段契约复核通过，七文件字节保持。

密封metadata：`m1-renewal-20261010/sealed/metadata.json`，文件SHA-256 `a95f541612246ee9636688b6758a760e7892508aca3587e4f4f21d187e27334b`。原runner目录 `m1-f2-sealed-renewal-20261010`，六pin已免费核对。**候选开发侧只读metadata/hash；正文仅供原evaluator worker读取，不能作为上下文预算修复或提炼材料。**

原catalogue、首次新包及契约修正版都保留。Project修正只澄清实际有序 `knowledgeBindingIds`，不存在独立primary-binding字段。RP资格协议核对描述名词/未见内容存在性/玩家姿态，显式完整quoteRef清单与行数，原parser不补判断；source high与原comparison low分别固定。F3另须八项同协议真实比较控制，不以F2替代。

## 恢复与下一行动

1. 校验ZIP外部SHA-256及包内逐文件清单，使用包内 `RESTORE.py` 解压到新/空目录；定位 `Document`。拉取source/docs并核对实际Git，保护新设备已有dirty或更新提交；依锁文件恢复source/tests依赖。私有数据和凭证不进Git、不打印密钥。
2. 先核对无pending/锁和最终审计，保留原账目、quota/rate/transport历史。原辅助脚本含旧设备路径，使用副本或 `ATRIA_M1_SOURCE` 适配；不全文替换原报告、冻结scope、密封材料或收费身份。旧scope固定历史HEAD，不能直接拿来重跑当前代码。
3. 先定位Project **source assessment** 证据编码与原context预算问题。完整三baseline已保存于当前run的 `project-prompt-source-probe.json`，不要重复生成不变baseline；必须按原配置/输入/权限及原owner/shared receipt逐项核对复用。孤立partial pair不带charges，优先用完整report，不从partial捏造收费。保留错误，不裁掉必需证据、改分、增抽来源或读密封正文。
4. 资格协议/transport变更后重测对应控制/语义观察；不变且exact身份完整的已付费控制可复用。每域提炼前须至少两条实际gap。达标后每域只提炼一个新候选；原六维、两development胜/六promotion胜、三独立case各三次及review→真实下一请求消费→guarded rollback保持，原human/price生产auto gate不变。
5. 后续发送前核对journal容量和publication最多120条reservationIds。原 `continueF3Promotion` 已支持同冻结候选的新native job；development/promotion分阶段接线尚未实施，须保留两阶段完整报告与费用，不扩大guard或遗漏receipts。大promotion报告已有test-only无损归档及真实FS合成生命周期检查；真实发布/消费/rollback仍待取得。
6. 两入口原M1实测出口完整通过后才集成main，再按正式路线继续。H0只读准备可继续，H1/H2产品实施依赖M1验收及集成。

## H0 准备

[h0-baseline](plans/architecture/agent-intelligence-runtime/h0-baseline.md) 已准备ordinary RP/Game/Package三调用图、旧LLM/RAG删除/保留清单、原生来源/派生存储核对及B0规格。[h0-samples.json](plans/architecture/agent-intelligence-runtime/h0-samples.json) 八项中文逻辑样本，共519条来源/193348 bytes，SHA-256 `ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`。尚未接产品source adapter或运行H0 B0/Actor/Branch/Timeline/Variant实际消费、检索/性能基准，H0完整出口和H1/H2未完成。

H0路由：index → [decisions §9](plans/architecture/agent-intelligence-runtime/decisions.md#9-d5--hybrid-cognitive-memory-20-正式采纳) / [delivery §8.2](plans/architecture/agent-intelligence-runtime/delivery.md#82-hybrid-memory有限交付组与依赖) / [hybrid-memory](plans/architecture/agent-intelligence-runtime/hybrid-memory.md) → [baseline §10](plans/architecture/agent-intelligence-runtime/baseline.md#10-d5hybrid-memory-整合时的实际基线) / h0-baseline；其它模块按当前问题读取。八项产品决定冻结，统一Hybrid Memory、原World/Actor/Memory/Context/Simulation/Compute/Eval authority保持，未实施或未验证的收益继续如实标注。

接手提示词：**校验并解压 Atria-Document-private-20261010.zip，读取 docs/HANDOFF.md，继续 M1、准备 H0。请自主核对Git、恢复依赖与私有路径；先修复Project来源语义评估的上下文预算问题，复用已完成的六条正确baseline，保持新密封隔离与原验收门槛。M1未通过，不直接重跑旧scope或合入main。**
