# 斗破苍穹开放沙盒世界 — Plan Index

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；本 Bundle 位于 `docs`；必要的产品修补使用独立产品任务。
- Status: v0.14 — 在世界整体运转之上深化连续因果、机会性改策与包含玩家的个人关系图谱；be.2/C2 为已有实现基线，新机制尚未实施。
- Updated: 2026-10-22
- Source baseline: 已核对远端 `main@a9a914c66141daaf7ab9ae26119a506444d73698` 与 package `914c624c950dec06c181960d32b2d7f337c31abf`（规则交付提交 `38007d02d`）；实施前重新核对实际 Git，本地旧 main 不代表远端现状。
- Record: [累计记录](../../../records/package/doupo-living-world.md)

## 目标与确认边界

基于 Atria 制作《斗破苍穹》开放沙盒 RPG。采用地图、场所、人物与功能界面，自由文字贯穿交互；先围绕自创角色设计，设定以小说为准。首要目标是让整个世界在游戏时间内自主运转：人物追求目标，家庭与组织协调成员，资源和生计产生需求，旅行与消息连接地区，结果继续影响后续选择。NPC 自主生活与长期时代演化由这些相互作用形成。

允许自由改写原著人物命运、机缘归属和历史，采用开放沙盒方向，不将原著事件结果当作必须维护的轨道。小说设定与玩家造成的新历史需要分开表达。

已确认且跨模块生效的决定只保存在 [decisions.md](decisions.md)，其中已包括世界与时间、开局与身份、战斗、空间与移动、深度成长与自由组合、完整世界读档、活动优先级、首批地域、亲密关系与婚姻家庭，以及电脑为主、模型交互质量优先。具体玩法、长时中断、人口计算精度和美术默认设计见 [完整制作稿](production-plan.md) 及其模块；未确认细节标为拟定，数值通过后续核实与验证校准。

## 当前状态

- 本轮先更新方案再讨论。D30 确认连续逻辑链、复合动机和途中机会性改策，D31 确认包含玩家的个人关系图谱；补齐感知/相遇、个人认知/关系和多主体后续反应的设计依赖。示例是可产生不同结果的能力样本，不能改成预写必达的剧情链。
- v0.13 已确认 D28 的主动社会行为与 D29 的世界整体运转优先，既有 NPC 能动性、世界系统和时间/精度/人口规则继续生效。
- 上轮完整调用链调查发现：be.2 已有规则生活、滚动 30 日结算与两类专用旅行；结构化人格/长期目标/通用 NPC 行动执行尚缺，返程和自主补粮等循环有断点。详细证据见 research 与 Record，不将已有后端交付等同于本轮世界目标已达成。
- 从远端 v0.10 恢复，继续完成规则、确定性 Bridge、完整恢复与真实模型验证；实际提交、样本、失败修正与容量边界见同一 Record。
- Package 0.1.0-be.2 已有版本化后端验证归档和 integration Bridge/schema。原生接纳扩展已集成 main@a9a914c66141daaf7ab9ae26119a506444d73698，package 资产提交为38007d02d08f70d59e6ebbe0ad612f2d0570e463。
- 共用契约 C2 覆盖 F01–F12，区分纯规则长测、96人脚本沙箱、真实宿主恢复/并发与真实模型证据，不承诺无限历史容量或96人完整宿主长期负载。
- 正式前端与浏览器流程仍待用户选择集成执行者；图片与音乐素材按D27制作，当前先提供两张画风参考，确认前不批量生成。
- 开工许可和分工保持，不重复询问decisions中的确认，不导入旧doupo-open-world确认。旧换设备快照已消费并删除，无新HANDOFF。

## 模块路由

| 模块 | 唯一职责 | 依赖 |
| --- | --- | --- |
| [decisions.md](decisions.md) | 当前对话已确认的跨模块决定 | 用户明确指令 |
| [production-plan.md](production-plan.md) | D4 整体制作范围、贯通样本、数据职责、框架验证与实施顺序 | decisions；按主题链接领域模块 |
| [execution-split.md](execution-split.md) | BE/FE 分工、文件边界、并行推进与后续集成 | decisions、production-plan |
| [backend-task.md](backend-task.md) | 后端完整任务、完成条件、交付与新对话启动提示 | execution-split、frontend-contract、research |
| [frontend-ai-brief.md](frontend-ai-brief.md) | 给前端 AI 的关键内容、三项设计交付与新对话启动提示 | execution-split、frontend-contract、presentation |
| [frontend-contract.md](frontend-contract.md) | F01–F12 能力覆盖、数据/操作/状态语义与后续真实接口映射 | decisions、领域规则、实际实现 |
| [experience.md](experience.md) | RPG 交互、文字输入、首个贯通体验候选 | decisions、world-simulation |
| [world-simulation.md](world-simulation.md) | 世界自主运转定义、活动与时间、信息/精度/人口、历史一致性 | decisions、research；领域细则按需读下两模块 |
| [npc-agency.md](npc-agency.md) | 人格、持续目标、计划执行、NPC 主动社会行为与联合行动 | decisions、world-simulation、world-systems |
| [social-graphs.md](social-graphs.md) | 全角色个人社交圈、关系事实/所知/评价、图谱访问与连续经历 | decisions、npc-agency、world-simulation |
| [world-systems.md](world-systems.md) | 资源生态、生计与商路、家庭组织和地区事件的耦合循环 | decisions、world-simulation、npc-agency |
| [player-and-combat.md](player-and-combat.md) | 自创角色开局、个人原著知识、出身内容与战斗细则 | decisions、experience、world-simulation |
| [presentation.md](presentation.md) | 已定空间与移动方向的展开、交互与美术细节 | decisions、experience、research |
| [progression-and-consequences.md](progression-and-consequences.md) | 已定成长深度、死亡存档和活动优先级的展开与验证要求 | decisions、player-and-combat、world-simulation、research |
| [content-and-runtime.md](content-and-runtime.md) | 已定首批地域、关系内容与运行取向的展开 | decisions、progression-and-consequences、world-simulation、research |
| [research.md](research.md) | 主线源码与外部一手证据、能力边界、待验证问题 | 实际代码与原始资料 |

领域规则细节保留在对应模块；整体制作稿只汇总范围与依赖，不另存第二份详细规则。后续内容增长时再按实际需要拆分，避免空模块与重复权威。

## 阶段与按需阅读

| 阶段 | 状态与目标 | 必读 |
| --- | --- | --- |
| D1 首轮调查 | 已完成初步能力调查与产品方向澄清 | index → research |
| D2 世界自主性与时间 | 已确认基础方向；动作耗时与长时中断细节后续按需展开 | index → decisions → world-simulation |
| D3 成长、战斗与内容 | 基础方向与首个活动优先级已定；具体数值、背景和内容后续按依赖展开 | index → decisions；按需读取 progression-and-consequences、player-and-combat 或 world-simulation |
| D4 制作基线 | 已形成 v0.8 默认基线；正式制作已授权，具体数值与视觉细节仍保留拟定状态 | index → decisions → production-plan；按主题加载领域模块 |
| Implementation 准备 | 已完成；v0.9 已拆分任务，提炼共用语义与两份新对话资料 | index → decisions → execution-split → frontend-contract → Record |
| BE 后端实施 | 首批后端0.1.0-be.2与C2已交付；后续容量扩展按实测边界继续 | index → decisions → execution-split → backend-task → frontend-contract → research → Record；按阶段加载领域模块 |
| 世界自主运转深化 | 当前；先更新方案再讨论，接入连续因果与全角色社交圈；实施先打通 W0–W5 的自主闭环 | index → decisions 的 D28–D31 → world-simulation → npc-agency/social-graphs/world-systems → production-plan/backend-task；事实核对读取 research/Record |
| FE 界面迭代 | 离线原型和设计；实际进展归对应设计任务 | index → frontend-ai-brief → execution-split → frontend-contract → presentation；确认边界读 decisions，内容按需 |
| 前端集成与整包交付 | BE 完成后由用户选择执行者；保留 P4 表现与 P5 发布验收 | index → execution-split → frontend-contract 的实际映射 → 选定的前端三项产物 → Record |

## 实质设计变化

- 2026-10-20，第二轮 v0.1：依据当前对话建立新 Bundle。确认界面化 RPG 与贯穿的自由文字、自创角色、小说设定、开放沙盒自由改写历史，以及 NPC 自主生活和长期时代演化优先。提出世界时间和时代持续性的候选，尚未制作。
- 2026-10-20，第三轮 v0.2：确认行动推进时间、思考/输入/退出时暂停；允许 NPC 死亡、势力覆灭和机缘被夺自然发生；选择同一主角见证世代更替。同步清理已回答的待定项，新增开局与战斗节奏候选，补查小说资料入口及自由文字参数化结算边界，尚未制作。
- 2026-10-20，第四轮 v0.3：确认小说开篇附近开局、多种出身背景可选，以及按钮和自由文字共同操作的战术回合或分段交锋。清理已回答问题，展开空间呈现、场所移动和主角原著知识候选；补查原生 2D 呈现基础及官方译本开篇状态证据，尚未制作。
- 2026-10-20，第五轮 v0.4：确认世界地图与 2D 俯视地点场景、点击地面或对象移动及 NPC 自动接近、本土人或保留原著记忆的穿越者创建时可选。补充允许 Wiki/百科用于机制设定调研，沿用小说优先口径。清理已回答问题，展开成长、死亡存档及首个贯通活动候选，尚未制作。
- 2026-10-20，第六轮 v0.5：确认深度成长规则与路线自由组合、自由手动/自动存档及死亡后完整世界恢复、优先贯通 NPC 关系日常与探索争夺。同步清理已回答问题，展开首批地域、关系内容与运行条件候选；补查地域依据和动态人物关系目标的接纳边界，尚未制作。
- 2026-10-20，第七轮 v0.6：确认首批乌坦城生活与青山镇/魔兽山脉部分探索、亲密关系与婚姻家庭纳入长期玩法、电脑为主且模型交互质量优先。用户随后要求更新推送并换设备交接；最新选择已持久化，整体制作方案尚待汇总，未制作游戏或修补产品。

- 2026-10-20，第八轮 v0.7：从 `docs@5e215cbef` 恢复，按 D4 路由汇总完整拟定制作稿。新增首批场所/人物编制与出身建议、日常关系和家庭全流程、探索竞争、时间与代际、成长和读档细则、桌面 UI/美术、数据职责与 V1–V6/P0–P5 验证实施顺序。上述细节供整体讨论，未新增产品确认项、未正式制作。按用户追加要求，仅同步本机 main 至最新远端；其它任务改动保留。
- 2026-10-20，第九轮 v0.8：用户认可先做深三地生活与长期后果再扩大陆域，并补充动态生成 NPC、设置面向未来世界扩展的上限、通过事件平衡人口，记录为 D23–D24。世界模块提出计数口径、生成来源、事件调节、并发名额与恢复的候选细则，制作稿与负载安排同步加入人口验证；具体上限与阈值未冻结，仍未正式制作。
- 2026-10-20，第十轮 v0.9：确认正式开工；随后按新要求先拆分后端开发、前端设计迭代和后续前端集成。新增分工、后端任务、前端 AI 委托、共用契约四份模块，以前端审计的三项设计交付和覆盖映射方法提炼关键内容，不复制其平台范围/视觉。当前只完成文档准备，开发将在新对话进行；集成执行者由用户在后端完成后选择。

仓库职责与执行生命周期遵循 [Repository Governance](../../../README.md)。

- 2026-10-21，v0.10：开始原生后端实现，建立四类出身、三地场所、人物/关系/家庭规则与构建器；为实际接纳阻碍建立独立源码任务。用户要求推送换设备，本 checkpoint 保存未完成实现与准确验证边界。停用 GGchan，API 验收放到全部本地实现与验证之后。

- 2026-10-21，v0.11：完成首批后端规则与真实任务/模型接线，修复长时关系读取、沙箱负载、资源和恢复问题；交付be.2验证归档及C2接口。源码已集成main，正式前端与扩展容量仍按分工另验。

- 2026-10-21，v0.12：新增D27图片与音乐素材要求，实际生成药铺场景和苏晚禾半身像参考；用户确认画风后再继续，未制作音乐或正式前端。

- 2026-10-22，v0.13：核实 be.2 与远端 main 的真实能力，将世界整体运转设为首要目标；确认人物主动求助/邀约/竞争/结盟/隐瞒/利用均来自自身目标与经历。展开人格和目标执行、地区资源与组织循环、月度复盘与月内事件、模拟精度和无玩家参与样本；具体机制保留候选，本轮只更新方案。

- 2026-10-22，v0.14：确认复杂连续因果、复合动机、机会性改策及包含玩家的个人关系图谱。展开相遇/观察/知情链、长期未解决动机、多人反应和相互干预；以报复牵动亲属、携丹访友途中被劫为候选贯通样本，结果不预写；新增社会图谱模块，保留玩家控制、既有时间与世界权威。
