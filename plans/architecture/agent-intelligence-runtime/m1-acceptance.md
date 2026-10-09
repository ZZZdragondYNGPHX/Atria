# M1 — 自动化工程验收与丢失账本保守结转

- Updated: 2026-10-09
- Status: 2026-10-09单次8000局部修改续接结束，累计701/2717515。RP两个有效partial/variant夹具失败，Project两primary胜/authoring严重回归及review gate失败，实际Step grade404；development未达标，新v2九对/闭环未执行，M1 pending、不合并main。
- 本模块仅管理本轮 M1 工程验收。生产 automatic promotion 的详细权威仍为 [S10](s10-evolution.md)，不改运行时授权或原 human gate。
- 用户明确不愿自己验证，授权agent代劳；对“保守结转旧预算 + 新有限额度 + 自动检查 / 模型盲评，生产自动发布保留原门槛”的确认提问回复“统一”，按上下文作为同意处理。具体数值是已授权方向内的工程冻结，不冒称用户逐项指定。

## 1. 验收语义

M1工程验收采用确定性authority检查、固定独立场景、原实际模型执行与两种模型盲评；不要求用户本人运行tests或提供human labels。报告保留 `humanPreference=not_observed`，不将model observation写入生产human字段。

只评价 ordinary RP / Project 支持矩阵内各一个单目标：RP原character Skill body、Project原user Preset system.style body。原三类目标×双入口的48项 / 历史233项工程authority覆盖保留；两种实测不外推其它目标质量。

每入口三个固定独立promotion场景×三次paired trial，两arm输入、原Route / model / connection / tools / configuration精确固定。提炼只见原公开feedback / diagnosis / declared base，候选在promotion执行前冻结。原固定worker运行Director / Studio / compiler / resolver / provider；每对原blind model judge后，再以不同model identifier的第二连接进行独立shuffle盲评。网关upstream identity未知时仍标unavailable，不将identifier差异称真实厂商独立性证明。

## 2. 自动化工程退出门槛

- 两入口各九对完整独立comparison，无重复槽位 / 混source；evaluator / runner source、actual request / snapshot / usage / charge、originaltarget version与配置固定。
- 两种model observation每对一致且为candidate或tie；每入口至少六对一致candidate胜，其余只能tie；全部重要行为维度非负。invalid / uncertain / 缺失 / disagreement不能补分、伪造、强行通过。
- 原authority / isolation / target_consumed / source与exact配置检查全部通过；所有send均可核对到持久账本；usage未知或超建议如实报告，API每日 /速率硬限保持。
- 用户明确无token要求，trial candidate /baseline tokens仅报告、不作工程通过条件；提炼 / 两种judge / retry / activation全计本轮预算并单列。价格未确认时currencyCost=unavailable，工程验收说明行为表现并单列token资源统计，不声称货币费用改善或含学习成本后的净收益。若价格取得则另行报告金额，不推断provider价目或隐藏retry。
- 在私有fixture里通过本次用户委托执行明确review publication，保存原intent / receipt；原下一Director / Project request实际消费已选版本并核对exact snapshot / target；再guarded rollback回原base。工程review不是human preference，也不计automatic eligibility；生产用户对象不修改。
- 原production promotionDecision继续拒绝缺human labels / confirmed price等证据的候选。模型盲评工程通过不触发生产自动发布，也不改默认review / 单目标 / scope / guards。

不达标则记录具体failure与partial证据；不缩减cases / repetitions、训练promotion输出、偷偷更换case或追试至通过。M1工程验收达标后才按既定U7集成与最小本地验证；本轮不进入S11 / G，阶段结束停止。远期任务不标完成。

## 3. 丢失账本恢复设计

原S06ledger / limits / reports在临时目录缺失，用户确认无迁移；不能恢复逐次entries / settled usage或rate checkpoint。历史Record最后110requests /300464记账tokens仍是历史观察，不作为当前精确总量。

新schema沿原test-only `EvaluationBudget`恢复端口增加显式 `historicalCarry`，旧snapshot格式保持兼容。结转 `origin=lost_s06_upper_bound`，requests=252、tokens=1000000，evidenceHash绑定原Record源码；这是整段旧finite guard上界，不是假造252条旧请求。旧history breach状态仍不可核实，当前period breach单独记录；此恢复仅服务已批准的有限工程测试，不取得生产eligibility。

2026-10-08用户明确：“无token要求，测试API的硬上限仅为每日2000次调用，20RPM，其他仅为建议，如果超出建议预算只需告诉我即刻，无需停下”。此指令覆盖早期260新sends /699536tokens、含carry512 /1699536及单笔upper的硬预算语义：原数值保留为建议与历史记录，达到 /超过时立即通知并继续，不清除旧breached、entries或unknown。M1工程token非回归 /usage可得性同样仅作统计与提示，原请求资金 /charge关联、实际执行与评分证据仍须完整；生产预算 /human /price gate不改变。

API唯一硬限为每日2000次 /20RPM。为避免未知日重置时区，CLI采用保守滚动24小时2000次上限，两个连接与所有retry /judge /activation共用持久quota；迁移时以现有累计332作为单一aggregate carry、从当前时间保守计24小时，不伪造旧逐次timestamps。新admission保存实际requestId /timestamp，先持久计quota与累计账本，再Secret lookup /provider。串行至少3150ms、额外滚动一分钟检查，restart保持quota /rate，不清账。

共享EvaluationBudget增加仅显式test CLI使用的advisory模式；默认legacy strict保持。原Product repository不变；仅私有fixture使用test-only subclass沿原mutateOwner /校验 /存储保存reserve与settle，实际tokens照录，不将token建议超额设为新hard breach。旧累计breach保留为历史观察，旧private owner不改写。所有token未知 /超建议分别报告，不以较小分项和覆盖provider total；生产promotionDecision仍使用严格原repo与gate。

固定case /Director步骤 /输出配置 /请求timeout继续管理一次有界实验，不进行无限重试或追试至通过。HTTP5xx /transport或不完整响应每请求最多追加两次，至少10秒；连续三次或最近20次六失败停止该连接，认证 /配置 /取消立即停止，满足用户先前“偶发继续、频繁停止”要求。每次retry都有独立durable charge，失败上界保留。不完整响应只指缺必需tool output、JSON /tool arguments无法完整解析；raw /fee保存，不修复输出，不对有效不利 /tie /uncertain评分追试。body不完整替换header成功观察，同一实际send不重复计失败次数。锁与rate /quota checkpoint持久，残留lock不绕过。

RP继续使用先前实际付费提炼、已冻结且尚未发布的同一候选；source proposal /charge /base /target与原公开feedback身份核对，不把旧promotion输出送入学习。重新完整执行3场景×3次paired trial，不导入旧八对取得资格、不虚构新提炼费用；Project仍在原feedback /base上提炼一次候选。新结果独立报告，旧partial原样保留。

## 4. 本地持久位置与执行

用户指定的主目录 `Document/` 是私有持久目录，权限700、凭证 / ledger / report文件600，整个目录由local Git exclude排除。已有两个connection复制到该目录，更新local Git keys引用；不输出Secret / endpoint / 本地路径到Git。migration说明保留old key映射与evidenceHash，旧文件不覆盖；保守结转与本轮实际entries分别可检查。

读取HANDOFF → index → 本模块 / S10 → Record；实际执行入口 `tests/agent-intelligence/m1-live.mjs`，沿原EvolutionService / evaluator与原repository写入；test-only接受判断不能被production endpoint导入。

独立评分补测使用 `--grade-only`，只重开原私有fixture，核对原report /九对 /charges与native evaluator revision，不重跑提炼、trials、primary judge或publication。用户授权无token硬限后，独立grader允许显式有限8192输出以容纳reasoning；test-only `m1-grader.js` 仍使用原RouteResolver、固定worker bridge的compiler /snapshot /render、原provider和同一owner reserve /settle，再由CLI共享账本 /quota包裹。仅允许judge arm与independent job，核对request hash /exact endpoint /model /max_tokens /context，失败unknown保留完整input+output预留。原native evaluator与生产1024限制不修改，原比较revision /报告不覆盖，补评分source另pin。

用户提供MiniMax订阅Key并限定其只作临时候补；默认第二模型保持 `step-5-preview`。仅显式 `--temporary-secondary` 可选私有候补配置且只允许grade-only，凭证600 /Git exclude。候补不可用立即按原认证 /频繁错误规则停止该连接，继续原第二模型，历史失败窗口和费用不清除。用户报告server group更改后用持久显式epoch区分实际配置；后续将grader output从1024改8192时追加output fingerprint，同一配置restart不新建窗口，旧HTTP503 /不完整响应stop原样保留。

每阶段及结束只做本地最小相关验证，不触发CI或full test / build。相关tests / lint / fixed-loader checks先通过，source commit后再发送真实请求，报告pin该HEAD与实际source hashes；最终更新同一Record / live HANDOFF，停止。

## 5. 继续执行规则

按用户最新明确授权，历史token超报不会阻止本轮测试。保留原账与overrun记录，仅改变预算执行模式，不解锁生产对象的预算或自动权限。超过任何建议预算立即通知用户并继续；真正达到API daily /rate硬限或原频繁错误阈值时按实际原因停止 /等待，完整工程行为门槛仍保持。

旧partial的主模型回归事实继续保留；token增加成为统计。cf实测两入口各完整九对、36arm原检查全部通过，RP主模型3candidate /4baseline /1tie /1uncertain、Project9tie。RP cf与Project c0恢复均已完成私有review /实际next-run消费 /guarded rollback；没有重跑比较拼资格。旧第二模型三连续HTTP500及Step旧503 /截断失败均保留；MiniMax临时国际接口401后按用户要求回到Step，8192有限输出取得RP4candidate /3baseline /2tie与Project9tie，两模型一致candidate分别3 /0；补测只增加独立观察。行为改善门槛仍不达标，不能因连接修复或token规则改变宣称M1通过。实际来源 /费用 /hash见同一Record与live HANDOFF。

## 6. 2026-10-08 有限优化周期

本轮仅一次优化：旧候选 development 诊断 → 原 Experience 公开反馈/诊断 → 单目标新候选 → development 收益和回归检查 → 冻结 → 一次新独立验收。两个 development 检查各为每入口三场景各一次 paired trial，双模型观察；不重试有效不利、tie、uncertain。development 输出允许指导修改，永不计入独立验收。

Project 原评审只接收最终 source JSON，遗漏计划、公开说明及修复/冲突轨迹。补充这些原消费者可观察行为，继续使用原 intent_completion / conflict_handling / repair_quality 维度与原解释，不降低门槛。旧报告及其 source/revision/hash 原样保留，新报告 pin 新 evaluator 与 case revision。

新 promotion 使用 synthetic:v2，与旧 v1/本轮 development 分离：同六类场景、不同输入/名称/时间修订与公开行为要求。候选提炼只读取 development/公开反馈/原 base/诊断；不向提炼提供 v2 promotion fixture 或输出。新候选必须在实测前保存 exact value、来源 development report hash、原反馈/诊断与 configuration pin。每入口仍三场景×三次/九对、至少六对双模型一致胜、其它一致tie、重要维度无回归，全部原 authority/isolation/消费及私有 publication/下一run/rollback 门槛保持。

沿同一555次累计 ledger/quota/rate/失败窗口，不覆盖旧文件；默认Step8192 independent grader。最多一次 baseline development、一次优化 development、一次冻结候选验收，不增加下一轮。若 development 未显示可信改善仍可取得一次冻结候选的失败验收证据，不追分、不合并main。生产human/price/预算gate保持；完成同一Record/HANDOFF并停止，不进入S11/G。

首次 development 的 RP 三对及双模型评分完整；Project 尚无有效 pair 时一次 HTTP header-success/body-timeout 被原300秒Route中断。保留原 partial/全部 charges，只允许单次 Project-only continuation 补完其三对，RP 不重跑/重评分；组合 development 来源分别 pin 原始 summary/hash/HEAD。CLI 每次 transport/body 的时限缩至原Route的四分之一（最多80秒），使三次 funded attempts 与原10秒 backoff 能在原300秒Route内完成，不改原Route配置。header成功后body失败重新分类为一次失败，保存旧窗口备份/归因，保留全部历史失败、最近窗口与费用，不清账或另开epoch；真正取消/认证/频繁错误仍停止。

Project-only continuation 已取得 authoring/conflict 两项有效 development pair（primary 均baseline）；repair baseline 正文失败后 error-wrapper 对 numeric DOMException.code 的缺陷中断，未取得repair pair或Project independent观察。该partial只作诊断材料，显式保留缺失，不计完整baseline，更不计验收；不再复跑旧候选。修复wrapper并记入失败窗口后，基于上述两个development pair及完整RP development一次提炼新候选；新候选仍执行每入口三项完整development与双模型，再冻结一次九对独立验收。此调整收窄探索范围，不改变工程通过门槛、评分解释或独立验收材料。

新RP候选仅一次提炼；agency/memory 已取得有效primary观察（candidate/baseline），variant未完成请求因transport分支同一numeric-code缺陷中断。保留两个有效pair/评分及失败费用，只续接缺失的variant和未开始的新Project development；原RP候选正文/来源hash固定，不再提炼，不重复有效pair。旧两项与新variant分别pin来源，不拼成伪造的单源host report；development summary逐case列出来源/结果，独立观察各只取得一次。最终九对promotion仍完整同源、新鲜执行，禁止过滤promotion cases。失败窗口从原555 checkpoint逐条重放本轮实际ledger/raw-response（并保存此前修正备份），精确补录超时/不完整响应，原stopped窗口/费用不变；只停止当前实际连接，历史候补stopped不误挡默认Step/primary。

用户随后明确将截断响应的输出上限提高至8000。仅补尚未取得完整候选的Project提炼；test-only原compiler/provider提炼快照固定8000并增加持久extraction-output fingerprint，旧1024三截断窗口、Step404窗口和费用全部保留。同一8000配置重启复用窗口，不得再增加epoch。原primary comparison /production1024边界保持；不重跑已有效RP development或旧评分，Step404不因输出变更取得重试授权。取得完整提案后仍须development检查；当前连接stopped时提案只保存为未验证，不冻结、不运行promotion或发布，不视为M1通过。本轮仍到此有限收尾，不进入S11/G。

本周期最终结果：本轮92次/356805记账tokens，累计647/2483896。新RP主模型2candidate/1baseline，variant重要维度continuity=-1且偏好/维度不一致原样保留；新Step零有效/HTTP404。Project8000仅一次提炼成功，未完成development；新候选均未冻结取得资格，v2九对与新闭环未执行。旧完整比较/18独立观察/闭环保持独立来源。完整failed/partial/unknown和新提案来源固定在同一Record；当前comparison旧1024 stop和Step404 stop保留，8000提炼窗口成功，不清账或自动新增epoch。本轮停止，不合并main，不进入S11/G。后续新请求最大8000，旧8192仅保留历史；若另行获准修改比较envelope，先冻结同一Plan/source/configuration再执行有限验证。

## 7. 2026-10-09 有限续接

用户在前轮停止后明确“继续”。从实际647/2483896 checkpoint沿同一账本/quota/rate/windows续接，只做当前M1缺口，不进入S11/G。先执行一次独立funded Step诊断，保存错误body/request ID，max_tokens≤8000，无retry、不清原404 stop，也不当独立评分；原8192配置只保留历史，新生成快照将grader输出截到8000，production/native1024不改。诊断入口沿原compiler/resolver/provider、owner/shared reserve/settle，无其它接口/区域/模型探测。

若真实body确认本地可修配置错误，按actual变更固定source/configuration后再有限续接未完成材料；若认证/channel配置需用户或provider处理，保留stop与所有费用，只完成可独立的候选base保持/诊断修复及最小本地验证，再Record/HANDOFF收尾。不能自动增加epoch、以降低输出限解除404、把成功diagnostic当评分，或重跑已有有效不利/tie/uncertain。新Project8000提案尚未验证，原base保持失败不得称最小修复通过；v1 development已经指导修改，仍不冒充独立v2验收。任何新实验envelope在实际付费比较前固定本模块，原每入口九对/双模型六胜/其它一致tie/重要维度非负及authority/消费/闭环门槛不变。此续接至多一次具体候选修复与development→冻结验收，不无限优化。

单次Step诊断d281实际HTTP200、完整{"ok":true}、reported77，累计648/2483973；旧404根因仍未知，历史stop不清。用户指定最大8000落实为本续接两arm/提炼/primary judge/独立grader统一输出8000，test-only沿原RouteResolver、原持久私有generation profile与原compiler/worker/provider；production evaluator1024边界不改。primary固定evaluation-output:8000，Step沿同一server epoch仅追加actual graderOutputTokens8000 fingerprint，旧8192/404完整保留；这同时绑定实际配置变化与成功诊断证据，不用随机epoch或单纯改输出解锁404，同一配置restart复用窗口，后续错误仍原规则停止。上一1024提炼stop与8000 extraction-only成功窗口分别保持。

本续接只生成每入口一个新候选：文本提炼采用最多4项原文唯一anchor局部edits（或空anchor单次append），原evaluator确定性应用并保留未触及base，拒绝整段value替换、whole-base替换、missing/ambiguous/overlap/重复append，数值目标原value契约不变；仍原target prepare/check/CAS，无新有效配置authority。feedback/diagnosis只来自前轮development及公开输出，RP补具体记忆表达/场景连续回归，Project补原base保持/明确review/避免planning绕行与conflict失败；不送v2 promotion材料。旧候选/不利评分不覆盖。

一次新development：每入口v1三场景各一paired trial，双模型各单次评分，source/configuration同源固定；全量已有旧development仅作修改来源。若缺真实收益、重要维度回归/分歧或接口stop，不进入新promotion，保留完整failed/partial证据并停止，不再修改/重提炼本轮候选。只有development全部完整且双模型至少2/3一致candidate、其它一致tie、重要维度非负及原checks通过，才冻结exact新候选并执行一次未使用synthetic:v2每入口九对验收与原私有publication→下一run消费→rollback。此development准入不降低正式九对六胜门槛；验收有效不利/tie/uncertain均不重试，未达标不合并main。工程humanPreference=not_observed/price unavailable保持，不伪造人工证据。有限续接完成后提交推送同一Record/Plan/HANDOFF并停止，不进入S11/G。

本续接实测97a1结束：RP有效primary agency胜/memory平，variant baseline在免费stale challenge加5个付费请求后达到旧夹具refs计数上限，缺第三pair/独立观察；Project三对primary baseline/candidate/candidate，authoring intent_completion=-4且candidate review gate失败。Step小diagnostic成功不代表真实grading请求可用，实际第701次独立评分仍HTTP404/unknown9831，立即stop且不retry。未达到development准入，不执行新v2九对或新闭环；原有效不利结果不改、不重跑，本轮不再优化候选。

付费结束后仅本地修复：RP variant免费注入挑战不再占actual provider maxRequests=6槽位，Director仍maxRounds≤6，stale authority挑战仍保留且单独trace；cases增加actual_provider_send单位/一次injected challenge，caseRevision/CASE_SET_REVISION按元数据自然更新，旧97a1实测单独pin旧revision，不覆报告、不据此推定第六次真实调用会成功。不改变评分维度/解释、门槛、试验对数或权限要求，不再发API验证此修复。CLI所有HTTP失败改为私有保存最多64KiB body/status/request ID并关联charge，原unknown上界保持；本次701的body已discarded，不能补造。最小零API回归后，验收入口必须拒绝本partial，并核对累计五文件字节不变；然后同一Record/HANDOFF收尾停止，不进入S11/G。

本次最终product da157f3e9已commit/push，paid结果固定97a1/d281；累计701/2717515、unknown17/74948、pending0/lock0，quota/rate通过。最后零send acceptance入口拒绝partial，五累计状态字节hash保持；7相关suite25 distinct local tests按source通过，未运行无关full/build/CI。所有旧/新失败及评分来源保留，同一Record/HANDOFF更新完成，本有限续接到此停止，不进入S11/G。

## 8. 2026-10-09 第二模型可用性检查

用户明确要求检查第二模型，不能调用则暂时放弃该API。沿实际701/2717515及同一ledger/quota/rate/失败窗口，只允许一次Step原失败Project authoring独立grade形态的funded诊断，固定原pair/shuffle/messages来源与输出8000，无retry；该请求不计评分、不替换任何旧结果、不重跑trials或提炼。不清stop或另开epoch，不探测其它区域/模型。HTTP错误保存原body/status/request ID并关联charge；若失败，当前Step API暂时停用，缺第二模型时M1双模型验收仍pending，不降门槛或合并main。仅最小本地验证，更新同一Record/live HANDOFF后停止，不进入S11/G。

结果：product source63dc0fd44，单次实际请求成功返回step-5-preview完整preference/deltas/rationale JSON、finish_reason=stop，reported3601（input1426/output2175，其中reasoning2085），累计702/2721116，无retry。保留该API；这只证明当前该形态可调用，不证明持续稳定或解释旧404，不清原stop、不计独立评分。原final report pair/shuffle/messages固定；诊断新建隔离fixture，configuration hash与旧不同，不能声称整份旧snapshot复用。两次前置校验因provider wrapper/中间onPair身份与final report身份差异拒绝，均零发送，修正后才进行唯一真实诊断。未修改候选或重新执行验收，M1仍pending、不进入S11/G。

## 9. 2026-10-09 来源读取修复的有限周期

用户再次明确“继续任务”。从实际702/2721116沿原ledger/quota/rate/失败窗口，本轮只生成每入口一个新局部候选，Project依据97a1 authoring -4/review失败明确“tool schema不等于完整authoritative source；必要source读取不可省略，取得来源后才避免重复探索”；RP依据原development自然记忆表达/场景连续反馈，旧partial不冒充完整验收。候选经原Experience correction/reflection/diagnosis及原提炼/targets/CAS，不手写结果；若正文与已测候选完全相同则不重跑有效评分。原局部edits契约与base保持沿用，不重写算法或建立平行authority。

正式恢复Step的依据为§8原评分形态成功诊断及本次用户继续授权；仅本有限周期最多24个独立评分send（development6、符合准入才promotion18），保留同一transport key/epoch/全recent、consecutive和stopped历史，不清stop。test-only增加一次显式续接许可，durable记录诊断证据与实际消耗；仅允许旧404且最新诊断成功的当前Step key，任何新Step失败或不完整响应立即撤销本周期许可、暂时停止API，无追试。restart/重复development不能自动重新取得许可；原primary有限transient retry/频繁错误规则保持，quota/rate/所有usage如实累计，8000输出保持。

本轮development固定当前case set49c56c12126aff08c83465f83412d2acb2aa6417e4183b25d7cbebe59f63b54b，每入口三个v1场景各一次新candidate/baseline比较及双模型单次评分，免费stale challenge不占actual六次send的已修正revision保持。已有旧评分与候选不覆盖、不改解释；本轮无第二次修复或重提炼。完整双模型≥2一致candidate/其它tie/重要维度非负/原checks与funding全通过后，才冻结候选并执行一次v2每入口九对/六一致胜及原publication/next-run/rollback。若development失败则不发promotion。v1已用于诊断，不冒充未见材料；v2未作为提炼输入，来源隔离及revision沿§6/7，合成案例只证明有限工程效果，不能称真实用户反馈泛化或持续自迭代已验收。原生产human/price/budget gate保持；只最小相关验证，提交推送同一Record/live HANDOFF后停止，不合格不合并main、不进入S11/G。
