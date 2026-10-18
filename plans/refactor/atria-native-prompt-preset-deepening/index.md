# Atria 提示词／行为深化与全产品前端重构（唯一入口）

Task ID：`refactor/atria-native-prompt-preset-deepening`。产品设计已收口，功能尚未全部实现；产品源码在同名任务分支，文档在独立 `docs` 工作空间。实际进展记入[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。本次仅整理企划，不启动产品开发。

## 要交付的用户能力

| 用户 | 操作与结果 | 实现归属 |
| --- | --- | --- |
| 独立提示词作者 | 无需建游戏，在 Library 新建／编辑 Program、Module、Generation；可从空白或官方任务模板开始 | 原 Library 资源与修订服务 |
| 专业作者 | 结构化与完整原文编辑同一草稿；编排 Stage、Module、Anchor；查看继承与差异，保存原文和自定义内容 | 原 Authoring Draft、Program/Module、PromptCompiler |
| 游戏作者 | Studio 选择现成预设并钉定版本，按需 Fork／Derive；无需自行写一套 Prompt | 原 Project/Package、Route 与资源引用 |
| 调整预设的作者 | 按需看 Authored／Effective／Provider Wire、来源和 Diff；可手动选择模型与预算试读 | 原 Host、Context、Compiler、Provider、Compute |
| 分享资源的作者 | 导出可编辑依赖包，导入时映射本地身份；手动处理升级与私人修改冲突 | 原 Preset/Library import/export、Revision/CAS |
| 视觉作者 | 独立编辑 Image Target、Rendering、风格／模板，并由原视觉系统持有试生成任务与图片 | 原 ImagePromptIR、Visual Job/Asset；独立于文本 Compiler |
| 玩家 | 使用作品允许的预设选择与覆盖，保留角色声音、剧情连续性、玩家自主权及合法成熟虚构表达 | 原 Play、Session、Information/Memory、Generation |
| 全产品用户 | Library、Play、Studio、Agents、Runtime 与设置／媒体／存储等完整能力采用统一前端，桌面和手机均可操作 | 原 Shell 与各领域服务 |

## 实现主线

1. **整合已有后端**：保留 Prompt 的可信 Program selection、Typed SemanticBlocks、Draft Preview，以及 V3 的真实角色、Source、费用、Result、Receipt 与业务提交。处理实际共改接口，不按旧快照重写已完成能力。
2. **实现单一编排语义**：Stage 的显式顺序；同一合法 target 内 ModuleRef/Anchor 一份顺序；exact 父修订加显式差异；替换／禁用保留原位置，新增指定插入点。同步 Compiler、编辑器、Preview、Package freeze 和导入导出，不保留 `priority` 与新序列竞争。
3. **接通独立作者**：Library/Studio 共用编辑器；提供无需 Session 的受限样例上下文、无发送预览、按需付费试读和少量可编辑模板。
4. **实现发行与采用**：分享包的可编辑依赖、本地身份映射、Fork/Derive、三方升级差异及 exact 消费者更新。保存、导出、发布、采用是不同动作。
5. **完成全产品前端**：沿[统一前端交接](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)接入现有功能与新增作者流程；189 组是旧功能盘点，不是新增功能上限。旧编排入口随原生替代接通一起清退。
6. **接入可选质量与视觉功能**：Quality/Evolution 按原服务提供反馈、候选、Review/发布；非 Session 图像任务由原视觉领域接入。各依赖只影响相应操作，不让质量认证材料拖住编辑、保存、分享和普通生成。

具体接口落点见[后端实施](backend-implementation.md)，尚需接线的功能见[实现依赖](e0-audit.md)。各步骤按实际依赖推进，可独立实现的页面和功能继续做。

## 已确认的设计边界

- **D1/D2**：深化原 Native Prompt/Behavior/Expression；完整作者指令与结构化控制并存，尊重合法成年虚构创作。Provider 明确限制与文学偏好分开，内容拒绝不静默跨供应商重发。
- **D3**：表达与身份／认知分开；默认严格保留玩家自主权，有限叙述委托须来自原授权。普通 RP 单 Narrator 优先，精修与 Judge 是按需能力。
- **D4**：V3 Node 精确绑定 Program/Route；Host 构造可信选择，fallback 保持有效 Program、工具与输出语义。
- **D5**：Typed SemanticBlocks、合法 Provider lowering、显式顺序、受控 Anchor、请求级 Contribution、exact 增量继承、原 Context/Provider 双阶段预算。
- **D6**：先按 Source/Actor/Audience/Branch/Revision 授权，再选择上下文；当前事实、历史、角色信念、传闻与假设分别表达。长会话保留必要因果、承诺和角色声线。
- **D7**：原 Quality/Evolution 提供可选多维反馈与受控候选发布；质量未知不冒充认证，认证不是普通创作入口的前置条件。
- **D8**：Library/Studio/Play 共用资源、同一草稿双编辑、三层预览与 Diff、按需 Inspector、Windows/CachyOS/Android Termux 功能等价。视觉外观按用户提供的设计材料及其实际批准范围执行。
- **单一权威、原生硬切**：不重建 World/Memory/Context/Secret/预算／Run 服务；不迁移 ST、旧 Workspace/Director/Loop/Agenda，不做双轨或旧 sender 回退。保留其中有效的 Memory、Goals、Experience、Visual Director 等能力。

## 两案衔接

动态世界重构提供正式事实、有效时间、Subject/Perspective 和受众视图；本案负责消费这些数据并编译 Prompt。当前提示词和全产品前端继续实现，不等待尚在暂停的世界企划。后续世界模块接入原 Context/Information 和相同前端组件，不再建立第二编译器或另起一套 Shell。

## 按功能阅读

| 模块 | 内容 |
| --- | --- |
| [decisions.md](decisions.md) | 跨模块已确认选择 |
| [creative-injection.md](creative-injection.md)／[narrative-behavior.md](narrative-behavior.md) | 作者控制、文学表达、角色行为与玩家自主权 |
| [agent-behavior-binding.md](agent-behavior-binding.md) | Node/Program/Route 与 exact 继承 |
| [semantic-ir-lowering.md](semantic-ir-lowering.md) | 编排、Contribution、Typed IR、Provider 与预算 |
| [context-memory-consumption.md](context-memory-consumption.md) | 受众、认识状态、长会话 |
| [preset-studio-experience.md](preset-studio-experience.md) | 独立作者与 Library/Studio/Play 操作 |
| [quality-evolution.md](quality-evolution.md) | 产品内可选 Quality/Evolution 功能 |
| [backend-implementation.md](backend-implementation.md)／[e0-audit.md](e0-audit.md) | 实现归属与功能依赖 |
| [前端资料](../../architecture/atria-frontend-audit/index.md) | 现有功能、操作链、跨端要求、外部参考 |
| [baseline.md](baseline.md)／[research.md](research.md) | 需要追溯时读取的旧源码与研究背景 |

企划的工作项以功能和接线为单位。历史 E0/Gate、固定 SHA、测试数量和审计记录不构成新的实施前置；不安排独立审查、测试矩阵或验证项目。产品内的预览、连接检测、付费试读、Quality/Eval 是用户可选功能，不因此自动运行工程测试或模型任务。
