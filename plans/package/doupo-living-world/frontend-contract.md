# 前后端共用契约 — C0 语义与 C6 实际接口

状态：C0语义继续生效；当前实际接口以文末C6战斗／功法增量及仍适用的C4/C5领域为准。C2/C3与旧版本验证段落保留历史边界。当前源码和闭合schema是字段事实，不能把候选扩展当成已实现。

当前路由：2026-10-24按正式指令实装C6。详细领域设计见 [combat-system.md](combat-system.md)、[arts-reconstruction.md](arts-reconstruction.md)，工程与验证见 [implementation-readiness.md](implementation-readiness.md)。下文v0.36以前的未实施陈述仅适用其历史版本。

v0.15范围：NPC自主成长、NPC/NPC后台战斗与功法/装备/道具损耗属当前新增世界规则，实际字段待实现后更新。完整玩家战斗按D33未来独立实施；下述F07既有接口和v0.14候选玩家战斗/约束表现保留原适用范围，不据此要求本轮新建完整玩家战斗机制或界面，也不将后台NPC冲突伪装为当前C2已支持。

玩法权威归[领域模块](index.md#模块路由)，分工归 [execution-split.md](execution-split.md)。BE 核实真实能力后在本文件逐项补入实现映射和状态，形成可供集成使用的实际契约；无需为了 C0 另建通用 dispatcher、服务层或兼容双轨。

## 能力与界面覆盖表

F01–F12 是本项目协作编号，涵盖首批范围。前端表现文档逐项映射；每项可有多个页面，不要求每项独占一屏。实际实施状态见末节 C3 映射；框架底座或规则代码存在不等于对应玩法已完整验证。

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

## v0.16 候选扩展 — 状态与表现对应

本节将每项机制落实到玩家可读取、可理解和可操作的结果。新增机制的通用落地对应关系归 [implementation-readiness.md](implementation-readiness.md)，身体、伤势、功能与恢复细则归 [character-condition.md](character-condition.md)；本节只定义最小消费语义和交付分工，不另定伤害公式或身体 schema。

### 当前投影真相与新增边界

be.2 的 `tools/schema.mjs` 与 `source/rules/projection.js` 中，玩家 screen 已有 `hp/qi/injury`，其中 injury 是单个总量；人物内部 person 也保存这些数值，但 `visiblePerson` 与 `observePerson` 没有向玩家展示 NPC injury，更没有 NPC 身体部位或诊断详情。
现有 inventory 仅为物品类型与数量，skills 为技能与等级；没有装备实例、穿戴槽位、部位功能、道具耐久/次数、个人关系图谱或俘获控制的新 schema。现有 operation、activity、clues、family 等分别承载 C2 所列的有限内容，不可改称已支持新计划、完整证据图或组织生产系统。
正式原生前端尚未接通；“后端已有 injury 数字”不能表述为玩家已经能查看重伤部位、判断行动受限原因或完成治疗操作。正文 C2 保留其交付时的实际接口与历史证据，不把以下候选字段混入该版本。

新增投影须有可验证的权威来源、适用时点、对象身份、阅读范围与动作结果。以下“摘要”“详情”“原因”“变化”均是消费语义，不是要求创建同名字段、绑定或 API；实际声明、schema 版本与容量在实现时核对后再更新契约。
摘要用于当前处境与对象列表，详情只按需取得与当前目标有关的内容；不得为显示一个伤势标签把所有人物身体、库存或私有认知送入浏览器。

### 当前能力 → 候选投影与反馈 → 落地证据

| 关联能力与当前起点 | 最小可消费摘要/详情 | 动作与结果反馈 | 每项落地时由执行者直接核对的证据 |
| --- | --- | --- | --- |
| F05/F07 伤势与身体：玩家仅 hp/qi/injury；NPC 可见详情无 injury | 本人能查看受损部位或适用的身体功能、影响程度、当前行动限制、治疗/恢复阶段及下一变化条件；NPC 仅显示已观察或被告知的症状、来源与时效 | 查看不会推进时间；选择休养、治疗或其它已支持活动时，说明适用条件、实际投入与恢复结果；不能执行的动作有本人可理解的原因 | 同一伤势确实限制有关动作，详情与限制一致；治疗改变真实状态，相关动作随实际恢复开放；NPC 隐私与读档前后保持一致 |
| F06 装备与消耗：现有库存只含类型/数量，无装备实例 | 对适用物品显示实例归属、穿戴/携带状态、可用数量，以及该物品实际具有的剩余次数、充能或耐久；无此机制者不虚构统一耐久条 | 装备、卸下、使用、修理等仅在规则支持时提供；结算说明用了哪件、消耗多少、是否失效及失效造成的能力变化 | 同类多件物品不会混扣；穿戴与可用能力对应；消耗/损耗、修理与恢复后的实例状态可追踪，重复读取不再次扣取 |
| F03/F11 目标、活动与计划：已有 operation、activity 文案及有限复合步骤 | 本人可查看当前活动、已完成部分、剩余安排、占用资源/时间、阻碍与可中断点；NPC 仅展示接触中得知或公开的活动，不公开全部内心目标 | 继续、变更、取消的范围和已付成本明确；中断后的阶段、待处理事项及部分完成结果可读，不只把活动文案换成另一句 | 活动确实执行而非只改文字；已发生部分不回滚；取消释放未使用占用，旧目标与未来结果不串入恢复分支 |
| F03/F12 俘获与受控：C2 无对应状态或动作 | 当事人可理解当前实际约束、控制关系中本人能知道的内容、活动如何受限，以及可尝试的交涉/求援/脱离等已支持途径 | 自动活动暂停或改变时有实际原因；受限动作返回可理解的拒绝；获释、逃脱或控制变化要更新同一状态与可用动作 | 控制状态确实约束执行，不能只靠遮挡按钮；失效控制不会继续锁人；反抗与释放的资源、时间和后果均由真实规则接纳 |
| F08/F09 关系图与证据：已有部分 appraisal、家庭及个人信息 | 本人已知人物、第三方联系、共同经历/义务及来源、时效、不确定或被否定状态；可按需查有关证据，区分事实整理与玩家自己的备注/评价 | 可从已知渠道发起联络、转介或调查；结果新增的是实际获知内容，拒绝/未获知/澄清分别可读，不自动建立友情或代替玩家表态 | 同一关系对不同视角可见性不同；玩家看不到 NPC 私图或隐藏评价；错误认识被修正但旧经历仍能解释，恢复不泄露未来关系 |
| F04/F09 消息、调查与追踪：已有 clues/recall 和旧观察档案，无通用追踪流程 | 已收到线索的来源、所指时点、上次观察地点和可信依据；被察觉的跟踪或接触变化只显示本人能感知的部分，未知行踪保持未知 | 打听、查证、尾随等先具备实际动作再提供入口；结算反馈成功观察到什么、已失去目标或需要选择，不能将“未发现”冒充目标不存在 | 线索取得有时间与渠道；旧地点不会实时跟随目标；追踪失败或被误导后不凭全局状态补出新位置，受追踪者反应也须实际获知 |
| F06/F08/F11 生产、组织与在途：已有有限商铺/家庭数据和专用行程，未构成完整新链 | 对本人有权查看的订单、承诺或项目显示阶段、已投入/预留与在途物资、可知的参与者、预计节点及已知延误；公开行情和个人项目分开 | 接受、投入、交付、退出或重议有实际条款；反馈本人这次贡献、库存变化、项目阻碍和部分结果，未到货不得显示为现货 | 生产投入、库存/在途、项目贡献及交付互相一致；他人私有库存不泄露；退出与读档不复制货物、删除债务或重复支付 |
| F07/F09/F11 冲突结果：已有简单玩家交锋；新增 NPC 后台冲突尚未接入 C2 | 本人亲历或实际获知的参与者、冲突时点/地点、可知胜负及伤势、失物、损耗、离场或受控后果；幕后经过和精确能力仍按视角限制 | 结果提示与有关详情相互可追踪，区分事实已结算与叙事待生成；允许处理真正存在的救援、照护、追问或其它后续事项 | 后台结果确实改变身体、物品、活动和后续选择；缺席玩家只收到实际传来的部分，不因旁白生成失败重算冲突或损耗 |

伤势摘要可以提示“行动受限”，但详情须能说明哪个部位或功能受影响、何种活动受限、正在接受什么处理及为何尚未恢复；单个总数字或“重伤中”文案不足以承载截肢、失明等具体后果。具体身体范围与治疗能力以 character-condition 的实际阶段为准。
本人知道的行动受限原因应可读；对 NPC 的伤势则必须区分目测症状、本人告知与获准诊断，不能将真实内部部位状态直接当可见档案。未知原因可提示需要观察或询问，不用全知错误码泄露诊断。
同一限制要作用于规则接纳和自动活动，不只改变按钮颜色；治疗、解除控制、修复装备等改变后，投影与可用动作同步反映真实结果。未实现的身体/治疗能力不能由模型用“已断肢”“已经接好”临时补完。
按 D33，本轮新增 NPC 后台冲突的状态与可见后果不要求同时制作完整玩家战斗或战术界面；涉及玩家的既有简单交锋与未来完整机制保持各自范围。

### 最小可读表现与职责

候选最小表现可以先采用“本人状态”“已知人物详情”“当前活动”“本次结果”等可读列表、详情页和有效操作，随后再制作精美图谱、身体示意或场景动画。最小表现仍需要正式接线：能进入、能读到获准信息、能提交已支持操作、能理解拒绝并看到已提交变化。
没有详情的严重伤势、没有对应物品实例的装备损耗、没有真实约束的俘获，均不能只用新台词作为完成证据。先用有界功能切片补齐实际依赖，保留尚未支持的目标并标记进展；完整实现路径归 [implementation-readiness](implementation-readiness.md)，不因本轮字段缺失默认删减用户目标。

| 承担方 | 本节对应职责 | 交付状态的区分 |
| --- | --- | --- |
| BE | 实现权威状态与动作约束、受限投影/按需详情、结果原因与变化、保存恢复和实际声明；记录字段来源、容量与可消费样例说明 | 有规则、有投影可读、真实宿主可消费分别说明；调试直接读 Domain 或日志不算玩家投影接通 |
| FE 设计与迭代 | 为实际可提供的摘要、详情、动作、中断/失败和未知信息设计可读呈现；标明候选数据，保留当前选择和输入 | 离线原型证明表达方案，不能证明真实身体、装备或图谱状态已接入，也不能替后端决定规则结果 |
| 后续集成执行者 | 将已选前端接入实际 Bridge/任务/投影，处理提交与重读、对象失效、等待/取消和分支切换，验证可达详情及操作反馈 | 真实玩家流程跑通后才声明相应能力可玩；后台可读不等于界面可用，精美静态页面也不等于接线完成 |

正式 FE 与集成继续遵循 D26，由用户后续选择集成执行者；本节不代选执行者，也不把完整玩家战斗或所有未来界面变成本轮后台实现的前置条件。
当前执行者完成自己职责内每项实现时，直接自查“状态改变—受限读取—可理解反馈—实际动作限制—恢复一致性”；实际集成再核对玩家可达性与交互。这些是随实现完成的必要自查，不建立独立审查、额外审批或新的阶段放行流程。
实际落地后，契约只将已有证据的字段、读取/动作和接线状态提升为新版本接口，保留未实现候选与 C2 历史；不能把这一矩阵本身记成全部验证通过。

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

## C3 — 2026-10-22 世界运行后端接口

版本 `0.1.0-be.4`，Package ID继续为 `pkg_723cdd67122beffdac73f3dfe5c9f64e`，PackageVersion ID为 `pkgv_6790d42cc8fafc47da183f423c5052e0`；需要Atria main `4470cffb9f688d7e889eb94b42b1cb85966318c1`。构建与来源身份见Record。本节替代C2的当前实现映射；C0语义仍生效，旧候选和历史验证不自动迁移为新版本证据。

### 载入和真实读取

唯一声明继续是package的 `tools/build.mjs`、`tools/schema.mjs` 和 `tools/interfaces.mjs`。容器提供 `integration/bridge.json` 与 `integration/screen.schema.json`。安装/授予generation → Session创建 → experience.ready → bind0/1/2 → act创建。使用新局，未提供be.2存档迁移。

`screen` binding读取dw_public，数组main.value含 `screen` 和 `intent` 两个JSON字符串。前端解码screen；intent是同一公开信息的8KiB以内意图摘要，供authority.intentObservation使用。intent.quotes的unitPrice为单价、availableQty为库存、actionDetail为必须复制到交易detail的版本令牌；不能把价格当令牌。公开screen.quotes保留原price/qty/quote字段。摘要可能删去补充列表，truncated=true不表示世界事实被删除。玩家/narrator继续使用完整公开screen；任何人都不因本接口取得他人的Domain或个人view。

人物Domain内部改为 `{actor,alive,state:{body,mind,health}}`；mind只保存traits/goals/motives/social，health为安全的本人身体认识。三批读取有界body，单独读取下一相关人物的mind；更新body和mind各自保留另一组。此布局不是给前端的读取入口。NPC任务只获得该Subject的self/personal/relationships；self包含本人sex，接纳后的已说回应也进入该人的个人经历；未处置骨折的本人诊断为unknown，他人只有可见症状，不能把原始伤因、真实动机、藏货或远方位置公开。

### 新增字段、动作和错误

| 位置 | 实际语义 |
| --- | --- |
| screen.sex / placeName | 主角性别及权威地点名称，旁白不得按姓名猜性别或改称其它场所 |
| screen.condition | 本人missing、wounds及派生capabilities；每项能力含available/reason，普通药物不恢复缺肢或未处置骨折 |
| screen.gear | 本人器物id/type/slot/equipped/durability/charges，维修保留原id，期间不生效 |
| screen.control | 本人实际受控的holder/since/until/source；限制由规则派生，不靠叙事生效 |
| screen.social / goals | 本人当前关系认识/持续目标；认识含来源、时点和known/reported/doubted/refuted，不是全世界图谱 |
| people.signs/activity/carrying/observedAt | 合法可见症状、当前活动、主动显露的携带物与观察时点；人物仍12条一页，last_known不是实时状态 |
| screen.messages | 最近8条本人已寄出或实际收到的信件摘要；寄出不暴露远方送达/失败真相，event指向可读的本人事实 |
| screen.workshops | 本地组织id/place/status/output；不公开全体组织的私有资金或成员目标 |
| screen.events | 最近16个已知事件id/at/summary；目录滚动不删除dw_causes中的重要来源 |

新增 `condition` / `profile` deterministic bindings输入{}，不推进时间。result.text是可读摘要，结构化详情从上述screen字段读取。旧绑定与输入语义按C2保留，但screen使用本版schema。

新增普通动作仍走doupo.act的完整输入：treat（target本人player或近处病人、detail伤处id；可接诊医者、药草2、金币12）、equip（target自有器物id，detail=remove卸下）、repair（target受损器物id，工匠/药草1/金币6，活动180分钟）、message（target本人已知联系、text正文，邮资1及实际传递时间）、release（自己实际控制且在身边的人）。失败包括condition_unavailable/condition_interrupted、treatment_conditions/treatment_unavailable、equipment_unavailable、repair_unavailable、message_unavailable、release_unavailable。quote_changed只表示提交的报价标识与当前记录不一致，未证明价格真的变化，交易不扣费/不耗时；模型须重新复制当前令牌。准入/CAS/权限错误仍由Native拒绝，不转换成假成功。

### 事件详情与连续来源

`event` deterministic binding对应 `doupo.event`，输入 `{target:"event-…",page:0}`（page整数0–100，越过实际尾页时钳制）。target来自events.id、本人messages.event或合法本人来源的cause:后部分。成功result.code=event_read，result.text解码为 `{id,at,updated,page,pages,details}`，每页最多6段、每段256字符。不推进时钟，只更新dw_public；未知与私有统一unknown_event，不透露是否存在。

重要来源进入同一Native Session的dw_causes Domain，记录mode=delta、参与者、稀疏before/after、facts和按事实过滤的publicDetails；未变化字段不是完整快照，不能按全量人物状态解释。private fact不会因同一根事件有某个公开事实而自动公开。身体/物品/控制/消息来源引用实际事件id，query不返回私有原始before/after。例行补给和劳动保留在真实状态、当前活动及Native历史中，不为每次进食制造独立因果记录。

### 能力映射和真实边界

| 覆盖 | 本版已接入后端 | 仍需区分的边界 |
| --- | --- | --- |
| F02/F04/F09 | 网格遮挡/意识限制、实际路段旅行、显露物触发机会改策、观察/跟随、生态采集/返程/交货 | 路途中感知为同一路段抽象；没有全大陆、全量调查或正式地图交互 |
| F05/F06/F07 | 统一身体能力、指定处置/持续恢复、NPC学习/修炼/突破、装备/充能/损耗/维修、分段NPC冲突与有限受控/释放 | 原有简化玩家交锋保留，完整玩家战斗仍按D33后续实施 |
| F03/F08/F11 | 人格/目标/动机、个人图谱、实际求援信件、重要消息中断活动、公开交往形成第三者认识、亲属回应/救援、组织投入/工资/继任 | 当前是有界规则规划与模型回应，不声称任意欺骗身份、任意同盟谈判、无限图谱或完整遗产运输 |
| F10/F12 | 身体/器物/控制/活动/来源随SavePoint恢复，分支评价锚点重绑，迟到/取消任务拒绝，Bridge并发/幂等与旧epoch拒绝 | 正式界面缓存、焦点、IME、等待与恢复流程待集成 |

本轮世界负载证据主要来自be.3默认规则，be.4另验证新增表达上下文/交易令牌及模型接线：60日分批推进的人物状态一致；420日纯规则样本；真实Native的治疗、维修、控制、冲突、事件隐私/零耗时及恢复；96名NPC成熟数据的74人同场分页、早期推进/同刻追赶和97主体恢复。具体计数、失败修正、模型服务结果见Record，不能由这些样本推导96人跨月完整宿主或无限历史已通过。

当前预算：人口96（含预留），伤处8/器物4，个人当前图谱16、目标6/动机6，热消息16/冲突4/运输8；body每批33/32/32，选中认知最多8，单次输出body6/mind4/信息6/评价2/原因2及固定世界发布。个人信息grant128、关系grant256、家庭48、约定64、Domain4096条/1MiB、History4096项/2MiB。超限拒绝；不静默删活人/未解决动机或扩充所有全局限额。计算输出允许有界字段组合，计算输入使用既有Authority总值上限；普通schema、单值64KiB、读取256KiB、CPU40ms、堆8MiB及effects约束仍生效。

W0–W4默认机制已有代表性后端贯通；W5的稳定活动聚合、多尺度成本、96人长期完整宿主和候选社会行为的更广覆盖继续深化。正式AUI/Canvas/Controller、美术和浏览器端到端仍待选定集成者，不能标为玩家界面完成。

## C4 — 2026-10-23 人物显示分层与统一内容池

当前版本 `0.1.0-be.5`；沿用C3的Package ID、main依赖和Native读取路径，本节替代C3中受影响的字段与创建流程，其余接口不变。具体PackageVersion、归档哈希与验证见Record。使用新局，不提供be.4旧存档迁移。

### 附近列表、旧档案与地图

| 字段 | 当前实际语义 |
| --- | --- |
| peopleFilter | nearby为当前可感知活人；known为旧观察/已故档案，不混入当前附近人物 |
| people / peoplePage / peoplePages / peopleTotal | 所选集合每页12人，页码从0起，越界钳制；reply最多512字符 |
| nearbyTotal / knownPeopleTotal | 两个集合的独立总数；旧档案保留observedAt与last_known/deceased，坐标是旧观察 |
| markers / markerTotal / markersTruncated | 地图集合独立于人物列表页，最多12项；总数与是否截断明确返回 |
| markers[] | key/name/x/y/reason/appearance；优先级selected → interaction → key → relation，同级按key排序 |
| focus | 当前可感知的已选人物key；失去感知后为空，不允许跟踪远方旧档案 |
| appearance / people[].appearance / markers[].appearance | 玩家或人物的profile/period/ready/portraitAsset/chibiAsset；空引用与ready=false表示该时期素材缺失 |

地图仅显示合法可感知的重要作者角色、已知亲属/伴侣/同行者及当前选择/交互/冲突对象；大多数普通NPC仅在附近列表。markers不含主角，主角由screen自身坐标与appearance绘制。人口上限96不是96个常驻地图点，地图也不是全世界人物雷达。

新增deterministic binding `known-people({qty})`等同act browse/detail=known；原browse仍切回nearby。`focus({target})`选中当前可感知对象，target空串取消；失败focus_unavailable。二者零耗时，focus不代办接近/交谈，也不解除活动锁。恢复后重开Bridge并按新投影重绑，不保留旧epoch对象。

### 统一池、外观与实际功法

作者入口为source/pools/index.js，通用筛选/抽取为source/rules/pools.js；目录与扩展规则唯一归[content-pools](content-pools.md)。随包提供integration/pools.json和integration/pool-media.json供内容集成校验，不是玩家全知读口。

已装入20组、40张WebP：8位重要开篇角色的专属Q版及对应既有半身立绘，12组普通NPC配对立绘/Q版，覆盖男女与婴幼/儿童/成年/中年/老年。普通成人每性别两种外观；按资格优先减少重复，数量有限时允许复用。地图必须解析chibiAsset，对话/详情解析portraitAsset；均走既有Native资产引用，不拼开发机路径。重要人物缺少后续时期图时返回缺失，禁止冒用另一角色。初版为静态姿态，不含行走动画或正式Canvas集成。

`screen.arts`只列本人已学或实际持有秘籍对应的已就绪内容，字段为id/name/type/tier/attribute/item/known/level/active/eligible/xpRate/qiRate/qiCost/power/arms/source。未学内容level=0、active=false；eligible只说明当前年龄/属性资格，不代表已经学会。修炼xpRate/qiRate为百分比整数；斗技qiCost为基础斗气消耗，power为规则加成，arms为所需可用手臂数；最终结算仍受原有身体/装备等规则约束。配方未用参数为0。

`practice`走act，item传已学功法/斗技的条目id，成功零耗时换修，拒绝practice_unavailable；活动锁仍适用。`learn`继续传实际秘籍物品id并耗时学习，条件不符或储备条目不能学习。功法池首批10个可执行条目（5功法、4斗技、1配方），另1个储备条目不参与生成。人物模板只限定初始功法类别，再按年龄/属性资格与重复控制独立抽取，不把所有同职业NPC固定成同一功法。

### 初始化、后续生成与验证边界

安装/授权 → Session → experience.ready → bind0/1/2 → act创建后，持续读取operation并continue直至空。initialize每次用既有Native Subject准入补入1人，共4名池生成居民；连同24名作者NPC和主角，新局29个Subject，游戏时间仍为0。人口或出生预留已满时不增员。出生、迁入沿同一入口；婴儿有实际亲属关系，没有成人技能/携金。

Session保存种子与近期抽样记录，人物保存来源/模板/外观/已学功法，SavePoint恢复这些实际选择；渲染不重新抽取。NPC的隐藏来历、人格和未来储备不进入玩家投影。角色年龄变化仅在已存外观失效时重新分配符合资格的素材。

已执行纯规则分布/资格/恢复检查、实际Native出生/迁入/学习/修炼/资产安装、96名NPC成熟样本与分页/恢复；最终版本证据归Record。fe.2已接入正式原生前端与浏览器交互；静态美术仍不代表行走动画，具体覆盖见下节。

### C4 原生前端集成 — 0.1.0-fe.2

PackageVersion `pkgv_c3898a0270b98a0064c4ac8e4b9c81f9`，Package ID与main依赖不变，使用新局。正式作者源为package:doupo-living-world/frontend，构建tools/frontend.mjs；复用tools/interfaces.mjs，不新建世界状态接口。四个主入口与详情分层唯一视觉规则见presentation。

| 数据/动作 | 正式界面 |
| --- | --- |
| markers/appearance/focus | 地图重点Q版、主角Q版、配对立绘；同格做显示避让，坐标仍取权威值；选中不接近、不耗时 |
| people/browse/known-people | 附近与旧档案独立切换、分页；标记跨页时从合法附近分页取得详情；列表翻页不改变标记集合 |
| arts/practice/learn | 人物内功法修行页，区分已学/秘籍、当前修习和资格，分别传art id与item id |
| condition/gear/treat/equip/repair | 身体器物页：伤处、诊断、缺失、能力/限制、耐久/余量与实际操作 |
| social/messages/events/event | 人物关系认识、寄信；见闻中的书信/事件来源及详情分页，不渲染私有原始变化 |
| create/continue | 绑定与创建后自动完成initialize/appraise/refresh，不省略最终公开刷新 |
| SavePoint/Branch/Epoch | 菜单存档、整个世界恢复，清空旧草稿/人物/叙述并重新挂载 |
| composer与原生Bridge | 自由文字、IMЕ保护、失败保稿、真实revision/key、未知结果核对；测试服务边界见Record |

63张交付图包含40张配对池图及23张场景/物品/总览/占位引用；稳定asset id不变。安装manifest记录前端交付WebP的hash/size，原图与media/pools/manifest.json仍是作者来源证据，二者不再要求字节相同。frontend/media-delivery.json连接原始hash、像素尺寸、编码参数和交付体积；不修改池抽样或存档外观身份。

浏览器验收包括真实Authority购买与Native存档恢复，但本地generationHost只负责Authority交易，自由文字服务用于失败保稿验证；本轮没有真实模型请求，不能声称模型质量或延迟已验收。D33完整战斗、W5跨月成本、实际设备与行走动画仍未完成。
## content.1 内容兼容补充（2026-10-23）

沿用C4的screen字段、操作和视角约束。本轮构建新增原著/原创人物与场所后，`known` 的 schema 上限从24扩为64；当前全图32场所，隐藏地点仍按线索揭示。其它个人数据、stocks64、ecology4、organizations4、96NPC及Native计算预算不变。

身份绑定由作者人物数按8人一批生成，前端消费构建导出的公开 `BINDINGS`；content.1为 `bind0` 至 `bind5`，每项空对象输入、确定性执行。不得按旧文写死三批。公开静态目录另含 `REGIONS`，区域名称不由前端维护第二份表。新增原著人物 `appearance.ready=false` 时明确缺图；新增场所不借旧三地图充当实际场景。

本补充只改变内容容量和绑定数量，不引入飞行购票、药师认证或新的高阶技能。采用新局，无旧存档自动补入承诺。新增内容明细见 [content-expansion.md](content-expansion.md)。

## v0.23 任务机制候选路由（历史方案）

任务通用原则、人物/活动范围、拍卖/考核、履约/信息/协作、机会汇总、首批范围与轻引导见D39–D60。任务实例、条款、阶段、世界变化、报酬、长期后果和恢复的候选语义唯一见 [quest-system.md](quest-system.md)，作者内容与首批QC01–QC27的实际操作/选择/结算/后果要求见 [quest-content.md](quest-content.md)，拍卖/考核等活动领域规则见 [quest-activities.md](quest-activities.md)。以下段落保留 v0.23–v0.34 的历史候选语义；当前已实施部分以本文末尾 C5 及实际源码为准，历史“待实施”措辞不覆盖新接口。

后续实现需从同一任务权威派生本人可见日志、详情、追踪与状态变化反馈，并接入当前人物/见闻/地图入口。正式委托明示目标、报酬、期限与已确认进度；调查探索展示合法已知线索和最后核实位置，可手动追踪；协助与转包区分邀请/接受/委托人同意，不能把私有NPC目标、过时位置或后台真实终态直接公开。具体字段、操作、容量和拒绝语义在实现编译并验证后更新此契约，承载缺口与所需验证见 [implementation-readiness.md](implementation-readiness.md)。

拍卖的参与角色/寄售托管/代拍授权与预算/本人及受托资金占用/当前拍品与有效报价/成交交割、考核的报名资格/四阶段实操投入与操作反馈/中间状态及损耗/评价认证，以及其他活动的可知阶段均需后续真实接线；现有buy/sell/refine按钮不表示这些活动已可用。活动具体屏幕与操作尚未冻结，正式实现沿现有组件与同一规则结果更新。

协商需区分提议/反提议/拒绝/已同意和当前有效条款，公开悬赏显示原公告约定。误报与隐瞒按本人所知展示陈述来源、可查线索、矛盾和已确认更正，不预标幕后真相；核实、揭发或改立场只表达可执行意图，不能由前端直接判责、解约或删除托付/欠款。相关公开字段与错误反馈须经真实规则接线后再补契约。

付款和担保在接单前按合法所知展示，承诺交存与已核实托管、部分保障与全额保障、已付与应付未付分别反馈；欠款详情关联工作与后续追偿。异地代交展示已同意承运、实际交出、最后获知在途情况、签收、验收和付款，运输/获知时间分别保留；本人要求和允许代交范围可查。发件、签收回执或申请追偿均不能由界面直接写成已履约/已收款，真实操作和状态待后续接线。

长期合作需显示当前有效协议、本期工作/期限、分期验收/支付、暂停请求/生效及终止后的未清事项；多单顺路整理保留分单条款和实际交付。长途旅行/闭关提交前按本人已知期限、本人到场要求与计划耗时提示冲突及不确定性，提供返回安排、请求改约、寻找代交或继续的选择；提示不直接改变合同或NPC安排，真实字段、容量与操作仍待实施接线。

附近已知机会从已获公告/来信/交谈/亲历来源派生，保留发生/获知/核实时点、最后核实地点和陈旧/矛盾说明，多来源关联同一机会；不显示未发现内容，也不按远方实时位置或未知终态筛选而泄密。查看、筛选或追踪不接单、不保留名额，恢复后清理未来消息与缓存；对应视图、分页与真实操作待实施接线。

开局轻引导按出身/所在地和合法机会提供可关闭、可跳过的逐步提示，展示/跳过与真实任务状态分别反馈；不自动接单、发奖、解约或披露全池，恢复后不将未来发现带回。具体提示与帮助布局、数量和频率仍拟定，实际入口待后续接线。


## C5 — quests.1 活动接口（2026-10-23）

本节对应 `0.1.0-quests.1` 中实际固定活动接口。规则源为 `source/rules/quest-activities.js`，显式作者 Schema 为 `tools/quest-activities-schema.mjs`。活动参数与详细玩法只在 [quest-activities.md](quest-activities.md) 维护，不在本契约复制评分公式。这里不声明所有 QC、自然旅行/学习、模型或浏览器已经验收。

### 状态权威与公开投影

解码后的唯一领域状态为 `world.questActivities={serial,instances,history,certificates}`。它随同一个世界记录保存，不建立活动专用钱包、人物副本或另一只时钟；存储编码由 `packWorld/unpackWorld` 负责，界面只读 `screen.activities`。

| 状态集合 | 实际字段与界限 |
| --- | --- |
| `instances` | 最多8个。固定字段：`id,type,version,host,place,participant,status,stage,role,item,quantity,seller,stock,price,bidder,escrow,round,budget,principal,funds,score,material,spent,quality,mode,reason,at,due,steps,workUntil,source,destination,cargo`。`type` 为 `auction/exam/trial/exchange/auction_work`；`steps` 最多8个字符串；不允许任意动态键 |
| `history` | 最多24条；`{id,type,status,at,score,text}`，淘汰旧明细不重置人物、余额、资格或活跃托管 |
| `certificates` | 最多4条；`{holder,kind,issuer,at,evidence,version}`，当前可颁发类型只有 `basic-alchemist`，同人不重复颁发 |
| `serial` | 单调实例序号；只用于身份，不是第二份世界时间 |

`status` 的实际终态为 `completed/failed/cancelled/unsold`。新增实例优先保留全部活跃记录，并用剩余容量保留最近终态；活跃达到8个则拒绝新增。普通阶段工时不是终态。

`screen.activities` 的固定结构为：

- `openings`：最多4项现场入口，每项 `{label,detail,item,qty,text}`。查看入口不报名，现场真实条件仍由提交时规则复核。
- `instances`：最多8项，只有本人参与或现场可知活动。字段为 `id,type,title,place,host,status,stage,role,item,quantity,price,bidder,round,score,material,spent,summary,at,due,workUntil,destination,budget,principal,options,combatDependency`。预算与委托人仅对本人参与实例投影，不公开 NPC 钱包、隐藏估值或动机。
- `options`：每实例最多10项，固定为 `{label,detail,item,qty,text}`。前端使用当前选项构造意图，不能在本地推进 `stage`、结清托管或增加物品。选项身份须包含 `text`，避免大金额默认值变更后仍使用旧选项。
- `history`：最近6条本人活动结算摘要；`certificates`：本人实际资格记录。

`summary` 在未完成工时时追加剩余分钟说明；`workUntil` 是主时钟分钟门槛。`due` 当前只是创建时登记的 `at+1440` 字段，不能解释为已经实现的强制到期/取消。`combatDependency` 在试炼中明确提示 D33 战斗型分支尚未实施。

`intentProjection` 仅提供活动 `id/title/stage/options` 和现场 `activityOpenings`，不向模型开放原始托管、私人估值或全部世界状态。原有 intent 大小上限仍生效，内容可能按既有裁剪顺序缩减；模型应以当前观察为准。

### 实际操作通道

沿用 `doupo.act`/已有 `act` binding，`kind='activity'`；输入仍为既有 `kind,target,item,qty,x,y,detail,text,steps`，没有新增任意对象补丁入口。`target` 为当前活动实例 ID，创建入口为空。`detail` 是下表命令；普通选择在 `item`，普通数量在 `qty`。

| `detail` | 其他输入与实际意义 |
| --- | --- |
| `auction_open` | `item` 为分号实际有库存的普通物品/秘籍，默认 `manual`；实际托管一份并创建场次 |
| `auction_consign` | `item` 为本人普通物品，`qty` 为1–10份；实际移出本人可支配库存；不接唯一物/装备实例 |
| `auction_authorize` | `item` 为现场真实 NPC key，金额为其代拍预算；服务器检查真实需求、资金、目标与利益冲突后才能同意，不接受伪造同意标志 |
| `auction_bid` | 金额为本次总出价，不是加价差额；需有足额可占用资金且满足最低加价 |
| `auction_close` | 三轮之前推进实际竞价节点，三轮之后落槌或流拍；不是无条件领奖 |
| `auction_cancel` | 受托管/有效报价/权利人约束的撤拍清算 |
| `auction_appraise/provenance/buyers/transport/assist/delivery` | `target` 为真实拍品 ID；分别请求鉴定、核源、寻访、筹备运送、协助寄售、成交后交付。`auction_assist.item` 可指定主持人真实余货，默认药草。每件拍品同项只接受一次 |
| `auction_job_perform/auction_job_finish` | `target` 为新建 `auction_work` ID；实际执行和达到工时后的交接结算分别提交；运输需实际地点及真实库存/货物/收货人 |
| `exam_start` | 黑岩公会现场报名，校验真实属性、技能、身体和考官 |
| `exam_prepare` | `item=careful/generous/quick`，实际处理并消耗本次材料 |
| `exam_fire` | `item=steady/strong/gentle`，基于前序质量实际消耗斗气并提炼 |
| `exam_fuse` | `item=layered/swift/patient`，使用本次过程融合 |
| `exam_inspect` | 前三段实际工时已满足、本人和合格考官在场后验收；不能用旧成品替换 |
| `trial_start/prepare/survey/finish` | 报名；`prepare.item=light/prepared`；`survey.item=cautious/direct` 且检查本人真实到访记录；最后交接。仅非完整战斗内容 |
| `exchange_start/show/finish` | 报名；`show.item=herb/medicine/route` 需真实样本或本人到访依据；工时满足后结清练习与信任 |
| `activity_wait` | 继续推进至活动 `workUntil`，仍可被主世界到期事务截断 |
| `activity_exit` | 主动退出并尝试按原所有权清算；不会返还已消耗药材/斗气，也不能远程归还在途托付货物 |

拍卖金额使用兼容通道：`auction_bid` 与 `auction_authorize` 的非空 `text` 优先作为十进制整数金额，必须是1至1,000,000,000的安全整数；小额旧调用可继续使用 `qty`。不接受指数、负数、小数、非数字或越界输入。前端大额用 `text` 并将 `qty=0`；通用 `qty`/步骤数量上限仍为100，没有为了拍卖扩大所有动作数量范围。金额文本不是自由叙事或成功证明。

### 结果、失败与钱物流转

成功阶段返回 `activity_updated`；继续未满工时返回 `activity_working`；规则拒绝统一返回 `activity_conditions` 并附具体原因。整个 engine 的 `activity_pending/in_combat/player_dead` 等既有前置拒绝仍可能先发生。前端应显示权威结果并刷新公开状态，不能只按按钮名称推定成交、发证或收款。

拍品、本人最高报价占用、代理剩余专款、周边工资托管与采购专款分开计量。拍卖占用通过真实扣款实现，不能同时用于另一次买卖；被超过才释放原占用。落槌原物只转移一次，佣金和余款有真实收款方，未用代理款退回原主。周边工作先扣真实付款方报酬，签收后转给玩家；货物独立托管，不可再消费/出售。不能读取退款权利人时保留托管并拒绝，不猜继承人或吞掉余额。

阶段提交后 `workUntil` 保留在同一世界。普通 `cancel` 仅停止主世界推进，不清除这个门槛；未到时再次提交下一阶段或领取结果会被拒绝。最终发证、钱物交割和领奖只在前段工时已满足后发生。活动退出与停止时间推进是不同意图。

同一世界 SavePoint 恢复阶段、工时、余额、库存、托管、证书与历史；恢复后旧 Bridge/修订/epoch 的隔离继续由既有宿主处理。领域规则还拒绝重复阶段、重复终态结算与同拍品同类工作重复领取，不能把这些检查当作另建一套调用幂等存储。

### 已执行验证与限制

- 纯规则：六类周边工作、真实采购/货物/交接、钱守恒、代理预算拒绝、重复拒绝、唯一物边界、四阶段成功/失败实际耗材、试炼到访门槛；80次交流后实例≤8、历史≤24，显式状态/视图 Schema 通过。
- 实际 engine/Schema：报名在 NPC 时间节点被打断，cancel 后提前下一阶段被拒，等待后完成四阶段；快照恢复与重复验收不增物、拍卖钱守恒。该21动作样本最大人物写入2、screen最大7256字符。满活动容量8和历史24的投影夹具整个screen为15334字符，低于32768，intent也检查8192限制。
- 大金额实际 engine 输入：`text=140` 代理预算与 `text=120` 出价通过；实际占用/返还/结清钱守恒。指数、负数、小数、NaN、十亿以上及过长数字拒绝，原占用不变。
- 真实 Native：实际编译、安装、身份绑定、SessionCore四阶段操作、中途SavePoint、重复验收拒绝、恢复时间/钱物/未认证并再次验收通过。第二次实际重编译还覆盖120金币出价、非法金额拒绝与总钱守恒，结束screen为5503字符，包含最近终态保留和金额通道修改。该验证使用明确的合法状态夹具提供公会位置、技能、材料，未证明自然开局旅行与学习全流程；模型服务调用0。最新归档和浏览器覆盖、编译快照差异归 [Record](../../../records/package/doupo-living-world.md)。

D33完整玩家战斗、唯一物/装备拍卖、无人参与时自动举办完整场次、隐藏品质/复杂鉴伪、活动权利人死亡后的继承领取，均不能从本节现有接口推断为已经实现。当前基础认证不是原著完整药师品阶体系。

### C5 通用任务与已知机会接口

同一 `doupo.act` 使用 `kind=quest`，字段沿用既有闭合输入。`target` 是本人已知实例ID；除发现和分页外，未知ID一律拒绝。任务规则只接受实际操作，不接受旁白、模型声明或任意状态补丁。

| `detail` | 输入及约束 |
| --- | --- |
| `discover` | `item=notice/talk/witness/letter`；交谈的target为实际近处人物。当地发现最多三项；来信仅解析真实送达且有规则收据的邀约，保留寄信时条款 |
| `public_discover/public_contribute` | 读取当地真实需求悬赏；贡献须真实库存，工资先由发布者交存，单目标与可拆贡献分别验收 |
| `accept/negotiate` | 承接时复核资金/需求/独占；协商qty为报酬、text为1–14天、item为候选成果ID，双方同意后version递增；已有工作不单方改写 |
| `perform/resume_work` | item为当前候选选择；实际耗料、地点、能力、人物同意及工时均检查。中断后只续剩余工时，不重复耗材；也可退出并按已完成工时清算，不领取未做工时的全额工资 |
| `submit/collect` | 当面验收与追偿分别提交；仅实际成果产生earned，实际资金才能增加paid；欠款保留 |
| `assist/subcontract/dispatch` | item为实际近处且可用协作者；真实先付工料费用。转包须委托人同意；代交只开放模板允许的成果/原物，NPC沿真实路线推进、签收、验收、返程回执 |
| `recall` | 当面接回协作/托付，不能远程召回货物；转包重接还须委托人在场；已付工料不凭空退回 |
| `abandon/withdraw/return` | 主动退出、核实委托人撤单、归还未用托付；未归财物与欠款保留，不能通过移除任务抹账 |
| `cooperate/pause/resume/terminate/renew` | 已结清可重复短单建立七日周期；按真实条件成立下一期，暂停不补造积压订单；失败续期不撤销原协议 |
| `track/page/guide_skip` | 本人最后所知追踪、qty从0起分页、跳过轻引导；均不改变任务世界事实 |

公开 `screen.quests`：`known` 每页12项，字段为 `id,seed,title,status,due,source,observedAt,place,issuer,terms,progress,tracked,alternatives,options`；`alternatives` 为 `{id,label}`，`options` 为 `{label,detail,item,qty,text}`。`guide={skipped,text}`、`counts={active,completed}`、`warnings` 最多8条、`page/pages`、`deadlines` 最多12条 `{id,title,due}`。`due=0` 表示无固定期限。协作者在途只显示等待回执，不投影其远方精确进度。前端跨页按本次行动分钟数对照已知期限提示，玩家可自行决定。

解码状态 `world.quests={serial,page,skipped,instances,totals,history,publicOffers}`；最多48实例、12项同时履约、64种汇总、24旧明细、12悬赏。实例保留条款版本、独占者、成果/实付/托管、真实托付保管、8条有限证据、协作者与分段运输、合作期次。只压缩完全清算且无有效长期协议的终态；48为明细上限，整个world超过60000 UTF-8字节时提前回收已结清旧明细到有界历史/汇总，不丢弃欠款或未归物。引擎同时按完整计算返回值（包括公开view/intent及人物写入）预算提前回收；超过Native65536且无可回收终态时拒绝写入，不能静默丢义务。详情字段以 `tools/quests-schema.mjs` 为闭合权威。保存时 `packWorld/unpackWorld` 用可逆布局/文本字典消除重复属性名与文本，将任务/活动分别编码为最多4/2个32768字符块，仍是同一世界记录；内部严格结构不变，不扩大宿主Domain预算。

规则错误通过 `result.code/text` 展示；`quest_taken/quest_unfinished/quest_conditions/issuer_unavailable/helper_contact_required/period_unavailable` 等表示事实未满足，不能由前端乐观更新成功。正式前端复用当前选项、确认、busy和Bridge版本锚；存档恢复清除旧表单/目标，事务幂等及迟到隔离由Native负责。精确最新构建、浏览器与模型范围见Record。

### C5 组合容量与宿主恢复补证

最终源码的真实 Native 容量夹具包含125期合同累计、48条合同明细、24条合同历史、8个完整拍卖实例、24条活动历史，以及12条公开悬赏各8名贡献者（夹具记录每人qty=1、paid=5，悬赏完成、余额归零）的结构记录。该组合并非声称自然执行了全部拍卖与96次悬赏贡献。原样安装、世界写入和正式 `focus` 计算通过；完全清算的旧合同明细按整个计算输出预算归档，活动/悬赏与累计事实保留。随后实际沿拍卖行—药铺—坊市—客栈旅行、接近委托人、等待七日并完成第126期，再从 SavePoint 恢复到累计125期，世界深等、时间和有界历史校验通过。恢复态6条合同明细/24条历史，screen14928字符；当前源码独立 QuickJS 100ms约束重复两次通过。该容量验证使用合法状态夹具、模型调用0，完整输出预算与归档规则以通用接口和实际源码为准；详细证据见 Record。


### quests.2 操作补正

现场观察普通委托必须实际感知需求人物；自主探索与机缘仍按所在地和本人所知开放，不要求远方线索人同时在场。协助/转包完成实操工时后才生成可验收成果，不重复等待模板工时；多段勘察依实际路线续行，转包者走近委托人验收后取得工资。承运者在收件和验收地点实际走近权利人，回执仍需真实返程。受托任务接管人物移动后，该人物退出同行名单，玩家旅行不得搬动在途承运者。

自由文字解释器明确区分询问委托（quest/discover/talk）与普通对话、发现与承接，最终仍只使用公开工具和当前实例选项。真实模型服务、最终归档和浏览器实测范围以Record为准。

`paused_work` 仍属于承接中的未清义务，前端筛选保留该条目并显示“工时已暂停”。任务/活动成功回执只有在原稿仍与本次提交文本一致且公开结果已变化时才清除草稿；规则拒绝与提交中继续编辑不清除输入。前端只认定实际规则成功码，不凭旁白判断成功。

### quests.2 已确认长行动的前端续行

用户确认长行动或明确继续后，前端只串行调用已安装契约的 `continue` binding，等待每次真实回执和公开投影后再推进；最多10000次续行后停下等待用户继续。`continue/cancel` 为契约固定的 deterministic 权限，不触发解释器或旁白；不借此产生新行动。失败、结果无法核实、世界分支/epoch改变时停止自动续发。恢复存档不会自动执行旧页面尚未完成的续行。

场景和抽屉均显示自动推进/停止请求状态。停止按钮在请求进行中仍可操作，先记录停止意图，当前回执结束后串行提交cancel；已经发生的工时与后果保留。重复确认、继续与停止不创建并发写入。重新进入页面的未完成操作须由玩家明确继续。

真实模型连接使用Native当前ConnectionProfile；MiniMax返回思考正文混入结构化内容时，显式设置 `options.reasoningSplit=true`（main@df1dd440及以后）发送 `reasoning_split:true`，不改变思考深度或放宽结果Schema。未设置时维持原请求，raw-text和非布尔值拒绝。凭证仍由宿主Secret Port提供，游戏包不携带连接或密钥。

长行动使用 main@8321cdc7 及以后的有界临时回执回收，不扩大256项缓存限额；具体回收判据唯一归 `main:public/shared/native-frontend-bridge.js`，服务端与本地宿主客户端共用。持久幂等、CAS、在途操作及分支/epoch权威不转交给前端。

quests.2最终续行每步只读取一次带真实Revision的公开screen快照，再按该Revision提交下一次动作；Bridge已绑定epoch/branch，不再每步重复session→screen→session及旁白读取，也不从Action回执构造世界。自动推进保持连续忙碌反馈；spent=0明确表示结算当前时点事件，不跳时钟或跳NPC。停止、未知结果及恢复规则沿本节已有语义。核心轻量包/HEAD与脚本缓存权威见 `main:docs/development/native-media-capacity.md`；最终归档及速度实测见Record。

### world.1 续行实现补充

公开continue binding映射隐藏doupo.continue，仅接受kind=continue，连续相同内部输入复用最后的玩家锚；新玩家行动、旁白或Persona变化中断合并。每次计算、权限、CAS、回执及保存仍独立执行，停止和恢复沿既有Bridge语义；不新增前端权限或改变C5业务字段。认知已授权且实际改变的人物用既有publish一次提交完整身体/认知，身体单变仍走body；总人物6、认知4及公开screen预算不变。规则预检明确省略恒真precondition，人口后置检查转引同一小模块。实际验收及版本只归Record。

### world.2 持久化与续行实现补充

C5公开字段、操作与停止/恢复语义不变。隐藏doupo.continue声明continuationCondition，FS宿主在原锁内最多准备8个普通逻辑动作，并在累计准备250ms、条件停止、待处理outbox、人物发言或Run状态处结束；单步规则/NPC/权限和预算不跳过。每步仍有Revision、回执及历史，整体journal持久发布后再自动保存，失败与重试仍沿原事务/Branch权威。Native差分、压缩、缓存及当前/历史修订读取规则唯一见 main:docs/development/native-transactions.md。96人月/年度容量及真实浏览器证据只见Record，不据此承诺多年秒过。


## C6 实际接口：战斗与功法（2026-10-24）

适用包为0.1.0-combat.1，新局及同一规则完整世界恢复。C6替换旧F07简化单挑与共用掌法熟练度，C4身体／器物／所知及C5任务／活动继续作为唯一领域事实。闭合字段以包内integration/screen.schema.json、source/rules和tools/schema.mjs为准；不维护旧数据转换。

| 公开字段 | 实际语义 |
| --- | --- |
| realm / rank / xp / growthNeed | realm.js的唯一境界命名；玩家成长到rank36，突破不回满斗气 |
| qi / qiCapacity / qiQuality / primary / auxiliary | 存量、容量、驱动质量、一个主修与相容辅助分别展示；查询不运转／补气 |
| arts / artsPage / artsPages / artsTotal | 本人已学或实际持有秘籍的法门；平时8项／页，交锋时4项／页，每门独立掌握、来源、准备和快捷引用 |
| switching / hotbar | 实际学习或换修的时点与未清过程；快捷只保存已学引用，普通斗技不限制为四招 |
| combat | id / round / phase / objective / result / winner、可见参战者分页与日志、本人完整已学斗技库、本人可知请求与投降／停战提议；不公开NPC精确气血、库存、斗技库或内心 |
| combat.participants | 每页8名实际可感知对象；位置、同方／对方／中立、失能／退出等状态与可观察体况。页面不成为命中授权 |
| remains | 每页3具可见尸身的位置、姓名及本人继承资格；近身且曾查验才显示当前实际金币、库存和原gear实例 |
| operation / actions / result | 可继续事项及当前可用动作；死亡登记和评价优先于后续交锋，锁定后不能新增主要行动；回执区分拒绝、锁定、执行失效、落空和实际后果 |

### 动作与Bridge

所有未用字符串填空、数字填0、steps填空数组。初次危险接触attack走choice；spar请求双方同意的三轮徒手切磋。已在交锋choice阶段时统一用act的kind=battle，detail为具体行动，qty必须等于当前combat.round；战中不得把technique填入普通act工具的kind枚举。

| 行动 | 参数及结算 |
| --- | --- |
| battle | detail=attack / technique / guard / breathe / consume / prepare / rescue / retreat / surrender / accept / negotiate / move。target为真实目标；technique与prepare的item为已学斗技id，consume使用medicine |
| 位移衔接 | 主要行动detail加:move，x/y为两步内实际可走落点。纯移动用detail=move；身法／区域技也用实际x/y，不能靠选中或动画免费位移 |
| command | qty为当前轮号，target为同伴，detail=action时item为其已知斗技、text为目标key；detail=goal时item=focus或retreat。每轮最多两条短令，本人可拒绝／调整；不占主角主要行动 |
| 投降／停战 | surrender可用item=gold:非负整数承诺金币；不填为无条件。接受前不转钱，accept在本人主要行动中重检并实际交割。negotiate先留下停战提议，由接收方自己的决策步骤接受或拒绝；多人不因一人接受而整体服从 |
| 学习／换修 | learn.item为实际秘籍物品id；practice.item为已学主修／辅助id。主修换修一日、干粮一份、十五气，完成前仍使用旧底盘；辅助按相容／互斥条件有时耗切换。train.item可指定一门已学斗技独立演练 |
| 快捷／分页 | practice.detail=hotbar增删快捷引用；browse.detail=arts/combat/corpses，qty为从0起页码，不推进时间 |
| 战后物资／看守 | search.target为近身可见尸身，耗十分钟；loot的item/qty来自查验后的实物，gear:原实例id每次一件。loot.detail=inherit须合法继承且实际到场。capture须近身失能或已接受投降的对象；release解除本人看守 |
| 魔兽 | investigate.detail=wildlife，仅在对应生境建立尚未建立过的真实个体；发现不等于攻击，重复调查不重生 |

隐藏battleStep映射doupo.battle-step，只用于已锁定的collecting/resolving/cleanup；不建立主体或推进世界钟。普通continue处理死亡登记、评价、世界时间及其它活动。前端根据operation.kind选择，不直接读取世界私有状态。暂停只停止后续自动结算，已接纳的决定仍锁定；继续与SavePoint从同一队列／seed／游标接续。

### Native承载与准确边界

同一dw_people保留规范身体和认知。普通事务最多六个完整身体更新；专用交锋步用一个行动者补丁、最多十三个受击补丁和至多一个认知整人更新，在原子提交内保持一次逻辑行动。受击补丁只覆盖实际身体字段和准备，保留未变的学习库／库存／活动；越界字段变化由engine断言拒绝。共24个声明app.command槽，未提高Native全局预算，未将十四个写入窗口解释为整场十四人上限。

身体读取为五组，每组至多20名NPC，首组再加玩家；当前活人上限96，待清算死者、当前交锋及现场尸身通过同一索引窗口读取。完整世界保留队列、死亡遗留、准备和未清事务。尸身索引及查验记录各有96项上限，超过拒绝；不宣称无限世代或无限现场遗留。

QC28要求实际送达出口、QC29要求当前接触终止且当事人存活、QC30要求约定演武完成与真实参与。开始／结果凭据由规则产生，未结束、未参与或提前退出不能伪领成果。具体已执行的规则、Native、浏览器、服务与容量证据归同一Record；契约存在不替代验证。

接受投降／停战同时在原promises权威登记一项已履行的truce安排；NPC不以同一旧理由立刻重开攻击，新的亲历／来信归因仍可改变后续安排。它不是永久阵营归属。容量不足时拒绝完成接受，不虚报交割。
