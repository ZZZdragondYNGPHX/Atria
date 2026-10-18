# 跨模块决定

本文件索引已选功能；详细语义分别归对应模块。

| 决定 | 内容 | 详细模块 |
| --- | --- | --- |
| D1 B | 深化已有 Native Prompt/Behavior/Expression，兼顾文学与 Agent 任务 | [入口](index.md) |
| D2 J2/F2/R3 | 作者完整原文与结构化字段并存，Provider 适配与响应原因可查看 | [作者表达](creative-injection.md) |
| D3 E2/A2/K2/G1 | 旁白、角色声音、身份与认知分开；玩家自主权；默认单 Narrator | [叙事行为](narrative-behavior.md) |
| D4 B2/I2/C2 | Node 选择 exact Program 与 Route；exact 父级加差异；原 Host 当次编译 | [行为绑定](agent-behavior-binding.md) |
| D5 S2/L2/D2/K2/T2 | 沿 SemanticBlocks 做显式编排、Provider lowering、来源解释与两阶段 Token 分配 | [编排与请求](semantic-ir-lowering.md) |
| D6 U2/E2/H2/V2 | 按消费者提供 Context，区分历史、当前状态与角色认识，保持长会话连续性 | [Context 消费](context-memory-consumption.md) |
| D7 Q2/F2/O2/P2 | 可选多维反馈、归因、局部候选与原发布链 | [质量功能](quality-evolution.md) |
| D8 W2/R2/P2/I2/M2 | Library/Studio/Play 原位协作、同草稿双编辑、三层预览、按需详情与手机完整操作 | [作者体验](preset-studio-experience.md) |

## 联动选择

- 作者顺序是唯一顺序。`expression.layer` 只标注表达对象；`priority` 与 Module ID 不再决定位置。
- Anchor 在 Program/Stage 内有稳定条目身份；动态 Contribution 由已选 Context 派生，不保存为 Module。
- derive 对准具体 Stage/条目，新增明确插入位置，替换／禁用／配置保持位置。父版升级由作者选择。
- 原文视图区分完整资源 JSON 与 Module `body`。JSON 暂时不合法时留在编辑缓冲；服务支持的字段可以保存，新增字段随 schema 和消费者一起实现。
- 无游戏作者使用样例 Context；Preview 与手动试读复用同一编译链。base/candidate 可以是不同修订，环境差异单列。
- 模板创建普通可编辑资源。RP、Creative Writing、Agent Task 共用基础模块，不按 Provider 复制整套预设。
- 分享包与游戏 Build 各有用途；映射完整 exact refs，并处理同一逻辑资源的多个修订。私人修改和上游升级按三方差异选择采用。
- V3 已有页面与接口直接接续；Plan 的 Fork/Derive、归档、删除属于尚需实现的操作，不能据现有列表页宣称已具备。
- 视觉沿当前已确认材料和现有 tokens；外部样稿的夜色主题、新 token 名、布局数值与新增产品提案不自动覆盖已有设计。
