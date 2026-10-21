# 斗破苍穹开放沙盒世界 — Plan Index

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；本 Bundle 位于 `docs`；必要的产品修补使用独立产品任务。
- Status: Draft v0.7 — 完整制作稿已汇总，供整体讨论；尚未获正式制作授权。
- Updated: 2026-10-20
- Source baseline: `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`；实施前重新核对实际 Git。
- Record: [累计记录](../../../records/package/doupo-living-world.md)

## 目标与确认边界

基于 Atria 制作《斗破苍穹》开放沙盒 RPG。采用地图、场所、人物与功能界面，自由文字贯穿交互；先围绕自创角色设计，设定以小说为准。世界设计优先服务 NPC 自主生活与长期时代演化。

允许自由改写原著人物命运、机缘归属和历史，采用开放沙盒方向，不将原著事件结果当作必须维护的轨道。小说设定与玩家造成的新历史需要分开表达。

已确认且跨模块生效的决定只保存在 [decisions.md](decisions.md)，其中已包括世界与时间、开局与身份、战斗、空间与移动、深度成长与自由组合、完整世界读档、活动优先级、首批地域、亲密关系与婚姻家庭，以及电脑为主、模型交互质量优先。具体玩法、长时中断、人口计算精度和美术默认设计见 [完整制作稿](production-plan.md) 及其模块；未确认细节标为拟定，数值通过后续核实与验证校准。

## 当前状态

- 已从交接恢复并核实最新 `origin/docs` 包含 `5e215cbe`；D01–D22 保持不变，v0.7 已汇总首批内容、出身、日常关系、婚姻家庭、探索竞争、成长战斗、UI/美术、数据职责、验证与实施顺序。
- 已完成第一轮源码能力与一手外部材料调查，见 [research.md](research.md)。尚未进行目标游戏负载压测、真实模型质量验证或实际制作。
- 新 Bundle 只根据当前对话建立，不从历史草案导入“已确认”条目；不恢复已有工作树中被删除的其它方案文件。
- 后续每轮先将用户新确认的取舍和受影响的候选方案更新到本 Bundle，再继续讨论。版本变化写在本入口，已确认决定统一写入 decisions。
- 正式制作等待讨论形成明确基线和用户启动指令；一般工程选择不另设逐阶段审批。
- 当前没有本任务游戏源码、`.atria` 成品或产品修补。本版是可整体检查的拟定制作稿；完成文档不代表正式开工。

## 模块路由

| 模块 | 唯一职责 | 依赖 |
| --- | --- | --- |
| [decisions.md](decisions.md) | 当前对话已确认的跨模块决定 | 用户明确指令 |
| [production-plan.md](production-plan.md) | D4 整体制作范围、贯通样本、数据职责、框架验证与实施顺序 | decisions；按主题链接领域模块 |
| [experience.md](experience.md) | RPG 交互、文字输入、首个贯通体验候选 | decisions、world-simulation |
| [world-simulation.md](world-simulation.md) | NPC 自主生活、时间推进、历史改写、时代演化候选及本轮待定项 | decisions、research |
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
| D4 制作基线 | 当前；v0.7 完整制作稿已汇总，讨论拟定细节并等待正式启动 | index → decisions → content-and-runtime → production-plan；规则/成长按需读 player-and-combat、world-simulation、progression-and-consequences，UI 读 presentation，技术证据读 research；恢复时加 Record |
| Implementation | 尚未授权启动；拟定 P0–P5 连续执行，先验证身份与读档再扩充内容 | 授权后 index → decisions → production-plan → research；再按实施主题加载领域模块和 Record |

## 实质设计变化

- 2026-10-20，第二轮 v0.1：依据当前对话建立新 Bundle。确认界面化 RPG 与贯穿的自由文字、自创角色、小说设定、开放沙盒自由改写历史，以及 NPC 自主生活和长期时代演化优先。提出世界时间和时代持续性的候选，尚未制作。
- 2026-10-20，第三轮 v0.2：确认行动推进时间、思考/输入/退出时暂停；允许 NPC 死亡、势力覆灭和机缘被夺自然发生；选择同一主角见证世代更替。同步清理已回答的待定项，新增开局与战斗节奏候选，补查小说资料入口及自由文字参数化结算边界，尚未制作。
- 2026-10-20，第四轮 v0.3：确认小说开篇附近开局、多种出身背景可选，以及按钮和自由文字共同操作的战术回合或分段交锋。清理已回答问题，展开空间呈现、场所移动和主角原著知识候选；补查原生 2D 呈现基础及官方译本开篇状态证据，尚未制作。
- 2026-10-20，第五轮 v0.4：确认世界地图与 2D 俯视地点场景、点击地面或对象移动及 NPC 自动接近、本土人或保留原著记忆的穿越者创建时可选。补充允许 Wiki/百科用于机制设定调研，沿用小说优先口径。清理已回答问题，展开成长、死亡存档及首个贯通活动候选，尚未制作。
- 2026-10-20，第六轮 v0.5：确认深度成长规则与路线自由组合、自由手动/自动存档及死亡后完整世界恢复、优先贯通 NPC 关系日常与探索争夺。同步清理已回答问题，展开首批地域、关系内容与运行条件候选；补查地域依据和动态人物关系目标的接纳边界，尚未制作。
- 2026-10-20，第七轮 v0.6：确认首批乌坦城生活与青山镇/魔兽山脉部分探索、亲密关系与婚姻家庭纳入长期玩法、电脑为主且模型交互质量优先。用户随后要求更新推送并换设备交接；最新选择已持久化，整体制作方案尚待汇总，未制作游戏或修补产品。

- 2026-10-20，第八轮 v0.7：从 `docs@5e215cbef` 恢复，按 D4 路由汇总完整拟定制作稿。新增首批场所/人物编制与出身建议、日常关系和家庭全流程、探索竞争、时间与代际、成长和读档细则、桌面 UI/美术、数据职责与 V1–V6/P0–P5 验证实施顺序。上述细节供整体讨论，未新增产品确认项、未正式制作。按用户追加要求，仅同步本机 main 至最新远端；其它任务改动保留。

仓库职责与执行生命周期遵循 [Repository Governance](../../../README.md)。
