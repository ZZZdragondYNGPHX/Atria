# Atria Native Heavy-Frontend Reference Package 企划书

> 状态：Discussion Draft v0.8  
> 分支：`package/native-heavy-frontend-reference`  
> 基线：`main@93991c7ccea30ce7499935bbb91592ae137086dd`  
> 资产目录：`packages/native-heavy-frontend-reference/`  
> 当前阶段：架构讨论，尚未进入正式资产实现。

## 1. 项目目标

创建一个 Atria Native 重度前端参考 Package，以真实复杂作品的标准压力测试并展示 Atria 当前 Native Experience、Runtime、Studio、Knowledge、Memory、Task、Lifecycle、Presentation 与 Package 能力。

该项目不是把某张 SillyTavern 角色卡“格式转换”成 Atria，也不保留 Tavern Helper、Regex HTML、MVU、任意远程 HTML/JS 等旧运行方式。参考样本只用于提取能力需求和产品体验，最终实现必须使用 Atria Native 权威体系重新建模。

最终资产应能够证明：

- Atria 可以承载“聊天 + 游戏应用”级的复杂作品，而不仅是普通聊天角色；
- Component / Hybrid / Full 只决定布局所有权，不决定功能等级；
- World、Session App、UI、Player Preference、Task、Knowledge、Memory、Timeline、Lifecycle 等拥有明确边界；
- 重度前端不依赖任意 HTML/JS 注入、Regex HTML 或裸状态 patch；
- 作者可以使用 Atria Studio / Project Agent / Authoring Skills 完成设计、审阅、验证、构建与安装；
- 保存、恢复、分支、重试和模型失败不会因为前端自建事实源而破坏状态一致性。

## 2. 第一基准样本

第一份 Capability Benchmark 为用户提供的 SillyTavern 高级重前端示例。

审计关注：

- 多模式模型任务；
- 开局配置；
- 世界与人物状态；
- 事件/镜头进度；
- 日程与昼夜循环；
- SMS / 社交网络 / 邮件；
- GAL / 场景演出；
- 道具与资源；
- 结构化模型返回；
- 剧情与整日压缩；
- 长期信息与记忆；
- 前端与模型、状态之间的协议。

不复制或重建样本中不适合作为本参考资产内容的部分。参考资产会使用独立、可公开审计的示例世界观和占位内容来验证相同的软件能力。

样本的远端前端源码当前未取得，因此不假设其内部 DOM/CSS/JS 细节；若后续获得可验证源码，再单独补充 UI 能力审计。

## 3. 当前 Atria 能力基线

以创建本分支时的 `main` 为准，已经存在并可供本 Package 使用的主要能力：

- Native Package / Project / Studio / Review / Build；
- Component Model v2；
- Component / Hybrid / Full Experience；
- Local UI State；
- Player Preference State；
- Form / Opening / Action v2 / Composer Host Action；
- Message Projection / Turn Envelope / Reply Variant；
- Native World State + typed Command / Event / Reducer；
- Session Application State / Scope；
- Package Model Task / Task Variant / structured output；
- `authority-first` / `narrative-outcome` Turn；
- Lifecycle / World Clock / Workflow / Automation / scheduled interaction；
- Activity Runtime；
- Knowledge / Prompt Program / Prompt Module / Generation Profile；
- Information / Perspective Projection；
- Memory；
- Player Continuity；
- Shared Session / Realm；
- Studio Preview / Scenario / Health；
- Native Authoring Skills；
- Project Agent API catalog。

本清单仅表示“当前平台存在”，不表示本资产会全部启用。资产设计遵循最小必要能力原则。

## 4. 不可违反的设计原则

### 4.1 一个事实只属于一个 Authority

不得为了前端方便再建立第二套 World、Session、Timeline、时间、存档或业务数据库。

### 4.2 UI 不是游戏事实源

Tab、页面选择、展开/收起、未提交表单等进入 Local UI State；跨设备玩家偏好进入 Player Preference；游戏事实进入对应 Native Authority。

### 4.3 模型输出不是裸 Patch

模型可以产生 narrative、结构化 Task result、声明过的 semantic outcome 或 presentation artifact。最终事实变化必须经过 typed Command / Event / Reducer / transaction contract。

### 4.4 Prompt 不重新承担整个应用后端

不再使用“一个巨大 World Info + Tag 路由”同时承担任务调度、业务状态、UI 通信、时间推进和存档逻辑。

### 4.5 不复活 Regex HTML 或任意远程执行

Package UI 使用 Native UI / Presentation / Scene。需要执行能力时，只能使用 Atria 明确划分的可信扩展边界，不能把远程页面重新包装进 Package。

### 4.6 Package 自描述，Host 掌握环境权力

Package 声明需要什么能力、Task、资产、状态和 View；Model Route、Connection、Secret、调度、取消、并发及 Host 设备能力由玩家/Host 控制。

### 4.7 先做参考资产，再用真实缺口反推平台

讨论阶段不为了“也许以后会用”继续扩建 Atria。只有在当前 Native contract 无法表达经过确认的资产需求时，才记录为平台缺口。

### 4.8 AI 剧情优先，模拟经营为辅助层

本参考资产的核心体验仍然是 AI 输出剧情与角色互动。宗教 / 教会模拟经营系统作为次级玩法与世界反馈层存在，用于提供资源、决策、成长、事件条件和长期目标，但不得挤占正文输出、强迫每轮展示经营报表，或把作品重心转成纯数值经营游戏。

## 5. 资产定位与已冻结底层方向

主 Experience 冻结为 **Hybrid — Chat-based Game Application**。

- 主 Timeline / Conversation 继续属于 Atria Host；
- Package 拥有 Dashboard、状态 HUD、开局流程、手机、日程、邮件、纯 Native 文本演出、宗教 / 教会经营等应用界面；
- Component 不作为主模式，但可用于消息内或聊天周边的结构化 UI；
- Full 不作为第一版主入口；只有后续确有独立应用主界面的需求时再评估，不以升级模式来换能力；
- 第一版按长期可扩展 Package 设计，但实现时优先做最小垂直切片，不为了展示平台能力一次性启用所有 Native 子系统。
- **v1 不引入背景、表情、CG、Audio 或其他外部媒体 Asset Pack。**
- **立绘延期到后续版本**；第一版不为了未来立绘提前建立媒体资源依赖或 Scene 资源管线。
- 第一版若保留 GAL / 演出感，只使用 Native UI、文字、结构化段落、角色名/说话者、布局与轻量 Host 呈现，不依赖外部图片或音频。

### 5.1 次级宗教 / 教会模拟经营

宗教 / 教会系统是本资产的长期游戏循环之一，但定位为**剧情驱动的经营点缀**。

它可以提供：

- 教会等级 / 声望 / 信徒 / 资金等长期资源；
- 建筑、设施、岗位、教令、项目等发展项；
- 日程和地区行动的条件与收益；
- NPC、新闻、邮件、事件的触发条件；
- 剧情选择带来的可见经营后果；
- 长期目标、阶段解锁与世界反馈。

它原则上不负责：

- 替代主 Timeline；
- 每回合强制生成大量经营文本；
- 让模型逐项计算确定性数值；
- 把所有剧情都降格为经营结算；
- 建立独立于 Native Authority 的第二套模拟数据库。

具体数据域与结算边界在后续状态切分 / Lifecycle 轮次继续冻结。

## 6. 讨论与更新规则

本 Package 在正式实现前进行若干轮架构讨论。

每轮流程：

1. 只聚焦一个明确主题；
2. 给出候选方案、边界、优缺点和推荐方向；
3. 用户确认或提出修订；
4. **只有用户明确认可本轮结论后**，才把冻结结果写入本企划书并提升 Discussion Draft 版本；
5. 更新完成后进入下一轮；
6. 未确认的设想只保留在对话中，不提前写成既定方案。

进入实现阶段前，再将已确认内容整理成 Implementation Baseline。

## 7. 拟议讨论顺序

1. **底层框架 / Authority & Runtime Skeleton — 已冻结**
2. **World / Session App / Event / UI / Preference 状态切分 — 当前**
3. **Model Task 与 Turn 编排 — 已冻结**
4. **Lifecycle / 时间 / 日程 / Morning-Night 工作流 — 已冻结**
5. **宗教 / 教会模拟经营的数据模型、结算与剧情耦合 — 已冻结**
6. **Knowledge / Prompt / Memory 分层 — 已冻结**
7. **Hybrid UI 信息架构 — 已冻结**
8. **Message Projection / 选项 / Conversation — 当前**
9. 纯 Native 文本演出 / GAL 表达（v1 无外部媒体资产；立绘延期）
10. SMS / 社交 / 邮件等二级应用
11. 存档、分支、恢复、压缩与长期游玩
12. Studio Authoring / Scenario / Health 验证策略
13. 最终能力矩阵与是否存在真实平台缺口

顺序可根据讨论结果调整。

## 8. Round 1 — 底层框架冻结方案

Round 1 已获得用户认可，以下作为后续设计基线。

### 8.1 产品本质

本 Package 定义为：

> **由 Native Authority 驱动的长线 Hybrid 游戏应用，LLM 是若干游戏服务之一，而不是整个游戏引擎。**

既不采用“一个超级 Prompt / 一次 JSON 返回承担全部后端”的模式，也不退化为“所有剧情写死、LLM 只润色”的传统游戏。

### 8.2 五层 Native Game Kernel

底层采用五层职责结构：

1. **Experience / UI**
   - Dashboard、Conversation、Phone、Schedule、GAL、Message UI 等；
   - 只负责交互与呈现，不成为游戏事实源。

2. **Gameplay Services**
   - typed Action / Command；
   - Event；
   - Activity；
   - Thread；
   - Item / Interaction 等游戏服务。

3. **Authorities + Lifecycle**
   - World、Session Application、Timeline、Player Preference 等权威；
   - Lifecycle、Clock、Workflow、Automation 作为运行阶段和调度骨架。

4. **Model Services**
   - Narrator、Planner、Social、World、Curator 等职责化模型服务；
   - 模型产生 narrative、proposal、structured result 或 semantic outcome，不直接拥有数据库。

5. **Presentation / Projection**
   - Narrative、Message Blocks、Scene、通知、诊断等展示结果；
   - 展示数据与 Prompt / Authority 明确分离。

### 8.3 日循环

本 Reference Package 冻结使用“日循环”作为一级游戏周期，以实际压力测试：

- Morning；
- Planning / Daytime；
- Evening；
- Night；
- Day Settlement；
- Advance Day；
- 下一日 Morning。

日循环只是**本资产的 Lifecycle Phase Graph**，不是 Atria 平台的通用硬编码。

Phase 表示世界运行阶段，而不是 UI 页面。玩家处于 Morning 时仍可打开人物、背包、教会、手机等其他界面。

### 8.4 Event Instance

“正在发生的剧情事件”冻结为 **Session Application 中的 Event Instance**，而不是直接塞入 World State。

职责关系：

- **World**：客观且需要存档 / 分支一致的事实；
- **Event Instance**：当前正在发生、可暂停、可推进、可完成的剧情事务；
- **Timeline**：已经真正呈现给玩家的主叙事。

Event Instance 至少需要表达参与者、地点、状态、当前进度、开始时间、上下文与结果引用。

### 8.5 Beat 而不是固定 Shot

不把基准样本的 5–6 Shot 机制硬编码成平台规则。

Event 内部使用更通用的 **Beat**：

- setup；
- escalation；
- choice；
- consequence；
- resolution；

具体 Event 可拥有不同数量的 Beat。Beat 后续可以映射 narrative、choice、activity、task、transition、terminal 等不同语义。

### 8.6 Specialized Model Services

不建立一个拥有全部事实和全部动作权限的万能 Game Director。

初步冻结五类职责：

- **Narrator**：正式剧情 / Event Beat；
- **Planner**：候选事件、日程与未来内容 proposal；
- **Social**：SMS / 社交 / 邮件等角色通信；
- **World**：新闻、环境和宏观世界反馈；

具体 Task / Variant 边界在 Round 3 冻结。长期记忆、剧情摘要与压缩不再由本 Package 自建 Curator Task，统一交给 Atria 现有 Memory 体系。

Planner 只生产 proposal；真正的合法性检查、状态提交和调度由 Native Authority / Lifecycle 完成。

### 8.7 Lifecycle 是真正的导演

旧样本的 STORY / PLAN / MORNING / NIGHT 等不再作为 World Info Tag Router。

底层调度原则冻结为：

> **Lifecycle + Authority 才是 Game Director；AI 不担任系统管理员。**

Lifecycle 决定阶段、触发与工作流；Authority 决定事实；Task 负责需要生成或解释的语义工作。

### 8.8 Timeline 边界

Timeline 只承载玩家真正经历的主叙事。

默认不把以下内容机械写入主 Timeline：

- Morning 新闻；
- 短信记录；
- 邮件；
- 排班；
- 道具掉落；
- 系统通知；
- 教会经营报表；
- 后台世界日志。

这些内容保存在各自的 Session App / World / projection 域。只有当它们真正触发或进入主剧情时，才通过 Event / Narrative 进入 Timeline。

### 8.9 核心操作流

底层操作链冻结为：

- UI-only → Local UI；
- 确定性游戏操作 → typed Command → Authority；
- Event 推进 → Event Instance → Task / Turn → validated outcome → Authority + Timeline / Projection；
- 生命周期推进 → Workflow / Clock → Task / App Command。

不允许 UI、模型返回值或展示层绕过 typed Authority 写入。

## 9. Round 2 — 状态切分冻结方案

Round 2 已获得用户认可，以下作为后续实现的数据边界。

### 9.1 七域模型

本资产采用七类明确分工的数据域：

1. **Package Data** — 作品版本定义的静态规则与目录；
2. **World State** — 已经成立的客观世界事实；
3. **Session Application State** — 当前 Session / Branch 中运行的业务对象与过程；
4. **Lifecycle State** — 时间、阶段、scope、workflow、automation 等运行骨架；
5. **Local UI State** — 未提交且不构成游戏事实的界面状态；
6. **Player Preference State** — 本作品独有、跨界面/会话保留的玩家操作偏好；
7. **Projection** — 从上述权威派生出的展示结果，不成为第二事实源。

判断原则：

- **Package Data 存定义**；
- **Session Application 存过程**；
- **World 存已经结算成立的事实**；
- **Lifecycle 存运行阶段与时间推进**；
- **UI / Preference 只影响交互体验**；
- **Projection 只负责显示**。

### 9.2 Package Data

进入 Package Data 的典型内容：

- 区域定义与解锁规则；
- 角色静态身份 / archetype；
- 道具定义与确定性效果；
- 教会设施、职位、教令、项目定义；
- 等级、升级、收益、容量、倍率等经营规则；
- Event archetype / tag / condition 定义；
- 其他不会因为某一局游玩过程本身而变化的规则数据。

规则值不复制进每个 World 存档作为平行配置。Package 升级是否影响旧 Session 仍服从 exact Package / schema 版本边界。

### 9.3 World State

World 只保存已经成立、读档/分支必须精确恢复的客观事实，例如：

- 世界日期对应的客观进度锚点（真正的时间推进仍由 Lifecycle 驱动）；
- 已解锁区域与世界阶段；
- 教会资金、信徒、声望、等级；
- 已建成设施、已生效教令、永久经营进度；
- 人物关系、成长、技能、持有资源；
- 疲劳、情绪等确实被作品定义为世界中的真实人物状态；
- 已确认的地点 / 可用性状态（仅在它本身是事实时）；
- 已结算的任务、事件、经营后果。

不把未来计划、正在执行的事务或纯 UI 缓存复制到 World。

### 9.4 Session Application State

Session Application 保存当前运行中的业务对象，按 typed Domain 拆分，而不是建立一个万能大对象。

第一版预期 Domain：

- **Events** — 当前剧情 Event Instance；
- **Schedule** — 已确认但尚未完全结算的日程与行动安排；
- **Mail** — 邮件对象、附件状态、已读 / 已领取状态；
- **SMS / Communication Threads** — 私聊 / 群聊消息、未读与会话状态；
- **Social** — 动态、评论与当前社交内容；
- **Requests / Quests** — 当前委托、请求、待决事项；
- **Church Operations** — 今日岗位、活动、建设、赞助提案、访客、待结算经营事务；
- **Daily Records** — 当天生成的晨报、世界简报和必要运行记录。

原则：**World 存结果，Session App 存过程。**

### 9.5 教会 / 宗教经营的状态切分

教会经营正式采用四层分工：

#### Package Data — 规则

- 设施 / 升级定义；
- 教令树；
- 岗位；
- 地区经营修正；
- 收益公式与阈值；
- 项目 / 活动模板。

#### Session Application — 当前经营过程

- 今日排班；
- 正在进行的宣传 / 建设 / 项目；
- 赞助提案；
- 访客；
- pending decisions；
- 当日 settlement candidate。

#### World — 已结算长期事实

- money；
- followers；
- reputation；
- church level；
- facilities；
- decrees；
- unlocked areas；
- long-term progress。

#### Projection — 展示

如“预计今日收入”“预计新增信徒”“某角色正在工作”等可以由 World + Schedule + Lifecycle 派生时，只计算并显示，不额外持久化。

### 9.6 经营与 AI 剧情的关系

经营系统优先采用确定性规则，不因普通排班、收益计算、资源扣除而调用模型。

典型链路：

`UI Action → typed Command → Session App / World → deterministic validation / settlement`

只有重要经营节点达到剧情价值时，才进入：

`经营条件成立 → Event Proposal → Event Instance → Narrator → 主剧情`

因此经营系统负责**制造剧情条件与长期反馈**，AI 负责**演出真正值得阅读的故事**。普通经营报表不进入主 Timeline，也不占用正文生成额度。

### 9.7 人物状态边界

冻结原则：

- 疲劳、情绪、关系、成长、技能、真正所在地等，只要作品定义为客观人物事实，进入 World；
- 今日排班、当前工作任务、正在进行的 Event、尚未结算的行动进入 Session App；
- 可以可靠派生的状态不重复保存。

### 9.8 Event Instance schema 原则

Event Instance 属于 Session Application。

第一版至少表达：

- `id`；
- `kind`；
- `origin`；
- `participants`；
- `location`；
- `status`；
- `premise`；
- `goal`；
- `currentBeat`；
- `resolvedBeats`；
- `startedAt`；
- `outcomeReceiptRefs`；
- `narrativeRefs`。

不预先生成整场 Event 的完整剧情剧本。

`premise` 说明事件为什么发生，`goal` 说明当前事件需要解决什么；Narrator 只面对当前 Beat 和有效上下文即时生成剧情，避免被早先的模型计划强行拖回固定线路。

### 9.9 Beat 是运行状态，不是预写正文

Beat 负责说明“这一轮要解决什么”，不提前决定“这一轮具体要写什么”。

通用语义可以包括：

- narrative；
- choice；
- activity；
- task；
- transition；
- terminal。

Event 可拥有不同数量 Beat，不硬编码 5–6 Shot。

### 9.10 Schedule

日程属于 Session Application。

Planner 可以产生 Schedule Proposal，但在写入前必须经过 deterministic validation，例如：

- 人物是否可用；
- 区域是否解锁；
- 时间是否冲突；
- 是否已被 Event 占用；
- 行动容量是否允许。

通过后才成为已确认 Schedule；真正发生并结算的结果再进入 World。

### 9.11 通信对象

邮件、SMS、社交动态属于 Session Application，而不是主 Timeline 或 World。

- 邮件正文存在 Mail Domain；
- SMS / 群聊存在 Communication Thread；
- Social Post / Reply 存在 Social Domain；
- 附件中的资金 / 道具只有在用户执行领取、接受、交易等 typed Command 后才修改 World。

文本中声称“到账”不能代替 Authority commit。

### 9.12 晨报 / 新闻

本局运行中生成的晨报与新闻属于 Daily Records / Session Application，不是作者 Knowledge。

若新闻反映真实长期世界变化，则必须存在对应 World 事实 / Event；新闻只是其可读表达。

### 9.13 Local UI State

Local UI State 必须满足：即使丢失，也不会改变游戏事实。

可包含：

- 当前 Tab；
- 当前选中的人物；
- 筛选 / 排序；
- 展开状态；
- 未提交表单；
- 草稿消息；
- 当前 Wizard 页。

不得包含资金、关系、Event outcome、任务完成等 Authority 字段。

### 9.14 Player Preference

第一版只声明本作品确实需要的少量偏好，例如：

- 选项点击后直接发送还是填入 Composer；
- 默认游戏面板；
- 是否显示经营提示；
- 本作品自己的通知偏好。

Host 已经负责的系统主题、文字大小、Reduce Motion、设备音量等不在 Package 内重复实现。

### 9.15 Projection

所有可由现有 Authority / Lifecycle 可靠计算出来的显示值使用 Projection，不再持久化第二份。

例如：

- 教会等级标签；
- 预计收入；
- 角色工作状态；
- 距离阶段结束时间；
- Event 状态摘要。

### 9.16 v1 外部媒体资产边界

**第一版不使用任何背景、表情、CG、Audio 或其他外部媒体 Asset Pack。**

因此：

- 不建立媒体资源依赖；
- 不为了未来资源预埋一套平行 manifest；
- 不把远程 URL 当作 Package 资产；
- 不以 Scene / Asset 系统作为第一版完成条件；
- **立绘延期到后续版本**，届时再基于实际需要审查 Atria 当时的 Presentation / Asset contract。

第一版若需要 GAL / 演出表达，只使用 Native UI、文本、说话者、结构化段落、布局和现有 Host 可安全提供的轻量 presentation，不依赖图片和音频。

## 10. Round 3 — Model Task / Turn 编排冻结方案

Round 3 已获得用户认可，以下作为模型运行基线。

### 10.1 AI 剧情是绝对核心

本 Package 的模型预算和交互中心始终是主剧情。

- 主剧情是玩家最频繁、篇幅最大、信息量最大的模型调用；
- 经营、日程、通信、世界新闻等系统服务剧情，而不是与正文争夺生成带宽；
- 普通确定性经营动作不调用模型；
- 只有真正具有剧情价值的经营节点才转换成 Event 并进入 Narrator。

### 10.2 单一主 Narrator Turn Contract

主剧情只维护一条核心 Narrator Turn 主干，不复制 SillyTavern 样本的多个 MODE Story Router。

Narrator 可以根据当前任务使用不同语义 Variant，例如：

- free narrative；
- event beat；
- choice consequence；
- transition；
- text-GAL presentation；

但它们共享同一套人物理解、Knowledge、Memory、World / Event context、Timeline continuity 与输出边界。

不同展示方式不建立第二套故事引擎。

### 10.3 主剧情采用 `narrative-outcome`

自由剧情 Turn 冻结采用：

`Player Input → Narrator → Narrative → Semantic Interpreter → declared outcome proposal → typed Command / Reducer validation → Authority commit`

原因：

- 优先保留自由剧情与角色临场反应；
- 不要求玩家自由输入先被强制翻译成确定性 Command 才能叙述；
- 状态变化仍然必须经过受限语义与 typed Authority。

Semantic Interpreter 绝不能把正文转换成任意 JSON Patch，只能提出 Package 预先声明的有限语义 outcome，例如关系变化、Event 推进、位置变化、时间推进或经营剧情影响。真正数值和合法性由 Runtime 决定。

### 10.4 确定性操作走 Authority-first / direct Command

确定性 UI 与经营操作不经过 Narrator，例如：

`UI → typed Command → validation → World / Session App commit`

适用于：

- 设施升级；
- 排班；
- 接受 / 拒绝明确经营操作；
- 领取附件；
- 确定性购买 / 消耗；
- 其他规则已知的状态变化。

若某次确定性操作触发重要 milestone：

`Command commit → Event trigger → Event Instance → Narrator`

这样经营系统制造剧情，但不替代剧情。

### 10.5 AI 决定语义，Runtime 决定数字

Narrator 不承担数据库 stored procedure 职责。

不再要求 Narrator直接返回：

- money delta；
- 精确 time_pass；
- relationship 数值；
- Event index；
- 经营结算数字；
- 人物属性数值；
- World patch。

Narrator负责“发生了什么”；Interpreter / Rule / Reducer 负责“这意味着什么”；Runtime 负责“最终数字是多少”。

### 10.6 模型服务缩减为四类

本 Package 第一版只保留四类模型服务：

1. **Narrator**
   - 主剧情；
   - Event Beat；
   - 玩家自由输入；
   - choice consequence；
   - text-GAL 的同一 Narrative 内容。

2. **Planner**
   - Event proposal；
   - Schedule proposal；
   - 候选未来内容；
   - 不拥有最终事实写权限。

3. **Social**
   - SMS reply；
   - social reply；
   - mail reply / compose；
   - spontaneous communication；
   - 统一为一个职责 Task，通过 Variant 区分具体渠道。

4. **World**
   - morning report；
   - news；
   - rumor；
   - advertisement；
   - public notice；
   - world flavor。

**不创建 Curator Task。**

Atria 已有 Memory 系统，本 Package 不再自建 Story Compression / Day Compression / 长期 memory 生成链，也不维护第二套摘要数据库。

### 10.7 Planner 只生成 Proposal

Planner 是内容 brainstormer，不是 Game Director。

它可以建议：

- 某角色去某地区；
- 某个赞助商出现；
- 某个 Event 值得发生；
- 某个既有 hook 应推进。

Runtime 必须再根据 World、Schedule、Event cooldown、人物可用性、教会等级、地区状态和近期剧情进行确定性检查。

只有通过验证的 Proposal 才能写入 Schedule / Event Queue / Session App。

Planner 不直接写 World，不直接控制 Timeline。

### 10.8 Planner 低频调用

Planner 不随每个剧情 Turn 运行。

候选触发点包括：

- Morning；
- Event Queue 缺少可用内容；
- 长期目标达成；
- 新地区 / 新阶段解锁；
- 当前剧情确实需要新的未来内容。

如果已有 Event、pending request、有效 Schedule 或未解决 hook，应优先延续已有内容，避免每天无条件制造大量新剧情。

### 10.9 Social：一个 Task + 多 Variant

Social Task 统一承载不同通信形式。

它只读取必要上下文：

- 当前人物；
- relationship；
- 当前时间；
- Schedule；
- 当前 Event；
- 对应 Thread history；
- 必要的 Memory / relevant context。

不默认读取整个主 Timeline。

生成结果先作为 Message Proposal，经 schema validation 和 typed append 后进入 Session Application，不能由模型直接写通信数据库。

### 10.10 World Task

World Task 负责让宏观世界具有动态感，例如新闻、晨报、传闻、广告和公共通知。

原则：

- 纯氛围内容可以只进入 Daily Records；
- 如果报道声称某个长期世界事实已经改变，必须先存在对应 World fact / Event；
- 新闻是 Presentation，不是 World authority。

### 10.11 Memory 完全复用 Atria

本 Package 不实现：

- Story Compression Task；
- Day Compression Task；
- Curator；
- 自建长期 Memory Store；
- Prompt 内手工维护的平行长期摘要权威。

Atria Memory 直接消费已经提交的主 Timeline、Event / World / Session 事实及其允许的上下文。Package 只负责提供干净、明确且经过 Authority commit 的事实来源。

如后续真实实现发现 Atria Memory 在该重型资产上存在具体缺口，再单独记录平台缺口，不提前复制旧卡的压缩方案。

### 10.12 Narrator Context 必须限流

Narrator 每次只获得与当前剧情相关的上下文，例如：

- Current Beat；
- Event premise / goal；
- participants；
- relevant character state；
- current location；
- relevant World facts；
- relevant church facts；
- recent Timeline；
- relevant Knowledge；
- relevant Memory；
- Player input。

不能因为数据存在就把完整 World JSON、全部经营规则、所有短信、所有日程和所有 Knowledge 塞入 Prompt。

**数据存在 ≠ Narrator 可以看到。**

### 10.13 教会经营进入 Narrator 的方式

普通经营数字不进入正文。

只有与当前 Event / 剧情直接相关的经营事实才进入 Narrator Context，例如：

- 资金危机；
- 某个具体赞助；
- 教会等级导致的新身份；
- 某设施首次开放；
- 某经营决定造成的人物冲突。

经营规则全集和无关报表不进入 Prompt。

### 10.14 Text GAL 不是第二个模型

v1 不建立独立 GAL Task。

同一 Narrator Narrative 可以由不同 Presentation 呈现：

- 普通长文本；
- 角色名 + 台词式文本演出；
- 结构化 dialogue / narration block。

未来增加立绘时，也只扩展 Presentation / Actor visual mapping，不重新建立第二套 GAL 剧情模型。

### 10.15 主剧情结构化输出保持极小

Narrator 输出只保留真正属于叙事层的结构：

- narrative；
- 必要 presentation blocks；
- 有限 semantic cues（若当前 Turn contract 确实需要）。

World / Session App / Lifecycle 的最终字段由 Interpreter、Command、Reducer 与 Runtime 产生，不让 Narrator一边写小说一边维护游戏数据库。

## 11. Round 4 — Lifecycle / 时间 / 日程 / Morning-Night 工作流冻结方案

Round 4 已获得用户认可，以下作为时间与日程运行基线。

### 11.1 连续 Game Clock

本资产使用连续游戏时钟，而不是聊天回合计时。

底层时间应可以投影为：

- day；
- hour；
- minute；
- dayPart。

`morning / daytime / evening / night` 只是由 Game Clock 派生出的时间标签，用于 UI、Event eligibility、Schedule 和 Context，不作为互斥游戏模式。

### 11.2 每日 Lifecycle 只有少量真正 Phase

一天的 Lifecycle 主干冻结为：

`DAY OPEN → ACTIVE DAY → DAY SETTLEMENT → NEXT DAY → DAY OPEN`

#### DAY OPEN

每天只执行一次：

- 初始化当天业务；
- 检查跨日 Schedule / due interaction；
- 启动需要的 Morning Report / Planner 等辅助任务；
- 准备当天经营与通信状态。

DAY OPEN 完成后立即进入 ACTIVE DAY，不要求辅助模型任务全部结束后才允许游玩。

#### ACTIVE DAY

绝大多数玩家操作和剧情都发生在 ACTIVE DAY，包括：

- 主剧情；
- Event；
- 教会经营；
- 日程；
- 手机；
- 邮件；
- Social；
- 其他 UI。

上午、下午、晚上和深夜都仍然可以处于 ACTIVE DAY。

#### DAY SETTLEMENT

负责：

- 当日经营结算；
- Schedule 结算；
- Daily business state 清理；
- 跨日资源变化；
- 到期流程；
- 下一日初始化所需事实。

它不负责自动生成长篇“夜间总结”，也不应机械把结算报表插入主 Timeline。

### 11.3 Morning / Night 是时间条件，不是模式

不保留 `MODE_MORNING` / `MODE_NIGHT` 这类 Router。

Morning / Night 只影响：

- Event eligibility；
- 日程可用性；
- 通信回复逻辑；
- UI / Projection；
- 特定 Trigger。

夜间不存在强制“结束夜晚”步骤。

### 11.4 时间不按每条消息固定推进

禁止“每回复固定 +N 分钟”的机械规则。

时间推进来源分为：

1. **确定性 Action**
   - 已知 duration 的活动 / 操作；
   - 直接由规则推进。

2. **Event / Activity duration**
   - Event 或 Activity 具有声明式时间成本；
   - 由 Runtime 推进。

3. **自由剧情中的语义时间**
   - Narrator / Interpreter 只提出粗粒度语义，例如 `none / minor / normal / major / extended`；
   - Runtime 决定实际 tick / minute 数值。

4. **玩家明确时间指令**
   - 例如“等三小时”“明早再见”；
   - 解析为受控 time skip / clock advance，并执行冲突检查。

### 11.5 AI 判断时间语义，Runtime 决定精确数字

Narrator 不返回假精确的 `time_pass = 117` 等字段。

AI 判断的是“没有明显推进 / 片刻 / 一段时间 / 很久”等语义量级；最终分钟数由 Runtime、Event、Action 或 Package rule 决定。

### 11.6 Schedule 绑定 Game Clock

Schedule 使用真实游戏时间，不使用“第几个聊天回合”。

已确认 Schedule 写入 Session Application 后，与 Game Clock 协同驱动：

- 行动开始；
- 到期 interaction；
- NPC 工作；
- SMS / Mail delivery；
- Event trigger；
- 教会经营事务。

### 11.7 Schedule 冲突策略

Schedule 至少需要表达三类语义：

- **hard** — 错过就产生明确后果或 missed 状态；
- **soft** — 可以延迟执行；
- **background** — 可在玩家不在场时后台完成。

具体字段名与 schema 在实现阶段以当前 Atria Lifecycle / Session App contract 为准，不提前发明平台字段。

### 11.8 Clock advance 必须处理跨越的 due items

当时间从 A 跳到 B 时，Runtime 必须检查区间内到期的 Schedule / Interaction，不能简单把时钟改到 B 后吞掉中间事务。

到期项根据自身策略可以：

- interrupt；
- defer；
- miss；
- convert / promote to Event；
- background settle。

### 11.9 NPC 普通排班后台结算

NPC 日常工作默认使用 deterministic settlement，不调用 Narrator。

只有以下情况才值得提升为 Event：

- 重大成功 / 失败；
- 重要人物出现；
- 人物关系冲突；
- 首次 milestone；
- 关键长期目标变化；
- 玩家需要介入的情况。

经营日程负责制造剧情机会，但不能把每项排班都变成正文。

### 11.10 Event 与 Day Lifecycle 正交

Event 可以跨时段、跨日、暂停和恢复。

Event 的生命周期不被日界线强制关闭。

例如：

- Day 3 晚间开始；
- 跨过 midnight；
- Day 4 仍继续同一 Event。

日结与 Event 是两条正交轴。

### 11.11 跨日不得机械打断主剧情

如果重要 Event 在跨日时仍 active，DAY SETTLEMENT / DAY OPEN 可以完成其必要 Authority 处理，但默认只更新 Dashboard / Daily Records，不在主正文中插入经营报表。

只有跨日结算本身产生真正影响当前剧情的重要事实，才创建/触发 Event。

### 11.12 Morning Report 不阻塞 Narrator

DAY OPEN 可触发 Morning Report / World Task，但主剧情不等待其完成。

生成成功后将结果写入对应 Daily Record / Session App；玩家可以随后查看。

同样原则适用于其他辅助 Task。

### 11.13 Social 延迟依赖 Game Clock

AI 可以提出“立即 / 稍后 / 明显延迟”等回复语义；Runtime 决定合法投递时间，并由 Clock / scheduled interaction 实际投递。

AI 不直接控制 wall clock，也不自行 sleep / timer。

### 11.14 玩家可主动 Skip Time

第一版允许设计受控的时间跳过操作，例如：

- 等待一段时间；
- 等到下一 Schedule；
- 休息到晚上；
- 休息到明早。

Skip 前必须检查：

- 当前 Event 是否允许；
- 区间内 hard Schedule；
- due interaction；
- 必须处理的经营 /剧情节点。

## 12. Round 5 — 宗教 / 教会模拟经营冻结方案

Round 5 已获得用户认可，以下作为经营层设计基线。

### 12.1 定位：剧情驱动的轻量经营层

教会系统不是第二主游戏，也不是复杂模拟器。

其核心职责：

- 提供长期目标；
- 提供资源压力与成长反馈；
- 提供角色岗位与项目安排；
- 提供地区 / 设施 / 教令的长期选择；
- 制造 Opportunity 与 Event 条件；
- 把玩家长期经营选择反馈到 AI 剧情。

它不负责：

- 替代主 Timeline；
- 每回合输出经营正文；
- 让玩家持续维护大量 KPI；
- 让 LLM 决定确定性数值；
- 通过经营失败轻易终止整个游戏。

### 12.2 核心长期指标

v1 只保留四个核心教会指标：

- `money`；
- `followers`；
- `reputation`；
- `level`。

前三者为可变资源，`level` 为长期发展阶段。

不默认增加 appeal、faith power、influence、morale 等额外核心资源；可由现有数据派生的显示指标使用 Projection。

### 12.3 Followers v1 只保存总量

第一版 `followers` 只保存总体规模，不按性别、职业、年龄、地区、阶层等拆分群体。

真正重要的单个信徒应成为 NPC / Event participant，而不是信徒统计表中的一行。

若后续真实剧情需要地区势力或受众差异，再单独讨论新的有限结构，不提前做复杂分群。

### 12.4 Church Level 不自动升级

达到数值阈值只意味着“获得升级资格”，不直接自动改变 `church.level`。

升级可以要求：

- followers；
- reputation；
- facilities；
- 关键剧情 milestone；
- 其他明确前置条件。

达到资格后产生 Promotion Available，玩家确认并完成必要剧情 / 操作后才正式升级。

这样 Church Level 的关键成长节点可以自然成为重要 Event。

### 12.5 Facilities

设施是轻量长期系统，主要负责：

1. **解锁**
   - 新功能；
   - 新岗位；
   - 新地区 / 活动；
   - 新 Event 条件；
   - 新人物容量 / 使用场景。

2. **有限 modifier**
   - 收益；
   - 容量；
   - Schedule；
   - Project 效率；
   - Opportunity eligibility。

不实现水电、卫生、耐久、清洁度等无明确剧情价值的细粒度模拟。

### 12.6 Decree 是 v1 核心经营功能

教令正式进入 v1 核心系统。

教令不是单纯数值 Buff，而是长期方向选择。

一个 Decree 可以同时影响：

- deterministic modifier；
- Event eligibility；
- Opportunity；
- 相关 Narrator Context；
- 社会反馈 / reputation 风险；
- 后续可选经营路线。

Narrator 只看到与当前剧情相关的已生效教令，不把整棵 Decree Tree 注入 Prompt。

### 12.7 Position 与 Assignment 分离

#### Position

长期人物身份 / 职位，属于 World State，例如：

- 教主；
- 财务负责人；
- 宣传负责人；
- 后勤负责人。

用于：

- 身份；
- 权限；
- modifier；
- Event eligibility；
- 角色职责。

#### Assignment

当天具体工作，属于 Session App Schedule，例如：

- 10:00–14:00 在商业区宣传；
- 下午处理财务；
- 当晚接待访客。

长期岗位不等于当天必须执行对应工作。

### 12.8 Projects

Project 是经营层的主要中型玩法对象，属于 Session App / Church Operations。

典型类型：

- 宣传活动；
- 募资计划；
- 庆典；
- 设施扩建；
- 地区开拓；
- 合作企划。

Project 可以跨日，并至少表达：

- status；
- duration / start / due；
- assigned actors；
- cost；
- requirements；
- progress / milestone。

普通推进确定性处理；重要 milestone 可以触发 Event。

### 12.9 Opportunity 统一业务入口

Sponsor / Visitor / Request / Cooperation / Special Offer / Problem 等统一抽象为 Opportunity。

Opportunity 首先是 Session App 业务对象。

根据重要度分两条路径：

- **普通 Opportunity**
  - UI 查看；
  - 接受 / 拒绝；
  - typed Command；
  - deterministic result。

- **剧情级 Opportunity**
  - convert / promote to Event；
  - 进入 Narrator 主剧情。

这样不会让每一封赞助请求都强制生成大段正文。

### 12.10 即时 + 日结混合结算

#### 即时结算

适用于明确即时交易：

- purchase；
- facility upgrade；
- pay cost；
- collect sponsor；
- consume item；
- 其他确定性即时操作。

#### Day Settlement

适用于后台经营：

- 日常宣传；
- background assignment；
- 常规经营收益；
- 跨日 Project 推进；
- NPC 不在玩家面前发生的普通工作。

避免每个小时或每个 Schedule 项都频繁跳小额资源变化。

### 12.11 普通经营数值 deterministic

经营收益、花费和资源变化由规则系统计算。

可以使用：

- Actor 能力；
-地区 modifier；
- Facility；
- Decree；
- Position；
- Project；
- 其他 Package Data rule。

模型不能决定精确 money/followers/reputation 数值。

AI 可以决定发生了什么有剧情价值的情况；Runtime 决定可提交的精确数值。

### 12.12 软失败优先

因为经营只是次级玩法，v1 默认采用可恢复的软失败：

- 收益下降；
- Opportunity 消失；
- Project 延期；
- reputation 小幅降低；
- Actor 疲劳；
- 产生麻烦 Event。

不因普通经营运气或数值不足轻易造成：

- Game Over；
- 教会永久倒闭；
- 核心人物永久离队；
- 不可逆主线终止。

重大不可逆失败必须由明确的重要剧情节点与玩家选择产生。

### 12.13 经营系统的最高设计指标

评估一个经营机制是否值得存在时，优先问：

> 它能否给 AI 剧情提供新的、长期有意义的条件？

高价值机制示例：

- Facility → 解锁空间 / Event；
- Decree → 改变长期剧情方向；
- Money → 制造取舍；
- Followers → 反馈组织规模；
- Reputation → 改变社会反馈；
- Project → 制造长期事件节点。

如果一个数值只用于叠加小幅百分比，但几乎不影响剧情，则优先删除。

### 12.14 教会 Dashboard 保持克制

教会主界面只突出少量高价值信息：

- Church Level；
- Money；
- Followers；
- Reputation；
- Today’s Assignments；
- Active Projects；
- Pending Opportunities。

Facilities、Decrees 等进入二级页面。

Play 的视觉与交互中心仍然是当前故事、人物和 Event，而不是财务 Dashboard。

## 13. Round 6 — Knowledge / Prompt / Memory 分层冻结方案

Round 6 已获得用户认可，以下作为上下文与提示词架构基线。

### 13.1 六来源 Context

任一模型调用的上下文明确区分六种来源：

1. **Prompt Program / Modules** — 模型应该怎样完成当前工作；
2. **Knowledge** — 作者预先定义、世界原本是什么；
3. **Live Authority Projection** — 当前世界 / Session 现在客观是什么；
4. **Memory** — 游玩过程中形成、值得长期记住的经历；
5. **Recent Timeline** — 最近实际发生的主叙事；
6. **Task Input** — 本轮具体需要处理的输入。

六类来源不能互相替代，也不因为“数据存在”就自动进入模型 Context。

### 13.2 Package Data 与 Knowledge

冻结原则：

> **Package Data 给 Runtime；Knowledge 给模型。**

Package Data 保存：

- area / facility / decree / item 等静态定义；
- requirements；
- modifier；
- rule table；
- eligibility；
- 其他程序需要的结构化定义。

Knowledge 保存：

- 世界观；
- 地区叙事描述；
- 组织背景；
- 人物详细设定；
- 社会常识；
- 历史背景；
- 角色基础认知；
- 其他模型需要理解的世界知识。

Package Data 默认不直接进入 Prompt，只有经过显式 Context Projection 的相关片段才可以进入模型。

### 13.3 Character Actor 与 Character Knowledge 分层

Actor / Package 只保存 Runtime 真正需要的稳定机器身份、引用和结构化身份数据。

丰富人物设定放在 Character Knowledge，包括：

- 性格；
- 背景；
- 习惯；
- 说话方式；
- 价值观；
- 关系背景；
- 行为倾向；
- 文字外貌描述。

只有当前真正参与 Event / Task 的 Actor 才优先激活其 Character Knowledge，避免全角色卡每轮全部注入。

### 13.4 Prompt Program 只负责“怎样完成任务”

Prompt Program / Module 不承担世界数据库职责。

Narrator Foundation 只描述：

- Narrator 的任务身份；
- Authority 纪律；
- 当前 Turn 的叙事职责；
- 玩家行动空间；
- 角色一致性；
- structured output 的语义要求。

教会定义、人物背景、地区描述和当前资金等不进入固定 Foundation Prompt。

### 13.5 Narrative Style 属于 Prompt Module

以下内容属于 Narrator Prompt Module，而不是 Knowledge：

- 视角；
- 长短句偏好；
- 文风；
- 对话格式；
- 字数倾向；
- 禁止句式；
- 其他写作风格约束。

这样未来可以替换写作风格，而不修改世界 Knowledge。

### 13.6 四个模型服务使用独立 Prompt Program

Narrator、Planner、Social、World 不使用“一个巨大 Prompt + mode”结构。

第一版至少拥有：

- **Narrator Program**；
- **Planner Program**；
- **Social Program**；
- **World Program**。

允许复用少量共享 Prompt Module，例如：

- authority discipline；
- package tone；
- common character integrity。

但不同职责保持独立主 Program。

### 13.7 Structured Output schema 由 Native contract 承担

不再把长篇 TypeScript interface / JSON schema 全量复制到 Prompt 文本里。

Task Variant 使用 Atria Native structured output / output schema。

Prompt 只解释：

- 字段语义中模型容易误解的部分；
- 当前 Task 特有规则；
- Authority / presentation 边界。

### 13.8 Knowledge activation 以当前 Event / Task 为中心

Narrator Knowledge 候选优先由当前上下文实体决定，例如：

- Event participants；
- location；
- involved organization；
- topic / concept；
- explicit hook。

不采用“把整个 Knowledge Base 全量塞入 Prompt”的方式，也不默认依赖无限制全文关键词扫描。

### 13.9 动态教会状态走 Authority Projection

动态经营状态绝不通过修改 Knowledge 表达。

例如：

- 当前 money；
- church level；
- active decree；
- facility status；
- current project；
- current opportunity；

属于 World / Session App。

只有与当前剧情相关时，由 Authority Projection 形成紧凑的 Context 输入。

### 13.10 Decree 等系统使用多层表达

以 Decree 为例：

- **Package Data** — id、requirements、modifier、event tags；
- **Knowledge** — 这项政策在世界内意味着什么；
- **World** — 是否已经生效；
- **Projection** — 当前剧情真正相关时给模型的有限摘要。

同一概念在不同层有不同职责，不建立重复 Authority。

### 13.11 Knowledge / Memory / World / Timeline 严格区分

冻结定义：

- **Knowledge** — 开局前作者定义、世界原本就存在的知识；
- **Memory** — 游玩后形成、模型未来需要长期记住的经历；
- **World** — 当前客观事实；
- **Timeline** — 最近实际呈现给玩家的主叙事。

例如：

- “A 与 B 是青梅竹马”可以是作者 Knowledge；
- “Day 8 A 第一次在重大决定上听取 B 意见”属于 Memory；
- “church.money = 30000”属于 World；
- 最近两轮对话正文属于 Timeline。

Memory 不因记住了某个事实就成为 Authority。

### 13.12 Package v1 不自建 Memory 编排

第一版不实现：

- 自建 Curator；
- Story Compression；
- Day Compression；
- 自建 Memory Store；
- Prompt 内长期摘要数据库；
- Package 专属记忆调度器。

Package 的责任是提供干净的 Timeline、Event、World、Session App 事实与稳定 Actor identity；长期记忆抽取、检索和压缩交给 Atria Memory。

只有实际长线测试发现明确缺口时，才记录平台问题。

### 13.13 Recent Timeline 与 Memory 分工

- Recent Timeline 负责短期连续性；
- Memory 负责长期连续性；
- Knowledge 负责世界设定；
- Authority Projection 负责当前事实。

Narrator 连续剧情优先依赖最近 Timeline，不用 Memory 替代最近对话。

### 13.14 Context Budget 优先级

Token 紧张时按价值裁剪，而不是平均压缩。

#### Tier 1 — 不应丢失

- 当前 Player Input；
- Current Event / Beat；
- 当前参与 Actor 核心信息；
- Recent Timeline；
- 必要 Authority facts。

#### Tier 2 — 强相关

- relevant Knowledge；
- relevant Memory；
- 当前 location；
- 与 Event 直接相关的 church / World 状态。

#### Tier 3 — 辅助

- 次要世界背景；
- 非核心人物补充；
- 宏观新闻；
- 次要历史。

#### Tier 4 — 默认不进入

- 无关经营数据；
- 完整 Facility 表；
- 完整 Decree tree；
- 全部 Schedule；
- 全部 Communication history；
- 不相关角色设定。

### 13.15 Social Context 独立裁剪

Social Task 默认只获得：

- sender / user；
- recipient；
- relationship；
- recent thread；
- recipient current state；
- current Schedule；
- relevant recent Event / Memory；
- 本条 message。

不默认读取完整主 Timeline、完整世界观或全部教会数据。

### 13.16 Planner Context

Planner 重点读取：

- 未完成 Event；
- open hooks；
- Schedule 空位；
- Actor availability；
- 当前长期目标；
- 关键 church / World 状态；
- 最近 Event tags / novelty information。

不需要完整剧情原文。

### 13.17 World Task Context

World Task 读取：

- 已提交 World facts；
- recent important events；
- relevant macro Knowledge。

World Task 负责把事实包装成活跃的世界表达，不自行创造新的 World Truth。

## 14. Round 7 — Hybrid UI 信息架构冻结方案

Round 7 已获得用户认可，以下作为 v1 Hybrid UI 基线。

### 14.1 Story-first

Hybrid 主界面固定采用 **Story-first**。

玩家打开作品时，默认视觉与交互中心必须是：

- 当前主剧情；
- Current Event；
- Conversation；
- Native Composer。

教会、日程、手机、人物等作为可随时进入的支持应用，不得把主剧情挤成次要区域。

### 14.2 一级导航

v1 一级入口冻结为：

1. **Story**
2. **Church**
3. **Schedule**
4. **Phone**
5. **People**

Story 是默认首页。

### 14.3 Story

Story 页面承载：

- 主 Timeline / Conversation；
- Current Event Header；
- Message Projection；
- Choices / Actions；
- Native Composer；
- 必要的相关 Context。

Desktop 主正文占主要视觉宽度；辅助信息不得反客为主。

### 14.4 Church

Church 二级页面至少包括：

- Overview；
- Facilities；
- Decrees；
- Projects；
- Opportunities。

Church 首页只展示少量高价值信息：

- Church Level；
- Money；
- Followers；
- Reputation；
- Today’s Assignments；
- Active Projects；
- Pending Opportunities。

不做 Excel-style KPI Dashboard，不在 v1 加复杂统计图表。

### 14.5 Schedule

Schedule 使用 Game Clock 时间轴表达：

- 当前时间；
- 已确认行程；
- NPC background assignments；
- due interactions；
- 即将到来的 hard / soft 项。

不使用回合数作为视觉时间轴。

### 14.6 Phone

Phone 统一承载：

- Messages / SMS；
- Social；
- Mail。

不为 SMS、Social、Mail 各建立独立一级导航。

### 14.7 People

People 以剧情理解为核心，展示：

- 人物身份；
- Position；
- 当前状态；
- Today schedule；
- relationship；
- relevant recent information。

不默认设计传统 RPG STR/DEX/CHA 数值面板。

### 14.8 Current Event Header

当前存在 Event 时，Story 顶部显示轻量 Event Header，例如：

- Event title；
- location；
- participants；
- 当前 goal / player-facing status。

不暴露内部 `currentBeat`、workflow phase、Event Instance ID 等 Runtime 实现细节。

### 14.9 Story 中的教会信息保持极轻

Story 可常驻少量教会状态，例如：

`Lv · Money · Followers · Reputation`

但只能作为弱辅助信息；完整经营信息进入 Church。

### 14.10 Context Rail / Context Sheet

Desktop 可使用右侧 Context Rail，但仅承载：

1. 当前参与人物；
2. 当前故事真正相关的事实；
3. 进入 Church / Schedule / Phone 等应用的快捷入口。

不得把所有经营数据复制成侧栏 Dashboard。

Compact / Mobile 不压缩 Story 来硬塞右栏，改为按需展开的 Context Sheet。

### 14.11 Message Choice 与消息绑定

Choices / Quick Actions 属于产生它们的 Message Projection。

它们必须跟随对应 assistant message，而不是放在全局固定“当前选项”区域。

这样历史回看、Reply Variant 和 Branch 都能明确知道选择属于哪一轮。

### 14.12 永远保留自由 Composer

无论当前消息是否提供推荐选项，Native Composer 都必须可用。

Choices 是建议行动，不是玩家唯一合法输入。

### 14.13 Choice Behavior

复用 Player Preference：

- `send_immediately`；
- `fill_composer`。

`fill_composer` 允许玩家点击建议后继续修改文字，再正式发送。

### 14.14 通知默认不进入主 Timeline

以下内容默认使用 badge / toast / app state，而不是机械插入 Story：

- 新 SMS；
- Mail；
- Project 完成；
- Facility 完成；
- 教会经营结算；
- 普通 Schedule 结果；
- 其他后台通知。

只有真正进入当前剧情时才通过 Event / Narrative 写入 Timeline。

### 14.15 Opportunity 是经营到剧情的 UI 桥梁

普通 Opportunity 留在 Church。

剧情级 Opportunity 可以在 Story 显示轻量入口，例如“有人正在门口等你”，玩家接受后转换为 Event Instance。

### 14.16 v1 的视觉定位

v1 明确定位为：

> **高质量 text-first narrative application**

不使用背景、CG、Audio 或立绘，依靠：

- typography；
- spacing；
- structured components；
- dialogue grouping；
- badges；
- progress / status；
- Native UI transitions；

建立区别于普通聊天页的产品体验。

### 14.17 Dialogue / Scene Presentation

原先的“Text GAL”在产品层改称 **Dialogue / Scene Presentation**。

它和普通 Story Rendering 共享同一个 Narrative Authority，只是表现方式不同。

例如同一 Narrative 可以表现为：

- prose-heavy Story；
- speaker + dialogue grouping；
- structured narration / dialogue blocks。

v1 不建立第二套 GAL 模型，也不依赖媒体 Asset。

### 14.18 v1 不提供手动 Story / Dialogue 切换

第一版由当前 Narrative / Event presentation 自行选择合适渲染，不增加玩家手动 Story/Dialogue 模式切换 Preference。

若实际使用发现明确需要，再在后续版本增加。

### 14.19 Mobile / Compact

Mobile 继续保持：

- Story 全宽优先；
- Composer 常驻；
- 一级导航压缩为底部或等价 compact navigation；
- Context Rail 转为 Context Sheet；
- Church / Schedule / Phone / People 保持同一信息层级，不做桌面页面简单缩放。

## 15. Round 8 — Message Projection / 选项 / Conversation 待讨论

本轮尚未冻结。

需要决定：

- Narrator 一次主 Turn 的 canonical Timeline content 应该只保存纯 prose，还是保存结构化 narrative segments；
- Message Projection 允许哪些 block 类型；
- Choices / Actions 是模型直接生成 block data，还是由 Event / Runtime 生成；
- 选择按钮是否必须与当前 Event / Command 绑定；
- 历史消息上的 action 如何处理 active-tail / explicit fork；
- Reply Variant / Branch 切换时 projection 和 Event / World state 如何同步；
- 普通自由聊天与 Event Turn 是否共享同一种 Message contract；
- Dialogue / Scene Presentation 应落在 canonical content 还是 projection；
- 状态条、人物状态、教会相关提示是否属于 message-local snapshot；
- Message-local UI state 可以保留哪些内容；
- 是否允许消息 block 读取 live World，还是一律使用 commit-time snapshot；
- 如何保证 display-only block 不进入未来 Prompt；
- 用户点击 choice 后发送的是自然语言、typed action，还是二者组合。
