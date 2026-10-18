# D4 已冻结：V3 Agent Node 精确 Program/Route、原生继承与 Host 编译

## 1. 2026-10-15 真实代码与接口缺口（STATIC ≠ 已实现）

| 远端核实位置 | 当前真实语义 | D4 不能跳过的事项 |
| --- | --- | --- |
| V3 实现 `public/shared/native-orchestration-contracts.js` (`refactor/atria-native-orchestration-v3@c04f369...`) | Node.kind 包含 agent/planner/judge/review 等；Node 有 `dependencyPinIds`，`node.policy.agentPinId`；Node schema 严格拒绝任意新增字段||
| V3 `PlanRepository` | PlanDraft/PlanRevision/Binding 通过原 Native Engine 写入；正在开发中的基础设施| 不另建 PresetBinding 表，不借 Browser 管 Plan Version |
| V3 `interface-contracts.md` §11 | `plan-prompt` Evolution target 已冻结 `bindingId+planRef+nodeId+promptModuleRef`；新 Prompt Candidate → PlanRevision → binding CAS | 继续复用此版本发布/回滚机制；当前方案不得重新定义 Candidate/Evolution Writer |
| `main:src/native/model-prompt-runtime/route-resolver.js` | RuntimeRoute 原生保存 exact `promptProgramRef` + GenerationProfile；Resolver 以 Route 指针展开 exact Program/Modules | 若 Node 独立选择 Program，**必须显式解决 Route Program 与 Node Program 的身份及能力冲突**；仅在 Browser 下拉选择 Program 并不会自动成为 Execute 输入 |
| `main:src/native/model-prompt-runtime/README.md` 与 `prompt-compiler.js` | `/preview` 可以使用受限 exact `previewRefs`，生产 `/execute` 不允许直接提交未受信覆盖；Compiler 已实现 `parentRef`/derive、stage/conditions/typed params、PromptIR/source fingerprints | 无条件透传 `promptProgramRef` 给外部 execute 或构建第二 Browser compiler 都不符合已冻结边界 |
| V3 `ContextPort`/`ModelPort` §11.2 | `ContextPort.compile(...audience,taskPurpose,grantDigest,...)`；`ModelPort.generate(...routeRef,contextRef,outputSchemaRef,...)` 原端口合同 | Host 必须负责受信绑定、Context 有效性、Model Route 与实际 Provider snapshot；额外字段/Port 内部适配须同 V3 owners 经过合同审查 |

**差距性质**：Node 钉了 Agent/Dependency 并不代表 Node 已经具备一个可与 Route Prompt 彼此独立选择且在发送端强制执行的 Behavior Program。D4 讨论的是这个缺口的最小闭合方案，而不是创造新的“Prompt OS”主机。

## 2. 要维护的单权威数据流（概念图，非已实现 API）

可信 NodeAttempt 的 source/branch/actor/audience/route/PromptRevision 由 Host 以原 Plan 引用和 Source authority 确定，不接受模型发回的 `role`、`programRef`、`capability`、`prompt.host` 或任意用户 JSON 作为授权。Context 的 Source 信息与正式作者 Prompt 是两类来源；不会因进入一个 Program 而洗白为 Host 指令。

## 3. B：Agent Node 该怎样绑定 Behavior/Prompt Program？

| 选项 | 设计 | 利弊 |
| --- | --- | --- |
| **B1 Route 随附 Program** | Node 只 pin 一个受信 RuntimeRoute，隐含使用 Route 当前 Program；不同 Agent 意味不同 Route | 侵入小，但模型职责与创作行为耦合；Route 更新可能与 V3 exact pins 冲突 |
| **B2 V3 Node 选择精确 Program + 受信 Route（已选）** | 将 Behavior 视为**现有 `core.prompt-program` 的受限语义用途**，经 V3 `dependencyPins` 精确钉 Program/Module，与具合法角色及能力的 Route 关联；Host 在准入时解析两者 | 最符合 J2/E2/Agent Node，但需要 V3 Schema/Host Model Port 对“Node 选 Program 与 Route 自带 Program 不同”作确定性仲裁，不得假装现有 Execute 支持覆盖 |
| **B3 Node 内联 Instructions / Script** | 每个节点直接保存大段自由文本、局部独立编译 | 容易绕过 immutable revisions/来源追踪、破坏 F2 单资源和 Candidate 发布，较差 |

**B2 的前置实现门槛**：可选择 (a) 在原 V3 的受信 Node/DependencyPin/HostPort 上增加 exact Program Selection，内部受限调用原 RouteResolver + PromptCompiler（不开放任意客户端覆盖）；或 (b) Host 选出正式拥有该 Program 的适格 Route 再执行。必须证明同一个有效 Node purpose/role、模型能力与 Program 版本，并使 V3 `plan-prompt` Candidate/PIN 生命周期仍真实有效。**以上是备选物理出口而不是已批准的隐式适配**。

## 4. I：行为与文学风格如何继承？

| 选项 | 设计 | 风险与价值 |
| --- | --- | --- |
| **I1 复制所有文本模块** | 每 Node 独立复制整套 Foundation/Expression/Style | 简单但冗余，内容漂移，难以追溯用户改动 |
| **I2 Native 精确继承 + E2 类型化 Overlay（已选）** | 复用原 `PromptProgram.parentRef / derive(add|disable|replace|configure)`、Stage/module conditions 与 exact refs；作者创作默认 → Scene/Genre overlay → Narrator/Character/Agent 目标化选择 |要证明 overlays 是编译语义而非新增持久真相|
| **I3 运行时追随“最新版”** | Node/Program/角色风格总是解析 Library latest | 破坏发布、运行回放与离线 Package 的固定依赖，不推荐 |

I2 不意味着数值上“角色 voice priority > World Truth”。表达优先级仅在艺术约束域内有效；Source/World/Actor/Player 权限始终在上级原 Authority。继承不因 Clone/Context 缩写而丢失 module provenance。

## 5. C：什么时候真正编译和冻结有效 Prompt？

| 选项 | 设计 | 后果 |
| --- | --- | --- |
| **C1 RuntimeRoute 常规编译** | 节点调用现有 Route → Resolver/Compiler；不要求独立 Program/Node compiled binding | 最少改动，但 Node 的 Behavior 语义和准确版本可能无法反映在发送端 |
| **C2 Host NodeAttempt 精确冻结 + 原 Compiler 编译（已选）** | 每次需要模型发送时由 V3 Host 以获准 PlanRevision/Node/Route/Program refs + SourceBinding/audience/context/预算准备一次真实有效的 immutable 请求快照；调用**同一个**原 PromptCompiler/GenerationService | 能支持审计、失败恢复、模型 fallback 重编译；需要扩展受信 Host 内部 prepare/send Port，不应再造 Prompt Compiler |
| **C3 Browser 先拼接全部 Prompt** | UI 在运行前构造最终文本并上送模型/Host ||

1. Plan publish 钉 Program/Modules 完整 exact closure + Role/Context/Output/Provider 所需 capability；
2. `NodeAttempt` 保存有依据的 compiled fingerprint、原 Program/Module/Route/Model refs、有效 Context/Source dependency/版本和结果 Receipt refs。RunLedger 保存最小受权限保护的引用/指纹，**不复制 Secret 或私有 Cognition 全文**。
3. Provider adapter、Model capability、route-specific Generation Profile、tokens/output/tool schema 与同一 Compiler 真实计数。Fallback 若切换 Route，必须重新编译，且不能悄悄换成与 Node 冻结 Behavior 冲突的另一个 Program。
4. 并发编辑/Library 更改不改写已经 pin 的 PlanRevision/NodeAttempt；合法 new revisions 只作用于下一次授权运行。
5. 所有可能的自动优化通过原 `EvolutionTargets: plan-prompt` 生成新 PromptModule → 新 PlanRevision → 原 PlanBinding CAS；不能覆盖正在运行的 Plan 或绕审直接替换节点指令。
6. 正常 RP 的 G1 单 Narrator 不能因 B2/I2/C2 默认产生任何额外模型调用；优先复用已有确定性编译/Context 计算。

## 6. B2 + I2 + C2 已冻结的实现边界

### 6.1 B2 — 独立行为引用与原 Route 的真实冲突

- 原 `core.prompt-program` 承担 Behavior 的 Prompt 层，`core.prompt-module` 管独立 stage/target/typed 文本；V3 Plan/Node 通过受控 exact dependency pins 选择 Program 与 Runtime Route，**Route 仍由原 Model/Profile/Connection/Provider Authority 负责**。
- 它没有被静态证据证明可为模型发送绑定独立 `promptProgramRef`。`src/native/model-prompt-runtime/route-resolver.js` 从 Route 精确解析 Program，普通 `/execute` 的 PreviewRefs 不允许成为可提交的任意覆盖。
- 无法保持时阻断，不能 silent fallback 到不同创作规则。

### 6.2 I2 — 继承仅在 Prompt/Expression 层发生

- 使用原 `parentRef` + `derive(add/disable/replace/configure)` 的 exact 继承，保持原父 Program/Module 的可追溯身份与作者明示差异。**替换、禁用、配置修改保留被操作条目的原有有效位置；新增须显式指定合法 Stage/target 内插入位置**，不得缺位时静默追加末尾。原数据中 `derive` 操作尚没有完整位置语义，本条是目标合同，不把现有 `priority`/ID 排序写成已改造；位置字段、继承插入与合并冲突如何落地留后续设计。 Anchor 若作为 Stage 有序条目参与继承，须保留同一父级位置与稳定身份，新增/修改走子级显式差异与 exact 发布；不把 Anchor 当作独立版本化资源或供客户端任意挂载 Context 的后门。具体继承字段和冲突编码仍需在物理 Schema 阶段确定。
- E2 的作者默认 → Scene/Genre Overlay → Narrator/Character/Agent 不是新增 World 或 Persona 存储权威，而是编译前/中的**语义组合**。角色台词不能因作品整体文风变化而被自动同质化；文学表达优先级不能覆盖 Actor Cognition、World Truth、玩家自主权或受限 Disclosure。
- F2 的结构面板与完全自由作者原文须准确回到同一 versioned resource，已发布 revision 与运行时冻结的 Program 均不能被 UI 草稿或异步候选悄悄覆盖。
- 作者 Stage/Module 条件只对 Host/Compiler 已合法提供的类型化输入进行确定性求值；条件不承担 Source/Actor/World 检索或 Grant 发放。条件不成立时保留原编排条目的版本身份并在有效编译中说明排除原因，不把禁用/未激活误写成永久删除。

### 6.3 C2 — Host NodeAttempt 的确定性准备与恢复证据

- Native Host 先确认 authenticated owner/PlanRevision/NodeAttempt、source/branch/epoch、Audience/Grant、Role/Route/Model、Program/Module closure、Tools/OutputContract 与原 Run/Compute 额度，才调用原 ContextPort、RouteResolver、PromptCompiler、GenerationService。
- 每次实际请求冻结可信的有效 Program/Route/Model 与 Compiler version、PromptIR/Context dependency/参数决策和 provider rendered fingerprint；指纹是诊断身份，**不是权限 grant 或 Provider cache hit**。 冻结的静态 Program/Plan 与每请求选取的动态 Context 是两种生命周期：后者不是新版本化 Prompt/World 资产，不把请求级 Contribution 反写 Program。
- 发布的 Plan 是 static exact pins；运行时 Context/source grant 有自身 currentness。 **发送前**遇 Source/Grant/Branch/WorldTick/currentness 变化，只有原 Host 可以重新选择 Context、重新编译与重新计数或阻断；失败重试须遵守原 V3 Attempt/Receipt 幂等和真实费用语义。
- G1 的单 Narrator 不得被编译层变成每轮固定 Planner/Judge；失败局部重做使用新 attempt/effect identity，原业务已提交副作用不盲重发。

## 7. D4 接口阻塞矩阵（设计冻结 ≠ 功能完成）

| 目标 | 当前证据 | 实施期必须证明 |
| --- | --- | --- |
| Node 精确 Program 选择 | 当前 Node policy 只有 `agentPinId`；`dependencyPins` 可承载通用 resourceRef，但尚无受信 Program 消费主链 |不接受 Browser 未审越权覆盖|
| Node Program 与 Route Program 不同 | 当前 RouteResolver 只读取 `route.promptProgramRef`，execute 无普通受信覆盖 |不借另一套 Model Router|
| 精确继承/表达 Overlay | `PromptCompiler.flattenPromptProgram` 支持 parent/derive；E2 分层尚是方案 | Program 引用闭包、Module 决定、原文 round trip、Actor Voice/Scene 独立、实际有效来源 |
| NodeAttempt 快照/恢复 | 原 `compiledRequestBinding` 已有指纹；V3 RunLedger 仍在开发 | Send/Resume/Context currentness、Attempt/Receipt、异步更新、权限撤销、模型 Provider 切换的端到端证据 |
| 质量与成本 | 原 `plan-prompt` target / Experience/Eval、Context/Budget | 新 Candidate/Plan CAS，不重复 Model 费用与副作用；G1 单模型路径无强制额外调用 |

所有产品代码工作留后续正式 E0/实施。

## 8. 下一阶段

D5 在 [semantic-ir-lowering.md](semantic-ir-lowering.md) 讨论 Provider-neutral IR、各 Adapter lowering、硬/软冲突诊断、稳定/动态缓存、Context 与真实 Provider 计数预算。D5 未作用户决策；后续仍遵循先更新同一 Plan/Record、提交 docs，再讨论 D6。正式重构零 ST/旧 Workspace/API 兼容；V3 T2 唯一 Host 权威不变。
