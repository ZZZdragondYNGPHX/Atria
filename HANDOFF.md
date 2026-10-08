# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Updated: 2026-10-09
- Checkpoint: 第二模型单次实际评分形态诊断成功，保留API；旧stop不清，M1 pending，不集成，不进入S11/G。
- Product: `feat/agent-intelligence-runtime@63dc0fd44`，commit/push完成；本次只增加failed-report形态诊断。paid优化cycle source仍97a1，原夹具修复da157，接手核对actual refs。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: `docs`，本轮沿同一Plan/Record；执行前核对actual docs HEAD。
- Read: [index](plans/architecture/agent-intelligence-runtime/index.md) → [M1 acceptance §7](plans/architecture/agent-intelligence-runtime/m1-acceptance.md) / [S10](plans/architecture/agent-intelligence-runtime/s10-evolution.md) → [同一Record最新周期/Final state](records/refactor/agent-intelligence-runtime.md)。不重复扫描历史。

## Current result

最新用户要求检查第二模型，失败则暂时放弃该API。Plan §8固定一次Step原失败Project authoring final pair/shuffle/messages形态诊断，max_tokens8000，无retry、不计评分；source63dc0fd44的run-1791478981173-3c395953成功返回step-5-preview完整JSON、finish_reason=stop，reported3601（1426+2175，reasoning2085）。当前可调用，保留API；单次成功不证明稳定或解释历史404，不清原stop/换epoch、不补独立评分。新隔离fixture配置identity不同，不称原完整snapshot复用。两次前置校验零发送，已改读provider包装前的原transport状态和final report pair，报告保留。当前累计702/2721116、450实际sends/433reported/17unknown74948、pending0/lock0，quota carry332+370=702。没有新候选/trial/验收/发布，下面优化结果保留原来源。

S01–S10原Experience/owner/scheduler/targets/worker/CAS/intent/receipt/recovery/rollback及共享消费者仍为authority。ordinary RP非group/exact character PNG/单owner bounded Director≤6；Project原local Skill/user Preset style/pristine Task repair，原单目标和部署边界保持。Production human/price/budget gates不变，humanPreference=not_observed、currencyCost unavailable。原cf28九对/36arm、c0f8消费恢复、907cf Step18观察保持独立历史：RP一致candidate3/9，Project9tie，原M1未通过；旧闭环不能借给新候选。

本续接文本提炼改成最多4项唯一anchor局部edits（或一次append），原evaluator保留未触及base并拒绝full value/whole-base替换、missing/ambiguous/overlap/重复append；integer原value契约保持。实际各提炼一次新候选，都保留base。新RP hash `2dcc9449193c8b688fc3eabf607fadafa506f88a18a00a7618ee692e6f8e4f1f`，新Project hash `02ff0c535d6a59b3781a4fea0a9a899db0fa53f671f61996d4f8ab0934405f6a`；都未冻结取得验收资格，旧候选/评分保留。

- RP有效primary agency候选胜/memory平；variant baseline免费v1挑战加5paid后达到旧refs计数上限，evaluation_runtime_failed，无第三pair/独立观察。两有效partial不拼成完整host报告，不推测第六次结果。
- Project primary三项baseline/candidate/candidate：authoring intent_completion=-4、candidate review_gate失败且single_changeset缺失；baseline get_project/validate→plan/save/review成功，candidate跳过必要实际source读取后reset/catalog/read仍planned。conflict delta0且原authority通过；repair+1且原checks通过。当前过程评分能区分实际轨迹，不反推旧9tie应该改分。规则须区分“有schema”和“已有真实完整source”，本轮不再优化或重试评分。
- Step一次小diagnostic HTTP200/完整{"ok":true}/77tokens，但真实独立grade仍HTTP404，第701次unknown9831。当前8000 Step窗口立即stop/无retry，零有效新独立grade。小probe成功不证明真实grade可用，404根因未确定；此次错误body已discarded，不补造。
- 实测后已修RP免费stale challenge不占actual provider maxRequests=6，Director仍≤6，单独trace和stale authority拒绝保持；cases unit元数据使revision更新。所有HTTP错误改为私有保存≤64KiB body/status/request ID/server与charge，只本地验证，不再付费。
- 未通过Plan development准入（每入口完整3对/双模型至少2一致胜其余tie/重要维度非负/原checks），不执行新v2各九对，不发布/消费/回滚新候选。正式九对6一致胜门槛、评分解释和production gates保持，不追分。

## Sources / accounting

- 最新同一累计 **702 requests /2721116记账tokens**，本次单次诊断+1/+3601；上一优化周期+54/+233619保持历史。carry252/1000000、sticky breached保持。450恢复actual sends，433reported/17unknown74948，pending0/lock0；所有失败/未知usage完整计账，建议超额已即时告知并继续。
- Quota carry332+369admissions=701，minimum3151ms、一分钟峰值11、保守rolling24h701，2000/20硬限通过；54本轮owner id/tokens与shared逐项相同。
- 当前primary evaluation-output8000窗口没有transport错误；旧1024三截断/8000 extraction-only窗口仍保存。默认Step仍step-5-preview，当前8000 grader窗口一404 stop；旧8192/404、503、1024截断、Haiku500、临时MiniMax国际401均保留，server epoch UUID未换。不清账/清stop/随机换epoch，不探测其它区域/模型。
- 此cycle两arm/controller/独立grader均实际8000，test-only原RouteResolver/持久generation profile/compiler/worker/provider；production evaluator1024限制保持。旧8192只作历史。Token超额不是本轮停止理由。
- Paid source97a evaluator revision `e834ba76af3dc3522889bf07b553f753db9cc084a97c850e2abf3952d11acfec`、case set `083adcf442fb7dd98db9fcfb3ee9728a67cc48fe2615122a78d855efcd9bd2f9`；报告原样保留。最终case set `49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b`，variant dev/promotion revisions见Record；inputs/维度/门槛保持，新revision尚无真实重测。
- Private migration Document与凭证仍Git exclude/当前用户ACL，local Git keys指向实际位置；详细raw/partial/owner/quota/hash audit私有保存，无key/endpoint/私有机器路径入公共Git。2700项前轮恢复验证保持历史，不复跑全恢复，不读写reference。

## Validation / next checkpoint

本轮最小7相关suite25 distinct tests按source通过，涵盖局部edits、原consumer定向2、8000原worker/资金结算/窗口保持、development/readiness与九对gate分离、免费challenge+两arm各6paid、HTTP/body证据。触及lint/syntax/diff通过，最后bounded acceptance拒绝本partial且零发送，五累计文件byte SHA不变。没有full test/build/CI、新UI/Android/真机/外部DB。五无关dirty docs hashes保持，不提交它们。

本次API检查到此停止，main不合并，不进入S11/G。Step实际评分形态当前可调用，旧404原因仍未知，不清stop/自动换epoch。正式恢复评分须另行固定有限范围及窗口处理，不将诊断计作验收。保留Project有效-4/两primary胜及RP两partial，若另行授权具体有限优化，先同一Plan冻结source/revisions/范围，修正Project必要source读取边界；修复后的RP variant旧有效pair不重跑。新候选只有development可信改善/无回归后才冻结新独立v2九对与原闭环，用户无需手测。

接手提示词：**核对actual Git，再读docs:HANDOFF→M1 acceptance §8/S10→同一Record，沿702/2721116 ledger/quota/rate/windows。Step本次原评分形态单次诊断成功，保留API，但旧404 stop不清、根因未知，diagnostic不计评分；本轮到此停止。若另行授权正式恢复评分或具体修复，先固定有限范围/窗口处理/source/case revisions，保留97a1 Project authoring-4/两胜和RP两partial，不追分、不伪装验收。原双模型九对六胜/其它tie/无回归及权限、消费、发布、回滚保持，最大输出8000；只最小本地验证，不要求用户手测，不进入S11/G。**
