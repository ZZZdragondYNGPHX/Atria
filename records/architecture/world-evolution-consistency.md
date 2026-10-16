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

- GitHub connector 已返回上述三次 docs 分支文档提交 SHA，并额外确认 Plan 状态更新及双导航索引提交：abfb8c044c934cecdb09d2b0113c0ae28c303da1、6b7580c5aab60a3b0de5c36dd74ff2417d89da80、b90c5b3fcec20d58373e80fa51f0057252150de6。
- 2026-10-17 再次通过 GitHub fetch_file(ref=docs) 分别验证 index.md、research.md、design.md、唯一 Record、plans/architecture/README.md、records/README.md **6 个文件均存在且可读**。
- 仅静态代码核对 + 外部官方文档/论文阅读；未运行项目、Node 测试、CI、客户端、浏览器或真机。
- 未更改 main/product、未创建开发分支、未合并长期分支。
- Round 1 Plan 入口已标记“外部调研与初步静态核对完成 / 待讨论”。最近一次核验时的 docs 文档 HEAD 为 b90c5b3fcec20d58373e80fa51f0057252150de6（其后本 Record 更新会产生新提交）。

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


## Stage 2 — S2 世界 / 知识原生重构扩域研究与候选方案（2026-10-17）

- Trigger: 用户明确提出「现有 World / Knowledge 仍受 SillyTavern 时代世界书影响，希望趁机进一步重构」。
- Primary Workspace: docs，沿用 ARCH-DWE-01 唯一 Plan/Record，不创建重复企划书。
- Status: **Draft / Discussion**；没有用户批准的最终架构，也未开始产品实现。
- docs document commit sequence:
  - 4552d64bbee8a2fe18e8cbe66e4bdc86236eea28 — design.md 新增 §8 S2 扩域设计、ST 概念去留、World Model / Source Library / Effective View 与轮次选择。
  - 6a669c4a8a8953f22bf85e7af48cd1ca9fb4ecb3 — research.md 新增 §F ST/W3C SHACL/PROV-O/RDF/XTDB/Concordia/inkle/Generative Agents 对照及 Atria main 语义证据。
  - 09876a77b6c5278a4d45653b3cc8e7aa323b92c3 — index.md 调整统一 Plan 的目标、讨论入口和当前状态。

### Evidence and completed work

- GitHub connector 静态核对 main 的 src/native/world-knowledge.js、public/scripts/native/knowledge-contracts.js、knowledge-runtime.js、knowledge-selection.js、public/scripts/native/experience/world/session.js、docs/features/native-knowledge.md，以及 Native SessionCore/Simulation/Context 相关实际路径。
- 区分“已有原生重构成果”与“仍继承旧条目/触发器心智模型”：前者有原生版本、binding、state/events、权限和上下文；后者仍以 discovery/lifecycle/delivery 字段为重要语义。未断言所有 ST 残留仍是活跃消费者。
- 补充外部原始资料对照；建立 Candidate A（Semantic Lorebook）、B（World Model + Source Library，研究推荐）、C（Universal World Knowledge Graph）的利弊及 E0 前置验证问题。
- 用户此前未就 R1 事实锚点与四层解释模型正式批准任何路线，保持未决。
- 未修改 main、未创建产品分支、未运行测试/CI/真机/跨端 UI。GitHub 文件提交不等于 Atria 工程验证。

### Limitations and next checkpoint

- 后续每轮依用户要求：**先在 docs 更新 Plan 与唯一 Record、提交并核查，再讨论**。用户最终确认前一直 Draft。
- 下一次需围绕 World 与 Knowledge 主体关系和是否采用 Hybrid Authoring / 精确事实锚点做正式取舍；之后再展开实体/时间/认知/索引/UI/E0。
- 外部模型仅为方法论；严禁无证据引入第二世界权威、新 DB 或创建旧数据兼容负担。


## Stage 3 — W1 方向决定与 W2 建模讨论准备（2026-10-17）

- 用户明确同意上一轮推荐的 **B · World Model + Source Library**（W1）：世界模型是创作主语，知识是资料/来源；产品心智模型脱离以 ST Lorebook 的条目激活为中心。
- 此项是**总体设计方向获得认可**，不是整份方案定稿或全部子接口冻结；以 SessionCore/Session/Branch/Revision 为唯一运行时真相的原则与用户所选 B 一致；不创设新可写事实权威，不强迫纯文字作者全面结构化。
- design.md 已加入 §9：Entity、Relation、Assertion、Rule、Source 候选表达，纯文字/辅助/结构化三种创作体验，动态事实锚点及历史/认知实例、W2 A/B/C 三种取舍。
- Plan index 已标记 W1 认可与 W2 待议；W2 推荐 B 的混合模型尚未获用户选择，不可提前宣称批准。
- 本阶段操作仅修改 docs 分支，未改 main / 产品源码，未创建实现分支、运行任何测试/CI 或真实客户端验证。
- 下一检查点：围绕 World Entity 稳定身份、可变事实与自由文献之间的关系、作者何时确认 AI 候选事实做 W2 讨论；下一轮仍是**先更新同一 Plan/Record，再讨论**。

## Final state

Not yet applicable. Discussion in progress.
