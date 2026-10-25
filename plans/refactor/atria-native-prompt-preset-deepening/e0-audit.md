# 提示词／前端：现有能力与剩余接线

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

路径沿用既有链接；当前职责是功能依赖索引。详细实现归[后端分工](backend-implementation.md)，源码位置和结论归[源码剖析](baseline.md)。

| 功能 | 已有基础 | 本方案要补的操作 |
| --- | --- | --- |
| Program selection | Prompt 分支已有内部选择参数；V3 已有原模型与多域消费者 | Node 独立 Program pin 贯穿准备、发送、候选与 UI |
| Typed 语义 | Prompt 分支已有 SemanticBlocks 与 Provider 使用 | 和新顺序、Anchor、Context 及 V3 当次请求组合 |
| 编排和继承 | Stage/moduleRefs、parentRef、derive | 单条目顺序，按 Stage/条目定位、精确插入，清除所有隐式重排 |
| 草稿预览 | 已存在资源的 exact-base overlay 与三层输出 | 两侧不同修订、新身份／依赖、共享环境，两次编译 |
| 独立作者 | Library 已可建预设与资源 | 无游戏样例 Context、手动试读与工作区结果 |
| 编辑器 | Library/Studio 共用 mountPromptEditor | 正文／JSON 视图、共享历史、长文本与有效编排 |
| 模板 | 新建 Program 当前是空 stage | 普通可编辑骨架与任务模板 |
| 分享升级 | Preset 与 Resource bundle 导入导出 | 同资源多修订、本地映射、私人三方差异与手动采用 |
| V3 前端 | 已有 Plan/Run/Binding API、Graph/List/Inspector 与 Timeline | 接续现有页面；新增 Program；Plan 生命周期缺项补原服务 |
| 可选反馈 | QualityProfile、Experience/Eval、Candidate 与 Publication | 展示原服务结果与具体缺项，和普通创作解耦 |
| 视觉作者 | Target/Rendering、ImagePromptIR、Job/Asset | 非 Session 归属、试生成和图片管理 |

全产品前端按[实施输入](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)接现有业务。189 组旧清单提供功能定位；最新状态由实际源码决定。
