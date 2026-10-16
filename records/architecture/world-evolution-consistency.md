# ARCH-DWE-01 — Dynamic World Evolution & Consistency Record

- Task ID: ARCH-DWE-01
- Primary Workspace: docs
- Status: Active · Research/Discussion (not implementation)
- Plan: [plans/architecture/world-evolution-consistency/index.md](../../plans/architecture/world-evolution-consistency/index.md)
- Initiated: 2026-10-17

## Stage 1 — 建立方案与首轮广泛调研（2026-10-17）

- Start HEAD: 未在操作前捕获 docs 原 HEAD；不据此推断其他分支进度。
- Document change commits:
  - bca017a98185ec7ae2371ba9b8b07c75cf9c9b60 — 创建 index.md 初始方案。
  - 40468c295ca0b9909ccce7b5f363c33a7c85de0a — 添加 research.md 外部调研和 main 相关接口核对。
  - f916aefe4c21503b35f19f41e0293a702a04fbcc — 添加 design.md 方案对照、冲突案例、问题轴与风险。
- Status: 当前讨论稿与调研材料已写入；尚未确认最终架构和实施计划。

### Completed

- 阅读 docs:README.md Governance v1.7，确认 docs 独立工作空间、Plan Bundle / Record 职责。
- 初步核对 main 的 World Session/Definition、State Delta、Knowledge Runtime/Selection、Session Knowledge、Context Compiler、Authority/Task/Simulation/History/Hypothetical、Orchestrator Bridge、SavePoint 等相关源文件。
- 外部广泛研究：SillyTavern Lorebook、Azure Event Sourcing/CQRS、XTDB 双时间、Wikidata 时态修饰、Doyle TMS、PDDL、inkle ink、Versu、Comme il Faut、Generative Agents、Concordia、IJCAI Temporal KG、Unreal GAS。
- 记录候选 A（Prompt Overlay）、B（Native Fact Binding + Effective View）、C（Full Temporal World Graph）；B 是研究建议，**不是用户决策**。
- 指出可能存在的关键断点：自由文本知识的过期事实未与当前原生状态精确绑定；模型叙述与世界状态提交的一致性仍需真实端到端审计。

### Verification and evidence

- GitHub connector 已返回上述三次 docs 分支文档提交 SHA。
- 仅静态代码核对 + 外部官方文档/论文阅读；未运行项目、Node 测试、CI、客户端、浏览器或真机。
- 未更改 main/product、未创建开发分支、未合并长期分支。
- 远端文档 fetch 核验与 index 状态更新在本工作轮末执行；仅以实际 fetch 结果为准。

### Known limitations / unresolved

- 相关文件存在不等于运行时消费者已接线，尤其动态事实声明与 freeform KnowledgeEntry 的失效行为需要后续 E0 审计。
- 理论上的“事实锚点、事件语义、有效视图、角色认知”不能未经接口核对就新增第二持久化权威。
- 没有证据证明全量文本矛盾自动识别可以稳定无误；保留此方案的误判/成本风险。
- Round 1 尚未收到用户对 A/B/C/D 关联模式的选择；无已冻结的设计决定。

### Next checkpoint

- 先核对当前 Plan 和同一 Record 的远端版本。
- Round 1 深入讨论「静态设定中哪些是初始事实、哪些是世界法则；如何把自由文本中的可变事实与 Native State 绑定，而不破坏创作自由」。
- 用户做出选择后，于 **下一轮讨论前** 更新同一 Plan/Record，再继续下一议题。
- 全部核心决策获用户明确批准后才定稿；实施由后续独立授权启动。

## Final state

Not yet applicable. Discussion in progress.
