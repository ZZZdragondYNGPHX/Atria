# B1 Worlds — field, action and authority mapping

## Scope and evidence

本模块是 [delivery replacement gate](delivery.md#editor-replacement-gate-for-b-stages) 所需的 Worlds 映射，覆盖 [coverage S12/S07](coverage.md)、[baseline S12/S07](baseline-inventory.md)、[states](states.md) 与 [validation V12/V07](validation.md)。基于产品 `refactor/atria-immersive-workspace@f40bca67b56eb42c0b4340d8ca9dfc44f848101a` 的真实源码。**本 checkpoint 只完成映射，未修改产品、未替换展示**；实际验证见 [Record B1 Worlds mapping](../../../records/refactor/atria-immersive-workspace.md#stage-b1-worlds--mapping-checkpoint)。Actors/EntryPoints 不重做，Knowledge/B2/F 不进入；Shared Persona description 仍 `shared_scope_unsupported`。

World 已有 `core.world` descriptor、`WorldRepo` 和资源 graph。不能照抄 Actor/EntryPoint 的“无独立资源”结论，也不能把 descriptor 的 `native-library` authority 套到所有 World：项目内 `source.worlds[]` graph 节点的 authority 是 `project-source`、`immutable:false`，由项目 Git revision 管理；Library World root 可变、WorldRevision 不可变；已安装 Package World 是 exact snapshot 只读来源。Session 的当前 World state 是另一运行时 authority，不是作者 baseline 草稿。

源码定位均相对产品 workspace：

| 证据 | 入口 |
| --- | --- |
| Studio 集合、选择、树、引用页签、冲突 | `public/scripts/native/studio-workspace.js`：`renderCollectionEditor`、`normalizeCollectionPatch`、`createResourceTree`、`renderLibraryRelations`、`stageProject`、`stageOperations`、`applyPending`、`renderActivity` |
| 原 Fields/Source 与依赖加载 | `public/scripts/native/world-editor.js`：`mountWorldEditor`、`properties`、`dependencies`、`validate`、`load`；`library-ui.js`：`action`、`feedback`、`worldParameterSummary` |
| Library / 已安装原版 / 历史 | `public/scripts/native/{library-workspaces,library-revision-editor,library-revision-history,package-library-resources,resource-bundle-controls,reference-remediation}.js` |
| 客户端与 HTTP | `public/scripts/native/{studio-client,product-client,studio-authoring}.js`；`src/endpoints/{native-studio,native-product}.js` |
| 字段 / 项目 / Package authority | `src/native/world-knowledge.js`：`assertWorld`、`assertWorldRevision`、`assertPackagedWorldSnapshot`；`src/native/{identity,project-source,contracts,project-store}.js` |
| Library / 资源图 / 提案 | `src/native/repositories/world-repo.js`；`src/native/product-service.js`；`src/native/authoring/{resource-registry,resource-graph,library-authoring,library-service,studio-service}.js` |
| 构建闭包 / 启动消费者 | `src/native/{dependency-closure,package-composition,session-core,session-knowledge,studio-preview,studio-scenario}.js` |

## Field and canonical output mapping

下一轮先替换 Studio Worlds 展示与其局部防护，复用原 World editor 的一个目标草稿和原 `project.save`；若需要调整共用 `mountWorldEditor`，必须同时验证 Library 裸 revision-content 模式。S07 原列表/详情/历史/导入/只读规则保持，不据本映射自动整页重构 Library 或 Knowledge。

| 旧字段 / 形态 | 当前编辑与 canonical 校验、输出 | 替换位置与保留要求 | 测试门 |
| --- | --- | --- | --- |
| `source.worlds[]` | 可为空；每项为 `{world,revision}`；非空只能选单快照，无集合 Source；空集合使用通用 value editor（G01） | chooser + 始终可达集合 Source；保留顺序、零/单/多 World；增加/删除/排序仍审阅完整项目，不自动改 EntryPoints | T01/T03、probe；N01 |
| snapshot envelope | 只允许 `world`、`revision`；revision.worldId 必须等于 world.worldId；currentRevisionId 必须等于 worldRevisionId | 身份/快照区 + 全 snapshot Source；裸 revision content 与 snapshot 不混用；不自动纠正不匹配 identity | T04、probe；N02 |
| `world.worldId` / `revision.worldId` | `world_` + 32 位小写 hex；Fields 不编辑，单 snapshot Source 可改；项目集合当前接受重复 ID（G03） | exact World 身份；改名不改 ID；高级显式 ID 修改必须同步两处才能符合原契约，不能自动改入口/依赖/Session；唯一匹配才 patch | T04、probe；N02 |
| `world.displayName` | 非空 string、≤256；契约不 trim，可重名；Studio 当前仅 Source；Library 独立 Rename trim 后走原 updateWorld/CAS | 常用名称输入；按 ID 匹配，不按名称合并；不把 Library rename 请求用来保存项目内 World | T04、probe；N02 |
| `world.currentRevisionId` / `revision.worldRevisionId` | `worldv_` + 32 位小写 hex；独立 World root 可 null，packaged snapshot 必须 exact pin；项目修改 baseline 不自动产生新 WorldRevision ID | 显示 snapshot pin 与项目基准 revision，区分内容修改与 Library 发布；Source 保留显式 ID 能力，不为 UI 修改伪造 Library 修订 | T02/T04、probe；N02 |
| `world.createdAt` / `world.updatedAt` / `revision.createdAt` | 可省略；null/undefined 被省略；其余须非负安全整数 epoch ms；Studio Source 可改，Library create/commit/rename 使用服务时间 | 高级 snapshot Source 保留原值与规范化语义；不把时间戳当 CAS token | probe；N02/N03 |
| `revision.schema` | 可省略；如提供必须 plain JSON object；内部任意 nested object/array/string/number/boolean/null；Fields 为递归类型/值控件 | schema 专属结构区与 Source；完整保留键和数组顺序，不将 `{type:'number'}` 等例子收窄成新 schema enum；字段编辑成功不等于 runtime schema 执行验收 | T01/T04、probe；N03 |
| `revision.baseline` | 同 schema 的 object/JSON 规则；是定义基线，不是当前 Session state；原 Fields 可递归增删/换类型 | baseline 专属结构区；缺失不自动补 `{}`，null/primitive/array 根拒绝并保留 Source；修改不推进旧 Session | T01/T04、probe；N03/N08 |
| schema/baseline 子字段 | 类型为 string/number/boolean/null/object/array；Add/Remove field、数组追加/移除；新字段禁空名/重复/`__proto__`/`constructor`/`prototype`；空 number 暂为 NaN，Review 拒绝非有限数 | 复用递归编辑能力；破坏性换类型/删除只改当前草稿，Review 前可取消；不静默丢弃未展示的深层字段 | T01；N03 |
| `revision.knowledgeBindingIds` | 缺失→`[]`；null/重复/非 Native ID 拒绝；Project 必须在本地 knowledgeBindings 或 dependencies.knowledgeBindings；Package 必须打包对应 binding | exact binding 多选/移除失效引用 + 数组 Source；顺序保留；保存 binding ID，不改成 knowledgeBaseId；不自动取最新 Knowledge | T01/T04、probe；N04 |
| binding 来源显示 | 本地 binding 显示 source.knowledgeRevisionId；外部 binding 是现有可变 binding，由 ID 加载，Knowledge source 本身固定 exact revision；graph 可用 binding hash，dependencies.knowledgeBindings 仅声明 ID | 区分声明 ID、当前 binding 与其 exact Knowledge source；不能把 WorldRevision 的 binding IDs 声称为独立 immutable binding 修订 pin，也不能建立新 binding 保存 authority | T01/T02、源码；N04/N07 |
| `revision.assetIds` | 缺失→`[]`；null/重复/坏 ID 拒绝；Project 需 assetFiles 或 exact dependencies.assets 声明，Package 需对应打包 Asset | 多选/失效引用 + 数组 Source；Library 依赖保留 contentHash；本地 file 显示路径，不能伪称已有 Library immutable hash | T01/T04、probe；N04 |
| `revision.metadata` | 缺失→`{}`；如有必须 plain JSON object，内部 arbitrary JSON；Fields 当前不显示，Source 保留；fork 写 `atriaLibraryOrigin` | 高级 metadata 区 + Source，保留 nested unknown/来源 provenance；不得因为未展示而删除，也不把 provenance 当 live Library pin | T04、probe、源码；N03 |
| unknown/legacy 顶层 | World、WorldRevision、snapshot 都严格 assertOnlyKeys；legacy uid/worldInfoUid/worldBookName/bookName/filename/fileName/path/charaFilename/selected_world_info 拒绝 | Review 就近显示错误并保留原文；不复制 Actor/EntryPoint 的顶层静默归一化结论，不自动迁移旧 WorldInfo | T04、probe；N05 |
| `dependencies.worlds` | exact `{worldId,worldRevisionId}`；同 dependency 集合 ID 唯一；不是 `source.worlds` 的可编辑副本 | Library references 页签保持 Attach/Update/Fork/Detach/Used By；编辑 Source 不将 dependency 改成最新，不将外部 World 偷移入项目 snapshot | T02/T03、probe；N07 |

Canonical snapshot 是 `{world:{worldId,displayName,currentRevisionId,createdAt?,updatedAt?},revision:{worldRevisionId,worldId,schema?,baseline?,knowledgeBindingIds,assetIds,metadata,createdAt?}}`。只有 schema/baseline/metadata 内部支持任意 JSON；其根 object 与 identity/envelope 的严格规则分别验收。Library revision-content 请求只允许 `{schema?,baseline?,knowledgeBindingIds?,assetIds?,metadata?}`，不允许 caller 提供 World ID、修订 ID 或时间。

## Modes, conditions and draft/revision mapping

World 没有独立 mode discriminator；schema/baseline 中自定义 `mode` 是作者 JSON，不是平台模式。Field/Source 是同一目标草稿的展示模式，Editor/Library references 是保留 DOM 的页签，不是两个写入 authority。

| 实际模式 / 条件 | 草稿、基准与输出 authority | 保留动作和限制 |
| --- | --- | --- |
| Studio 项目内 World | `mountWorldEditor` clone snapshot；当前 chooser/tree/patch 按 index；基准为 exact project Git revision；`project.save` → human Workspace inspect → Apply | 只替换目标 snapshot，保留 package/EntryPoints/其它 Worlds/知识/文件；下一轮改 exact ID 与歧义拒绝；不能调 commitWorldRevision 保存项目源 |
| Studio 空 Worlds 集合 | 通用 value editor 的 `[]` 草稿；Review 克隆项目替换 worlds | 空集合合法，但已有入口 worldIds 悬空会被项目校验拒绝；不能用自动清空入口掩盖删除影响 |
| Studio Library reference | 原 library relations、prepareOperation、resource.attach/update/fork；World exact revision 与 project baseRevision 分别检查 | Attach 固定 World revision，Update 显式 from/to；Project Fork 生成独立 World/WorldRevision IDs 与 provenance，保留绑定 ID/资产声明；不宣称所有依赖已深拷贝 |
| Library World / 首个或后续 revision | 原 root/current head；revision editor clone 裸 content，baseRevisionId 在打开时固定；commitWorldRevision → WorldRepo.commitRevision | 服务分配 worldRevisionId/createdAt，锁/CAS 检查、验证绑定与资产存在、putImmutable 后移动 root head；旧 exact refs/Project/Session 不自动推进 |
| Library earlier revision | 原 history inspect/diff/export/delete-unused/promote/fork | promote 仅 CAS 移动 Library head；历史 Fork 保留共享 binding IDs；区别于资源包 preflight/import 的独立闭包副本；被引用/当前 revision 删除阻断由原服务负责 |
| Installed Package World original | 原 getPackageLibraryResource exact snapshot，read-only summary | Open Work/来源/exact revision/导出/Used By/生成副本/Fork 保持；不增加直接 Edit World，不套用可编辑 installed Knowledge 路径 |
| Session World / 启动选择 | `atri_world_selection` 与 `atri_world_state` 属原 Session authority；initial baseline clone、primary 上浅 overlay；保存/恢复固定 closure | World-less/单/多 World 原规则保留；作者 baseline/schema/Library head 编辑不修改运行进度；本轮不改资源选择、world reducer 或 Persona/Shared authority |

Fields 当前只编辑 baseline/schema/两类依赖；身份、名称、时间和 metadata 依赖 Source。Source toggle 在返回 Fields 时 JSON.parse + UI validate，Review 也校验同一目标；`getDraft()` 只返回解析草稿，**不返回未解析 Source 原文**。下一轮可给原句柄增加只读 getSource，与复制/恢复共用，不另建跨路由持久化草稿系统。

## Action, error, conflict and leave mapping

| 原动作 / 状态 | 原 handler / authority 与当前证据 | 下一轮去向 / 替换门 |
| --- | --- | --- |
| 加载依赖 / Try again | `world-editor.load` 从传入 library 或 listLibraryResources 加载；外部 binding Promise.all 请求；失败显示 alert/retry、Source disabled；无逐来源结果或 dispose guard（G05） | 保留草稿/身份范围；本地可编辑内容和完整 Source 不应被无关 catalog 失败锁死；缺失/失败分开，拒绝迟到数据污染已离开目标（N06） |
| Source/Fields / 非法 JSON | library-ui.action 捕获错误并聚焦 alert；非法文本保持；校验当前缺口见 G02 | 单 snapshot/集合 Source 均可达；返回 Fields/Review 错误不删原文，schema/root/identity/unknown 仍用原契约（N03/N05） |
| Review Changes | 原 editor onReview → stageProject → projectSaveOperation → createStudioWorkspace，origin human，project Git baseRevision；检查期间 inert | 提交真实 diff 与目标；不绕 inspect、不创建 World 私有 writer（N02/N06） |
| Cancel / Apply ChangeSet | Studio Cancel 只清 pending；Apply 原 executeWorkspace，验证失败/rollback 不算成功；保存后 refreshRequired receipt，不重放 | 草稿保留与目标防护；Review/Apply/提交时禁写；只读重试刷新（T03、N06） |
| 冲突 409 / Reload Latest | 原 Activity 有冲突提示；草稿复制与丢弃确认仅 Actors/EntryPoints；World 未保存 editor handle，冲突 Reload 直接 refresh（G04） | 原文复制（含非法 JSON）、手动选择回退、明确丢弃确认；取消保持原表面/基准，不自动 rebase（N06） |
| chooser/tree/view/owner/Back | Studio confirmEditorLeave 与 workspace-leave-guard 观察 World 模型 dirty；Library Back to resource 同 guard | 同名/exact ID 与排序仍定位原 World；取消保持字段/Source，确认离开丢弃；不引入第二草稿 persistence（T03、N02/N06） |
| Editor / Library references | renderEditor 建同一 body/relations 并 hidden 切换；原 attached revision selector/prepare | 保留同一草稿；选择缺失 exact revision 时拒绝 prepare，不用 latest；当前辅助库存失败不重建已有项目编辑器（T02/T03、N07） |
| Review detach / Used By | graph reverse refs + 临时 exact EntryPoint 定位；原 detach 克隆项目删 dependency，再 project.save；Project graph 有 World/binding/asset，但无 EntryPoint node | 保留消费者定位与服务最终校验，明示 graph 边界；不能声称 Used By 已完整覆盖入口，不生成新 registry（T03、N07） |
| Library Review/Back/Save/error | mountLibraryRevisionEditor 保留原 clone，Review 只显示待提交 content；Back 回编辑；commit 失败保留；成功 dispatch committed、移除写按钮、刷新失败只重试 onSaved | 共用 editor 改动必须验证裸 content/CAS/失败/回执；Library 409 当前无专用合并/复制/重载流程，不借此本轮重建 Library 生命周期（T01/T05、N06） |
| Validate/Preview/Simulation/Build | 原服务读取 committed 项目、闭包与 Source files；不会自动消费所选 World 未审草稿；Preview/Simulation 的入口目标沿用 EntryPoints 已实现提示 | 成功编辑/inspect 不冒充可运行/构建；错误保留原 diagnostics/修复路径（N08） |

## Known gaps and disposition

| ID | 真实现状 / 风险 | 后续处置 |
| --- | --- | --- |
| G01 | 非空 Worlds 无集合 Source/专属增删排序；名称/identity/metadata 无 Fields | 下一展示 checkpoint 补可达位置、集合 Source 与 exact 目标；高级字段保留，不新增 Library writer |
| G02 | Fields render 用 `||=` 补 schema/baseline/引用数组，load 后重置 initialDraft；进入 Fields 可把合法省略字段补成空对象。UI validate 以 `?? {}` 接受 null schema/baseline，Fields 再覆盖成 `{}`，而 canonical 拒绝 null；metadata/identity/unknown 当前靠后端验证 | 将展示默认与真实值分开；原结构/Source 共用草稿，缺失保留，非法根值拒绝并保留原文；不让无操作打开变成隐式修复 |
| G03 | Project 校验接受 duplicate local Worlds 和 local/dependency 同 worldId；closure 同 ID 不同 revision 拒绝，同 revision 经 Map 合并可覆盖内容；Package 直接 duplicate 拒绝。当前 chooser/tree/patch 按 index | UI Review 前拒绝 duplicate/本地与外部歧义并给集合 Source 显式修复；exact ID patch，保留原 backend/closure 最终 authority；不声称直接 API/Agent 已全面修复 |
| G04 | Worlds 409 无草稿原文复制，Reload Latest 没有 Actors/EntryPoints 的明确丢弃确认；getDraft 不包含非法 Source | 原 editor 句柄只读 getSource + 原 guard；保留无自动 rebase 与 receipt，只完成 Worlds 局部恢复 |
| G05 | 全 catalog 加载失败锁住 Fields/Source；外部绑定读取一个失败使整个 Promise.all 失败；本地 binding/assetFile 拼接也在 await 之后；无 dispose/目标检查，当前 selected refs 依赖 catalog 完整结果 | 先保留本地和 Source 编辑，区分 unresolved/failed/missing，按原 scope 检查迟到结果；声明与实际解析分层，不把失败误判为可自动移除的 missing |
| G06 | WorldRevision 的 binding IDs 不是 immutable binding pin；Project graph 不含 EntryPoint node；三种 Fork（Project、历史、资源包）依赖复制范围不同 | 展示真实 exact 来源/闭包和有限 graph，保留原 Fork/Attach/Update 语义；不为统一 UI 建新 revision/全图 authority |

G01–G06 是本轮发现和确认的现状，**尚未修复**。未知 World 顶层是严格拒绝，不是 EntryPoints 的归一化读损失；初始默认渲染的改写与已有项目非法重复集合也不能称为“无损通过”。

## Existing tests and future replacement gates

以下 T 是可用入口，本轮实际命令/范围只见 Record；N 是下一展示 checkpoint 的验收要求，不因本映射完成而记作通过。

| ID | 现有入口 / 覆盖边界 |
| --- | --- |
| T01 | `tests/atria-shell/world-editor.test.js`：递归 schema/baseline、exact project refs、missing/非法 Source、catalog retry、asset identity；UI fixture 部分使用短 mock ID，不代替 canonical schema |
| T02 | `tests/native/library-authoring.test.js` 的 World Attach/explicit Update；`tests/native/library-build-closure.test.js`；`tests/atria-shell/library-revision-history.test.js` World diff；World Project fork 的代码已核对，本轮没有冒称专属深复制测试 |
| T03 | `tests/atria-shell/studio-workspace-a7.test.js`：detach consumer 定位、内部取消/引用页签共草稿、human receipt；`studio-authoring.test.js`、`workspace-leave-guard.test.js`；本轮只执行前三个有关 Workspace 场景 |
| T04 | `tests/native/world-knowledge.test.js`：World/Revision/Package identity、legacy/闭包；临时 canonical probe 补 strict keys/缺失/null/嵌套保留/snapshot pin/Project duplicate 与 overlap 现状 |
| T05 | `tests/native/library-revisions.test.js`：FS/SQLite 不可变修订、事务内基准/并发冲突、服务分配 ID 与坏请求；`tests/atria-shell/{package-library-resources,resource-bundle-controls,reference-remediation}.test.js` 供影响面后续选择 |
| T06 | `tests/native/{entrypoints-start,save-system,resource-setup}.test.js` 与既有真实 FS/HTTP Studio E2E 供后续 canonical/Session/Save 选择；Shared 停用由 `tests/native/persona-context.test.js` 的 accepted lane 用例局部确认 |

| 门 | 必须证明的替换行为 |
| --- | --- |
| N01 | 空/非空集合 Source、零/单/多 World、新增删除排序；被入口引用删除拒绝并定位；只改 worlds，邻接源不变 |
| N02 | 同名不同 ID/exact 选择、排序/显式 ID 恢复、唯一 patch、snapshot 双 identity/pin 不匹配和 duplicate/local-dependency 歧义拒绝；项目 revision 与 snapshot revision 区分 |
| N03 | schema/baseline/metadata 全 nested JSON、缺失/空对象/非法 null/primitive/array 根、类型/数组/深层增删、来源 metadata；Fields↔Source 与无操作打开不隐式改写，canonical clone 往返 |
| N04 | 两类 refs 缺失/空/顺序/重复/坏 ID/失效/加载失败；本地 binding、Library binding exact Knowledge source、本地文件、exact Library asset hash 分开；未解析不能静默移除/改 latest |
| N05 | malformed Source/unknown/legacy/非有限数/字段长度/timestamps/root schema 原校验；错误就近与原文保留，不能自动迁移或静默归一化 |
| N06 | Review/Cancel/Apply/inspect失败/409原文复制/取消及明确丢弃Reload、禁写/焦点/离开/Back/owner/late catalog、保存成功读取失败只读重试；共用 editor 的 Library 裸 content/CAS/receipt 回归 |
| N07 | 原 Attach/Fork/Update/Detach/Used By 的 exact authority/缺版本/闭包/来源不变；只读 installed World 无 Edit；history Fork 与 bundle Fork 差异明确，有限 graph 不冒充完整图 |
| N08 | 真实项目文件/HTTP/.atria canonical World 往返；旧 installed Session/Save 不推进、baseline 与当前 state 分离；原 committed Preview/Simulation/Build 与 world-less/单/多 World；English/简体中文、窄屏/键盘/大字按触及面最小本地验收 |

下一轮恢复顺序：live HANDOFF → index → 本模块 → 对应 delivery/coverage S12/S07/states/validation → 同一 Record B1 Worlds mapping。只实施 Worlds 展示与局部防护；完成其独立 checkpoint 再停止，不自动进入 Knowledge/B2/F，不合并 main、不恢复共享描述。
