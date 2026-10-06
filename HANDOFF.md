# Live HANDOFF — Agent Intelligence Runtime

## Task / current state

- Task ID: `agent-intelligence-runtime`；Primary Workspace: `main`。
- Product branch / HEAD: `feat/agent-intelligence-runtime@9b5cb5740e2af7cab8b83b9675576ea01c4f4527`；已 commit / push，origin 同 HEAD，产品 worktree 干净。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`；未合并本任务。
- Auxiliary docs: `docs`；S08 start HEAD `63aa429f409a843c13d6afeedb8f048dcdb99177`；仅本任务文档提交，保护治理 / 模板既有 dirty。当前 docs HEAD 以包含本 Record / HANDOFF 的提交为准。
- Current stage: **D0–D4 / S01–S08 完成；S08 Native immutable Prompt 候选 / Route CAS 与 ordinary RP Workspace exact version binding 已交付；下一 checkpoint S09，本轮停止**。
- Plan entrypoint: [index](plans/architecture/agent-intelligence-runtime/index.md) → [decisions](plans/architecture/agent-intelligence-runtime/decisions.md)。
- S08 stage evidence: [s08-prompts](plans/architecture/agent-intelligence-runtime/s08-prompts.md) / [delivery S08](plans/architecture/agent-intelligence-runtime/delivery.md) → 同一 [Record](records/refactor/agent-intelligence-runtime.md)。
- Stage evidence: [s07-skills](plans/architecture/agent-intelligence-runtime/s07-skills.md) / [delivery S07](plans/architecture/agent-intelligence-runtime/delivery.md) → 同一 [Record](records/refactor/agent-intelligence-runtime.md)；前序： [s06-comparison](plans/architecture/agent-intelligence-runtime/s06-comparison.md) / [s01-baseline](plans/architecture/agent-intelligence-runtime/s01-baseline.md) / [m1-evolution](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [delivery S06](plans/architecture/agent-intelligence-runtime/delivery.md) → 同一 [Record](records/refactor/agent-intelligence-runtime.md)。来源 / authority 问题按需读取 [S02](plans/architecture/agent-intelligence-runtime/s02-sources.md) / [S03](plans/architecture/agent-intelligence-runtime/s03-capture.md) / [S04](plans/architecture/agent-intelligence-runtime/s04-project-recovery.md) / [S05](plans/architecture/agent-intelligence-runtime/s05-feedback.md) / baseline 相关段落。
- S08 code entry: `src/native/model-prompt-runtime/prompt-candidates.js` / 原 Native generation router；`public/scripts/lib/agent-workspace/prompt-versions.js` / 原 Preset library / host profiles / orchestrator capability API；`tests/native/prompt-candidates.test.js` / `tests/agent-runtime/workspace-prompt-versions.test.js`。产品 model-prompt-runtime README 给出手动调用。
- S07 code entry: `src/skills/{repository,versions}.js` / `src/endpoints/skills.js` → shared `skill-invocation.js` / RP resolver + tools / Native narrative / Studio Agent；`tests/skills/{versions,run-pins,api}.test.js`，原 README 给出调用。
- S06 code entry: `tests/agent-intelligence/{comparison,live}.mjs` → `comparison.js` / `adapters.js` / `live-bridge.js` / `budget.js` / `judge.js` / `session-copy.js`；README 给出完整本地调用。

## Completed

- D0–D2：RP / Project 并重、Skill / Prompt / 原编排参数、逐 scope 局部自动与 owner 有限预算、新建默认审阅、M1 完整后集成已确认。
- D3：Reasoning Continuity 唯一详细权威是 [model-routing §7](plans/architecture/agent-intelligence-runtime/model-routing.md#7-reasoning-continuity 执行状态与生命周期)，opaque execution 非 Memory / Experience payload；G01–G06 未实施。
- D4：Execution Reuse validity proof / 原 authority / Trust Domain；Segment / canonical compiler、Adaptive Invocation、三层 cache capability / locality 已整合企划，A–F 映射既有 G 阶段 / 后续 Local PoC，40 阶段身份 / 依赖保持。只企划，不读作 S06 新依赖。
- S01 原结构阶段：12 cases、scripted runner、strict Report / sidecar / 有限 pilot ledger；当时真实 bridge 缺失，empiricalReady=false。S06 已补原 generation bridge 和真实六槽基线，见下方实测。
- S02：双域只读 adapter、严格 owner / scope / exact refs / hash、有限 EvidenceSet / Evaluation；current 仅本次原 authority 观察，消费继续重验。
- S03：bounded RP metadata、Director exact saved output binding、Native request / attempt / receipt、StorageEngine `atri_agent_evidence` marker / CAS；capture failure 不重做已正式写入 effect。legacy / capsule-only / 未绑定正文明确 incomplete，usage missing 不为零。
- S04：durable Project task / attempts / public conversation / Review，Studio Git exact Workspace / base / validation receipt。保存或响应失败 reconcile 同一 OID；缺 receipt 回 Review / conflict，不自动 generation / rebase / Commit；正式写入前检查 completed / recovery 容量。
- S05：StorageEngine additive `atri_agent_experience`，authenticated owner + hash(scope, Host subject) ledger；explicit / client observation / Host technical outcome / user hypothesis 分层。target 返回原 authority hash / subject，regenerate 不推断负偏好；correct / withdraw / delete 与独立 diagnosis 撤回 / 删除、metadata export、source invalidation、retention 均有实际 HTTP consumer。
- S05 feedback / diagnosis 默认 30 天，可选 1–365 天，缩短收紧期限、延长不复活；消费过滤 / writable reconcile，read-only 不持久写。显式 bounded source sweep 清旧 evidence / terminal task，保留 active / Review / pending commit、原 Project source / Git receipt。来源失效后阻止消费、删除清相关内容，跨资源失败按当前 authority 重新核验。
- Reflection 只返回事件 / 聚合 batch 与 exact dependency；一个 regenerate 或同 source 重复不就绪，弱观察不能确定改进方向；相同 batch diagnosis 去重，modelCalls=0。没有新后台循环、AI diagnosis、publication 或新自动权限。

- S06：原 12 cases / 6+6 split、1–3 paired repetitions、单一 Prompt / Skill / roundLimit synthetic target；全新私有 chat / Workspace / Project task，原 Director / Studio loop / Native Generation Host / compiler / resolver / provider / Git receipt。模型比较先持久化所有独立 baseline，再运行候选；实际源码 / input / fixture / settings / request / outcome / attempt / usage 一起 pin。
- Project tool 返回值与原 task authority 分开读取；支持 exact fixture Skill 的 full / bounded offset / limit read 与 files。模型无 Commit / publication / foreign / DELETE / 非 fixture 网络入口；临时 reviewer 仅在 Review 后提交副本，canary 保持。真实发现的接线错误已修复并经本地原 Host 完整 read / Skill read / write / reset / Review 测试。
- NativeSaveSystem exact archive / export / import / SessionCore 证明双副本 revision / CAS 与来源隔离；RP live 仍是原 Director 的 synthetic task context，不称完整 production Session generation replay 或 Memory resolver。
- `EvaluationBudget` 原子持久化在 send 前，所有 phase / retry / grader 同一有限累计账本；unknown / cancel / missing total 保留预留，部分计数不推算总量；过量实报记账并停止后续发送，restore 不重置。CLI exclusive writer / 新输出 / progress / 独立 baseline sidecar 可接手。
- Blind human observation 有 binding 与分歧 awaiting_review；独立 typed Model JudgeReport 有 rule / full Comparison / public input / grade / attempt / grader charge binding，每 pair 一次，不修补 malformed score。单一同模型 judge 仅 observation，未观测 human preference / 多 judge 分歧；不改写 S01 ungraded behavior，不产生 publication 权。

- S07：原 installedHash 完整文件快照、有限 history / candidate 正文 diff、whole-base CAS、所有 repository 入口单 root 队列。RP 同 run / Native generation / Studio loop 读取 exact version，always / read / files / search 一致；新 preparation 读 freshinventory。Package 首次安装保留、different replace / candidate / editor 两层拒绝；旧管理读路径兼容，malformedmanifest 可修复。
- S07 candidate 仅保留原 frontmatter / 支持文件；check 也拒绝 hash-valid 同步扩权候选。显式 manualapply 沿原 editauthority，重复 desired-current 可 reconcile，不产生自动 promotion 资格。read-only 已有 pin 可消费，缺 snapshot 不写；删除清 history 撤销 pin，name rename 新 identity，scope 迁移保留 history 但旧 candidateidentity 失效。13suites / 247distincttests 通过，真实 RP Director / 派发 Agent 旧 pin、Native / Studio 消费者、原 syncround-trip 与失败点有本地证据；无新增真实模型。

- S08：Native 原 Preset root 保存有限声明 / candidate metadata，正文与 ancestry 使用原 immutable resource revisions。单模块 body 变化，完整 Preset / declaration / Route 与 exact closure 校验；原队列 + storage expectedIntegrity 原子切单一 player Route 的 Program ref，重复 desired match reconcile。Package 先显式导入用户 Library 副本；缺 revision / corruption 不 fallback。body ≤64 KiB、每 Preset ≤16 candidates / metadata≤2 MiB；静态插值沿原 parser，实际参数仍由原 request compiler 校验。
- S08 ordinary RP：原 Workspace settings 保存完整 base / desired snapshots 与 SHA-256 candidate identity，显式 Agent instructions 声明；只切角色 / 会话 binding 的 promptVersionId，禁止 global / default / builtin。profile / Plan 携带版本，四 mode 下一 preparation 读 exact definition，当前 run 保持 clone。whole base / bindings / declaration 冲突、same-ID body 改写 / unknown / missing 均拒绝；原 bind 清 pin、Preset delete 清对应版本，已选历史版本在原 save 后保留。原 capability API inspect / check / update 沿 settings debounce；仅单 browser client，无 cross-tab / Host CAS 或 durable publication intent，不授权自动模式。

## Real observations / budget

- Gemini final development pilot：6 / 6 execution 与 authority passed，18 sends / 18 tool calls，21 deterministic checks passed，57167 provider-reported tokens；S01 report `empiricalReady=true`。测试 HEAD `7d7708c1486c5b48b430eb2210e89768f4aabfb0`。
- 独立 promotion baseline / candidate：六对共 12 trials 全部 execution / authority passed；先保存全部 baseline，再跑冻结的单一 RP Prompt candidate。42 sends / 44 tools，44 deterministic checks passed，133569 tokens（含取消预留上界）；测试 HEAD `b5df610bdffd05d60ef3bc9bd6e62e7d9a164aa3`，后续只补 CLI / base URL 接线与相关回归。
- 同一 Gemini 的 blind grader：6 requests / 5629 provider-reported tokens，5 observed / 1 invalid_response（rp_variant），不修补或重发评分；RP memory 一次 candidate 偏好，其余四次 tie。无人工 label / 多 judge 分歧证据，不能推论稳定质量改善。
- Comparison / JudgeReport 的 `empiricalReady=false` / promotion ineligible 是保守的晋升状态；真实执行已完成，原 S01 behavior slots 仍 not_run。S06 完成 evaluator / 隔离执行 checkpoint，不把候选当作晋升通过。
- 额外 Haiku 连接只做编程响应探针，配置 / 结果分开；未知 RPM 采用串行至少 10 秒间隔，计入同一累计账本。首次 connect timeout（10547 ms）保留 1169 tokens 预留；延长连接等待后一次 HTTP200 有效响应（4063 ms / 53 provider-reported tokens）；按用户纠正 `/v1` base 复核返回 HTTP524（126139 ms / 未知 usage，保留 1169 预留）。不执行模型返回代码、不评分或代替 Gemini 比较。最终累计 **110 requests / 300464 tokens，breached=false**；provider totals 与保留预留混合，不称精确实际 token 总量。
- 真实报告 / progress / baseline / judge 的文件名、canonical hashes、source bytes 与先前失败成本见同一 Record；Git 外报告不上传或覆盖。

- 用户明确授权专用测试 API / 本地配置；初始 120 requests / 250000 tokens 为建议，后明确实际 hard cap **每日 2000 requests / 20 RPM**。当前有限累计 guard **252 requests / 1000000 tokens**、每次 output≤1024，持久 rate checkpoint / 3.15 秒 admission 间隔；remote model `gemini-3.8-flash`，OpenAI-compatible。已知首字慢，timeout **300000 ms**。额外 `claude-haiku-4-5` 测试连接亦由用户明确提供，仅做有限连接探针。
- Local Git config keys `atria.s06.connection` / `atria.s06.ledger` / `atria.s06.artifacts` / `atria.s06.limits` / `atria.s06.secondaryconnection` 保存 Git 外私有配置、累计账本与报告目录的位置；只用这些已授权路径，不扫描用户目录找 Secret。不把值或 apiKey 写入文档 / Git。
- **所有补测恢复同一累计 ledger，不因失败、换 split、换 suffix、重启或新会话清零**。先核对 private config 与 ledger 的真实剩余额度；CLI lock 若残留先确认进程状态，不能绕锁并发花预算。已有报告不覆盖。
- initial pilot / slow-endpoint / read-tools-fixed / 首轮失效比较仍计入历史；保留进度和未结算预留，不凭 model 自述补通过。测试回归的 fake HTTP 不计真实调用，也不称真实质量。

## Pending / limits

- 下一 checkpoint **S09**：沿原 Preset / Project 参数与 compiler / policy 冻结有限 allowed fields、candidate diff / complete base、局部 exact binding / conflict / 撤回。S08 已交付正文候选与 Native / ordinary RP exact consumers；本轮未开始 S09；S06 候选仍 publicationStatus=ineligible，price / 人工偏好 / 无效评分与自动晋升门槛未补齐，不将单次 model observation 当发布批准。
- price、真实 upstream / opaque gateway retries 不可知；显式 local tokenizer / context guard 不是 Gemini 精确能力证明。HTTP header 等待时长非 TTFT，不能声称质量 / 费用 / 延迟收益。其它等价 body / cognition / critic ablations unavailable，Director 仅 scripted graph 观测。
- 只允许 synthetic evaluator target，S07 已交付 Skill 生产 exact pin 与显式手动 edit；S08 已交付显式手动 Prompt body binding，未交付 S09 策略候选或 S10 自动晋升、S10 自动 publication，不新增 storage kind / HTTP / UI / 后台循环。S04 recovery 不重做 generation / rebase / Commit；S05 feedback / diagnosis 不是配置 authority。
- M1 尚不完整，S09–S34 / G01–G06 未实施；本组分支不删除，main 不合并。D3 / D4 只企划，不重做研究或读取未来 G / Local。

## Validation / preservation

- **S08：7 relevant suites / 68 distinct tests passed**：native candidates19、Workspace candidates14、原PromptPreset5、runtimepersistence7、WorkspacePreset4、Native orchestration prompts9、Workspace authoringhelp10。新增两套最终33 tests；原相关5套35 tests，重复不累加。最后只定向新增继承闭包 / 内容哈希 / jsdom package conditions 接线；10触及JS ESLint / diff通过。
- S08实际证据：FS / SQLite reopen与原SettingsRepo reload；SQLite dump / 原user close+directory removal / restore；metadata失败 / committed response lost、并发RouteCAS、wholebase / declaration / binding冲突、unknown / missing / corrupt / 容量 / 删除 / read-only、Package exactenvelope导入隔离copy。真实RPDirector stub多轮保持候选；原ProjectGenerationHost / scheduler / compiler / providerstub发送candidate，narrator / studio原GenerationService snapshot显示新body和旧preview保持。无完整NativeSessionproductionturn重放、真实model / 全量test / build / browser / Android / 真机 / external DB / CI。未读取或改写S06私有配置 / ledger / 报告。

- **S07：13 relevant suites / 247 distinct tests passed**；versions 23 / run-pins 4 / repository 72 / api-rest 46 / browser api 16 / embed 14 / native invocation 10 / RP tools 14 / resolver 23 / precedence 8 / multi-visible 3 / plumbing 3 / live-bridge 11。12-suite / 174 passed 后，补 legacy repair 仅定向 3-suite / 141 passed，最终 staging guard 仅定向 2-suite / 95 passed，重复不累加。22 触及 JS 的 ESLint / product diff 通过；无 browser / 全量测试 / build / Android / 真机 / externalDB / CI / real model。前序 S06 证据：

- **5 relevant suites / 101 distinct tests passed**：comparison 34、baseline 51、live-bridge 11、runner-failure 1、judge 4。初始 97-test 组合及后续 13 项定向复核后，用户纠正 base URL，仅定向 live-bridge / judge **15 passed**；重复不累加。`/v1`、`/v1/` 与完整 endpoint 均沿原 provider 发送一次正确路径。
- strict report / mixed source / actual refs / outcome / budget / schema / field、取消 / stale completion、native Session copies / stale CAS、Studio read / Skill / write / reset / Review / fixture Commit、pending reservations / restore / breach、blind typed score / malformed rating / missing usage / no-budget guards。
- 触及 JS / mjs ESLint、product diff / staged diff；scripted CLI generate / validate / exclusive overwrite、真实 pilot / 比较 strict validate。最终 docs links / fences / 40 stage dependencies / 前序 Record / five dirty hashes 与 refs 检查见 Record。
- S07 触及 Skill repository / HTTP / productionruntimeconsumer，无 UI / lockfile 变更；S06 无生产 source 变更。未执行全量测试、build、browser、Android / 真机、远程 CI、外部 DB。仅已授权测试模型 endpoint 有实测。
- main AGENTS 与 docs README / WEB Adapter / 两模板既有 dirty 未暂存 / 提交，hash 保持；reference / 其它 Experience 草稿未读写。

## Next target / bootstrap

读取 `docs:HANDOFF.md`，仅续接 S09。核对真实 Git → HANDOFF → index / decisions → m1-evolution / delivery S09 / s08-prompts / s07-skills / s06-comparison → 同一 Record；按需原 Preset / Project 参数与 compiler / policy authority。沿用 `feat/agent-intelligence-runtime@9b5cb5740e2af7cab8b83b9675576ea01c4f4527`；D0–D4 / S01–S08 完成，产品 commit / push、工作树干净，main 未合并。

S08 Native 复用 Library immutable Prompt closure 与 Preset root 保存声明 / 正文候选，whole Preset / declaration / Route 校验，expectedIntegrity 原子切单一 Route 的 exact Program binding；ordinary RP 沿原 Workspace settings / 角色与会话 binding 固定完整候选，SHA-256 version identity / diff、四 mode exact profile / Plan metadata，当前 run 保持 accepted clone。7 relevant suites / 68 distinct local tests，无新真实模型。Native 单 Host write queue；Workspace 原单 browser client / debounce，不声称跨 tab / Host CAS 或 durable publication intent。S09 先冻结有限 allowed fields / 单目标 candidate / whole base / effective scope binding / conflict / rollback，再接原 compiler / policy / 下一 run消费者；不更改 capability、output owner、必要 guard、Connection / Secret / Privacy 或 Routing 自动发布权限。

S06 Comparison / JudgeReport 仍 ineligible，不用一次模型偏好批准晋升；S10 仍需 feedback / diagnosis / policy / Evaluation / source-deletion dependency、有限共享预算、完整 Review / publication / recovery / rollback。S07 / S08 的 explicit manual apply 沿原编辑权限，不是评测晋升。Package 原版保留；禁止 latest fallback。若确需模型请求，只使用 local Git config 的已授权位置，恢复同一累计 ledger / rate checkpoint 与显式 budget override，不重置 / 覆盖报告，不扫描 Secret。

不得读取或更新 reference / 其它 Experience 草稿；仅 S09，阶段完成 commit / push、同一 Record / live HANDOFF 后停止，不进入 S10、不合并 main。保护 main AGENTS 与 docs README / WEB Adapter / 两模板的既有 dirty；本轮五个 hash保持，见 Record / 前序交接证据。
