# B1 Knowledge — field, action and authority mapping

基于产品 `9ee9cadba`；先映射再展示。读取路线：index → delivery/coverage S07/S12/baseline/states/validation → 本模块；历史 Actors/EntryPoints/Worlds 不重做。Shared description 保持停用。

## Authority and modes

| 模式 | 原 handler/authority | 展示/保存边界 |
| --- | --- | --- |
| Studio source.knowledge snapshot | studio-workspace → project.save → human Workspace inspect/execute ChangeSet，project Git revision | snapshot 与邻接 source 不变，选 exact knowledgeBaseId；非空/空集合 Source 始终可达 |
| Library bare revision content | library-revision-editor → commitKnowledgeRevision → KnowledgeRepo immutable revision/CAS | entries/metadata 单草稿；原 root rename/history/archive/Fork/Used By/import/export 不改变 |
| installed Knowledge original | package-library-resources → saveRevision（原作品 Knowledge 路径） | 原规则允许编辑，区别于 installed World 只读；不改 World 参数/binding ID/progress；明示后续 generation 消费变化 |
| Knowledge binding | 原 resource reference/authoring controls | binding source.kind + exact knowledgeBaseId/revision，mutable binding 不冒充不可变修订；Attach/Update/Fork/Detach 各走原服务 |
| Session/Save | 原 installed snapshot/session runtime | Studio/Library revision 不自动推进已有 installed exact Session/Save；installed original 显式路径维持其原契约 |

## Field and action map

| 字段/动作 | 原位置及契约 | 新位置/原校验 |
| --- | --- | --- |
| snapshot envelope | knowledgeBase/revision/entries，仅这三键 | 完整 Source，strict root 与 pin UI guard；canonical assertPackagedKnowledgeSnapshot 仍权威 |
| knowledgeBase | knowledgeBaseId/displayName/currentRevisionId/createdAt/updatedAt，kb_/kbv_ native IDs，名称1..256 | 身份/名称 Fields，时间/显式 ID 高级 Source；双 identity/pin 必须相等 |
| revision | knowledgeRevisionId/knowledgeBaseId/entryIds/metadata/createdAt | Source/高级；entryIds 精确包含 entries ID，无 duplicate；字段增删后显式同步派生目录，Source 不静默修复错误 |
| entries identity/enabled/content/metadata | kentry_ ID、enabled 缺失等价启用、content ≤4MiB、metadata object 任意 nested JSON | 原 browser、标题/内容/启用、Exact entry identity、完整 Source；不把缺失 section 默认写入 |
| discovery | keywords/aliases/regex unique nonempty≤1024，regex /imsu | 原 Discovery Fields、共享 normalizeKnowledgeDiscovery |
| applicability | ≤32条件/provider/path1..12安全段/operator/finite scalar；all/any；stateActivation须条件 | 原 typed Fields、共享 normalizeKnowledgeApplicability |
| lifecycle | probability0..100、sticky/cooldown/delay非负safe整数 | 原 Lifecycle Fields、共享 normalizeKnowledgeLifecycle |
| relations | required/related unique exact IDs、exclusiveGroup；必须指向本库 entries | 原 Relations Fields与 missing ref/remove；删除引用条目被阻止，共享 normalizeKnowledgeRelations |
| delivery | target单/多string或kind/id、position before/after、finite priority、visibility unique四kind | 原 Delivery/targets Fields、共享 normalizeKnowledgeDelivery |
| metadata UI | title/label、budgetTier四级、compactContent，其他 nested 任意 JSON | 原标题/预算/压缩和完整 Source，不额外收窄 metadata |
| Add/Delete/Move/Back/Search/Filter | 原 knowledge-entry-browser + editor、确认删除、refs阻止、分页/搜索 | 复用，exact entry ID选择，延迟确认后重验当前 draft/entry/scope |
| Source/Fields/Review/Cancel/Apply | 原 editor单草稿/项目或Library原服务 | malformed/unknown保存原文；失败不清草稿、禁重复审阅，409复制原文/确认重载；receipt只读重试 |
| collection/chooser/tree/Used By定位 | 原 Studio index选择，完整source空集合仅可达 | 完整集合Source、exact知识库 ID、duplicate/local依赖歧义先修复；删改 exact pin 不留下local binding悬空 |

源码：public/scripts/native/{knowledge-editor,knowledge-contracts,knowledge-entry-browser,knowledge-form-controls,library-revision-editor,package-library-resources,studio-workspace,studio-authoring}.js；src/native/{world-knowledge,project-source}.js、repositories/knowledge-repo.js。Project/Package 校验 strict snapshot，但 Library内容与 installed original 更新路径不同，不能统一写入。

## Gaps and replacement gates

G01 原 Fields ||= 创建 discovery/applicability/conditions/lifecycle/relations/delivery，并重置 initialDraft；打开等于改写。G02 非空集合 Source/root名称未专属可达、index selection歧义。G03 Source review自动覆盖revision.entryIds，可掩盖错误pin；root校验晚于审阅。G04 Worlds同类409草稿恢复缺口。G05 async delete确认未重验目标，controls在review期间仍可重复提交。后端 Project local duplicate/overlap、有限graph保持局部防护，不扩成新authority。

N01 共用 editor 原3tests及新增 absent/Source往返。N02 full snapshot strict/pin/metadata/duplicate/relations/localbinding闭包与canonical output。N03 exact chooser/集合Source/增删排序/原邻接/取消。N04 stale delete/review禁重复/失败/409复制与重载。N05 Library/installed原规则、immutable/CAS/exact Attach回归。N06 真实FS/HTTP/disk/.atria、旧Session/Save、语言320/720与键盘/browser。执行证据只进入同一 Record，不以文件存在判定通过。
