# M1 — 自动化工程验收与丢失账本保守结转

- Updated: 2026-10-08
- Status: 用户明确测试API仅每日2000次 /20RPM硬限；token与其它预算改为建议，超出立即报告并继续。真实九对 /两入口闭环已取得，行为改善未达标；Step已补齐18项独立评分，M1仍pending，实际结果见同一Record。
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
