# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-08
- Current checkpoint: **M1两入口九对 /36arm与闭环保持；Step完成18项独立评分，行为改善未达标，pending /不集成。**
- Product branch: `feat/agent-intelligence-runtime@907cf1e87`，已commit /push，product worktree干净。
- 完整comparison Tested HEAD: `cf28cc3de`；Project lifecycle补证 `c0f8ce6b0`，只追加一实际send，旧comparison /partial各自pin。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`；本轮结果基于 `b1ca54852` 续更同一Record / Plan / live HANDOFF；接手核对actual refs。
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

用户授权agent代劳，不要求本人tests /human labels；生产automatic human /price /原预算gate保持。测试API只有每日2000次 /20RPM硬限，token与其它预算只建议，超出通知继续；建议512 /1699536与所有charges /unknown /breached历史保留。

- 原cf完整comparison：RP /Project各三个promotion场景×三次paired trial，九对 /18arm，共36arm原authority /isolation /target_consumed全部通过。RP frozen proposal、Project原公开feedback提炼、primary不利评分原样保留，没有重跑有效比较或学习promotion输出。
- primary：RP3candidate /4baseline /1tie /1uncertain，Project9tie。原RP cf与Project c0已完成私有委托review /原下一Director或Host实际消费 /guarded rollback；RP provenance保持client_observation，Project为host。production objects未修改、automaticPromotion=false、humanPreference=not_observed、currencyCost=unavailable。
- 用户把第二模型改为Step后，三503停止；显式完整URL与旧normalizer实际URL一致，单请求诊断另503，body model_not_found说明Key所在group无可用channel。用户改group后新持久配置epoch三次均HTTP200，但1024全用于reasoning，content空 /length，按不完整响应停止。旧Haiku三500 /Step四503 /三截断历史窗口与费用保持。
- 用户提供MiniMax并明确只作临时候补；Key /独立临时配置600保存、Git exclude，默认Step URL /Key /model保留。MiniMax官方国际OpenAI接口一次401 /invalid api key (2049)，unknown8830保留并认证停止；仅证实本次接口认证失败，随后按用户指令继续原Step，不探测其它区域。
- source907cf只允许test-only independent grader有限8192输出；原resolver /compiler /provider、owner reserve /settle与CLI同一ledger /quota继续计账，judge-only /context /request hash /exact model /max_tokens校验。native evaluator与原cf revision /生产1024限制不变。Step原配置备份，output变化另追加持久fingerprint，同一配置restart不洗窗口。grade-only只补冻结九对，不再提炼、trial、primary grade、发布或消费。
- Step8192本轮18次全部成功，43794reported tokens（RP27058 /Project16736），无新retry或接口错误。RP独立4candidate /3baseline /2tie，两模型一致candidate仅3对；Project独立9tie，candidate胜0。独立评分缺口已补齐，两个入口仍未达到至少六对一致candidate胜与全部非回归门槛。
- 最终累计 **555requests /2127091记账tokens**，含旧carry252 /1000000；恢复期303sends、292reported /11unknown35487、pending0，breached=true仅历史annotation。quota carry332+223admissions=555，id对应原账，minimum3151ms、rolling一分钟峰值10、保守rolling24h峰值555，满足2000 /20。原owner与共享独立charge hashes /tokens一致，无reserved /lock已释放。
- Step summary SHA256 `268a887448ad67d4fca54a30d809222659a67050920d0b90adc9dfaf666386c1`；ledger `1d383c311e34c0b10186cc311d6c9107e3cdf55887bbd32fc540d558307e9c70`；quota `67804494ee460c3f0e4cdf071a5e6679bad9ca49b6bf27ea05dee87c839b757e`。原cf summary `9df6bf648b7775e5c9a7ca2c9a417d168128d6cca7972c7c73bf4365ddcbb3e2`与两个report exact hash保持；native evaluator revision `f8548173b8ffb754052ade6e5bef06dad046d76a01dce3af8c74c06a0c7d752c`不变。其它历史summaries /audit见同一Record，私有原报告均保留。
- 最小本地验证：grade-only恢复4tests、epoch历史2tests与最新2suites /5tests按各source保存，不重复累加；触及lint /diff通过。没有full tests /build /CI /新browser /external DB /Android /真机。五protected dirty hashes保持，reference未读写。Product907cf已commit /push /clean，main为祖先、0 /35，未合并。

## Next checkpoint

**M1 pending /不合并main，仅余行为改善门槛。** 第二模型已可用，九对独立观察齐备；token建议、用户不手测、闭环与API连接不再是当前阻塞。后续仅在既定development /feedback范围复核候选设计、保持promotion隔离；不重复当前有效不利 /tie评分追分。新候选如需验证须另行冻结并沿原累计账本执行。阶段结束仅最小本地验证，更新同一Record /HANDOFF并停止；不进入S11 /G。

接手提示词：**读取 docs:HANDOFF.md，仅续接M1行为改善缺口：核对Git /同一账本与quota，查看原cf九对、已完成闭环和Step18项独立评分；只在development /feedback范围复核候选设计，不重复有效负面比较、不清账。MiniMax仅临时候补，默认第二模型仍Step。token超建议即时告知继续，不要求用户手测，不进入S11或G。**
