# 官方生图插件 — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `atria-novelai-illustration`
- Primary Workspace: main 产品源码 / `feat/novelai-illustration`
- Status: Complete（S1–S4 已集成 main）
- Plan: [入口](../../plans/feat/novelai-illustration/index.md)

## S1 — 内核基础

- Start HEAD: `084089d41`
- End/Tested HEAD: `2043e052f`
- Status: Complete（仅 S1；整个任务仍 Active）
- 实施分支: `feat/novelai-illustration`，独立产品 worktree

### Decisions

单标注、提示词/图片两步、NovelAI 双接口、角色库/预设和停用后插图保留等冻结规则见 Plan。原 main 的 AGENTS.md 与 docs 的治理/模板 dirty changes 不属于本任务，不提交。

### Completed

- SessionRepo 基于现有 state records 保存呈现状态，分支 head 与 SavePoint 快照隔离；CAS、现有 session 写锁保护并发更新，正文 publication 保留最新记录。
- `IllustrationService` 与 Native Session HTTP 入口提供创建/删除标注、登记图片历史、选择展示版本；不修改正文或推进剧情。
- AssetStore 的引用/删除保护包含当前及各分支历史与 SavePoint 图片；锁在存储事务外获取，覆盖图片登记/删除竞争和导入。源文 revision 接入历史可达与 GC。
- Host Safe Prose 有 canonical selection 映射；Host Conversation 在标注结束段落下方呈现一个选中版本，保留正文节点与文本选择，图片具备尺寸/替代文字/懒加载。
- snapshot、session、ironman resume 导出/干净存储导入保留标注/图片；历史分支保存不会采用当前分支的图片。
- 恢复同一正文 HEAD 的不同图片状态也派生分支，原分支后续图片继续保留；删除标注不删除图片历史，迟到图片不复活已删除标注。
- 产品提交已推送到 origin/feat/novelai-illustration。

### Known limitations

- S1 是内核基础，尚无可操作的生图模式、官方插件卡片/配置界面、LLM 提示词请求或 NovelAI 请求。
- Host Conversation 已接入段落插图；自定义 Package prose surface 的 SDK/集成方式由 S2 按其已有边界补齐，不能任意改写 Package DOM。
- 参数快照限定为非秘密 JSON；

### Next checkpoint

S1 commit/push 后停止。下一目标是 S2：沿同一分支完成官方插件注册/SDK、双模式选择与单标注卡片、全局角色库及作品启用清单、预设与配置持久化。只读 Plan index/core/plugin 和本 Record，再读直接相关代码；不重开已冻结产品讨论。

## S2 — 官方插件交互

- Start HEAD: `2043e052f`
- End/Tested HEAD: `27c387300`
- Status: Complete（仅 S2；整个任务仍 Active）
- 实施分支: `feat/novelai-illustration`，沿用独立产品 worktree

### Decisions

沿用已批准边界，未读取或复制 reference 代码，未扩大到 S3/S4。按 Plan 使用本地 ui-ux-pro-max 与 playwright-cli。产品和 docs 的提交只包含当前任务；main 的 AGENTS.md、docs 的 README/WEB-PERSISTENT-PROMPT/templates 原有改动保留。

### Completed

- 在现有 Native 扩展运行时中注册随产品分发的 `atri_official_illustration`，默认关闭，可在 Extensions → Plugins → 官方插件独立启停；配置不可用不会阻止其它扩展激活。
- 扩展 SDK 增加 Session 呈现快照、准确选文、选择模式、surface 通知、配置 CAS 和四项标注操作。资源、事件、高亮、观察器随实例清理；过期 SDK/排队请求被拒绝，迟到结果不会替换另一 Session/分支的呈现状态。
- Host 注册 canonical prose surface；正文/生图模式共用正文，读取桌面框选和手机原生 Selection 的 selectionchange/pointerup/键盘事件，跨相邻段落形成一次标注，跨消息选文拒绝。CSS Custom Highlight 保留正文节点。
- 临时生成文本或任意文本绑定不成为正式标注 surface。停用插件仍由 Host 呈现已有图片。
- 单标注卡片支持选文、角色手动增删、固定外观快照、可覆盖默认服装、动态描述、场景/构图、直接编辑提示词、独立参数及历史版本选择/隐藏。删除标注保留图片历史。生成提示词/生成图片为两个独立且暂不可用的按钮，无全局批量入口。
- 可选 `annotation.draft` 及 updateAnnotation 沿用 SessionRepo 的版本化呈现记录、写锁和 CAS，正文与剧情 authority 不变；卡片随原有存档/导入/恢复闭包保存，配置变化不覆盖已编辑的提示词。编辑/删除/展示操作捕获原 branchId；
- 全局角色库含姓名、别名、固定提示词、默认服装、启用与可选剧情角色关联；作品单独选择角色。仅匹配选文中的启用角色，处理 Latin 单词边界/CJK、大小写别名和同名歧义，代词可手动补充。
- 风格词/质量词、负面词、NovelAI 参数支持全局默认、作品覆盖和单标注冻结覆盖；图片连接与提示词模型路线分别引用现有 Runtime 配置，整理模板可编辑并恢复官方默认。
- 卡片/配置采用 Atria 主题、可见字段标签、44px 按钮、稳定图片尺寸及 safe-area；工具条按实际高度避让卡片，Managed Play 的 Host 提供 composer 边界以避让正文输入。
- 产品提交已推送 origin/feat/novelai-illustration；本阶段停止，不合并 main。

### Known limitations

- 提示词生成与图片生成按钮目前明确不可用，S3/S4 才执行模型及 NovelAI 请求；当前支持直接编辑保存提示词与配置。
- Custom Highlight/Shadow selection 使用浏览器能力检测；本阶段实际浏览器证据为本地 Chrome。
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

没有读取 reference。沿现有 NativeGenerationHost、RouteResolver、GenerationService、PromptCompiler、密钥边界、NativeTaskScheduler 与呈现存储实施，不建立独立模型/任务/配置 authority。按 Plan 使用本地 ui-ux-pro-max 指导状态、取消、编辑保护及预览；

上下文必须对应选中回复的正文边界，而非创建标注时已经前进的 HEAD。新标注在服务器创建时冻结相关历史上下文，保持 resume 导出裁剪剧情历史后的可用性；这一可选呈现字段不会变更剧情。公开 load/restore/rewind 权限没有放宽。

### Completed

- 正式增加 `role.illustration_prompt` 用途，Runtime 可创建对应模型路线；官方插件只列出该用途的路线，作品选择优先于全局选择。模型、连接、路线和准确 Prompt/Generation 资源随任务捕获，排队后修改配置不改变已提交请求。
- 标注创建只冻结资料，不请求模型。主体保留完整选文；所在及相邻段落、之前两个完整对话轮次和既有 context compiler 选出的相关知识/场景事实来自准确源文边界。Information/Perspective 权限继续约束可进入模型的历史与事实，不扫描整个角色/知识目录，也不纳入后续剧情、兄弟分支或未选回复。
- 使用实际 Provider token counting 计入准确 Prompt modules 与输出预留，辅助内容目标约 4000 tokens；先移除整个背景条目，再移除完整轮次/段落，记录省略项。主体与所选角色不会被静默截断；容量不足明确失败且不进入 Provider send。
- 严格解析场景/构图、给定角色动态描述与可选剧情服装的 JSON 输出，拒绝额外角色/固定外观字段。程序组合冻结的风格、质量、固定外观、服装和动态描述；明确剧情服装覆盖默认服装，null 保留已选服装，负面词/NovelAI 参数保持独立。
- 每次成功生成保存独立 `prmv_*` 版本，包含完整 draft、实际 RequestContextPlan/PromptIR、准确模型路线及非秘密 effective config、模板和配置 revision。
- 同一 Session/分支/标注只有一个进行中的提示词任务。HTTP 返回 202，现有服务器调度器持有执行；浏览器关闭或插件卸载不自动取消，重新启用/打开历史可重新订阅。原分支结果不受当前 HEAD 或当前读者分支变化影响。
- 取消及删除标注阻止迟到提示词进入已删除位置；失败仅重试提示词步骤，不调用图片后端。客户端保留未保存编辑，并串行刷新呈现，拒绝另一 Session/分支任务的结果。
- 单卡片启用独立“生成提示词”，提供排队/执行/失败/完成反馈与取消；“生成图片”继续明确不可用。支持直接填写、按分块组合、完整最终图片输入预览、提示词历史载入与证据查看，以及显式应用最新角色/预设。自动配置更新不覆盖当前提示词，无全局批量入口。
- 产品提交已推送 origin/feat/novelai-illustration；本阶段停止，不合并 main，不执行 S4。

### Known limitations

- 图片生成与 NovelAI 官方/第三方兼容接口、图片任务和取消/历史集成留 S4；当前不会执行图片请求。
- 任务投影沿既有服务器内存调度器，仅承诺服务器存活时不受浏览器关闭影响，不承诺服务器重启后续跑。
- S2 或更早的 head-only resume 若已丢失原文历史且没有冻结绘图上下文，不以当前场景冒充原始场景；这类旧标注继续支持直接填写提示词。新 S3 标注及其上下文随存档闭包保存。
- 实际模型能否稳定返回规定 JSON 尚无外部 Provider 证据；不正确输出作为本步骤失败处理，可单独重试。

### Next checkpoint

S3 完成后停止。用户续接时进入 S4：读 Git → live HANDOFF → Plan index/core/plugin/generation/novelai → 本 Record，沿用同一分支实施 NovelAI 两类接口、独立图片任务/取消、图片历史与最终集成。

## S4 — NovelAI 与最终集成

- Start HEAD: `e39b10f9d`
- End/Tested HEAD: `8cb5be336`（主实现 `c662e7d0a`，官方协议中转配置 `8cb5be336`）
- Status: Complete；
- 实施分支: `feat/novelai-illustration`，沿用独立产品 worktree

### Decisions

按真实 Git → live HANDOFF → Plan index/core/plugin/generation/novelai → 本 Record 续接。main 的 AGENTS.md 与 docs 的治理/模板 dirty changes 保留；没有读取 reference。按 Plan 使用本地 ui-ux-pro-max 指导异步按钮、状态、取消、错误反馈、编辑保留及能力表单。

当前官方适配范围为 V3/V4/V4.5，未声称支持所有官方型号或执行过官方真实请求。第三方中转路线透传官方 NovelAI 协议，提供“采用官方协议透传配置”快捷入口。中转连接仍显式保存模型/参数能力与响应格式；若中转改写响应或限制模型/参数，可按其说明调整，不自动假设所有中转完全相同。未提供/使用实际站点地址与密钥，本地兼容证据不等于真实中转请求证据。

### Completed

- 在现有 Runtime ConnectionProfile 中增加 NovelAI 官方图片与第三方兼容图片两类适配，独立保存连接，沿现有密钥系统选择精确 Secret ID。官方地址固定；第三方完整接口地址、模型 ID、角色 caption、SM、采样器、噪声调度、尺寸/步数上限及 ZIP/JSON/PNG 响应由显式能力声明约束。图片连接不会进入文本模型连接选择；没有建立平行配置/密钥 authority。
- 直接手填完整提示词原样发送；分块组合内容在支持的 V4 模型上拆为共用场景与逐角色固定/服装/动态 caption，V3 发送完整组合。图片步骤不再调用 LLM，也不会提交其它草稿。
- 图片任务复用 NativeTaskScheduler、连接/provider 资源限制、服务器持有执行、独立去重/状态/取消。冻结提交时的连接、精确 Secret、提示词、参数与实际随机 seed；排队后的配置变更不影响请求。Run 状态和备份只读写闸继续有效，不占用剧情生成次数，不推进正文/Timeline。
- 返回图片经过有界读取、ZIP 条目/解压上限、严格 base64、PNG CRC 与实际像素解码，拒绝错误协议、损坏图片、超限或多图响应。HTTP 错误/限流没有隐式重发，只有用户明确重试图片步骤才发新请求；不回显 Provider 原始错误/密钥。PNG 解码显式依赖已存在锁版本的 pngjs，不修改公共依赖安装或重建 native modules。
- 结果经现有 AssetStore 与 IllustrationService 登记原 Session/分支/标注的新图片版本。保存实际尺寸、完整 draft、实际请求 body、模型、能力声明、连接 ID/名称/fingerprint 和非秘密参数；可选 requestSnapshot 沿原有呈现/存档闭包进入存储。拒绝跨 Session/源文归属、请求证据篡改与秘密字段，旧图片记录保持兼容。
- 删除标注后到达的图片可进入该标注历史，不能恢复已删除位置；用户取消后迟到响应不产生资产/图片记录。图片登记失败清除仅此次新建的资产引用；旧版本/存档引用保护继续有效。重生成保留完整历史，用户选择一个展示版本或隐藏。
- 卡片启用独立生成图片按钮，保留提示词独立状态；图片任务提供排队/执行/保存/失败/取消反馈。提交后可继续编辑/阅读，未保存编辑保留；关闭 UI 只释放订阅，不取消服务器任务，重新启用恢复订阅。最终输入预览可按已选择连接显示实际协议组织方式，图片历史可查看请求快照和实际 seed。

### Final integration and limitations

- S1–S4 产品提交均在 `main`，最终产品 HEAD `8cb5be336`。产品与最终 docs 记录推送 origin；任务分支及独立任务 worktree 清理，live HANDOFF 删除。main 的 AGENTS.md 与 docs 治理/模板无关 dirty changes 保留。
- 真实官方/中转请求仍未执行；用户实际使用时需在 Runtime 创建精确 Secret、第三方兼容图片连接和完整生成地址，选择官方透传配置或显式调整能力，并在插图配置选中该连接。
- 服务器内存任务不承诺服务器重启续跑。当前官方适配范围之外的型号/中转改写协议仍需针对其能力做明确适配；手机长按/拖柄/WebView/虚拟键盘/真机限制沿用 S2。
