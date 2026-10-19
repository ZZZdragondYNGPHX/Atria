# ARCH-DWE-01 · 动态世界与知识架构

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [决策与实际进展](../../../records/architecture/world-evolution-consistency.md)。当前 **Draft / Paused**，已确认的 W1-B～W22-B 架构方向按下文落实；具体字段与函数沿原实现决定。

## 1. 世界、资料与个人所知

创作者定义可运行、可演化的世界；Knowledge 保存资料与说法；Play 中的合法事件改变当前分支。它们回答不同的问题：

| 内容 | 回答的问题 | 权威与生命周期 |
| --- | --- | --- |
| World Definition | 世界有哪些对象、规律、起点和开放细节？ | Library/Studio 的固定作者修订，发布时选定版本 |
| Knowledge Source / Claim | 哪份资料、哪个人曾经说过什么？ | 保留原文、出处与适用语境，允许矛盾来源并存 |
| Native State / Event / History | 此分支实际发生了什么，现在是什么状态？ | 原 Native Domain 经 Session/Branch/Revision 正式提交 |
| Perspective / Belief / Memory | 谁何时知道、相信或记住了什么？ | 原 Information/Cognition/HCM 按主体合法来源维护 |

资料的作者可信度、声明是否客观成立、何时有效、谁可以知道分别判断，不能压成一个 priority 或 canonical 开关。未知不等于不存在，来源记载不等于当前事实，预测不等于已经发生。

## 2. 自由创作与关键事实

采用 **World Model + Source Library、分层混合创作**。自由文本保持完整；只有影响长期演化或确定性玩法的实体、关系、事实和法则才按需绑定。普通作者可以直接写人物、地理、历史与文学正文；辅助 AI 提出标注建议，关键硬设定由作者确认。

同一句“莱恩是皇帝”可能是开局事实、某个历史时期的事实、过期年鉴的记载、某 NPC 的误信，或角色台词。它不能在所有用途下都被当作当前真相。关键词、Regex 与全文检索用于召回资料；概率、冷却和插入位置不能决定世界事实是否存在。

不将全部自由文本转成图谱，不每轮调用模型扫描整个世界，不因游戏推进改写 Library、Package 或角色卡原件。

## 3. 法则、留白与演化权限

| 语义 | 例子 | 演化方式 |
| --- | --- | --- |
| 硬法则 | 普通生命死亡不可自然复活 | 常规事件遵守；改变法则须有作者明确允许的特殊机制 |
| 制度与世界机制 | 帝位继承规则、宵禁 | 按作品声明的合法事件改变，不能一律当成物理恒定规律 |
| 起点事实 | 开局莱恩在位 | 只要求起点成立，可随后演化 |
| 隐藏 Canon | 某人早已是秘密继承人 | 原本已存在的真相；揭露时间与成立时间分开 |
| 开放细节 | 未指定旅馆老板是谁 | 在作品规则允许范围内自由补完 |
| 传闻、信念、预测 | 将领相信莱恩仍在位 | 保留主观性与出处，不直接改变共同世界 |

普通装饰性细节可直接用于叙事；新增人物、债务、承诺等产生持续后果时，经原 Domain 接纳并提交。君主死亡、战争等重大变化按既定游戏规则授权，不要求每件事都弹人工审批。真正改变世界法则或过去历史，沿作者允许的专门机制处理。

“魔法一直存在但无人知晓”属于发现；“此前没有魔法，今天改变了世界规律”属于法则变化。不能从文学夸饰、梦境、谎言或模型猜测自动提取硬约束。

## 4. 主体身份、实例与能力

采用 **Canonical Subject + 类型化引用与能力绑定**：

- **Subject** 是当前 Session 中需要持续追踪的世界对象。名称、别名、改名、死亡、迁居或更换表达模板都不改变其身份。
- **Definition/ActorProfile** 是固定作者来源或表达模板；同模板可用于不同人物，同一人物也可采用不同表达。跨 Session 实例不共享动态状态。
- **Participant** 表示正式事件或对话中的实际参与者；Narrator 引述某人不等于此人进行了原生发言。
- **Perspective** 表示原 Host 授予的合法个人视角、来源、用途和作用域；世界存在、可以表达、私人认知与有限行动能力分别接入。
- **领域 LocalRef/HCM Entity** 保留各自语义。证据中的候选人物、同名记录或相似外观不能自行创建、合并正式主体。

开局从已选 WorldRevision/EntryPoint 实例化必要对象，支持 Worldless 与多 World。运行中新人物在产生持续后果时即时接纳，不必等第二次登场；普通过场名词不强制永久登记。首次被认识、实际出生、正式登记和启用自主行为是不同事件。

具体关系见[主体身份](entity-identity-authority.md)、[实例化](subject-instantiation.md)与[类型契约](subject-contracts-e0.md)。

## 5. 最小持久化与正式效果

**P2 优先**：在同一 Native SessionRevision 的受保护 SessionState 中保存最小身份、类别、origin、scope 与 admission 来源。金钱、债务、位置、关系、生命周期等业务值继续归原 Domain，不复制成另一套 FactStore。仅在实际实现发现 P1 更简单且满足相同功能边界时提出替代，不并行两套写权。

Subject 接纳与本次持续效果沿原 Typed Native publication 发布，返回原 Revision/Domain Receipt；Generic Patch、插件或模型正文不能直接写受保护身份区。Save/Restore/GC 沿原 stateHeads 与修订引用闭包处理；WorldSelection 变化处理作用域关联，不重建身份或静默丢失来源。

原 World reducer、Authority Turn 和 Narrator 各有合法入口。能同次发布的变化共用原 Revision；分次发表时保留“效果已提交、文本待发表”的区别。断线导致结果未知时读取原 Receipt，不能重放交易来补正文。HCM 索引或叙事生成失败不撤销已提交世界事实。

V3 Plan/Run/Effect 负责提案、执行与观察原领域结果，Prompt 负责表达；二者均不取得世界写权。详见[Domain→Context](e0-domain-world-context-contract.md)与[主体持久化](e0-gate0-physical-contracts.md)。

## 6. 历史、有效时间与分支

事实变化优先复用原 Event/History，只补无法推导的有效区间、结束或更正引用：

1. **Revision** 决定截至哪个正式提交可读取什么。
2. **领域 GameTick** 决定所问游戏时刻哪个事实有效；没有 Clock 时只提供修订顺序，跨 World 不暗定共享时钟。
3. **个人观察时间** 决定谁何时获悉消息，不因 Host 知道就让角色提前知情。

后来发现“皇帝其实在 T10 已死”，可以在新 Revision 中追认有效时间，不能改写旧快照或声称所有人 T10 就知道。纠正错误记录、新的后续变化与真正 Retcon 分别处理；历史因保留策略不可达时返回缺失，不从当前值猜造。

SavePoint 锚定 Session/Branch/Revision。分叉前已登记主体沿共同祖先继承身份，分叉后状态、秘密、认知和任务分别演化；旧分支的异步结果不能写入新线。读投影和索引按修订、受众与作用域失效，不保留跨分支的 global latest。详见[事件、时间与分支](event-temporality-branch.md)。

## 7. NPC 自主性、私人记忆与社会信息

持久性与自主性分开。大多数日常行为由游戏时间、事件、日程和规则处理；相关人物按目标、资源、承诺和所知信息响应，少数重要人物才启用有预算的模型提案。离屏演化按游戏时间有限结算，不默认退出应用后常驻推理，也不让每个命名 NPC 都成为 Agent。

目标、意图、计划和已完成效果分开。NPC 不能替玩家决定行动；通信须有实际渠道，消息的发送、送达、听闻、相信和更正分别处理。一方好感不等于双方结盟，个人误信不改变客观关系。

记忆复用 Information/Cognition/HCM。经历与信念有合法来源，重要人格变化由经历支撑，日常细节允许淡化；遗忘、摘要丢失或检索未命中不会让债务、身份与已提交历史消失。真正失忆或虚假记忆植入沿作品允许的受控认知变化处理。

详见[NPC 行为](npc-autonomy.md)、[社会认知](npc-social-cognition.md)、[信息传播](npc-memory-information-flow.md)与[记忆连续性](npc-memory-continuity.md)。

## 8. 有效世界与 Context

原 Host 以固定作者资源、指定 Session/Branch/Revision、可用领域时间和合法受众形成只读 Effective World，区分 law/initial/current/historical/claim/belief。权限和适用性先限定来源，再进入已有 Knowledge/HCM/Context 的关联选择与预算，最后交给 PromptCompiler。

以帝位变化为例：当前视图采用已提交的新统治者；旧皇帝在旧年份仍是有效历史；旧年鉴继续作为文献引用；尚未收到消息的将领可以误信旧皇在位。上述用途互不替代，不能靠提高状态 rank 消除正文矛盾。

已绑定的可变声明按正式来源判断当前性，未绑定正文按背景或来源说法使用，不承诺自动理解全部自由文本。关键状态和未履行义务按领域规则持续，不因 Context 本轮未召回就消失。Prompt Effective 是编译结果，与世界事实的 Effective View 各有职责。详见[有效世界](effective-world-view.md)。

## 9. Library、Studio、Play 与媒体

- **Library**：直接编辑世界正文、人物、地点、组织、关系、法则与资料来源，按需展开关键属性和绑定。
- **Studio**：装配固定 World/Knowledge/Actor 与 EntryPoint，设置起点、开放细节、关键效果并预览受众视图；起点预览与 Play 实际分支明确区分。
- **Play**：展示玩家合法可知的人物、关系、事件、档案与历史；换存档即换对应修订，秘密真身映射不进入公开展示。
- **Speech/Visual**：使用实际参与者、可见别名与独立表达模板，媒体产物不能倒推真实身份或世界效果。
- **Inspector**：按权限解释来源、有效期、事实与信念差异；普通作者无需管理内部 ID。手机沿统一前端使用单工作区与按需 Sheet/抽屉。

复用前案编排、提示词与整体前端已完成的接口、组件和导航。旧 WorldInfo/Actor-only 入口随对应功能替换，保留有效检索、记忆、目标和媒体能力，不按目录名批量删除，不建立长期兼容双写。具体职责见[WP-A～F](e0-preflight-execution.md)，执行方式与当前状态见[唯一入口](index.md)。
