# Atria Hybrid Cognitive Memory 2.0 — 研究与 Codex 整合入口

> **产品级架构决策已全部定案（HCM-01–08）；技术研究与交付建议已形成；未实施、未并入现有正式 Agent Runtime 企划。**
> 更新：2026-10-10；Task ID：hybrid-cognitive-memory-2-0；Primary Workspace：docs。
> 目标消费者：[Agent Intelligence Runtime 正式 Plan](../agent-intelligence-runtime/index.md)。由 Codex 在用户指定的现有开发分支/文档工作区按当前真实 HEAD 集成，**不默认改动 M1 已冻结的验收要求，也不把本研究视为产品实现或真实模型验收**。

## 核心目标

删除独立 LLM Recall / RAG Recall 模式、配置及重复执行链，建立唯一 Hybrid Cognitive Memory 2.0 入口。在保留有效 Atria 原生历史与记忆来源的前提下，实现 **来源有效、Actor 认知受限、时间与分支正确、旧承诺可查、长篇叙事连贯且成本可控** 的检索与证据消费。

单一入口内部可使用 lexical、typed graph、可选 Embedding、有限多跳/PPR、rerank 或选择性 LLM。**对外硬切换不等于放弃向量检索；默认无额外认知 LLM 请求不等于所有检索零成本。**

所选大方向：**Constraint-first Adaptive Hybrid**。先核验来源、权限、Actor/Task audience、时间和分支，再检索/融合/覆盖选择，最后进入原 Context Compiler。官方 World/Session、Actor Cognition、Goal/Commitment、World Simulation、TaskScheduler、Model Routing/Compute/Context/Reuse 仍有各自权威。

## 四份文件：按需读取，不重复整份企划

| 文件 | 唯一职责 | 阅读条件 |
| --- | --- | --- |
| [decisions.md](decisions.md) | **八项最终有效的产品决策 HCM-01–08**：叙事视角、认知更新、自主 NPC、World Tick、遗忘策略、唯一检索、硬切换、正确性/速度 | 进入整合前必读 |
| [architecture.md](architecture.md) | **批准边界下的目标技术契约**：普通 RP/Native/Package、Evidence/Actor/Context 的职责、候选检索、Typed Packet、缓存、回退 | Codex 设计集成必读 |
| [retrieval-design.md](retrieval-design.md) | **第六轮技术研究证据**：当前源码、候选算法和未采纳对照、风险、外部论文、R6-T01–T15 以及 B0–B6 消融与实测计划 | 选择具体算法及验证时阅读 |
| [integration.md](integration.md) | **Codex 的正式 Plan 整合指南**：H0–H5 分组候选、与 M1/M2/M3/M4/M8 的实际依赖、删旧保新、焦点验收与最小测试 | 当前下一步首要交付 |

### 原正式架构中的唯一权威

- World/Actor/Memory/Cognition 总体分权：[原 architecture](../agent-intelligence-runtime/architecture.md)；
- Context / Prompt 语义：[behavior-context](../agent-intelligence-runtime/behavior-context.md)；
- 稀疏调用、预算、后台调度：[compute-policy](../agent-intelligence-runtime/compute-policy.md)；
- 依赖有效性、缓存复用：[execution-reuse](../agent-intelligence-runtime/execution-reuse.md)；
- 现有阶段 M1/M2/M3/M4/M8：[delivery](../agent-intelligence-runtime/delivery.md)；
- 当前产品实际进度：[M1 acceptance](../agent-intelligence-runtime/m1-acceptance.md) 与 [Record](../../records/refactor/agent-intelligence-runtime.md)。

本研究不为相同概念另设第二份正式详细规则。Codex 应只把新 Memory 2.0 特有的职责放进相应消费者，不将 H0–H5 擅自追加为 M1 已完成的新阶段。

## 可实施性与证据边界

**已做**：远端源码静态核对、现有 Memory/Information/Context/World Simulation 依赖定位、开源技术/论文方案比较、产品级决策冻结、重构路径与评测/失效测试设计。

**尚未做**：对现有或建议实现的实测召回率、每轮实际调用/费用、长篇 RP 中文质量提升、缓存带来的真实加速、完整安全/兼容回归；M1 自身的完成情况仍以当时官方 Record 和产品分支为准。

指标中与来源/授权/事实相关的安全底线必须保留；数值 SLO、检索权重、查询分类器阈值、cache TTL、UI 细节等由实际基准及原权威约束确定，**不能拿研究报告的推论冒充已经验证的事实**。

## 完成条件与后续动作

本**研究与产品决策阶段结束**。下一步是 Codex 按 [integration.md](integration.md) 将设计正确纳入原 Agent Intelligence Runtime 正式 Plan，并定义有消费者、有预算和针对性验收的后续实施阶段。此动作不是本研究直接改动生产分支或开始运行真实模型测试的许可。

研究文件已远端持久化在 docs 长期分支；只有出现新用户决定或新的实质研究证据才更新相应模块。不得重复进行已经结束的选择题讨论。
