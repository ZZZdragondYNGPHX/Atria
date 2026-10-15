# 交给 Claude Code 的前端实施提示词

> 这是用户请求的实施交接输入，不是新 Record、功能权威或最终审美 Plan。后端真实状态只归 [同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md) 和 [E0 §8](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md#8-2026-10-16-后端实施增量与真实剩余-gate)。下面整段可直接转交。

---

请接手 Atria **全产品前端实现**。我已授权正式开始；Codex 负责 Prompt/Behavior 后端，本任务由你负责前端。常规非破坏性工程操作自主推进，不逐阶段索要确认；保护并发分支与未提交内容。不要伪造未接通能力，也不要替我把未定提案写成已批准的最终产品合同。

## 先核对真实状态

1. 先看 Git status、fetch 后的 main/docs/V3 与任务语义分支 HEAD，保护所有无关改动。完整治理为 `docs:README.md`，先读适用 AGENTS。不要重置/清理其他人的工作树或未提交资料。
2. 后端实现分支为 `refactor/atria-native-prompt-preset-deepening`，基于 main@695acf3bc。**它不是 V3 分支，也尚未集成 main**。具体已提交 SHA/实测事实见唯一 `docs:records/refactor/atria-native-prompt-preset-deepening.md`。建立你自己的前端语义分支前先核对依赖；不要将整个活跃 V3 或 docs 分支 merge 到源码。
3. 先读 `docs:plans/refactor/atria-native-prompt-preset-deepening/index.md` → `preset-studio-experience.md`、`backend-implementation.md`、`e0-audit.md` §8。V3 的 Graph/Plan/Run/Approval 合同读原 V3 index 路由，不复制另一套运行时。

## 设计输入与完整范围

三份外部参考位于 `docs:plans/architecture/atria-frontend-audit/design-proposal/`：

- `atria-visual-direction.html`：代表性视觉/交互样例，包括产品演示、手机、18 状态协议、设计系统。
- `atria-function-presentation.md`：189 个功能组各映射一次，完整页面树、功能表现、流程、跨端与未定提案。
- `atria-frontend-guidelines.md`：整体表现指导；当前 native ES modules/DOM/CSS，不预选新框架。

功能范围权威仍是源码审计与正式产品合同；HTML 没画的功能不能删。先读前端审计 `index.md`，按路由读四份分域清单、`interaction-flows.md`、`component-and-architecture-findings.md`、`cross-platform.md` 和 `evidence/function-matrix.tsv`。189 是业务功能/控件组数量，不能只做 189 个按钮或只做 Prompt 页。

覆盖 Library、Play、Studio 全 20 资源视图与 Project Agent、Agents/Memory/Goals/Experience/Eval、World/Knowledge、Prompt、Runtime/Model/Connection、Settings/Account、Skills/Plugins/Search/Regex、Visual Director/Media/Speech、共享会话、存读档/备份同步、Storage 与 Diagnostics。沿真实 route→mount/dynamic import→handler→client→service 检查，不依文件名猜能力。

三参考文件仍包含未冻结的 §8.4 提案。不要把新的通知/声音、独立 Secret 管理页等提案伪装成已有后端。**P-03 的“旧编排折叠过渡区”与用户零旧兼容要求冲突，不能采纳**。其它常规表现参考样例；实质新增能力、权限或数据语义保持原合同，另列差异，不偷加权威或冻结新的审美企划。

## 必须保留的架构和原生功能

- 正式重构零 ST、旧 Workspace、旧 Single/Spec/Loop/Agenda/Agent Director 兼容：无旧 mode picker、迁移、双轨、shim、别名转换或失败回退旧 sender。V3 未接通时显示真实 BLOCKED，不能启用旧模式充数。
- 旧容器中的有效 Memory/Goals/Experience/Eval/Skills 要移到原生入口；Visual Director 是有效媒体功能，不能和旧 Agent Director 一起误删。World/Knowledge、原 Session/Project/Runtime/Storage 同样保留。
- Library 管 Prompt/Generation 资源及生命周期；Studio/Play 共享编辑组件但不创建第二 Preset Store。Library 预设不能全部搬进 Studio。
- 模型、凭证、费用、预算、世界写入、Source/Actor 权限、Review/Commit、PlanBinding CAS 都归原 Host/领域服务，Browser 仅编辑草稿、发受权命令并展示投影。
- 外部可信 JS 插件和 Work UI 沙箱是不同信任边界。Work text/component/hybrid/full 表现与宿主恢复通道（Exit/Stop/Save/Persona/Diagnostics/Reload）均保留。

## 已有后端可直接对接

以源码 `src/native/model-prompt-runtime/README.md` 的真实契约为准；不要复制后端编译器到浏览器。

| 能力 | 前端要做的事 |
| --- | --- |
| 原 Program/Module/Generation/Route、Library/Project/Package exact refs、CAS/Review | 共用资源详情与同一草稿；原件只读、Fork/Derive/保存/发布范围清楚；保持资源引用与生命周期 |
| Module `textMode: literal/template` | 完整原文编辑；literal 能保留任意花括号、CRLF/Unicode，template 仍有类型校验。结构化/原文面板不能悄悄改 body、换模式或删除未知字段 |
| Module `expression` | 展示 global/scene/narrator/actor 范围与 actorId；它是表达范围，不是角色知识、同意或权限。原文与有效 scope header 的差别可解释 |
| `POST /api/native/generation/preview/draft` | 提交 `{request,drafts:[{ref,expectedFingerprint,resource}],baselineDrafts?:[]}`；从原 `/resources` fingerprint 或空 drafts 的 baseline.baseFingerprint 取规范化基线。现有 exact Library/当前 Project 资源可只读预览；Package 先 Fork，不支持的新身份不得冒充成功 |
| Draft 三层 Diff | 显示 baseline/candidate 的 authored/effective/wire、原 source/route/compiler identity 与 JSON Pointer 差异；标明 unpublished/sent:false。Preview 不等于保存、发布、执行或计费；晚响应不能覆盖较新草稿 |
| 私密 Inspector | `native_generation_preview_disclosure_denied` 表示缺完整 player-display 证明；不能用客户端读取/裁剪私密原文绕过。Execute/异步 result 可能 `projection:"restricted"`，有正常 response/routing 与 snapshotSummary、没有 snapshot；生成成功仍成功，显示“诊断受限”，不能显示空的完整 wire或报生成失败 |
| `GET /api/native/generation/quality-profiles` | 按原 exact revision、dimensions、criticalDimensions、sourceRequirements、readiness 渲染。新 rp.narrative / project.agent / rp.creative_refusal 仍 `BLOCKED/source_unready`，不能画成已评测可发布 |
| `generation_provider_content_blocked` | 明确 Provider 协议拒绝，显示真实原因等级/已发生用量；不给自动跨 Provider 重发。普通自然语言拒答只能是怀疑/unknown，不冒充确定事实 |
| 受信 Node Program | Browser 不传 programSelection、Draft authority 或伪造 Grant。精确 Node binding 走原 V3 Plan/Host；没接通的 Node/Run/发布状态如实阻塞 |

Draft 冲突要保留用户文本并刷新 exact base/source；重复点击、取消、卸载、晚结果、加载/失败/空状态都有合法恢复路径。不要把缓存 fingerprint 当权限、Provider cache hit 或零费用证据。

## 当前不能假装完成的部分

E0 整体 NOT_CLOSED。V3 活跃分支已逐步取得原 Budget/Source/Audience Context 内部端口，但 production Plan/Node/Effect/Output/Projection/Evaluation 的完整组合及 `plan-prompt` 候选→独立评价→Review→PlanRevision→Binding CAS/journal/rollback 尚未全部交付。原质量源 `source_unready` 是真实材料缺口。

先核最新 HEAD 可能出现的新证据，然后按原端口接线；不从“类存在/测试注入/HTML 可点击”得出 ready。新前端可以实现编辑、可用的原生功能和准确 blocked/unknown 状态，但不得在 Browser 造运行/审批/候选发布器。旧清退需跟 V3 真实替代入口同切；不能为了删旧目录误删有效业务。

## 交互与三端验收

- 以功能矩阵逐项记录保留/整合/重组/确认废弃、真实消费者、状态/权限与验证；不另建重复状态权威。所有菜单、Sheet、面板、弹窗、输入、快捷键、工具栏和恢复链都需可达。
- Windows、CachyOS Linux、Android Termux 功能等价。手机有完整编辑、Raw/Structured、三层 Preview/Diff、Review/Apply/Commit 与审批，不是只读版本；Graph 需列表/表单等价路径。
- IME 不误发，Stop 在软键盘上方可达；Back/Escape 一次只处理一层并归还焦点；触控、无障碍、键盘、reduced-motion、长文本、窗口化列表与滚动锚点依真实源码和参考。
- 分开 Editor Undo、恢复资源修订、Trash Restore、Save/Fork、停止生成和停止清理任务；停止不撤销已提交对象、不退还已发生费用。费用/数据共享/凭证/写入审批按真实原 authority，不能合成万能“允许”。
- 重大 UI 修改在真实可用浏览器验证 desktop/mobile 布局、完整流程、焦点/滚动/Back/IME相关路径、错误/权限/取消/晚响应；模拟视口、mock、真实服务/设备证据分账，不伪称跨端全部 PASS。
- 不因后端本地测试通过而跳过前端验收。使用相关本地 Skill、已有组件/token与用户参考，避免无依据换框架或加依赖。

完成可用前端与必要验证、同一任务 Record、提交/推送后停止，汇报真实完成/阻塞与未测项。不要发布最终视觉冻结结论，也不要因阶段通过就留下无说明的半成品。
