# B1 Actors — field, action and authority mapping

## Scope and evidence

本模块是 [delivery 的 B 阶段 replacement gate](delivery.md#editor-replacement-gate-for-b-stages) 所需的 Actors 范围映射。基于产品 `refactor/atria-immersive-workspace@784bb91a83e205669f14445fa1ef49ed248b9799` 的真实源码；本映射保存替换前基线。对应 coverage S12/V12；S07/V07 只提供 World/Knowledge 的对照边界，不能套用到 Actor。

Actors 是 `source.package.actors[]`、`core.actor`、`project-source` authority。原生注册描述只声明 project ownership；没有 Actor Library revision、Attach/Fork/Update、Persona CRUD 或独立 Actor persistence。编辑基准是项目 Git revision，而不是 Actor revision 或数组下标。下标只是基线列表选择；新 Actors 展示以 exact actorId 绑定草稿与选择。

源码定位均相对产品 workspace：

| 证据 | 当前入口 |
| --- | --- |
| 展示/选择/审阅/状态 | `public/scripts/native/studio-workspace.js` 的 `sourceSection`、`normalizeCollectionPatch`、`renderCollectionEditor`、`stageProject`、`stageOperations`、`applyPending`、`renderInspector`、`renderActivity` |
| 通用字段与 Source 草稿 | `public/scripts/native/studio-value-editor.js` 的 `mountStudioValueEditor` |
| 人工 operation/workspace | `public/scripts/native/studio-authoring.js` 的 `projectSaveOperation`、`createStudioWorkspace`、`patchProjectSource` |
| HTTP/service/存储 | `public/scripts/native/studio-client.js`；`src/endpoints/native-studio.js`；`src/native/authoring/studio-service.js`；`src/native/project-store.js` |
| 规范字段/ID/归一化 | `src/native/contracts.js` 的 `assertActor`、`assertEntryPoint`、`assertAtriaPackageManifest`；`src/native/identity.js`；`src/native/project-source.js` 的 `assertPackageSource` |
| 资源投影/构建/运行消费者 | `src/native/authoring/{resource-registry,resource-graph}.js`；`src/native/package-composition.js`；`public/scripts/native/session-projection.js`；`src/native/session-core.js` |

## Field and output mapping

下表保留旧字段与已冻结的替换要求。已用 `studio-actors-editor.js` 的专属 Fields renderer 嵌入原 `mountStudioValueEditor`，维持一个 Actor 草稿；`patchStudioActors` 按 exact actorId 克隆全项目并只替换目标，集合编辑只替换 `package.actors`，再由原 `stageProject` 发出 `project.save`，绝不直接写 ProjectStore。Actor Fields/Source 往返同一草稿；Actor 与集合是不同编辑目标，切换走原离开确认。

| 旧字段/形态 || 替换位置与保留要求 | 测试映射 |
| --- | --- | --- | --- |
| `package.actors` | 必须数组，允许空/单/多 Actor；非空时 chooser 选单个，空时编辑集合 JSON | 角色选择 + 常用字段；高级集合 Source 在空和非空均可达，保持数组顺序，不把 index 当 ID | T01、T02；新增 N01 |
| `actorId` | 通用文本可改；必须 `actor_` + 32 位小写 hex Native ID；改名不生成新 ID | 身份信息显示 exact ID；高级字段/Source 保留显式修改路径，不自动改写消费者引用 | T01；新增 N02 |
| `displayName` | string，长度 1–256；原 `text` 不 trim，不把空白自动转空；可重名 | 名称输入；编辑只改 presentation，不因名字匹配/合并 Actor | T01；新增 N02 |
| `role` | 可选非空 string ≤128；undefined/null canonical 省略；没有 enum | 可选角色文本与移除路径，不能发明 narrator/player/NPC 模式或填入默认角色 | 新增 N02 |
| `profile` | 缺失归一化 `{}`；必须普通 object；递归 JSON 保留所有 key/array/null/bool/finite number | Profile 任意结构字段 + Source；常用文本区编辑时只 patch 自己的键，不重建整个 profile | T02；新增 N03 |
| `profile.description`、`personality`、`scenario` | 非专用 schema，只是任意 JSON key；Session projection 读取并 `?? ''` 回退 | 常用多行文本仅在缺失/string 形态提供便捷编辑；已存在非 string 走高级结构/Source，不强制 stringify、填空或抹掉原值 | 新增 N03、N07 |
| `profile.examples`、`profile.mes_example` | projection `examples ?? mes_example ?? ''`；两键可共存 | 示例区说明实际优先级，分别保留两键，不迁移/合并 alias，不隐式删除次级键 | 新增 N03、N07 |
| `profile.systemPrompt`、`postHistoryInstructions` | projection 读取到兼容显示数据；没有 Actor 专用枚举/长度/注入契约 | 高级提示词区 + 原 Source；不能据此声称模型必然消费，不能连到玩家 Persona lane | 新增 N03、N07 |
| `profile.*` 其它键/嵌套对象/数组 | 通用 Fields 递归已有成员；null 字段只读；成员增删、类型变化、数组增删/排序通过 Source | 任意结构区复用原能力，提供同一草稿 Source；| T02；新增 N03 |
| `metadata` / `metadata.*` | 缺失归一化 `{}`；普通 object，递归 JSON 全保留 | 高级 metadata 字段/Source；保留 unknown/plugin JSON，不赋予 Persona 管理备注或资产权限语义 | T02；新增 N03 |
| Actor 顶层其它 key | **现有缺口 G02**：`assertActor` 不 `assertOnlyKeys`，返回时只留五个规范字段；未知顶层会被丢弃；ProjectStore.get 也先归一化 | 新表面不得声称无损支持这些键。Review 前明确拒绝并列出 key；如提供修复必须显式选择，不能自动搬入 profile/metadata。已在读路径丢掉的原 manifest 数据不能凭 UI 恢复 | 边界 probe；新增 N04 |
| legacy identity 顶层 key | `noLegacyIdentity` 拒绝 `characterId/charId/charDir/char_dir/avatar_url/avatarFilename/characterName/chatFile/chatName/messageIndex/swipeIndex/swipe_id` | 就近显示原错误并保留 Source；不自动迁移/生成 Actor ID；不新增 avatar authority | T01（package 顶层 legacy）；新增 N04（Actor 自身） |

Canonical 输出是 `{actorId,displayName,role?,profile,metadata}`。缺省 `{}` 与 role 省略是原规范化，不应误记为未知字段无损。

## All modes and conditions

Actor 没有独立 mode discriminator。真正的条件是集合空/非空、当前所选 Actor、Fields/Source、任意数据类型、pending human review、Agent task review、project revision 与 host presentation：

| 条件 | 当前行为及下一轮要求 |
| --- | --- |
| 空集合 | 合法零 Actor 项目；当前 mountStudioValueEditor([]) 可切 Source 输入整个数组。保留空态及返回；不能用不支持的 Actor Library Attach 作 CTA |
| 单/多 Actor | chooser/resource tree 根据 displayName/actorId 展示；选择经过 `confirmEditorLeave`。同名身份独立；当前 selection 是 index，下一轮不得把旧草稿套给排序后的另一个 Actor |
| Fields | 递归已有成员；string 单行或多行、boolean checkbox、number 有限数、null 只读；空 object/array 提示 Source 添加。无“字段新增/删除”原按钮 |
| Source | 所选 Actor JSON；空集合为集合 JSON。非法 JSON 保留原文，Fields 切换失败不丢源码；共同草稿，不建立第二套保存 authority |
| 原全站 Source view | **G01**：只列项目文件，`ProjectStore.listFiles` 排除 `atria.project.json`，`writeFile` 禁止写 manifest。它不是完整项目 manifest/Actors 集合编辑的替代入口 |
| compact/medium/wide | 沿用原 Environment/Studio mobile Project/Editor/Preview/AI/More 与 Inspector；仅替换 Actors body，不重写 shell/navigation |
| human vs Agent | 人工 pending 与 task review 分开；不让 Actors Review 越过 task authority|
| Session/Native/Hybrid/Full/Shared | 编辑只改作者项目；构建新 packageVersion 后消费者按 exact manifest/EntryPoint/Session 读取。已安装版本、已有 Session/Save 不自动推进；不从 shared seat/default Persona 反向映射角色 |

## Action mapping

| 原动作/能力 | 原 handler / authority / 输出 | 替换后去向与边界 |
| --- | --- | --- |
| 打开 Actors、过滤树、选择 Actor | `createResourceTree` → `resourceTreeSelect`；chooser → `confirmEditorLeave` / `renderEditor` | 仍 `actors` view、原导航/过滤、所选 exact actorId；切换取消保留原表面 |
| 编辑任意已有字段 | `mountStudioValueEditor` 本地 clone，committed `state.source` 不变 | 常用区和任意结构区共用草稿；修改不直接持久化 |
| Fields ↔ Source || 高级 Actor Source 始终可达，保留非法源码及 focus |
| Actor 内成员增删/数组排序/类型更改 | 原 Source 改完整 actor JSON | 任意结构 Source 完整保留，不拿固定代表字段替代 |
| 整个 Actor 新增/删除/排序 | 空集合可用集合 Source；**非空无集合 Source，也无专用 CRUD 按钮 G01** | 补始终可达的集合 Source，仍 `project.save`；专用 CRUD 按钮不是本轮事实，不把 descriptor capabilities 当已完成 UI |
| 改 Actor ID / 删除被引用 Actor || 显示引用影响并拒绝悬空；不自动替换/清理引用，不依 Used By 的有限 graph 推断安全 |
| Review Changes | `onReview` → `normalizeCollectionPatch` → `stageProject` → `projectSaveOperation` → `stageOperations` → client `inspectWorkspace` | 复用同一路径，展示目标、baseRevision、operations/指纹 changes；|
| Cancel | `state.pending=null; renderActivity()` | 取消 human pending，不写入，不重绘/清空 Actors 字段草稿 |
| Apply ChangeSet || 成功只认 resultingRevision；失败/rollback 保留草稿/pending；不直接调用 Actor repo |
| 冲突 Reload Latest | 原 refreshProject → 清 pending/renderEditor | 显式加载最新，不 silent rebase；当前冲突 reload 会丢旧表面且无导出按钮，下一轮先允许复制/保留 Actor/集合 Source，再明确放弃重载（G04） |
| 保存成功、读取失败 → Reload Latest | `refreshRequired` 保存 receipt，center inert，仅重新读取 | 不重放 execute；成功回执清 dirty；显示 actual revision/receipt |
| Inspector / References / Used By / 定位 | graph 查询，`resourceReferenceForNode`，`openNode` 回原 owner/view | 保留 core.actor identity 和 query；Actor graph 当前仅 project contains 边（G03），不是 EntryPoint/信息/声音等全部消费者闭包 |
| Agent Review / Commit / Takeover | `mountNativeStudioAgent` 与 ProjectAgent service | 原 task/base/origin 边界保持，不能套用人工 Apply |
| Back、换 view/owner、关 workspace | `confirmEditorLeave` / shell `observeAtriaDrafts` / navigation authority |取消保持 DOM，确认丢弃。不新增跨刷新草稿库|

## Authority chain and consumers

人工路径：account-authenticated HTTP → projectId/owner → `createStudioWorkspace(projectId,baseRevision,origin:{kind:'human',id:'atria.studio'})` → `POST projects/:projectId/workspaces/inspect` → pending → `POST .../execute`。`project.save` target/source projectId 必须匹配。ProjectStore 规范化与持久化 manifest、保护 packageId；inspect 返回规范化前后指纹，不代表字段级 canonical diff 已完备。

不另存 Actor revision。Package 契约拒绝重复 Actor IDs；下一轮编辑器应在 Review 前显示 duplicate IDs 和显式修复方向，后端 authority 不可用 UI 替代。

与 Actors 相关但不在本轮重构的消费者：

- EntryPoint `actorIds` 及 `primaryActorId`（必须属于 actorIds）；ID 删除/变化应保留引用错误，下一 EntryPoints checkpoint 才改其展示。
- `public/scripts/native/session-projection.js`：按 EntryPoint primaryActorId 或第一 Actor 读取 exact Session manifest；profile 六个常用键与 mes_example alias 投影到兼容显示数据，`first_mes:''`/`alternate_greetings:[]` 不是 Actor 源字段。消息显示名可来自 variant metadata；编辑名称不改 Native identity。
- `src/native/session-core.js`：timeline actor 必须属于 exact PackageVersion；历史/Save/session snapshot 继续用旧 manifest，不自动采用编辑结果。
- `public/shared/native-information-contract.js` / `native-information-runtime.js`：信息视角 Actor、共享席位及投影授权仍由 experience contract；不能把角色删改的影响全部当作 EntryPoint 引用。
- Native Context/Prompt 使用既有消费者、预算和 evidence；profile 显示投影不等于新增 Prompt injection。Persona 是独立 player identity authority。

**共享描述停用**：`public/shared/native-persona-context.js` 在 sharedRuntime 下强制 `shared_scope_unsupported`；`src/native/adapters/generation-host.js` 继续传相同阻断；`public/scripts/native/shared-session-ui.js` 明示仅席位显示。Actors 表面不能新增 caller opt-in、owner solo 回退、把 Persona description 搬进 profile 绕过禁用或自动映射席位 Actor。现有作者 Actor 内容不因此被重写。

## Error, conflict and leave mapping

| 状态 | 原路径/实际限制 ||
| --- | --- | --- |
| loading / load error / scope lost | 项目 detail 失败阻止挂载并可重试；support Promise.allSettled 来源失败保留 editor，重试不重建草稿 |失败不写入其它项目|
| empty / no matches | 零 Actor 是合法项目；tree 搜索无匹配独立 | CTA 指向集合 Source；禁止假 Actor Library CTA |
| dirty / invalid input | local draft marker + 原 observer；数字空白/无效 JSON 阻止 review | profile/metadata 任意结构、非 string 常用字段和 Source 往返保留 |
| reviewing / submitting | value editor 单次 onReview；state.inspecting/applying 禁用 center；pending 携 baseRevision | 双击单次 inspect/execute；review 取消保留草稿 |
| conflict / stale | 409 存 pending.conflict，禁 Apply；Reload Latest 不自动合并 | G04 草稿可复制/保留、重载明确丢弃；同一 exact project 重审 |
| committed + refresh failed | receipt / refreshRequired / inert editor | 重试只读，不再次 execute；读成功后更新 revision/selection |
| read-only | Actor 没有独立 archive/history 编辑模式；refreshRequired/忙碌禁写，Source 文件可能 binary/oversize 只读 | 复用真实能力禁用；不要虚构 Actor archive/restore/asset/avatar |
| leaving / object switch | 原确认取消保存当前 DOM；确认允许丢弃；| Actor A→B、Source→其它 view、Back/owner/close，取消不能把 A 草稿落到 B |
| late response |Inspector sequence|不重写 controller|
