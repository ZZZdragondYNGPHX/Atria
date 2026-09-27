# Atria Native Heavy-Frontend Reference Package 企划书

> 状态：Discussion Draft v0.1  
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

## 5. 初步资产定位

当前仅作为讨论起点，尚未冻结：

- 建议 Experience：**Hybrid**；
- 主 Timeline / Conversation 继续属于 Atria Host；
- Package 拥有游戏 Dashboard、状态 HUD、开局流程、手机/日程/邮件/GAL 等应用界面；
- Full 是否需要作为额外 EntryPoint 或未来演示模式，待讨论；
- Component 不作为主模式，但可用于消息内/聊天周边组件能力验证。

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

1. **底层框架 / Authority & Runtime Skeleton**
2. World / Session App / UI / Preference 状态切分
3. Model Task 与 Turn 编排
4. Lifecycle / 时间 / 日程 / Morning-Night 工作流
5. Knowledge / Prompt / Memory 分层
6. Hybrid UI 信息架构
7. Message Projection / 选项 / Conversation
8. GAL / Scene / Asset 系统
9. SMS / 社交 / 邮件等二级应用
10. 存档、分支、恢复、压缩与长期游玩
11. Studio Authoring / Scenario / Health 验证策略
12. 最终能力矩阵与是否存在真实平台缺口

顺序可根据讨论结果调整。

## 8. Round 1 — 底层框架待讨论问题

本轮尚未冻结答案。

需要决定：

- 这个 Package 最核心的运行循环是什么；
- 主 Experience 是否固定为 Hybrid；
- World、Session Application、Task、Lifecycle、Presentation 之间谁负责什么；
- “一天”是否作为主游戏周期；
- “故事事件”是 World 事实、Session App Record、Workflow，还是 Activity；
- Story / Plan / Morning / Night / SMS / GAL 等模型能力应如何组合，而不是继续复制旧 Tag Router；
- 是否需要一个统一的 Game Director Task，还是采用多个职责单一 Task；
- Timeline 与游戏事件日志如何分工；
- 资产是否从第一版就按长期可扩展 Package 设计，还是先做最小垂直切片。

本轮确认后，将新增“底层框架冻结方案”章节并升级企划版本。
