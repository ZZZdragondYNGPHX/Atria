# 前后端共用契约 — C0 语义与 C4 实际接口

状态：C0语义继续生效；当前实际接口为末节C4（0.1.0-be.5）。C2/C3保留为历史接口；下文候选设计不自动变为已实现能力。正式前端待集成。

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

已执行纯规则分布/资格/恢复检查、实际Native出生/迁入/学习/修炼/资产安装、96名NPC成熟样本与分页/恢复；最终版本证据归Record。正式前端接线、真实浏览器交互及动画验收仍由后续选定集成者负责，不能把后端字段和静态美术标为地图界面已经完成。
