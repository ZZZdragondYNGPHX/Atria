# 全产品前端实施交接

范围来自[提示词／前端企划](../../refactor/atria-native-prompt-preset-deepening/index.md)、本目录四份功能清单与正式领域合同。本文件说明要实现的界面与接线，不新增审查、验证或测试任务。本次只修订交接文档，不启动产品实施。

## 工作目标

完成同一 Atria 产品的全前端：Library、Play、Studio 全 20 资源视图与 Project Agent、Agents/Memory/Goals/Experience/Eval、World/Knowledge、Prompt、Runtime/Model/Connection、Settings/Account、Skills/Plugins/Search/Regex、Visual Director/Media/Speech、共享会话、存读档／备份同步、Storage 与 Diagnostics。

189 个功能组是既有功能盘点，不能只做 Prompt 页，也不是新功能数量上限。已确认的新作者流程与 V3 Plan/Run 一并实现。旧 SHA、第二十四组的有限 Profile 和演示 HTML 都不能限定最新实现范围；接具体页面时使用原后端当前实际接口，不为本任务另组织全仓预审。

## 设计输入与页面组织

先读 [index](index.md)，按当前页面读四份分域清单、[操作链](interaction-flows.md)、[组件归属](component-and-architecture-findings.md)与[跨端要求](cross-platform.md)。外部参考是：

- [HTML](design-proposal/atria-visual-direction.html)：代表性视觉／交互。
- [全功能表现](design-proposal/atria-function-presentation.md)：功能位置与操作方式。
- [设计指导](design-proposal/atria-frontend-guidelines.md)：整体外观与组件参考。

这些是参考；功能遗漏以正式合同补齐，未批准的新增能力不混入实现。P-03 中“旧编排折叠过渡区”不采用。沿现有 native ES modules/DOM/CSS 与 Shell 实现，Library/Studio/Play/Agents/Runtime 共用导航、搜索、深链、返回与组件，不另建 V3 Shell。视觉只使用用户实际批准的部分。

## 提示词作者的完整流程

| 功能面 | 用户操作 | 后端接线与结果 |
| --- | --- | --- |
| Library 独立作者 | 不建游戏即可创建、编辑、导入导出 Program/Module/Generation；选择空白、通用骨架或任务模板 | 原资源／修订服务；模板生成可编辑资源，更新模板不覆盖旧版本 |
| Studio 采用 | 从预设库直接选择 exact 版本，按需 Fork/Derive，处理差异后发布 | 原 Project/Package/Route/Plan 绑定；不强迫游戏作者自行写 Prompt |
| 同一草稿双编辑 | 结构化面板、完整原文、大纲与继承来源；Undo/Redo、dirty/leave | 共用同一 Draft；literal/template 明确切换，不静默改写原文或丢未知字段 |
| 编排 | Stage 排序，同 target 的 Module/Anchor 上下移动／拖拽，新增／禁用／替换／配置差异 | 只编辑原 Program 序列；Host 返回 Effective 顺序。Contribution 只读，不能拖成作者指令或改变权限 |
| Preview／Diff | 按需看 Authored/Effective/Provider Wire、来源、条件、Token 和差异 | 原 Host 编译／脱敏投影，明确未发送；base/candidate 可为不同修订，环境变化单列 |
| 无游戏预览／试读 | 编辑样例上下文，先无发送预览；用户另选 Route、预算和外发内容后手动试读 | 原 Host 的独立作者上下文与 Compute/Provider；未接通时只限制该操作，不创建假 Session，不自动发送或 Judge |
| 分享／升级 | 导出可编辑依赖包、导入本地映射、查看受影响消费者、处理私人修改三方差异 | 保存、导出、发布、采用分别反馈；新版本不自动改变已钉引用 |
| 质量／候选 | 用户主动查看反馈、发起原服务支持的评价或选择候选、Review/采用 | 原 Experience/Eval/Publication；未评价不禁普通编辑／分享／生成，来源缺失只影响相应评价／晋升 |
| 独立视觉作者 | 编辑 Image Target/Rendering/风格模板，手动试生成、管理对应图片 | 原 ImagePromptIR/Visual Job/Asset 的非 Session 所有权；不调用文本 Compiler，不借剧情 Gallery 冒充完成 |

Library 和 Studio 共用这些资源组件。Play 仅提供作品允许的选择／覆盖与可展示信息，不隐式改写共享原件。

## V3 的同一产品界面

| 页面 | 要实现的操作 | 原服务职责 |
| --- | --- | --- |
| Plan Library | 创建／编辑 Draft、资源引用、版本／发布、Fork/Derive、归档与删除 | 原 Plan Authoring/Repository |
| Plan 选择 | Session、Project/Task、RP 的已发布 exact Plan 选择、冲突处理 | 原 Binding get/save 与 version CAS；保存选择不自动启动 Run或授予权限 |
| Graph/List/Inspector | Node/Edge/Ports、Agent/Route/Source/Output/预算／委派 policy；Problems、同 Draft Undo/Redo | 原 Plan schema 与 Draft；几何位置不改变执行顺序，不直接改活动图 |
| Run Timeline/Graph | 同 selection 查看 Attempt、GraphPatch、Join、Effect、Result、费用、取消与部分完成 | 原 Host 投影与真实 Run 控制；不用 Browser 拼持久运行 |
| Review/Recovery | 精确动作与 Diff、外发对象、费用及后果、取消、回执和后续状态 | 原可信审批／恢复服务；通用 Effect 决定走独立可信 Review Origin，主 app 只显示待办／launch ref |
| 业务连接 | Project Review/Commit、Play 正文、Runtime 修复与原页面返回 | 只用当前原生消费者；关闭页面不代表取消 Host，未知结果先读取原操作 |

原后端尚缺的具体路由／操作在该功能上说明，并继续实现不依赖它的部分。不要沿用旧文档的“只有两节点 Narrator”“Project/RP 全部 unavailable”判断最新代码；也不能根据方法名自创 HTTP 路径或 Browser dispatcher。Node 的 `allowedPlanPinIds:[]` 表示禁止委派，选项限本 Node 合法 plan pins，不能把缺字段当 allow-any。

## 对接已有 Prompt 后端

实际字段以源码 `src/native/model-prompt-runtime/README.md` 为准。已有接口可直接复用：

| 接口／数据 | 实现方式 |
| --- | --- |
| `POST /api/native/generation/preview/draft` | `{request,drafts:[{ref,expectedFingerprint,resource}],baselineDrafts?:[]}`；沿原 exact base 与 fingerprint；当前有限基础资源支持不等于新身份／独立作者上下文已接通 |
| 三层 Diff | 展示 base/candidate 原版本与 source/route/compiler 身份；unpublished、`sent:false`，迟到回包不覆盖新草稿 |
| 受限诊断 | `native_generation_preview_disclosure_denied` 说明当前不可展示完整上下文；execute/result 的 restricted 投影与正常生成结果分别显示，不将诊断受限报成生成失败 |
| `GET /api/native/generation/quality-profiles` | 使用原 dimensions/readiness；未知质量显示未评价，不能用假分数填充 |
| `generation_provider_content_blocked` | 表示实际 Provider 协议拒绝及已有用量；自然语言回避不能冒充协议状态，不自动跨供应商重发 |
| 可信 Program 选择 | 来自原 Node/Plan/Host；Browser 不提交 programSelection、伪 Grant 或 Draft authority |

## 保留业务与交互

- 原生硬切零 ST/旧 Workspace/Director/Loop/Agenda 兼容；有效 Memory/Goals/Experience/Eval/Skills/Visual Director 等迁到原生入口，不能整树误删。新替代未接的能力继续作为实际实现项，不能用旧 sender 充数。
- Source/Actor/Secret、预算／用量、业务写入、Review/Commit/CAS 归原服务；前端编辑草稿、发原命令、显示真实结果。未知费用不显示零，取消不声称撤销已经提交的效果。
- Work text/component/hybrid/full 与 Exit/Stop/Save/Persona/Diagnostics/Reload 恢复通道保留。凭证、媒体授权与 V3 Effect 审批分别使用原合同，不能合成万能批准。
- 加载／空／失败／冲突／只读状态在相应页面准确显示；保存已成功但刷新失败时只重读，保留作者稿和原选择。
- Windows、CachyOS、Android Termux 都能完成创建、编辑、预览、Diff、Review/发布；手机为 List/Tab/Sheet，Graph 有表单／列表替代。IME 不误发，Stop 在软键盘上方可达，Back/Escape 一次处理一层并归还焦点。
- 保留长文本选区、滚动位置、键盘／读屏与 reduced-motion。列表沿现有分页／窗口机制，不为假设场景新建缓存或摘要权威。

按功能持续实现并更新原任务 Record；交付说明实际完成和具体未接部分。无需为本提示词另建测试矩阵、独立审查、全平台取证或质量认证工程。
