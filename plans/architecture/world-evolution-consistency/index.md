# Atria 动态世界／知识重构（唯一入口）

Task ID：`ARCH-DWE-01`。**Draft / Paused**；等待已排队的编排、提示词与整体前端重构完成，之后由用户明确恢复本任务。本次只整理企划，未恢复产品实施。W1-B～W22-B 已确认的功能／架构方向保持；[同一 Record](../../../records/architecture/world-evolution-consistency.md)保存讨论与实际进展。

## 要实现什么

创作者定义一个可演化的世界，Knowledge 保存资料与说法；游玩中的事件改变本分支世界，NPC 按自己知道的信息行动，存读档恢复对应历史。自由文本始终可用，不强迫作者把所有设定写成表格。

| 功能 | 用户可见的操作与结果 | 原实现归属 |
| --- | --- | --- |
| 世界与资料创作 | Library 编写人物、地点、组织、关系、法则、起点与自由正文；Knowledge 管文献、传闻、引文和资料绑定 | World/Knowledge 原修订与资源服务 |
| 游戏装配 | Studio 选择 World/Knowledge/Actor 模板与 EntryPoint，定义起点、开放细节、关键状态／效果；查看起点及受众预览 | 原 Project/Package、EntryPoint 与 Preview |
| 活世界 | 合法事件更新位置、关系、生命、交易、承诺等；持续后果涉及新 NPC/地点/物品时立即登记稳定主体 | 原 Native Session/Domain/Revision |
| NPC 连续性 | 角色改名、死亡、迁居或换表达模板仍有同一身份；正式参与者、表达模板和个人视角分别处理 | Session Subject、Timeline/Information 与原领域绑定 |
| NPC 自主行为 | 多数走事件／游戏时间／日程规则，相关角色按目标与信息响应，少数关键角色可用有预算的模型提案 | 原 Simulation、Goal、Cognition、Task/V3 |
| 私人记忆与社会信息 | NPC 的信念、情绪、误解和遗忘各有来源；消息经实际观察／通信传播，不自动全员同步 | 原 Information/Cognition/HCM/Memory |
| 当前／历史世界 | 读取某分支修订的当前状态、历史与来源；旧皇帝退位后不继续当现任，但旧史料与角色误信保留 | Host 只读 Effective World、原 State/Event/History |
| 存档与分支 | SavePoint 恢复主体、事实、认知与任务锚点；共享祖先身份，分叉后状态独立 | 原 SessionRepo/Save/Branch/Retention |
| Play 与媒体 | 玩家查看有权知道的人物、关系、事件和历史；对话、语音、插图采用合法可见身份／表达 | 原 Frontend Host、Play、Speech/Visual |

## 实施顺序与依赖

本任务恢复并获实施授权后，按同一条原生功能链推进：

1. **主体与正式效果（WP-A）**：优先在同一 SessionRevision 的受保护 SessionState 内保存最小身份／来源／作用域。接纳主体与本次持续后果一起经原 Domain 发布，业务值仍归原领域。
2. **历史与存读档（WP-B）**：把主体接入 Revision/Save/Branch/GC；事实变化复用原 Event/History，缺失时补必要有效期／纠错引用；提供 Revision 与可用 GameTick 的历史读取。
3. **动态 NPC 与个人视角（WP-C）**：接通 Subject→Participant/Perspective/领域引用；复用认知与记忆，再接事件调度、目标、实际通信和可选模型提案。
4. **有效世界与 Prompt（WP-D）**：按合法受众读取当前／历史／法则／Source Claim/Belief，先筛权限和适用性，再进入已有 Context/Memory/Prompt 管线；不靠 rank 压住过期正文。
5. **对话与媒体（WP-E）**：更新 Timeline、Frontend Host、Play、Speech/Visual 的参与者、模板与可见别名；不把后台真身映射暴露给玩家。
6. **世界创作与界面（WP-F）**：完成 Library/Studio 的轻量正文＋关键绑定、起点有效预览、Play 档案／历史／来源；沿统一前端组件完成手机操作，同步替换旧 WorldInfo/Actor-only 调用。

WP-F 的作者内容编辑可与基础功能并行；运行态预览和 Play 读取依赖对应后端。完整分工见[实现分工与接口依赖](e0-preflight-execution.md)。只处理实际用到的调用方。

## 实施时的连续推进

用户恢复并授权实施后，按上述功能依赖持续推进到整体完成；WP-A～F 用于组织工作，不是停下汇报或等待“继续”的节点。记录随实际工作更新，交付时集中说明结果。普通字段、函数签名、代码冲突和接线选择由执行者处理，执行与真实阻塞统一遵循[仓库治理 §8、§13](../../../README.md#8-task-lifecycle)。

必要自查限于本次实际改动及直接使用者；不另立测试／验证工作包、覆盖率目标、跨端矩阵、取证关卡或独立审查流程。

## 功能边界

- **固定源与活状态分开**：WorldRevision/Package 是作者修订；Play 只改变本 Session，不能回写作者源。
- **单一写入权威**：Domain 正式提交世界效果和 Receipt；V3 管任务／执行，HCM 管证据与认知，Prompt 管编译，均不成为第二世界数据库。
- **留白与事实分级**：普通细节自由生成；持续后果经原 Native 效果确立；重大变化按作品规则授权；改写世界法则沿作者明确允许的机制，不要求所有事件人工审批。
- **身份不靠名字**：Subject、Participant、Perspective、ActorProfile、HCM 候选各司其职；只对实际缺失部分补类型／字段，不创建一组新 Store。
- **事实不会因忘记而消失**：已提交的债务、关系和位置按所属领域变化；NPC 忘记、来源不可读或投影缺资料，只影响其认知／回答。
- **有界自主性**：离屏演化由游戏时间／事件触发；不默认用户离线后常驻模型，不让每个命名 NPC 自动成为 Agent。
- **历史与权限并用**：修订决定已提交范围，GameTick 决定世界有效时间，个人观察决定何时获知；没有游戏时钟则仅提供修订顺序，不伪造 Tick。
- **原生硬切**：不做 ST 旧数据／旧模式兼容双写；替换实际旧入口并保留其中有效业务，不按目录名批量删除。

## 与提示词／前端企划衔接

前案先完成自身功能与统一组件，不等待本任务。世界重构恢复后复用其编辑器、Inspector、列表／Sheet、Source 视图与 Compiler 接口；仅扩展世界模块所需的数据和操作。Effective World 是事实／受众读投影，Prompt Effective 是编译结果，二者不能互相代替。具体 JSON、ID 命名和接口整合由执行者依据原实现决定，不为普通工程选择再开多轮讨论。

## 按功能阅读

| 模块 | 用途 |
| --- | --- |
| [runtime-emergence.md](runtime-emergence.md) | 新对象与持续后果即时接纳 |
| [entity-identity-authority.md](entity-identity-authority.md)／[subject-instantiation.md](subject-instantiation.md)／[subject-contracts-e0.md](subject-contracts-e0.md) | 主体身份、实例化、参与者／视角／模板 |
| [npc-autonomy.md](npc-autonomy.md) | 目标、日程、分层自主性与离屏结算 |
| [npc-social-cognition.md](npc-social-cognition.md)／[npc-memory-information-flow.md](npc-memory-information-flow.md)／[npc-memory-continuity.md](npc-memory-continuity.md) | 个人认知、消息传播、记忆与人格连续性 |
| [event-temporality-branch.md](event-temporality-branch.md)／[effective-world-view.md](effective-world-view.md) | 正式效果、时间、分支、当前事实与资料适用性 |
| [e0-preflight-execution.md](e0-preflight-execution.md) | 当前功能实施分工、具体落点与未接接口；沿用旧路径 |
| [e0-minimal-contract-cutover.md](e0-minimal-contract-cutover.md)／[e0-domain-world-context-contract.md](e0-domain-world-context-contract.md) | 最小逻辑类型与 Domain→Context 接线 |
| [e0-gate0-physical-contracts.md](e0-gate0-physical-contracts.md)／[e0-gate0-integration-workpackages.md](e0-gate0-integration-workpackages.md) | 存储与 WP-A～F 的职责 |
| [e0-consumer-cutover.md](e0-consumer-cutover.md)／[e0-integration-readiness.md](e0-integration-readiness.md) | 调用方替换与跨任务接口 |
| [e0-final-closure.md](e0-final-closure.md)／[e0-handoff-evidence-review.md](e0-handoff-evidence-review.md)／[e0-final-implementation-handoff.md](e0-final-implementation-handoff.md) | 遗留编号的功能对应、P2 选择及恢复说明 |
| [design.md](design.md)／[research.md](research.md) | 当前架构说明与研究背景 |

实际未实现的功能如实列明；权限、预算、提交一致性与存读档属于产品行为，随对应功能落实。
