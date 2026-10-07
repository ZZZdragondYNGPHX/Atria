# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-07
- Current checkpoint: **M1自动本地验证已代劳：Node20.20.2相关48项通过；原S06账本 / reports缺失，真实补测未启动，M1仍待验收 / 不集成**。
- Product branch: `feat/agent-intelligence-runtime@ed00f4f0cea53be360ed8dfa082bbd0afeec5398`，已 commit / push，product worktree 干净。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`，本文件、S10验证补充与同一 Record 在本轮 M1 自动验证 docs commit；起点 `f7fc8e23023d96903afda350f99971f21976a6dc`。接手核对 actual refs，不从历史路径恢复实时状态。
- Plan: [index](plans/architecture/agent-intelligence-runtime/index.md) → [S10](plans/architecture/agent-intelligence-runtime/s10-evolution.md) → [M1](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [delivery](plans/architecture/agent-intelligence-runtime/delivery.md)。
- Record: [同一阶段记录](records/refactor/agent-intelligence-runtime.md)。

## Current scope / completed

D0–D4、S01–S09 已交付，历史依据留在 Record，不重读全量研究。S10 已连接原 Experience feedback / diagnosis、有限 owner budget / 原 scheduler、固定隔离 evaluator、原六类局部 target、自动 publication / receipt / recovery / rollback、下一 run 消费证据和双入口共享面板。

- 普通 RP：非 group rp_chat、exact character `.png` binding、原用户单 owner bounded Director maxSteps≤6。局部 Skill 必须已 visible + always 且为唯一目标；Prompt 为原 Workspace Agent instructions；strategy 为原 maxSteps。无 global / builtin / Package / Native Session / conversation override 自动权限。
- Project：原局部 Skill、原用户 Preset system.style、原 pristine planning Task maxRepairRounds。原 player role.studio Route 的有界 projectPromptBindings 只覆盖指定 Project；其它 Task 不继承参数，开始运行后不热改。
- 每轮一个 target，已生效同一物理 authority 必须先 rollback，跨 RP chat 也不叠加独立 report。SettingsRepo 原 save / patch / Host queue 与 whole library CAS / epoch、防 stale browser draft 和下一 preparation Host refresh 已实现；current run 保留 accepted clone。仅单 Host writer 支持。
- owner budget 显式有限 request / tokens / rate，所有提炼 / trials / judge / retry send 前 durable reserve，unknown 保留 upper bound，sticky breach / restart 不清账。job 有限一小时 / 120 sends / 1000000 tokens，每 scope 24 小时一次；重启不重发 uncertain model job。
- 三个独立 promotion cases ×三次 repeated paired trials；九次 blind model observation + 九项独立 authenticated human label。至少六胜、全部 nonregression、dimension 非负、原 checks / target_consumed / isolation / exact config / fees / source 全通过才 automatic publish。缺 price / human / usage、judge 分歧仍 ineligible。controller 额外成本全计入，trial 达标不称净收益。
- durable intent → 原 target queue finalizing gate → 原 CAS → receipt；response loss / repeated request / restart 用 actual base / desired / third-state 恢复一次。来源 correction / withdrawal / delete / retention 先 pause / invalidate / cancel，再 guarded rollback 与清派生内容；用户继续选择或缺 original authority 保留明确 conflict / garbage。
- receipt 与当前原 binding 区分；manual binding drift 暂停。Project original Host snapshot 和 RP completed exact-output typed trace 记录 next-run 消费；RP provenance 仍为 client_observation。
- 原 Workspace Run / Studio Task 共用 pane，支持 feedback / hypotheses、预算、默认 review / 显式 auto、declare、job / diff / 盲测 human observations / fees、review / pause / rollback、delete / retention / export；Studio 可 Prepare without running。无无限 polling。

## Code / evidence entry

- `src/native/agent-intelligence/evolution-{repository,targets,evaluator,service,observer}.js` 与 `evaluation/` 固定 worker；原 Experience / Native Generation router / Host。
- 原 SettingsRepo、Skill repository / versions、Workspace prompt / strategy versions、Native PromptCandidateStore、Project Task / Studio loop 继续保存与消费有效版本。
- `public/scripts/native/agent-evolution-panel.js`、原 Workspace panel / Studio Task、`workspace/host-refresh.js` / orchestrator main。
- `tests/agent-intelligence/evolution{,-consumers,-http}.test.js`、`tests/frontend/agent-evolution-ui.smoke.mjs`；具体命令 / cases / 故障归因见 S10 Record。

## Validation / limits

- **12 relevant suites / 233 distinct local tests passed**：S10 新三套48、原相关九套185；最终仅定向 repository / service 41，重复不累加。
- 真实固定 worker 各一组 RP Skill / Project Prompt，运行原 Director / Studio / compiler / resolver / provider **fake HTTP**；没有 production effect。原下一 Project Prompt / Task exact snapshot、其它 Project 隔离、RP trace、browser draft / refresh 另直接验证。
- 真实 Chromium 390px 检查两个入口的 shared production pane，fixture API；覆盖 feedback / budget / review default / start / pause / delete / escaping。不是完整 app E2E。
- 44 个其它触及 JS / mjs ESLint 通过，settings.js 的四项既有 no-raw-fs-in-endpoint 错误与基线一致；只屏蔽该 rule 的复核通过。diff / staged diff / fixed-loader worker check 通过，原S10为Node24本地验证；本轮Node20.20.2固定worker加载及核心三套48项已通过，SQLite使用临时同版本Node20依赖；完整命令 / 首次ABI失败与定向复核见Record。
- 原 SettingsRepo 外部 MySQL / Postgres 12 项首次因 DB 不可用失败，最终 FS / SQLite12 passed / 外部12 skipped。没有计其通过。
- 无新真实模型请求、full test / build / full app UI / Android / 真机 / external DB / CI；S06 private config / ledger / reports 本轮未读写。main AGENTS 与 docs README / WEB Adapter / 两模板 dirty 未暂存 / 提交，五 hashes见 Record；reference / 其它草稿未读写。

## Real observations / budget preserved

S06 原 Gemini development 六槽与 promotion 六对已真实执行，原 authority passed；单一 blind grader 五项有效 / 一项 invalid_response，无合格人工观察 / 稳定行为改善，候选仍 **promotion ineligible**。额外 Haiku 仅连接探针，不评分。详情、exact report hashes / tested source 与失败费用在 Record。

累计仍 **110 requests / 300464 记账 tokens，breached=false**，包括未知 usage 保留预留，不称精确实际总量。原 finite guard 252 requests / 1000000 tokens，至少 3.15 秒 admission；用户 hard cap 每日2000 / 20 RPM。只在确需并冻结有限验证后恢复原账本，不能换 session / split / retry / suffix 清零。

私有位置仅由 local Git keys `atria.s06.connection` / `atria.s06.ledger` / `atria.s06.artifacts` / `atria.s06.limits` / `atria.s06.secondaryconnection` 指示；不写值 / Secret 到 Git、不扫描用户目录、不覆盖旧 reports、不绕残留 lock。补测前核对进程 / actual ledger / remaining budget。S10 的 owner product ledger 与此实测 CLI ledger 属各自真实 authority，fake test 不消耗或重置 S06 预算。

## Pending / next checkpoint

### 2026-10-07 M1 自动验证

- 用户授权agent代劳，不要求用户本人执行测试；范围仍仅M1，不进入S11 / G。Node20.20.2固定loader / worker通过；核心三套48项最终都有本地通过证据。首轮32 passed /16 failed全因Node24 SQLite ABI，安装临时同版本better-sqlite3@12.10.0 Node20依赖后只重跑16项、全部通过；共享依赖 / 源码未修改。fake provider / 合成人工标签只用于工程验证，不算真实收益或human observations。
- **实际阻碍：原S06 ledger / limits / artifacts目录当前不存在**，原lock / rate checkpoint也缺失，均按已有Git keys定位在临时存储。用户答复“无迁移”；不推断删除原因。两个connection仍存在，mode600；未输出Secret / endpoint / 路径，未扫描其它目录，未变更私有keys或配置。
- 用户指定的主目录 `Document/` 已创建（700），本地说明文档600，整个目录通过 local Git exclude排除Git；已有两份connection尚可读取，无需重发API。未复制 / 改写现有凭证或keys；用户后续发来的API信息保存为该目录的600私有文档，后续账本 / 报告使用持久位置。创建目录不恢复旧账目、不清零预算。
- 历史110 requests /300464记账tokens / breached=false与142 /699536差额无法按当前原ledger核实；connection自身120 /250000配置不等于原252 /1000000有限guard。不能从历史总数伪造逐次账目，不能改用S10新owner账本重获额度。**本轮零真实模型请求**；先明确原累计账目恢复处理与可核对有限验证预算，再恢复 / 冻结双入口比较。
- M1验收仍缺：最终S10 exact evaluator / supported target的两入口单目标真实比较；每入口三个独立promotion场景各三次paired trial、九项独立authenticated human labels；至少六胜、重要维度非负、无分歧、原source / authority / isolation / target_consumed / exact config全通过，trial token与可核对费用不高于baseline；controller / judge / retry全计总额，不把trial达标称作净收益。真人标签缺失时保持ineligible，不以agent评分替代。
- 两入口原binding publication / 下一run exact消费 / guarded rollback的真实闭环仍待证据；RP provenance保持client_observation。三类目标×双入口工程覆盖保留，不外推未实测目标收益，不叠加独立报告。
- Git pins保持；main...product为0 /16，product worktree干净，diff check通过。main AGENTS与docs四份治理 / 模板既有dirty的五个hash与S10一致并保留。按用户要求只做最小本地验证；不查询 / 触发CI，不要求full test / build。Node20.20.2证据不外推任意Node20 patch或full app / external DB支持。
- 本轮只更新S10验证状态、同一Record / live HANDOFF并commit / push docs；没有产品变更 / 真实模型 / 新browser / full app / external DB / Android / 真机 / CI。**M1仍pending，不合并main、不删除产品分支。**

下一checkpoint仅M1：处理原账本 / reports的可核对来源与有限预算后，由agent继续自动比较；条件不足明确记录，不降低门槛、不要求用户手工执行tests。

先核对真实 Git → HANDOFF → index / s10-evolution → m1-evolution / delivery M1 → 同一 Record；只按需读取原 S05–S09 authority。不重做 D3 / D4，不进入 S11–S34 / G01–G06 / Local；main 不合并，任务分支保留。

接手提示词：**读取 docs:HANDOFF.md，继续代劳 M1 自动验证；先核对原 S06 账本 / reports 缺失与有限预算，不能新建账本清零。仅 M1，不进入 S11 或 G 阶段。**
