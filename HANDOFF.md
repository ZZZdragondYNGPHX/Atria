# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-07
- Current checkpoint: **2026-10-07 再次复核：M1 仍待验收 / 不集成；S10 工程完成，未新增模型证据**。
- Product branch: `feat/agent-intelligence-runtime@ed00f4f0cea53be360ed8dfa082bbd0afeec5398`，已 commit / push，product worktree 干净。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`，本文件与同一 Record 在本轮 M1 再次复核 docs commit；起点 `c4fb8ddeee96bae11b3f6091c4e7b6dbb4fd03a8`，本地原落后一个提交，已 fast-forward。接手核对 actual refs，不从历史路径恢复实时状态。
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
- 44 个其它触及 JS / mjs ESLint 通过，settings.js 的四项既有 no-raw-fs-in-endpoint 错误与基线一致；只屏蔽该 rule 的复核通过。diff / staged diff / fixed-loader worker check 通过，Node24 本地；Node20 未实测。
- 原 SettingsRepo 外部 MySQL / Postgres 12 项首次因 DB 不可用失败，最终 FS / SQLite12 passed / 外部12 skipped。没有计其通过。
- 无新真实模型请求、full test / build / full app UI / Android / 真机 / external DB / CI；S06 private config / ledger / reports 本轮未读写。main AGENTS 与 docs README / WEB Adapter / 两模板 dirty 未暂存 / 提交，五 hashes见 Record；reference / 其它草稿未读写。

## Real observations / budget preserved

S06 原 Gemini development 六槽与 promotion 六对已真实执行，原 authority passed；单一 blind grader 五项有效 / 一项 invalid_response，无合格人工观察 / 稳定行为改善，候选仍 **promotion ineligible**。额外 Haiku 仅连接探针，不评分。详情、exact report hashes / tested source 与失败费用在 Record。

累计仍 **110 requests / 300464 记账 tokens，breached=false**，包括未知 usage 保留预留，不称精确实际总量。原 finite guard 252 requests / 1000000 tokens，至少 3.15 秒 admission；用户 hard cap 每日2000 / 20 RPM。只在确需并冻结有限验证后恢复原账本，不能换 session / split / retry / suffix 清零。

私有位置仅由 local Git keys `atria.s06.connection` / `atria.s06.ledger` / `atria.s06.artifacts` / `atria.s06.limits` / `atria.s06.secondaryconnection` 指示；不写值 / Secret 到 Git、不扫描用户目录、不覆盖旧 reports、不绕残留 lock。补测前核对进程 / actual ledger / remaining budget。S10 的 owner product ledger 与此实测 CLI ledger 属各自真实 authority，fake test 不消耗或重置 S06 预算。

## Pending / next checkpoint

### 2026-10-07 M1 验收再次复核

- 结论：**M1 pending / 不集成**。S06 真实比较仅一次 repetition，五项同模型观察 / 一项 invalid response，无独立人工 labels、可核对价格或稳定改善；不能取得 S10 eligibility。S10 的 233 tests / fake worker / browser fixture 仍仅为原工程证据，本轮未重跑。
- 实测前置：先冻结两条支持入口各一个单目标、exact base / policy / Route / model / connection / evaluator source、development 与 promotion split；每入口三个独立场景 × 三次 paired trial、九项独立 authenticated human labels。三类目标 × 两入口的工程覆盖继续保留，不把两个实测目标自动外推为全部目标的质量收益。
- 按原 gate 检查九项人工与模型观察无分歧、至少六胜、重要维度非负、authority / isolation / target_consumed / source / exact config 全通过、trial token 与费用不高于 baseline；提炼 / judge / retry 另报且全计总额。达到准入仍不等于学习成本后的净收益。
- 预算尚未重新核实：Record 的 110 / 300464 对原 guard 留出142 requests / 699536记账tokens，仅为历史差额。本轮未读 private ledger / config / reports。恢复前核对原进程 / lock / rate checkpoint / actual ledger；S10 owner ledger 与 S06 CLI ledger 没有自动共享总额的证明，不得用另一个 ledger 重新获得预算。冻结包含多轮 / retry / unknown 的有限总 send / token 上界；不足则停止，不缩减九对门槛。
- Git 前置已核对：远端 product / main 与上方 pins 一致；`origin/main...origin/feat/agent-intelligence-runtime` 为 `0 / 16`，main 是任务分支祖先，`git diff --check` 通过；依赖 / lockfile / workflows / AGENTS / CLAUDE 无本组差异。product 工作树干净；main AGENTS.md 与 docs 四份治理 / 模板有既有 dirty，五个 hashes 与 S10 记录一致并保留。未执行 merge，不把祖先关系当作合并后验证。
- 本地集成验证仍待取得：按用户当前要求，每阶段与结束只执行本地最小相关验证，不沿用前轮远程 CI 待取得项作为当前门槛，不查询 / 触发 CI，不要求 full test / build。Node >=20 为产品声明、S10 只有 Node24 证据；最低版本兼容性尚未核实。两入口原 binding publication / 下一 run exact 消费 / guarded rollback 的真实闭环证据仍缺；external DB / full app UI 未实测不计通过。达到 M1 验收后，集成前后仅做与触及面相称的本地验证。
- 本轮仅更新同一 Record / live HANDOFF；无产品改动、模型请求、private读取、tests / build / browser / DB实测或 workflow dispatch。不合并 main、不删除任务分支、不进入 S11 / G / Local。

**M1 实际改善与集成前置条件待验收**。S01–S10 工程完成不证明独立真实质量 / 成本收益，不以 fake positive report、手动 review 或单一 model judge 偏好完成 M1 退出条件。下一只复核支持矩阵中的双入口有限模型比较、独立人工观察、成本 / 回归证据与集成前置检查；条件不足明确待验收，不默默下调门槛。

先核对真实 Git → HANDOFF → index / s10-evolution → m1-evolution / delivery M1 → 同一 Record；只按需读取原 S05–S09 authority。不重做 D3 / D4，不进入 S11–S34 / G01–G06 / Local；main 不合并，任务分支保留。

接手提示词：**读取 docs:HANDOFF.md，仅复核 M1 验收与集成前置条件；不要进入 S11 或 G 阶段。**
