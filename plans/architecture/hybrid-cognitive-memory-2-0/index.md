# Atria Hybrid Cognitive Memory 2.0 — 独立研究入口

> **状态：研究与方案讨论，尚未实施。** 创建于 2026-10-10。
> **Task ID：** `hybrid-cognitive-memory-2-0`；**Primary Workspace：** `docs`。
> **关联：** [Agent Intelligence Runtime 正式 Plan](../agent-intelligence-runtime/index.md)。当本研究的核心取舍讨论完成后，由 Codex 按当时实际产品分支、M1 真实验收状态与阶段依赖，决定如何并入正式 Plan；**不能把研究文档冒充实施已完成**。

## 核心任务

不只是把三种召回设置合成一个按钮，而是设计对 RP 有用的单一认知记忆检索体系：

- 可追溯地找出适用于当前剧情、时间、分支和 Actor 视角的证据。
- 保留错误信念、传闻、承诺、人物关系与人格表达的正确语义，不生成第二个 World/Actor 权威。
- 正常 RP 尽量无额外认知 LLM 请求；复杂因果、跨章节、冲突及多跳问题允许有界升级。
- 上下文编译先守住权限与重要事件，再做预算裁剪、索引复用和 Provider cache 优化。
- 删除独立 `LLM Recall` 和 `RAG Recall` 的旧模式/配置路径；内部仍可复用 Embedding、Rerank、图谱和选择性 LLM。

## 阅读路由

| 文件 | 内容 | 何时读取 |
| --- | --- | --- |
| [decisions.md](decisions.md) | R1–R5 **最终生效**的五项用户决策，以及尚未批准的范围 | 每次继续讨论先读 |
| [retrieval-design.md](retrieval-design.md) | **R6 技术研究：** Atria 代码审计、外部算法证据、约束排序、评分、多跳、Context、缓存、对照实验与待选路线 | 当前轮及后续检索实施计划 |
| [既有 Context 规划](../agent-intelligence-runtime/behavior-context.md) | Context lanes / Builder / Cache-aware compiler 权威 | 讨论正文上下文时按需读 |
| [既有 Compute 规划](../agent-intelligence-runtime/compute-policy.md) | 模型调用准入、稀疏计算、费用、调度 | 讨论成本和触发时按需读 |
| [既有 Reuse 规划](../agent-intelligence-runtime/execution-reuse.md) | 缓存适用证明、版本、依赖失效 | 讨论缓存复用时按需读 |
| [M3/M4 交付](../agent-intelligence-runtime/delivery.md) | S15–S26 社会认知与世界模拟的原职责 | 最后阶段映射时读 |

## 现有架构适配原则

目前 `main` 包含 `hybrid-retrieval.js`、`hybrid-runtime.js`、`source-lifecycle.js`、`native-information-runtime.js`、`context-compiler.js` 和已有 `Simulation Authority`，并不是零基础。见 [R6 §1](retrieval-design.md#1-当前-atria-代码基线)。

**底层事实/授权/评分/表达分离：**

`World & Timeline truth → 来源有效性与 Actor 可见性 → 查询分析与候选检索 → 多路融合与有界因果扩展 → 可用记忆证据包 → Context 编译 → Narrator/Orchestrator`

故事中的心理状态由原 Actor/Cognition authority 决定，推理模型只能在明确契约下提出候选更新。旁白与 NPC 分离、游戏时间驱动、轻度遗忘及作品可选模式的精确已确认值见 decisions，不在此重复轮次叙述。

## 研究报告质量约束

- **源码事实**列文件/调用函数/版本与可以复核的行为；**外部来源**指向论文/正式文档/实际 GitHub 文件。
- 把“作者报告的收益”“已经存在的能力”“在 Atria 的工程推断”“尚待验证的假设”分开。
- 报告必须提供候选方案的收益、成本、失败模式、适用前提、验证/证伪方式，以及为何不选某些方案。
- 基准必须能测到错误证据、NPC 认知泄露、长篇承诺漏召回和正文应用质量，不能只比 TopK 或模型评分。
- 正式阶段/物理 Schema/参数/Legacy 数据删除策略，在讨论冻结且验证路径确定后再审议。

## 当前状态

- R1–R5：五项产品决定已收敛（仅最终值，见 decisions）。
- R6：正在研究统一 Hybrid Recall 设计（技术分析见 retrieval-design），**尚待用户作架构选择**。
- 尚未更改 `main`、`feat/agent-intelligence-runtime` 或已有 M1 计划；未进行 Atria 真实模型/浏览器性能实验。

**维护方式：** 每轮先以新证据和实际决议修订所属专题模块及 decisions，提交远端之后才进行该轮的用户回答。未经用户批准，不把研究模块自动写入已有正式 Plan。
