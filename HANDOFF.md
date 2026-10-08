# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-08
- Current checkpoint: **M1有限retry实际执行中；首轮HTTP524已计账保留。工程自动验收与生产human gate区分，M1仍pending。**
- Product branch: `feat/agent-intelligence-runtime@6c99da07f`，已commit / push，product worktree干净。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`，本文件、S10验证补充与同一 Record 在本轮 M1 自动验证 docs commit；起点 `f7fc8e23023d96903afda350f99971f21976a6dc`。接手核对 actual refs，不从历史路径恢复实时状态。
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

## Pending / next checkpoint

当前只做M1自动化工程验收，按[m1-acceptance](plans/architecture/agent-intelligence-runtime/m1-acceptance.md)执行；用户授权agent代劳，不需要用户运行测试。生产automatic human / price gate保持，humanPreference=not_observed。

- 原S06ledger / limits / reports缺失且用户确认无迁移；旧逐次entries与breach无法核实。已按旧guard252requests /1000000tokens保守carry，不伪造旧记录；Document持久保存两个API / recovery / 新累计ledger / rate / reports，700目录、600文件、local Git exclude，五个Git private keys已迁移，旧文件不覆盖。
- 新增allowance最多260sends /699536tokens，含carry累计guard512 /1699536；3150ms串行、output1024、单请求300秒、overall两小时、原job120sends /一小时保持。两入口各三场景×三次paired trial、两个模型九对独立盲评，原authority / target / isolation / config / usage与token资源门槛维持。不达标如实pending。
- 首次真实执行source `1a1deb9f5`：RP提炼与baseline成功，candidate HTTP524。3sends /9498记账tokens含未知5389预留；累计255 /1009498、currentPeriodBreached=false、pending0。无完整pair / quality / publication证据，Project未执行；私有报告保留，不拼接进新report。
- 用户明确“继续尝试，除非报错频繁，否则可以认为是偶发情况”与“retry”。source `26f203f60`增加显式CLI有限重试，HTTP5xx / transport每请求最多追加两次、至少10秒；连接连续三失败或最近20次六失败停止，认证 / 配置 / 额度 / 取消不重试。每次走原send / durable双账本，unknown保留，额度不增加。重试频率checkpoint持久化，不通过重启洗掉已停止状态。
- 固定worker新增trial事件，evaluator的onTrial可选默认空操作；CLI分别保存完成 / 失败arm，后续失败仍保留前一arm原checks。最小本地原consumers6 / partial worker1 / retry5共12tests passed，六文件lint / fixed-loader check / diff passed，source commit / push后继续同一账本实际执行。准备轮五套61tests与原Node20.20.2的48项仍各对应其source，不重复累计 / 外推。
- 本轮没有full tests / build / browser / external DB / Android / 真机 / CI，不读reference，不暂存五个既有dirty。当前main未合并，source任务分支保留；M1真实结果仍在取得中，不进入S11 / G。

- retry中source26与diagnostic source d67各两个成功提炼请求，均因完整json代码块被原parser拒绝，无promotion。累计259 /1012476，无新transport失败。`6c99da07f`支持完整单一JSON围栏，原字段 / target / blind grade门槛不变，source hash含parser；定向7tests / lint / diff / Node20固定worker加载通过，source commit / push后继续。私有raw / error保留，未将旧失败报告重新标为有效。

结束时更新同一Record / live HANDOFF并停止。只有两入口实际全部达标才按既定U7集成、做最小本地检查；当前pending不能合并main。

接手提示词：**读取 docs:HANDOFF.md，继续代劳M1有限自动验收；先核对进程 / lock与Document中同一累计账本和重试checkpoint，不重置额度。仅M1，不进入S11或G。**
