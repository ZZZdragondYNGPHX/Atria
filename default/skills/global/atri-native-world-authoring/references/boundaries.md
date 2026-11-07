# 世界信息与持续性

## 事实、认知与表达

Information source 可来自 application、world、timeline 或 history。按内容含义选择 `truth`、`belief`、`thread`、`open_loop`、`memory`、`narrative`，以及 `desire`、`intention`、`emotion`、`relationship`、`theory_of_mind`。认知语义连接相应的字段与来源结构，不是随手给一段文本加标签。

真实发生的事、人物相信的事与说出口的话可以不同。例如人物误以为同伴失约，这份 belief 可以引起失望；同伴实际上在路上仍是另一个 truth。保留这种差异，人物才有自己的判断和变化。`theory_of_mind` 记录对他人的推测，通过 `hypothesisPolicy` 连接可观察行为；它不是读取另一角色的内心。

为 Memory 声明需要的 `memoryPolicy`，为因果依据使用正式 Truth source 的 `causalBasis`。Rollup 保留来源、覆盖范围与时效信息，适合压缩上下文；未完成的 Open Loop 则表示还有事情悬着，不把它们混成一份万能记忆。

## 让视角服务故事

先选 audience，再选 source fields 与 exposure。`player` 视图用于 display；模型使用相应 narrator、actor 或 task 的 context 视图。Knowledge 和 Memory 是否加入各自声明。Inspector 是作者的 display 视图，不是角色额外知道的信息。

叙述可通过 `narration.contextViewId` 和 `disclosureViewId` 分开“叙述者能参考什么”与“这一刻适合呈现什么”。`limited` 模式绑定具体 Actor；`separate` / `custom` 使用各自明确的视图。隐藏信息可以影响场面的组织和人物反应，但不因此直接写进玩家读到的文字。

需要角色表达计划时，`narration.expression` 可选择 `inform`、`ask`、`reassure`、`decline` 或 `reflect`，引用同时存在于 context 与 display 的 source。意图帮助组织表达，具体台词仍应贴合人物、关系和当下情境。

固定人物使用 `actorId` 与 availability；大量动态人物可用 `subjectScopeId` 和 `subjectAvailability` 声明个人视角模板，由 Host 绑定具体 Subject。配合 `subjectPerspective` Task 时，人物只得到自己的 projection 和输入；Host 用来挑选待办事项的信息不自动成为人物所知。

## 内容与独立数据

| 需求 | 现有通路 | 设计重点 |
| --- | --- | --- |
| 扩展作品 | `content` 的 Base / Add-on / Community | 引用精确版本与贡献来源，维持依赖闭包；扩展不覆盖不可变原件 |
| 跨作品积累 | `continuity` 的 Player domains、views、transfers | Player 独立于 Session，恢复存档不回滚外部持有物 |
| 固定多人席位 | `shared` 的 seats、rules 与 Information views | seat 对应 Actor、scope 和明确可见字段；同一 Session Truth 提供不同视角 |
| 跨 Session 共享领域 | `shared.realm` | 使用 Realm 自身 revision、typed Command 和转移流程 |

涉及转移时，沿现有 prepare/resume/cancel 流程处理 reservation、receipt 与 ownership；publication 前后的取消含义不同。Session↔Player 与 Session↔Realm 是两条独立流程，没有直接 Player↔Realm 事务。需要设计撤回或恢复交互时，再具体解释当前阶段能做什么，无须给普通剧情附上一整套事务说明。

Shared 采用认证身份与 ACL epoch 管理席位授权，回合按 all-required submit-once 收集，由 Host commit/cancel 和生成 RNG。远端视图使用自己的授权 projection，不能借用 Private Play 的 conversation/composer。现有连接、refresh、presence 足以表达这套固定席位协作；公共发现或分布式 lobby 属于不同能力。

当前生涯模式 `runPolicy` 不与 Continuity 或 Shared 共用。作品同时提出这些玩法时，先澄清想保留的是哪种体验，再决定作品结构。
