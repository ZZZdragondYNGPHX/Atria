# ARCH-DWE-01 · 实现分工与接口依赖

沿用旧文件名，正文描述当前功能实施。[唯一入口](index.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**；本次文档整理不启动产品实现。

## 一条完整功能链

玩家与新认识的旅馆老板阿洛赊账：

1. 原游戏／Authority 解析合法行动，读取本分支修订、玩家授权、余额和作品规则；普通对白、传闻或意图不自动变成债务。
2. 本次产生持续后果而阿洛尚未登记时，原 Session Domain 同时接纳其稳定 Subject，提交债务、参与者与事件来源，返回原 Revision/Receipt。
3. 已提交债务由原经济／关系领域持有；阿洛的记忆、意图、Timeline、UI 和编排 Result 都引用该结果，不另记一份债务真相。
4. Narrator 按确认结果发表；若文本与世界效果分两次发布，保留“效果已提交、文本待发表”，不重做交易来补正文。结果未知时读取原 Receipt。
5. 游戏时间推进后，原 Simulation 处理期限与有限 NPC 反应；催账必须真的经过允许的通信／行动渠道，不能仅因生成一段文字就算送达。
6. 玩家回来时，Play/Context 读取本分支当前债务与阿洛合法所知；回到借款前存档则没有这笔债务，旧任务不能写入新分支。

## WP-A：主体接纳与正式效果

- **结果**：新人物／地点／物品发生持续后果时即时获得稳定身份；支持开局已声明对象及 Worldless／多 World。
- **落点**：`session-core.js`、`session-snapshot.js`、`authority-transaction.js`、原 World reducer 与 `repositories/session-repo.js`。
- **实现**：P2 优先，只保存 identity/origin/scope/admission；加入原受保护状态及 Typed publication。Generic Patch、插件、模型正文都不能直接写该区域。业务值继续归原 Domain，合法同次变化使用原 Revision/Receipt。
- **需落实的接口**：开局定义到 Subject 的映射、运行时 admission、参与者引用、原 World reducer／Authority Turn／Narrator 分次发表时的结果衔接。

## WP-B：事实历史、存档与分支

- **结果**：可查当前与历史事实，存读档带回同一主体及当时状态。
- **落点**：原 SessionRepo/SavePoint/`save-system.js`、`session-maintenance.js`、Domain Event/History、`session-observation.js`。
- **实现**：优先引用既有事件和历史；仅补无法推导的有效期／终止／更正关联。先读取指定 Revision，再在有 Clock 时筛 GameTick，并按查询者权限返回。没有 Clock 只用修订顺序；不可达历史返回明确缺失，不猜测。
- **需落实的接口**：事实 Owner 与键、有效区间规则、纠错与真正 Retcon 的区别、受限历史读取、P2 stateHeads 在保存／恢复／GC 中的引用闭包。跨多个时钟的 World 不默认共享 Tick，调用沿所属领域的规范时间或明确不支持。

## WP-C：动态 NPC、视角与记忆

- **结果**：非 Manifest 预设 NPC 可成为真实参与者，在自身合法见闻下记忆、回应和行动。
- **落点**：原 Information/Cognition/ToM/HCM、Goal/Lifetime、Simulation/Task/V3。
- **实现**：Subject 存在不自动授予 Perspective 或模型调用；原 Host 绑定合法来源／用途，表达模板可选。事实、单方好感、共同关系、目标与承诺分开。消息先实际送达，再形成合法观察／记忆。规则与事件优先，少量关键角色按需模型提案，正式行动仍由原 Domain 提交。
- **需落实的接口**：动态 Perspective、Subject 到原领域 LocalRef、来源与可见别名、接收方记忆更新、有限调度与过期任务处置。私人遗忘不消除客观债务，HCM 候选同名也不自动合并世界主体。

## WP-D：有效世界、Knowledge 与 Prompt

- **结果**：当前帝位变更后旧设定不再作为现任事实；旧史料、传闻和 NPC 误解仍可被正确引用。
- **落点**：原 `knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`、V3 ContextPort、PromptCompiler/SemanticBlocks。
- **实现**：原 Host 只读投影区分 law/initial/current/historical/claim/belief；授权与有效性筛选先于召回／预算。绑定的可变声明按正式来源失效；未绑定正文保留为背景／来源说法，不每轮调用模型扫描全世界。已提交事实持续性按领域规则，不能因当前 Context 没召回而判定消失。
- **需落实的接口**：合法 EffectiveWorldRead、Source Claim 与 Subject/Fact 的可选关联、用途／有效期元数据、必要事实的 Context 接入。继承提示词前案的单一顺序／Anchor，不另立世界 Prompt 排序。

## WP-E：Timeline、Play 与媒体

- **结果**：动态人物可对话、显示合法名称和历史，并使用合适的语音／视觉表达。
- **落点**：`contracts.js`、`native-frontend-host.js`、`frontend/host-services.js`、`session-projection.js`、`play-product.js`、Speech/Visual/Illustration。
- **实现**：真正 Participant、作者 ActorProfile 与可见别名分开；Narrator 引述他人不等于该人正式发言。图片／声音绑定合法来源与分支，不根据外观推断秘密真身。玩家只读可展示的世界视图。
- **需落实的接口**：消息／参与者字段、展示投影、通用世界／历史 Host 读取、媒体表达绑定；只改语义受影响的 actorId 使用者。

## WP-F：Library／Studio 与旧入口替换

- **结果**：作者直接创作世界与资料，选择起点、绑定少量关键事实并预览；手机可完整编辑与查看。
- **落点**：原 World/Knowledge service、Library、World/Knowledge/EntryPoint editors、原 Package build，统一前端组件。
- **实现**：自由文本为普通入口，实体／关系／规则和状态绑定按需展开；可选 AI 仅提出标注建议。Studio 的起点预览与 Play 实际分支分开。WorldInfo、Actor-only 和旧注入调用随对应原生功能替换，保留有效检索／媒体／插件功能，不做旧模式双写。
- **需落实的接口**：作者定义、起点实例化、只读预览、引用与冻结、Play 档案／历史／来源展示；采用原前端列表、Sheet、Inspector 与错误反馈。

## 依赖与执行范围

WP-A→WP-B 提供主体与事实根；WP-C/WP-D 在此基础接 NPC 与合法上下文；WP-E 使用新的参与者／展示数据；WP-F 的作者编辑可并行，预览使用相应后端。只对具体依赖尚缺的功能说明未接项，正常字段命名与接线在原实现中解决。

先完成前案编排／提示词／统一前端的既定依赖，用户明确恢复世界任务后按授权范围推进。执行方式见[入口：实施时的连续推进](index.md#实施时的连续推进)。
