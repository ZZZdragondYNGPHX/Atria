# 跨模块已确认决定

D1–D8 的功能／交互及后续九轮补强已确认。详细功能各归以下模块；实现分工见 [backend-implementation.md](backend-implementation.md)，具体尚缺功能见 [e0-audit.md](e0-audit.md)。本次修订企划，不启动产品代码。历史讨论与源码结果见[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

| 决定 | 已确认语义 | 详细模块 |
| --- | --- | --- |
| D1 B | 深化原 Native Behavior/Expression/Prompt，RP 文笔与 Agent 任务并重；不另建预设内核 | [入口](index.md) |
| D2 J2/F2/R3 | 原生编译型作者控制、结构化＋完整自由文本、拒答归因与用户控制 Route；合法成年虚构创作不被 Atria 无端说教或压低表达 | [creative-injection.md](creative-injection.md) |
| D3 E2/A2/K2/G1 | 表达与身份／认知分离；默认保留玩家自主权，有限叙述委托由原授权提供；来源先行，普通 RP 单 Narrator，精修按需 | [narrative-behavior.md](narrative-behavior.md) |
| D4 B2/I2/C2 | V3 Node 精确 Program/Route、exact 父级＋显式差异、Host 当次编译与原请求身份；fallback 保持语义 | [agent-behavior-binding.md](agent-behavior-binding.md) |
| D5 S2/L2/D2/K2/T2 | Typed 语义、合法 Provider lowering、分级诊断、原作用域内复用、原 Context/Provider 双阶段预算 | [semantic-ir-lowering.md](semantic-ir-lowering.md) |
| D6 U2/E2/H2/V2 | 每消费者合法 Context，认识状态分开，长会话来源与人物连续性、来源变化时重建相应投影 | [context-memory-consumption.md](context-memory-consumption.md) |
| D7 Q2/F2/O2/P2 | 多维反馈、可解释归因、合法创作误拒诊断、局部候选／原 Review/发布；可选质量功能不成为普通创作前置 | [quality-evolution.md](quality-evolution.md) |
| D8 W2/R2/P2/I2/M2 | Library/Studio/Play 共用资源、单 Draft 双编辑、三层预览／Diff、按需 Inspector、三端完整操作 | [preset-studio-experience.md](preset-studio-experience.md) |

## 九轮补强落入同一原生实现

- **单一顺序**：Stage 显式有序；同 target 内 ModuleRef/Anchor 共用一份序列，替换旧 priority 排序。Anchor 具有 Program/Stage 内稳定身份，不是独立资源／Role／权限。
- **exact 增量继承**：固定父修订，add 指定插入点，disable/replace/configure 保持原位置；升级主动选择并处理差异，缺锚点不静默追加或 follow latest。
- **请求级 Contribution**：原 Context/Host 按来源／受众／当前性选取，确定性装配与去重；只读投影不反写 Program，不因宏、位置或条件扩大权限。
- **双入口、一套资源**：Library 独立作者不建游戏；Studio 直接引用现成预设并可 Fork/Derive；Play 仅在作品允许范围选择／覆盖。
- **独立预览与手动试读**：原 Host 提供受限样例上下文；三层预览不发送，付费试读用户主动选 Route/预算与发送范围。base/candidate 可以不同修订，环境变化与作者修改分开显示。
- **默认模板**：可编辑通用骨架、RP/Narrative、Creative Writing、Agent Task；创建普通原生资源，不按厂商复制一套默认内核，不自动开工具、Judge 或收费试读。
- **离线分享与升级**：作者可编辑依赖包与游戏冻结 Package 分开；导入本地映射、私人派生三方差异、手动采用与消费者 CAS；无自动市场／订阅／同步。
- **独立视觉作者**：原 Image Target/Rendering/ImagePromptIR/Job/Asset，接入非 Session 任务所有权与图片管理；不变成文本预设子类型或第二视觉存储。
- **前端**：189 组盘点保留，加上新增功能；外部 HTML/功能表现/指导作为参考，视觉只按实际批准范围。旧编排折叠过渡区不采用。

单 Host、原 World/Session/Information/Memory/Secret/Compute 与 Revision/CAS 权威保持。正式重构零 ST/旧 Workspace/Director/Loop/Agenda 兼容，保留其中有效业务。Provider 内容拒绝不静默跨供应商重发；公开注入研究只作机制／创作／误拒诊断背景，不内置攻击载荷或承诺绕过固定限制。

企划的当前工作是功能实现与实际依赖；旧 E0、审计数量、测试清单和逐轮许可不恢复为执行前置。原世界企划仍暂停，提示词／全前端不等待它才开始；未来世界视图经原 Context 接入。
