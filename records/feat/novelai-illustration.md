# 官方生图插件 — Record

- Task ID: `atria-novelai-illustration`
- Primary Workspace: main 产品源码 / `feat/novelai-illustration`
- Status: Active
- Plan: [入口](../../plans/feat/novelai-illustration/index.md)

## S1 — 内核基础

- Start HEAD: `084089d41`
- End/Tested HEAD: `2043e052f`
- Status: Complete（仅 S1；整个任务仍 Active）
- 实施分支: `feat/novelai-illustration`，独立产品 worktree

### Decisions

用户已经多轮确认并授权开始。单标注、提示词/图片两步、NovelAI 双接口、角色库/预设和停用后插图保留等冻结规则见 Plan。原 main 的 AGENTS.md 与 docs 的治理/模板 dirty changes 不属于本任务，不提交。

### Completed

- 独立实现共享标注/图片 contract、opaque ID、准确正文范围/选文校验，禁止切开 surrogate pair。
- SessionRepo 基于现有 state records 保存呈现状态，分支 head 与 SavePoint 快照隔离；CAS、现有 session 写锁保护并发更新，正文 publication 保留最新记录。
- `IllustrationService` 与 Native Session HTTP 入口提供创建/删除标注、登记图片历史、选择展示版本；不修改正文或推进剧情。
- AssetStore 的引用/删除保护包含当前及各分支历史与 SavePoint 图片；锁在存储事务外获取，覆盖图片登记/删除竞争和导入。源文 revision 接入历史可达与 GC。
- Host Safe Prose 有 canonical selection 映射；Host Conversation 在标注结束段落下方呈现一个选中版本，保留正文节点与文本选择，图片具备尺寸/替代文字/懒加载。
- snapshot、session、ironman resume 导出/干净存储导入保留标注/图片；源文、状态 hash、资产及选中版本归属校验。历史分支保存不会采用当前分支的图片。
- 恢复同一正文 HEAD 的不同图片状态也派生分支，原分支后续图片继续保留；删除标注不删除图片历史，迟到图片不复活已删除标注。
- 产品提交已推送到 origin/feat/novelai-illustration。

### Validation

- 本地 7 套相关 Jest 测试通过：illustration-core、illustration-renderer、session-runtime-http、frontend-prose、session-core.contract、save-system、asset-delivery-p5。首次整组收尾验证 76 项通过。
- 最后增加历史分支保存回归、修正保存来源后，只重跑受影响的 3 套（illustration-core、save-system、session-core.contract），52 项全部通过；相关覆盖合计 78 项，无需重复未受影响的套件。
- 源码与测试触及文件 ESLint、`git diff --check` 通过。
- 使用现有本地 Node 22.23.3；默认 Node 24 与已有 better-sqlite3 ABI 不符，初次 SQLite 检查失败后改用匹配的本地运行时，未重建或修改公共依赖。FS/SQLite 实际执行；MySQL/PostgreSQL 用例明确关闭。
- 未运行远程 CI、构建、真实生图请求、浏览器交互或手机真机检查。

### Known limitations

- S1 是内核基础，尚无可操作的生图模式、官方插件卡片/配置界面、LLM 提示词请求或 NovelAI 请求。
- Host Conversation 已接入段落插图；自定义 Package prose surface 的 SDK/集成方式由 S2 按其已有边界补齐，不能任意改写 Package DOM。
- 参数快照限定为非秘密 JSON；第三方 NovelAI 的实际协议仍待 S4 核对。

### Next checkpoint

S1 commit/push 后停止。下一目标是 S2：沿同一分支完成官方插件注册/SDK、双模式选择与单标注卡片、全局角色库及作品启用清单、预设与配置持久化。只读 Plan index/core/plugin 和本 Record，再读直接相关代码；不重开已冻结产品讨论。

## S2 — 官方插件交互

- Start HEAD: `2043e052f`
- End/Tested HEAD: `27c387300`
- Status: Complete（仅 S2；整个任务仍 Active）
- 实施分支: `feat/novelai-illustration`，沿用独立产品 worktree

### Decisions

先核对真实 Git，再读取 live HANDOFF、Plan index/core/plugin 与本 Record。沿用已批准边界，未读取或复制 reference 代码，未扩大到 S3/S4。按 Plan 使用本地 ui-ux-pro-max 与 playwright-cli。产品和 docs 的提交只包含当前任务；main 的 AGENTS.md、docs 的 README/WEB-PERSISTENT-PROMPT/templates 原有改动保留。

### Completed

- 在现有 Native 扩展运行时中注册随产品分发的 `atri_official_illustration`，默认关闭，可在 Extensions → Plugins → 官方插件独立启停；配置不可用不会阻止其它扩展激活。
- 扩展 SDK 增加 Session 呈现快照、准确选文、选择模式、surface 通知、配置 CAS 和四项标注操作。资源、事件、高亮、观察器随实例清理；过期 SDK/排队请求被拒绝，迟到结果不会替换另一 Session/分支的呈现状态。
- Host 注册 canonical prose surface；正文/生图模式共用正文，读取桌面框选和手机原生 Selection 的 selectionchange/pointerup/键盘事件，跨相邻段落形成一次标注，跨消息选文拒绝。CSS Custom Highlight 保留正文节点。
- Package `bind:prose` 通过现有 Headless Host 的 messageId + canonical content 校验接入，支持组件 Shadow DOM 的 composed selection 与 Host 高亮样式；临时生成文本或任意文本绑定不成为正式标注 surface。停用插件仍由 Host 呈现已有图片。
- 单标注卡片支持选文、角色手动增删、固定外观快照、可覆盖默认服装、动态描述、场景/构图、直接编辑提示词、独立参数及历史版本选择/隐藏。删除标注保留图片历史。生成提示词/生成图片为两个独立且暂不可用的按钮，无全局批量入口。
- 可选 `annotation.draft` 及 updateAnnotation 沿用 SessionRepo 的版本化呈现记录、写锁和 CAS，正文与剧情 authority 不变；卡片随原有存档/导入/恢复闭包保存，配置变化不覆盖已编辑的提示词。编辑/删除/展示操作捕获原 branchId；冲突刷新验证服务器分支身份。
- 全局角色库含姓名、别名、固定提示词、默认服装、启用与可选剧情角色关联；作品单独选择角色。仅匹配选文中的启用角色，处理 Latin 单词边界/CJK、大小写别名和同名歧义，代词可手动补充。
- 风格词/质量词、负面词、NovelAI 参数支持全局默认、作品覆盖和单标注冻结覆盖；图片连接与提示词模型路线分别引用现有 Runtime 配置，整理模板可编辑并恢复官方默认。配置使用既有 Native 资源存储，认证、预算及 CAS 校验拒绝秘密字段，和 Skill/其它扩展配置隔离。
- 卡片/配置采用 Atria 主题、可见字段标签、44px 按钮、稳定图片尺寸及 safe-area；工具条按实际高度避让卡片，Managed Play 的 Host 提供 composer 边界以避让正文输入。
- 产品提交已推送 origin/feat/novelai-illustration；本阶段停止，不合并 main。

### Validation

- 分次执行触及范围的 10 套本地 Jest，相关覆盖合计 113 项通过：illustration-settings（4）、illustration-plugin（9）、illustration-core（19）、illustration-renderer（3）、extensions-foundation（12）、extensions-workspace（7）、extension-runtime（8）、frontend-prose（4）、frontend-presentation（37）、session-runtime-http（10）。后续改动只重跑受影响套件，没有重复全仓测试。
- FS/SQLite 实际验证配置持久化、CAS、独立资源隔离；卡片保存时刻冻结、干净存储导入、恢复、原分支编辑与已删除标注拒绝写入。Node 22.23.3 与既有 SQLite native module 匹配。未验证 MySQL/PostgreSQL。
- 本地 playwright-cli + Chrome 使用一次性认证 FS/真实 IllustrationService 和 HTTP fixture，不涉及生产账户或外部模型。1280×900 桌面真实鼠标跨段框选、建单标注、保存编辑、高亮与正文节点保留通过。
- 375×812、touch-enabled 手机模拟视口：通过浏览器 Range 设置选区，再执行真实触摸建标注、卡片编辑保存、历史版本隐藏/选择、全局角色配置保存。没有横向溢出，卡片不与工具条重叠；停用后控件与高亮移除，Host 插图和历史保留。
- 浏览器 Shadow DOM 的 composed selection、跨段建标注、卡片保存、Host 插图与正文节点保持验证通过；DOM 集成测试实际执行生产 Native Frontend 的 prose binding。
- 手机模拟器 CDP 850ms 触摸长按未产生原生选区。因此 Range 选区接入与布局/触摸按钮有浏览器模拟证据，长按系统菜单及原生拖柄没有成功证据；没有手机真机通过声明。
- 26 个触及 JavaScript 文件 ESLint 与 `git diff --check` 通过。没有远程 CI、构建、真实 LLM/NovelAI 请求或 APK/真机验证。

### Known limitations

- 提示词生成与图片生成按钮目前明确不可用，S3/S4 才执行模型及 NovelAI 请求；当前支持直接编辑保存提示词与配置。
- 真机长按/跨段拖柄、移动端虚拟键盘和实际应用 WebView 仍未验证。Custom Highlight/Shadow selection 使用浏览器能力检测；本阶段实际浏览器证据为本地 Chrome。
- 图片连接/提示词路线保存现有配置引用，后续阶段按正式 generation/novelai 模块接入实际服务与任务，不另建密钥或调度 authority。
- 卡片尚未保存的编辑在同一插件实例内切换卡片/模式时保留；正式持久化由“保存卡片”完成。

### Next checkpoint

S2 完成后停止。下一阶段 S3：读 Git → live HANDOFF → Plan index/core/plugin/generation → 本 Record，沿用本分支接入独立提示词模型路线、历史上下文快照、固定/动态描述组合与编辑保护。不要提前执行 NovelAI 请求或全局批量触发。

## S3 — 提示词生成

- Start HEAD: `27c387300`
- End/Tested HEAD: `e39b10f9d`
- Status: Complete（仅 S3；整个任务仍 Active）
- 实施分支: `feat/novelai-illustration`，沿用独立产品 worktree

### Decisions

核对真实 Git 与 live HANDOFF 后读取 Plan index/core/plugin/generation 和本 Record；没有读取 reference。沿现有 NativeGenerationHost、RouteResolver、GenerationService、PromptCompiler、密钥边界、NativeTaskScheduler 与呈现存储实施，不建立独立模型/任务/配置 authority。按 Plan 使用本地 ui-ux-pro-max 指导状态、取消、编辑保护及预览；S3 只做本地最小相关验证，没有启动浏览器或真实模型。

上下文必须对应选中回复的正文边界，而非创建标注时已经前进的 HEAD。新标注在服务器创建时冻结相关历史上下文，保持 resume 导出裁剪剧情历史后的可用性；这一可选呈现字段不会变更剧情。内核新增仅供 Host 使用的源文读取参数，检查选中 variant、正文 hash/范围、可达性与源文祖先路径，允许绘图读取已提交资料；公开 load/restore/rewind 权限没有放宽。提示词属于辅助用途，不占用剧情 resolver/narrator 的轮次预算，仍检查 Run 状态并使用现有调度资源、超时与连接请求边界。

### Completed

- 正式增加 `role.illustration_prompt` 用途，Runtime 可创建对应模型路线；官方插件只列出该用途的路线，作品选择优先于全局选择。模型、连接、路线和准确 Prompt/Generation 资源随任务捕获，排队后修改配置不改变已提交请求。
- 标注创建只冻结资料，不请求模型。主体保留完整选文；所在及相邻段落、之前两个完整对话轮次和既有 context compiler 选出的相关知识/场景事实来自准确源文边界。Information/Perspective 权限继续约束可进入模型的历史与事实，不扫描整个角色/知识目录，也不纳入后续剧情、兄弟分支或未选回复。
- 使用实际 Provider token counting 计入准确 Prompt modules 与输出预留，辅助内容目标约 4000 tokens；先移除整个背景条目，再移除完整轮次/段落，记录省略项。主体与所选角色不会被静默截断；容量不足明确失败且不进入 Provider send。
- 严格解析场景/构图、给定角色动态描述与可选剧情服装的 JSON 输出，拒绝额外角色/固定外观字段。程序组合冻结的风格、质量、固定外观、服装和动态描述；明确剧情服装覆盖默认服装，null 保留已选服装，负面词/NovelAI 参数保持独立。
- 每次成功生成保存独立 `prmv_*` 版本，包含完整 draft、实际 RequestContextPlan/PromptIR、准确模型路线及非秘密 effective config、模板和配置 revision。沿现有标注呈现记录进入 Session/SavePoint/存档闭包，验证证据结构、重复身份、跨 Session 归属与秘密字段，支持干净存储导入及 resume 后再次生成。
- 同一 Session/分支/标注只有一个进行中的提示词任务。HTTP 返回 202，现有服务器调度器持有执行；浏览器关闭或插件卸载不自动取消，重新启用/打开历史可重新订阅。原分支结果不受当前 HEAD 或当前读者分支变化影响。
- 取消及删除标注阻止迟到提示词进入已删除位置；失败仅重试提示词步骤，不调用图片后端。保存时比对生成前的 draft hash：期间发生的正式编辑保留，新结果进入提示词历史，由用户显式应用。客户端保留未保存编辑，并串行刷新呈现，拒绝另一 Session/分支任务的结果。
- 单卡片启用独立“生成提示词”，提供排队/执行/失败/完成反馈与取消；“生成图片”继续明确不可用。支持直接填写、按分块组合、完整最终图片输入预览、提示词历史载入与证据查看，以及显式应用最新角色/预设。自动配置更新不覆盖当前提示词，无全局批量入口。
- 产品提交已推送 origin/feat/novelai-illustration；本阶段停止，不合并 main，不执行 S4。

### Validation

- 分次运行 8 套本地相关 Jest，实际通过项合计 85：illustration-prompt（17）、illustration-plugin（11）、illustration-core（19）、session-runtime-http（10）、lifecycle-scheduler-p4（6）、atria-shell/native-generation-p4（6）、generation-budget-p2（10）与 run-policy-p2 的相关筛选（6）。筛选的 run-policy 其余 37 项明确未执行；后续只重跑发生变化的套件，没有全仓测试。
- 实际执行 FS/SQLite 的历史源文快照、排队路线冻结、继续剧情/切换分支、去重、编辑保护、取消/删除晚到结果、实际 token 裁剪、主体超限拒绝、错误模型输出和仅重试本步骤。
- 本地 Provider fake 与认证 HTTP/supertest 验证 202 后任务继续、当前用户的查询/取消隔离、请求字段校验及提示词/图片两步骤独立。不需要用户密钥；没有请求外部 LLM 或 NovelAI。
- 实际执行铁人模式的受限历史源文读取、公开历史/回滚继续拒绝、提示词不消耗剧情次数、resume 干净导入保留上下文和版本、导入后再次生成；缺失源文上下文的旧 resume 标注明确拒绝猜测式模型请求，仍可手动填写。
- DOM 集成验证生成期间未保存编辑保留、显式历史/配置应用、分块组合与 SDK 卸载只释放 UI 订阅；没有 S3 浏览器交互、手机模拟视口、虚拟键盘或真机通过声明。
- 使用本地 Node 22.23.3，与现有 SQLite native module 匹配；MySQL/PostgreSQL 明确关闭。21 个触及 JS 文件 ESLint、产品 `git diff --check` 通过。未运行远程 CI、构建、真实模型/生图、APK 或真机验证。

### Known limitations

- 图片生成与 NovelAI 官方/第三方兼容接口、图片任务和取消/历史集成留 S4；当前不会执行图片请求。
- 任务投影沿既有服务器内存调度器，仅承诺服务器存活时不受浏览器关闭影响，不承诺服务器重启后续跑。
- S2 或更早的 head-only resume 若已丢失原文历史且没有冻结绘图上下文，不以当前场景冒充原始场景；这类旧标注继续支持直接填写提示词。新 S3 标注及其上下文随存档闭包保存。
- 实际模型能否稳定返回规定 JSON 尚无外部 Provider 证据；不正确输出作为本步骤失败处理，可单独重试。手机长按/原生拖柄、真实 WebView 与虚拟键盘继续沿用 S2 的未验证限制。

### Next checkpoint

S3 完成后停止。用户续接时进入 S4：读 Git → live HANDOFF → Plan index/core/plugin/generation/novelai → 本 Record，沿用同一分支实施 NovelAI 两类接口、独立图片任务/取消、图片历史与最终集成。只做本地最小相关验证；S4 全部完成后才合并并验证 main、清理任务分支与 live HANDOFF。
