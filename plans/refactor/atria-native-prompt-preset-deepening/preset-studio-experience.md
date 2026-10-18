# D8 已冻结：Native Preset Studio/Play 功能交互、Prompt Preview/Diff、跨端等价（视觉未冻结）

> **D8 已冻结 W2 + R2 + P2 + I2 + M2（2026-10-15，仅功能与交互语义）**。D1–D7 继续有效。**本助手不对前端视觉审美作最终决定**；待用户完成讨论后组织 Codex 前端功能审计、外部设计 AI 的引导性 HTML 与两个配套文档，经用户多轮讨论后另行定稿。本模块仍仅为设计，无代码/UI/端侧实测。

## 1. 真实产品界面基线（静态阅读，不是完整 UI E2E）

| 当前入口 | 已有能力（`main@5eb3bc765...`） | 本轮可深化，不能凭草案宣称现有 |
| --- | --- | --- |
| `public/scripts/native/prompt-authoring.js` | 可编辑 `core.prompt-program/module/generation-profile`、模块 target/stages、条件/参数/derive；Library 创建 exact revisions，Project 变更经 ChangeSet/Review/Apply；Project/Package 资源权限区分 | 将 D2 F2、D3 E2 表达分层、D4 B2 Program Node binding、D5 trust/Provider diagnostics 显示为可理解的正式授权操作；新 UI 尚未存在 |
| `public/scripts/native/prompt-presets.js` | Library 已有无需创建游戏的 Native Preset 新建、分类/资源编辑、版本保存和导入导出 | 这是独立编辑入口，**不是**无 Session/Project 的完整 Preview/模型试读已具备；不创建第二 Preset/Program Store 或 ST 注入兼容界面 |
| `src/native/model-prompt-runtime/README.md` | Play Prompt Choices/Runtime Diagnostics 的 Route-owned typed 参数覆盖；原 `POST /preview` 只对已受信 exact refs 做纯编译/渲染/预算验证；`/execute` 拒绝未经授权的预览覆盖 | **不能**把未保存 Draft 的任意 Browser JSON 当成 Host 可执行的正式 Program；Preview 与真实 Node Program/Route 执行的等价性仍需未来 E0 |
| V3 [D8 Graph / Inspector 设计](../atria-native-orchestration-v3/graph-editor-experience.md) | 已冻结 Desktop Palette/Canvas/Inspector、移动 List+Sheet 全功能替代、Run Timeline 默认/Graph 切换、脱敏 HostProjection 与严格审批/收据语义 | 本 Plan 只加 Prompt/创作/评价相关视图，不新增另一个 Graph Editor、独立 Timeline 或顶层 Shell |
| D7 [Quality/Evolution](quality-evolution.md) | 原 QualityProfile / Experience / Evolution 的来源身份与审查/发布流程已定案 | 仅显示受权限保护的证据、成本和候选差异，不建 Browser Judge/Promotion writer |
| `core.image-target` / `core.image-rendering`、`illustration-settings-ui.js`、原视觉服务 | 原视觉资源在 Native Library 中版本化；全局和按作品的风格/模板配置可编辑，剧情生成 Prompt、Gallery 与 Media Studio 主要依赖 Session/Branch | 目标增加无游戏的视觉提示词创作/受控试生成/独立资产管理时必须复用 [原生视觉 Plan](../../feat/native-visual-generation-deepening/index.md) 与 ImagePromptIR/Job/Asset 权威，不能宣称当前已完整接通或强行走文本 PromptCompiler |

**五条界面硬约束**：1）D2 F2 结构化 + 完整自由文本并存；2）D4 Node exact Program/Route 与 V3 Plan/Run 真实 Host Authority；3）D5/D6 SemanticIR/Context/Source/Role/Token/Cache/权限解释不能伪造；4）D7 审阅/发布与费用归原服务；5）正式重构零 ST/旧 Workspace 接口/数据兼容，禁止双读双写或隐藏兼容控件。

## 2. W — 工作空间入口与导航：预设属于哪里？

| 选项 | 信息架构 | 评估 |
| --- | --- | --- |
| **W1 独立统一 Prompt 页为主要入口** | Library、Play、Studio 都需要跳到一个大工作台来修改文风与预设 | 有统一列表，但上下文切换多、手机导航负担大；不能因此创建新 Store |
| **W2 现有 Library / Studio / Play 三域原位协作（已选）** | Library 管 Prompt/Module/Program exact revisions、归属和版本；Studio/Build/Agent Graph 配 Program/Expression/Quality/Eval、Draft/Review/Publish；Play 仅修改获准的 Route-owned Runtime Choices/临时受权创作控制并可看有效值。相同资源可深链往返，所有权与修改范围清晰 | 最贴合原 Shell 和现有 Library/Build/Play/V3 UI，不新建顶级 Runtime/Prompt Authority；必须做好精准来源/覆盖和跨端路由 |
| **W3 所有功能都放入 V3 Graph Canvas** | 文笔、Prompt 源文和质量报告通过 Node Inspector 管理 | 专家可能喜欢，但普通纯文字 RP 玩家不应被迫学习图，违背 Narrative Card 一等体验 |

W2 特别重要：在 Play 改 `promptParameters` 的 Route override 与在 Library/Studio 发布新的 Prompt Program revision 不同，**Play 选择不直接写 Program、World、PlanRevision 或历史 Run**。若涉及对作品/Agent 共享的受权作者修改，必须走原 Library/Project/Plan 的正常 Review/Publish。作者侧可以借鉴有序资源树，展示 Program → Stage → Module / 受控语义 Anchor 的**单一原生编排大纲**；Stage 按 Program 显式顺序，合法 target 内的 Module 和 Anchor 按作者明确顺序表达。Anchor 在同一 Program/Stage 内具有稳定身份，不作为可单独下载的世界/记忆资源，也不等同于 Provider Role。树中的 Module/Anchor 可在原 Host 授权下编辑；当前请求实际匹配的 Contribution 是只读、带 Source/Activation/未纳入原因的展开结果，不能被拖动成作者指令。该树只投影原生 Draft/Compiler 权威，并非复制 LoomStudio 的资源表或引入新的编辑/排序存储。跨 target 移动需要有依据的受信校验，不能让 UI 拖动直接改变 Role/Source 权限；现有 `priority` 规则不是未来显式顺序已接通的证据。

**双入口、一套资源的创作闭环（已确定方向）**：独立提示词作者从 Library 的 Preset/Program/Module 进入相同专业编辑器，直接管理原生 exact 修订、导入导出、将来的安全测试和发布，不需要建立游戏、虚构一个 Project 或先绑定可运行角色。游戏作者在 Studio 从现有预设库选择并绑定 exact 版本，按需 Fork/Derive 和 Review/Publish；新游戏使用默认/现成预设应是正常路径，不强制创作提示词。相同资源在两个入口深链跳转，但只归原 Library/Project Authority 管理。Play 只做已有受权临时选择/覆盖，不隐式写回共享预设。

**视觉提示词作者（同等一等，非文本预设子类型）**：在现有 Library/资源入口提供 Image Target、Rendering 风格、正负面词和模板的独立创作入口；可在合法版本与原视觉链中复用到作品、会话和媒体任务。独立图像试生成与 Gallery 必须先由原视觉 Job/Asset/预算/审批权威定义**非 Session 资产与任务归属**，不能借现有 Session Gallery 或文本 Prompt `/execute` 伪装完成。该入口是 UI 工作空间而非新的顶层域、Compiler 或第二份视觉资产库；组件与编辑/版本语义可复用，ImagePromptIR/Provider 适配仍独立。具体菜单标签、工作区造型/导航细节继续作为视觉讨论输入。

## 3. R — 结构化面板与完整自由作者文本如何无损共存？

| 选项 | 交互 | 取舍 |
| --- | --- | --- |
| **R1 编辑模式标签切换** | 结构化设置和完整文本两页/Tab，编辑后切换时显示来源和保存提醒 | 界面最简，但跨视图冲突/原文改动不易即时感知 |
| **R2 同一原生 Draft 的双视图 + 原文无损优先（已选）** | 基础版使用写作意图、Narrator、Character、Scene、Agent Behavior 的可选面板；专家有完整自由作者指令/样例编辑。桌面可并排，手机为清晰 Tab/Sheet；两者均映射同一 immutable Native Resource 草稿与 exact Rev，显示 typed 字段与 raw 未能结构化部分的 ownership/override/冲突 Diff；不支持无损 round-trip 时保留原文并阻止静默重写 | 符合 D2 F2/J2 与 E2，不重复管理 Prompt 真相；实现需要保证 raw 保全、冲突检测与 Undo/Redo |
| **R3 原文为主、结构化帮助器仅建议** | 主要操作完整 Prompt 模块文本，表单只生成可选择插入的片段，不可暗中覆盖用户原文 | 最大化高级自由，但新手理解入口较弱；仍须保留 F2 的结构化编辑能力 |

R2 的两个视图**不能各自持久化成为两个 Store**。原生 Host 必须明确 author-origin/ModuleRef/override 的最终版本：不能把文学描写强度的选项误认为 Provider 可关闭的限制，也不能把作者自由文本下的“system/role/权限”当真实 Host grant。Module/Program 和 Node 绑定改变时要重新校验 Scene/Actor/Agent 的合法继承。独立来源贡献与宿主正文内联变量在交互中应有不同标识：前者可查看来源/启停/有效位置，后者仍在原 Module 文本中编辑；二者不因 UI 分组而变成两份底层资源。移动、上移/下移和键盘操作均应产生同一 Authoring Draft 变更，预览必须由 Host 返回实际有效顺序；继承树显示父级 exact revision 与子级差异：继承、替换、禁用、配置修改及新增标记必须可区分；在同 target 指定位置新增，插入点缺失/父级变化时保留草稿并要求显式处理，不静默移动至尾部或自动追随最新父版。动态 Contribution 的受权选择、版本快照仍以 Host 返回的受限证据为准；Anchor Inspector 可以解释匹配类别、必需性、稳定来源排序、重复/未授权/过期诊断，但不复制原始私密数据。具体 UI 字段和物理 Schema 待实现审查。

## 4. P — 有效 Prompt Preview、Source 解剖与候选 Diff

| 选项 | 预览层级 | 取舍 |
| --- | --- | --- |
| **P1 仅展示 authored Module 原文** | 预设原文和简单参数表，缺有效 Stage/Route 与 Provider 差异 | 成本低，但无法解释模型真正收到什么 |
| **P2 Authored → Effective SemanticIR → Provider Wire 的三视图与可验证 Diff（已选）** | 用户可切换自己的 Raw Authorial Text、选定 Plan/Node/Program/Route/Context 的有效编译块与 provenance、合法渲染后的具体 Provider role/wire 摘要；对比当前/候选的 exact Module/Program/Plan/Route refs、token、警告/硬错、缓存稳定性与 Source/权限摘要。纯静态编译预览不发送模型，真正付费生成必须独立显式授权/预算。 | 可解释 D4/D5/D7 的关键区别；需要真实 Host-only、已验证 Source/Model/Context 的预览端口且严格脱敏，不能拿 Browser 文本当最终 wire |
| **P3 编辑即持续调用模型试读** | 文本每次修改都触发真实模型 + Judge 的即时重写/比较 | 默认额外请求成本高、存在正在编辑但未正式发布/Source stale 的问题，与 G1 稀疏调用冲突，不推荐 |

以上为 2026-10-15 的静态预览基线；后续后端已有实施增量，实际可用接口以原 Native Host 与同一 Record 的新证据为准。**独立预设编辑目前不等于无 Session/Project 的完整 Preview**；其未来独立测试应使用 Host 定义的有界作者 fixture 与脱敏权限，不借游戏伪造身份；付费试读需单独显式许可、额度与原 Provider/Compute 记录。未发布 Draft 只能在 Host 内使用合法、不可发送的受权编译路径，不能用生产 `/execute` 冒充预览。三层视图应按需解释 Module 纳入/排除的原因、有效位置、来源版本与实际 Provider 降级；需要标记“静态 exact 编排”和“本请求 Source/Branch/Actor/Grant 快照”不同生命周期，并准确显示 source-stale、条件不满足与缺失但非必需来源。Preview 源文/Tool/Memory 与 Provider wire 只显示当前用户可读的脱敏投影，不能泄露 Secret、NPC 私有 Cognition、Provider opaque reasoning。

**三层 Preview/Trace 读法（功能语义已确定，非现成功能声明）**：Authored 以完整作者原文、显式顺序、exact Module/Program/Draft 为权威；Effective 使用同一次 Host 编译中的 Stage/Module/Anchor 决策与已获准的 Context Contribution，展示真实纳入、条件未命中、去重、缺失、当前性及合法目标位置；Provider Wire 来自实际 Adapter 渲染和计数，仅提供本人受权且去 Secret/私有认知的消息结构、Role、Tools、Output Schema、Token 与降级依据。Preview 要明确标注 `sent:false`，不能代替运行成本、最终响应或用户审稿。

**Trace 和 Diff 不建第二真相**：可展开真实编译决策、模块来源、Anchor、受权来源和可披露的排除原因；未知/受限不能被渲染成“有某份私密记忆但不可读”。没有真实 Pass/Source 证据时不显示伪 Trace 或回放。按需比较当前与候选 Authored、Effective、Wire；只有 exact Program、Source/Actor/Branch/Grant、Route/Model、Compiler 和 Provider 能力一致时才可将有效差异归因于 Prompt 修改；若环境变更，明确分开列示，不把估计 Token 当精确真实费用。编辑、轻量验证、编译 Preview、真实付费试读与正式 Review/Publish 是不同操作，不能在键入时自动运行。

**独立作者测试闭环**：Library 作者不用创建游戏即可编辑及准备有界测试样例；无 Session/Project 的 Effective/Wire 测试必须由 Native Host 正式提供受权 fixture、来源声明与真实 Route/Provider 适配，样例只是测试数据而非正式 World/Memory/Actor Truth。先执行无发送 Preview；用户单独选择 Route、确认 Token/经济预算和可能的跨 Provider 数据发送后才可进行付费试读。模型输出是样例结果，非默认 Quality PASS；有来源的 Quality/Eval 和候选审阅仍归 D7 原系统。视觉作者通过独立 ImagePromptIR/Target/Rendering 的 Preview 与原 Visual Job/Asset 费用批准实现对应闭环，不得伪造一个 Session 来使用现有剧情 Gallery。

## 5. I — 故障、质量、拒答与演化候选的 Inspector

| 选项 | 解释方式 | 取舍 |
| --- | --- | --- |
| **I1 聚合状态与单一分数** | 显示“预设有效/无效”“文学分数”及简短提示 | 快速但难分清 Prompt、Context、Provider、Host、用户偏好 |
| **I2 有来源可跳转的分级质量/故障 Inspector（已选）** | 单一侧栏/Sheet 根据用户权限分组展示 Compiler hard errors/需要选择/style warnings、实际 Provider 失败/拒答、Source/Role/Grant、QualityProfile 的多维度与 applicable/unknown、显式用户反馈与 Judge 假设、真实 Model/Token/Cache/费用、候选 diff/Review/PlanBinding CAS 状态。按 NodeAttempt/SourceRef 精确跳转；默认只展示关键问题，专家可展开脱敏轨迹 | 与 D5 D2、D7 Q2/F2/O2/P2 和 V3 Inspector/RunProjection 融合；不能通过 Inspector 存取第二套真相 |
| **I3 所有原始 Context/Trace 永久显示** | 永久展开模型上下文、所有角色 Memory 和整个私密日志，供高级用户调试 | 与 U2/Source/DisplayGrant、Secret、审稿模型 opaque state 矛盾，不可作为生产默认 |

I2 特别应清晰区分 **Provider 明确 Block**、**合法文学模型疑似回避**、**未按作者风格生成**、**真正 World/玩家权限错误**与**尚未知**；不能用“破限失败”作为所有问题的统一错误码。质量多个维度不得用一条泛化的“安全合规总分”抵消文学自由，硬权限错误也不能被文笔高分冲销。**渐进式解释**：普通创作默认聚焦正文、资源状态和必要提醒；来源/激活/Token/Trace/精确 Diff 由用户主动展开或在真实错误时引导，不常驻完整调试台，也不能以示例数据假装 Trace 已实现。默认只有原文、当前有效状态和必要提醒；作者主动选择查看来源/差异或实际 hard error/needs-author-choice 才展开对应 Inspector。敏感和不确定结果显示受限/未知而非空内容或推测，手机通过 Tab/Sheet 可完成相同操作。

## 6. M — Windows/CachyOS Linux / Android Termux 移动体验

| 选项 | 交互风格 | 取舍 |
| --- | --- | --- |
| **M1 桌面多栏为先，移动缩为单栏** | 全部功能仍可到达，但长 Prompt、差异与审批可能过窄 | 改造较少；仍必须满足 V3 完整移动语义编辑与键盘交互 |
| **M2 桌面分栏 + 移动 List/Sheet/Tab 一等编辑（已选）** | Desktop 沿原 Atria Shell 的 Rail/Focus/Dock/Sheet 与可折叠 Inspector/双栏 diff；Android Termux 浏览器沿 Bottom Nav、List/Detail、Bottom/Full Sheet、原 Android Back Resolver、safe-area/soft-keyboard。移动端可完整 Raw/Structured 编辑、管理模块、查看合法 Preview/Diff、处理 Review/Publish 与错误，且不会被迫使用细小 Graph Canvas | 与 V3 D8 图和 Timeline 的移动设计相容、功能等价，需真机/浏览器键盘与触屏验收 |
| **M3 移动 Canvas 优先，所有编辑置于覆盖弹窗** | 追求图形编辑统一，也支持全功能替代列表 | 可能遮挡长原文/证据阅读、软键盘与退格层级繁复，需更多实测 |

最低保证：真正 Host Run/Plan/Effect/预算/审批不因屏幕尺寸变化；桌面/移动同一 Native API、CAS、Source/Role 权限；无障碍 Label/错误焦点、键盘/屏幕阅读器、触控尺寸、reduced-motion、长列表虚拟化/本地草稿离开保护均是未来验收。Termux 进程停止与关闭网页不同，不能声称具有后台常驻或自动续跑的事实。

## 7. D8 冻结边界及用户视觉主导权

D8 冻结 **W2 + R2 + P2 + I2 + M2** 的 Native 信息架构、受信交互和三端可达性，并**不冻结视觉风格、美术方案、组件造型、颜色、字体、视觉稿、HTML 样式或具体版式**。这项边界来自用户的明确要求：不依据本助手的审美选择新的前端设计。Serene Canvas 与 V3 图界面的现有视觉文件只作为已存在的代码和历史方案依赖，不自动视为本轮用户批准的新前端视觉基线；任何视觉变更等到外部设计参考和用户多轮确定后再讨论。

### W2：三域原生资源、交互与权限归属

Library 管精确版本化 Program/Module/Generation Resource、Preset 的独立创建/导入导出和引用；提示词作者无需游戏即可开始。Studio/Build/V3 Authoring 管作品、Agent、Preview、Review/Publish，可直接消费现有 Preset/Program exact 引用、Fork/Derive 而不强迫游戏作者自行编写；Play 管受权玩家的 RuntimeRoute Prompt choices、当前有效创作控制与脱敏 Inspector。视觉创作可经独立 Library 工作空间复用原 Image Target/Rendering/Visual Job，并在作品上下文下引用或覆盖；目标不等于独立无 Session 试生成已实现。不能重建第二 Preset/Run Store、Browser Writer 或旧 ST 注入/Workspace 兼容界面。

### R2：同一正式 Draft 的结构化与自由文本无损编辑

两种编辑视图必须操作同一 Native Revision/Draft；高级作者完整指令、正反例、作用域和原文可无损读写。无法自动解析回结构化字段的片段应保留原文字节并解释冲突，绝不静默删改；Undo/Redo、Dirty/Leave、CAS、来源、版本 Diff 与人类 Review 可恢复。Prompt 中自称 system/developer/权限不能成为正式 Grant。

### P2：Authored / Effective / Provider Wire 与精确 Diff

展示作者原稿、Host 可信 Compiler 选择的 effective PromptIR/来源/Node/Route/Context，以及实际 Provider Adapter 可支持的脱敏 Role/Tools/Schema/Token/Wire。必须比较 exact revision、已授权 source、grant/branch/actor/route/model/Compiler 和条件决策；只读静态预览不是生产发送/正式 Plan 发布。现有 /preview 只支持已提交且受信 exact refs；此前未发布 Draft Preview 的无发送 Host 内部编译接口尚属基线缺口，最新可用状态必须检查实际 Host/分支；不允许 Client 任意覆盖 `/execute`。新增来源 Trace 与精确 Diff 必须由真实 Host 证据提供，并把独立作者 fixture 预览、按需付费试读、正式发布明确区分。

### I2：来源级故障和质量 Inspector

复用原 Compiler、Context/Provider、V3 RunProjection、Experience/Eval/Evolution 的确切证据。分别显示 hard-invalid、needs-author-choice、soft-style-warning、Provider 明确 Block、疑似过度拒答、文学/Agent 多维质量、实际 Token/Cost、Candidate Review/CAS 状态和 unknown；严格受众脱敏，不能泄露私有 Cognition、Secret、Opaque Reasoning 或把 Judge 推断当作 Host Fact。无来源/未查询项不可宣称必然存在；Trace、质量推测与确定性编译证据分开展示。

### M2：三端功能等价与交互可达性

Windows/CachyOS Linux 与 Android Termux 浏览器必须完整支持原作者或玩家授权的创建/编辑、Raw/Structured、合法 Preview/Diff、资源/版本导航、诊断/Review/Publish、焦点/键盘/触控/Back/软键盘和长文本操作。桌面分栏、手机 List/Sheet/Tab 只是**功能可达的交互方向**，具体视觉布局、比例与外观不在本轮做设计承诺；移动不能成为只读版。Run/Approval/费用仍由同一个 Native Host 和原业务回执负责。

## 8. 前端审美资料与审批边界

以下是用户约定的资料形成路径。相关全前端审计及外部 HTML、功能表现文档、前端指导文档已于 2026-10-16 收到，但尚未成为用户批准的最终视觉设计：
1. **全面审计真实前端代码**，按 Screen/Route/Surface/Buttons/States/Permissions/Actions/Interaction 提取必需功能、控件、状态与依赖；明确哪些功能一定要保留、哪些旧模式应清退。功能盘点是后来视觉设计 AI 的信息输入，不能用部分示例 HTML 代替完整需求。
2. 将清单交给用户选择的、真正具有前端审美能力的设计 AI，制作**精致但不要求覆盖全部功能的 HTML 视觉参考页**；其目的只是引导审美，不是可直接替换的产品前端或自动授权的运行代码。
3. 同时要求该设计 AI 给出**逐功能界面/交互表现说明文档**与**整体前端设计指导文档**，覆盖真实所有 Surface/状态的适配方向，而不是从 HTML 缺失的功能推断它可以删除。
4. 用户把 HTML 与两份文档交回，继续与 AI 多轮讨论，协调功能闭包、当前设计系统依赖、权限/Source/Provider/V3 单 Host 和真实桌面/移动能力，之后由用户单独批准最终的前端审美/实现企划。

上述材料是设计输入，**尚未完成最终审美批准或产品/端侧验收**。本 Plan 不擅自冻结配色、字体、组件风格、阴影、动画或视觉稿；UI 的无障碍、功能和安全合同仍须保留，外部审美参考不得赋予新的执行权限或删除真实功能。

## 9. 真实阻塞与 D9/E0 下一步（NOT_RUN）

- **D4** Node Prompt Program 与 Route.promptProgramRef / generation_semantic_authority_changed fallback 的受信连接未完成；**D5** context.fact → contextSlots → system Role 信任边界未实测；**D6** Source/Actor/Branch/Grant 与长会话压缩和失效未实测。
- **D7** requirePilotSources 的 source_unready、旧 Workspace/Director Evolution/Settings 消费者未清退，V3 plan-prompt / PlanRevision / PlanBinding CAS 真正运行链未验收；**D8** 未发布 Draft Preview、Authored/Effective/Wire 真实同源 Diff 和三端 UI 还没有功能验收。
- Browser/Node/API/CI/Provider/Windows/CachyOS Linux/Android Termux 真实验证均 NOT_RUN。D8 只是功能交互语义选择，D9/E0 静态消费者审查见 [e0-audit.md](e0-audit.md)；**E0 收口前不创建实现分支、不修改 main**。正式硬切零 ST/旧 Workspace/API 兼容。
