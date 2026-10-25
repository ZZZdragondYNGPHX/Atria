# 剩余领域适配范围与验收

从 [index.md](index.md) 进入。**状态：已交付，本机推荐验收完成。** 全局范围见 [decisions.md](decisions.md)；授权、V3 与提交恢复细节引用 [orchestration-approval.md](orchestration-approval.md)，执行结果与未验证扩展边界见 [Record](../../../records/plugin/atria-mcp-main-adaptation.md)。

## 目标

为 Runtime / Prompt、World / Session / Cognition、Memory / Learning、Storage / Media、Skills / Extensions、Browser 与 MCP 基础设施明确完整工作流、必要产品侧接缝和可核实的验收要求。覆盖状态由 [capability-matrix.md](capability-matrix.md) 统一维护，本模块负责详细设计。

## 1. 范围原则

完整适配当前已存在的产品权威与 MCP 支持领域，补足真实工作流；源码中已有的能力和未来设计分开。产品尚无正规执行端口的能力明确不支持，不能用底层存储、任意代码或旧接口替代。

逐项记录：已有可复用、需要更换合同、需要新增映射、需要最小产品接缝、原生不支持。单独增加 action 数量不构成覆盖完成；至少能从准备 / 检查走到原生结果观察，并处理该工作流实际存在的冲突和未知状态。

## 2. Runtime / API Preset / Prompt

### 范围

- 保留 Connection / Model / Route 的原生 CRUD / CAS，移除已退役 credential-target permit 假设，继续通过当前 SecretRef 和原 endpoint / owner 验证。补当前 used-by、archive / delete 与依赖保护；不输出 Secret 值。
- API Preset 复用 `saveApiPreset` 的 Model / Generation / Route 原子发布。不得用多次独立更新拼接，避免部分保存或改动其他共享 Route。API 与 Prompt 的所有权按主线现有模型分离。
- Prompt 版本与共享 / 私有派生、上游升级保持精确 revision；采用、发布或重绑定使用原存储语义，预览与试跑不隐式采用。
- 补 `preview/draft`：同一 Source / environment 下比较 authored / effective / wire diff，保持 `sent:false`、unpublished。
- 补 `authoring/try`：显式 sample / limits / send，属于收费执行；结果保持 unpublished，不隐式创建或提交 Session。需要稳定原生 operation 身份支持结果查询、取消与丢 ACK 后的观察。
- Prompt candidate 保留 declare / prepare / check / apply / rollback，补原 Store 已实现的 discard。带 Plan programRef 的候选沿 Plan Binding 采用，不能借普通 Route apply 绕过绑定；所有 target 来源于原 preflight / choices。

### 验收

- 两个 Route 共享 Model 时，编辑一个 API Preset 只改变其应有资源；旧指纹、fallback 环和 role 错误拒绝，原子发布无部分结果。
- 草稿预览无 Provider 请求、无持久版本；未消费草稿、源漂移、Package 草稿拒绝。受限 source 的 Prompt disclosure 继续由产品裁定。
- 试跑精确发送一次；取消与 ACK 丢失后可观察原 operation，不能用重新发送获得结果。试跑成功仍不代表采用或发布。
- 被 Route / Plan 引用的候选不能 discard；rollback 保留用户后续修改；Plan 候选不能走普通 apply。

## 3. World / Session / Chronicle / Archive

### 范围

- World / Knowledge 创作继续走 immutable Library revision 和 Project Source 权威，覆盖现有 promote / fork、Knowledge binding、Work 默认与 Session resource setup。前者使用其 integrity，Session 使用 revision，不能混用。
- 起始世界预览按 player / narrator / actor / subject 投影，展示 lawCoverage，明确 `before_initialization_actions`。它不创建真实 Session，合成 Subject 身份不当作运行身份。
- 会话认知 display、inspection 和 Prompt / Context audience 分开；作者 inspection 使用原 informationRuntime 授权及当前 Project source hash，不制造通用 authorGrant。
- hypothetical prepare 归受控本地计算 INTERACT：可执行规则、时钟模拟和原 Package 的有界 QuickJS computation；私有候选不发布，不调用 Provider，不改变真实 Session HEAD / clock / outbox。current 只证明 artifact 当前性。
- Chronicle 补 `key / tick / clockId` 与 offset / factId 两类游标，保持当前公开历史投影边界。其 memory 展示不是 managed personal memory 或 Hybrid Graph。
- 保留 Session 命名、manual / quick Save、Branch 操作和 SavePoint restore。restore 派生新 Branch，既有历史保留；Ironman 约束仍由产品执行。
- Archive 保留 export / capture → staging / finalize → preflight → 专用 password SecretRef → import → 精确目标观察；补 staging cancel。依赖、已有目标、特殊 resume 与已花预算保持原合同。
- Package / Resource Bundle 同样保留精确引用、完整 closure 审查、独立正式导入和安装；Archive 不作为 Package 安装，Package 版本不被资源默认设置悄悄替换。

### 验收

- 新 World revision 不改变已钉住的 Package / Session；设置版本冲突拒绝；起始视角、法则绑定与实际初始化后会话分别检查，预览零收费、零真实会话创建。
- 错误 view、旧 anchor、Project source 改动或 inspection 撤销后拒绝；Context 中模型能使用的信息不会因此自动披露给玩家或 MCP。
- hypothetical transaction / clock 两类成功；预算超限、非法 scope / view、非确定性或要求模型 Task 的请求拒绝。执行前后真实 HEAD / clock / outbox / 费用保持；真实来源变化后 current 为 false。
- Chronicle 过去与当前事实不同、有效时间与记录时间不同、长链分页和 cursor 失效均正确；当前私有来源不泄露旧事实存在性。
- Save / restore / Branch switch 与旧 HEAD 冲突；Archive 往返核对 Timeline、Variants、World、managed memory、Persona、图像附件和 Knowledge binding 语义。
- 缺依赖、错误 hash / offset / purpose / SecretRef、TTL / boot 改变、既有 Session 或不合法 resume 拒绝；取消只清 staging。import ACK 丢失先观察精确目标和 closure，无法确认保持 unknown。

## 4. Memory / Goal / Evidence / Experience / Evolution

### 范围

- Graph 使用已有无头 Memory authority 与原 source ticket / Branch / fingerprint / commit receipt；真正属于 loaded browser scope 的 injection / recall 投影仍保持其实际作用域。
- managed memory 属于原 Lifecycle / Information 权威，不能当作 Graph node CRUD。已有 acquired 内容、received 版本、basis 和保护角色遵守原政策；允许的状态 / clarity / use / applicability 更新通过原声明 Action / Task 和 Session publication 验证。
- 原有 run mode 会限制 direct app.command。补可用命令目录和纯 preflight 的最小接缝，不开放任意 app.command、statePatch 或裸写接口。
- Goal / Evidence / Experience 已有受控创建、evaluate、bind、wake、反馈、清理等流程复用，补 Goal context、Actor 关联、continuation inspect 和当前投影；snapshot 与会产生 reconcile 的 inspect 不混标。
- Evolution 退役 `workspace-prompt / workspace-strategy`，改接原生 `plan-prompt / plan-strategy`，同时保留仍合法的 Skill / Project target。目标必须来自原 preflight choices，钉住 binding version、planRef、node 和精确 module。
- 学习完整流为 preflight choices → declare / configure / budget → 显式 start → observe → label → 独立 publish → rollback / reconcile。受控反馈不会自动启动学习或发布；自动策略如需启用，作为独立明确配置操作披露原生预算与后续效果。
- 补 quality profiles 的 revision / readiness 发现，以及原生 prediction、Session / Project comparison 的 prepare / current / feedback / outcome。结果是 advisory，不自动采用或提交；模型判断与 Host checker 证据继续分开。

### 验收

- Graph 源变化拒绝；unknown 通过原 commitId / receipt 查询。managed memory 不能伪造 received、改 acquired text / basis / recordedAt，保护角色政策有效；withdraw 不冒称删除历史。
- Goal Branch / scope 变化转 stale；Actor 隐藏目标不因关联查询泄露；重复 wake event 不重复发送；unknown 阻止错误重发；Project continuation 到 Review 停止。
- client trace 不能冒充 Host outcome；Source 删除使依赖认知材料失效，受控反馈不暗中 wake。
- Evolution 旧 target 拒绝，Binding 漂移阻止发布；策略只选声明备选并收紧允许字段，不能提高权限或预算；rollback 不覆盖并发修改。
- comparison 的 abstain 不被当作选中；source 漂移 current 为 false；feedback 只接受原交易 Receipt。没有原生可测证据时保留 not_measurable / unverified。

## 5. Storage Center / Media / Binary

### Storage 范围与后果

固定工作流：`snapshot / detail → preview → execute → task / tasks / stop`。snapshot/detail 为 READ；**所有 preview，包括 history，都创建持久任务，归 MUTATE**。准备任务和正式业务效果分别清楚披露。

| 操作 | 原生边界 |
| --- | --- |
| trash | 当前保留 30 天；运行中对象、引用和恢复根可能阻止回收；回执明确可恢复性 |
| restore | 保留原 identity，校验空闲身份、完整性、依赖和 Blob；后台效果暂停或 unknown，Extension 恢复后禁用；Ironman terminal 不复活 |
| purge | 永久清除；显式操作可以发生在保留期内，不能误称必须等 30 天 |
| clean | 仅原生允许的过期 checkpoint / 已隔离无引用 Blob |
| repair | 仅原生支持的 Project / backup paused-review 阶段，可能继续 purging；不是通用修复或必然可撤销 |
| history | 原生经过校验的本地 Git 文件发布，不启动模型或远端操作 |

旧 delete 的结果改为真实生命周期与任务状态；按实际回收 / 清除后果保留独立精确授权，永久删除使用一次性 DESTRUCTIVE。repair 若继续删除必须按该效果声明风险。MCP 不接原始 storage resource write/delete 旁路。

### Media 范围

- 保留 Session 的 Illustration / Director / Gallery / Mask / img2img / inpaint / Speech 与原 job、预算、外传批准、checkpoint 和取消语义。
- 新增独立作者链：Library exact imageTargetRef / imageRenderingRef → prepare → 费用与外传审查 → start → observe / reconcile / cancel → 作者画廊归档 / 取消归档。
- 当前作者能力是 raw txt2img；Session 的 img2img / inpaint / mask 不被包装成作者域已有能力。作者归档与业务删除分开。
- 作者 image / thumbnail 补 owner + operation / image / version / hash 受控描述和分块交付；画廊补有界分页。所有 bytes 继续走固定用途 Binary Lane，元数据分页不能代替 bytes。

### 验收

- Storage 依赖 / 引用阻断、版本变化、blocked / partial、对象边界 stop、重启后的任务观察；failed / stopped / paused-review 要新 preview，不自动重试 execute。
- 回收恢复 identity 不变、身份占用冲突、永久清除后不能恢复、恢复不自动继续外部效果；preview 的持久任务不能被记作纯读。
- 作者与 Session scope 不混用；准备过期、费用 / 目标变化拒绝；未知生成不重发。归档不当作删除，停止不当作退款。
- 分块与大载荷核对 total / range / hash / purpose / owner / boot；跨账号、跨用途、错偏移和过期句柄拒绝。Session Archive、Package、Skill、Media 不能相互冒充用途。

## 6. Skills / Extensions / 资源资产

### 范围

- Skills 仓库 scope 对齐当前 global / project / package / preset / character，移除 orch-preset。Native invocation 当前只选择 global 与 project/package，preset / character 的资产管理不被宣称可用于 V3 调用。
- 文件、历史、pin、candidate prepare / check / diff / apply / rollback / discard、移动与迁移复用原 inventory / installed hash CAS。Package 原件只读，候选只改 SKILL.md 正文并保留 frontmatter 和 supporting files；保留原 already 状态。
- URL 导入沿当前 owner / client / hash preparation，明确当前只导入单个 SKILL.md。payload staging / preflight / install 保留完整 supporting files 和原容量限制。
- 补 bundled manifest / import、Skill invocation 偏好，以及原生已有 embed pack / extract 流程。后者是 preset / character 嵌入资产的传输与材料化，不授予 Native invocation 或脚本执行权限；使用固定有界接口和精确目标审查，不直接暴露宽泛 legacy raw write。
- Extension 沿 inert Git / local preparation → 源码检查 → exact review → disabled install → 独立 enable / targets；补 settings / official illustration 的当前配置覆盖，delete 关联 Center 回收 / 恢复，恢复后保持禁用。
- Package / Library / Resource Bundle 的 immutable refs、used-by、完整映射、fork / promote、导入安装和 closure 使用当前原生权威，复用已有 Binary Lane。

### 原生不支持的边界

当前不新增 Skill 依赖自动安装或任意脚本执行器、私有 Git 凭证流、任意二进制 / 子模块 Extension 安装、HostPlugin 安装运维和作者域完整图像编辑器。若用户需要，属于额外产品能力，应单独讨论。

### 验收

- 错 scope、Package 写、旧 base、supporting file 并发变化拒绝；已 apply 候选不可 discard，apply / rollback 的 already 正确。scope rename 仅开放原生支持的范围。
- URL prepare 过期、跨 owner/client、payload hash 变化拒绝；bundled/embed 导入保留逐项 conflict / partial 和完整文件，不把单文件 URL 当整仓导入。
- Extension preparation 过期、source / targets / revision 漂移拒绝；安装或更新后仍禁用；安装成功与浏览器实际 epoch activation 分开报告；回收恢复后不自动执行。
- Bundle / Package 依赖精确、映射与版本改变拒绝，unknown 仅沿原意图和原 authority 确认，不重新安装冒充恢复。

## 7. Browser / MCP 基础设施

### 范围

- 保持现有 18 个顶层工具形态，更新内部 Registry、schemas、风险、副作用、可用性、Guide 和客户端示例。退役 action 在策略配置中明确报错，不保留猜测式别名。
- Discovery 与原 Authoring catalog 结合，明确动态路由未展开、权限不可用和原生不支持；源码路由数量不代表能力覆盖率。
- 通用 API 继续只读发现范围；Storage 等新增业务通过固定语义 action 接入，不扩大成任意方法 / URL / body。
- Browser 对齐当前 Shell、Session / Preview identity、截图与 Surface。保持原生编译 manifest 的本地 set/toggle；复杂 controller / A2UI / bridge / remote media 界面无 controls 是当前设计边界，业务能力通过正式接口提供。
- 身份与授权续接按 [V3 模块](orchestration-approval.md)；Journal 补各域原生对象关联与待审批状态，不复制业务数据库或保存授权秘密。
- 保持 control / read / mutation / browser lanes、精确目标隔离、等待审批释放锁。修复验证入口对不存在 test 目录的固定依赖；不为适配主线顺手升级协议栈或增加新框架。
- 分页在完整脱敏后进行，保持 Unicode / fragment 可重组、固定用途 Binary 与当前产品容量。repo / git / artifact 证据继续排除运行数据、凭据和非允许路径。

### 验收

- 真实 stdio initialize、18 tools、每个新增 / 受影响 action schema 和风险匹配、默认只读、未知或退役 action 报错、客户端不支持可信授权时不写入。
- READ 不触发持久 reconcile、播种、模型或外部调用；准备动作实际持久化时分类正确。长任务、审批等待和停止期间状态查询 / 取消可达。
- 并发源变化、Lease 过期、Host / MCP 重启、重复 continuation 和 ACK 丢失按已确认合同处理。失败不能用另一个接口或新意图自动绕过。
- 源码 / Runtime / Browser 证据与 Session / Preview scope 分别核对；重启后旧页面 stale，重新加载后才能取得当前证明。桌面与窄屏检查真实 Shell 和受控 Surface，不将模拟视口称真实移动设备。
- 大 JSON / 任意 Unicode / 边界凭据过滤与 Binary 容量按受影响路径验证；缺少权限、404、冲突、输出超限和未知结果都能被外部 AI 正确区分。

## 8. 产品侧小改动候选

精确实现沿原权威复用。已有正规接口只补 MCP 映射；以下在当前代码中有具体接缝，实施时以完整工作流需要确定最终 shape：

| 接缝 | 目的 |
| --- | --- |
| 原 Command outcome / formal commit 可用性与描述 | 沿第二轮设计补失 ACK 查询和纯预检，避免复制原生规则 |
| Prompt candidate discard endpoint | 暴露已有 Store 实现及引用保护 |
| Authoring trial 原生 operation 身份、结果观察 / 取消 | 收费响应丢失后可观察同一次执行，不另造费用账本 |
| 作者 image / thumbnail Binary 与 gallery 分页 | 作者 scope 可受控获取完整结果，保持固定输出上限 |
| Cognition 可用 view / anchor 与 Lifecycle 命令 preflight | 由原 authority 声明可读 / 可执行范围，工具不推算权限或裸写 |
| Archive import 可导入性与固定 reason | 预检呈现已有 Session / resume 等必然拒绝条件，复用实际 import 校验 |
| Bundled / embed 等 Skill 固定包装 | 复用原仓库逻辑，提供 owner / hash / 容量受控操作及逐项结果 |

以上不包含全局业务重构、通用 approve API、新图执行器、新 Memory store、Skill 脚本执行或任意文件管理。

## 9. 验收矩阵与证据要求

本节原有的全量验证安排已撤销。按本次改动选择最小相关检查，执行约束只见 [Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)；功能规则仍由对应领域模块定义。

## 10. 第三轮确认状态

第 2–7 节保留领域职责，第 8 节保留产品接口范围；具体已实现能力和历史结果见同一 Record。旧第 9 节不再是必做门槛，不能从旧对话的确认记录恢复。

## 代码依据

- Runtime / Prompt：`main:src/endpoints/native-generation.js`、`src/native/model-prompt-runtime/api-presets.js`、`draft-preview.js`、`prompt-candidates.js`。
- World / Session：`main:src/native/product-service.js`、`studio-world-preview.js`、`cognition-inspection.js`、`hypothetical-authority.js`、`session-core.js`、`save-system.js`；`public/shared/native-history-runtime.js`。
- Memory / Learning：`main:src/native/cognition-authority.js`、`lifecycle-authority.js`、`agent-intelligence/evolution-targets.js`、`goal-continuation.js`、`experience-service.js`；`orchestration/plan-evolution-contracts.js`。
- Storage / Media：`main:src/storage/resource-center.js`、`resource-accounting.js`；`src/native/recovery-service.js`、`recovery-effects.js`、`illustration-image-service.js`、`mcp-media-assets.js`。
- Skills / Extensions：`main:src/skills/scope.js`、`repository.js`、`versions.js`、`embed.js`；`src/endpoints/native-skills.js`、`skills.js`、`native-extensions.js`；`src/native/extensions-store.js`。
- Browser / MCP：`main:public/scripts/native/frontend/mcp-surface.js`、`runtime.js`；`plugin:atria-mcp/src/{server,kernel,protocol,operations,scheduler,catalog,policy,semantic-ui,media-binary}.js` 及现有领域 adapters。
