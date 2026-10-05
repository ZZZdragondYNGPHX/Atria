# B1 EntryPoints — field, action and authority mapping

## Scope and evidence

本模块是 [delivery replacement gate](delivery.md#editor-replacement-gate-for-b-stages) 所需的 EntryPoints 范围映射，对应 [coverage S12/V12](coverage.md) 和 [baseline S12](baseline-inventory.md)。基于产品 `refactor/atria-immersive-workspace@9991c6ef03941ac6d6c321843d692b77841b7797` 的真实源码。本 checkpoint **只完成映射，未替换展示、未修改产品**；实际本地验证见 [Record B1 EntryPoints mapping](../../../records/refactor/atria-immersive-workspace.md#stage-b1-entrypoints--mapping-checkpoint)。Actors 展示已完成，不重做；Worlds/Knowledge/B2/F 不在本轮范围。Shared Persona description 继续停用。

EntryPoint 是 `source.package.entryPoints[]` 中的项目内结构，写入目标仍是 `core.project` / `project-source`，基准仍是项目 Git revision。**当前没有 `core.entrypoint` resource descriptor、项目 graph 节点或独立 repository/revision**。World detach 提示临时构造的 `core.entrypoint` 定位对象不是资源注册或持久化 authority，不能据此新增 Library CRUD/Attach/Fork/Update 或宣称 Used By 完整。

源码定位均相对产品 workspace：

| 证据 | 入口 |
| --- | --- |
| 展示、集合、选择、导航 | `public/scripts/native/studio-workspace.js`：`sourceSection`、`viewResourceId`、`createResourceTree`、`renderCollectionEditor`、`normalizeCollectionPatch`、`resourceTreeSelect` |
| 草稿、任意结构、Source | `public/scripts/native/studio-value-editor.js`：`mountStudioValueEditor`；同一 draft/sourceText，返回 `getSource`，当前 EntryPoints 未保存返回句柄 |
| 人工审阅与提交 | `studio-workspace.js`：`stageProject`、`stageOperations`、`applyPending`、`refreshProject`、`renderActivity`；`public/scripts/native/studio-authoring.js`：`projectSaveOperation`、`createStudioWorkspace`、`patchProjectSource` |
| HTTP、服务、存储 | `public/scripts/native/studio-client.js`；`src/endpoints/native-studio.js`；`src/native/authoring/studio-service.js`；`src/native/project-store.js` |
| 字段与引用规范 | `src/native/contracts.js`：`assertEntryPoint`、`assertAtriaPackageManifest`；`src/native/identity.js`；`src/native/project-source.js`：`assertPackageSource`、`assertAtriaProjectSource` |
| 构建、依赖、运行 | `src/native/{dependency-closure,package-composition,runtime-descriptor,experience-validation,session-core,studio-preview,studio-scenario,task-authority}.js`；`src/native/frontend/compiler.js` |
| 资源查询边界、兼容显示 | `src/native/authoring/{resource-registry,resource-graph}.js`；`public/scripts/native/{studio-authoring,session-projection}.js` |

## Field and canonical output mapping

下一轮专属 Fields renderer 嵌入原 value editor；单入口修改按 **exact entryPointId** 克隆全项目、只替换该入口，集合编辑只替换 `package.entryPoints`。单入口与集合是不同编辑目标，切换走原离开确认；Fields/Source 共用一个目标草稿，不新建写入 authority。

| 旧字段 / 形态 | 当前编辑与 canonical 校验、输出 | 替换位置与保留要求 | 测试门 |
| --- | --- | --- | --- |
| `package.entryPoints` | Project/Package 都要求非空数组；允许单/多入口；当前非空只可选一个入口编辑，无集合 Source/专用 CRUD（G01） | 入口 chooser + 始终可达的集合 Source，保留数组顺序；新增/删除/排序仍走 `project.save`，删除最后一个必须拒绝。空集合只作为错误修复状态，不是可保存的空项目 | T01、probe；N01 |
| `entryPointId` | `entry_` + 32 位小写 hex Native ID，原通用文本可改；Project 当前接受重复入口 ID，Package 拒绝（G03） | exact 身份区 + 高级显式修改/Source；改名不改 ID；同名独立；ID 变化不自动重写 scenario/引用/Session；Review 前拒绝重复 | T01、T03、probe；N02 |
| `displayName` | 非空 string，≤256；不 trim，空白字符串仍符合原 `text` 校验；可重名 | 名称输入，不能按名字匹配/合并/生成身份 | T01、probe；N02 |
| `actorIds` | 缺失→`[]`；必须唯一 Actor Native ID 数组，null/重复拒绝；Project/Package 必须解析到声明的 Actor | 角色引用区，按 exact actorId 显示名称+ID；保留顺序与零/多 Actor，不自动加入全部 Actor/首个 Actor；高级数组 Source 完整保留 | T01、probe；N03 |
| `primaryActorId` | undefined/null 省略；如有必须在 actorIds；Session projection 用该值或 actorIds 第一项 | 可选主角色 + 明确移除；“未指定”保留缺失，不保存隐式回退，不假设主角色是 Persona/席位/player | T01、T07、probe；N03 |
| `worldIds` | 缺失→`[]`；唯一 World Native ID 数组；Project 接受项目 snapshot 或 exact dependency 声明；Package 必须有对应打包 World | 世界引用区，身份关联实际 snapshot/dependency revision；不根据名称/latest 选版本，不提供虚构 EntryPoint Attach authority | T04、probe；N03 |
| `primaryWorldId` | undefined/null 省略；如有必须在 worldIds；运行时仅一个 World 时可回退该 World，多 World 不默认选第一个 | 可选主世界 + 移除；显示实际回退条件，不把运行时回退固化进源 | T03、T07、probe；N03、N04 |
| `knowledgeBindingIds` | 缺失→`[]`；唯一 KnowledgeBinding Native ID 数组；Project 解析到本地或 dependencies binding，Package 解析到打包 binding | 知识绑定引用区 + exact source/revision 信息；保存的是 binding ID，不改成 knowledgeBaseId/知识名称；World 自带绑定与入口显式绑定不可静默合并进字段 | T04、T07、probe；N03 |
| `initialStateOverlay` | 可选，assertEntryPoint 只检查任意 JSON，**不要求 object**；Session `initialWorldState` 才要求 object，缺失/null 经 `?? {}` 回退；多 World 且非空 overlay 要 primaryWorldId | 初始状态结构区 + Source；保留任意 nested JSON 与缺失/null；运行约束错误明示，不自动转 `{}`。覆盖只作用 primary World baseline 的浅合并；无 World 时保留 initialState。显式启动 World selection 改 primary 时原 overlay 被忽略 | T07、probe；N04 |
| `initialTimeline` | 可选任意 JSON；Session `_create` 要 array（缺失/null→`[]`），每个 draft 经 `normalizeMessageDraft`/`_newEntry` → TimelineEntry/Variant | 初始消息结构区/数组 Source；增删/排序/嵌套类型保留，不缩成单一 opening 文本。role/content/actorId/metadata 以及原 envelope/projection 路径继续由消息 authority 检验；不伪造 message/session/revision IDs | T07、probe；N04 |
| `runtime` | 可选任意 JSON；`runtime.experienceContract` 只属于 Package，EntryPoint 出现即拒绝；authoring 时 `runtime.experience` 另走 `assertFrontendExperience(...,{authoring:true})` | Runtime 覆盖区 + 完整结构/Source；缺失/null/非 object 值不能静默改写。不能复制 Runtime 管理路线表建立新 authority；可保存不等于所有运行消费者支持 | T03、T05、probe；N05 |
| `runtime.experience` | text/component/hybrid/full 与 Native Frontend Source 仍用原 schema；build 编译 Source→runtime graph；Preview/Session 按 entry experience `??` package experience 解析 | 高级体验结构与 Source 保留；遵循原 Frontend 验证/编译，不恢复 retired UI 或可执行路径。其它 Experience/UI view 目前编辑第一入口（G05），不能声称跟随所选入口 | T03、T05；N05、N08 |
| `runtime.game.logic` / `observations` | descriptor 合并 package/entry game，要求安全声明式 `.json` 路径；experience validation 检查每个入口的有效 logic/authority 约束 | 高级完整 game 结构；保留原合并规则、错误与源文件定位，不添加入口私有插件/权限保存捷径 | T03；N05 |
| `runtime.*` 其它 JSON | EntryPoint clone 保留；消费者分别有 schema/合并/闭包规则，task authority 有 package/entry runtime 浅合并；build 的 modelPrompt exact 重映射/检查主要在 package runtime | 任意结构/Source 无损保留；不能据保留字段宣称它已获 Runtime Route/Secret/plugin/modelPrompt 全部运行支持，也不自动改为 package-owned ref | T02、T03、probe；N05 |
| `recommendations`、`orchestration`、`memory` | 每个键可选、独立任意 JSON（含 null/array/primitive），没有 EntryPoint 专属 enum 或 typed schema；本次未找到这些入口顶层键的直接消费接线证据 | 高级结构/Source 保留原值与缺失；不据字段名发明模式、默认值、预设 adoption 或已生效提示。Package 的同名配置不等于这些入口字段 | T02、probe；N05 |
| EntryPoint 顶层其它 key（含 `metadata`/description 等非 canonical 键） | **G02**：无 `assertOnlyKeys`，只输出 canonical 字段；未知顶层静默丢弃；ProjectStore.get 先归一化，UI 不能恢复已剔除数据 | Review 前列出未知键并拒绝；修复需用户显式修改 Source，不自动移到其它位置，不声称任意顶层扩展无损 | probe；N06 |
| retired/legacy key | `ui !== undefined` 拒绝（null 也拒绝）；自有 `world` key 拒绝；legacy identity 拒绝 characterId/charId/charDir/char_dir/avatar_url/avatarFilename/characterName/chatFile/chatName/messageIndex/swipeIndex/swipe_id | 就近反馈并保留 Source，不自动迁移 world→worldIds、卡片→Actor、UI→Frontend 或 Persona/席位映射 | probe；N06 |

Canonical 是 `{entryPointId,displayName,actorIds,worldIds,knowledgeBindingIds,primaryActorId?,primaryWorldId?,initialStateOverlay?,initialTimeline?,runtime?,recommendations?,orchestration?,memory?}`。三个数组缺失归一化为空、两个 primary null 被省略是原契约；六个高级 JSON 键的内部未知成员与入口顶层未知键必须分别验收。

## Modes, conditions and draft/revision mapping

EntryPoint **没有独立 mode discriminator**。`runtime.mode` 不是 assertEntryPoint 的 enum；真实呈现模式由 `runtime.experience.mode` 和原 Frontend contract 负责。

| 条件 | 基线事实 / 替换要求 |
| --- | --- |
| 加载/空/单/多入口 | canonical 项目至少一个入口；原空集合分支仍存在，错误修复可用集合 Source；新建项目默认 Main、零 Actor/World/Binding。单/多入口 chooser/tree 当前 index 选择（G03），替换按 exact ID，排序后继续原身份 |
| 同名/ID 编辑/重复 ID | 名称不是 identity；ID 显式改动允许但不自动改消费者；重复 ID 当前可读为项目，必须进入集合 Source 修复，不能用 find/index 猜目标 |
| Fields | 通用递归已有成员，string/多行、boolean、有限 number；null 只读；空 object/array 指向 Source；无原字段新增/删除按钮。专属便捷区只 patch 自己的键，不重建高级结构 |
| Source | 目前只有所选入口 JSON；成员新增/移除、类型修改、数组排序通过它。非法 JSON 保留原文，切 Fields 失败留在 Source；下一轮补集合 Source，不复制第二个 draft |
| 可选字段/任意类型 | 缺失只在显式输入时创建，可选 primary 支持移除；非预期已有类型留给高级结构/Source，禁止 stringify、默认填空、删扩展 |
| Review/Apply/Agent | 本地草稿不改 `state.source`；pending 携 exact projectId/baseRevision/human origin。Cancel 不清编辑器；Apply 才写。Agent Review/Commit/Takeover 仍 task authority |
| 草稿目标 | 账户 owner + projectId + 项目 baseRevision + exact entryPointId（或集合目标）；当前 lifecycle 没有跨刷新/跨路由草稿库。Fields/Source 同一草稿，换目标按原取消/丢弃；原 index 仅列表坐标 |
| compact/medium/wide | 原 Environment 和 Project/Editor/Preview/AI/More/Inspector 保留；替换 EntryPoints body，不重写 shell |
| native/hybrid/full/Shared、已有 Session/Save | 修改作者项目只影响后续构建；已安装 packageVersion/contentHash、已有 Session.entryPointId 和 Save exact closure 不自动推进，不按名称补绑/切入口；Shared 描述固定阻断 |
| Preview/Experience/UI/scenario | Studio Preview helper、Experience/UI 当前使用第一入口；Simulation 使用 scenario.entryPointId 或 manifest 第一入口。编辑 chooser 不是这些动作的目标选择 authority（G05）。排序可改变这些默认动作，须明确目标/影响，不悄悄新增联动 |

## Action mapping

| 旧动作/能力 | 原 handler、authority、输出 | 替换去向与边界 |
| --- | --- | --- |
| 打开/过滤/选入口 | tree → `resourceTreeSelect`；chooser → `confirmEditorLeave` / render | `entrypoints` view 保持；新增 exact ID 选择/同名可分辨，取消保留原 DOM 与 Source |
| 修改字段、Fields↔Source | `mountStudioValueEditor` 的 clone/draft/sourceText/HTML validity/JSON parse | 专属名称、引用、初始状态/消息与高级区共用原草稿；不直接 persist |
| 单入口字段增删/结构变化 | 原单入口 Source | 完整保留，包括高级未知 nested JSON；不把任意初始消息简化为一行文本 |
| 入口新增/删除/排序 | 原非空没有集合入口（G01）；全站 Source 是文件列表，manifest 被 listFiles 排除、writeFile 禁写 | 始终可达集合 Source；非空规则/唯一 ID 前置拒绝；不把文件 Source 当 manifest 编辑器 |
| 引用选取/primary 移除 | 原通用字段/Source + Project/Package 引用校验 | 引用区按 exact ID，显示本地/依赖 revision；无效/失踪 ID 保留并报错，不选 latest/按名字替代或自动 detach |
| Review Changes | `normalizeCollectionPatch`（原 index）→ `stageProject` → `projectSaveOperation` → `stageOperations` → client `inspectWorkspace` | patch 目标改 exact ID，原 human operation、baseRevision 与 fingerprint diff 保留；Review 不等于 Build/Session 可启动 |
| Cancel / Apply ChangeSet | Cancel 清 pending、只 renderActivity；Apply → executeWorkspace → service queue/base check/snapshot/apply/validate/commit | Cancel 不写/不清草稿；提交禁重复/禁编辑，只有 resultingRevision 认成功；失败保留草稿/错误，service rollback 继续原路径 |
| 409 / Reload Latest | 原 EntryPoints 冲突重载无离开确认/草稿复制，Actors 的恢复只限 Actors（G04） | 复用 getSource 暴露入口/集合草稿（含非法原文）的复制与手动回退；明确丢弃重载，取消保留，无 silent rebase |
| 成功后读取失败 / retry | `refreshRequired` receipt、center inert；Reload 仅 refreshProject | 保留真实成功修订，读重试不得重放 execute；读成功后按 exact ID 恢复/选择有效入口 |
| Inspector / References / Used By | `viewResourceType` 无 entrypoints；普通选入口不能形成对应 graph node；graph 不含入口（G03） | 明示项目/有限引用信息，不伪称入口 graph。已有 World detach 直接扫描消费者的 exact 入口定位保留；不为 UI 添新 registry/repository |
| Validate / Preview / Simulate / Preflight / Build / Git diff | 原 committed 项目/revision + 原服务；Preview 第一入口、scenario exact/default、Build 全部入口 | 原动作可达；标明目标，不将未 Apply 草稿当成果，也不把校验 passed 当所有初始状态/消息已可运行 |
| Experience / UI authoring | 原 Experience 编辑第一入口，UI 从第一入口决定 owner/source；编译各 package/entry Frontend | 保留原入口、原文件/编译能力，展示真实目标；EntryPoint ID 修改与 Frontend/source/事务 ID 不做自动迁移 |
| AI Review / Commit / Takeover | `mountNativeStudioAgent` + ProjectAgent/task/base；beforeCommit 重验人工草稿 | 独立 task authority；不能套人工 Apply、自动接纳提案或覆盖入口草稿 |
| Back/换 view/owner/close | `confirmEditorLeave` + shell `observeAtriaDrafts` / navigation authority | 取消原表面保留，确认允许丢弃；所有新编辑目标继续 guard，无新增跨路由持久化 |

## Authority chain and consumers

人工写入：account-authenticated HTTP → owner/projectId → `createStudioWorkspace(projectId,baseRevision,origin:{kind:'human',id:'atria.studio'})` → `POST projects/:projectId/workspaces/inspect` → pending → `POST .../execute`。StudioService 重验 exact Git revision、workspace/operation origin 和 `project.save` target/source projectId；ProjectStore.save 再规范化、固定 packageId、持久化 `atria.project.json`。原 snapshot/restore 负责 service 批次失败，成功 Git commit/resultingRevision 与 graph invalidation 保持。没有 EntryPoint 专属保存端点，也不直接调用 ProjectStore。

构建：`buildProjectPackage` 读作者源 → compileProjectFrontends → resolveProjectDependencyClosure（入口 World/Binding 必须在真实闭包）→ packageVersion/new hash → `assertAtriaPackageManifest` → validateExperienceResources/container。**Project 接受重复 EntryPoint ID；Package 拒绝**。入口 ID 数组内重复和悬空 Actor/World/Binding 两层都拒绝，但 dependency 声明通过不等于真实 exact revision 存在；不能把 inspect 或源结构 Validate 当成完整 Build。

运行消费者保持：

- `SessionCore._openPackage` 按 exact packageId/packageVersionId/entryPointId 查询；缺失报错，不 latest/fallback。`_create` 生成 Session/Branch/Revision 和初始 Timeline；入口编辑不改变已有历史。
- `initialWorldState`：primary World 条件、baseline 浅 overlay、world-less initialState、显式 World selection 优先；`resolveSessionKnowledge` 结合入口/World 绑定和原 Session 选择。不能把入口编辑当会话知识 upgrade。
- `_newEntry`：初始消息 role/content/actorId/metadata、envelope/projection 仍走原规范；actorId 必须属于 exact Package manifest（此处并非要求属于 entry.actorIds）；`atri_player_identity` 与 `atri_turn_diagnostics` 为受保护 metadata，不能从入口 Source 注入。实际消息 IDs/sequence 由服务生成。
- `compileNativeRuntimeDescriptor`：入口 Actor/World/Binding 资源和 exact World/Knowledge revision，入口 experience/game 覆盖与 Package-level permissions/plugins/skills。`experienceContract` 只属于 Package；Frontend graph/Bridge/authority/lease/nonce 原服务不改。
- `public/scripts/native/session-projection.js` 按入口 actorIds 顺序和 primaryActorId 决定兼容显示角色；主 World 回退规则与主 Actor 不相同，不能共用“默认第一项”实现。
- Preview 不创建正式 Session/Branch；scenario runner 按 explicit entryPointId 或第一入口启动自己的模拟。Studio 当前 chooser 与 Preview/Experience/UI 默认目标之间的差额见 G05。

**共享描述停用**：`public/shared/native-persona-context.js` 在 sharedRuntime 下固定 `shared_scope_unsupported`；`src/native/adapters/generation-host.js` 传原阻断；`public/scripts/native/shared-session-ui.js` 仅席位展示。本 checkpoint 不增加 caller opt-in、owner solo 回退、自动 Actor/席位映射、Persona description 迁入初始消息/runtime/profile 的绕路或共享 global Persona。

## Errors, conflict, leave and known gaps

| 状态 / 缺口 | 基线与替换 gate |
| --- | --- |
| loading / deleted / scope lost / partial support failure | detail 挂载前失败可重试，support allSettled 保留当前 editor；owner/dispose/sequence guards 保持；新目标响应不污染其它项目 |
| dirty / invalid JSON / shape / reference failure | 原 marker + observer 保留草稿；Review 前 canonical key/ID/collection/primary/ref 检查，Source 原文可修正；运行约束不能静默归一化 |
| reviewing / submitting / service failure | 同一 pending/baseRevision，单次 inspect/execute；Cancel 不写；validation/operation rollback 原 service；无 resultingRevision 不报保存成功 |
| stale / conflict | G04：EntryPoints 未继承 Actors 复制与确认重载；下一轮补同样目标级恢复，拒绝 silent rebase |
| committed + refresh failure / late responses | 原 receipt + inert / only-read retry；Preview/Simulation/Build 基准 revision/editorSequence，Inspector sequence 与 dispose 保持 |
| read-only / no matches / missing reference | 没有 EntryPoint archive/history/Library editing 模式；真正禁写取原 busy/refreshRequired/scope；tree 无匹配不等于空集合，missing ref 保留原 ID |
| G01 集合能力 | 非空无集合 Source/新增删除排序入口；原空态“attach Library”不适用于 EntryPoint，Source 文件不能代替 manifest |
| G02 顶层数据损失 | assertEntryPoint 输出 canonical，unknown 顶层在读/写归一化丢弃；下一轮 UI Review 前拒绝，不能恢复读时已经丢失的数据 |
| G03 身份与 graph | Project duplicate IDs、index selection、无 core.entrypoint registry/graph；下一轮 exact ID + duplicate 前置拒绝，Inspector 明示局限，不宣称后端/graph 已全面修复 |
| G04 冲突草稿 | Actors 专用 copy/discard 不覆盖 EntryPoints；下一轮保留原文复制/明确放弃重载 |
| G05 默认入口与运行约束 | Preview/Experience/UI 第一入口与 chooser 不联动；Simulation scenario 单独目标。initialTimeline/overlay 源 JSON 校验较宽，Session 才施加形态约束。替换需明确真实动作目标与分层验证；本轮不改变默认启动或新增运行协议 |

## Existing tests and replacement acceptance

“已有”是入口/证明范围，不代表本轮执行。实际执行只见 Record；未替换展示，不能把下面未来门记作通过。

| ID | 现有入口与范围 | 替换阶段用途 |
| --- | --- | --- |
| T01 | `tests/native/contracts.test.js`：N0 Package 零/多 Actor、悬空 identity、Package schema；EntryPoint 专属全字段未覆盖 | 规范 ID/非空/primary/引用；新增入口具体 fixture |
| T02 | `tests/atria-shell/studio-value-editor.test.js`：unknown nested、invalid JSON/focus、numeric validity、单次 Review；`studio-authoring.test.js`：human origin/base、clone/operation | 原草稿/Source 与 project.save authority 复用；入口任意 JSON 往返需新增 |
| T03 | `tests/native/runtime-descriptor.test.js`：exact PackageVersion/EntryPoint、experienceContract override 拒绝、各 mode/runtime paths | exact runtime identity、有效覆盖与 source/runtime 分层 |
| T04 | `tests/native/project-composition.test.js`：exact World/Knowledge 闭包、缺 revision/循环拒绝、ProjectStore manifest 保护 | exact dependencies/build canonical，与入口 ref 关联 |
| T05 | `tests/native/studio-preview-experience.test.js`：四种 Experience 下统一 descriptor、无 Session authority | preview 分层，不证明 chooser 操作了所选入口 |
| T06 | `tests/atria-shell/studio-workspace-a7.test.js`：human Inspect/Apply、receipt、导航取消、支持来源失败、late Preview、World detach 入口定位；`tests/native/studio-service.test.js`：revision/rollback；`studio-agent-a8.test.js`：独立 Agent | 新入口接线/选择/冲突/恢复/late response；不能拿 Actors 专属测试冒充入口验收 |
| T07 | `tests/native/session-core.contract.test.js`：Checkpoint A exact Package→EntryPoint→Timeline→Revision、empty starts、已有 Session 不升级、Save 恢复；`session-knowledge.test.js`：绑定路径 | initial overlay/timeline 的真实启动与 Session/Save 不推进；本地 FS/SQLite 按目标选，外部 DB 不假通过 |
| T08 | `tests/e2e/native-session/10-studio-redesign.e2e.js`：20 view/Source/conflict/Agent；`28-studio-actors.e2e.js` 仅为已有 Actors 证据 | 新入口 FS/HTTP 的真实字段/状态/Build 和中文窄屏场景，尚待实施 |
| T09 | `tests/native/persona-context.test.js`：accepted lane shared caller opt-in 仍 unsupported、description 不进入 plan | 持续停用，无入口绕路 |

下一轮最小必要验收随实际触及面选取，不为镜像文档编测试：

| Gate | 必须证明的真实输出/状态 |
| --- | --- |
| N01 | 已有单/多入口读写、始终可达集合 Source；增删/排序只改 entryPoints，其它 Actors/worlds/knowledge/resources/dependencies 不变；最后一个删除拒绝；错误空集合可修复 |
| N02 | exact entryPointId 同名切换/排序后身份、改名 ID 保持、显式 ID 变化不自动改引用；重复 ID 当前项目可读但 Review 明示修复；不建立独立 EntryPoint revision |
| N03 | 三类 ID 数组完整/顺序/空值与 null/重复/悬空拒绝、primary 缺失/null/移除/成员条件、World/Binding exact 修订；字段↔Source↔Review↔Cancel 不丢值 |
| N04 | 任意 nested overlay/timeline + 原 metadata/projection/envelope 保留；无 World/单 World/多 World 的 overlay/primary 约束与真实初始消息启动；无保护 metadata 注入；失败草稿可修复 |
| N05 | runtime/experience/game/六类高级 JSON 缺失/null/任意类型与未知 nested 不静默删改；原 contract/Frontend source/compiled graph 边界保持；字段保留不假称未接消费者已生效 |
| N06 | unknown 顶层/retired ui/world/legacy/非法 JSON 就近拒绝并保留原文；明确归一化读路径限制，不自动迁移 |
| N07 | 原 human inspect/execute/revision/origin、取消/失败/409/rollback/receipt only-read、提交禁写；Agent 独立；入口↔集合/view/owner/Back 离开取消保留；冲突复制原文/明确放弃重载 |
| N08 | 真实项目→新表面→FS/HTTP canonical→.atria Build；显示 Preview/Experience/UI 第一入口与 scenario exact/default 的实际目标，排序影响可评估；已安装 exact Session/Save 不推进；Shared 描述仍 unsupported；English/中文、320 最大字号/Tab/focus 选择最小本地场景，不冒充真机 |

本轮停在 replacement gate 前。下一独立 checkpoint 只实施 B1 EntryPoints 展示与映射对应的局部防护，复用原 controller/persistence；实现/最小本地验证/commit/push 后更新同一 Record/live HANDOFF 并停止。不自动进入 Worlds/Knowledge/B2/F、不合并 main。

## Display checkpoint result

2026-10-05：本映射的下一展示 checkpoint 已完成，具体实施/命令/失败修正/输出证据见 [Record B1 EntryPoints display](../../../records/refactor/atria-immersive-workspace.md#stage-b1-entrypoints--display-checkpoint)。专属 renderer 复用原 value editor 草稿与项目 Workspace/ChangeSet；G01/G04 关闭，G02/G03 的 Review 前局部防护和 G05 目标/分层提示完成。没有新增入口 registry、repository 或独立 revision；后端归一化读损失、Project duplicate 与有限 graph 保持。N01–N08 已有本轮针对性本地证据，未测矩阵不因此关闭。Shared 描述仍停用，后续先做 Worlds 映射，不自动进入替换。
