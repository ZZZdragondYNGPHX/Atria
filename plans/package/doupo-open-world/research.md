# 调研与待验证问题

> 已被 [Doupo Living World](../doupo-living-world/index.md) 取代，仅保留前期设计资料，不从这里开工或恢复执行限制。

## 证据边界

本稿为持续更新的第一轮研究。产品基线见 index；源码路径均相对于产品 `main`。静态读取证明实现结构和显式上限，不证明《斗破苍穹》目标规模的吞吐、质量、内存或运行费用。未执行游戏规模性能测试，未调用真实模型。

## 当前已核对的基础

| 能力 | 代码入口 | 对作品的意义 |
| --- | --- | --- |
| 正式规则与状态提交 | `src/native/authority-turn.js`、`authority-transaction.js`、`session-core.js` | 自由输入和模型提案可进入规则验证；正式后果由原权威发布 |
| 游戏时钟与离屏演化 | `src/native/simulation-authority.js`、`public/shared/native-simulation-contract.js` | 支持有界调度和冷热分级；具体长时结算依赖作品机制 |
| 主体、个人视角与信息 | `src/native/subject-authority.js`、`information-authority.js`、`cognition-authority.js` | 区分稳定身份、当前状态与各人所知 |
| 存档与历史 | `src/native/save-system.js`、`history-authority.js`、`repositories/session-repo.js` | 为可追溯后果与分支恢复提供既有基础 |
| 作品前端 | `src/native/frontend/`、`public/scripts/native/frontend/`、`src/native/authoring-examples/frontend-v3/` | full Experience 可接管主舞台；AUI 支持图片、SVG、2D Canvas、热点、表单、独立视图与 overlay，能组织场景式 2D 体验；流畅移动及完整工作流尚未为本作验证 |

## 2D 开放世界交互的具体适配

- `public/shared/native-frontend-presentation.js` 已声明 `svg`、`canvas`、`textarea` 等节点及事件；路由、overlay、局部状态和有界控制器可组合成场景、NPC 交谈、交易和人物档案。Canvas 只提供有界 2D 命令，不能由此推定存在通用游戏引擎、寻路或骨骼动画系统。
- `public/shared/native-frontend-host.js` 的 conversation／composer 归属于当前 Session，尚无直接的独立 NPC 频道接口。目标 NPC、当前场景、参与者、公开与私下交流及其视角需要用正式作品状态和现有权限表达，单纯改输入框标题不足以建立会话语义。
- `src/native/frontend/host-bridge.js:169` 的 transaction action 调 `executeTurn`，`src/native/adapters/generation-host.js:605` 起执行模型 narrator；按钮可省意图识别，但该路径仍依赖叙述生成。另有 `applyLifecycleCommand` 无模型命令路径，`src/native/session-core.js:633` 会在已启用的 run mode 中拒绝普通直接命令。本轮不泛称所有正式操作均必须模型；能否承接本作相同权威要求的即时玩法动作需要核实。
- 优先验证同一原权威链上的即时规则结算与按需叙述、明确会话目标及场景渲染。未决定新增 API，未将其直接认定为产品 bug。
- 原生 authoring 入口已有 `src/native/authoring-reference.js`、Studio workspace／build／preview、`src/native/project-agent.js` 的源码／契约／资源工具；不另造编译或创作系统。示例 README 有历史阶段说明，需以当前代码为准。

## 显式容量边界

- `public/shared/native-simulation-contract.js`：声明 jobs 最多 16，单次 steps 最多 16，deliberations 最多 1；作者 policy 在这些上限内配置。日历跨度可很大，但时间跨度不会自动增加运算预算。
- `src/native/authority-transaction.js`：单次准备的 record scans 为 4096、read bytes 为 256 KiB、单值为 64 KiB、总值为 1 MiB。
- `public/shared/native-authority-contract.js` 限当前 Game Logic 共 64 个 transaction 声明（包含 simulation）。可用泛型交易、施法等操作覆盖不同物品／技能／主体，不能解释成只准 64 个技能或角色。
- `public/shared/native-frontend-script.js` 的脚本上限含 8 MiB 堆、40 ms 单次 CPU、128 KiB 消息；Canvas 边长最多 2048、单 buffer 最多 2048 commands。声明与执行预算需在目标设备验证，不能把这些数字等同游戏帧率。
- `src/native/subject-authority.js:31` 解析个人离屏事项时扫描约 `2 × subjects.length + domain.records.length`；同次 Authority preparation 总扫描限 4096。`authority-transaction.js:159` 的每次私有记录读取按该域全部 records 长度收费并线性查找。对数千主体，存在明确的算法／预算不匹配风险；应验证并改进原索引或读取，而非只上调常量。
- `public/shared/native-lifecycle-contract.js` 最多 32 domains；每域最多 4096 records／1 MiB，receipt 与 tombstone 合计配置上限 4096。达到保留限制后拒绝新写入，不等同无限去重／历史。长期世界需解决活动数据、归档与去重布局。
- `world.event` reducer 的完整 selected-world next state 经 Authority value 验证时受 64 KiB 单值限制，见 `src/native/task-authority.js` 与 `public/scripts/native/experience/world/session.js`；不能把全大陆活状态放入一个不断重写的大 JSON。分领域记录的方案与平台必要改造仍需按规模实测。
- 上述上限不等于 NPC 总数上限，也不自动说明框架存在缺陷；需要依据目标负载确定聚合、分区、活跃集与必要产品修补。

## 外部研究与设定来源

以下资料已读取；本项目的采用建议是推论，不能将其他项目的规模或性能直接移植到 Atria。

| 一手资料 | 可借鉴机制 | 证据边界与项目建议 |
| --- | --- | --- |
| [Generative Agents 原论文](https://arxiv.org/html/2304.03442v2) | 观察记忆、重要性／近期性／相关性检索、反思与分层计划 | 实验为 25 角色、两游戏日；2023 年实现成本和耗时不是当前报价。建议重要角色在关系／目标变化时思考，普通日常由规则执行 |
| [Concordia 原论文](https://arxiv.org/html/2312.03664v1)、[2025 设计论文](https://arxiv.org/html/2507.08892v1) | 角色提出行动，环境裁决；可组合组件与不同模拟目标 | GM 可以使用模型，本身不保证守恒和确定性。建议既有 Atria Authority 裁决资源、位置和能力，模型处理意图与表达 |
| [AI Town 一手源码](https://github.com/a16z-infra/ai-town)、[Voyager 作者项目](https://voyager.minedojo.org/) | 模拟与慢速 agent operation 分离；可复用技能与结果反馈 | 社交演示与 Minecraft 探索不证明大型 RPG 稳定性。建议动作和回执即时可见，生成异步；旧结果采用前复核世界状态 |
| [Dwarf Fortress 2013 开发日志，12/15](https://www.bay12games.com/dwarves/dev_2013.html)、[2014 日志，07/07](https://www.bay12games.com/dwarves/dev_2014.html)、[Tarn Adams 的 Simulation Principles](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter41_Simulation_Principles_from_Dwarf_Fortress.pdf) | 个体／建筑人口／站点人口分层，关键身份持续，玩家行动后世界仍演化 | 跨层要防人口复制及资源丢失。建议近景人物、地区活动集与远方聚合状态连接同一历史 |
| [Factorio FFF-270](https://www.factorio.com/blog/post/fff-270)、[FFF-188](https://www.factorio.com/blog/post/fff-188)、[FFF-421](https://www.factorio.com/blog/post/fff-421) | 存取档保持可观察行为；注册、分桶和依赖唤醒减少轮询 | 不移植跑分或 lockstep。建议保存已接受 AI 决策，重演读取记录；按事件唤醒，避免所有人物持续全量扫描 |
| [Eco: Worlds of Consequence](https://strangeloopgames.com/worlds-of-consequence/)、[User-Generated Societies](https://strangeloopgames.com/user-generated-societies/) | 经济、生产、生态与制度形成实际后果链 | 玩家社会不证明 NPC 自治稳定。建议先验证药材→运输→炼药→库存→需求这一闭环，再扩展系统连接 |

[11 bit studios 的《这是我的战争》入口](https://11bitstudios.com/game/this-war-of-mine/)与[官方机制介绍](https://ir.11bitstudios.com/en/news/twom-will-debut-on-the-next-hardware-platform/)作为用户新指定的表现参考。用户已选择行动推进时间，不能把参考作品的昼夜机制直接写成本作规则。

Bethesda 官方支持页说明 Creation Kit Wiki 维护并指向第三方镜像；本轮原对话／Packages 页面及部分镜像不可访问。其具体 dialogue／package／Story Manager 细节不作为本轮已核验事实，见[官方支持状态](https://help.bethesda.net/app/answers/detail/a_id/33408/~/where-can-i-get-help-for-the-creation-kit%3F)。

原作核验入口为[起点《斗破苍穹》](https://book.qidian.com/info/1209977/)。本次直接抓取返回 403，不能声称已逐章核对。后续确定小说／动画等设定优先级，按可获得的原作或官方资料记录依据；搜索结果、同人和模型记忆不能直接成为游戏规则。

[Wuxiaworld 获授权译文入口](https://www.wuxiaworld.com/novel/battle-through-the-heavens)列出作者与 `Licensed From Yuewen`，可帮助交叉定位，中文术语和规则仍回到中文原作。后续将原作明确规定、剧情推导与游戏新增分别标记；人物传闻、夸耀和单次例外不能直接成为通用规则。

## 当前待测

1. 进入场所、点人物、提交自由输入、取得合法后果的完整延迟。
2. 目标主体与事项规模下的索引、扫描和状态体积；近景／远景切换后的身份与资源守恒。
3. 长时闭关、跨地区移动和世界事件密集处的结算顺序及预算耗尽行为。
4. 长期原始历史、记忆检索、存读档与分叉的成本和一致性。
5. 目标设备的场景加载、交互响应与界面流畅度。

以上项目随已确认需求具体化，不预设角色数、FPS、调用次数或费用承诺。
