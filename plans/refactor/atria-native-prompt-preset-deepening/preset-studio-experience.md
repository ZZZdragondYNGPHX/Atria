# D8 讨论草案：Native Preset Studio / Play 编辑、Prompt Preview / Diff、质量诊断与跨端 UX

> **D8 OPEN（2026-10-15）**。D1=B、D2=J2+F2+R3、D3=E2+A2+K2+G1、D4=B2+I2+C2、D5=S2+L2+D2+K2+T2、D6=U2+E2+H2+V2、D7=Q2+F2+O2+P2 均已冻结。本模块仅记录第八轮**尚待选择**的 UI/交互设计方案及技术边界；没有进行任何产品代码/UI/浏览器/真机验证，也不独立创建第二 Prompt/Run/Quality Authority。

## 1. 真实产品界面基线（静态阅读，不是完整 UI E2E）

| 当前入口 | 已有能力（`main@5eb3bc765...`） | 本轮可深化，不能凭草案宣称现有 |
| --- | --- | --- |
| `public/scripts/native/prompt-authoring.js` | 可编辑 `core.prompt-program/module/generation-profile`、模块 target/stages、条件/参数/derive；Library 创建 exact revisions，Project 变更经 ChangeSet/Review/Apply；Project/Package 资源权限区分 | 将 D2 F2、D3 E2 表达分层、D4 B2 Program Node binding、D5 trust/Provider diagnostics 显示为可理解的正式授权操作；新 UI 尚未存在 |
| `public/scripts/native/prompt-presets.js` | Native Preset 类别/资源管理、保存版本、预设导入导出、Library 资源引用 | 保留单一原生资源版本；不能再做 ST 风格 depth/order/attach 的兼容界面或第二文件模型 |
| `src/native/model-prompt-runtime/README.md` | Play Prompt Choices/Runtime Diagnostics 的 Route-owned typed 参数覆盖；原 `POST /preview` 只对已受信 exact refs 做纯编译/渲染/预算验证；`/execute` 拒绝未经授权的预览覆盖 | **不能**把未保存 Draft 的任意 Browser JSON 当成 Host 可执行的正式 Program；Preview 与真实 Node Program/Route 执行的等价性仍需未来 E0 |
| V3 [D8 Graph / Inspector 设计](../atria-native-orchestration-v3/graph-editor-experience.md) | 已冻结 Desktop Palette/Canvas/Inspector、移动 List+Sheet 全功能替代、Run Timeline 默认/Graph 切换、脱敏 HostProjection 与严格审批/收据语义 | 本 Plan 只加 Prompt/创作/评价相关视图，不新增另一个 Graph Editor、独立 Timeline 或顶层 Shell |
| D7 [Quality/Evolution](quality-evolution.md) | 原 QualityProfile / Experience / Evolution 的来源身份与审查/发布流程已定案 | 仅显示受权限保护的证据、成本和候选差异，不建 Browser Judge/Promotion writer |

**五条界面硬约束**：1）D2 F2 结构化 + 完整自由文本并存；2）D4 Node exact Program/Route 与 V3 Plan/Run 真实 Host Authority；3）D5/D6 SemanticIR/Context/Source/Role/Token/Cache/权限解释不能伪造；4）D7 审阅/发布与费用归原服务；5）正式重构零 ST/旧 Workspace 接口/数据兼容，禁止双读双写或隐藏兼容控件。

## 2. W — 工作空间入口与导航：预设属于哪里？

| 选项 | 信息架构 | 评估 |
| --- | --- | --- |
| **W1 独立统一 Prompt 页为主要入口** | Library、Play、Studio 都需要跳到一个大工作台来修改文风与预设 | 有统一列表，但上下文切换多、手机导航负担大；不能因此创建新 Store |
| **W2 现有 Library / Studio / Play 三域原位协作（推荐）** | Library 管 Prompt/Module/Program exact revisions、归属和版本；Studio/Build/Agent Graph 配 Program/Expression/Quality/Eval、Draft/Review/Publish；Play 仅修改获准的 Route-owned Runtime Choices/临时受权创作控制并可看有效值。相同资源可深链往返，所有权与修改范围清晰 | 最贴合原 Shell 和现有 Library/Build/Play/V3 UI，不新建顶级 Runtime/Prompt Authority；必须做好精准来源/覆盖和跨端路由 |
| **W3 所有功能都放入 V3 Graph Canvas** | 文笔、Prompt 源文和质量报告通过 Node Inspector 管理 | 专家可能喜欢，但普通纯文字 RP 玩家不应被迫学习图，违背 Narrative Card 一等体验 |

W2 特别重要：在 Play 改 `promptParameters` 的 Route override 与在 Library/Studio 发布新的 Prompt Program revision 不同，**Play 选择不直接写 Program、World、PlanRevision 或历史 Run**。若涉及对作品/Agent 共享的受权作者修改，必须走原 Library/Project/Plan 的正常 Review/Publish。

## 3. R — 结构化面板与完整自由作者文本如何无损共存？

| 选项 | 交互 | 取舍 |
| --- | --- | --- |
| **R1 编辑模式标签切换** | 结构化设置和完整文本两页/Tab，编辑后切换时显示来源和保存提醒 | 界面最简，但跨视图冲突/原文改动不易即时感知 |
| **R2 同一原生 Draft 的双视图 + 原文无损优先（推荐）** | 基础版使用写作意图、Narrator、Character、Scene、Agent Behavior 的可选面板；专家有完整自由作者指令/样例编辑。桌面可并排，手机为清晰 Tab/Sheet；两者均映射同一 immutable Native Resource 草稿与 exact Rev，显示 typed 字段与 raw 未能结构化部分的 ownership/override/冲突 Diff；不支持无损 round-trip 时保留原文并阻止静默重写 | 符合 D2 F2/J2 与 E2，不重复管理 Prompt 真相；实现需要保证 raw 保全、冲突检测与 Undo/Redo |
| **R3 原文为主、结构化帮助器仅建议** | 主要操作完整 Prompt 模块文本，表单只生成可选择插入的片段，不可暗中覆盖用户原文 | 最大化高级自由，但新手理解入口较弱；仍须保留 F2 的结构化编辑能力 |

R2 的两个视图**不能各自持久化成为两个 Store**。原生 Host 必须明确 author-origin/ModuleRef/override 的最终版本：不能把文学描写强度的选项误认为 Provider 可关闭的限制，也不能把作者自由文本下的“system/role/权限”当真实 Host grant。Module/Program 和 Node 绑定改变时要重新校验 Scene/Actor/Agent 的合法继承。

## 4. P — 有效 Prompt Preview、Source 解剖与候选 Diff

| 选项 | 预览层级 | 取舍 |
| --- | --- | --- |
| **P1 仅展示 authored Module 原文** | 预设原文和简单参数表，缺有效 Stage/Route 与 Provider 差异 | 成本低，但无法解释模型真正收到什么 |
| **P2 Authored → Effective SemanticIR → Provider Wire 的三视图与可验证 Diff（推荐）** | 用户可切换自己的 Raw Authorial Text、选定 Plan/Node/Program/Route/Context 的有效编译块与 provenance、合法渲染后的具体 Provider role/wire 摘要；对比当前/候选的 exact Module/Program/Plan/Route refs、token、警告/硬错、缓存稳定性与 Source/权限摘要。纯静态编译预览不发送模型，真正付费生成必须独立显式授权/预算。 | 可解释 D4/D5/D7 的关键区别；需要真实 Host-only、已验证 Source/Model/Context 的预览端口且严格脱敏，不能拿 Browser 文本当最终 wire |
| **P3 编辑即持续调用模型试读** | 文本每次修改都触发真实模型 + Judge 的即时重写/比较 | 默认额外请求成本高、存在正在编辑但未正式发布/Source stale 的问题，与 G1 稀疏调用冲突，不推荐 |

当前原生 `POST /preview` 接受的是**已受权且 exact 的 committed refs**，不提供 Browser 任意未保存 Draft 的正式执行权。若希望预览未发布草稿，应另在**原 Native Host 内**通过合法 Draft/Plan validation 与临时、不可发送的隔离编译上下文来实现；其物理 API 与合法来源闭包还需 E0 设计，**不能悄悄用生产 `/execute`**。Preview 源文/Tool/Memory 与 Provider wire 只显示当前用户可读的脱敏投影，不能泄露 Secret、NPC 私有 Cognition、Provider opaque reasoning。

## 5. I — 故障、质量、拒答与演化候选的 Inspector

| 选项 | 解释方式 | 取舍 |
| --- | --- | --- |
| **I1 聚合状态与单一分数** | 显示“预设有效/无效”“文学分数”及简短提示 | 快速但难分清 Prompt、Context、Provider、Host、用户偏好 |
| **I2 有来源可跳转的分级质量/故障 Inspector（推荐）** | 单一侧栏/Sheet 根据用户权限分组展示 Compiler hard errors/需要选择/style warnings、实际 Provider 失败/拒答、Source/Role/Grant、QualityProfile 的多维度与 applicable/unknown、显式用户反馈与 Judge 假设、真实 Model/Token/Cache/费用、候选 diff/Review/PlanBinding CAS 状态。按 NodeAttempt/SourceRef 精确跳转；默认只展示关键问题，专家可展开脱敏轨迹 | 与 D5 D2、D7 Q2/F2/O2/P2 和 V3 Inspector/RunProjection 融合；不能通过 Inspector 存取第二套真相 |
| **I3 所有原始 Context/Trace 永久显示** | 永久展开模型上下文、所有角色 Memory 和整个私密日志，供高级用户调试 | 与 U2/Source/DisplayGrant、Secret、审稿模型 opaque state 矛盾，不可作为生产默认 |

I2 特别应清晰区分 **Provider 明确 Block**、**合法文学模型疑似回避**、**未按作者风格生成**、**真正 World/玩家权限错误**与**尚未知**；不能用“破限失败”作为所有问题的统一错误码。质量多个维度不得用一条泛化的“安全合规总分”抵消文学自由，硬权限错误也不能被文笔高分冲销。

## 6. M — Windows/CachyOS Linux / Android Termux 移动体验

| 选项 | 交互风格 | 取舍 |
| --- | --- | --- |
| **M1 桌面多栏为先，移动缩为单栏** | 全部功能仍可到达，但长 Prompt、差异与审批可能过窄 | 改造较少；仍必须满足 V3 完整移动语义编辑与键盘交互 |
| **M2 桌面分栏 + 移动 List/Sheet/Tab 一等编辑（推荐）** | Desktop 沿原 Atria Shell 的 Rail/Focus/Dock/Sheet 与可折叠 Inspector/双栏 diff；Android Termux 浏览器沿 Bottom Nav、List/Detail、Bottom/Full Sheet、原 Android Back Resolver、safe-area/soft-keyboard。移动端可完整 Raw/Structured 编辑、管理模块、查看合法 Preview/Diff、处理 Review/Publish 与错误，且不会被迫使用细小 Graph Canvas | 与 V3 D8 图和 Timeline 的移动设计相容、功能等价，需真机/浏览器键盘与触屏验收 |
| **M3 移动 Canvas 优先，所有编辑置于覆盖弹窗** | 追求图形编辑统一，也支持全功能替代列表 | 可能遮挡长原文/证据阅读、软键盘与退格层级繁复，需更多实测 |

最低保证：真正 Host Run/Plan/Effect/预算/审批不因屏幕尺寸变化；桌面/移动同一 Native API、CAS、Source/Role 权限；无障碍 Label/错误焦点、键盘/屏幕阅读器、触控尺寸、reduced-motion、长列表虚拟化/本地草稿离开保护均是未来验收。Termux 进程停止与关闭网页不同，不能声称具有后台常驻或自动续跑的事实。

## 7. D8 决策与未决工程前置（均 NOT_RUN）

**推荐 W2 + R2 + P2 + I2 + M2，五组全部 OPEN**；D2 F2 已明确**必须同时提供结构化面板与完整自由作者文本**，D8 只能选择它们如何呈现/编辑，不能撤销这一决定。

仍需在后续 E0/正式工程前确定：

1. **受信资源与界面消费闭包**：Library/Studio/Play/Settings/Runtime/Plan/node binding 的真实引用、Route-owned 参数与 Library/Project revision、V3 `plan-prompt` Candidate/PlanBinding 所有权、现有 Preset 与旧 ST/Workspace 真正应删的消费者。
2. **Preview 一致性**：目前 `/preview` 是已提交 exact refs 的纯编译路径；作者未发布 Draft/候选 Preview、有效 PromptIR/Provider publicBody 与最终发送的权限/字节同源仍未设计并验证。权限撤回/切换 Actor/Scene/Branch/Route/Program/Model 应让过期 Preview 无效。
3. **真实未完接口**：D4 Node Program 与 Route `promptProgramRef` 及 `generation_semantic_authority_changed` fallback、D5 `context.fact → contextSlots → system` 信任边界、D6 Source-aware 分支/缓存失效、D7 `source_unready` 与旧 Workspace/Director target 清退/V3 `plan-prompt` 发布全部保持 BLOCKED/NOT_RUN，不得因为画了界面就宣称实现。
4. **真实端侧证明**：Desktop Windows/CachyOS Linux、Android Termux + 浏览器逐功能编辑、预览、差异、错误、审批、后台/断线恢复、性能及 Secret/Actor 私有信息隔离。没有运行 Node/API/Browser/真机，不报 PASS。

用户选定 D8 后，按约定先更新提交**同一 Plan Bundle/唯一 Record**，随后进入 D9/E0 面向真实 V3 HEAD 的引用与接口阻塞审计、实施顺序及开发分支前置 Gate。**本轮仅 docs，不创建实现分支，不修改 main，正式重构不兼容旧 ST/Workspace/API/mode。**
