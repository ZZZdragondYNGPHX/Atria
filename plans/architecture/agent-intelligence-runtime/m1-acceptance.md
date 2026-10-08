# M1 — 自动化工程验收与丢失账本保守结转

- Updated: 2026-10-08
- Status: 已取得真实partial证据，M1仍pending；共享累计账本单笔超报触发sticky breach，后续发送停止。
- 本模块仅管理本轮 M1 工程验收。生产 automatic promotion 的详细权威仍为 [S10](s10-evolution.md)，不改运行时授权或原 human gate。
- 用户明确不愿自己验证，授权agent代劳；对“保守结转旧预算 + 新有限额度 + 自动检查 / 模型盲评，生产自动发布保留原门槛”的确认提问回复“统一”，按上下文作为同意处理。具体数值是已授权方向内的工程冻结，不冒称用户逐项指定。

## 1. 验收语义

M1工程验收采用确定性authority检查、固定独立场景、原实际模型执行与两种模型盲评；不要求用户本人运行tests或提供human labels。报告保留 `humanPreference=not_observed`，不将model observation写入生产human字段。

只评价 ordinary RP / Project 支持矩阵内各一个单目标：RP原character Skill body、Project原user Preset system.style body。原三类目标×双入口的48项 / 历史233项工程authority覆盖保留；两种实测不外推其它目标质量。

每入口三个固定独立promotion场景×三次paired trial，两arm输入、原Route / model / connection / tools / configuration精确固定。提炼只见原公开feedback / diagnosis / declared base，候选在promotion执行前冻结。原固定worker运行Director / Studio / compiler / resolver / provider；每对原blind model judge后，再以不同model identifier的第二连接进行独立shuffle盲评。网关upstream identity未知时仍标unavailable，不将identifier差异称真实厂商独立性证明。

## 2. 自动化工程退出门槛

- 两入口各九对完整独立comparison，无重复槽位 / 混source；evaluator / runner source、actual request / snapshot / usage / charge、originaltarget version与配置固定。
- 两种model observation每对一致且为candidate或tie；每入口至少六对一致candidate胜，其余只能tie；全部重要行为维度非负。invalid / uncertain / 缺失 / disagreement不能补分、伪造、强行通过。
- 原authority / isolation / target_consumed / source与exact配置检查全部通过；实际usage均可核对到持久账本，无当前budget breach。
- trial candidate总tokens不高于baseline；提炼 / 两种judge / retry / activation全计本轮预算并单列。价格未确认时currencyCost=unavailable，工程验收只说明可核对token资源与行为表现，不声称货币费用改善或含学习成本后的净收益。若价格取得则另行报告金额，不推断provider价目或隐藏retry。
- 在私有fixture里通过本次用户委托执行明确review publication，保存原intent / receipt；原下一Director / Project request实际消费已选版本并核对exact snapshot / target；再guarded rollback回原base。工程review不是human preference，也不计automatic eligibility；生产用户对象不修改。
- 原production promotionDecision继续拒绝缺human labels / confirmed price等证据的候选。模型盲评工程通过不触发生产自动发布，也不改默认review / 单目标 / scope / guards。

不达标则记录具体failure与partial证据；不缩减cases / repetitions、训练promotion输出、偷偷更换case或追试至通过。M1工程验收达标后才按既定U7集成与最小本地验证；本轮不进入S11 / G，阶段结束停止。远期任务不标完成。

## 3. 丢失账本恢复设计

原S06ledger / limits / reports在临时目录缺失，用户确认无迁移；不能恢复逐次entries / settled usage或rate checkpoint。历史Record最后110requests /300464记账tokens仍是历史观察，不作为当前精确总量。

新schema沿原test-only `EvaluationBudget`恢复端口增加显式 `historicalCarry`，旧snapshot格式保持兼容。结转 `origin=lost_s06_upper_bound`，requests=252、tokens=1000000，evidenceHash绑定原Record源码；这是整段旧finite guard上界，不是假造252条旧请求。旧history breach状态仍不可核实，当前period breach单独记录；此恢复仅服务已批准的有限工程测试，不取得生产eligibility。

本轮新增最多260次actual sends /699536记账tokens；累计guard含保守结转为512requests /1699536tokens。260由两入口各18trial arms×最多6sends、原18judges、18额外独立judges、2提炼与最多6次activation合计最坏260确定；不是无限重试额度。每个原job仍保持120sends /1000000tokens /一小时，independent与activation另记有界job但共享同一恢复账本 / 本轮总额，不重获额度。

原每日报用户cap2000、20RPM继续约束。串行send间隔至少3150ms，output最多1024，单请求最多300秒，整个本地runner最多两小时；用户2026-10-08要求retry，并明确偶发错误继续、频繁错误停止。HTTP 5xx / transport失败最多追加两次重试，间隔至少10秒，单connection / model连续三次失败或最近20次发送中六次失败即停止；认证、配置、额度与取消错误直接停止，不自动fallback。每次重试重新走原durable reserve / send / settle，未知usage保留upper reservation，不清账、不扩大上述累计envelope；原trial六发送与activation上限仍约束重试。连接失败频率 / 停止状态也持久化，restart不清除。偶发错误可继续采集证据，不等于未知usage取得验收资格。

每次send在Secret lookup / provider之前先durable reserve，新usage未知或取消保留upper；超报sticky breach，restart保留pending并计账，不删历史、换suffix、scope或文件清零。恢复文件有exclusive writer lock，残留lock不绕过；rate checkpoint持久。文件初始化只允许ledger目标不存在，一旦存在必须restore。

## 4. 本地持久位置与执行

用户指定的主目录 `Document/` 是私有持久目录，权限700、凭证 / ledger / report文件600，整个目录由local Git exclude排除。已有两个connection复制到该目录，更新local Git keys引用；不输出Secret / endpoint / 本地路径到Git。migration说明保留old key映射与evidenceHash，旧文件不覆盖；保守结转与本轮实际entries分别可检查。

读取HANDOFF → index → 本模块 / S10 → Record；实际执行入口 `tests/agent-intelligence/m1-live.mjs`，沿原EvolutionService / evaluator与原repository写入；test-only接受判断不能被production endpoint导入。

每阶段及结束只做本地最小相关验证，不触发CI或full test / build。相关tests / lint / fixed-loader checks先通过，source commit后再发送真实请求，报告pin该HEAD与实际source hashes；最终更新同一Record / live HANDOFF，停止。

## 5. 当前恢复前置

共享累计账本存在sticky breach时，runner在模型准备前明确拒绝，不能因累计未耗尽就继续send。先核对provider实际usage口径与output上限、保守input / output reservation设计和所有既有charges；未核实的total不以较小分项和替换。模型 / tokenizer / suffix或账本换新不解除原保护；预算恢复规则需明确复核，不能自动清除breach或扩大冻结额度。

恢复发送资格不等于工程验收通过；已有partial模型回归 / token增加保留，完整九对 / 双模型 / 两入口真实闭环仍按本模块原门槛。实际计数、source与失败证据见同一Record / live HANDOFF，不在Plan复制第二份账本。
