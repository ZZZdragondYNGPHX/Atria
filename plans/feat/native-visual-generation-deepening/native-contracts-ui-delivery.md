# Round 13 候选：Native Image API / 数据 Schema / 配置界面 / 跨平台与交付收口

- Task: \`atria-native-visual-generation-deepening\`
- **Status: Round 13 OPEN / NOT FROZEN**。下述 Schema 名称、动作/API、阶段/子阶段、UI 默认路由、验收通过门槛均为候选，**不能当作已经批准的 D-013、已创建的 feat 分支或已实现代码**。
- Frozen prerequisites: [decisions.md](decisions.md) D-001～D-012，尤其 D-003 ImagePromptIR+Adapter、D-004 Connection/Target/Rendering 三层配置、D-007/D-008 Durable Job/Budget、D-009～D-011 Media Studio/Mask/Save/GC、D-012 Target 三态/typed degrade/L1-L2-L3。以这些决策为规范，不重新表决。
- Baseline: \`main@7e1045ab836c22cafbc92c5de056ad701f56e723\`（仅 GitHub 静态源码审计；未跑 UI、FS/SQLite、跨平台或真实模型）。
- Proposed implementation branch: 在全部设计确认与最终交接前**不创建** \`feat/*\`；候选任务分支 \`feat/native-visual-generation-deepening\`，名称可在最后收口时由用户批准。

## 1. 当前代码锚点和必须消除的重复权威

- \`src/native/illustration-image-service.js\` 当前直接绑定 \`createNovelaiImageProvider()\` 与 \`renderNovelaiIllustration()\`，内存 Scheduler 负责交互执行；并不是多后端和完整 Durable Job Ledger。
- \`public/shared/native-illustration-contract.js\` 的 ImageRequestSnapshot 还以 NovelAI 编译器回算校验，不是 D-003 要求的中立证据。
- \`public/shared/illustration-plugin-contract.js\` settings \`schemaVersion:1\` 目前把 \`imageConnectionId\`、\`promptRouteId\`、全局/作品预设和 NovelAI steps/scale/sampler 并列。正式实现应将 Image Connection/Target/Rendering 与视觉身份、选择策略和 Provider 原生参数职责分离。
- \`public/scripts/native/runtime-workspace.js\` 的 Connections 已具备端点、Secret、LLM Profiles/Routes 编辑基础，但图片适配器选择与说明主要偏 NovelAI；\`public/scripts/native/illustration-settings-ui.js\` 则面向作品和图片连接，尚无统一 Target/Workflow/Rendering、预算/Mask/Gallery 的完整 UX。
- \`src/endpoints/native-session.js\` 的 \`/illustrations/read\` 与 \`/illustrations/{command}\` 负责分支标注/选中 ImageVersion；\`src/endpoints/native-generation.js\` 的 \`/configuration\`、\`/resources\`、\`/configuration/:kind\` / image job 接口已有 Native 请求/授权惯例。新 Native API 应围绕现有 Native 权威组织，不把旧 SillyTavern 扩展路由作为另一套正式图像系统。
- \`src/native/model-prompt-runtime/contracts.js\` 已有 supported/unsupported/unknown 与 provenance 的事实验证概念；Image Target 有独立的能力域/组合约束，不直接把文本 LLM 模型的所有参数复用为图片参数。
- \`src/native/repositories/asset-store.js\` 是内容 hash Blob/AssetRef/安全引用权威，\`src/native/save-system.js\` / \`save-container.js\` 已有 .atriasave 闭包、哈希、归档保护，但缺完整 D-009～D-011 媒体 DAG/Mask/草稿/Reference 引用扩展。

**迁移基本立场**：Atria 仍在 dev 阶段，允许明确的 **Schema hard cutover** 和现有测试/fixture 同步更新；不为了无人使用的未发布旧数据永久保留平行存储、NovelAI-only 验证层或双入口兼容逻辑。但必须保留已冻结的 SourceRef/SavePoint/AssetStore/Secret 数据安全，不是允许粗暴绕过现有正式 Session/分支合同。

## 2. Round 13 统一的候选资源/数据实体边界（字段名未冻结）

| 类别 | 候选资源/状态 | 版本/身份与唯一权威 |
| --- | --- | --- |
| Narration & Director | \`VisualSourceRef\`, \`Scene\`, \`Shot\`, \`VisualIntent\` | Native Session/Branch/Revision/Message/Variant/Span immutable anchors；场景和镜头为可重算语义投影，不新建剧情事实 |
| Visual State / References | \`VisualIdentityRef\`, \`VisualStateProjection\`, \`ReferenceBinding\` | 正式 Actor/World/Information disclosure 唯一事实权威；Ref Binding 按用途、Scope/Branch 与资源所有者控制 |
| Generation Configuration | \`ImageConnection\` (reuse existing ConnectionProfile), \`ImageTargetProfile\`, \`ImageRenderingProfile\`, \`CapabilityManifest\`, \`TargetSelection\` | SecretRef 只留连接；Target 绑定 model/Workflow version + native params；Rendering 为语义风格/默认 Target；single-task > annotation > work > global |
| Prompt & approval | \`ImagePromptIR\`, \`ConstraintTier\`, \`CapabilityDecision\`, \`ApprovalReceipt\` | 原始/有效 Required/Preferred/Optional、引用、提示词编译、具体 Target、用户允许降级/付费都可审计；用户 Raw Prompt 不被偷偷重写 |
| Job & budget | \`ImageJob\`, \`ImageAttempt\`, \`BudgetReservation\`, \`RemoteTaskReceipt\` | 持久 CAS/lease/fencing，先记账后外发，unknown-submission 不能盲重试，明确 regenerate 新 Intent，不因客户端关闭而重新收费 |
| Media & edit | \`ImageArtifact\`, \`MediaOperation\`, \`MaskArtifact\`, \`MaskDraft\`, \`GallerySelection\` | 不可变内容 hash + 多父 DAG/Mask 与来源；草稿为可恢复独立临时权威，选择指针是受限可变 CAS 投影 |
| Storage/projections | \`AssetRef\`, \`SavePointClosure\`, \`GalleryIndex\`, \`SceneCoverageIndex\` | Blob/AssetStore 与 SavePoint 是真实引用；Gallery/Scene 覆盖索引可重建、不能成为越权读入口；GC 必须扫描全 Root |

**需要讨论清楚而不能靠字段堆砌**：

1. **身份与作用域**：\`player\`/Library 全局资料、作品 Package/Project、Session/Branch 历史和与 Job/资产的引用分别在哪里保存；跨作品或跨分支共享参考图必须由明确的 ReferenceBinding 授权。
2. **不可变/可变**：ImageVersion、MaskArtifact、MediaOperation、编译请求/Target/Capability Evidence 不可变；显示选择、配置当前 revision、编辑草稿和索引有独立版本与 CAS。用户重选版本不回写 Shot 叙事锚。
3. **文件与数据库**：Blob 统一 SHA-256 受 AssetStore 保护；结构化 Source/Job/Budget/Operation 与 Media DAG 在既有 FS/SQLite Native 存储语义内实现，不为一个 Provider 另建状态真相。引用闭包含历史 Session/Branch/SavePoint/活跃 Job/Mask/Reference。
4. **请求验证与错误语义**：Owner/Session/source/Branch/disclosure、能力组合、费用硬上限、expected revision/fingerprint 与 asset hash 均 fail closed；失败码可辨别 invalid/unsupported/unknown/unauthorized/budget_exceeded/uncertain_submission/conflict，而不回显 Secret。
5. **接口版本与 hard-cutover**：Schema version 和可验证的资源 identity，不引入重复 v1/v2 永久适配器。旧官方 NovelAI 插画测试需迁入新协议；未正式发布的旧图片数据不要求无意义的兼容迁移。

## 3. Native API/SDK 操作集合（候选逻辑动作，**非已批准 URL**）

- **Configuration**：\`connection.list/read/save\` 复用 Native Runtime 的 Connection/Secret，新增 \`imageTarget.list/validate/save\`、\`renderingProfile.list/resolve/save\`、\`capabilities.describe/probe\`；不暴露密钥。
- **Director**：\`scene.preview/resolve\`、\`visualIntent.suggest/review\`；只接收已经 Commit 的 SourceRef；预览和评分与 ImageJob 的付费提交分开。
- **Generate/Job**：\`imageJob.prepare/authorize/submit/status/reconnect/cancel\`、\`budget.read/adjust\`；CAS/幂等键/预算预留在服务端，权限校验不信任前端声称已批准。
- **Media Studio**：\`maskDraft.read/save/checkpoint\`、\`mediaOperation.prepare/submit\`、\`mediaHistory.read/compare\`、\`gallery.query/select/hide\`、\`reference.promote/revoke\`；Mask 的大字节 Blob 用现有带权限资源端点或专门受控流上传，不能塞进无界 JSON POST。
- **Save / GC**：\`save.export/import/previewClosure\`、\`asset.references/checkDeletion\`、\`gc.preview/sweep\`；默认不能对受引用媒体调用裸物理删除。
- **Readiness**：每条 API 要有明确错误 Code/错误作用域/前置条件；控制面、数据面和异步 Job 状态分离。可重用当前 \`/native-session/illustrations\` 等已有服务的行为但**统一指向新的核心资源，不复刻两份操作合同**。

请求/响应与实体校验的最终字段/HTTP route 命名、CAS ETag 与 SDK 导出边界，需由 Round 13 正式方案批准后在任务实施前细化。

## 4. 设置/跨平台 UX 候选信息架构

1. **Native Runtime / 图像服务**：Connection（URL/Secret/网络）、Image Target（Model 或 Comfy/RunningHub Workflow、节点映射、能力三态/测试等级）、Image Rendering（风格、构图、画质偏好与默认 Target）；LLM 的 \`role.illustration_prompt\`/Director Route 仍独立。
2. **全局/作品/标注/单次任务**：保存 D-004 的继承链并可展示当前“来源于哪个层级”；用户切换 Target/Rendering 只影响以后发起的 Job，不篡改旧 ImageVersion 证据。
3. **生成模式与预算**：手动/半自动/全自动共用同一 UI 合同；自动默认关闭、平衡模式可选；Planner/Image 双账与上限、付费 Cloud 手动启用/明确金额，Estimated vs Actual/Unknown 明确展示，禁默默换付费后端。
4. **Visual Director 与角色**：角色身份/当前视觉状态/可见参考图在 Scene/Shot UI 有明确来源；可解释场景候选/skip/评分与 Prompt IR 预览，角色/服装/风格来源冲突有可理解的检查提示。
5. **Media Studio / Gallery**：剧情卡进入编辑，Mask 可缩放/拖拽/撤销重做/持久草稿，Gallery 默认当前 Branch 按 Scene 浏览、异步结果先入历史/可对比，DAG 高级层按需展开；GC、Reference 晋升、存档导入均展示影响范围/可恢复能力。
6. **Windows + CachyOS + Android Termux 浏览器**：单个响应式 Web UI，鼠标键盘/触控合用；窄屏不显示巨大 DAG 常驻面板，触摸画布避免页面滚动/多指缩放冲突；区分浏览器/后台 Node 在各平台的权限、磁盘路径和本地 ComfyUI endpoint 可达性；**不要求额外原生 Android APK 或独立服务器部署路线**。字体/可访问性/错误及操作状态应有基础保障。
7. **长会话性能**：分页/缩略图/虚拟列表、按需 Mask/DAG 展开、异步 Job 的非阻塞渲染、GC 阶段不与前台争资源；缓存仅为可重建投影，来源仍由 Native Session/AssetStore 决定。

## 5. 实施阶段和验收矩阵（候选路由，NOT approved）

以**同一 feat 主工作分支逐阶段累积**实现，阶段中按职责组织可并行子任务，更新 \`docs\` 分支对应正式 Task Record/Checkpoint；最终按已验证证据合并 main 并清理临时分支。P0/P1 为已批准交付家族，P1 不能永久变成“以后看情况”。

| 阶段候选 | 子阶段/产物 | 通过标准与风险 |
| --- | --- | --- |
| **S0 合同和演进切换** | 契约审计/冻结 Schema、API、资源身份与 SourceRef、实现边界；设计一条正式硬切换路径 | L1 contract tests/拒绝跨源/权限/Secret 泄漏；去掉旧 NovelAI 中立层硬引用 |
| **S1 媒体与作业内核** | Native ImageIntent/PromptIR、ImageTarget Profiles/Capability、Durable Job/Budget、Media DAG/MaskArtifact、AssetRef 与 SavePoint GC | FS/SQLite/Branch/SavePoint/重启/幂等/不确定提交/跨引用与恶意导入 L2 |
| **S2 P0 后端能力** | NovelAI V3～V5、ComfyUI、OpenAI Images 的 generation/edit Adapter、Workflow 节点映射、独立图像配置 | 各 Target L1+L2；有实际授权才 L3，不能以 Mock 充当 Live |
| **S3 Director 与视觉连续性** | Actor/Visual State/References 投影、跨 Scene/Shot 分割、镜头评分、半自动/全自动/手动模式、预算工作流 | 多分支/回忆/时点/披露/参考冲突、场景重复/跳过、自动默认关闭和预算硬门禁 |
| **S4 Media Studio & Gallery** | Mask Canvas/Checkpoint/CAS、Img2Img/Inpaint/Upscale、跨 Target 编辑、版本选择/Gallery、Reference 晋升与两阶段 GC | Windows/桌面浏览器+移动触控测试，编辑 DAG/Mask 及导入导出完整编辑闭包，长会话分页 |
| **S5 P1 扩展并验收** | Gemini Native Image、A1111/Forge、RunningHub Adapter、组合能力、流程回退显式确认、P2 注册机制 | 每家独立 L1+L2；实际已授权端点执行对应 L3 或诚实 NOT RUN；不删除已批准 P1 |
| **S6 跨平台/稳定性/最终收口** | Windows/CachyOS/Termux 体验、联动 CI、部署边界、性能、故障恢复/存档、正式文档/Record | 完整验收证据矩阵、未运行 L3 项明确列出而不是伪造、实际平台日志与可达性、合并与回滚策略 |

**贯穿每阶段**：最小相关自动测试，不把所有测试延后到最后；明确记录 FS/SQLite、逐 Provider Fixture/L1/L2/L3、Branch/GC/SavePoint/Mask/Job 安全、跨平台 UI 证据。第三方 Cloud L3 需要授权和实际资源，可单独跟踪 \`not_run\`，不应无凭据凭空宣称“全部真机/云端验收完成”。正式 CI 明显耗时阶段无需长时间阻塞轮询，遵循项目现有治理，不在本 Plan 自创新的停工条件。

**仍需另行讨论**：Stage 数量/切法、首批端到端垂直切片最少要贯通的 Provider、各阶段测试门槛与缺少 L3 时最终发布态的诚实标注、数据硬切换是保留现有 annotation contract 还是一次性替换、是否用 Package 资产工具共享 Gallery。第十三轮不应假设全部平台/图片模型已可测。

## 6. Round 13 方案比较 — NOT frozen

### A. 现有插画体系上增量添加接口/设置

以旧 Annotation/ImageVersion、NovelAI UI 为主体，增加 Provider 选项、草稿和 DAG 字段，后续逐个修补预算/存档和长会话索引。优点是早期修改少；缺点是与 D-003/D-009 的中立证据与正式 DAG 目标存在长期双轨/屎山风险。

### B. 一次性全量 Schema/UI/Adapter 大切换

先把所有 API/数据表/全后端/UI 一次性重写后再全系统验收。最终概念统一，但缺乏随时可验证的贯通切片，P0/P1 与跨平台存档的集成风险很高，错误定位困难。

### C. Core-first strong contracts + vertical-slice delivery（**推荐候选**）

先冻结 Native 的权限/来源/资源/不可变与 CAS 语义，进行明确 dev-stage hard cutover，不维护旧插件与新核心的平行事实；优先打通 **一个 P0 端到端薄切片（含保存/Job/图片呈现）**，再扩展 P0 全协议，随后 Director、Media Studio、P1 与跨平台验收。每阶段更新唯一正式 Record，具可证明的测试/HEAD/CI/未完成项目。兼顾干净架构与可验证工程推进，推荐在正式签署 D-013 前细化阶段交付界面和最终完成标准。

**Round 13 尚未选择 A/B/C；上述为讨论候选，不能因为写进 Plan 就提前开工。**
