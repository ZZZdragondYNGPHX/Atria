# Atria 提示词／行为深化与全产品前端重构

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

Task ID：`refactor/atria-native-prompt-preset-deepening`。本方案定义后续实现；实际结果归[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

## 要交付的能力

| 使用者 | 操作与结果 |
| --- | --- |
| 独立作者 | 在 Library 从空白或模板创建 Program、Module、Generation；编辑、样例预览、手动试读与分享，无需建游戏 |
| 专业作者 | 同一草稿的字段、完整 JSON 与 Module 原文编辑；Stage/Module/Anchor 编排、exact 继承、三层预览和版本差异 |
| 游戏作者 | Studio 直接采用现成预设，选择固定修订，按需 Fork/Derive、升级和处理私人修改 |
| 玩家 | 在作品提供的选项中调整预设和表达；保留角色差异、剧情连续性与玩家自主权 |
| 视觉作者 | 编辑 Image Target/Rendering/风格模板，经原视觉服务试生成并管理图片 |
| 全产品用户 | Library、Play、Studio、Agents、Runtime、设置、媒体与存储采用同一前端体系，手机具备完整操作 |

## 实现路线

1. **接续已有实现**：以完成收尾后的 V3 为集成底座，合入 Prompt 分支已有的 Program selection、SemanticBlocks 与 Draft Preview；V3 的原 ModelPort、费用与业务结果链继续使用。具体代码现状见[源码剖析](baseline.md)。
2. **打通编排语义**：Stage 数组决定展开顺序；同 target 的 Module/Anchor 使用一份显式序列。同步继承、Compiler、编辑器、预览、导入导出与 Package freeze；移除 `priority`、expression layer、ID 对作者顺序的隐式重排。
3. **完成作者工作流**：共用编辑器、默认模板、无游戏样例上下文、无发送预览、手动试读、跨修订 Diff。日常编辑优先呈现正文，来源与 Wire 按需展开。
4. **完成分享与采用**：分享包保留可编辑依赖；完整 exact ref 映射本地身份；处理私人派生与上游升级差异，分别反馈保存、导出和采用结果。
5. **完成全产品前端**：沿[前端实施输入](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)改造既有 Shell 与领域页面；复用 V3 已有 Graph/List/Inspector、Run Timeline 和客户端。189 组旧盘点用于查漏，新增作者功能另行补齐。
6. **接入可选功能**：Quality/Evolution 和非 Session 图像任务各接原服务；普通编辑、分享和生成独立可用。

## 设计决定

| 模块 | 决定与阅读内容 |
| --- | --- |
| [decisions.md](decisions.md) | D1–D8 与跨模块选择索引 |
| [creative-injection.md](creative-injection.md) | 完整作者表达、模板、Provider 响应 |
| [narrative-behavior.md](narrative-behavior.md) | Narrator、角色声音、玩家叙述与稀疏调用 |
| [agent-behavior-binding.md](agent-behavior-binding.md) | V3 Node 独立 Program/Route 与 exact 继承 |
| [semantic-ir-lowering.md](semantic-ir-lowering.md) | 显式顺序、Anchor/Contribution、Provider 与 Token |
| [context-memory-consumption.md](context-memory-consumption.md) | 角色视角、历史／当前事实、长会话 |
| [preset-studio-experience.md](preset-studio-experience.md) | Library/Studio/Play、共用草稿、预览和发行 |
| [quality-evolution.md](quality-evolution.md) | 可选反馈、局部候选与采用 |
| [backend-implementation.md](backend-implementation.md)／[实现依赖](e0-audit.md) | 工作分工、现有接口与尚缺操作 |
| [源码剖析](baseline.md)／[背景资料](research.md) | 当前调用链、具体差距与参考线索 |
| [前端入口](../../architecture/atria-frontend-audit/index.md) | 页面能力、操作链、组件与视觉输入 |

沿现有 native ES modules/DOM/CSS、Library/Project 修订、Context、Provider、Compute 与视觉服务实现。旧 ST/Workspace/Director/Loop/Agenda 随原生替代清退；Memory、Goals、Experience、Skills 和 Visual Director 等有效功能继续保留。动态世界方案保持原状态，后续通过原 Context/Information 提供数据。
