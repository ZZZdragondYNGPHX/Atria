# 斗破苍穹开放沙盒世界 — Plan Index

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；本 Bundle 位于 `docs`；必要的产品修补使用独立产品任务。
- Status: v0.20 — fe.2正式原生前端接入be.5/C4：四入口主界面、人物内页签、独立Q版地图、身体/功法/关系及存档恢复。W5长期成本与D33完整战斗仍保留各自边界。
- Updated: 2026-10-23
- Source baseline: main@4470cffb9f688d7e889eb94b42b1cb85966318c1；package@ac008cdddf04f22a4d94c5e0d8f4e5b397169cd4（fe.2 / be.5规则 / C4），以实际Git为准。
- Record: [累计记录](../../../records/package/doupo-living-world.md)

## 目标与确认边界

基于 Atria 制作《斗破苍穹》开放沙盒 RPG。采用地图、场所、人物与功能界面，自由文字贯穿交互；先围绕自创角色设计，设定以小说为准。首要目标是让整个世界在游戏时间内自主运转：人物追求目标，家庭与组织协调成员，资源和生计产生需求，旅行与消息连接地区，结果继续影响后续选择。NPC 自主生活与长期时代演化由这些相互作用形成。

允许自由改写原著人物命运、机缘归属和历史，采用开放沙盒方向，不将原著事件结果当作必须维护的轨道。小说设定与玩家造成的新历史需要分开表达。

已确认且跨模块生效的决定只保存在 [decisions.md](decisions.md)，其中已包括世界与时间、开局与身份、战斗、空间与移动、深度成长与自由组合、完整世界读档、活动优先级、首批地域、亲密关系与婚姻家庭，以及电脑为主、模型交互质量优先。具体玩法、长时中断、人口计算精度和美术默认设计见 [完整制作稿](production-plan.md) 及其模块；未确认细节标为拟定，数值通过后续核实与验证校准。

## 当前状态

- 0.1.0-be.5/C4在既有机制上新增集中注册的7个池、初始化/迁入/出生共用生成、成对外观和实际差异功法；地图重点标记与附近/旧档案分开，素材20组40张。此前已实现持续身体伤势/缺失、统一能力限制、装备实例/损耗/维修、可中断NPC生活/修炼/旅行、实际补给与生态采运、药铺投入和工资、个人目标/动机/图谱、信件与后台冲突/有限控制。角色所知及观察传播受视角约束，重要原因保留有界稀疏变化和事实级公开详情。
- 真实构建/安装、Native状态写入、治疗/维修/冲突/控制、来源查询与完整恢复、Bridge幂等和迟到任务隔离有直接证据。60日分批人物结果一致，420日纯规则演化与96名NPC成熟数据的早期完整宿主样本通过；具体计数、失败修正及真实模型服务结果见同一Record。
- 当前实际字段、操作和失败语义只有[frontend-contract的C4](frontend-contract.md#c4--2026-10-23-人物显示分层与统一内容池)一份权威；C2/C3保留为旧版本历史。使用新局，没有be.4旧存档迁移。fe.2已将当前字段接入正式详情界面；准确验证范围见Record。
- W0–W4已形成默认规则切片，不能据此声称所有社会策略、内容变体或整个W0–W5完成。W5尚需稳定活动聚合、区域/依赖唤醒、96人跨月完整宿主及更长期增长成本；现有图谱/信息/Domain容量有界，超限拒绝。
- D33的完整玩家战斗仍后续独立实施；用户已指定当前执行者正式集成前端。核实到feat/doupo-frontend@bed05a36已有C2原生前端，本轮按路径复用并升级至C4；正式文件集中frontend，不覆盖独立design-reference工作。素材分工独立，本轮新增media/pools，复用8张既有半身图；没有修改design-reference和独立批量素材原目录。
- 已消费2026-10-22换设备HANDOFF，恢复与实施事实归同一Record，移除临时交接文件；没有新建HANDOFF、独立审查或阶段审批。

## 新对话开工入口

先核对真实Git，再从本index读取C4、同一Record和当前阶段模块。be.5是当前规则基线，fe.2是当前整包版本；池/显示数据的首批接入已完成。按content-pools补充内容变体，继续W5成本/聚合与剩余行为覆盖；必要时修正受影响的默认机制。模型连接只读当前本机私有配置，不复制历史临时凭证；正式前端当前为fe.2，后续界面沿其组件与C4继续；独立批量美术与完整玩家战斗保持各自边界。

## 模块路由

| 模块 | 唯一职责 | 依赖 |
| --- | --- | --- |
| [content-pools.md](content-pools.md) | 各类池统一目录/注册、资格/抽样/重复控制、人物成对外观、初始化/后续生成与恢复 | decisions D36–D38、presentation、frontend-contract |
| [decisions.md](decisions.md) | 当前对话已确认的跨模块决定 | 用户明确指令 |
| [production-plan.md](production-plan.md) | D4 整体制作范围、贯通样本、数据职责、框架验证与实施顺序 | decisions；按主题链接领域模块 |
| [implementation-readiness.md](implementation-readiness.md) | 玩法对应的代码承载缺口、完整实现路径、构建预算与完成状态 | 实际源码、领域模块、frontend-contract |
| [character-condition.md](character-condition.md) | 身体部位、持续伤病、能力影响、治疗、观察/详情与恢复 | decisions、NPC冲突、世界时间、个人所知 |
| [execution-split.md](execution-split.md) | BE/FE 分工、文件边界、并行推进与后续集成 | decisions、production-plan |
| [backend-task.md](backend-task.md) | 后端完整任务、完成条件、交付与新对话启动提示 | execution-split、frontend-contract、research |
| [frontend-ai-brief.md](frontend-ai-brief.md) | 给前端 AI 的关键内容、三项设计交付与新对话启动提示 | execution-split、frontend-contract、presentation |
| [frontend-contract.md](frontend-contract.md) | F01–F12 能力覆盖、数据/操作/状态语义与后续真实接口映射 | decisions、领域规则、实际实现 |
| [experience.md](experience.md) | RPG 交互、文字输入、首个贯通体验候选 | decisions、world-simulation |
| [world-simulation.md](world-simulation.md) | 世界自主运转定义、活动与时间、信息/精度/人口、历史一致性 | decisions、research；领域细则按需读下两模块 |
| [npc-agency.md](npc-agency.md) | 人格、持续目标、计划执行、NPC 主动社会行为与联合行动 | decisions、world-simulation、world-systems |
| [npc-progression-conflict.md](npc-progression-conflict.md) | NPC修炼/突破、后台冲突、功法装备道具与分类损耗、未来玩家战斗边界 | decisions、npc-agency、world-simulation、progression-and-consequences |
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
| 世界自主运转深化 | be.5/C4已有默认机制及首批统一内容池和代表性证据；按W5继续聚合/长期宿主与更广行为覆盖 | index → decisions 的 D28–D34 → implementation-readiness → world-simulation → 当前功能的领域模块（身体读character-condition） → production-plan/backend-task；事实核对读取 research/Record |
| FE 界面迭代 | 离线原型和设计；实际进展归对应设计任务 | index → frontend-ai-brief → execution-split → frontend-contract → presentation；确认边界读 decisions，内容按需 |
| 前端集成与整包交付 | 2026-10-23用户指定当前执行者；按C4进行P4表现与P5整包验收 | index → execution-split → frontend-contract 的实际映射 → 选定的前端三项产物 → Record |

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

- 2026-10-22，v0.15：补查NPC被动成长、现有玩家交锋与物品模型，确认NPC自主修炼和NPC/NPC后台冲突需深化，功法/装备/道具及分类消耗/损耗进入判定；完整玩家战斗按新指令留待后续大修改。本轮只更新方案与准确能力说明，未修改代码。

- 2026-10-22，v0.16：按用户要求重新对照想法与代码承载，新增功能实现对应与身体/伤势模块。将伤势、装备、受控状态、图谱/消息、活动/组织生产等逐项连接到合法写入、能力影响、可见详情和恢复，调整W0/W1先贯通基础再组合长链。补齐BE/FE责任和如实标记完成程度；本轮仍只更新方案，没有声称新机制已经运行通过。

- 2026-10-22，v0.17：恢复W0快照并实现be.4/C3世界运行后端；关键身体/器物/活动/消息/图谱/因果与恢复通过实际样本。记录成熟96人早期宿主与420日纯规则边界，保留W5多尺度/长期成本和正式界面未完成状态。
