# 定向研究与能力基线

本模块拥有研究证据和基线判断。实施前仅核对当前阶段涉及的入口及调用关系；不重新全面扫描 Atria、全部 docs / Plans / Records / Skills、reference 或提交历史。

## 基线与证据边界

| 项目 | 锁定提交 |
| --- | --- |
| Atria 远端 main | `4ac8affbf01bfb5fb576834bb7eedbeefd03c007`；2026-10-06 发布企划前重新 fetch，仍与研究起点一致 |
| Tavern Helper / N0VI028/JS-Slash-Runner | `87ca341a2a2279f4c18cd1918c5ae9dbd1dac492` |
| Prompt Template / zonde306/ST-Prompt-Template | `d6f520d149aba146305b0b781ddd691d449c28d2` |

结论来自官方功能与源码入口、必要调用链。未使用采用率或用户频率统计，不将每项功能表述为所有用户必需。Atria 集成判断属于静态追踪；本轮没有执行产品测试、构建或运行时复现。

## Tavern Helper 体现的需求

| 需求 | 可吸收的原生能力 |
| --- | --- |
| 脚本需要广泛操作游戏与运行过程 | 按领域组织的读视图、Command、Task 与受控 Capability，方便作者组合 |
| 主生成之外还有摘要、NPC 决策和独立请求 | 独立 Generation / Task 身份、结构化结果、取消、并发及明确结果去向 |
| 脚本根据运行进展开展工作 | Native Lifecycle、受控自动化与资源清理 |
| 按钮、状态面板、消息卡和交互游戏 UI | 固定组件、类型化数据、Controller 和领域 Intent |
| 作者需要理解脚本和生成行为 | 正式脚本诊断、有效 Prompt 预览、执行关联和失败说明 |

函数库广度说明领域能力与作者表达存在需求；它不要求以全局便利函数作为平台结构。iframe 与消息 DOM 承载了原宿主下的交互，其价值可由 Native Frontend 和受限执行承接。

[功能入口](https://github.com/N0VI028/JS-Slash-Runner/blob/87ca341a2a2279f4c18cd1918c5ae9dbd1dac492/src/function/index.ts)、[生成契约](https://github.com/N0VI028/JS-Slash-Runner/blob/87ca341a2a2279f4c18cd1918c5ae9dbd1dac492/src/function/generate/types.ts)、[事件](https://github.com/N0VI028/JS-Slash-Runner/blob/87ca341a2a2279f4c18cd1918c5ae9dbd1dac492/src/function/event.ts)、[变量](https://github.com/N0VI028/JS-Slash-Runner/blob/87ca341a2a2279f4c18cd1918c5ae9dbd1dac492/src/function/variables.ts)、[消息运行时](https://github.com/N0VI028/JS-Slash-Runner/blob/87ca341a2a2279f4c18cd1918c5ae9dbd1dac492/src/store/iframe_runtimes/message.ts)。

## Prompt Template 体现的需求

| 需求 | 可吸收的原生能力 |
| --- | --- |
| Prompt 依据状态、对象和生成目的变化 | 获准数据派生、条件与重复结构、模块组合和阶段产物消费 |
| 世界知识需要查询、条件激活、选择与动态内容 | Knowledge 的资格、发现、依赖、内容计算、预算与选择证据 |
| 临时计算、聊天状态和消息阶段需要不同生命周期 | 原生 State / Artifact 归属与保留，而非复制旧变量层级 |
| 输出和显示需要不同处理 | 明确阶段与用途的 Processing、正式消息与呈现边界 |
| 模板执行复杂，作者难以解释结果 | 资源版本、输入来源、选择过程、实际 Prompt 和失败链路 |

[处理主链](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/modules/handler.ts)、[模板上下文](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/function/ejs.ts)、[变量](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/function/variables.ts)、[World Info](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/function/worldinfo.ts)、[Regex](https://github.com/zonde306/ST-Prompt-Template/blob/d6f520d149aba146305b0b781ddd691d449c28d2/src/function/regex.ts)。

## Atria 当前能力分类

①：现有能力足够作为对应基础。②：已有基础，需扩展广度或整合主链。③：确认的能力缺口。④：外部机制不构成 Atria 目标。分类针对具体能力，不推断整个 Runtime 缺失。

| 能力 | 判断 | 当前依据与后续讨论方向 |
| --- | --- | --- |
| 正式 Session、State、Revision 和历史提交 | ① | 已有状态 Authority、版本锚点、分支、恢复和冲突检查；保留并复用。[SessionCore](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/src/native/session-core.js) |
| World Command 与 Authority Transaction | ① | 已有 Command 前置检查、固定规则、私有候选快照，以及声明读范围、Effect、随机性、预算和安全 Receipt 的 Authority Transaction；由 SessionCore 发布。本轮应研究怎样扩展现有事务契约。[Authority Transaction](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/src/native/authority-transaction.js) [声明编译](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/native/experience/logic/transactions.js) |
| Prompt Program、Module、PromptIR 和 Generation 请求身份 | ① | 已有固定资源引用、条件、作用域、阶段与有效快照，Generation 有预算、预览、取消和重试。[Prompt Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/src/native/model-prompt-runtime/README.md) |
| UI Controller 受限脚本与 Bridge | ① | 已有 QuickJS、预算、只读输入、声明式 Bridge、撤销和异步清理；这是可复用的安全执行基础。[Script VM](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/native/frontend/script-vm.js) [Bridge](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/src/native/frontend/bridge.js) |
| 面向 Package 的领域计算脚本 | ③ | 当前 Package Game Logic 加载仍要求声明式 JSON；通用受限业务脚本尚未接入。该缺口有现有 Command 和 Authority 基础。[Package Logic 入口](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/native/experience/logic/package.js) |
| 多生命周期 State 与领域视图 | ② | 已有领域记录、Scope、保留策略、Continuity、按受众与用途选择的 Information View，以及部分派生摘要的来源有效性检查；作者的统一声明、脚本读取和各消费链路的整合仍需扩展。[Lifecycle Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/shared/native-lifecycle-contract.js) [Information Runtime](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/shared/native-information-runtime.js) [Continuity Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/shared/native-continuity-contract.js) |
| 动态 Prompt 与阶段产物计算 | ② | 已有有限条件和插值，以及阶段产物输入；作者可编程派生和计算链需要继续讨论。[Prompt Compiler](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/src/native/model-prompt-runtime/prompt-compiler.js) |
| Knowledge 查询、发现和激活 | ② | 已有条件、对象、依赖、关键词、递归、预算和生命周期状态。静态追踪显示原生服务端 Context 主链使用候选资格筛选，完整发现与生命周期选择仍从共享 World Info 路径调用，主链整合尚不完整。[Knowledge Selection](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/native/knowledge-selection.js) [Context Compiler](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/native/context-compiler.js) |
| 辅助生成、结构化结果和 Tool | ①与② | 任务身份、队列、结果 Schema、sink 和 Capability 已有；Package Script 如何声明与组合这些能力仍需扩展。[Task Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/shared/native-task-contract.js) [Task Scheduler](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/src/native/task-scheduler.js) |
| Lifecycle 与自动化 | ② | 已有固定触发、workflow、时钟、Task 与提交约束；作者脚本触发范围和跨阶段编排需要扩展。[Lifecycle Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/shared/native-lifecycle-contract.js) |
| Regex 与消息 Processing | ② | 已有 Regex 引擎和 MessageProjection 契约；各原生请求、输出、消息和呈现路径的统一阶段契约仍需讨论，不能假定旧引擎已覆盖所有 Native 路径。[Regex Engine](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/extensions/regex/engine.js) [Message Contract](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/shared/native-message-contract.js) |
| Studio 与 Runtime Diagnostics | ② | 已有有效 Prompt 快照、IR、上下文选择、预算和脚本诊断；跨 State、Knowledge、Prompt、Task、Command、Revision 的因果追踪仍值得扩展。[Runtime Workspace](https://github.com/ZZZdragondYNGPHX/Atria/blob/4ac8affbf01bfb5fb576834bb7eedbeefd03c007/public/scripts/native/runtime-workspace.js) |
| 全局 API、iframe 和特殊文本控制协议 | ④ | 属于原宿主的载体或绕行方式，不构成 Atria 必须继承的原语。 |

## 关键静态发现

- 通用受限 Package 业务脚本尚未接入，但 Command、固定规则、私有候选、事务预算和最终提交已有基础。应扩展现有 Authority，避免建立平行状态提交系统。
- Prompt 编译器已有作用域、有限条件、插值及阶段产物声明/消费检查；它接收已准备的产物，不等同于已经提供通用作者计算链。
- Knowledge 独立选择器已有发现、生命周期、递归依赖、先渲染再计数和候选持久状态。原生 Context 主链目前从资格计划读取静态条目内容；完整选择与内容派生需要整合。
- Task 生产身份、结果类别、sink、队列与有效性已有；当前 proposal 应用仍要求保存 Revision 与应用锚点相等，更细的获准跨版本消费需要扩展。
- Information View 已按受众和用途投影；部分派生摘要已有来源指纹有效性检查，不能另建无依据的事实缓存。
- Regex 有独立文本处理责任与诊断；MessageProjection 有正文一致性和受限 JSON。不能假定旧 Regex 已覆盖所有原生服务端生成和 Native UI 路径。

## 原生代码入口

下列清单是按领域的定位路由，阶段执行只读取对应行与必要依赖。

| 领域 | 首要入口 |
| --- | --- |
| Authority / State | `src/native/session-core.js`；`src/native/authority-transaction.js`；`src/native/task-authority.js`；`public/scripts/native/experience/logic/package.js`、`transactions.js`、`runtime.js`、`validators.js`、`reducers.js`；`public/scripts/native/experience/world/session.js` |
| 信息视图与连续性 | `public/shared/native-information-contract.js`、`native-information-runtime.js`、`native-lifecycle-contract.js`、`native-continuity-contract.js` |
| Script / Bridge | `public/scripts/native/frontend/script-vm.js`、`script.js`、`script-worker.js`；`public/shared/native-frontend-script.js`；`src/native/frontend/bridge.js` |
| Prompt / Generation | `src/native/model-prompt-runtime/README.md`、`prompt-compiler.js`、`prompt-values.js`、`generation-service.js`；`src/native/adapters/generation-host.js` |
| Knowledge / Context | `public/scripts/native/knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`；按调用关系读取 `session-runtime.js` 的 evaluate / commitKnowledge |
| Task / Lifecycle | `public/shared/native-task-contract.js`、`native-lifecycle-contract.js`；`src/native/task-scheduler.js`、`lifecycle-authority.js` |
| Processing / Frontend | `public/scripts/extensions/regex/engine.js`；`public/shared/native-message-contract.js`、`native-frontend-host.js`；`public/scripts/native/frontend/conversation.js`、`runtime.js` |
| Diagnostics | `public/scripts/native/runtime-workspace.js`；对应受限脚本诊断与实际资源预览入口 |

## 不继承机制的理由

旧变量存储与 per-message / swipe 克隆缺少 Atria 的领域归属和正式版本语义；宿主配置临时覆盖、全局 Prompt 注入和假的生成预览是宿主限制下的绕行；Knowledge 文本标签或 disabled 标志不应承担代码执行调度。

渲染阶段隐式改写消息或变量、执行模型输出中的代码、在最终预算后继续展开内容，会混合已确认的阶段与权限边界。具体排除项以 [decisions.md](decisions.md) 为准。

## 与旧讨论稿的关系

原始讨论稿保留在 [Atria 原生能力模型讨论初稿](https://chatgpt.com/space/page_8280003745148191a57913f72db9f9fc)。本 Plan Bundle 是后续工作的权威；新设备续接无需访问 Page。
