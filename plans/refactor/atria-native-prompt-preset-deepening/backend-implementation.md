# 提示词与前端重构：后端实现分工

本文件定义功能落点和依赖；[入口](index.md)给出完整范围，[实现依赖](e0-audit.md)列出已有能力与待接线部分，[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)保存实际进展。本次只改企划，不改产品代码。

## 资源、编排与发送

| 功能 | 在原实现中完成的工作 | 对应调用方 |
| --- | --- | --- |
| Node 独立选择 Program | 复用可信内部 `programSelection`；由 V3 Node/Plan 构造，fallback 保持有效 Program、工具、输出合同；不从 Browser JSON 接受执行权限 | V3 ModelPort、RouteResolver、GenerationService |
| 单一显式顺序 | Program/Stage 的合法 target 内保存 ModuleRef/Anchor 的唯一顺序；删除与其竞争的旧 priority 排序；更新原生修订 schema 和全部直接使用者 | contracts、prompt-module-order、Compiler、Authoring、Preview、Package freeze |
| exact 增量继承 | 固定 parentRef，add 指定插入点，disable/replace/configure 保留目标位置；缺失或歧义时保留草稿并提示处理 | Program resolver/Compiler、编辑器、导入导出、冻结闭包 |
| 请求级 Contribution | 原 Context/Information 先选合法来源；Compiler 按 Anchor 接受的类别、必要性和稳定顺序装配；去重区分来源、片段、版本、用途，不按正文相同就合并 | ContextPort/ContextPlan、Compiler、三层预览 |
| Typed IR 与 Provider | 保留指令／事实／历史／Tool 数据的来源区别；同一 lowering 用于 render/count/send，能力不足反馈具体问题 | 原 SemanticBlocks、Provider adapters、GenerationService |
| 长会话 | 原 Context lanes 优先当前必要事实、角色身份、未决承诺和输入，再选完整近文、Spine、HCM 与表达参考 | 原 Context/Memory、Host 与 PromptCompiler |

## 创作、分享与使用

| 功能 | 后端实现 | 前端使用方式 |
| --- | --- | --- |
| 同一草稿双编辑 | 沿原 Program/Module/Draft、exact revision、CAS；literal/template 明确区分，未知字段与原文保留 | Library 与 Studio 共用编辑器；冲突不清空作者文本 |
| 三层预览／Diff | 复用原 Host/Compiler/Provider；按 source/route/compiler 固定环境，分别编译 base/candidate；只返回可展示内容 | Authored/Effective/Wire，按需来源与差异；明确未发送 |
| 无游戏作者预览 | 在原 Host 增加作者拥有的受限样例上下文，不创建假 Session/Project，不带真实世界或 NPC 私密权限 | Library 直接输入样例并预览；现有 exact-base `/preview/draft` 不冒充已经支持新身份 |
| 手动付费试读 | 复用原 Provider/Compute，明确 Route、发送内容和预算；用户主动触发，返回原响应与用量 | 独立按钮；编辑和预览不自动发送，不自动 Judge |
| 官方模板 | 少量可编辑通用骨架及 RP/Creative Writing/Agent Task 模板，创建普通原生资源 | 可从空白或模板开始；Studio 直接选择已有预设 |
| 发行与升级 | 自包含可编辑依赖包、本地 identity mapping、重复导入与私人 Fork/Derive 冲突、三方差异、对应消费者 CAS | 导入不自动移动 Route/Plan/Package/Session 的 exact pin；保存／分享／采用分别反馈 |
| Quality/Evolution | 原反馈／质量维度／局部候选及 `plan-prompt` 发布；沿 Module→PlanRevision→Binding CAS 和原 publication journal | 仅具体自动评价／晋升受其来源要求约束；手动编辑、普通保存、导出和运行不等待认证 |
| 独立视觉创作 | 原 Image Target/Rendering/ImagePromptIR；由原视觉服务定义非 Session Job/Asset 的 owner、引用和清理 | Library 独立入口与 Gallery；不用文本 execute 或假 Session |

## 集成顺序

1. 使用实际任务分支，处理 Prompt/V3/主线发生重叠的接口；保留双方现有 Program/Source/费用/Result/Receipt 逻辑。旧 SHA 和共改文件数量只是历史线索。
2. 同一改动中接通排序、继承、Contribution、Compiler/Provider、Preview、冻结及导入导出的直接消费者，避免新旧语义同时决定结果。
3. 完成 Library/Studio 编辑与默认模板，再接独立样例预览、手动试读、发行升级；能独立完成的功能继续推进。
4. 按[统一前端交接](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)接全产品页面；旧编排替代由原 V3 负责，前端不补第二执行器。
5. Quality/Evolution 与独立图像任务沿各自领域接入，只明确尚缺的操作和接口。动态世界功能以后通过原 Context/Information 接入，不成为本案开工依赖。

必要的来源、权限、预算、版本冲突、取消及提交未知处理属于实际功能。企划不另建全量消费者审计、跨端实测、Provider 矩阵或 Gate 通过项目，不用这些代替实现。
