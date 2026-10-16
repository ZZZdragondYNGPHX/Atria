# D8 — U2 Native Graph + Inspector 双向创作与运行体验（已冻结）

> 2026-10-15 第八轮用户选择 **U2**。跨模块冻结摘要见 [decisions.md](decisions.md) D8。此文是 **V3 Authoring / Run UX / Diagnostics / Approval / PC-Mobile 的唯一详细设计入口**，不替代原世界、Studio、模型/预算、Tool/权限或 Serene Canvas 视觉权威。继承 D1–D7、HCM-01–08、T2 Native Host 单一执行者、G2 动态图、C2 Context 隔离、F2 计算、S2 Tool 授权、N2 叙事/Project 质量与 **旧 Single/Spec/Agenda/Loop/Director 模式/代码/旧 UI 零兼容硬切**。本轮仅冻结 docs，不修改 main 或运行产品测试。

## 1. 现有产品依赖与具体取舍

- 统一视觉权威：[Serene Canvas](../atria-serene-canvas/index.md)、[已冻结决策](../atria-serene-canvas/decisions.md)、[视觉规范](../atria-serene-canvas/visual.md)。沿用纸墨、实白工作纸、轻动效、深灰文字、悬浮 Dock、底部手机导航与既有 Atria Tokens/Primitives/Patterns；不创建 V3 专用主题、另一套 Shell 或不相容的 CSS Token 系统。
- **Run 页 Timeline 默认、Graph 可切换、手机优先 Timeline/Bottom Sheet** 已由 Serene Canvas 正式冻结，D8 直接遵守。不要为新 Graph Editor 强迫用户在运行态默认看 Canvas。
- 旧 `public/scripts/agents/orchestrator/workspace/orchestration/page.js` 依赖 mode/preset 与固定流程，`public/scripts/lib/agent-workspace/graph-view.js` 是有界 SVG 图预览；**不能以增补旧页面作为新 V3 实现**。旧图可作静态审计/图算法参考，但旧编排专属 Mode/Generator/Legacy Bridge/Workspace/RunPanel 退出。
- `main:package.json` 已有 Cytoscape 依赖，但引入完整画布编辑的适用性尚未通过 PoC。D8 **不锁定** Cytoscape、React Flow、SVG、Canvas 或 React/Tailwind 重写；在当前原生 ES Modules/DOM/CSS 与 Serene Canvas 组件体系内评估小范围 PoC、许可证、维护成本、图布局、输入与无障碍要求。不能以技术选型增加并行状态管理框架。

## 2. 一套 Agents 工作台，两种明确不同的图

| 工作面 | 基本视图 | 权威/允许的用户行为 |
| --- | --- | --- |
| **Plan Authoring** | 新 Graph Editor / Node-Edge List / Inspector | 单一 PlanDraft 数据模型；作者可修改草稿，检查并发布新的 immutable PlanRevision，**不驱动运行中的 Graph** |
| **Run Inspection** | **Timeline 默认** + Graph 切换 + Inspector | 只读 Host RunProjection/GraphRevision/EffectReceipt；Stop/Cancel/Retry/Approval 通过显式受权 Host 命令，不直接改 runtime node state |
| **Evidence & Diagnostics** | 任务状态、Source/Memory/Tool/Cost、GraphPatch、失败根因、可见 Trace | 从合法精确 Source/Receipt 形成只读可观测投影，受 D4 Audience/权限/脱敏与 D5 Usage 实际来源约束 |
| **Approval & Recovery** | Pending 条目、准确操作 Diff、可信审批、Unknown/Rerun 判定 | D6 Host Effect Gate 执行最终认证；UI 显示请求/响应状态，不能伪造批准、业务已提交、远端已撤销 |

普通 Play 用户默认继续沉浸 Narrative Card/Composer/玩家选择，只有与自己相关的可见状态及必要审批浮现；创作者/高级用户按权限进入完整 Plan/Run/Diagnostics 工作台。

## 3. U2 核心：Graph Canvas 与精确 Inspector 双向同步

- **唯一 Draft 语义来源**：桌面 Canvas 连线/移动/添加节点与右侧精确 Inspector、节点/边列表在同一个 authoring transaction 上修改同一份 PlanDraft。任意视图的语义改动即时在其它视图同步；Undo/Redo、Draft 保存/重载、dirty-state、离开提醒和合法冲突处理作用于同一编辑历史。布局/坐标/缩放/折叠只是非权威视图状态，不能隐式改变任务顺序。
- **Node/Edge 强类型**：以新 V3 Graph 定义 Agent、Router/Condition、Planner、Tool/Effect、Fanout/Join、Judge/Review、Wait/Approval、Output 等逻辑节点与输入输出 Ports。明确边的数据类型/控制语义、可选/必需字段、OutputOwner/ResultEnvelope、可用 Capability 与 Budget；端口不兼容、非法 DAG/loop、不满足权限或来源时标真实错误，**不因画出连线就承诺可执行**。
- **Inspector**：按当前节点合法字段分组提供任务目标、Model Routing/Quality Floor、D4 Actor/Source/Time/Branch audience、输入/输出 Schema、D6 Tool/Skill/MCP/A2A grants、D5 Budget/Timeout/Retry、D3 Join/GraphPatch/replan 限制、D7 Narrator/Expression/Intent/Project Output 选择与审核条件。无配置/unknown/stale/denied 要分别显示，能力声明不等于实际授予。
- **交互能力完整**：创建、复制、删除、重排、连线/改连边、查找节点、筛选和定位问题均有 Canvas 与列表/Inspector 两条可用路径；键盘操作可完成同样的节点和边变更。不将拖拽或 hover 设为唯一方式。删除仍被依赖的 Draft 节点前显示影响范围，运行中已提交的 Effect 不因编辑器删除节点而撤销。
- **Authoring Graph ≠ Runtime TaskGraph**：用户编辑的 immutable PlanRevision 和 Host Run 内动态 TaskGraphRevision 分别显示；G2 Planner 实际 GraphPatch 在 Run Graph 以稳定版本/新增节点呈现，只读而不可通过拖动运行节点执行拓扑修改。
- **大图语义保持**：允许搜索、聚焦、分组、折叠、缩放、稳定布局、虚拟化与视口裁剪，但任何 UI 折叠/未渲染节点仍属于完整 Host validation 和 execution graph；现有 SVG 预览 80/240 渲染上限不自动成为 V3 业务图上限。真实性能阈值由 PoC/实施实测定稿。

## 4. 原生 Draft → Validate → Publish → Run 合同

1. **Draft**：Authoring 基于准确 owner、Project/Workspace 与 Plan 基线权限和版本编辑；Draft 未保存与已保存状态清晰；View 本地缓存不能被当作 Host 的正式 Plan。
2. **Validate**：Native Host 检查所有节点/Ports/Edges、依赖和 bounded loop、OutputOwner、模型/工具能力声明、Source/Actor scope、所需预算/版本与有效资源。返回 NodeId/EdgeId/字段级可定位 issues、source/version evidence。纯 Validate 不发送 Provider、执行 Tool、解析 Secret 或发生业务修改；未能核验时 unknown/blocked，不伪装通过。
3. **Publish**：对当前 validated Draft hash、Owner/Source 基线与精确 CAS 再校验，发布新的**不可变 PlanRevision**。发生编辑冲突或权限/依赖变化就重新校验或明确解决；浏览器内存改变不等于 Host 发布成功。
4. **Run**：Host 在最新 Session/Branch/Source/PlanRevision/Model/Capabilities/Budget/D6 Approval 下独立做运行准入，创建持久 Run。Published≠Running≠Effect succeeded≠正式 World/Studio Commit。
5. **Preview**：结构/可见性/纯局部布局只读与真实模型/Tool/外部 MCP/A2A/Studio 写入的 Preview 分离；任何网络发送、收费、外发或可变更状态都必须显式显示范围并经 D5/D6 权限/预算准入，不能靠“预览”标签免审批。
6. **版本化**：支持 Draft/Published 差异、当前 Run 所钉住的 PlanVersion/SourceRevision、最近合法的完整校验结果与冲突恢复。可以提供全新原生节点示例，但**不迁移、不包裹、不一一映射**旧五模式/旧预设。

## 5. Run Timeline / Graph / Inspector 的统一 Host 投影

- **权威数据**：Run/NodeAttempt、TaskGraphRevision、GraphPatch、JoinReceipt、EffectIntent/Receipt、批准/拒绝、成本与 final result 仅来自经授权的 Native Host RunProjection；Browser 只持有选择/筛选/滚动等展示状态。
- **Realtime/Recovery**：Host snapshot + 有稳定 Run/Owner/Scope/Generation/Revision/sequence 的流式 delta，断线或切后台后重取当前合法 snapshot 再去重；旧 epoch、重复、乱序、迟到事件不能改变用户看到的真实执行状态。
- **Timeline 默认**：admitted/queued/running/awaiting_approval/reconciling/partial/completed/failed/cancel_requested/stale/unknown 均有文字和来源/时间状态；并行执行与 Join 结算按 Host receipt 顺序呈现，点事件进入相关 Attempt/Tool/Source/模型/费用 Evidence。默认只呈现合法可见的高价值事件，细节按需展开。
- **Graph 切换**：同一 RunProjection、同一 selection、Graph 版本与 Type 状态的另一种可视表示，展示父子/并行/等待/Review；不重复执行、重算或隐式升级权限。
- **Inspector / Diagnostics**：解释缺 Route/Capability、Budget exhausted、Join waiting、Source stale/Actor denied、Tool/外部 unknown、失败 attempt、真正费用与估算费用、失效 ResultRefs、审批待处理、允许的下一动作。失败原因有精确 Node/Effect/Source 跳转，但不能泄露其它 Actor 私密 Cognition、Secret、外部私有 Tool 内容或 opaque reasoning。
- **Host Action 回执**：启动、暂停/取消、Resume/Retry/Replan/Approve/Reject 由 Host 验证 actor/owner、Run epoch、原 Effect/审批身份并产生回执。UI 可以呈现“提交中”，未收到可信 Host 响应不能先声称“已停止/已撤销/已发布”。Trace 导入/历史 Replay 默认为只读诊断，不能自动重新发送 Effect。

## 6. D6 精确可信审批与恢复体验

- Pending Approval 可以从 Run Timeline、工作台待办或被影响的 Studio Task 直接打开，不要求用户先在图里寻找微小节点。桌面为同一纸墨体系中的 Approval Sheet/审阅纸；手机以 Bottom Sheet/全屏审阅提供同等资料与按钮。
- 关键展示：**谁请求了什么**、目标和原权威/版本、风险 R0–R3、规范化参数/变更 diff、Agent/Run/NodeAttempt/EffectId、外发目标和数据范围、已知/未知成本、后果能否回滚/撤销，以及该次许可覆盖什么。长差异提供分页/必要的原资源跳转，不用被截断的片段冒充完整批准依据。
- 点批准并不直接给 Effect 盖章。由可信身份与绑定的原生授权通道执行，Host 根据 ApprovalIntent/nonce/lease 与当前 Owner/Plan/Scope/Boot/Branch/Revision/ParamsHash/Endpoint/Budget 再验证。普通 Boolean、模型声称/Prompt 中“用户已同意”、前端 host.authorize 不能成为真正授权。
- 审批等待需可持续、可取消、刷新/Host 恢复后重新检查；不得阻塞 status/cancel/control 通道，不能延用旧批准自动发出已改变输入的危险 Effect。无法验证可信审批时需 fail-closed，但合法纯 READ 不因此全部不可用。
- Cancel_requested 与远端已取消/退款/业务事务回滚是不同状态；操作结果 unknown 时应给出“查询原任务/核对 Receipt/需要人工处理”而非通用“重新执行”按钮。

## 7. Serene Canvas 一致性与 PC / Mobile 功能等价

**Desktop（Windows/CachyOS Linux）**

- U2 的计划创作主要按 Serene Canvas 三纸布局：资源/节点 Palette、中央 Graph Canvas、右侧可折叠 Inspector；Source/Problems/Operation history/Review 在可伸缩工作纸或 Sheet，具体宽度/位置/库由真实视觉稿与实现确定。
- Run 则默认时间线，Graph 是切换；高频编辑保持键盘搜索、快捷键、焦点恢复、命令提示、Undo/Redo、文字编辑即时反馈。现有 Shell 的 Rail/Focus/Dock/Sheet、tokens、主域导航继续使用，不新增编排专属顶层 Shell。
- 与 Studio/Runtime 的真实资源/Role/Route 与 Project Task 审阅互通，必要时从当前 Source/Agent/Model/Project 一键跳转，返回时保留本地 Draft 和合法选择，不偷偷创建第二状态源。

**Mobile（Android Termux + 浏览器）**

- **列表 + 精确 Sheet 编辑是一等入口**：完整支持创建/删除/复制 Node，编辑输入输出 Ports/Agent/Edge/依赖、Model/Tool/Source/Output/预算/审批配置、Validate/Publish 和 Undo/Redo；不要求必须使用小尺寸画布连线，不能把手机做成只读版。
- Graph 仍可用于浏览、搜索/定位和有条件的局部连线，但所有语义操作必须具有可触控/键盘/无障碍替代。运行仍优先时间线，详情及审批 Bottom Sheet，使用现有 Bottom Navigation/Android Back Resolver/safe-area/soft keyboard 机制。
- 页面切换或锁屏不等于 Host 停止；Termux 进程真正终止后需 Host 重启/receipt reconcile，不承诺系统级常驻/唤醒。移动适配只改变 UI 布局，不另造不同 Host Run/Plan/Effect 协议。

## 8. 无障碍、长图性能与隐私

- 键盘焦点/方向导航、Node/Edge 列表替代、触控目标、可读名称、错误关联、禁用说明、状态 live announcements、字体/缩放、高对比语义文字和 reduced-motion 都是验收目标；动作不能只靠 hover、颜色、细微动画或鼠标右键。
- Graph 视图布局/多边路由与 Host 存储隔离，允许分层布局/增量渲染/可视区裁剪/按需加载；不得因此省略实际 Node 验证或修改 Graph 语义。长 Run 时间线/Source/Trace 分页或虚拟化，控制/审批通道保持响应，禁止逐个 token 重排整个 Graph。
- 优先现有 DOM/ESM、Atria Primitives/Patterns 和 Serene Canvas 视觉基线，不默认引入另一 SPA 框架。Cytoscape 已安装只是候选；完整交互/触控/无障碍/性能需单独 PoC。没有验收不能声称支持千节点流畅或移动端完整可用。
- 只缓存非权威作者 Draft/画布几何/选择等；受保护 Source/Run 审计/Model Secret/Provider opaque state/费用真相不得拷贝到本地 UI 作为第二持久层。项目/Owner 切换、Source 撤销、旧 Stream 迟到时基于 Host 真实权益失效展示。

## 10. D9 下一轮 E0（未冻结）

第九轮将核对实际 main 的 Plan/Run/Effect/Receipt/Output/Projection 接口与旧依赖，绘制完全删除旧 Orchestrator modes、mode adapters、Browser Runner/Checkpoint、legacy UI、capsule/takeover 的消费者清单与实现阶段依赖；列出失效/恢复/权限/质量/性能/PC 与 Mobile/Termux 真机验收矩阵与交付阻塞。**D9 还没有获得选择，不能提前宣称所有接口/工程阶段已审计闭合，也不得开始改 main。**
