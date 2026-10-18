# Atria Native Media Studio / Mask / Gallery / Asset Lifecycle — D-009 / D-010 / D-011

- Task ID: `atria-native-visual-generation-deepening`
- **Status**: **D-009、D-010、D-011 三轮方案 C 均已批准**。本文件负责 Media Studio 与可逆/安全生命周期分层；
- Canonical cross-module decisions: [decisions.md](decisions.md) D-001～D-011。D-009/D-010 的分层/生命周期归此模块；D-011 的精确中立协议归 [media-precision.md](media-precision.md)，不重复维护。
- Data authority: [provider-protocol.md](provider-protocol.md)（ImagePromptIR、Provider 能力与证据），[visual-continuity.md](visual-continuity.md)（角色/状态/参考权威），[visual-director.md](visual-director.md)（Scene/Shot、Job 和费用）。
- Audited baseline: Atria `main@7e1045ab836c22cafbc92c5de056ad701f56e723` (GitHub 代码静态阅读；**本轮没有运行测试或真实编辑 API**）。

## 1. What Atria already has

- `src/native/illustration-service.js`: `addImageVersion`、`selectImageVersion`、软删除标注；同一 Annotation 的多次生成保留图片历史，并可选择某一版本呈现。
- `public/shared/native-illustration-contract.js`: 目前 `atri_illustrations` state 含 `annotations[]`、`images[]`；`ImageVersion` 主要关联 `annotationId/assetId/prompt/parameters/requestSnapshot`，尚无通用 parent media operation 图谱；
- 现有 Session/SavePoint 插画引用参与可达性。
- `src/native/illustration-image-service.js`: 手动提交 NovelAI 生成、ImageJob、结果存储；尚未发现 Native 一体化 Img2Img、Inpaint、Upscale、Gallery 搜索/编辑面板管线。
- `src/endpoints/novelai.js` 旧端点包含某些 upscale 行为，但不是原生插画操作已打通的证据；不能把旧 ST endpoint 的存在冒充 Native 功能实现。
- `public/scripts/native/official-illustration.js` 已有单标注版本历史选择，但不是跨 Session/Branch/Scene/Actor 的完整媒体画廊。

## 2. Edit operations are different; do not pretend they are identical

| Operation | Semantic contract | Minimum provenance | Constraints |
| --- | --- | --- | --- |
| **Regenerate** | 相同 SourceRef/Shot 的新明确生成意图，可沿用或调整已确认 IR/Target；生成独立新版本 | 旧源 Scene/Annotation，新的 Intent/Job/请求证据 | 必须区分用户明确再生成与 D-008 自动重复重放 |
| **Img2Img** | 使用已有图片像素作为条件产生新图 | 原图资产/版本、强度参数、目标 Provider 和 prompt | 去噪/影响程度是 Provider-specific，不能保证原像素保留 |
| **Inpaint / local edit** | 原图 + Mask + 局部编辑指令生成新图 | 原图、Mask 资产/坐标/尺寸版本、局部 Prompt、编辑结果 | 不同 Provider 的 Mask alpha/尺寸/扩展语义不同；|
| **Upscale** | 对原图产生更高分辨率衍生 | 源图版本、算法/Target、目标输出尺寸、内容变化类型 | 区分**确定性重采样**与**生成式超分辨率**；后者可能改脸/服装/细节，不能承诺像素或剧情完全无损 |
| **Select/Review** | 改变当前显示指针而非回写原始叙事 | Branch/Annotation/Session 作用域中的 `selectedImageVersionId` | 不能修改已保存原始 Blob，也不能覆盖其他分支已经选择的版本 |

Provider evidence varies: NovelAI 官方 Inpaint 文档有 Mask Canvas；**支持某 Provider** 不等于该 Provider 的每个图像目标都支持所有编辑操作、相同 Mask 或相同输出画质/费用。

## 3. Round 9 historical options — **C approved** (A/B retained for comparison)

### A — Extend existing Annotation/ImageVersion incrementally

仍以 Annotation→ImageVersion 为唯一主要管理单元，为 regenerate/img2img/inpaint/upscale 单独增加操作入口；在单标注 UI 中管理少量历史版本，画廊主要聚合已有条目。

优势：实现范围最小。风险：多源编辑、长会话全局画廊、参考图晋升、操作链条与跨作品复用缺少正规模型，容易将来被迫重构。

### B — Immutable image lineage graph + versioned gallery

所有新图都是不可变 `ImageArtifact`；`ImageOperation` 在同一来源域记录 parent ImageVersion、可选 Mask/参考源、Prompt IR/Target/Job；生成 DAG，当前注释仅存显示指针。新增跨 Session/Branch/Scene/Actor 的懒加载 Gallery、操作树浏览、显式身份/风格参考晋升、基于 AssetStore 的引用保护。先提供基础手工编辑工具，更多编辑操作按 Provider 能力开放。

优势：长期版本/GC 与跨 Provider 编辑归一性好。风险：需要较完整的媒体数据契约和 UI 管理。

### C — Layered native Media Studio with immutable lineage (D-009 approved)

采用 B 的不可变多源图谱为底座，再将**交互、编辑操作、资产画廊、衍生模板/工作流**作为独立模块；统一“再生成、Img2Img、局部重绘、Upscale、图像变体”到原生 `MediaOperation`。支持多步骤、跨模型、更多编辑选项，但**按实现阶段**逐步交付，不强制一口气具备视频节点、成熟 DCC 图层编辑器或第三方所有高级特性。

**第九轮正式定案：采用 C。** 它包含 B 的不可变血缘/画廊，不采用 A 的单纯标注数组扩展；但不要求立即实现全功能图层编辑器或视频编辑器。风险：资产可达性、Mask 和编辑 UI、跨 Provider 能力组合、长期 GC/SavePoint 都更复杂；

## 4. D-009 冻结：职责分层与不可变媒体来源

### 4.1 三个正交职责

1. **Native Media Core / immutable lineage**：共享 ImageArtifact、MediaOperation、来源/父子 DAG、Mask/参考输入、原始像素 AssetRef 与非秘密请求证据。版本和父子引用不可变，原图永远不被原位覆盖；用户选择显示版本是另外的分支/标注呈现投影，不更改历史事实。
2. **Editing/Provider Workflow**：Regenerate、Img2Img、Inpaint/局部重绘、Upscale 统一由可追溯 MediaOperation 发起，委托实际 Image Target/Provider 的 Capability Negotiation 与 Adapter 执行。不同模型的去噪、Mask alpha、参考图、放大算法、费用和产物数量不必伪装成统一参数。严格能力不支持时应明确拒绝或走已批准的替代策略，不静默忽略。
3. **Media Studio / Gallery UX**：从剧情插图卡片进入编辑，独立工作台管理预览/Mask/Provider/参数/派生历史；Gallery 支持作品、Session、Branch、Scene/Shot、Actor、Provider、操作血缘与角色/服装/风格参考库的按权限检索，长会话需缩略图、分页、惰性加载，不重写 Chat/Timeline。

### 4.2 核心操作冻结在产品范围内，但分期实现

- **Regenerate**：用户明确的新生成意图、新请求/版本；不能把“用户想再生成一次”当自动触发的幂等重放。可沿用历史 ImagePromptIR/Prompt/Target，也允许用户修改后重新冻结证据。
- **Img2Img**：记录源图内容/版本、选择的 Image Target、编辑语义与该后端实际参数，以新图为独立产物。
- **Inpaint**：原图 + 授权 Mask + 区域编辑指令生成派生图；具体笔刷操作、坐标转换、Mask 反相等第十轮细化。
- **Upscale**：基于源图生成独立更高分辨率版本，必须区分普通重采样与**生成式超分辨率**（可能修改细节或角色面容），不得声称都是“无损”。
- **History / Gallery**：完整原图和衍生历史可浏览与选择；可受控对跨作品/分支提供共享的**批准标准参考图**，不得把普通剧情图默认为通用视觉事实；资产引用/保存时点保护沿用 Native 数据权威。
- 最终已批准的操作不得因先后顺序被永久排除，某 Provider 专有能力仍需另定矩阵。

### 4.3 不可越过的跨系统不变量

- **不能修改已提交剧情或另建剧情真相库**。所有图片及编辑版本锚定原 Session/Branch/Revision/Annotation/Scene/Shot（若适用）；用户切换当前 Branch 不可改变原资产归属或偷偷选中晚到的版本。
- **血缘应为不可变无环多父引用结构**。Mask、参考图、派生父图、已批准参考库均参与有效引用与 GC/备份闭包。删除 UI/隐藏操作不能等于直接删 Blob；尚有可达子图、SavePoint、引用库或持久 Job 的资产不可物理删除。
- **共同预算和 Job**：手动编辑仍受配置的全局付费权限及 D-008 持久 ImageJob、请求冻结、远端对账和不确定不盲重试约束。用户确认以前不会因为打开编辑器/画廊而发送可能收费的请求。
- **模型差异真实表达**：不是所有 P0/P1 后端或模型都支持所有四种编辑方式；
- **第三方许可与隐私**：所有素材/Mask/临时预览均受已有 AssetStore 和用户披露/授权限制，不能从用户当前分支泄露另一路未来剧情，也不复制 st-chatu8 的 AFPL 实现。

## 5. Conceptual media contract (fields illustrative, not yet a frozen schema)

Invariants: **Blob immutable; an edit creates a derivative**. Selected display version is a separate mutable projection/selection; source text remains immutable. Every asset referenced by reachable ImageVersion, MediaOperation, Mask, active Job, SavePoint or approved reusable reference remains protected; abandoned previews/orphans can be GC'ed only after a safe grace and reference scan.

## 6. Round 10 已冻结：能力感知的可逆 Media Studio（D-010；方案 C）

第十轮用户批准方案 C；在 D-009 的不可变资产和操作 DAG 上，明确以下**架构级行为约束**。

### 6.1 Canonical Mask 编辑工作台与可逆草稿

1. 编辑器采用**与 Provider 无关的 Canonical Mask / Edit Draft**：Mask 指向精确源 ImageArtifact/AssetRef 及原图几何，保留在原图像素/规范化变换空间的独立、可逆编辑数据；不能把鼠标 DOM 坐标、屏幕缩放倍率或某 Provider 的 PNG Alpha 语义当作永久权威。
2. 支持可预览且可撤销的区域绘制/擦除/清空与编辑状态，桌面鼠标/键盘与触屏交互均使用同一基础坐标/草稿契约。笔刷、套索、矩形、平移缩放、撤销重做等产品工具可渐进完善，**精确必备工具、快捷键、笔压、Mask 几何/符号方向/序列化留到 Round 11**。
3. 未提交草稿与**已提交生成请求冻结的 Mask 资产版本**分离。修改草稿不会影响已发出的 Job。草稿持久化的粒度、CAS 冲突与恢复策略下一轮决定。
4. 打开编辑器、移动笔刷或生成本地 Mask 预览不得暗中发送收费图片请求。用户点击生成前须知道实际 Image Target、所选素材、模型能力与可能费用；由 D-008 的账本与 ImageJob 控制执行。

### 6.2 跨 Provider 编辑与能力真值

1. **允许跨 Provider 衍生**：原图由 NovelAI 生成，合法用户操作可选择 ComfyUI/OpenAI Images/其他已接入 Target 进行 Img2Img、Inpaint 或 Upscale，生成独立的子 ImageArtifact；保存原父图、Mask、参考素材、编辑 Prompt、执行 Target/Model/Workflow、非秘密请求证据和新 Job/Attempt。
2. 不能把兼容一个 Provider 视为支持所有编辑方法。
3. 所选 Provider 无法满足**必需的局部修改、身份保留或输入约束**时清晰说明并暂停，不静默将 Inpaint 改成 txt2img、丢弃原图/Mask、自动更换收费 Provider。允许以后用户确认的显式降级，但不是 D-010 的默认行为。
4. 模型生成输出并不保证 Mask 外未编辑的像素不变。若提供“合成保留原图未编辑区域”后处理，必须将合成操作及潜在接缝/色差作为独立可审计衍生，不能声称 Provider 原生精确无损。
5. 多步骤处理与返回多张图片仍经不可变 DAG + D-008 Durable Job Ledger，不能为各 Provider 各建一个图片历史和账目。

### 6.3 版本历史与当前展示指针

1. **产生版本 ≠ 自动切换展示**。原图、再生成、局部重绘、Upscale 全部保留，可按父子 DAG 浏览/对比并从任意合法历史节点重新分支编辑。展示选择独立绑定确切的 Session/Branch/Annotation/Scene（按最终产品契约），不写回剧情或其他分支。
2. 异步编辑/生成完成后，**默认先入历史并提供预览/选择**；不应在用户已经切换版本/Branch/SavePoint 后让迟到结果抢占当前显示。以后若允许“一键生成并使用”，须以用户明确意图和目标选择版本的 expected-revision/CAS 防止竞态。
3. 用户可隐藏当前展示、恢复曾选版本、审阅 DAG 关系和操作证据；具体 Gallery 按键、比较交互、批量选图与移动端布局在 Round 11 继续确定。历史不以聊天 swipe/delete 形式代替。

### 6.4 删除意图与引用安全 GC

1. **分开语义**：`hide`（当前视图不展示）、`remove_from_collection`（取消某个 Gallery 索引/集合成员关系）、`soft_delete`（标记元数据待清理）、`physical_gc`（最后才回收不可达内容），这些不是等价操作。隐藏/取消选中**不代表**物理删除。
2. 至少包含当前/历史 Session Revision 与 Branch、SavePoint、原图/衍生 DAG 父节点、Mask、编辑操作引用、活跃/可恢复 Job、用户晋升 Reference 与其他合法 Package/Library/Project 资源绑定。软删除不能让仍有依赖的父版本/Mask 消失。
3. GC 与普通 UI 事务解耦，先作引用可达标记/预清理，给出引用阻断原因；清理必须具备对崩溃/并发/导出恢复的安全机制及可审计记录。具体宽限期、跨快照遍历算法、撤销窗口和缺失资源处理留待 Round 11。
4. 用户要求彻底删除素材时应明确其可达阻断与可释放的持有者，**不能自动删除 SavePoint/其他分支/已批准参考库以完成请求**。

### 6.5 SavePoint/export/import 的媒体闭包

1. **存档必须明确声明承诺何种可恢复性**：只保证展示所选成品图片的“展示级”，或包含 DAG 父图、Mask、编辑参数及可合法携带参考资产的“完整可编辑级”。两种导出目标不能混淆；需要恢复编辑历史时，闭包必须覆盖所有引用的媒体依赖。
2. 正式 Native SavePoint 恢复应还原其原分支、原 Revision、选中展示版本和所需引用，不能因为当前其他分支的最新版覆盖旧存档显示；操作 DAG/Mask/参考库的有效闭包纳入原有 AssetStore 安全保护。
3. 如以后支持明确的展示级退化，必须告知“无法完整继续编辑”，不得悄悄称为无损导入。具体包格式、资产去重/冲突 ID 映射、导入事务和失败回滚在 Round 11 决定。
4. 不应把用户本地的 Secret/API Key 混入可分享的存档或编辑证据；导入图片和 Mask 不意味着可对第三方重新分发不具许可的资料。

### 6.6 从图片版本晋升为参考资产

1. **晋升是显式、可审计的用户/作者操作**：选择 `character_identity`、`outfit`、`style/vibe`、`environment` 等用途，并选择当前 Session/作品/用户明确允许的共享范围。任何随机剧情图片、模型误画元素不能自动成为角色外观或正式世界事实。
2. 未经授权，不能将某分支秘密或未来图像升格成跨分支共享素材。
3. 参考库持久绑定有效 ImageArtifact/AssetRef、版本/用途、来源与授权范围，参与 SavePoint/GC 保护；撤销晋升只解除授权绑定，不能在存在其他可达引用时毁坏图片。自动参考选择仍服从 D-005/D-006 的角色/状态/权限门禁。
4. 具体审批 UI、预先裁切/生成身份标准图是否另收费用、同步导出规则及晋升与引用撤销时的事务语义在 Round 11 细化。

### 6.7 D-010 明确排除的未获批准细项

本轮**不冻结**：Mask 灰度方向、alpha/bit depth、坐标原点/裁剪/Outpaint 精确协议、草稿自动保存频率和存储 schema、完整 Provider 编辑能力矩阵、Gallery 分页/操作 UI 具体控件、GC 的默认宽限天数/回收算法实现、导入/导出包格式、参考晋升对话框、视频/图层 DCC 编辑器。D-009 已含的 Img2Img/Inpaint/Upscale 功能范围不代表每个 Provider 适配已经完成。具体细项留给 Round 11。

## 7. Round 10 historical options — **C approved**

**A · 简约编辑与手动清理**：基本笔刷 Mask、单个 Provider 操作、线性历史，删除主要是隐藏。实现轻但跨 Provider 和资产治理不足。

**B · 强交互编辑与用户管理**：完整画布与 DAG 管理、手动批量操作，容易把 UI 与存储权威耦合。

**C · 能力感知的可逆工作台 + 引用安全生命周期（已确认 D-010）**：Canvas/Mask Draft 与后端 Native Mask 输出分离，经 Capability Negotiation 后由 Adapter 编译成实际编辑请求；操作历史无损、分支选择独立、引用闭包保护、用户主动批准的参考图晋升。**本节作为选择记录，详细规则请读 §6。**

## 8. Round 11 已定案：方案 C — 精确规范详见 media-precision.md

完整规范请读 [media-precision.md](media-precision.md)，不在这里复制表/字段。**Round 12 的真实 Provider 能力、组合限制、付费降级与联测未批准**。

### 当时 A/B/C 候选的历史记录（不是继续表决）

以下三种是第十一轮审议时的历史备选；**已选择 C，A/B 不再是有效的实施候选**。

- **A：简化二进制 Mask + 最小历史 UI**。提交时将绘制层直接转成与原图同尺寸的 8-bit Mask 位图并存成新的 Mask Artifact；草稿仅需周期保存单份 Snapshot；Provider Adapter 通过明确的通用输入函数转换。Gallery 只做基础列表/选中/历史，GC 始终按完整引用扫描。方案简洁，但笔画级撤销与多设备冲突精度有限。
- **B：结构化笔触日志 + 强编辑工具**。持久化 Stroke Commands（笔触、填充、图形、变换、Undo/Redo）与完整 GUI，提交前可重放生成 Canonical Raster Mask；Gallery 默认显示完整血缘树、详细引用操作和存档包依赖。高度可编辑，但超长 Stroke 日志、平台差异、重放稳定性、压缩与存储复杂度更大。
- 画布命令只属于可撤销草稿层，按资源预算建立周期性 Mask Checkpoint；Adapter 使用显式 capability map 转换 Mask/上传参数；Gallery 默认简单时间线与展开 DAG，可解释地隐藏/软删/GC；跨设备 CAS 和失败恢复不丢原图。此项细化复杂但较适合跨平台、长会话的 Atria。

### Round 11 precision topics

2. **Provider matrix**：按 P0/P1 的实际 Model/Workflow 能力声明 txt2img/img2img/inpaint/upscale/多图/透明度/批量、上传限额、远端对账、计费观测；列清 supported/unsupported/unknown，严禁由厂商名推导。
3. **Gallery**：工作台入口、跨作品/Session/Branch/Scene/Actor 的默认查询层级、缩略图懒加载、DAG 展开/比较/选择、批量隐藏与危险删除 UI，异步 Job 迟到的选择 CAS。
4. **GC 与 Reference**：资产 Root 集、历史 SavePoint/失败 Job/待恢复 Mask/参考晋升/下载导出占用、回收宽限、审计报告、孤儿 Blob 处理。

**D-011 已正式写入 docs**。进入 Round 12 实际 Provider 编辑功能矩阵、Reference/Vibe/LoRA/ControlNet 组合与降级/联测，未讨论完成之前不创建正式开发分支。
