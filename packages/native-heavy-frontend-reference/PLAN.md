# Atria Native Heavy-Frontend Reference Package 企划书

> 状态：Discussion Draft v0.2  
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
- Scene / Media / Speech / immutable Asset；
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
- Package 拥有 Dashboard、状态 HUD、开局流程、手机、日程、邮件、GAL / Scene、宗教 / 教会经营等应用界面；
- Component 不作为主模式，但可用于消息内或聊天周边的结构化 UI；
- Full 不作为第一版主入口；只有后续确有独立应用主界面的需求时再评估，不以升级模式来换能力；
- 第一版按长期可扩展 Package 设计，但实现时优先做最小垂直切片，不为了展示平台能力一次性启用所有 Native 子系统。

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
3. Model Task 与 Turn 编排
4. Lifecycle / 时间 / 日程 / Morning-Night 工作流
5. 宗教 / 教会模拟经营的数据模型、结算与剧情耦合
6. Knowledge / Prompt / Memory 分层
7. Hybrid UI 信息架构
8. Message Projection / 选项 / Conversation
9. GAL / Scene / Asset 系统
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
- **Curator**：摘要、压缩和长期信息整理。

具体用一个 Task 多 Variant 还是多个 Task，将在 Model Task 轮次按当前 contract 冻结。

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

## 9. Round 2 — 状态切分待讨论

本轮尚未冻结。

需要进一步决定：

- 哪些长期事实进入 World；
- 哪些业务对象进入 Session Application；
- Event Instance 的正式 schema 边界；
- Character State 应全部归 World，还是拆出 runtime/session 部分；
- 教会经营中的资金、信徒、等级、设施、项目、今日排班分别属于哪里；
- 邮件、SMS、社交帖子、新闻、任务、道具、关系分别属于哪个 Authority；
- Local UI State 的生命周期；
- Player Preference 第一版需要哪些 key；
- 哪些信息只做派生 Projection，不持久化；
- 哪些数据应该作为 Package Data 静态定义，而不是 Session / World 状态。
