# 上下文、Knowledge、Generation 与 Task 产物

本模块拥有获准数据的上下文派生、知识选择、Prompt 组合、显式模型任务，以及 Task 来源和消费规则。读取与正式提交依赖 [authority-script.md](authority-script.md)，跨模块边界见 [decisions.md](decisions.md)。

## 上下文计算

扩展现有 Prompt Program / Module / PromptIR、条件、插值和阶段产物能力，支持作者从获准视图、历史、资源和有效产物派生数据与片段。

声明式契约表达输入用途、版本、依赖、输出和预算；普通条件与组合保留直接声明，复杂聚合、排序和片段生成允许受限脚本。执行基础和读取机制优先复用原生能力，避免按每种消费用途建立平行 Script 系统。

计算保持正式 State 只读。游戏伤害、价格和条件等领域结论优先消费固定规则的结果、正式状态或 Receipt；上下文负责选择与表达，不能以另一个模板规则系统代替 Authority。

## Knowledge 查询、选择与内容

区分候选资格、发现/激活、关联依赖、内容派生、预算取舍与实际采用。复杂条件或排序可以可编程，但受明确授权、执行和输出边界约束。

复用当前完整选择器的发现、生命周期、递归依赖和 full / compact 预算能力，整合原生 Context 主链。动态计算的实际内容进入组合预算，再由 Generation 检查最终请求预算；预览与真实发送使用一致的准备依据。

Knowledge 正文是内容资源；可执行派生逻辑来自获准固定资源。特殊标签、disabled 反转或文本内代码不承担隐式运行调度。

黏滞、冷却等持久选择状态由所属 Authority 在相应结果正式采用时提交。查询、计算、预览、重试和重新渲染只生成候选选择；采用范围和并发语义在技术设计中明确。

## 显式 Generation / Task

复用现有 Route / Model / Generation Profile、Capability、有效请求快照、Task 类别、Schema、sink、调度、取消、重试和资源预算。

摘要、语义提取、NPC 决策和辅助生成都通过显式任务/阶段获得结果，再进入后续计算或领域请求。Task 发起者可以是 Experience 或 Package 系统自动化，Domain Logic 的候选计算不直接启动模型或外部 I/O。

Tool 的数据约束、可调用操作与结果用途受平台声明控制；需要正式状态变化的调用转为固定领域操作，其规则与提交由相应 Authority 执行。具体路由由 [experience-processing.md](experience-processing.md) 拥有。

## Task 来源与消费

需要分别识别生产计算、结果保存和正式领域应用。生产依据包括真实生产者、规则/资源、输入和状态来源；应用依据是消费操作的正式锚点。保存结果不表示其中内容已成为游戏事实。

| 消费用途 | 行为 | 强制边界 |
| --- | --- | --- |
| 上下文 / 呈现 | 提供摘要、描述或报告 | 获准用途和受众，不自动改写正式领域状态 |
| 操作提案 | 提议 NPC 行动或业务操作 | 映射到获准 Command，重新检查当前领域条件并计算结果 |
| 规则输入 | 固定玩法使用模型评分或判断 | 读取获准 Task 的真实产物，固定规则解释其游戏意义 |

Schema 合法不能证明来源。编辑、转换和组合应保持派生身份，不能冒充原始正式结果。产物引用与权限必须由平台验证，不能只采信调用者携带的 JSON。

跨 Revision 复用依赖固定契约的用途、有效条件和复用规则；没有契约则不能自动接受。消费时重新执行当前规则，不重放旧 Effects。生产阶段有效性检查不因允许跨版本消费而失效。

源记录的依赖指纹、Scope 变化、分支/Session/Package 边界、消费次数、过期与保留语义由技术设计确定。复用既有 Information 来源指纹和生命周期能力，避免另建无权威事实缓存。

同一请求的重试幂等与同一产物的多次消费分别处理：摘要可被多个请求引用，一次奖励类结果须满足其消费约束。

## 技术设计与阶段交付

S1 先落实领域契约需要的真实 Task 引用与消费接点；S3 完成派生计算、Knowledge 主链、阶段产物编排与细粒度有效性。

具体查询接口、产物引用、依赖模型、随机/时间输入、缺少产物时的预览行为和缓存形式均由 Agent 推导。需要模型计算的预览准备应呈现为显式任务，不由模板求值暗中发送请求。

## 行为验证

- 在同一组固定输入与产物下，预览解释与实际请求准备一致；预览不写正式 State、不隐式发送模型请求。
- 一个动态知识条目展开超出预算时，最终选择与请求检查正确，依赖不会残缺进入请求。
- 获准的无关 Revision 变化允许按契约复用；目标消失、Scope 改变或领域条件失效时，当前操作被拒绝或产生明确处理结果。
- 伪造同形 Task JSON、越过用途授权、编辑结果冒充原产物，以及重放旧 Effects 均被拒绝。
- 敏感读范围、模型上下文与玩家呈现按用途分离；持久知识状态只随正式采用提交。

## 起读代码

`src/native/model-prompt-runtime/prompt-compiler.js`、`prompt-values.js`、`generation-service.js`；`public/scripts/native/knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`；`src/native/adapters/generation-host.js`；`public/shared/native-task-contract.js`；`src/native/task-scheduler.js`；`session-core.js` 的 Task 保存与 proposal 应用。

模型与资源解析说明先按需读 `src/native/model-prompt-runtime/README.md`。锁定证据见 [research.md](research.md)。
