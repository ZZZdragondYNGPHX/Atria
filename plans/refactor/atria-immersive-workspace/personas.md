# Native Personas — capability, migration and release gate

## Responsibility and scope

用户设定是账户拥有的个人游玩身份；在 Library 管理、在 Play 当前会话选择。账户显示名称/头像、作者 Actor 和共享席位是不同对象。姓名、头像、可选描述与管理备注保留；备注只用于管理，不发送模型。

来源：旧 `public/scripts/personas.js`、`public/index.html`、`public/script.js`，以及 [SillyTavern Personas 文档](https://docs.sillytavern.app/usage/core-concepts/personas/)。旧备份不含头像二进制和聊天绑定，因此不能宣称仅凭该 JSON 恢复完整身份资产。

本模块不是旧管理抽屉重显示，也不恢复整套 SillyTavern 产品迁移。它新增 Native 资源、会话/请求 evidence、数据转换与完整恢复。D1 已核对基线并冻结下文实施契约；A4a 已实现资源/会话/请求/Save/共享选择与 Host capability 合约；A4b 已完成迁移、账户备份扩展和支持范围的产品入口，实际本地证据与未验范围见本任务 Record；Shared 描述明确停用。

## Native authority design

| 对象 | 冻结语义与拥有者 | 实现复用点 / A4 要实现的契约 |
| --- | --- | --- |
| Persona | authenticated account 内稳定 `personaId`；名字不作主键 | `src/native/contracts.js`、identity、既有 Storage；resource kind / validator / CRUD ports |
| Persona revision | 不可变姓名、头像 Asset ref、描述、管理备注及结构版本 | existing repository immutable/CAS discipline；分离管理备注与请求投影 |
| Default selection | 账户内确切 persona revision 或显式 none | 同既有用户资源存储整合；并发更新检测；不可用默认的就近修复 |
| Session selection | 当前 Session revision/branch 下确切 ref + 可解释快照 | `session-core.js`、`session-snapshot.js`、session repo；namespace/操作/CAS/state hash |
| Message identity | 被接受输入记录当时身份显示快照和来源 | Timeline metadata/projection/fingerprint；不追随后来重命名 |
| Request identity evidence | 当前接受上下文中的身份证据 + selected/omitted explanation | `adapters/generation-host.js`、`model-prompt-runtime/context-providers.js`、Effective Request Snapshot |
| Migration receipt | 账户内 source digest、legacy key→native ID/revision、完成/待处理项 | 既有 Storage 事务/receipt；稳定 schema、重放与恢复 |
| Avatar asset | formal Asset ref/content hash；账户隔离与引用闭包 | `repositories/asset-store.js`、asset delivery、backup；增加 persona/session/save 引用解析 |

服务以认证 owner 为准，不信任浏览器提交账户标识。客户端可展示 revision 与草稿，但不能提交自造 `prompt.host` 或越过原生 context authority。下文冻结的 API、错误码、大小/图片限制与兼容版本在 A4a 必须落实为验证器与测试契约；不以 UI 草案里的假字段名直接充当 wire contract。

## Session lifecycle

1. 创建会话时，用户显式选择优先，否则读取当时可用的账户默认；事务中捕获 exact ref/snapshot。none、归档、缺失或无权限应明确呈现，不能用另一身份静默顶替。
2. 编辑 Persona 创建新修订；现有会话保持其原修订。更新到新修订必须由当前会话显式选择并审阅差异。
3. 切换只作用于当前可写上下文的后续输入/生成，保留输入草稿，不影响其他 Session 或历史。生成/停止中、历史预览、无写权限时禁用，并由服务侧重验。
4. 身份切换为原生会话状态操作，使用当前 revision 的 CAS。切换与发送并发时，仅一次被接受的上下文决定输入身份；另一次返回冲突，不能出现显示甲、请求乙。
5. 分叉继承分叉点的身份状态；新分支后续可独立切换。保存/恢复携带准确快照和资源/资产闭包，不依赖当前账户默认。
6. 同一已接受请求的重试原则上固定原身份证据；重新输入/重开通过现有原生生命周期产生新上下文。retry 类型与 fork/rollback 的差异按下文 D1 核定规则实施，不允许绕过不可变 Timeline。
7. 旧会话按既有已提交 display metadata 保留历史。可由可证明的旧来源建立未来身份选择，来源不明确时要求显式选择；不回填虚构 personaId 到旧请求。

来源归档或删除不得破坏历史显示；离线快照用于可读恢复，真实缺失状态仍需标明。缺头像可以占位但保留原 asset ref/原因，不能偷偷替换快照。

## Prompt / Context integration

描述是玩家提供的资料，不是作品世界事实或作者 Actor 定义。复用既有 Context Plan → Prompt IR → 编译/预算 → Effective Request Snapshot，定义有类型的 persona context contribution，不拼接到全局 system prompt。

是否使用描述取决于具体作品/任务/路线声明的适用 context 和程序消费位置。未消费、禁用、无权限、预算省略都要可解释。身份显示可生效而描述未进入请求；UI 不用“已应用”掩盖该差别。

记录 exact persona ref、快照摘要、context 来源、消费阶段、token/budget 结果及遗漏原因；预览不发送、不解析 Secret、不写会话。实际请求证据来自服务端接受的上下文，而不是客户端预览截图。管理备注不进入任何请求投影。

任务过滤沿用既有角色/Task authority：与当前玩家身份无关的 Studio、后台维护或记忆工作不能默认获得全文个人描述。作品要求与玩家资料冲突时保持来源区别，作品 canonical facts/Actor 权限不被用户文本覆盖；不能默默把文本注入多个角色。

旧 `{{user}}` 仅在清楚的 legacy 描述转换中按捕获的 persona 姓名处理，需展示转换差异；`{{char}}` 多 Actor 时不猜测单一角色。未知宏原文保留、提示待处理，不作为模板代码执行。Native 作者资源继续使用现有 typed Prompt 契约。

## Management and deletion

列表支持搜索、排序、分页、新建、复制、详情编辑/新修订、归档/恢复、默认管理、使用引用。图片上传/裁剪结果通过正式 Asset 管理，取消不留下有效引用；具体允许类型和尺寸使用现有校验器。

归档保留 revision 与所有快照，阻止作为新选择候选；当前快照照常可读。永久删除需先显示真实 Used By（默认、Session、branch/save、request evidence、迁移 receipt/备份相关资源），只允许按约定保留策略处理无引用资源，不能级联重署名历史。首轮不提供“把旧历史全部同步成当前身份”。

## Legacy conversion matrix

| 旧能力/数据 | 新处置 | 验收重点 |
| --- | --- | --- |
| `personas` avatar filename key | 稳定 ID，文件名只存 legacy provenance；图片转 Asset | 重命名/重复文件不改变资源身份 |
| `persona_descriptions` name/description/title | core 内容转修订；title 为管理备注 | 原文字节可恢复，备注不发送 |
| `default_persona` / 全局当前设定 | 默认采用单独审阅，默认不替换现有；当前选择转显式 Session scope | 改默认不改变旧 Session |
| chat lock / temp / auto-lock | 先保留原 scope 证据；可证明来源才映射会话选择 | 不跨会话重署名；无“一条临时输入”假能力 |
| character/group/dedicated bindings，多候选 | 待处理来源；人工确认 Native 目标后显式映射 | 旧 avatar/群组 ID 不当 packageId/entryPointId |
| PromptManager / AN top/bottom / depth/role / NONE | 支持 typed context 才映射；未支持暂不注入 | 迁移完成 ≠ 描述已经进入请求 |
| Persona Lorebook | 保留原引用；明确映射到 Knowledge 和实际 scope | 不变成全局世界事实，缺闭包有修复 |
| `{{user}}` / `{{char}}` / 未知宏 | 显式转换审阅/待处理，保留原文 | 不猜多 Actor，不丢未知配置 |
| Actor 导入身份 | 仅选择允许的显示资料/描述字段 | 不导入角色 authority/工具权限 |
| persona-sync history | 退役为非支持的历史批量改写，原数据可导出 | 已提交 fingerprint 不变 |
| old JSON backup | 预检、转换副本、结果/待处理；缺图和聊天绑定明确说明 | 不宣称完整恢复 |
| 使用统计 / 删除 | 由真实引用计算；删除按原生闭包 | 不用 UI 访问次数替代真实引用 |

## Migration transaction and rollback

读取旧本地数据或用户选择的旧 JSON，先验证结构/版本/大小和所有条目；预检只读。审阅显示新建副本、同名/ID 冲突、默认选择、图片/绑定/注入待处理和转换 diff。名称碰撞创建副本，不覆盖原项。

按账户 + source digest + legacy key 建 ledger：重复执行返回已完成映射，未完成项可重试；有内容变化形成新的受审阅来源，不盲目覆写之前转换。账本记录原始数据、头像映射、警告和目标 exact revision。批次与单项发布、失败补偿与恢复按下文 D1 核定规则实施。

转换先创建资源/资产，验证闭包后才发布可选结果，最后可显式采用默认。取消预检不写数据；部分失败保留已完成 receipt 和可解释未完成项。保留旧数据以支持回退/重新审阅；回退不能删掉转换后已被会话使用的快照或重放历史。

首轮不自动将旧绑定跨作品推广。无法迁移的高级设置保存在来源详情并能导出/再处理；不假装具备其 Native 行为。

## Backup / restore and shared/custom UI

新完整备份需 versioned manifest，含 Persona 全修订、avatar assets/hash、默认（单独范围选择）与迁移证据；选入的会话/存档必须带身份快照与闭包。预检验证 hash、重复 ID、账户目标、缺资产与确切引用；恢复策略显式审阅，不按名字自动合并。继续复用现有账户备份和原生 save 容器，不创建并行备份服务。

共享中身份是席位主体授权的输入资料，不等于账户档案。观察者不能替玩家选择；Host 能否替席位选择由现有权限判断，首轮默认只允许席位授权主体操作。描述的可见性/传递范围必须与现有任务和共享投影契约匹配；无支持时拒绝或解释停用，不能回退为一个共享全局 persona。

作品自有 UI 通过 Host capability 打开身份选择；失效/崩溃时仍有宿主入口。游戏不获得个人库任意读写能力。

## D1 audit coverage

- Resource kind/identity/schema、revision hash/CAS、归档与删除引用解析、Storage 引擎 parity。
- Session state namespace / lifecycle / save format 版本与旧 save 兼容；旧 metadata 到未来选择的可证明范围。
- Prompt context 类型/消费位置/角色过滤/预算 provenance；不可伪造的服务端捕获。
- Shared seat principal/capability、Host Bridge 的 scope、个人描述可见边界。
- Ledger 单项/批次原子性、图片引用补偿、可重试恢复、备份 manifest 和冲突策略。

以下为 D1 的源码证据与冻结契约；测试设计在 validation 的 C20 清单中维护。技术命名是实施选择，不记作用户逐项答复。

## D1 source audit — baseline 783bb6fd3

| 已核对代码 | 已有能力 | 本任务必须补齐的差额 |
| --- | --- | --- |
| `src/native/{identity,contracts}.js`；`src/storage/engines/native-resource-key.js` | opaque ID、Native kind/key 注册、统一 native_resources | 无 Persona ID/kind/validator；不能直接借用只接受 Prompt 类型的 VersionedJsonResourceHandler |
| `src/native/repositories/{common,session-repo}.js`；`src/storage/engines/fs-engine.js` | immutable integrity、CAS、进程内写串行、Session commit-last；SQL Native handlers | FS withTransaction 直接执行回调，无跨文件回滚；Persona 资源/默认/ledger 需同等发布纪律 |
| `src/native/{session-core,session-snapshot}.js` | hashed namespace、revision/branch/save；保留 Timeline metadata | 无身份状态或输入捕获；需加入 reserved namespace，禁止通用 runtime patch 自造身份 |
| `src/native/adapters/{generation-host,native-session-context}.js`；`public/scripts/native/context-compiler.js` | 接受准确 revision、上下文选择/预算、拒绝客户端 prompt.host | 无玩家身份贡献；typed task context 仅 input/history/world/knowledge/projection，需显式扩展 |
| `src/native/shared-authority.js`；`src/native/frontend/{host-bridge,host-services}.js` | member principal/seat/scope/epoch、observer 限制、显式 Host method 白名单 | 无席位身份选择/个人资料投影/Host picker；现有共享 Asset endpoint 仅允许 Package 闭包 |
| `src/native/{save-system,save-container,contracts}.js`；`src/native/repositories/asset-store.js` | Save v1 snapshot/session、v2 resume；Asset hash、save closure、引用检查 | state 已可携带新增 namespace，但不会自动收集 Persona 头像；需完整导出/导入/GC/删除路径 |
| `src/users.js`；`src/endpoints/users-private.js`；`src/storage/migration/selection-mapping.js` | native 备份选项包含 Native 数据、projects、nativeBlobs，DB native_resources dump/跨引擎恢复 | Persona 索引/引用预检与可选默认恢复需扩展现有管线；不能增加第二个备份服务 |
| `public/scripts/personas.js` onBackupPersonas | 无版本号 JSON：personas/persona_descriptions/default_persona | 不带头像字节、聊天锁定；旧 restore 会补默认头像，Native 转换不得仿造这种完整恢复 |

### Frozen resource and service contract (new, schema 1)

Persona 使用独立 Native kinds，全部经既有 Storage Engine 注册/读写，不进入 Prompt 资源类型白名单。新增 ID family `persona`（`persona_*` opaque UUID）；修订使用既有 `revision`（`rev_*`）。新增 key：

- `atri_persona`：handle + personaId；root = schemaVersion/personaId/currentRevisionId/archived/publishedRevisionIds；CAS integrity 由服务返回。
- `atri_persona_revision`：handle + personaId + revisionId；immutable = schemaVersion/personaId/revisionId/name/avatar/description/managementNotes。avatar 是完整 AssetRef 或 null；contentIdentity 是既有 canonical JSON SHA-256。
- `atri_persona_default`：handle；schemaVersion/selection，selection 为 exact ref 或 null；缺记录等价 none，但 CAS 使用 hash(null)。
- `atri_persona_migration`：handle + sourceDigest；账本见后文。所有 key 的 handle 来自认证 principal，不从客户端身份字段采信。

A4a 的 FS 发布核对补充：`publishedRevisionIds` 随 root CAS 一并发布，exact get/revisions 只读取该集合；只写完 immutable revision、尚未发布 root 的修订不成为可读/可选历史。它是 root 的发布闭包，不是另一套 revision authority。

Exact ref = personaId/revisionId/contentIdentity；服务读取并核对内容 hash。列表默认排除 archived，仍可按 ID/exact revision 读取历史。名字允许重名，新建/复制由服务分配 ID；修改总是发布新修订。root、default 与 receipt 的 mutable CAS 使用 expectedFingerprint；创建以 hash(null) 为前提，缺少前提拒绝。

限制是新 Persona 契约，不宣称现有 AssetRef validator 已检查像素：name 非空、最多 256 Unicode code points；description 最多 64 KiB UTF-8；managementNotes 最多 16 KiB。不截断超限内容，迁移保留原文并转 pending。头像首轮 PNG/JPEG/WebP/AVIF，最大 8 MiB、4096×4096、总像素不超过 16,777,216；服务解码核对真实类型/尺寸，拒绝损坏或伪造 MIME。复用 AssetStore 的不可变 hash/blob 管线，裁剪结果另建 Asset；大小限制不能只在浏览器实现。

在既有 Native Product 路由/服务注入中新增 `personas` 操作族，统一认证、错误和客户端适配；首轮采用 POST JSON 命令：list、get、revisions、create、revise、archive、default/read、default/set、used-by、delete、avatar、migration/preflight、migration/apply、migration/receipt。list 接 query/includeArchived/cursor/limit（1–100），返回 items/nextCursor；get/revisions 只接受本账户 ID/exact ref。create/revise 接内容与 expectedFingerprint；archive 接 ID/archived/expectedFingerprint；default/set 接 selection/expectedFingerprint；delete 接 ID/expectedFingerprint 并服务侧重查引用。avatar 接 base64 bytes 与 declared mediaType，由服务返回 AssetRef；不接文件路径或其他账户 handle。

Session 在既有 Native Session 路由新增 persona/read、persona/select；select 接 sessionId/expectedRevisionId/selection，返回正式 Session snapshot。create 接可选 personaSelection：省略读取当时可用默认、null 显式 none、exact ref 显式选择。省略时默认已归档/缺失则返回可解释 unavailable，要求选择或显式 none，不能静默替换。默认读和发布捕获同一受保护资源版本；发生竞争返回冲突。

新增错误码 `native_persona_invalid`、`native_persona_conflict`、`native_persona_unavailable`、`native_persona_referenced`、`native_persona_scope_denied`、`native_persona_migration_conflict`。HTTP 分别按 400/409/404（本账户资源缺失）/409/403/409；未认证 401，其他账户 ID 不暴露存在性，unknown fields 拒绝。read-only 使用现有 storage_read_only 处理；预检失败不写数据，持久化成功后刷新失败返回可识别 receipt，客户端不盲目重建资源。

### Frozen Session, input and retry contract

新增受保护 `atri_player_persona` namespace，schemaVersion 1，包含 solo selection 和按 seatId 的 selections。每个选择为 none 或服务捕获的 exact ref + snapshot（name/avatar/description）+ snapshotHash/source；source 区分 explicit/default/migration/restored；共享选择另含服务捕获的 authorization（principalHash/accessEpoch/scopeEpoch），不存明文账户 handle。managementNotes 不在 Session/message/request 投影中。完整内容哈希只用于 exact ref 验证，不能据它重构备注。旧 revision 缺 namespace 等价 legacy-unbound，读取不写回；不回填 personaId。

SessionCore 专用操作在既有 Session 写锁与 HEAD CAS 内发布；Persona 资源写锁先于 Session 锁，同一锁序用于默认捕获、切换、引用检查和删除，避免 TOCTOU。共享操作先取得既有 shared access lock、再按相同顺序进入资源/Session authority，不在 Session 锁内反向请求个人库锁。服务重验 run/lifecycle/生成状态、可写权限、resource revision/archived，不能只依赖 UI disabled。archive 不破坏已捕获快照；修改默认/资源也不隐式推进其他 Session。

输入接受和身份捕获共用同一 CAS。正式 Timeline user entry metadata 增加 `atri_player_identity`（schemaVersion/ref/显示 name/avatar/snapshotHash、共享 seatId）；描述保留在该 revision 的身份状态，不复制管理备注。typed frontend action 的输入、authority receipt、assistant 同批发布也必须捕获同一证据；beginStory 与所有发送入口使用同一路径。

重试分三类，不能统称原 HTTP 重发：

1. Provider retry/fallback 仍在 generation-host 已捕获的上下文内，不重读账户默认/最新 Persona。
2. retryReply 非 transaction 路径回到准确的 post-user revision 并 fork；transaction 路径回到 pre-effect revision 并新建 user entry（当前只带 atri_authority_retry）。A4a 须复制原输入身份证据，并把原身份 snapshot 纳入新分支上下文；不得取重试按钮点击时的当前选择。
3. 显式 fork/rollback/restore 继承所选 revision 的身份；重新输入是新请求，取其接受时新分支的状态。ironman/history checkpoint 不可重试时沿用原限制，不为 Persona 绕过。

### Frozen Context and request evidence contract

在 Native Context compiler 增加 `player_persona` lane 和 authority `player_provided`，stable item ID 与 exact ref/snapshotHash 关联。独立 provider 只读接受的 Session snapshot；不扫个人库，不拼接 system directive。Context Provider 映射为 `context.player-persona`；Prompt consume/render/预算/provenance 校验同时接线，既有 context.fact 与 canonical world 不承载个人描述。

作品 EntryPoint 和 typed task context 增加显式 `player-persona` opt-in；未声明的旧作品默认不消费描述，身份显示仍成立。typed task validator 需增加该项并调整最大项数；只有当前玩家输入相关的 Session task 可消费。Studio、背景维护/记忆任务与无席位关联调用拒绝该 opt-in；多个 Actor/共享席位按任务 scope 过滤。Prompt 程序未消费/禁用/无权限/空描述/预算省略分别产生 no-consumer/disabled/scope-denied/empty/budget-omitted。

Effective Request Snapshot 增加 versioned personaEvidence（保持旧 snapshot 可读）：exact ref、snapshotHash、contextItemId、selected/omitted、reason、consumer stage IDs 与预算结果。描述只经实际 context item 出现；备注完全排除。native_generation_host_readonly 继续拒绝客户端 prompt.host，预览也由服务选取准确 revision，不解析 Secret、不发送、不写 Session。角色过滤必须在 context selection 与最终 generation-host task filtering 两处成立，不能只新增 provider 后被旧过滤器丢掉或泄漏。

### Frozen shared, Host and assets contract

共享选择由认证 member principal 从自己的账户库读取，不由 Session owner 代读/代选。请求接 owner/sessionId/seatId/expectedAccessRevisionId/expectedRevisionId/selection；member-seat-scope/epoch 必须相符，observer 与其他席位拒绝，host 首轮也不能替另一主体选。服务把明确授权的快照发布到 owner 的 Session seat state；公共投影只给 status/name/avatar，并按捕获的主体 hash 与当前 access/scope epoch 重验；恢复旧 Branch 不给后来占用相同 seat 的账户旧身份。描述仅给授权消费任务，备注/私人库列表/owner handle 不进入玩家投影。

头像在个人库留原 Asset，同时以授权快照复制到 owner 的 AssetStore 闭包，记录原 hash，避免跨账户任意资产读取。共享资源投影与 asset delivery 白名单增加准确 seat snapshot 头像，校验成员关系；不开放整个个人库，也不把头像伪装为 Package asset。跨账户转移是 blob/ref 准备 → Session HEAD 发布，失败仅产生可回收未引用资源，不承诺跨引擎事务。

Host bridge 新增显式 `host.persona` capability：status 读当前授权身份，openSelector 打开宿主 picker，由宿主经相同服务选择。沿用 epoch/nonce/scope/expected revision 和 method 白名单；作品不获得 list/CRUD 服务。桥失效时独立宿主入口仍可用。

Persona revise/session/save/migration receipt 全修订引用加入 Used By 和 AssetStore 删除/GC 检查。永久删除在受保护引用检查后才可执行；存在 migration receipt 也算引用，首轮不自动清除 receipt。取消上传不创建有效 Persona 引用，孤立 blob 按现有 GC 回收，不能删除曾进入闭包的头像。

### Frozen migration, save and backup contract

旧 JSON 明确支持无版本号 personas/persona_descriptions/default_persona；未知显式版本拒绝 apply，但可展示原文和原因。sourceDigest 对上传原始字节作 SHA-256；preflight 上限 16 MiB、最多 1000 条，先只读全量结构/头像/宏/绑定审查。服务捕获的本地来源另含头像 hash 与绑定来源 digest；不同字节/依赖组成新来源。浏览器任意路径不得成为本地读取权限。

账本 schemaVersion/sourceDigest/sourceFormat/rawSource（原字节 base64）/planDigest/items/defaultAdoption；每个 legacyKey 保存预分配 personaId/revisionId、原配置、Asset 映射、warnings/pending、status（prepared/published/failed）、target exact ref。apply 必须带已审阅 planDigest 与 expectedFingerprint；改变宏/绑定/默认映射后重新预检，不让旧审批自动应用新方案。

FS 不提供整批原子性：先 durable prepared receipt → blob/ref/immutable revision → verified root 发布 → receipt published；任何位置中断重试均核对预分配 ID/hash/root，root 已发布但 receipt 未完成时补 receipt，不创建第二份。列表与选择只暴露完成的资源发布，migration 未完成不能通过 revision ID 绕过。SQL 也保持同一可观察语义，使用其事务加强单项发布；批次允许部分完成，不宣称整批回滚。默认采用是批后独立 CAS，失败保留旧默认。回退只归档已转换资源，不能撤回已使用历史。

缺头像在 UI 用占位并保留 pending/source filename，不写假 AssetRef；旧位置/NONE/Lorebook/宏/绑定仅在可验证 typed mapping 后消费，否则保存未处理来源可导出。首轮迁移不自动改旧 Session；用户对目标 Session 显式选择，既有历史不改。

有 Persona namespace/evidence 的新 .atriasave 使用 schemaVersion 3，支持 snapshot/session/resume；容器 magic/version 保持 v1，header 明确匹配 scope/schema。继续读取 v1/v2，缺身份保持 legacy-unbound；旧读端必须因新版本明确拒绝，不能漏掉头像后伪成功。完整 Persona snapshot 存在 stateRecords，历史显示证据存在 Timeline metadata；avatar 加入 assetRefs/attachments/字节/hash 校验，包含 branch/save/request 使用的准确闭包。跨账户恢复以独立快照可读，不把原 personaId 自动认领为目标个人库或采用其默认。

账户备份继续使用 native 选项、现有 manifest 与 native_resources/nativeBlobs，不另建 archive/服务。增加 schema 1 Persona manifest 索引（root/revision/hash/receipt/avatar）；默认恢复是 Native 范围内独立审阅选项，默认保留目标账户默认，显式 adopt 才 CAS 更新。恢复 preflight 校验完整闭包/ID冲突/hash，冲突返回审阅，禁止按名字合并。旧备份无该索引且无 Persona kinds 仍可恢复；出现 Persona kinds 却缺索引时拒绝完整身份恢复并报缺契约。FS↔SQLite↔MySQL↔Postgres 的注册/dump/selection/restore 路径同样纳入 C20 测试。

## A4a implementation checkpoint

产品实现已接既有 Storage/Session/Context/Save/Host 路径，证据见 [Record A4a](../../../records/refactor/atria-immersive-workspace.md#stage-a4a--native-persona-resource-and-session-contracts)。首轮 Shared 描述 consumer 明确返回 `shared_scope_unsupported`，不回退为 owner solo/global Persona；席位选择、展示和头像授权已实现。Host `status/openSelector` 为白名单合约，picker action 缺实现时明确 unavailable。A4b 仍需关闭迁移/账户备份 manifest/default adoption、共享消费停用策略与真实 picker/UI 的剩余开放门。

## Release gate

A4a 完成后才能接 A4b；入口开放需 V20 的账户隔离、revision/CAS、默认/会话/历史、Prompt 证据与过滤、branch/save/旧格式、共享/自有 UI、迁移幂等/失败恢复、图片/备份闭包全部通过。没有模型实发证据时只承诺编译与受控测试所证明的范围。任何兼容能力尚缺时明确保持入口未开放，保留旧数据，不以关闭 warning 代替验收。


## A4b supported-range checkpoint

A4b 已实现并本地验证管理/搜索/排序/分页/修订/头像/归档/默认/Used By、solo 会话 picker 与 Shared 自己席位 picker。普通输入展示接受时姓名/头像；失败或来源归档/缺失保留原快照与解释。Host 白名单经原 Bridge 接宿主 solo picker，作品库 CRUD 不开放；Shared Host status 明示 seat-required，席位选择走 Shared 控制，不回退 owner solo。共享描述继续明确停用，Context provider 也强制 `shared_scope_unsupported`，不能用 caller opt-in 绕过。

迁移上传和账户旧设定均只读预检；账户捕获仅取 Persona 设置 namespace 与认证头像目录内的合法文件，文件名不授予浏览器路径读取权限。局部源包含 namespace/avatar/binding digest 和 pending；apply 重新捕获并重验 planDigest。原上传 JSON 字节/unknown 来源、宏 diff、未映射注入/绑定/Lorebook 与图片缺失均留在 receipt；没有自动改旧 Session。

账户恢复选择的首轮策略是按 exact IDs 合入 Persona、保留目标已有 Persona；冲突拒绝并要求审阅，不按名字合并。这个策略在 merge/overwrite/full 下同样保护身份资源；其他 Native 数据仍服从原恢复范围。预检和 UI 明示此策略，默认独立保留，显式 CAS adopt 才改变；缺 Persona manifest/归档默认不能进行新默认 adoption。保留目标头像闭包，继续由现有 staging、snapshot/rollback、runner 和 AssetStore 恢复，没有新备份 authority。

支持范围的本地开放证据见 Record A4b：FS/SQLite、受控 HTTP Provider 和 Chromium 390px。Shared 描述、旧高级注入/绑定自动映射和历史批量改写均明确未提供；MySQL/Postgres、真实手机/IME/WebView/远端模型及完整 S00–S20 仍未验收。A4b checkpoint 完成不等于完整 V20/最终产品集成验收；下一正式阶段为 A5。
