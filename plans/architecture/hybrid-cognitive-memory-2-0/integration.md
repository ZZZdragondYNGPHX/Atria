# Hybrid Cognitive Memory 2.0 — Codex 正式企划整合与分阶段交付建议

> 状态：**产品决策已冻结；2026-10-10 D5 正式企划整合完成，本文件保留研究阶段整合建议**；这里的工作切片不是已获实施许可的新增 S/G 阶段。
> 日期：2026-10-10；Task ID：hybrid-cognitive-memory-2-0；Primary Workspace：docs。
> 按顺序阅读：[入口](index.md) → [最终决定](decisions.md) → [目标架构](architecture.md) → 当前章节。具体算法证据、15 个评测案例及 7 组消融对照见 [检索调研](retrieval-design.md)。
> 本文件不直接修改旧 Plan。

当前正式入口：八项采纳范围见 [decisions §9](../agent-intelligence-runtime/decisions.md#9-d5--hybrid-cognitive-memory-20-正式采纳)，检索 / 硬切换见 [hybrid-memory](../agent-intelligence-runtime/hybrid-memory.md)，HM1–HM3 / H0–H5 的实际依赖与退出见 [delivery §8.2](../agent-intelligence-runtime/delivery.md#82-hybrid-memory有限交付组与依赖)。下文建议依赖图不替代正式映射；H3/H4 不互为前置，H5 复用已有 Simulation，不等待 S22–S24 World Model。

## 0. Codex 需要完成的正式企划任务

不是立刻重构 Memory 源码，而是**将已确认的研究设计与已有正式 Agent Intelligence Runtime 企划的职责和依赖正确合并**：

1. 读取当前远端真实 Git refs，确认 main、docs 和用户的目标产品任务分支；
2. 读取正式 Plan Bundle 的入口及必要模块：decisions、architecture、delivery、baseline、compute-policy、behavior-context、execution-reuse、S15–S21 / G01–G06 对应内容；只读与整合有关章节，不必重载所有研究。
3. 将 HCM-01–08 映射到当前已批准/候选模块。**确定一处详细权威**：Memory 唯一召回与 Retrieval 设计归独立 Memory 研究或新正式模块；Actor/Cognition S16–S21、World Simulation、Context/Compute/Reuse 不重写第二份详细规则。
5. 显式标注哪些工作在现有开发分支后执行、哪些依赖 M8 G05/G06、哪些由 M3 或现有 World Simulation 提供；
6. 文档整合后更新同一正式 Plan 的入口/决策/路由；不修改不相关的 Record/HANDOFF，也不把独立 docs 研究仓库直接 merge 到 main。
7. 7.已有 M1 测试通过与不利结果均不能重写或虚构。

### 应读取的实际入口

| 职责 | 文档 |
| --- | --- |
| 产品已确认决定 | [Hybrid decisions](decisions.md) HCM-01–08 |
| 具体 Memory 检索/上下文契约 | [Hybrid architecture](architecture.md) |
| 代码证据、候选算法、测试/消融 | [R6 research](retrieval-design.md) |
| 原正式架构/权限 | [Agent Runtime architecture](../agent-intelligence-runtime/architecture.md) |
| 原阶段与依赖 | [Agent Runtime delivery](../agent-intelligence-runtime/delivery.md) |
| 现有 Context / Compute / Reuse | [behavior-context](../agent-intelligence-runtime/behavior-context.md)、[compute-policy](../agent-intelligence-runtime/compute-policy.md)、[execution-reuse](../agent-intelligence-runtime/execution-reuse.md) |
| 用户记录与开发事实 | [现有同一 Record](../../../records/refactor/agent-intelligence-runtime.md) |

## 1. 功能工作包建议：原职责优先，而非无限新增阶段

以下 H0–H5 是**交付切片**；是否合成一个新 refactor task / 归入 S/G 的精确位置，由 Codex 和当时实际已批准 Plan 决定。不能保留两个竞争的 Memory Authorities。

| 候选切片 | 可见成果 | 先决依赖/退出要求 | 原 Plan 接入点 |
| --- | --- | --- | --- |
| **H0: Baseline & Security** | 现有三种召回、普通 RP/Native Game/Package Turn 的真实调用图；有权限的证据测试与中文长篇样本；测原成本、延迟 || M1 Evidence/Eval 仅读证据，不新建判分权威；测试可独立进行 |
| **H1: Single Recall & eligibility** | 对外唯一 Hybrid；移除旧两种模式 UI/配置/独立分支，Retention/Source/Actor 授权前置；可索引配置资源仍内部使用 | 不丢失有效 Atria 原生历史或可证明记忆；不迁移旧 ST；测试无重复召回/旧模式双读，取消/分支回滚正常| Memory 正式模块 + Information/Native bridges；不扩大 M1 |
| **H2: Query & bounded ranking** | 中文指代/时间/承诺/关系查询；合法 lexical/typed graph/optional vector；RRF/覆盖选取 | 对现有简单查询不回退；重要承诺、旧事实/当前状态冲突、错信、无 Embedding 可用，且质量—成本有证据 | Context/Memory 消费，M3 中的 Actor 认知只读取不越权写 |
| **H3: Selective deep retrieval** | 只有困难样本才允许 typed multi-hop/PPR/MMR/Rerank/LLM query rewrite；完整 skip/stop trace | 真实多跳/因果有效链的召回改善，有界成本；普通对话不用固定额外 LLM；模拟错误/预算耗尽显式降级 | M8 Compute/Route/G05–G06 成熟接口；后续 M3 使用 |
| **H4: Delta index & source-valid cache** | 投影/向量增量索引，合格依赖的候选复用，稳定 Context segment 与 Provider cache 能力观测 | 删除/编辑/分支改变/权限撤回不复用错证据；实测 p50/p90、Embedding/Network bytes、valid/invalid hits；未知费用标 unknown | M8 G02/G03/G04/G06，复用现有 Execution Reuse |
| **H5: Cognitive consumers and RP quality** | Actor 可知/误信、遗忘、长期承诺、旁白 B/作品 A、C 与自主世界时间的集成评估 |后台任务回滚安全| M2 Goal、M3 S15–S21、M4 世界时钟/模拟、M5 Expression |

建议安全/来源/接口优先，然后相关性，再考虑昂贵推理和缓存；H4 的 CPU 基准可在 H0 就做以决定优化顺序。任何失效绕过优化应拒绝，而不是计作“性能改善”。

### 分组依赖示意

~~~text
现有 M1 Evidence / Eval（不修改退出门槛）
    ├── Memory H0 baseline
    └── Existing Authority / Information / Context proofs
               ↓
          H1 unified recall + actor/source eligibility
               ↓
          H2 cheap query + fused coverage
               ↓
       H3 optional deep retrieval  ← M8 Compute/Route budget substrate
               ↓
       H4 source-valid delta/cache ← M8 Reuse/Context/Provider paths
               ↓
       H5 RP cognitive consumers  ← M2 Goal + M3 Actor Cognition + World Simulation
~~~

这只是建议的因果依赖，不表示 G/S 阶段的原顺序允许被擅自改动。

## 4. 知识/隐私边界与安全性

- **前置可见性**：来源/Actor/Temporal/Branch 过滤要发生在 embedding 结果读取、graph neighbor 扩展、LLM query rewrite prompt 建造与候选缓存返回之前；
- **最小权限**：Actor A 的私有信念不在 Actor B 的 Context 或任何跨 Actor 复用缓存中出现，Narrator 宽可见性不向 NPC tool 放权；
- **Prompt injection**：来自历史剧情、Lorebook、外部工具或 Memory Episode 的原文都是低信任**数据**，不能通过“模拟系统提示词”修改 Runtime 指令与能力 allowlist；
- **读写并发**：async 引擎处理期间 World/Branch/Actor/Message/Source 改动必须阻止旧提案与旧结果覆盖；
- **模型费用**：任何加深检索及认知推理通过原预算和 charge，后台不得借独立模型客户端规避额度；
- **自主模拟**：只有 World Tick 发生合法推进时调度 NPC；NPC 计划是待裁决意图，不能自动写为正式事件；原 Simulation step/deliberation 限制和任务 outbox 是基线，不以新 Memory 需求自动提额。

## 5. 正式整合时需要形成的具体产物

建议 Codex 只修改完成企划整合所需的原正式模块，避免新建第二份笨重的总研究复制品：

1. **原 Agent Runtime index**：增加 Hybrid Memory 2.0 架构子模块的阅读路由、依赖/实施候选阶段说明；更新状态为“架构已定，待实施/实测”，不能把当前 M1 写为通过。
2. **原 decisions**：新增 HCM-01–08 的**简短精确交叉引用**或规范化相同决定，注明其来源及正式阶段采纳范围，勿全文复制本研究。
3. **原 architecture**：补 Memory/Actor/Information/Context/Runtime 的信息流和约束；涉及所属权威时只连链接，不改 World 或 Actor 的正统定义。
4. **原 delivery**：把 H0–H5 分派到适当的有限交付组（可为一组新 Memory refactor，也可映射既有 S/G）；
5. **原 baseline/research**：将有效的源码事实/学术研究作为具体证据挂载；
6. 产品实施和真实模型测试发生后再更新既有 Record。不因新研究主动改已有 M1 历史或 HANDOFF。

## 6. 下一步工作边界

产品方向已定，BFS 深度、RRF 参数和缓存 TTL由实现确定。正式企划整合后，仍需根据当前分支实时状态与原 Plan 逐阶段推进真正的代码实现；在新的产品权限、数据销毁、费用承诺或高风险自主行为超出 HCM-01–08 时才需要额外产品批准。
