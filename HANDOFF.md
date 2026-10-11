# Atria Agent Intelligence Runtime — 新对话交接

> 2026-10-11 用户明确要求交接提示词并新建对话继续。本文替换旧设备迁移快照；历史快照仍在 Git。交接后本对话不继续工程或发起 API。恢复规则见 [Governance §7](README.md#7-handoff)，事实以实际 Git 和最新 Record 为准。

## 当前工作空间与状态

- Repository: `https://github.com/ZZZdragondYNGPHX/Atria.git`。
- source: `E:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`，branch `feat/agent-compute-runtime`，HEAD `84fca4a73e0a0b2ef2af74aa0dea7e5bd0c87fe1`；本地/远端一致、干净。
- docs: `E:/Dev/Atria-worktrees/docs`，branch `docs`，交接前 HEAD `b04c89380a0e109ec2d624bc7272261edf5d66e6`；本 HANDOFF 会另行提交/push，包含它的最新 HEAD 应实时核对，勿把交接前 HEAD 当最新。
- main: `E:/Dev/Atria`，HEAD `3ee1332ef113d4c57c65d9577222ba88d5171101`；干净、未merge/deploy。
- Shell: PowerShell；Node `E:/Dev/Node/node.exe`。Jest 用 source 下 `tests/node_modules/jest/bin/jest.js` 和 `tests/jest.config.json`，root node_modules 没有 Jest；ESM 跨绝对路径用 `file:///E:/...` / pathToFileURL。
- 当前无本任务仍在运行的测试/付费请求，也没有子agent。其它应用进程不属于本任务。

## 恢复读取路由

先 git status / HEAD，再本文 → [Plan index](plans/architecture/agent-intelligence-runtime/index.md) → [G01 当前有限清单](plans/architecture/agent-intelligence-runtime/g01-substrate.md#当前有限剩余清单2026-10-11) → [Record](records/refactor/agent-intelligence-runtime.md) 最新几组。当前主要模块为 compute-policy §3/§4/§5、model-routing §7/§8、delivery §8/§8.2、必要时 g05-transformers-embedding。只读当前组需要部分，不扫描全部历史/分支/Skills。

Record 最新节为 `2026-10-11 G04/G06 — 原 Session 声明 Task 的消息协议冷恢复与冗余工作修复`。旧 HANDOFF 所称未实施 Context/Skill 等、D: 路径及72982累计已过时，不据其重做或回退。

## 已交付，不重做

- M1/HM1 H0–H2 已入 main；M1/HM1 不重跑。S11–S14 有限 Goal source/同Task wake、用户/作者event出口及共享pane控制已push；Actor S15–S21尚未实施。
- 原 G01–G05 所选预算、Context/Prompt、RouteResolver、初始/按需 Skill、Hybrid corpus/hash/rank/pack、Native index insert/query/vector/list/delete/purge、原 checkpoint/公开 history 等有限消费者已交付。恢复不重置原 Run/Task bank。
- 实际既有 Transformers 模型 `Xenova/paraphrase-multilingual-MiniLM-L12-v2` 已通过原本地路径；256合法 H0 corpus/实际NN及source-valid reuse有有限证据。按原text批次计一个embedding_local job，每文本仍计items/bytes。原32-job schema没有提高。
- G06 已补 Project 历史时间解释、SSE reported model、Gemini Studio Task冷恢复与adaptive明确loss、三对实际流式时延、检索与Narrator同原Run bank（22jobs/一次实际generation）。均为有限实际出口，原质量/费用FAIL保持。
- 最新 `84fca4a73`：compiler复用nativeExecutionScope，只对声明Narrator Session Task编译固定history-use规则，恢复不重启已完成工具工作；未硬删调用、造cache结果或放宽权限。13新/8旧distinct定向检查PASS；compiler和Task测试/worker lint、diff PASS。P3测试仍有HEAD已有两处conditional-expect，未冒称整文件lint通过。
- 八项Anthropic/Gemini × FS/SQLite × task/adaptive本地独立Node冷恢复PASS；四missing checkpoint两policy均拒绝，不能自动套用Studio adaptive public-observation reset。原Session预算触发有界public summary reset是另一既有有限出口。
- 原Gemini Session Task实测v2两独立Node/two HTTP200、精确签名、冷只读结果不重读、同bank23jobs（22settled/1退出时charged）、two settled model attempts/direct1819，单次正式结果、重复无HTTP，Timeline/World保持。此前v1实际重复Skill/direct2062和generic child失败保留；second summary/header与最终bank缺失，offline audit仅据原raw补第二row，不造遗失事实。该探针不是500轮普通Narrator风格或独立盲评。

## 下一步：先本地复现可选检索与必要生成的额度争用，再补 G06 对照

1. 先收敛所选支持/验收矩阵，区分已经通过、真实FAIL、unknown、未启用/unavailable，避免把历史pending全当新工程。完整G06/M8/HM2仍未验收，M3必须保留G06前置。
2. 优先调查同一原Session/Run bank内，重复召回是否先花可选vector/hash/index额度，导致必要Context/Prompt/count/render/生成随后被拒绝。已实测冷检索+生成22jobs，另一有限暖检索9jobs、Host5jobs；`22+9+5=36 > 32` 只是跨报告推算，**尚未复现为真实故障**，不得先写成产品缺陷或PASS。
3. 沿既有 Hybrid / Native middleware / Host / 原预算与已有fixture本地复现，先冻结真实工作序列与有限出口；零外部API即可验证准入与费用。若确认缺口，复用原Invocation/compute authority做最小修复，使可选工作预算不足时能选择合法基础检索，并保留必要生成、来源守卫和已发生成本；不要扩大32-job schema、拆/重置bank、删除freshness guard、新建并行预算或凭空规定固定reserve。若没有缺口就保留证据，不为了推算造新机制。
4. 只对实际改动运行必要现有检查。然后沿原H0/原连接作仍缺的合法基础路径/有效复用/规则Invocation端到端配对，固定Source、角色frame、配置与原账本；先本地/预检，再显式新live opt-in。保持所有失败分母、实际usage/latency、controller未计量部分与unknown；无收益方案维持简单基线。已有signed cold/流式/M1/HM1不无故重跑。
5. 普通RP style-v2和Project Task/structured诊断分开评价。原500轮是预载Timeline，不是500次真实模型生成；n1和同H0多frame不变成独立样本。Project回合不证明当前World事件，Actor记忆/持有/愿意/履行无后续证据仍unknown。
6. 后续沿原正式S/G依赖持续推进；不要把每个有限组自动变成要求用户“继续”的阶段审批，也不要假报完整G06来进入M3。未启用classifier/prewarm/Local KV/decode/vector-LoRA不自动扩为当前必做。实际外部缺证据和正式阶段边界准确报告。

相关实现入口按需要：`public/scripts/agents/memory/hybrid-retrieval.js`、`invocation-policy.js`、`index-reuse.js`，`src/native/retrieval-compute.js`、`retrieval-execution.js`、`adapters/generation-host.js`、`run-control.js`，`public/shared/native-compute-budget.js` 与相关既有tests。core.load包含Package Regex/Knowledge编辑、projection/lifecycle验证，不能只换成HEAD read；500轮同bank实测完整检索332637.34ms不利开销原样保持，不启动泛化性能重构。

## 私有证据、累计与调用约束

- 当前私有根 `E:/Dev/Atria-Private/hm1-20261010`，raw/config/report/原quota在 `Document/`；keys只私下读取，不能输出或提交。旧恢复ZIP不能替代当前新增账本/失败证据；历史paid脚本不能因恢复自动执行。
- 原quota文件 `Document/m1-api-quota.json`，沿原 `tests/agent-intelligence/m1-quota.js`连续append；当前1709 admissions、carry `{requests:332, at:1791460574562}`。这是原本地累计，不猜gateway余额或当作终身cap。API硬上限**只有每日2000、20RPM**；不另设测试次数/token上限，不reset/split ledger。fixture/product预算仍按原authority有效且不可为绿灯扩大schema。
- M8当前实际generations87 / direct reported221710；原unknown2/upper17515与admission fetch0保持单列。M1/HM1 ledger hashes保持。真实金额、缓存计价、上游mapping、净收益缺证据；用户已经回复“目前没有，保留 unknown”，**不要再追问价格、填0或将缺价格当成停止所有技术工作的理由**。
- 最新private reports：`g06-shared-bank-h0-live-v1.json`，`g06-gemini-session-task-cold-live-v1.json` / `...live-v1-audit.json` / `...live-v2.json`；相关runner是只读参考，不重新执行已完成live。v2实际producer是旧HEAD55ad73d9+compilerSourceHash `1db8155c088b542b9ceac6d8c567a486cffd1bbc9027597fb5cf235a83dd6eb7`，已核对最终产品文件同hash，不能把旧实测producer改成新HEAD。
- 所有新实际生成仍只限原合成H0-ZH-08、`gcli.ggchan.dev/v1` / `gemini-3.8-flash`；Native Gemini消息路径沿已核对的`/v1beta`。不凭`/models`目录猜embedding/rerank能力；没有可用真实rerank/其它brand路径就记录unavailable。

## 授权与停止状态

用户已授权本任务code/test/docs push到原 `feat/agent-compute-runtime` 和 `docs`，不重复审批。保护无关用户修改、最小相关验证、不写新平台/平行报告体系、不上传private/keys/cache；不自行merge/deploy main，不创建子agent、新chat或Goal。按AGENTS.md和Governance执行。此次用户明确换对话，交接推送后本对话停止；新对话读取本文直接恢复。
