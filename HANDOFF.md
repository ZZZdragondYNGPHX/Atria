# Atria Agent Intelligence Runtime — 换设备交接

> 2026-10-12 用户明确要求找合适边界停止并换设备。六个新实际配对已完成、代码已push；本对话只完成交接与docs同步，不再发起工程/API。恢复规则见 [Governance §7](README.md#7-handoff)，事实以Git和最新Record为准。

## 当前 Git 与恢复读取路由

- Task ID：`agent-intelligence-runtime`。
- source：`E:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`；branch `feat/agent-compute-runtime`；HEAD `5a80e1563b1e9db4150da98d0096bdc61704d3f9`，本地/远端一致，干净。
- docs：`E:/Dev/Atria-worktrees/docs`；branch `docs`。本次交接前HEAD `b881ae982f9f8d9ad3505765185e467f1686e181`，本HANDOFF/Record/Plan另行提交push；包含本文的实际最新HEAD实时核对，不把旧HEAD当当前。
- main：`E:/Dev/Atria`；HEAD `3ee1332ef113d4c57c65d9577222ba88d5171101`；本任务未merge/deploy。
- 当前没有本任务运行中的测试/付费请求，没有子agent/new chat/Goal。其它应用进程不属于本任务。
- PowerShell；Node `E:/Dev/Node/node.exe`。Jest在source的`tests/node_modules/jest/bin/jest.js`，config `tests/jest.config.json`；root node_modules没有Jest。Windows跨绝对路径ESM用pathToFileURL/file URL。

恢复先核对git status/HEAD，再依次读本文 → [Plan index](plans/architecture/agent-intelligence-runtime/index.md) → [G01当前有限清单](plans/architecture/agent-intelligence-runtime/g01-substrate.md#当前有限剩余清单2026-10-11)（状态已更新2026-10-12，锚点保留）→ [Record](records/refactor/agent-intelligence-runtime.md)最新两节：

1. `2026-10-12 G05/G06 — 同 bank 重复召回争用复现与基础覆盖 Invocation`。
2. `2026-10-12 G06 — 原 H0 双入口基础/有效复用/规则三臂实际配对与换设备停止`。

当前相关模块为compute-policy §3/§4/§5、execution-reuse §7、model-routing §7/§8、delivery §8/§8.2；按当前组需要读取。不要扫描所有历史、分支或Skills。

## 本次已完成，恢复不重跑

- `5a80e156`已push：沿原memoryInvocationDecision增加有限vector选择，精确source-valid corpus复用且重新排序/装包的基础证据覆盖请求时，选择`source_valid_base_coverage`，跳过重复可选hash/vector/index。承诺提示复用原memorySemanticHints，typed位置/持有沿原predicate；因果不冒称覆盖。
- 已**本地复现**同一原Session bank的有限真实争用：原H0/256合法corpus、实际middleware/Vectra/Host、受控ONNX与生成输出；17检索+5Host=22，再暖检索9=31，第二Host的route_resolve到32，context_build拒绝，第二模型attempt未发生。外部API零。这不同于此前跨报告推算，也不是宣称真实NN/外部第二生成中已复现。
- 修复后Session/Project各两次生成共30jobs：原22保留，第二召回3必要jobs+Host5；所需s08-020保持，无新增pipeline。第三召回必要pack仍按原32上限拒绝，旧成本/两settled attempts保留。来源编辑后返回proof拒绝。
- 最终30distinct相关checks PASS（8新+22受影响旧）；两个production模块/两个test文件lint，main.js trace两处node --check，diff通过。不冒称整份main.js lint/浏览器验收；未重复原11项Transformers、Session Task签名冷恢复、M1/HM1或全仓组。
- 初次复现因fixture JSON100KiB限额拒绝，调整该fixture为2MiB后复现成立；扩大两入口时fixture的kind:undefined触发JSON hash失败，删该非JSON字段后通过。原失败日志保留，未改产品budget/schema。最初indent lint失败已必要修正/复验。
- 原H0-ZH-08双入口base/corpus reuse/rule Invocation六个新实际HTTP200已完成。来源s08-020/001/002与packet/evidence逐臂一致、正文fresh；每个入口三臂共用其原bank，最终各27jobs（12client unknown+15server settled）/3settled模型attempt。reuse准备/校验的3jobs也计同bank，逐臂8/19/27，不免费清账。初始实验Route maxRequests3/maxTokens64000、local32/4096/16MiB；不扩大已存在bank。
- 新实际6generations/direct11877；Session三臂total1732/1730/1739、input均1682，Project2332/2080/2264、input均1721。total差值不推reasoning/cache。n1、顺序执行、同H0和controller未计量不能证明延迟/金额收益。World/Timeline保持。
- 六输出有限历史/当前记忆unknown及不替玩家行动项通过；Project三条只读有限事实项通过。**Session reuse/invocation两条添加了无World依据的“港口的风平浪静”，质量FAIL保留**。当前World fixture只有hp/location=harbor，无weather支持；style-v2已禁止添加天气，不能用“是否记得未知”抵消另一个无依据断言。没有独立盲评或总体质量晋升。

## 之前已交付组与阶段边界

- M1/HM1已入main；M1/HM1不重跑。S11–S14有限Goal/source/wake/event/共享pane已push，S15–S21尚未实施。
- 原G01–G05所选预算、Context/Prompt、RouteResolver、Native/Studio初始及按需Skill、Hybrid corpus/hash/rank/pack、Native index insert/query/vector/list/delete/purge及原checkpoint/history消费者已交付；bootstrap source/owner/首Route/config等仍有明确未计量边界。
- 原Transformers `Xenova/paraphrase-multilingual-MiniLM-L12-v2`实际本地路径/256合法H0 NN有限消费者已完成；每原text批次一embedding_local job、逐text items/bytes，32-job schema没有提高。已完成实际NN组不因交接重发。
- `84fca4a73`原Session Task compiler history-use policy及21定向checks、Anthropic/Gemini × FS/SQLite × task/adaptive独立Node冷恢复已完成；missing checkpoint原拒绝保持。原Gemini v2两独立Node/two HTTP200、exact signed parts、一次Skill read/冷不重读、同bank23jobs/direct1819及正式结果/重复无send已完成。
- 原Gemini v1重复Skill/direct2062、冷child失败、第二summary/header和最终bank缺失仍保留；独立offline audit只从原raw补第二row，不造遗失事实。原signed Task探针不是500轮普通Narrator风格或独立盲评。
- 真实Provider native compaction/copy、Anthropic实际连接、真实rerank/其它brand、cache计价/上游映射缺支持证据，保持unavailable/unknown；未启用classifier/prewarm/Local KV/decode/vector-LoRA不是本轮自动必做。
- 完整G06/M8/HM2未验收，**M3的G06前置保持**，不能用有限协议或局部PASS宣布验收。

## 下一步按企划继续，非逐组审批

1. 本次重复召回争用与六臂实际配对已结束，不再先做22+9+5的推算或重跑旧组。保留有限规则边界：冷/失效/无证明、装包覆盖不足、显式rebuild、无本地限额沿原路径；它不承诺任意连续请求必有余额。
2. 当前明确新质量缺口是Session两个正文的无依据天气。先核对原raw/normalized/current World/style-v2，区分作者frame与compiler事实authority；再沿原精确PromptModule/system.style或有证据的最小consumer修改做受影响诊断。**style-v3尚未编写/实施，未发送其复验**，不要把讨论方向当已完成。不要全局删除创造性、改写输出或补造World来制造PASS。
3. 新实际只限原合成H0-ZH-08、原gcli/gemini-3.8-flash，先本地/显式preflight再新live opt-in。固定source/角色frame/config/bank，保留失败分母、usage/unknown/controller成本；不无故重复已通过Project/Session Task冷恢复/M1/HM1。
4. 完整G06按delivery及compute-policy评价所选已支持矩阵、质量/复用/规则出口与已知开销。真实外部未知单列，不为价格unknown停掉所有技术工作，也不冒称货币/Provider cache/总体收益通过。沿依赖推进；未验收G06不进入M3。
5. 普通RP style与Project Task/structured诊断分开；原500轮是预载Timeline，不是500次模型生成。n1/同H0多frame不是独立案例；Actor记忆/持有/意愿/履行仍需后续证据，不据历史承诺推现在。

禁止为通过提高32-job schema、重置/拆bank、删除freshness守卫、新建平行budget或凭空固定reserve。实际source/Information/Actor/Branch/World guard保持，先满足必要工作；原成本/失败不得退款覆盖。core.load含Package Regex/Knowledge/projection/lifecycle验证，不能以HEAD-only替代，也不启动泛化性能重构。

## 私有证据、账本与设备迁移

- 当前私有根：`E:/Dev/Atria-Private/hm1-20261010`。必须迁移**当前整个私有根**（至少Document当前材料/账本/配置及根级runner/audit脚本）；旧恢复ZIP没有本次新增材料，不能替代。
- 新runner `run-g06-base-reuse-invocation-h0.mjs`及Document下 `g06-base-reuse-invocation-h0-preflight-v1.json`、`...live-v1.json`、对应raw request/response/normalized、preflight-v1/v2与live日志。
- 本地本次证据为 `g06-bank-contention-before-v1/v2.log`、`...after-v1/v2/v3/v4.log`、`...graph-v1.log`、`...scope-v1.log`。保留所有初次失败；它们不在Git。
- 本次live producer为干净source `5a80e156`，production四file hashes固定在report。已完成runner默认preflight且append-only report存在则拒绝，历史paid脚本**不得恢复时自动执行**。
- 原quota `Document/m1-api-quota.json` 沿原 `tests/agent-intelligence/m1-quota.js`连续append；当前1715 admissions，carry `{requests:332,at:1791460574562}`保持。硬上限**只有每日2000、20RPM**；不要猜gateway余额、增设终身cap、清零或拆quota。
- M8当前actual93/direct233587，原unknown2/upper17515及admission fetch0单列；M1/HM1 ledger hashes保持。用户已确认“目前没有，保留unknown”，不要再问价格、填0或据此停所有技术工作。
- keys仅私下从配置读取，不能输出、提交或上传private/credentials/cache。模型资产缓存可选迁移；任何再下载/实际推理按原已授权路径和额度，不当成免费。

## 授权和本次停止

已授权继续原S/G、必要本地检查/实际复验、push原 `feat/agent-compute-runtime`/`docs`；无需逐组请求继续。保护无关修改，最小验证，不自行merge/deploy main，不创建子agent、新chat或Goal。用户随后明确要求换设备停止，本对话在代码/六臂完成和交接同步后停止；恢复会撤销本次停工要求，按本文继续。
