# Atria Immersive Workspace — Plan Index

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`
- Status: **Frozen for staged implementation — 2026-10-05；用户已授权开工与自主处理，新增契约已完成 D1 设计核对。**
- Current stage: B1 Actors/EntryPoints/Worlds/Knowledge 映射与展示 checkpoint 已完成；B2 Prompt/Runtime/检索已完成；正在 B3 Agents/Memory。用户已授权连续完成剩余 B/F 并最终推送合并；逐类保留独立映射和验证门，不再阶段暂停。Shared 描述明确停用，外部设备/引擎等未测范围继续明示。

## Goal

将 Atria 的游玩、资料库、创作、智能体和运行配置统一到用户确认的浮动工作空间中，突出阅读与当前任务，重组管理、审阅和恢复入口；完整保留现有编辑能力。将隐藏的用户设定管理重构为原生、账户拥有、会话独立选择的模块。

这是一项新的后续改造，不重写已完成的 [旧前端设计历史](../atria-product-frontend-redesign/index.md)。原有 tokens、外观、Environment、导航和控制器是复用基线；本 Bundle 已获分阶段实施授权，其明确列出的新布局规则覆盖旧设计对应条目。未涉及的 Native Frontend v3 边界仍由 [v3 Plan](../native-frontend-runtime-v3/index.md) 与实际契约负责。

## Confirmed core principles

1. 游玩优先；保留五域语义、浮动层次与现有蓝紫色系。
2. 原生产品保留 English / 简体中文。平台正文采用衬线字体，控件采用无衬线；作品自有字体和布局受自身声明控制。
3. 首轮保留全量现有编辑器及高级 JSON / Source；后续按资源类型逐类重构。
4. 界面重组不改变作品、资源修订、会话、请求和项目提交的 authority；每个旧动作须有可追溯去向。
5. 用户设定是新增原生能力工作包，开放条件单列。讨论原型不是产品实现或集成验收。

详细确认清单只在 [decisions.md](decisions.md) 维护。

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| [decisions.md](decisions.md) | 已确认偏好、草案提议、范围差异 | — |
| [experience.md](experience.md) | 视觉、导航、工作区布局、呈现边界 | decisions |
| [baseline-inventory.md](baseline-inventory.md) | 现有 S00–S19 功能与字段基线快照 | main 基线 |
| [coverage.md](coverage.md) | S00–S20 接线、输出、阶段和验收归属 | baseline、experience |
| [states.md](states.md) | 加载、草稿、冲突、审阅、能力与异步生命周期 | coverage |
| [personas.md](personas.md) | S20 原生身份、Prompt 接入、迁移、恢复与开放门 | states、Native 契约 |
| [delivery.md](delivery.md) | 分阶段实施、完整编辑能力保留、依赖和阶段门 | coverage、personas |
| [validation.md](validation.md) | 验证矩阵、证据要求与执行入口 | coverage、states、personas |
| [entrypoints-mapping.md](entrypoints-mapping.md) | B1 EntryPoints 字段/动作/模式、Source/draft/revision/handler/authority、错误冲突离开、缺口与替换测试门 | delivery、coverage S12、baseline、states、validation |
| [worlds-mapping.md](worlds-mapping.md) | B1 Worlds snapshot/Library/只读原版字段与动作、Source/draft/revision/handler/authority、错误冲突离开、缺口与替换测试门 | delivery、coverage S12/S07、baseline、states、validation |
| [knowledge-mapping.md](knowledge-mapping.md) | B1 Knowledge snapshot/裸 content/可编辑原版、条目全字段与操作、exact refs/草稿/冲突/authority | delivery、coverage S12/S07、baseline、states、validation |
| [b2-mapping.md](b2-mapping.md) | Prompt/Runtime/检索全字段、Source和原契约映射 | delivery、states、validation |
| [b3-mapping.md](b3-mapping.md) | Agents四模式、Memory OS/Trace、权限/预算/Scope及Source映射 | delivery、states、validation |
| [actors-mapping.md](actors-mapping.md) | B1 Actors 旧字段/动作/模式、展示去向、draft/revision/authority、已知缺口与测试门 | delivery、coverage S12/S07、baseline、states、validation |

## Stage routing

| Stage | 内容 | 必读（均先读本 index） |
| --- | --- | --- |
| D0 | 讨论证据整理与正式草案 | decisions、coverage、delivery |
| D1 | 审阅草案、契约核对、冻结实施范围 | decisions、personas、delivery、validation；coverage 按受影响行读取 |
| A1 | 外壳、共享状态、搜索、入口 | experience、states、coverage 的 S00/S01/S18/S19、validation |
| A2 | 游玩、资料库、安装与恢复 | experience、states、coverage 的 S02–S08/S17、validation |
| A3 | 创作、运行配置、智能体、扩展接线 | states、coverage 的 S09–S16、delivery 的完整编辑保留清单、validation |
| A4a | 用户设定原生持久化与会话 / 请求契约 | personas、states、validation |
| A4b | 用户设定管理、选择、迁移、备份与入口开放 | personas、coverage 的 S20 与关联行、validation |
| A5 | 首阶段集成与兼容验收 | delivery、validation，失败项再路由到其权威模块 |
| B1–B4 | 编辑器逐类重构（每类独立阶段） | delivery、对应 coverage 行与 baseline 小节、states、validation；B1 Actors 增读 actors-mapping；B1 EntryPoints 增读 entrypoints-mapping；B1 Worlds 增读 worlds-mapping |
| F | 最终验收、集成与清理 | delivery、validation |

## Dependencies and current design state

A1 → A2 → A3；A4a 依赖稳定会话 / 请求 authority，A4b 依赖 A4a 与 A2 的资料库/游玩入口；A5 同时依赖 A1–A4b。B 阶段在 A5 验收后开始。共享席位、自有界面和存档兼容属于 A4 开放条件，不能留到入口开放后再处理。

目前 S00–S20 均有设计覆盖，A5 已建立首轮支持范围的实际本地证据映射，**完整字段/设备/引擎矩阵与最终集成验收仍未完成**。布局偏好已经确认，Native 用户设定的 schema/API、迁移 ledger、旧会话兼容设计已在 personas 冻结，A4a 服务合约与 A4b 迁移、账户备份和产品接线已实现并完成针对性本地验证；支持范围入口开放，共享描述停用，剩余矩阵与最终验收继续归 B/F。不要把占位 HTML 的字段和服务样例复制到产品中作为现有编辑器的替代。

A1–A3 已实现并完成各阶段本地针对性验证；执行证据与限制见 [Record 的 A1](../../../records/refactor/atria-immersive-workspace.md#stage-a1--floating-shell-navigation-and-shared-state)。A2 的详细证据见 [Record 的 A2](../../../records/refactor/atria-immersive-workspace.md#stage-a2--play-library-install-and-recovery)。A3 的详细证据见 [Record 的 A3](../../../records/refactor/atria-immersive-workspace.md#stage-a3--authoring-runtime-agents-and-extensions)。这只关闭 A1–A3 checkpoints，不表示 S00–S20 全矩阵或最终集成验收完成。

## Validation strategy

以 [validation.md](validation.md) 的真实 authority、状态和设备矩阵验收；每阶段只在本地执行最小相关验证；实际修改与未解决风险决定检查范围。不计算原型“等价通过率”。仅文档检查通过不能推进产品开放门。

## Material routing / design changes

- 2026-10-05：新建 Draft Bundle，整理 v0.2–v0.8 确认；增加 S20 独立原生能力与迁移工作包；旧设计完成状态保持原样。

- 2026-10-05 D1：用户开工授权；冻结 P01–P06 与 Persona kind/schema/API、Session/重试、Context/共享/Host、迁移账本、Save v3 和现有备份扩展契约。A1 准备就绪，未开始产品修改。
- 2026-10-05 A1：浮动外壳、compact 阅读顶栏五域菜单、来源/owner 级搜索重试与查询返回、authority 离开草稿检查完成；复用认证/学习/设置/诊断。离开取消保留原编辑表面，确认离开丢弃；不新增跨路由草稿持久化 authority。下一阶段 A2。

- 2026-10-05 A2：平台正文 serif/头像回退与消息序号、P01 输入策略和 Stop、历史分叉/切换/只读、游玩退出、Library 独立安装/导入流程与 exact 旧版本恢复完成；完整资源编辑器保持。产品 `2d0df2cef` 已 push，下一阶段 A3。

- 2026-10-05 A3：20 个 Studio view、资源引用页签与 exact lifecycle、独立人工 Apply / Agent Commit、保存回执/长任务/草稿、Runtime 修复返回原启动、Agents Session 范围和扩展/插图接线完成。产品 `57a37bc8ac69ed0274d04ce0a8d1016d96ac4496` 已 push，下一阶段 A4a；未开放 Persona。

- 2026-10-05 A4a：原生 Persona 资源/头像/CAS/default、受保护 Session 身份和输入快照、显式 Prompt consumer/预算 evidence、两类 reply retry、Save v3 三 scope、共享席位/头像与 gated Host capability 完成；产品 `e35e900077b6c2963cd032cdccfc45c24ab90102` 已 push。FS root 增加 publishedRevisionIds 发布闭包，Shared authorization 固定主体/epoch；共享描述暂明示停用，A4b 才补迁移/账户备份/picker/UI 和开放证据。

- 2026-10-05 A4b：Persona 管理/选择/草稿与搜索、上传 JSON/账户旧设定预检、durable ledger 回放和默认独立 adoption、现有账户备份 Persona manifest/恢复审阅、Shared 自己席位 UI 与 solo Host picker/独立恢复入口完成。产品 `6bbb69484` 已 push；Shared 描述在 Context 层显式阻断。入口仅开放已验证支持范围，完整矩阵/设备/最终集成归 A5/B/F。

- 2026-10-05 A5：首轮跨域/旧 Session/Save v1–v3/FS↔SQLite/呈现/语言/键盘本地 checkpoint 完成，支持范围冻结；修正跨域父子两步导航和 Persona Tab 焦点。产品 `784bb91a8` 已 push，28 suites/181 不同 unit、18 不同 Chromium 场景的实际范围见 Record A5。Shared 描述停用，缺环境与未执行矩阵继续明示；下一 checkpoint 为 B1 Actors，先做逐字段/动作/状态/authority 映射。
- 2026-10-05 B1 Actors mapping：基于同一产品 HEAD 提交 actors-mapping；明确 Actor 为 project-source、profile/metadata 任意 JSON、集合 Source/顶层归一化/重复 ID/冲突草稿缺口与替换验收门。本轮只完成映射，未改产品、未执行展示替换；Shared 描述继续停用，下一轮只实施 Actors。

- 2026-10-05 B1 Actors display：专属字段/高级结构与 Source 共用原草稿；集合 Source 始终可达、exact actorId 选择、Review 前拒绝 unknown/legacy/duplicate/悬空 EntryPoint 引用、冲突复制与明确放弃重载完成。复用 project.save/Workspace/ChangeSet，产品 `9991c6ef0` 已 push；具体本地证据与后端限制见 Record B1 display。Shared 描述停用；停在 Actors，EntryPoints/Worlds/Knowledge/B2/F 未开始。

- 2026-10-05 B1 EntryPoints mapping：基于产品 `9991c6ef0` 完成 entrypoints-mapping；覆盖 canonical 全字段、引用与 primary、任意高级 JSON、集合 Source、exact ID/项目 revision/人工与 Agent authority、运行约束/第一入口动作、G01–G05 与 N01–N08 替换门。只改文档，未替换产品；Shared 描述停用。按用户要求完成映射后停止。

- 2026-10-05 B1 EntryPoints display：专属身份/引用/primary/初始状态和消息/高级 JSON 与原 Source 共用草稿；集合 Source、exact ID 选择与树高亮、Review 前防丢失/重复/引用检查、冲突复制与确认重载完成。复用原 project.save/Workspace/ChangeSet，明示第一入口与 scenario 目标；真实 FS/HTTP/.atria/Session/Save 和中文窄屏本地证据见 Record。本 checkpoint 完成后停止，Shared 描述停用；下一轮先做 Worlds 映射。

- 2026-10-05 B1 Worlds mapping：基于产品 `f40bca67b` 完成 worlds-mapping；区分 project-source snapshot、Library immutable revision/CAS、installed 原版只读与 Session state，完整字段/动作/模式/Source/冲突/离开/引用闭包映射及 G01–G06、N01–N08 已记录。只改文档，未替换展示；按用户要求停止。下一独立 checkpoint 为 Worlds 展示与局部防护，Shared 描述停用。
