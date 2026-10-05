# S00–S20 wiring and acceptance ownership

## Responsibility and reading

本表拥有旧入口到新入口、authority、结果和阶段的映射。具体旧字段/动作清单只在 [baseline-inventory.md](baseline-inventory.md) 维护；共有状态见 [states.md](states.md)，新身份语义见 [personas.md](personas.md)。

源码路径相对 `main`，核对基线为 `783bb6fd30729263a97bb69842befcd1d25c1885`。表中“复用”表示实施要求，不表示已接线完成；进入阶段前需核对实际最新 Git 差异。辅助模块存在回调不等于当前挂载处开放该动作。

## Wiring matrix

| ID / 页面 | 新归属与主路径 | 复用入口 / authority | 结果及必须保留的边界 | Stage / 验收 ID |
| --- | --- | --- | --- | --- |
| S00 外壳/搜索 | 五域、全局工具、分组快速搜索 | `public/scripts/atria-shell/{app-shell,navigation-authority,back-resolver,workspace-host,product-search,workspace-leave-guard}.js` | route、确切拥有者/子项定位；部分失败、过期结果和焦点；离开取消保留当前草稿 | A1 / V00 |
| S01 登录/启动/学习 | 条件认证、可重入学习、启动恢复 | `public/login.html`、`public/scripts/atria-entry-startup.js`、`public/scripts/atria-shell/learning-center.js` | 保留服务器开放条件、GitHub/Discord、恢复码；真实超时不是模拟倒计时 | A1 / V01 |
| S02 游玩首页 | 继续优先、最近会话/作品 | `public/scripts/native/play-controls.js` renderLanding | 打开真实 Session/Work；无依赖进入准确恢复 | A2 / V02 |
| S03 正文/输入 | 元数据与正文、悬浮输入、身份入口 | `public/scripts/native/{play-product,play-generation,generation-client}.js`、`public/scripts/native/frontend/conversation.js` | 流式/停止/错误、IME、历史只读；身份关联 S20，不能改旧全局 name1 替代 | A2 + A4 / V03 |
| S04 历史/存档/回合 | 默认收起面板、菜单与上下文动作 | `public/scripts/native/{play-controls,session-history,reply-variants,session-runtime,session-lifecycle}.js` | revision/branch/save、inspect/变体/重试/重输入/分叉按实际挂载能力；身份生命周期关联 S20 | A2 + A4 / V04 |
| S05 存档导入 | Library 完整导入/依赖恢复页 | `public/scripts/native/{save-dependency-recovery,play-controls,library-workspaces}.js` | packageId/packageVersionId/version/contentHash 确切匹配；密码、冲突、依赖重查、恢复目标 | A2 + A4 / V05 |
| S06 作品/详情 | Library 默认分类；详情/会话/确切版本 | `public/scripts/native/{library-workspaces,session-naming,package-permissions,task-binding-ui}.js` | 安装/更新/旧版本启动、命名冲突、作品删除依赖；新会话默认捕获关联 S20 | A2 + A4 / V06 |
| S07 世界/知识 | Library 第二分类内各自列表/详情/编辑 | `public/scripts/native/{package-library-resources,knowledge-entry-browser,knowledge-editor,world-editor,library-revision-editor,library-revision-history,resource-bundle-controls,reference-remediation}.js` | 世界原版只读与知识原版可编辑分别保留；字段/源 JSON、条目排序、修订/闭包/失效修复 | A2，B1 / V07 |
| S08 提示词预设 | Library 第三分类；4 类完整资源编辑 | `public/scripts/native/{prompt-presets,prompt-authoring,prompt-runtime-controls,regex-authoring,prompt-semantics}.js` | program/module/generation/regex 全契约；玩家 Route 参数覆盖区别于作者修订 | A2，B2 / V08 |
| S09 连接 | Runtime 连接页 | `public/scripts/native/runtime-workspace.js` connections | Secret ID 与输入值分离；提供商/图片声明、测试、复制/删除、成功但刷新失败 | A3 / V09 |
| S10 模型/路线/用途 | Runtime 默认用途就绪；模型/路线详情 | `public/scripts/native/{runtime-workspace,runtime-readiness,runtime-route-picker,task-binding-ui}.js` | 全角色/模型发现/tokenizer/能力、备用策略与 exact Prompt/Generation；缺项修复返回原启动 | A3，B2 / V10 |
| S11 检索/编译诊断 | Runtime 检索与编译专页 | `public/scripts/native/{retrieval-workspace,retrieval-picker,runtime-workspace}.js`；`src/native/model-prompt-runtime/` | Embedding/Rerank 完整编辑；compile 不解析 Secret、不发送、不写 Session；上下文预算证据关联 S20 | A3 + A4，B2 / V11 |
| S12 创作 | Build 项目列表与 20 视图；右侧 Inspector/AI 切换 | `public/scripts/native/{studio-workspace,studio-authoring,studio-agent,studio-frontend-editor,studio-preview-ui,source-editor,asset-editor,project-lifecycle}.js` | 原编辑器、Source、Validate/Preview/Simulate/Build；人工 Apply 与 Agent Commit；资源页引用 lifecycle | A3，B1–B4 / V12 |
| S13 编排 | Agents 会话范围下的 Orchestration | `public/scripts/agents/orchestrator/workspace/orchestration/page.js`、`public/scripts/agents/orchestrator/workspace/{host-presets,agent-editing}.js`、`public/scripts/native/agent-settings.js` | spec/loop/agenda/director 专属字段、工人/专家/工具/权限/预算/路线、JSON、绑定/预设操作 | A3，B3 / V13 |
| S14 运行/记忆/诊断 | Agents 默认 Run；Memory/Diagnostics | `public/scripts/agents/orchestrator/workspace/panel.js`、`public/scripts/agents/orchestrator/workspace/{memory,diagnostics}/page.js`、`public/scripts/agents/memory/native-routing-ui.js` | Graph/Timeline/分页、Memory OS 全面、证据/维护、仅当前会话重置、trace replay/live | A3，B3 / V14 |
| S15 Skills/Plugins | 全局扩展管理；会话激活工具另属上下文 | `public/scripts/native/extensions-workspace.js`、`public/scripts/atria-shell/utility-workspaces.js`、`public/scripts/skills/{skill-manager-panel,skill-editor}.js` | 文件树、CRUD/导入、只读/来源、scope/manifest、仓库错误；插件更新后禁用直到明确启用 | A3，B4 / V15 |
| S16 官方插图 | 扩展全局配置、作品覆盖；会话标注/卡片 | `public/scripts/native/{official-illustration,illustration-settings-ui,illustration-surfaces,illustration-renderer}.js` | canonical anchors、角色/分块/模板/参数、Prompt/图片不同 task、版本选择与过期 | A3，B4 / V16 |
| S17 共享/作品界面 | 会话工具、自有界面与独立宿主恢复 | `public/scripts/native/shared-session-ui.js`、`public/scripts/native/frontend/`、`public/scripts/native/experience/ui/{full-host,surfaces,host-surfaces}.js` | 席位/观察者、回合权限/过期、Shadow DOM/字体；Host 入口 capability，身份绑定关联 S20 | A2 + A4 / V17 |
| S18 设置/账户 | 全局工具内原控制器 | `public/scripts/atria-shell/{utility-workspaces,appearance}.js`、`public/scripts/user.js`、`public/scripts/templates/{userProfile,userLanSync,userReset}.html` | font_scale/Custom CSS/语言/Enter 行为；头像、密码、备份同步/重置实际条件；账户画像与 Persona 区分 | A1 + A4 / V18 |
| S19 全局诊断 | 统一入口内 Guided/Startup/Expert | `public/scripts/logging/workspace.js` | 来源与事件、摘要/完整上下文、复制导出失败、当前来源清理；与编译/Trace 分开 | A1 / V19 |
| S20 用户设定 | Library 第四分类；输入区与 Host 身份选择 | D1 personas 契约：新增 Persona kind/服务、protected Session namespace、Context lane；复用现有 Storage/Asset/Session/Context；旧 `public/scripts/personas.js` 仅作为迁移来源 | 稳定 ID/不可变 revision、会话快照、请求 provenance、迁移 ledger、备份闭包、共享席位权限 | A4a/A4b / V20 |

## Resource lifecycle inside Studio

世界/知识/资产“资料库引用”页签保留完整 Attach/Fork/Update/Review detach/Used By。它调用现有引用和项目 lifecycle authority：先展示 exact owner/id/revision 与依赖闭包，确认后由原 ChangeSet 路径提交。Fork 跳到真实独立副本；Used By 链接回实际拥有者和资源位置，不把 package 携带的资源变成可随意编辑的 Library 对象。

移除/更新资源涉及 UI 源码、资产 manifest 或派生引用时，必须仍能检查闭包与编译诊断。A3 已按实际 import/call graph 补齐引用动作处理器及针对性测试映射，见下节与 Record；本表不声称单一按钮已覆盖所有派生类型。

## Remaining capability work

首轮必须识别并实现：现有草稿是否支持新增返回路线、子项搜索来源是否支持部分失败、移动页是否保留完整表面、宿主是否暴露可用恢复动作。控制器缺失就记录具体能力差额，不能默认用原型的内存变量补齐。

A1 已补 navigation authority 的离开 guard、模型草稿标记及真实写入成功回执，并补分来源/owner 搜索结果与重试。S01/S18/S19 继续挂载原控制器；诊断保持 Guided/Startup/Expert、当前来源清理和真实导出服务。实际验证仅覆盖 A1 的变动集合，见同一 Record；控制器内部换页、完整账户条件、真实设备和全部后续域仍按所属阶段验证。

A2 已把安装/导入接到 Library 的 `install` / `import-save` 子路由；WorkspaceHost 通过同一 navigation authority 一次提交域/子路由。列表与详情往返保留各分类查询（当前 controller 生命周期内的 UI 状态，不是持久化资源或跨账户 authority）。最近会话/Library Session 的缺依赖路径复用 exact recovery，安装匹配旧版本保留新版默认。写入回执与打开/读取失败分开，取消/异步过期/重试仍作用于原文件与对象。

S03 平台正文使用 serif，元数据采用原 sans；头像目前为真实显示名的首字回退，Native Actor 没有接入新头像资源 authority。Persona 选择及真实 Persona 头像仍归 A4，不开放第四分类。Native AUTO/显式 send_on_enter、Shift/modifier/IME/229 已接；历史/生成/过期 drawer 的写动作拒绝，已有 Runtime fork/switch/retry 接到历史预览，退出走 Session.close。World/Knowledge/Prompt 全部字段、Source 和 installed original 编辑规则保持；内部 Back 及成功后刷新失败补齐。完整共享权限/自有前端字体矩阵仍待 A4/A5，A2 不声称新增共享协议或模拟持久化。

S20 是确定新增工作。其他域以保留并重组为主；若要新增实体/协议/权限，必须在所属阶段更新本表与 Plan，不能从 UI 文案倒推服务已经存在。

## Acceptance ownership

V00–V20 的验证场景、现有测试入口与未覆盖项在 [validation.md](validation.md)。每行闭环至少有：旧动作清单 → 新入口 → 实际 handler → authority 输出 → 状态证据 → 对应验收。一个页面的截图不能替其他行验收。

## A3 implementation checkpoint

S09–S11 沿用 Runtime 原完整表单/角色/exact refs/Secret/检索/compile；保存回执与内部离开补齐。`workspace-host.js` 与 `task-binding-ui.js` 返回原启动，保留控制器、选择与原 PackageVersionId，返回后重新 preflight，不另建任务或配置存储。

S12 保留 20 个实际 view 与完整编辑器/高级 Source；World/Knowledge/Assets 增加独立引用页签，共用同一原编辑表面。Attach/Fork/Update/Review detach/Used By 通过现有 authoring/graph/ChangeSet：缺失 revision 不改用 latest，Fork 保留原来源并选择新独立资源，Detach 先定位 exact 反向消费者。Asset 仍按不可变 contentHash 契约，不添加无后端支持的 Update。人工 Inspect/Apply 与 Agent Review/Commit 保持独立，提交后读取失败不重放。

S13–S14 默认 Run，Session 范围固定并显示 ID/名称；四模式原专属字段、JSON、工具/权限/预算/路线与 Memory/Diagnostics/trace 原入口保持。Native 合成角色不能成为 Character binding；保留既有 chatKey ABI。Session 切换按正确 workspace key 重挂，Memory reset 重验确认时的 Session/branch/revision。

S15–S16 Skills/Plugins 复用原文件、scope、manifest、偏好和更新禁用行为。扩展与插图的草稿/保存回执补齐；官方插图角色/作品覆盖/模板/参数保留，仅查看作品范围不生成修改。会话工具进入现有外壳工具层，跟随 Play/utility 路由可见性，原 SDK cleanup 与 Prompt/图片 task authority 不变。

这里只记录 A3 实施归属；本地验证证据与限制见 [Record A3](../../../records/refactor/atria-immersive-workspace.md#stage-a3--authoring-runtime-agents-and-extensions)。V09–V16 的局部验证不等同于全字段/全设备/所有 provider 的最终集成验收。


## A4b S20 and associated wiring checkpoint

S20 第四 Library 分类、账户内 exact 搜索/详情、草稿与回执、CRUD/头像/归档/default/Used By 已接 PersonaRepo。S03 输入区打开 solo picker、保持草稿，消息显示接受时快照；S17 自己席位 picker 与独立宿主恢复控制已接，Shared 描述固定停用且无 owner solo 回退。S18 现有账户备份扩展 Persona manifest、来源冲突与默认独立 adoption 审阅。S04 Save v3 仍复用 A4a，未新增 save authority；S06 会话默认捕获保持 A4a exact 路径。

C20.5/6/7/8 的新增本地证据进入同一 Record A4b；不把上述 checkpoint 当作 S00–S20/完整 V20 或真实设备验收。现有入口仅承诺支持范围；Shared 描述/高级 legacy 自动映射明确不提供。下一阶段 A5，不提前进入 B/F。

## B1 Actors checkpoint

S12 Actors 已替换专属常用字段、任意结构/高级提示词与单 Actor Source；空/非空均可达集合 Source。复用原 value editor 草稿、exact actorId 选择、project.save/Workspace/ChangeSet，不新增 Actor Library/Persona/头像 authority。Review 前拒绝顶层 unknown/legacy、重复 ID 和悬空 EntryPoint 引用，冲突可复制草稿再明确放弃重载；服务归一化和有限 graph 限制保持。canonical FS/HTTP/save/build 与 exact Session/Save、本地状态/中文窄屏证据见 [Record B1 display](../../../records/refactor/atria-immersive-workspace.md#stage-b1-actors--display-checkpoint)。Shared 描述停用；S07 World/Knowledge 展示未重构，EntryPoints 映射与展示 checkpoint 已完成，见下节。

## B1 EntryPoints mapping checkpoint

S12 EntryPoints 的 [字段/动作/authority 映射](entrypoints-mapping.md) 已完成；映射时产品仍沿用原通用 editor；展示 checkpoint 的实际结果见下节。canonical 字段/任意高级 JSON、exact Actor/World/Binding、非空集合/项目 revision/人工 Workspace、运行初始状态与消息、第一入口 Preview/Experience/UI 目标已定位。G01–G05 分别记录非空集合 Source 缺失、顶层归一化数据丢失、重复 ID/index 与无入口 graph、冲突恢复仅 Actors 已覆盖、第一入口动作与启动验证差额；N01–N08 为未来替换门，不能记作通过。该映射轮停在 EntryPoints 替换前，Actors 不重做，Shared 描述继续停用。实际最小本地验证见 [Record B1 EntryPoints mapping](../../../records/refactor/atria-immersive-workspace.md#stage-b1-entrypoints--mapping-checkpoint)。

## B1 EntryPoints display checkpoint

S12 EntryPoints 已接入专属字段与完整 Source，空/非空可达集合 Source，exact entryPointId 选择/树高亮与排序保留身份。三类引用和可移除 primary、任意初始 JSON/runtime/高级字段保持原契约；Review 前拒绝 unknown/legacy/重复/悬空引用，冲突保留原文复制和明确丢弃重载。复用原 human Workspace、project.save、receipt 只读重试与独立 Agent；明示 Preview/Experience/UI 第一入口与 Simulation scenario 目标。G01/G04 展示缺口关闭；G02/G03/G05 后端归一化/duplicate/有限 graph/分层启动约束保持，UI 局部防护不扩成后端修复。实际 N01–N08 支持范围见 [Record B1 EntryPoints display](../../../records/refactor/atria-immersive-workspace.md#stage-b1-entrypoints--display-checkpoint)。Shared 描述停用；Worlds/Knowledge/B2/F 尚未开始，完整矩阵未验收。

## B1 Worlds mapping checkpoint

Worlds display 已完成：复用原 editor 草稿与服务，增加专属身份/名称/metadata、无默认改写的递归字段、集合 Source/exact ID 与排序定位、strict/引用/歧义防护、409 复制和确认重载、局部 catalog 失败与 dispose 防护。实际支持范围与限制见 [Worlds display Record](../../../records/refactor/atria-immersive-workspace.md#stage-b1-worlds--display-checkpoint)。用户已授权连续后续 Knowledge/B/F；以下是历史映射描述。

S12/S07 的 [Worlds 字段/动作/authority 映射](worlds-mapping.md) 已完成。项目内 snapshot 仍走 project.save/项目 Git revision/human Workspace；Library root 与 immutable WorldRevision/CAS、installed 原版只读、Session 当前 state 分开。完整 identity/pin/schema/baseline/metadata/两类 refs、集合与 Source、Attach/Fork/Update/Detach/Used By、冲突/离开与三种 Fork 差异已定位。G01–G06 记录非空集合 Source/字段可达、Fields 默认改写、duplicate/index/本地依赖歧义、Worlds 冲突恢复、catalog 整体失败/迟到响应与有限 graph/绑定 pin 边界；N01–N08 为未来替换门，未记作通过。只改文档、不替换展示、不重做 Actors/EntryPoints，Shared 描述继续停用；实际最小本地证据见 [Record B1 Worlds mapping](../../../records/refactor/atria-immersive-workspace.md#stage-b1-worlds--mapping-checkpoint)。本轮按用户要求停止；下一独立 checkpoint 为 Worlds 展示与局部防护，不自动进入 Knowledge/B2/F。
