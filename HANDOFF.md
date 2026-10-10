# H0 / HM1 换设备恢复快照

本快照用于换设备续接。M1已完成；下一有限交付组为HM1（H0→H1→H2）。实际Git与最新Plan/Record优先，执行和测试规则统一见[Governance](README.md)。

- Task ID：`agent-intelligence-runtime`；Primary Workspace：`main`。
- Repository：`ZZZdragondYNGPHX/Atria`，main/origin main：`ea75b76be4927e881de2f0be7c304a56301f1f83`，已推送、干净。
- docs：本次交接提交已推送；实际docs HEAD见包内`MIGRATION-MANIFEST.json`。交接前HEAD为`f71d90f84bf0d39efaec532feb80cfac64f5cf7c`。
- 旧`feat/agent-intelligence-runtime`已合并并删除，本任务临时source/evidence工作树已清理；新设备从最新main建立HM1任务工作树，不恢复旧任务分支。
- Plan：[index](plans/architecture/agent-intelligence-runtime/index.md) → [delivery §8.2](plans/architecture/agent-intelligence-runtime/delivery.md#82-hybrid-memory有限交付组与依赖) / [hybrid-memory](plans/architecture/agent-intelligence-runtime/hybrid-memory.md) / [H0](plans/architecture/agent-intelligence-runtime/h0-baseline.md)。
- Record：[同一记录](records/refactor/agent-intelligence-runtime.md)，最新M1完整交付节及本次换机节。

## 已完成与未完成

M1实际出口通过：Project开发三胜、独立九胜；RP开发三胜、独立三胜，六维无负差。RP三公开回复完整152条来源核验六维met；两域native发布、下一真实请求精确消费与guarded rollback通过，分别完整绑定149与16条promotion receipt。最后RPrun `run-1791637497806-f6febf72`，Project lifecycle run `run-1791628254014-548d8408`；完整证据见私有`Document/local-m1-completion-proof-20261010.json`与原报告。旧不利结果、invalid、unknown、carry均保留。

H0已完成只读准备：三调用图、旧Recall删除/保留清单、原生数据/派生存储核对、B0规格及八项中文冻结样本；519条来源、193348 bytes，SHA-256 `ef9a584cfde78f5bc60e43914e1eb676d3530df4398e903f56afabb0631e6eeb`。尚未接产品source/Information/Context adapter、运行B0或三路径实际消费/检索/性能基准，H0完整出口与H1/H2未完成。

## 私有恢复

- 新包：`Atria-Document-private-H0-20261010.zip`及同名`.zip.sha256`，包含当前完整Document、恢复脚本、逐文件清单和本快照；包包含真实凭证，私下转移。
- 校验外部SHA与`MIGRATION-MANIFEST.json`，使用`RESTORE.py`解压到新的空私有目录。按Unix目录700/文件600或等效权限恢复。
- 先获取最新远端main/docs，核对dirty状态，按源码根目录与tests的锁文件恢复依赖；不将旧设备绝对路径当固定路径。
- 继续使用原private ledger、API quota/rate/transport状态；1894 requests /15671701 accounted tokens，1578 reported、64 unknown、252 historical carry，pending0/lock0。迁移不重置窗口、费用或配额。humanPreference未观测、currencyCost unavailable；生产自动发布规则保持。
- 不执行包内历史脚本作为自动启动，不直接重跑旧scope；历史脚本适配只改副本/运行路径，原report、receipt、scope、密封字节保持。密封M1材料不属于H0开发输入，正文仅供原评测worker读取。

## 下一行动

1. 读index、delivery §8.2、decisions §9、hybrid-memory §1–4/§7–8、baseline §10和h0-baseline §7，核对最新main及实际消费者。
2. 从最新main开始HM1；先把冻结逻辑样本适配原source/Information/Context authority，并保存未过滤原始合成来源和标签。
3. 用隔离临时source/graph与本地受控retrieval service跑当前算法B0。`readOnly`不阻止向量服务写入，不连接用户原collection。不要在adapter预先实现H1过滤或H2算法来美化B0。
4. 完成source/Actor/Branch/Timeline/Variant确定性反例和ordinary RP/Game/Package三路径实际消费，分别保存source、retrieval、正文应用与费用/时延观察；缺失明确未测，不把静态风险写成实际泄露。
5. H0后按正式范围继续H1唯一Recall/前置eligibility与旧模式硬切换、H2中文查询/有界融合/完整packing。每阶段仅做最小相关本地验证；有限交付组完成后按治理更新Record/Plan、集成main、推送和清理。

## 新设备提示词

校验并解压 Atria-Document-private-H0-20261010.zip，读取最新 docs 分支的 HANDOFF.md，从最新 main 继续 HM1（H0→H1→H2）。M1 已完成并合入 main，不重跑 M1。先完成 H0：将冻结的八项中文样本接入原 source/Information/Context fixture，在隔离临时存储和本地检索服务上运行 B0、source/Actor/Branch/Timeline/Variant 反例及 ordinary RP/Game/Package 三路径实际消费，保留真实基线、原始结果和费用。H0 完成后按 delivery §8.2 继续 H1/H2，完成这个有限交付组。自主核对 Git、恢复依赖与私有路径，保护无关改动；每阶段和完成时只做最小相关本地验证。API 只遵循每日 2000 次、20 RPM，不新增审批或因阶段、批次、候选失败停工。
