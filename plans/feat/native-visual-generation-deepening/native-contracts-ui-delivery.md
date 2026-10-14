# Native Image API / 数据契约 / 跨平台 UI / 分阶段交付 — D-013（Round 13 C）

- Task: `atria-native-visual-generation-deepening`
- **Status: D-013 冻结设计。** 本文的代码锚点和候选实施分支描述记录 E0 当时的基线；S0～S6 后续实际实现、验证及未运行的 Provider L3/设备证据以 [Record](../../../records/feat/native-visual-generation-deepening.md) 为准。
- Frozen prerequisites: [decisions.md](decisions.md) D-001～D-013，尤其 D-003 ImagePromptIR+Adapter、D-004 Connection/Target/Rendering 三层配置、D-007/D-008 Durable Job/Budget、D-009～D-011 Media Studio/Mask/Save/GC、D-012 Target 三态/typed degrade/L1-L2-L3。以这些决策为规范，不重新表决。
- Baseline: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`（仅 GitHub 静态源码审计；未跑 UI、FS/SQLite、跨平台或真实模型）。
- Historical implementation branch proposal at E0: `feat/native-visual-generation-deepening`；后续已建立、完成并集成到 main。

## 1. 当前代码锚点和必须消除的重复权威

- `src/native/illustration-image-service.js` 当前直接绑定 `createNovelaiImageProvider()` 与 `renderNovelaiIllustration()`，内存 Scheduler 负责交互执行；并不是多后端和完整 Durable Job Ledger。
- `public/shared/native-illustration-contract.js` 的 ImageRequestSnapshot 还以 NovelAI 编译器回算校验，不是 D-003 要求的中立证据。
- `public/shared/illustration-plugin-contract.js` settings `schemaVersion:1` 目前把 `imageConnectionId`、`promptRouteId`、全局/作品预设和 NovelAI steps/scale/sampler 并列。正式实现应将 Image Connection/Target/Rendering 与视觉身份、选择策略和 Provider 原生参数职责分离。
- `public/scripts/native/runtime-workspace.js` 的 Connections 已具备端点、Secret、LLM Profiles/Routes 编辑基础，但图片适配器选择与说明主要偏 NovelAI；`public/scripts/native/illustration-settings-ui.js` 则面向作品和图片连接，尚无统一 Target/Workflow/Rendering、预算/Mask/Gallery 的完整 UX。
- `src/endpoints/native-session.js` 的 `/illustrations/read` 与 `/illustrations/{command}` 负责分支标注/选中 ImageVersion；`src/endpoints/native-generation.js` 的 `/configuration`、`/resources`、`/configuration/:kind` / image job 接口已有 Native 请求/授权惯例。新 Native API 应围绕现有 Native 权威组织，不把旧 SillyTavern 扩展路由作为另一套正式图像系统。
- `src/native/model-prompt-runtime/contracts.js` 已有 supported/unsupported/unknown 与 provenance 的事实验证概念；Image Target 有独立的能力域/组合约束，不直接把文本 LLM 模型的所有参数复用为图片参数。
- `src/native/repositories/asset-store.js` 是内容 hash Blob/AssetRef/安全引用权威，`src/native/save-system.js` / `save-container.js` 已有 .atriasave 闭包、哈希、归档保护，但缺完整 D-009～D-011 媒体 DAG/Mask/草稿/Reference 引用扩展。

**迁移基本立场**：Atria 仍在 dev 阶段，允许明确的 **Schema hard cutover** 和现有测试/fixture 同步更新；不为了无人使用的未发布旧数据永久保留平行存储、NovelAI-only 验证层或双入口兼容逻辑。但必须保留已冻结的 SourceRef/SavePoint/AssetStore/Secret 数据安全，不是允许粗暴绕过现有正式 Session/分支合同。

## 2. D-013 已冻结的统一资源职责（精确字段、表与 JSON Schema 未冻结）

| 类别 | 候选资源/状态 | 版本/身份与唯一权威 |
| --- | --- | --- |
| Narration & Director | `VisualSourceRef`, `Scene`, `Shot`, `VisualIntent` | Native Session/Branch/Revision/Message/Variant/Span immutable anchors；场景和镜头为可重算语义投影，不新建剧情事实 |
| Visual State / References | `VisualIdentityRef`, `VisualStateProjection`, `ReferenceBinding` | 正式 Actor/World/Information disclosure 唯一事实权威；Ref Binding 按用途、Scope/Branch 与资源所有者控制 |
| Generation Configuration | `ImageConnection` (reuse existing ConnectionProfile), `ImageTargetProfile`, `ImageRenderingProfile`, `CapabilityManifest`, `TargetSelection` | SecretRef 只留连接；Target 绑定 model/Workflow version + native params；Rendering 为语义风格/默认 Target；single-task > annotation > work > global |
| Prompt & approval | `ImagePromptIR`, `ConstraintTier`, `CapabilityDecision`, `ApprovalReceipt` | 原始/有效 Required/Preferred/Optional、引用、提示词编译、具体 Target、用户允许降级/付费都可审计；用户 Raw Prompt 不被偷偷重写 |
| Job & budget | `ImageJob`, `ImageAttempt`, `BudgetReservation`, `RemoteTaskReceipt` | 持久 CAS/lease/fencing，先记账后外发，unknown-submission 不能盲重试，明确 regenerate 新 Intent，不因客户端关闭而重新收费 |
| Media & edit | `ImageArtifact`, `MediaOperation`, `MaskArtifact`, `MaskDraft`, `GallerySelection` | 不可变内容 hash + 多父 DAG/Mask 与来源；草稿为可恢复独立临时权威，选择指针是受限可变 CAS 投影 |
| Storage/projections | `AssetRef`, `SavePointClosure`, `GalleryIndex`, `SceneCoverageIndex` | Blob/AssetStore 与 SavePoint 是真实引用；Gallery/Scene 覆盖索引可重建、不能成为越权读入口；GC 必须扫描全 Root |

**需要讨论清楚而不能靠字段堆砌**：

1. **身份与作用域**：`player`/Library 全局资料、作品 Package/Project、Session/Branch 历史和与 Job/资产的引用分别在哪里保存；跨作品或跨分支共享参考图必须由明确的 ReferenceBinding 授权。
2. **不可变/可变**：ImageVersion、MaskArtifact、MediaOperation、编译请求/Target/Capability Evidence 不可变；显示选择、配置当前 revision、编辑草稿和索引有独立版本与 CAS。用户重选版本不回写 Shot 叙事锚。
3. **文件与数据库**：Blob 统一 SHA-256 受 AssetStore 保护；结构化 Source/Job/Budget/Operation 与 Media DAG 在既有 FS/SQLite Native 存储语义内实现，不为一个 Provider 另建状态真相。引用闭包含历史 Session/Branch/SavePoint/活跃 Job/Mask/Reference。
4. **请求验证与错误语义**：Owner/Session/source/Branch/disclosure、能力组合、费用硬上限、expected revision/fingerprint 与 asset hash 均 fail closed；失败码可辨别 invalid/unsupported/unknown/unauthorized/budget_exceeded/uncertain_submission/conflict，而不回显 Secret。
5. **接口版本与 hard-cutover**：Schema version 和可验证的资源 identity，不引入重复 v1/v2 永久适配器。旧官方 NovelAI 插画测试需迁入新协议；未正式发布的旧图片数据不要求无意义的兼容迁移。

## 3. D-013 冻结的 Native API 职责域（逻辑操作示例，非固定 URL）

- **Configuration**：`connection.list/read/save` 复用 Native Runtime 的 Connection/Secret，新增 `imageTarget.list/validate/save`、`renderingProfile.list/resolve/save`、`capabilities.describe/probe`；不暴露密钥。
- **Director**：`scene.preview/resolve`、`visualIntent.suggest/review`；只接收已经 Commit 的 SourceRef；预览和评分与 ImageJob 的付费提交分开。
- **Generate/Job**：`imageJob.prepare/authorize/submit/status/reconnect/cancel`、`budget.read/adjust`；CAS/幂等键/预算预留在服务端，权限校验不信任前端声称已批准。
- **Media Studio**：`maskDraft.read/save/checkpoint`、`mediaOperation.prepare/submit`、`mediaHistory.read/compare`、`gallery.query/select/hide`、`reference.promote/revoke`；Mask 的大字节 Blob 用现有带权限资源端点或专门受控流上传，不能塞进无界 JSON POST。
- **Save / GC**：`save.export/import/previewClosure`、`asset.references/checkDeletion`、`gc.preview/sweep`；默认不能对受引用媒体调用裸物理删除。
- **Readiness**：每条 API 要有明确错误 Code/错误作用域/前置条件；控制面、数据面和异步 Job 状态分离。可重用当前 `/native-session/illustrations` 等已有服务的行为但**统一指向新的核心资源，不复刻两份操作合同**。

**冻结的设计方向**：服务端独立强校验权限/来源/费用/资产；读操作、配置/草稿写入、付费提交、异步任务状态与媒体上传分域管理；Native Session/Runtime 仍是唯一正式身份/Secret/叙事入口。**未冻结**精确请求响应字段、URL、ID 前缀/枚举、CAS header/ETag 与前端 SDK 导出名；这些列入 E0 接口待收口清单，不允许 Codex 擅自混成 Provider 单体协议。

## 4. D-013 已冻结的三层配置、响应式 UI 与性能验收方向

1. **Native Runtime / 图像服务**：Connection（URL/Secret/网络）、Image Target（Model 或 Comfy/RunningHub Workflow、节点映射、能力三态/测试等级）、Image Rendering（风格、构图、画质偏好与默认 Target）；LLM 的 `role.illustration_prompt`/Director Route 仍独立。
2. **全局/作品/标注/单次任务**：保存 D-004 的继承链并可展示当前“来源于哪个层级”；用户切换 Target/Rendering 只影响以后发起的 Job，不篡改旧 ImageVersion 证据。
3. **生成模式与预算**：手动/半自动/全自动共用同一 UI 合同；自动默认关闭、平衡模式可选；Planner/Image 双账与上限、付费 Cloud 手动启用/明确金额，Estimated vs Actual/Unknown 明确展示，禁默默换付费后端。
4. **Visual Director 与角色**：角色身份/当前视觉状态/可见参考图在 Scene/Shot UI 有明确来源；可解释场景候选/skip/评分与 Prompt IR 预览，角色/服装/风格来源冲突有可理解的检查提示。
5. **Media Studio / Gallery**：剧情卡进入编辑，Mask 可缩放/拖拽/撤销重做/持久草稿，Gallery 默认当前 Branch 按 Scene 浏览、异步结果先入历史/可对比，DAG 高级层按需展开；GC、Reference 晋升、存档导入均展示影响范围/可恢复能力。
6. **Windows + CachyOS + Android Termux 浏览器**：单个响应式 Web UI，鼠标键盘/触控合用；窄屏不显示巨大 DAG 常驻面板，触摸画布避免页面滚动/多指缩放冲突；区分浏览器/后台 Node 在各平台的权限、磁盘路径和本地 ComfyUI endpoint 可达性；**不要求额外原生 Android APK 或独立服务器部署路线**。字体/可访问性/错误及操作状态应有基础保障。
7. **长会话性能**：分页/缩略图/虚拟列表、按需 Mask/DAG 展开、异步 Job 的非阻塞渲染、GC 阶段不与前台争资源；缓存仅为可重建投影，来源仍由 Native Session/AssetStore 决定。

## 5. D-013 已冻结：七大阶段 / 25 子阶段 + 垂直切片交付

在完成 E0 阻塞项与用户下达正式实施指令**之后**，沿用**同一 `feat/*` 工作分支逐阶段累积**；开发/验证事实按 Governance 维护 `docs:records/feat/native-visual-generation-deepening.md`，不因进入下一阶段重复开分支或人工审批。P0/P1 为已批准交付家族，P1 不能永久变成“以后看情况”。所有阶段有最小相关测试和失败修复，验收证据不能写成未执行的真实 Provider/设备通过。

| 阶段 | 子阶段编号和交付（冻结的工作划分） | 阶段核心验收 / 依赖 |
| --- | --- | --- |
| **S0：正式契约和 dev-stage hard cutover（3）** | **S0.1** SourceRef/Scene/Shot/ImagePromptIR/身份及能力证据合同；**S0.2** Native API/存储资源边界、权限/CAS/版本/错误分类；**S0.3** 删除旧 NovelAI 中立验证硬依赖、单一插画事实权威的切换与测试/Fixture 更新方案 | 先确定哪些历史字段直接废弃，不为尚未公开的数据保留双通道；最小 Schema 和跨来源/Secret 拒绝测试；保留 Native Session/SavePoint 的正式安全不变量 |
| **S1：中立 Job / Asset / 预算内核（4）** | **S1.1** ImageConnection/Target/Rendering/Capability Registry & compiler；**S1.2** 持久 ImageJob/Attempt/预算、租约/fencing/remote reconcile；**S1.3** ImageArtifact/MediaOperation/Mask & DAG/AssetStore/引用权威；**S1.4** SavePoint/Import/GC 基础闭包与幂等发布 | FS/SQLite、Branch/Revision、保存/重启/未知提交、双账预算、非法 Mask/DAG/资产和安全 GC 验证；Stage 结束前接口支持一个 P0 薄切片 |
| **S2：P0 端到端接入（3）** | **S2.1** NovelAI V3/V4/V4.5/V5 首条真实接口语义的端到端薄切片（Source → IR → Job → Provider → AssetStore → ImageVersion → 展示）；**S2.2** ComfyUI Workflow API/node mapping/状态与编辑能力；**S2.3** OpenAI Images 独立生成/编辑端点与专有输入 | **先有 S2.1 垂直切片，不等 S2.2/S2.3 完成才首次贯通**；每个 P0 家族 L1/L2，授权的 L3 或明确 not_run，不把 UI 网页能力当 API 支持 |
| **S3：视觉连续性与导演（4）** | **S3.1** Actor/Visual Identity、参考用途与权限；**S3.2** Source Revision/World Visual State/信息披露投影；**S3.3** 跨回合 Scene/Shot、低成本筛选与分级 Director 评分；**S3.4** 手动/半自动/全自动、Budget/审批/跳过节奏和失败说明 | D-005～D-008：梦境/倒叙、场景覆盖、跨分支状态/身份/剧透、软节奏和硬付费预算、默认自动关闭；Director 不能阻塞正文 |
| **S4：Native Media Studio / Gallery（4）** | **S4.1** Canonical Mask、画布命令/Checkpoint/CAS、触摸/缩放；**S4.2** 再生成/Img2Img/Inpaint/Upscale 和跨 Provider 编辑 Workflow；**S4.3** Gallery/选择 CAS/历史 DAG/Reference 晋升；**S4.4** GC 双扫描/宽限/可编辑 SavePoint/导入闭包及补偿 | D-009～D-012：输入哈希/坐标、版本不覆盖、全引用 GC、导入/导出、长会话懒加载；按 Provider/特性分别证明 L1/L2/可用时 L3 |
| **S5：P1 后端与能力覆盖（3）** | **S5.1** Gemini Native Image 编辑语义；**S5.2** A1111/SD WebUI/Forge/ControlNet/LoRA 实际探测；**S5.3** RunningHub Workflow/远端任务及 P2 Adapter 扩展入口 | P1 **必须完整纳入批准的家族范围**，不因排在后期而删掉；逐 Target 能力/费用/组合/降级和 L1/L2，未授权 Live 诚实 not_run |
| **S6：三端集成/性能/安全/最终交付（4）** | **S6.1** Windows 浏览器/服务端路径与 UI；**S6.2** CachyOS KDE 浏览器与本地工作流；**S6.3** Android Termux + 手机浏览器/触摸/局域网地址差异；**S6.4** 长会话、FS/SQLite、GC/SavePoint、预算、隐私、CI、Record/合并收尾 | 只报告实际具备的环境与设备/自动化证据；每个正式功能 L1/L2 必需，L3 真实依授权，状态 `not_run` 不冒充通过；实现后符合仓库 Governance 才集成到 main |

**总计 7 个主阶段、25 个子阶段**（3+4+3+4+4+3+4），是开发工作分解与依赖结构，**不意味着每个阶段必须长时间停止让用户审批**。普通实现/测试失败由 Codex 自行解决；真实账户、密钥、无可替代设备证据或重大设计变更等才按 Governance §13 报告阻塞。

### 5.1 冻结的执行顺序与验收策略

- **先契约，后内核，尽早一个 P0 垂直切片，再扩展全部批准家族**。S1 的数据能力可与 S2.1 薄切片做必要的受控交叠，但只有最小相关校验通过的代码才可逐步增加功能。避免一次性全系统改写后才发现真实 Provider 契约不匹配。
- 每阶段执行**最小相关**的 L1/单元/集成/浏览器模拟检查；每个交付的 Provider/操作须有 L1/L2 证据。L3 的授权真实连接/模型/Workflow 仅在可取得资源时执行；若缺 Secret/余额/本地 GPU，记录 `not_run` 与明确的用户外部阻塞，不声称相应 Live 能力已验收。L3 缺席不应自动阻止独立代码与 L1/L2 开发，也不能把未证实的功能标为可用。
- **三端目标**：Windows、CachyOS（Linux/KDE）、Android Termux 浏览器交互，按实际 UI/backend/网络路径验证；模拟手机 viewport 是自动化证据，不是 Android 实机证据。第十三轮不要求另建 Android APK 或专门服务器部署。
- 跨阶段通用强验收：Session/Branch/Revision/SavePoint 绑定，Actor/World Truth，Planner/Image 双账与禁止无授权收费，mask/ref 权限，DAG/AssetRef GC 闭包、Job idempotency、崩溃后恢复、恶意导入与 Secret 防泄漏。不能因为某条测试缺 Live 环境就在设计中降低身份/付费/存档保护。
- 开发进度按**唯一正式 Record**逐阶段累计：Start HEAD、End/Tested HEAD、测试与 CI、实际 Provider 证据/未测试、下一阶段目标；Plan 仅在真实设计变化时更新。阶段可连续推进，遵循 Governance，不额外设置 CI 人工等待或 API 测试次数许可。
- 本次只批准 E0 Plan，不代表执行以上任何产品代码、CI、云收费请求或终局合并；是否正式交付给 Codex 取决于 E0 收口审计及其后用户的明确要求。

### 5.2 明确的范围排除与未冻细项

- **在 P0/P1 阶段不可偷删已批准家族**。P2 为扩展架构，不等于承诺任意兼容端点都上线。视频生成/完整视频时间线、成熟多图层 DCC 和批量视频仍未纳入当前正式范围，不因 Media Studio 的名称自动扩展。
- D-013 冻结职责及结构，**未冻结**精确 Schema 字段名、数据库表/索引/写事务、HTTP URL/SDK 函数名、Capability/Mask 的完整 JSON Schema、导入版本迁移语句、费用报价快照语义和各 Provider 的真实 L3；这些必须在 E0 逐项识别、明确下一步可自决/须再审议的性质。
- 性能默认、参考强度/模型画像、运营费用本身可基于真实证据调参，但不得撤销 D-005/D-006 身份/披露、D-008 费用与作业、D-011 Save/GC 的硬规则。

## 6. Round 13 方案历史记录：C 已获批准

- **A 增量叠加旧插画**：放弃。容易保留 NovelAI 中立层硬绑定及多套图片保存/证据逻辑，违背 D-003/D-009。
- **B 一次性全重写后验收**：放弃。风险集中在跨 Provider、存档/预算/界面与长会话末端。
- **C 强契约 Core-first + dev-stage hard cutover + P0 垂直切片 + 七阶段完整交付**：**用户正式选定 D-013**。统一 Native 来源/数据/接口职责，不保留无意义的旧版双协议；按照 §5 的 S0～S6/25 子阶段实现并持续验证/记录。

## 7. E0 审计已完成（静态收口，不属于产品代码）

用户要求**先写 D-013 并提交，再审计前十三轮**：该静态 E0 收口已经独立提交，详见 [e0-closure-audit.md](e0-closure-audit.md)，包含 D-001～D-013 一致性、源码差距、15 项接口/安全/验收缺口、S0～S6 依赖及 Codex 正式交接条件。无需此处重复详细表格。

**E0 静态收口已完成；本次没有建立 feat 分支**。未来只有用户下达正式实施指令后才按 Governance 创建同一任务分支。本文件的“已冻结”只表示方案批准，不代表已完成代码、CI、真实 Provider L3 或真实设备验证。
