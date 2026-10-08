# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-08
- Current checkpoint: **用户明确测试仅每日2000调用 /20RPM硬限，token建议超出即报告继续；M1新规则真实执行中。原八对partial /超报保留。**
- Product branch: `feat/agent-intelligence-runtime@c997086bd`，已commit /push，product worktree干净。
- 当前paid-run Tested HEAD: `c997086bd49c2f8a9c875cded65e6ad529f93442`；前轮原source6c八对partial与旧费用保持各自pin。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`；本轮前置记录commit `c56b086e0`，结果已更新同一Record / live HANDOFF；接手核对actual refs。
- Plan: [index](plans/architecture/agent-intelligence-runtime/index.md) → [S10](plans/architecture/agent-intelligence-runtime/s10-evolution.md) → [自动化验收](plans/architecture/agent-intelligence-runtime/m1-acceptance.md) / [M1](plans/architecture/agent-intelligence-runtime/m1-evolution.md) / [delivery](plans/architecture/agent-intelligence-runtime/delivery.md)。
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

- S10历史验证：**12 relevant suites / 233 distinct local tests passed**：S10 新三套48、原相关九套185；最终仅定向 repository / service 41，重复不累加。
- 真实固定 worker 各一组 RP Skill / Project Prompt，运行原 Director / Studio / compiler / resolver / provider **fake HTTP**；没有 production effect。原下一 Project Prompt / Task exact snapshot、其它 Project 隔离、RP trace、browser draft / refresh 另直接验证。
- 真实 Chromium 390px 检查两个入口的 shared production pane，fixture API；覆盖 feedback / budget / review default / start / pause / delete / escaping。不是完整 app E2E。
- 44 个其它触及 JS / mjs ESLint 通过，settings.js 的四项既有 no-raw-fs-in-endpoint 错误与基线一致；只屏蔽该 rule 的复核通过。diff / staged diff / fixed-loader worker check 通过，原S10为Node24本地验证；本轮Node20.20.2固定worker加载及核心三套48项已通过，SQLite使用临时同版本Node20依赖；完整命令 / 首次ABI失败与定向复核见Record。
- 原 SettingsRepo 外部 MySQL / Postgres 12 项首次因 DB 不可用失败，最终 FS / SQLite12 passed / 外部12 skipped。没有计其通过。
- 本轮真实请求与恢复预算见下文；未执行full test / build / full app UI / Android / 真机 / external DB / CI。S10原交付轮未读写S06 private config / ledger / reports；本轮按用户授权迁移connection并保守恢复累计账本。main AGENTS 与 docs README / WEB Adapter / 两模板 dirty 未暂存 / 提交，五 hashes见 Record；reference / 其它草稿未读写。

## Real observations / budget preserved

S06 原 Gemini development 六槽与 promotion 六对已真实执行，原 authority passed；单一 blind grader 五项有效 / 一项 invalid_response，无合格人工观察 / 稳定行为改善，候选仍 **promotion ineligible**。额外 Haiku 仅连接探针，不评分。详情、exact report hashes / tested source 与失败费用在 Record。

S06最后已记录累计 **110 requests / 300464 记账 tokens，breached=false**，包括未知 usage 保留预留，不称精确实际总量。原 finite guard 252 requests / 1000000 tokens，至少 3.15 秒 admission；用户 hard cap 每日2000 / 20 RPM。只在确需并冻结有限验证后恢复原账本，不能换 session / split / retry / suffix 清零。

私有位置仅由 local Git keys `atria.s06.connection` / `atria.s06.ledger` / `atria.s06.artifacts` / `atria.s06.limits` / `atria.s06.secondaryconnection` 指示；不写值 / Secret 到 Git、不扫描用户目录、不覆盖旧 reports、不绕残留 lock。补测前核对进程 / actual ledger / remaining budget。S10 的 owner product ledger 与此实测 CLI ledger 属各自真实 authority，fake test 不消耗或重置 S06 预算。

## Actual M1 retry result / budget

用户已授权agent代劳，工程验收按[m1-acceptance](plans/architecture/agent-intelligence-runtime/m1-acceptance.md)的自动authority / 双模型盲评；humanPreference=not_observed，生产automatic human / price gate保持。用户要求偶发错误继续、频繁错误停止；不用用户自己运行tests。

- 原S06ledger / limits / reports缺失，用户确认无迁移。旧guard整段252requests /1000000tokens为historicalCarry，不伪造旧entries；旧breach未知。Document私有持久目录700 / API与报告文件600 / local Git exclude，五个Git private keys已迁移，旧文件不覆盖。
- 冻结新增260sends /699536记账tokens，含carry累计512 /1699536；3150ms串行 / 原20RPM /2000dailycap / output1024 / 单请求300秒 /overall两小时 / 原job120sends与一小时保持。全部提炼 / trials / judge / retry / activation同账本，unknown保留预留。
- 首轮source1a：3sends /9498tokens，candidate HTTP524（未知5389保留）。retry source26与diagnostic d67各2成功提炼请求，却因完整json代码块被原parser拒绝；均在promotion前停止。修复只接受完整JSON或单一完整json / 无语言围栏，仍严格检查字段 / target / blind grade，说明文字 / 多blocks / 截断拒绝。旧失败报告保持原source，不重新标通过。
- 实际source6c轮新增73sends /293240reported tokens：RP提炼1、baseline34、candidate30、主judge8；没有新的HTTP / transport失败，没有实际retry发送。保存17个trial事件（16完整 /1中断）与8对完整pair；完整16arm原authority / isolation / target_consumed checks全通过。主模型7candidate /1baseline，无secondary观察；已完成八对baseline135433tokens、candidate137700（高2267，约1.67%）。这些是partial主模型结果，不能取得完整双模型工程资格。
- 最后一笔baseline报告5586tokens，预留5550，超36；provider报告input3887 / output171，其total多1528，来源未核实。保守采信total，不用input+output4058覆盖已记账5586；sticky breach禁止后续发送。第九对中断，第二模型 / 当前Project轮 / review publication / next-run / rollback未执行。Project仅此前提炼返回过响应，没有合法promotion证据。
- 最终累计 **332requests /1305716记账tokens，currentPeriodBreached=true，pending0、unknown1（5389）**；本恢复期80sends /305716tokens，含旧carry。总额仍低于512 /1699536，但单笔超报保护已触发；不能将账面剩余180 /393820当作可发送资格，不清账 / 关breach / 换session绕过。
- 私有实际summary SHA256 `109b1bed3af688ee3d2278fadd0233bb1d202a86c043ef7034465ea3bbeb9633`；累计ledger SHA256 `d81f350ad12de02a0a6c68b9d99fc100fba1c80efbacd85d300ae3ab91ecf963`。native evaluator revision `f8548173b8ffb754052ade6e5bef06dad046d76a01dce3af8c74c06a0c7d752c`与最终product相同；runner Tested HEAD仍6c，后续CLI修复不冒称付费验证过。

## 当前授权与执行 / next checkpoint

- 用户最新明确：“无token要求，测试API的硬上限仅为每日2000次调用，20RPM，其他仅为建议，如果超出建议预算只需告诉我即刻，无需停下”。覆盖前轮token sticky停止与工程token非回归条款，生产原预算 /human /price gate不改变。完整行为 /authority /双模型与两入口闭环仍需取得，不能凭新规则宣布通过。
- c997仅test-only：EvaluationBudget显式advisory restore保留历史breached /entries /unknown；原product repository默认strict不变。私有fixture subclass沿原owner queue /schema /storage保存真实reserve /settle，token建议超额仅提示，不设新hard violation，不清旧private owner。shared API quota两连接通用、滚动24小时2000 /滚动一分钟20、至少3150ms串行，全部retry /judge /activation先持久admit；迁移carry以现有累计332聚合保守计24小时，不伪造252旧逐次timestamps。
- 超过原建议累计512 /1699536或单笔预留就即时报告并继续。原数字只是建议；actualtotal照记，未知保留upper，不推断多1528token来源。频繁错误仍按连接三连续 /最近20六失败停止，偶发最多两追加retry /10秒；不追试至通过，不自动fallback。
- RP复用source6c已付费冻结proposal，核对value /rationale /target /base及原公开feedback，报告原job /charge provenance，不新提炼、不训练promotion输出；完整重跑九对，不导入旧八对混资格。Project独立提炼 /比较 /第二模型 /review /next-run /rollback按原m1-acceptance执行。
- 本轮四套19tests passed：quota4 /recovery4 /engineering5 /retry6；七文件lint /diff passed，source commit /push。零send prepare两入口通过，累计332 /1305716与breached=true保持，quota已持久初始化，source c997开始真实执行。原验证与partial evidence各保持source，不重复累加。
- 当前执行进程 /exclusive lock存在期间不要并发启动runner。阶段结束核对实际ledger /quota /rate /report与预算提示，更新同一Record /HANDOFF并停止，不要求用户手测。无full tests /build /CI /新browser /external DB /Android /真机，不读reference、五个既有dirty保持。

下一仅M1：继续当前原账本 /API配额上的实际固定比较与两入口闭环；超建议告知并继续，日调用 /RPM硬限保留。行为未达标如实pending，不合并main、不进入S11 /G。

接手提示词：**读取 docs:HANDOFF.md，继续M1按用户最新仅2000每日 /20RPM硬限验证；先核对运行进程 /lock /同一累计账本与quota，不并发或清账，token超建议立即告知继续。保留原冻结候选与旧partial，不要求用户手测，不进入S11或G。**
