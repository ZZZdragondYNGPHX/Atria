# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-08
- Current checkpoint: **M1真实验证已完成：两入口各九对 /36arm与私有发布消费回滚；行为改善未达标，第二模型三连续500停止，pending /不集成。**
- Product branch: `feat/agent-intelligence-runtime@c0f8ce6b0`，已commit /push，product worktree干净。
- 完整comparison Tested HEAD: `cf28cc3de`；Project lifecycle补证 `c0f8ce6b0`，只追加一实际send，旧comparison /partial各自pin。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`；本轮前置记录commit `e09d7c812`，结果已更新同一Record / live HANDOFF；接手核对actual refs。
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

## Current M1 result / budget

用户授权agent代劳，不要求本人tests /human labels；按[m1-acceptance](plans/architecture/agent-intelligence-runtime/m1-acceptance.md)复核工程结果，生产automatic human /price /原预算gate保持。用户最新明确测试API仅每日2000次 /20RPM硬限，token及其它预算只建议，超出立即报告并继续；原建议512 /1699536数值与所有charges /unknown /breached历史保留。

- cf完整comparison：RP /Project各三promotion场景×三次paired trial，九对 /18arm；共36arm原authority /isolation /target_consumed checks全部通过。RP使用原source6c付费冻结proposal，Project独立原公开feedback提炼；旧partial与有效不利评分保留，不混source拼资格、不训练promotion输出。
- 主模型RP：3candidate /4baseline /1tie /1uncertain；Project：9tie。没有达到每入口至少六对两模型一致candidate胜 /全部非回归门槛。第二模型RP独立盲评连续三次HTTP500，三笔unknown1661各自保留，持久stopped=m1_http_500；没有成功第二模型评分，Project /恢复在reserve前拒绝同连接，不重置失败窗口。
- cf新增170sends /647103tokens。主模型Project一次transport失败保留4953unknown，追加funded retry成功；其它新primary无失败。累计token与request建议分别超过后即时通知继续；日调用 /RPM没有触发停止。
- RP cf已完成私有委托review publication /原下一Director真实四send /exact消费 /rollback，client_observation provenance保持。Project cf先publication成功，下一Host因两个Studio Routes未指定Route而报歧义；本地test-only修复并恢复原保存夹具，保留report /current publication身份、原comparison pin，不重跑trials /grading /提炼、不重新发布。
- Project恢复另外定位发布binding metadata导致whole config hash不同，以及原GenerationService冻结secretPort与wrapper改写冲突；前三次恢复均零API send /原528账不变、报告保留。最终c0使用原明确Route与稳定secretPort，核对实际Prompt /transport /resources及原publicationCurrent，追加1个真实Host request /204tokens，Host activation、exact snapshot /program与rollback均核对，nextRunConsumed /baseRestored=true。两入口闭环齐备，production objects未修改 /automaticPromotion=false /humanPreference=not_observed /currencyCost=unavailable。
- 最终累计 **529requests /2063807记账tokens**，含旧丢失guard carry252 /1000000；恢复期277实际sends、271reported /6unknown20542、pending0、breached=true仅历史annotation。旧5389 /5217 unknown未覆盖。Project成功trial reportcandidate153468，实际candidate40sends记158421含unknown4953，失败费用不隐藏；全部细分见Record。
- API shared quota carry332 +197新admissions =529，id与累计账一一对应，最短3151ms、rolling一分钟峰值10、rolling24小时含保守carry峰值529。不是精确当天历史调用统计；不伪造旧timestamps。owner与共享账charges一致、无pending，lock已释放；Document700 /credentials600 /local Git exclude，连接仅由原五local Git keys指向，值不入Git。
- comparison summary SHA256 `9df6bf648b7775e5c9a7ca2c9a417d168128d6cca7972c7c73bf4365ddcbb3e2`；Project lifecycle summary `25b2e01281521719dc3879f6c4954a742bf16eea36f9fc9e928eb07ce9d57b39`；ledger `50ee44cbde864fc03cf5e556f98018d2e6c048086c7803ed9d06fef271fbdab1`；quota `837f31d47ba55dea281c81badbbaded4328e78132c7c7f4e2afdb31d49f1a1c6`。native evaluator revision仍`f8548173b8ffb754052ade6e5bef06dad046d76a01dce3af8c74c06a0c7d752c`。
- 最终恢复2distinct本地tests /触及lint /diff通过；此前cf retry7 /response2、c997 quota4 /recovery4 /engineering5 /retry6保持原source，不重复累加。未执行full tests /build /CI /新browser /external DB /Android /真机；五protected dirty hashes与旧Record保持，reference未读写。

## Next checkpoint

**M1 pending /不合并main。** token建议与用户不手测均不是阻塞；剩余是行为改善与可用第二模型独立评分。先在已有development /feedback范围复核候选设计、保持promotion隔离，再处理第二模型连续500的连接问题；已有有效baseline /tie /uncertain不盲目重跑追分。旧失败 /partial /未知费用与持久stopped保持，生产原门槛不改。相关任务完成后只做最小本地验证，更新同一Record /HANDOFF并停止；不进入S11 /G。

接手提示词：**读取 docs:HANDOFF.md，仅续接M1验收缺口：核对Git /同一账本与quota /stopped连接，查看两入口完整九对与已完成闭环；按原development范围复核候选及第二模型500问题，不重复有效负面比较、不清账，token超建议即时告知继续，不要求用户手测，不进入S11或G。**
