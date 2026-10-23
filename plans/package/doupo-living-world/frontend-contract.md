# 前后端共用契约 — C0 语义与 C2 实际接口

状态：C0 语义继续生效；C2 记录 0.1.0-be.2 的实际后端接口与证据边界。正式前端待集成。

v0.15范围：NPC自主成长、NPC/NPC后台战斗与功法/装备/道具损耗属当前新增世界规则，实际字段待实现后更新。完整玩家战斗按D33未来独立实施；下述F07既有接口和v0.14候选玩家战斗/约束表现保留原适用范围，不据此要求本轮新建完整玩家战斗机制或界面，也不将后台NPC冲突伪装为当前C2已支持。

玩法权威归[领域模块](index.md#模块路由)，分工归 [execution-split.md](execution-split.md)。BE 核实真实能力后在本文件逐项补入实现映射和状态，形成可供集成使用的实际契约；无需为了 C0 另建通用 dispatcher、服务层或兼容双轨。

## 能力与界面覆盖表

F01–F12 是本项目协作编号，涵盖首批范围。前端表现文档逐项映射；每项可有多个页面，不要求每项独占一屏。实际实施状态见末节 C2 映射；框架底座或规则代码存在不等于对应玩法已完整验证。

| ID | 能力 | 玩家视角所需数据 | 操作意图与结果语义 |
| --- | --- | --- | --- |
| F01 | 新局与自创角色 | 可用出身、本土/穿越选项、资格、初始预览和校验原因 | 创建角色并进入实际起点；人物、物品与关系由权威初始化 |
| F02 | 地点场景、对象与移动 | 当前地点、权威坐标、可见对象/角色、已知阻挡、可接触条件 | 选中/预览不推进时间；移动、自动接近与交互按路线耗时及实际结果结算 |
| F03 | 自由文字、对话与行动结果 | 当前目标和上下文、已提交对话/结果、可用动作、任务状态 | 发送文字与按钮进入相同规则；保留未提交草稿，过期目标不静默改发给新人 |
| F04 | 世界地图与旅行 | 已知地区/地点/路线、可达条件、玩家已知风险、同行与准备 | 选择/查看不消耗时间；出发有耗时、资源及途中事件，未制作地区如实说明 |
| F05 | 主角、成长与修炼 | 自身境界、积累、功法斗技、资质条件、伤势、可行修炼/炼药活动 | 学习、修炼、突破、休息和基础炼药按能力/材料/时间判断；禁止凭文案补齐条件 |
| F06 | 行囊、交易与分配 | 合法可见库存/数量/归属、当前报价和实际交易条件、共同物资 | 购买、出售、赠与、交换和分配原子校验；失效报价/不足资源有明确原因，不能重复扣取 |
| F07 | 分段战术交锋 | 参战者可见信息、位置/距离、行动条件、自身斗气/伤势、最近结算 | 战术按钮或文字按同一阶段规则执行；移动/攻击/施技/撤退/投降有真实后果 |
| F08 | 人际关系与家庭 | 已知身份与亲属、公开婚姻状态、已知承诺/往来、家庭资源与共同生活安排 | 交往、邀约、同行、表达/协商、照护及家庭安排是提议或行动，NPC 可按自身意愿回应 |
| F09 | 见闻、线索与机会 | 玩家获知的线索/来源/时效、个人原著记忆、调查与机会已知状态 | 查阅/筛选无时间成本；调查、采集、救援、竞争按事实进行，传闻不当作当前真相 |
| F10 | 手动/自动保存与恢复 | 实际存档标识、地点/时间摘要、手动/自动类型、可加载状态 | 保存已提交时点；恢复产生对应历史分支，未来任务与世界状态隔离，UI 重取新投影 |
| F11 | 长期活动、世代与人口变化 | 自己的活动/约定、获知的出生/迁入/死亡/迁居/继任等消息、可解释后果 | 长时活动有时间与中断结果；动态人物以稳定身份出现，历史人物仍可查询；世界全量人口数不默认向玩家公开 |
| F12 | 宿主控制、等待和异常 | 当前运行/提交/生成状态、对应可用控制、可理解失败与恢复动作 | 宿主退出/停止/保存等保持可达；取消范围按真实能力，编辑和查看安全信息不推进时间 |

家庭、NPC–NPC 日常、动态人口与历史不能只在测试里成立；BE 必须为首批实际互动提供可消费结果，FE/集成不得将其降为装饰标签。

## v0.14 候选扩展 — 不属于 C2 已实现接口

全角色关系图谱与复杂连续因果已经进入玩法目标，细则归 [social-graphs.md](social-graphs.md)、[npc-agency.md](npc-agency.md) 和 [world-simulation.md](world-simulation.md)。以下仅定义后续玩家可见语义，当前 be.2 的 screen/schema/binding 没有因此新增字段。

| 关联能力 | 候选读取与操作语义 | 可见与控制边界 |
| --- | --- | --- |
| F08/F09 社交圈 | 本人认识的人、已知第三方联系、共同经历/义务、来源与时效，调查后逐步修正 | 未知与已否认分开；不读取NPC私图、隐秘敌意或家庭实时位置；查看不推进时间 |
| F02/F04/F07 遭遇与活动变化 | 已察觉的接近/追踪/冲突、当前活动暂停和已付代价、规则允许的回应 | 不显示未察觉的敌人计划；NPC行为可改变处境，用户控制自己的下一行动 |
| F03/F09/F11 连续经历 | 按本人获知顺序查看事件与线索，原计划剩余部分和多目的部分结果 | 不强制复刻预设剧情，不用叙事补齐未知幕后；拒绝/迟到/失败保留实际后果 |
| F07/F12 约束与恢复 | 被扣留等真实状态下可用的交涉/求援/脱离行动，活动中断及保存恢复反馈 | 具体动作尚未实现；可用项依据真实状态，不能靠UI解锁世界约束或代玩家接受承诺 |

后续由BE提供受权限约束的实际投影、动作、历史引用和恢复证据，再更新契约版本；不自造一套浏览器关系存储，也不将候选图谱伪装成现有screen返回值。

## 读取、动作与显示边界

| 概念 | 共用语义 | 实施注意 |
| --- | --- | --- |
| 身份与版本 | 稳定人物/对象 ID，当前 Session/分支/修订与所选目标关联 | 借用既有身份与 exact revision；这些是语义要求，实际公开字段由 BE 确定 |
| 场景投影 | 静态场景资源和玩家允许看到的动态状态组成当前画面 | 不把全世界 Domain 原始记录直接送入浏览器再靠隐藏样式遮秘密 |
| 选择、草稿与偏好 | 选中对象、打开面板、文本草稿、镜头和布局属于表现状态 | 复用前端声明的 state/prefs；不能由 localStorage 权威写入生死、资源、时钟或关系 |
| 可用动作 | 具备明确对象、所需输入与已知不可执行原因 | UI 的可用提示不代替提交时再次校验；不能把秘密条件直接变成精确提示 |
| 提交与结果 | 提交带真实目标及宿主所需来源/修订/请求身份；结果有已提交、拒绝或仍待处理的区别 | 复用现有 CAS、receipt 和幂等，不以客户端布尔标志证明事务已发生 |
| 后续读取 | 权威成功后重读相应投影，或消费既有更新机制 | 现有 Bridge Action 返回实际 receipt，成功公开 payload 为 `{}`；不假造它直接返回整份世界快照 |
| 模型任务 | 意图解析、判断、叙事有各自状态；表达失败不逆转已提交事实 | 将规则结算与生成表达区分；只重试允许的步骤，不能自动再扣资源或再做交易；真实 Provider 重试可能产生新费用 |
| 信息来源 | 可区分亲见、转述、原著记忆与已失效线索 | 玩家不默认看到 NPC 私有评价数值、未发现宝物、远方死亡或世界人口精确总数 |
| 页面列表 | 有稳定键、界定可见范围和必要分段/分页 | 不要求每次画地图就加载全部人物历史；先使用既有 collection/projection 能力 |

当前原生前端依据为 `main:src/native/authoring-examples/frontend-v3/README.md`：`.aui`/Controller/Canvas 表现状态不写 World/Session；Host Bridge 已有 typed read/action/operation 等边界。它们是映射依据，C0 不另立新的通用 HTTP API。真正需要新增框架能力时，以已复现的阻碍和最小修补为依据。

## 操作中的状态与恢复

以下是界面应表达的语义，不是要求 Host 增加同名状态枚举：

| 情况 | 前端应表现 | 后端/集成应保证 |
| --- | --- | --- |
| 选中或编辑中 | 明示目标，草稿保留；可看资料和预览 | 世界时间与资源不变 |
| 正在提交/结算/长时推进 | 尽快显示受理/进行中；阻止相冲突的重复行动 | 同一提交不重复结算；有真实进度才显示百分比 |
| 已结算、叙事仍在生成 | 已发生事实与等候的表达分开 | 重试表达不重新执行动作；新冲突动作按实际串行规则处理 |
| 动作拒绝或目标过期 | 在原位置给原因和修正入口，保留输入；目标变化需用户可察觉 | 不可执行动作不虚构成功；已发生的部分耗时/移动不能被 UI 撤回 |
| 结果不明/连接中断 | 显示确认结果中或对应失败，按既有能力重新观察 | 不直接当失败重新发送新的非幂等行动 |
| 保存成功、刷新失败 | 保留保存成功并只重读列表 | 不因后续读取失败而再提交保存/动作 |
| 停止或取消 | 说明停止的是生成、未完成计划还是本地动画 | 取消不倒退已提交世界；已有耗时、伤势、交易仍依真实结果存在 |
| 正在载入/分支已切换 | 暂停旧动作，重新确认目标与场景；旧草稿若保留需重新绑定确认 | 旧分支响应不能覆盖新分支，未来任务不写回，界面缓存不泄露未来事实 |
| 死亡、离场与名额满额 | 只呈现玩家已知结果与实际可做的事情 | 不显示“为腾名额删除 NPC”；满额候选的处理遵守世界人口规则 |

键盘/IME、可聚焦对象列表、缩放、弹层焦点、减少运动和等待期间的草稿属于 FE/集成验收；动作幂等、分支隔离、计数并发和路径可达性属于 BE 验证。双方都使用同一状态含义。

## C2 — 2026-10-21 后端实际接口

游戏版本 `0.1.0-be.2`；Package ID `pkg_723cdd67122beffdac73f3dfe5c9f64e`，PackageVersion ID `pkgv_7c88452886975acbfe72d2af6c59b44f`。所需源码已本地集成 main，HEAD `a9a914c66141daaf7ab9ae26119a506444d73698`；资产与远端同步以 Record 的最终提交为准。C2 替代旧 C1 的实施映射，C0 语义继续生效。正式前端仍待集成。

### 唯一声明与载入

- `package:doupo-living-world/tools/build.mjs` 构建 Manifest、Game Logic、Task、Information、History、Bridge；`tools/schema.mjs` 为闭合 schema 权威。
- 容器内 `integration/bridge.json` 是 Native frontend 的作者声明；`integration/screen.schema.json` 为 screen schema。正式前端 source index 引用该 Bridge，再经原编译器编译，不能直接把作者文件当编译产物。
- 安装并授予 generation → SessionCore.create → experience.ready → bind0/1/2（各输入{}）→ act 创建角色。Subject 由原生绑定取得，目标参数使用人物 key，不用名字或推算身份。
- `screen` binding 只读 dw_public，输出为数组 `{id,value:{screen:JSON字符串}}`；取 main 解码。Information view player/narrator 也只读 screen。严禁把所有 Domain 或 NPC 个人 view 送浏览器。

### 实际绑定与输入

| Binding | 输入 | 提交路径 |
| --- | --- | --- |
| screen | {} | 公开快照读取，不耗时 |
| act | doupo.act 的 schema | typed transaction + 旁白 |
| choice | doupo.choice 的 schema | 相同规则，动作前自动保存 + 旁白 |
| plan | doupo.plan 的 schema | 1–4 顺序步骤，动作前自动保存 + 旁白 |
| bind0/1/2 | {} | 确定性身份初始化，不调用模型 |
| continue/cancel | {} | 确定性后续结算/停止，不调用模型 |
| acknowledge | {target:人物key} | 读取已生成回应，发布结果和本人经历，不调用模型 |
| browse/clues | {qty:0起页码} | 已知人物/消息分页，不耗时、不调用模型 |
| recall | {target:消息id} | 本人已知消息全文写入 result.text，越权或未知拒绝，不耗时 |

规则输入所有字段必填：`{kind,target,item,qty,x,y,detail,text,steps}`，未用字符串为空、数字0、steps=[]。

- choice 的 kind：travel/train/wait/rest/marry/conceive/attack/technique/work；其它单步走 act。
- plan 的 kind=plan，steps 1–4项，每项 `{kind,target,item,qty,x,y,detail}`。一次执行一个步骤，按 operation 继续；后段失败停止余项，已提交部分保留。result.steps 含 kind/code/text/spent/accepted，partial 标记已有部分成功后的失败/取消。
- 创建示例：`{kind:"create",target:"apprentice",item:"female",qty:0,x:0,y:0,detail:"transmigrator",text:"云禾",steps:[]}`。出身 clan/apprentice/mercenary/wanderer，来源 native/transmigrator，性别 male/female（空为male）。
- 购买示例：kind=buy、item=herb、qty=1、detail=当前 quotes 对应 quote 的整数文本。结果如 traded / “购入1份herb，支付8枚金币。”，spent=10（分钟）；失效报价 quote_changed 不扣资源。
- talk 的 target 是接近后的人物 key，text 保留原话。宿主执行 doupo.npc 后台任务；完成后 acknowledge 同一人物，立即展示 result.text，再 continue 处理评价。NPC 回应全文可通过 clues 的 id → recall 重读。
- 成功 Bridge Action 返回实际 receipt，公开 payload={}，随后重读 screen。所有提交携带 epoch/revision/idempotencyKey；同次重试保留原 key/revision。读档重开 Bridge，旧 epoch、目标与旧任务结果均失效。

### 玩家字段与 F01–F12

| 能力 | 实际数据/动作 | 本轮证据与集成边界 |
| --- | --- | --- |
| F01 | created/name/age/rank/inventory/skills；create | 四出身×两来源×男女共16组合通过；正式新局 UI 待接 |
| F02 | place/x/y；people 的 key/actor/status/contact；move/approach | BFS 分段移动、取消保留路径；正式地图与目标反馈待接 |
| F03 | result、clues/recall；talk、NPC任务、acknowledge | 真实模型意图/判断/旁白与本地迟到/取消；宿主任务观察和等待 UI 待接 |
| F04 | known/operation；travel/invite | 真实时间、补给、同行、遇险规则；不以原著记忆作为可达或已发生事实 |
| F05 | rank/qi/injury/skills；train/learn/breakthrough/rest/refine/consume | 斗气耗尽停止、服药间隔、条件拒绝；本版至斗师和基础疗伤散 |
| F06 | inventory/gold/quotes/family；buy/sell/gift/allocate | 当前报价、库存/资金约束、唯一物不普通补货；真实文字购买结算通过 |
| F07 | combat/hp/qi/injury；attack/technique/guard/retreat/surrender | 分段伤害/死亡/规则拒绝；模型不能代改伤亡，动画待接 |
| F08 | family/promises、个人评价、可见 needItem/needQty；关系/家庭/照护/传授动作 | 真实 Session 履约→结婚→出生→读档通过；NPC 可拒绝，回应不代办婚姻或物资 |
| F09 | 有来源/时点的 clues、opportunities；investigate/gather/claim/recall | 摘要8条一页、recall全文；陈旧线索不是远方实时真相 |
| F10 | 原生 SavePoint/Branch | 世界/人物/关系/信息恢复，关系锚点更新；新生儿/预留与迟到任务隔离；UI 缓存清理待接 |
| F11 | operation/family、已知人物档案；continue/cancel/browse | 50年规则模拟、NPC家庭/死亡/迁入、96人沙箱分页；没有96人完整宿主长期容量证据 |
| F12 | Native Task/CAS/receipt/Bridge epoch；确定性 continue/cancel | 并发重复提交、重开重试、旧revision/epoch拒绝；正式退出/等待/生成取消 UI 待接 |

人物每页12条，peoplePage/peoplePages/peopleTotal 只统计当前可见及已获知档案，不是世界人口。here 表示在场，last_known 是旧观察，deceased 是已知死亡；远方变动不穿透到旧档案。clues 每页8条，cluesPage/cluesPages 为页码，text 是192字符摘要，全文通过 recall；原著记忆仅对相应玩家可见。

operation.kind 非空时继续或停止；appraise 是以本人经历形成评价，不耗时。time/at/spent 单位均为开局后分钟。取消不撤销已耗资源、路径和时间。任务取消与规则 cancel 是不同的现有控制；重试表达不能重做已提交交易。

### 模型、负载与明确限制

宿主路线：role.intent_resolver 使用包内 doupo.resolve；叙事槽 narrative 使用 doupo.narrate；npc 槽使用 doupo.npc（事件解释路线）。需要工具调用与 JSON schema。连接由用户私有配置提供；GGchan 停用，包中没有 endpoint/密钥。真实模型结果、延迟、Token 和失败修正见同一 Record，不把本地固定传输输出作为质量证据。

规则读 live 人物，历史人物记录仍留 Domain/Revision；玩家从本人已获知的观察档案查询。96人同场景脚本沙箱8页通过，峰值公开JSON约5KiB。50年纯规则样本不是完整宿主50年运行；真实宿主已验证400日614次提交及家庭约一年流程。

本版人口96（预留计入），同次只处理一个到期NPC，再结算后续时点，保证分段预算。现有明确容量：个人信息grant128条、关系grant256条、家庭48、约定64，Domain4096条，History4096项/2MiB；超限拒绝，不静默截断。上述证据不承诺无限世代/历史容量；扩容需追加负载和持久数据设计。正式 AUI/Controller/Canvas、美术、焦点/IME/移动端/浏览器与完整交互延迟验收仍归集成阶段。
