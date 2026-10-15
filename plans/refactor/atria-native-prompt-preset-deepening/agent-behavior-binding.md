# D4 讨论草案：V3 Agent Node 的 Behavior Program、Prompt 绑定、继承与 Host 编译

> **D4 OPEN，2026-10-15。** D1=B、D2=J2+F2+R3、D3=E2+A2+K2+G1 均已冻结。本文件只为第四轮提出架构候选与可核实接口，**不批准修改 main、V3 现有合同或增加第二套 Agent Runtime/Prompt Compiler/Store**。唯一 Host 权威沿 [V3 Interface Contracts](../atria-native-orchestration-v3/interface-contracts.md)；E2 的创作表达语义归 [D3](narrative-behavior.md)。

## 1. 2026-10-15 真实代码与接口缺口（STATIC ≠ 已实现）

| 远端核实位置 | 当前真实语义 | D4 不能跳过的事项 |
| --- | --- | --- |
| V3 实现 `public/shared/native-orchestration-contracts.js` (`refactor/atria-native-orchestration-v3@c04f369...`) | Node.kind 包含 agent/planner/judge/review 等；Node 有 `dependencyPinIds`，`node.policy.agentPinId`；Plan 有 `dependencyPins[pinId,port,resourceRef,integrity]`。Node schema 严格拒绝任意新增字段 | **不存在已验证可直接写进 Node 的独立 `behaviorProgramRef` 字段**；更改必须同 V3 owner 协调 validator/依赖闭包，不得在本 Plan 自称已经接通 |
| V3 `PlanRepository` | PlanDraft/PlanRevision/Binding 通过原 Native Engine 写入；`definitionHash`/pins 参加发布，精确版本由 Host 验证；正在开发中的基础设施 | 不另建 PresetBinding 表，不借 Browser 管 Plan Version |
| V3 `interface-contracts.md` §11 | `plan-prompt` Evolution target 已冻结 `bindingId+planRef+nodeId+promptModuleRef`；新 Prompt Candidate → PlanRevision → binding CAS | 继续复用此版本发布/回滚机制；当前方案不得重新定义 Candidate/Evolution Writer |
| `main:src/native/model-prompt-runtime/route-resolver.js` | RuntimeRoute 原生保存 exact `promptProgramRef` + GenerationProfile；Resolver 以 Route 指针展开 exact Program/Modules | 若 Node 独立选择 Program，**必须显式解决 Route Program 与 Node Program 的身份及能力冲突**；仅在 Browser 下拉选择 Program 并不会自动成为 Execute 输入 |
| `main:src/native/model-prompt-runtime/README.md` 与 `prompt-compiler.js` | `/preview` 可以使用受限 exact `previewRefs`，生产 `/execute` 不允许直接提交未受信覆盖；Compiler 已实现 `parentRef`/derive、stage/conditions/typed params、PromptIR/source fingerprints | 无条件透传 `promptProgramRef` 给外部 execute 或构建第二 Browser compiler 都不符合已冻结边界 |
| V3 `ContextPort`/`ModelPort` §11.2 | `ContextPort.compile(...audience,taskPurpose,grantDigest,...)`；`ModelPort.generate(...routeRef,contextRef,outputSchemaRef,...)` 原端口合同 | Host 必须负责受信绑定、Context 有效性、Model Route 与实际 Provider snapshot；额外字段/Port 内部适配须同 V3 owners 经过合同审查 |

**差距性质**：Node 钉了 Agent/Dependency 并不代表 Node 已经具备一个可与 Route Prompt 彼此独立选择且在发送端强制执行的 Behavior Program。D4 讨论的是这个缺口的最小闭合方案，而不是创造新的“Prompt OS”主机。

## 2. 要维护的单权威数据流（概念图，非已实现 API）

```text
Author-reviewed Native Prompt Program/Module exact refs
           │
   V3 immutable PlanRevision dependency pins + Node purpose/policy
           │  (validate owner/scope/role/Program closure)
           ▼
V3 Host NodeAttempt admission / SourceBinding / audience / budget
           │
ContextPort (original Memory/Context) + RouteResolver (original Model)
           │
Trusted PromptSelection (frozen Program closure + E2 Expression overlays)
           │
Existing PromptCompiler → PromptIR / compiledBinding / provider capability
           │
Existing GenerationService / ModelPort → Effect/Receipt → ResultEnvelope
           │
Original NarrativeOutputPort / Experience/Eval / plan-prompt candidate
```

可信 NodeAttempt 的 source/branch/actor/audience/route/PromptRevision 由 Host 以原 Plan 引用和 Source authority 确定，不接受模型发回的 `role`、`programRef`、`capability`、`prompt.host` 或任意用户 JSON 作为授权。Context 的 Source 信息与正式作者 Prompt 是两类来源；不会因进入一个 Program 而洗白为 Host 指令。

## 3. B：Agent Node 该怎样绑定 Behavior/Prompt Program？

| 选项 | 设计 | 利弊 |
| --- | --- | --- |
| **B1 Route 随附 Program** | Node 只 pin 一个受信 RuntimeRoute，隐含使用 Route 当前 Program；不同 Agent 意味不同 Route | 侵入小，但模型职责与创作行为耦合；Route 更新可能与 V3 exact pins 冲突 |
| **B2 V3 Node 选择精确 Program + 受信 Route（推荐讨论）** | 将 Behavior 视为**现有 `core.prompt-program` 的受限语义用途**，经 V3 `dependencyPins` 精确钉 Program/Module，与具合法角色及能力的 Route 关联；Host 在准入时解析两者 | 最符合 J2/E2/Agent Node，但需要 V3 Schema/Host Model Port 对“Node 选 Program 与 Route 自带 Program 不同”作确定性仲裁，不得假装现有 Execute 支持覆盖 |
| **B3 Node 内联 Instructions / Script** | 每个节点直接保存大段自由文本、局部独立编译 | 容易绕过 immutable revisions/来源追踪、破坏 F2 单资源和 Candidate 发布，较差 |

**B2 的前置实现门槛**：可选择 (a) 在原 V3 的受信 Node/DependencyPin/HostPort 上增加 exact Program Selection，内部受限调用原 RouteResolver + PromptCompiler（不开放任意客户端覆盖）；或 (b) Host 选出正式拥有该 Program 的适格 Route 再执行。必须证明同一个有效 Node purpose/role、模型能力与 Program 版本，并使 V3 `plan-prompt` Candidate/PIN 生命周期仍真实有效。**以上是备选物理出口而不是已批准的隐式适配**。

## 4. I：行为与文学风格如何继承？

| 选项 | 设计 | 风险与价值 |
| --- | --- | --- |
| **I1 复制所有文本模块** | 每 Node 独立复制整套 Foundation/Expression/Style | 简单但冗余，内容漂移，难以追溯用户改动 |
| **I2 Native 精确继承 + E2 类型化 Overlay（推荐讨论）** | 复用原 `PromptProgram.parentRef / derive(add|disable|replace|configure)`、Stage/module conditions 与 exact refs；作者创作默认 → Scene/Genre overlay → Narrator/Character/Agent 目标化选择 | 不建第二 DSL/Store，能验证版本、冲突和模块贡献；要证明 overlays 是编译语义而非新增持久真相 |
| **I3 运行时追随“最新版”** | Node/Program/角色风格总是解析 Library latest | 破坏发布、运行回放与离线 Package 的固定依赖，不推荐 |

I2 不意味着数值上“角色 voice priority > World Truth”。表达优先级仅在艺术约束域内有效；Source/World/Actor/Player 权限始终在上级原 Authority。继承不因 Clone/Context 缩写而丢失 module provenance。

## 5. C：什么时候真正编译和冻结有效 Prompt？

| 选项 | 设计 | 后果 |
| --- | --- | --- |
| **C1 RuntimeRoute 常规编译** | 节点调用现有 Route → Resolver/Compiler；不要求独立 Program/Node compiled binding | 最少改动，但 Node 的 Behavior 语义和准确版本可能无法反映在发送端 |
| **C2 Host NodeAttempt 精确冻结 + 原 Compiler 编译（推荐讨论）** | 每次需要模型发送时由 V3 Host 以获准 PlanRevision/Node/Route/Program refs + SourceBinding/audience/context/预算准备一次真实有效的 immutable 请求快照；调用**同一个**原 PromptCompiler/GenerationService | 能支持审计、失败恢复、模型 fallback 重编译；需要扩展受信 Host 内部 prepare/send Port，不应再造 Prompt Compiler |
| **C3 Browser 先拼接全部 Prompt** | UI 在运行前构造最终文本并上送模型/Host | 来源和权限难验证，版本漂移与注入风险高，不推荐 |

**C2 必须定义的退出门槛**：
1. Plan publish 钉 Program/Modules 完整 exact closure + Role/Context/Output/Provider 所需 capability；无效缺失 fail closed，而不是回退旧 ST Prompt。
2. `NodeAttempt` 保存有依据的 compiled fingerprint、原 Program/Module/Route/Model refs、有效 Context/Source dependency/版本和结果 Receipt refs。RunLedger 保存最小受权限保护的引用/指纹，**不复制 Secret 或私有 Cognition 全文**。
3. Provider adapter、Model capability、route-specific Generation Profile、tokens/output/tool schema 与同一 Compiler 真实计数。Fallback 若切换 Route，必须重新编译，且不能悄悄换成与 Node 冻结 Behavior 冲突的另一个 Program。
4. 并发编辑/Library 更改不改写已经 pin 的 PlanRevision/NodeAttempt；合法 new revisions 只作用于下一次授权运行。Context/Source/Branch/Actor Grant 变更必须在 Send/Consume 关键点经原 Port 再校验。
5. 所有可能的自动优化通过原 `EvolutionTargets: plan-prompt` 生成新 PromptModule → 新 PlanRevision → 原 PlanBinding CAS；不能覆盖正在运行的 Plan 或绕审直接替换节点指令。
6. 正常 RP 的 G1 单 Narrator 不能因 B2/I2/C2 默认产生任何额外模型调用；优先复用已有确定性编译/Context 计算。

## 6. 组合推荐、边界与后续讨论

**建议组合 B2 + I2 + C2**：Node 精确资源选择 + 现有 Prompt Program 继承 + Host 单次确定性编译/审计，避免重复 Agent/Memory/Compiler。但 B2 当前未打通的 Node/Route/Program 精确绑定**是真实实施工作，不能仅靠更换 UI 文案宣布完成**。

本轮不决定 TypeScript/JS 具体 Schema、路由 RPC 字段、缓存 key、降级顺序、具体 Provider lowering、编辑 UI；这些须在 D4 用户确定方向后转 D5/后续实施 E0 与 V3 协调。不得破坏 D3 的 E2/A2/K2/G1、D2 J2/F2/R3 和正式重构不兼容旧 ST 的硬决定。

**尚待用户选择：B1/B2/B3、I1/I2/I3、C1/C2/C3**。随后按约定：先更新提交同一 Plan Bundle 与唯一 Record，再进入 D5。现在不创建产品实现分支，不改 main。
