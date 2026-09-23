# 模型、提示词与设置：证据底稿

> 本文是未来实施前需根据届时 main 修正的证据底稿，不是当前产品实现说明或最终验收报告。
> 只记录已取得的证据、覆盖范围和验证缺口；设计与实施权威由同目录其他企划文档承接。

## 1. 基准、用途与解释边界

- 源码固定基准：`main@fd9a493c9040b32f4892bd92531030e58b066244`。
- 所有源码链接钉住上述提交；不把工作中分支、后续提交或远端最新状态混入基准。
- 本文承接聊天补全切片，并纳入主审确认的文本补全、设置、连接与 Native 边界回执；不是全面全仓审计。
- 原审查未修改产品代码；本轮仅编写文稿，未重跑产品测试、安装依赖或开展新的真机探索。
- 归档位置为 docs 的 `planning/atria-model-prompt-settings/`；本文不记录本机目录或原始运行日志。
- 实施开始前必须对届时 main 重新核对命中路径、已修复问题、测试和在途工作的合入情况。
- 用户已定方向是最大切割旧表层、保留底层必要能力；旧 preset、DOM、global、事件 ABI 不构成永久兼容承诺。
- 提示词保留 ST 级可塑性，玩家 mod 不改 kernel；方案可由模块组合，一个角色一个 active 方案。
- 模块装配细节是用户委托代理决定的事项，不能写成用户逐项确认；本文也不另行决定模块划分。
- 当前行为的记录用于识别能力、缺陷及迁移风险，不等于要求新系统复制所有旧行为。

### 在途边界，仅记录主审交接回执

- docs 观察 HEAD：`abe12e787f1935beeac3b37f80a386148d23bbb6`。
- 该交接确认 A5 已完成，完成点为 `eefd6550d9b2af6c2777984e12d5f61de0898415`，下一阶段 A6。
- 在途远端分支曾观察到 `5028576791e25fad53761fe088bd884d205cd196`；本文未审该提交，不把它当 main。
- 活动计划已包含 Runtime/Presets 和原生 Settings；不能重复建设产品壳或平行运行时。
- 交付前主审再次读取 `docs@90fbd7ee198962a5ad417e99220a2dfb5f77f052`：A6 已完成于 `e33704b91ecb0373902132fe8af9c80b204aa8ce`，下一阶段 A7；交接还记录了 Settings/Connections 等 Advanced 兼容岛。本次未审新代码，它们仅是未来复核输入。
- 上述交接或其他分支的 CI 结果没有计入本文测试通过数。

## 2. 证据等级

| 标记 | 含义 | 不能据此宣称 |
|---|---|---|
| S | 静态确认：固定基准的函数体、调用方或可达控制流支持该事实 | 真实用户场景已复现、所有调用方均受影响 |
| R | 函数级离线复现：从真实源码提取函数，在 Node VM 中执行 | 完整模块启动、浏览器交互或后端集成已通过 |
| T | 定向测试通过：采用主审交付的本基准执行回执 | 全套测试、干净安装、全部平台或完整 UI 验收通过 |
| M | 确定性字面统计：在明确归一化规则下计数 | 语义等价、删除安全、体验等价 |
| U | 真机未验：浏览器、实际模型或对应端到端路径仍缺证据 | 问题已在真机发生或风险已被消除 |

- S、R、T、M 是不同证据，不作自动升级；U 可以与任一等级并存。
- 下表“风险”描述可达后果或迁移约束，不把未执行的场景写成既成故障。

## 3. 分片覆盖

| 分片 | 实际覆盖 | 边界 |
|---|---|---|
| 聊天补全预设 | `openai.js` 的选择、序列化、保存、角色生效、dirty、导入导出及主要编译/发送接缝 | 关键路径审查，未穷举模型与媒体分支 |
| PromptManager | 共享设置、编辑、默认值清理、order/group、prompt 导入导出、集合与 trigger | 非所有 DOM 分支或交互的完整审计 |
| 通用预设与角色 | `preset-manager.js`、角色预设服务、保存分派、ghost 兼容、扩展字段写入 | 第三方插件只追调用入口 |
| 后端存储 | `PresetRepo`、主要 save/patch 路径、settings bootstrap 适配 | 未审遍所有存储引擎内部实现 |
| 文本补全 | 纳入文本代理的统计及三项函数级复现回执 | 本文不重复探索，不声称完整 UI/后端复现 |
| 设置与宿主 | 纳入设置切片的分类、挂载、保存、刷新、语言域及主审边界 | 不重复全面审查设置壳 |
| 连接与 Native | 纳入主审的字段分域、请求局部覆盖、Context 与预算契约 | Native Context Compiler 归主审，不另起编译器审计 |
| 测试 | 11 套执行回执；另有部分测试源码及关键断言检查 | 通过数与“仅看到测试存在”分开记账 |

## 4. 基准中的状态与调用数据流

```text
全局 preset 快照 / 角色 preset slot
  → 选择框及 origin 判定 → BEFORE hook → oai_settings 与 DOM
  → 用户设置保存 → SETTINGS_UPDATED → 角色 slot 自动同步（角色模式）
PromptManager.serviceSettings → 同一活动设置对象，不是独立文档仓库
主聊天 Generate → prepareOpenAIMessages → PromptManager 集合及预算
  → messages → 请求局部 settings → 参数构建 → provider dispatch
generateTask → st-context 插件提示组装 → 共享 sendOpenAIRequest
```

- 命名预设快照、持久化活动编辑态、角色内嵌副本是不同对象；“保存”并非一个统一动作。
- DOM ghost、角色状态缓存、旧全局名称共同参与活动身份；这属于旧实现事实，不是新身份规范。
- 连接已经存在独立字段域与请求局部覆盖；不能把本基准描述成“连接与 prompt 完全未拆分”。
- messages 与采样参数最终同处 HTTP 请求是正常传输边界，不能单凭这一点认定架构混杂。

## 5. 证据表

### 5.1 聊天补全、PromptManager 与存储

| ID / 等级 | 静态事实与证据 | 意义、限制或待验证风险 |
|---|---|---|
| CC-01 / S,U | 全局库按名称映射数组；PromptManager 直接引用活动设置。[库][cc-library]、[状态][pm-state] | 编辑器、运行态和库快照需分别辨认，不能以文件体积证明需整体重写 |
| CC-02 / S,U | 普通保存按 origin 分派；角色服务以多槽 `presets/defaultPresetName` 持久化。[分派][cc-save]、[角色][card-store] | 角色同名与全局同名不能仅凭显示名称混用 |
| CC-03 / S,U | PM 保存调用用户设置保存；角色模式订阅 SETTINGS_UPDATED 自动同步。[入口][pm-save]、[同步][card-sync] | 全局显式提交和角色自动同步是不同语义；新策略由设计文档决定 |
| CC-04 / S,U | 完成 Promise 初始化后未发现重新赋值，但 selectPreset 等待它。[Promise][cc-await]、[调用者][pm-await]、[异步切换][cc-switch] | 存在异步补载/listener 时，返回不能证明真实切换完成；未做真机竞态复现 |
| CC-05 / S,U | 扩展写检测角色后仍按名称调用全局 save；ghost 无碰撞时合成行，有碰撞时让全局行优先。[写入][pm-write]、[投影][pm-list]、[保存][preset-save] | 静态路径可额外创建全局副本或更新同名全局扩展，不能把读取兼容测试当写入隔离证明 |
| CC-06 / S,U | 旧扩展同步 helper 读单槽 `{name,preset}`，角色服务已是多槽。[旧 helper][old-card-sync]、[多槽][card-store] | 存在格式与写入所有权分歧；不是新系统应永久兼容两套写路径的理由 |
| CC-07 / S,U | dirty 比较排除连接和整个 extensions，缺字段借当前运行设置；origin 判断还需当前或旧选择值。[比较][cc-dirty]、[origin][dirty-origin] | 这是限定范围的比较策略，不是完整文档 dirty 检测 |
| CC-08 / S,U | 整 preset 导入经 JSON parse、hook 后保存 body；导出读取已存 body 而非直接取 draft。[导入导出][cc-io] | 普通保存剥离连接不等于历史导入文件已净化；需分清可保留字段与可应用字段 |
| PM-01 / S,U | prompt 具有角色、注入、trigger、override、attach 等字段；order 引用 identifier。[字段][pm-fields]、[引用][pm-order] | 必要能力不等于旧 JSON/DOM ABI 必须原样常驻；dummy character_id 不是 Native Actor ID |
| PM-02 / S,U | prompt 导出是 `{version,type,data}`；导入按 ID 合并，order 用 Object.assign，校验以字段/类型为主。[导出][pm-export]、[导入][pm-import]、[校验][pm-validate] | 与完整 preset 文件不是同一格式；尚无完备格式校验或迁移闭环证据 |
| PM-03 / S,U | 分组拖动从 DOM 同时重建 flat order 和组成员。[拖动][pm-drag] | 组不是唯一执行顺序；迁移需避免丢失启用状态、执行顺序和成员关系 |
| PM-04 / S,U | 主聊天处理 trigger/注入；插件编译另行遍历 order 并跳过 plugin_extra。[主聊天][pm-collect]、[插件][plugin-compile] | 两条路径存在有意策略差异；不能未经验收把差异一律归为 bug |
| REQ-01 / S,U | 请求 settings 克隆 live，再叠加 llmPreset、连接 profile 和局部 override。[局部配置][request-settings] | 已有分离应作为必要能力证据，而非再建设平行请求配置系统 |
| REQ-02 / S,U | 主聊天编译读 PM/全局并写诊断；设置 hook 可修改 messages 和参数。[编译][cc-compile]、[发送][cc-request] | 应记录能力与可观测输出；旧事件接口不自动成为新公共 ABI |
| SAVE-01 / S,U | 全局 preset 保存失败会抛错，角色扩展 HTTP 失败仅日志、不拒绝 Promise。[全局][global-save]、[角色][extension-save] | resolved 不能统一代表持久化成功；错误传播与界面反馈待回归 |
| STORE-01 / S,U | PresetRepo 已有用户键、事务、patch、sidecar 级联删除；端点复用该 repo。[仓储][preset-repo]、[端点][preset-api] | 底层能力可复用；整文档 save 无版本前置条件，不据此宣称已有并发丢失事故 |

### 5.2 文本切片回执

| ID / 等级 | 已取得证据 | 限定结论 |
|---|---|---|
| TC-01 / M,U | `default/content/presets/context` 34 个 JSON，去顶层 name、规范顶层 key 排序后为 8 组；instruct 38 个为 37 组 | 仅字面 JSON 统计，不是语义等价、删除安全或可直接合并清单 |
| TC-02 / S,R,U | 缺 adaptive 值时保留旧值；文本代理已提取真实函数执行。[配置][tc-adaptive]、[赋值][tc-adaptive-apply]、[入口][tc-adaptive-entry] | 离线复现不包含完整 UI 切换与后端 |
| TC-03 / S,R,U | bias 使用固定 BIAS_CACHE key，而局部请求配置路径可达；真实函数在 VM 执行，token/network 依赖 mock。[缓存键][tc-bias-key]、[读取][tc-bias]、[局部请求][custom-request] | 缓存隔离风险已获函数级证据；真实 tokenizer/network 及 UI 未验 |
| TC-04 / S,R,U | 找不到 instruct 模板仍可返回 autoSelected=true，影响调用方 fallback；文本代理已函数级复现。[自动选择][instruct-auto]、[fallback][tc-fallback] | 覆盖指定函数路径，不代表已遍历所有自动匹配策略 |

### 5.3 设置、连接与 Native 边界回执

| ID / 等级 | 已取得证据 | 限定结论 |
|---|---|---|
| SET-01 / S,U | 设置分类仅 scrollIntoView，主体 reparent user-settings-block。[分类/挂载][utility-settings] | 当前不是独立原生设置模型；不据此新增第二个产品壳 |
| SET-02 / S,U | workspace host 已有 adapter lifecycle 和 canonical routes。[生命周期][workspace-lifecycle]、[路由][workspace-routes] | 应与活动 A6 工作核对复用，而非复制宿主能力 |
| SET-03 / S,U | 设置保存 resolve 后显示 saved，而底层失败 catch 不 reject。[显示][utility-save]、[保存][settings-save] | 假成功反馈的静态路径成立；浏览器失败态尚未验 |
| SET-04 / S,U | 设置切片确认插件切换使用 reload=false，扩展服务存在 requiresReload；界面缺待刷新状态。[服务][extension-reload] | 不把运行态和持久化启用态视为必然同步；真机未验 |
| SET-05 / S,U | settings 端点已有 repo.patch 和 409 分支；语言选择写 localStorage。[patch][settings-patch]、[语言][language-device] | 设备域、账户域与运行域不能被“统一保存”掩盖；不是设计层级的新裁决 |
| CONN-01 / S,U | CC profile 字段不含 preset；TC 包含 preset/context 等。[字段域][connection-fields] | 不可写成所有 API profile 均已去 preset，也不可写成 CC 完全未拆分 |
| CONN-02 / S,U | applyConnectionProfile 仍顺序执行 slash 改全局；resolver 已有请求局部 override。[应用][connection-apply]、[局部覆盖][profile-resolver] | 切换控制面与单请求覆盖是两条不同路径 |
| NAT-01 / S,U | Native Context Compiler 与主聊天接入已存在；PreparedContext 有预算契约。[Native][native-context]、[接入][native-context-call]、[预算][prepared-context] | Native Context policy 不等于旧字符串 Context Template；不新增平行 compiler |
| NAT-02 / S,U | Native character 的 avatar/index 只是宿主投影；旧 OpenAI 聊天持久化被关闭。[投影][native-projection]、[隔离][native-persist] | 不可将旧角色存储服务直接当 Native 权威；未审在途 A5/A6 实现 |

### 5.4 有界补充：变量、PHI、模块化 CoT 与编排接缝

- 文稿更新起点按主审指定的 `docs@fb374ba7fdd0f2f14587e655c6d20dd8137f020c`；源码仍固定为本文 main 基准，未核验后续实现。
- 本补充只读代表函数，证据等级均为 **S,U**；未执行新的函数级复现、测试或真机验收，原 **11 套／142 项**历史账本不变。

| ID | 静态确认与源码锚点 | 解释边界 |
|---|---|---|
| VAR-01 | `env-macros` 的 user/char、角色描述、charPrompt/charInstruction 读取 env；MacroEnvBuilder 构建名称、角色与模型环境并允许 provider 扩充。[内置宏][supp-env]、[环境构建][supp-env-builder] | 证明有内置环境与扩展接缝，不证明新只读变量域或请求隔离已实现 |
| VAR-02 | `setvar` 调 `ctx.variables.local.set`；st-context 将其接到 setLocalVariable，写 chat_metadata.variables 并调 saveMetadataDebounced。[宏][supp-setvar]、[绑定][supp-variable-bridge]、[本地写入][supp-local-state] | 宏求值可带持久化副作用，不能把所有宏展开视为纯编译 |
| VAR-03 | setGlobalVariable 写 extension_settings.variables.global 后调 saveSettingsDebounced。[全局写入][supp-global-state] | 这是旧聊天/用户设置存储分域，不是拟议模块状态的 Native 必要接口 |
| VAR-04 | generateTask 的 applyMacroSubstitution 给调用方字符串消息传 `skipSideEffects:true`。[局部护栏][supp-macro-guard] | 只确认这个调用点的参数；不证明所有预览、preset 宏或 provider 均无副作用 |
| PHI-01 | PromptManager 内部 ID 精确为小写 `jailbreak`，显示名是 `Post-History Instructions`；main/PHI 的角色 override 检查禁用状态与 forbid_overrides。[PHI 定义][supp-phi]、[覆盖条件][supp-prompt-overrides] | 高级提示已有 role、注入、trigger 等能力，见 PM-01；名称不是新接口或必定最后注入的保证 |
| COT-01 | OpenAI 请求对象含 include_reasoning、reasoning_effort，后者由 getReasoningEffort(settings, model) 取得。[请求字段][supp-native-reasoning] | 这是模型原生 reasoning 参数，不是作者 CoT 文本，也不是编排调度；未遍历 provider 支持矩阵 |
| ORCH-01 | compilePreset 生成 Plan.agents/nodes/edges；每 agent 的 instructions 来自 systemPrompt，modelProfile 含 apiPresetName/promptPresetName；运行时上下文可消费 agent.instructions。[Plan][supp-plan]、[上下文层][supp-agent-context] | 已有按节点职责配置的承载点，不证明“CoT 模块→节点”映射、去重或阶段接管已实现 |
| ORCH-02 | runtime 在上下文/取消检查后调用 ports.model.request；代表适配器向注入的 send 传 taskMessages、abortSignal。[model-port][supp-model-port]、[适配器][supp-model-adapter] | 证明模型端口与执行宿主分离；不把该适配器指定为新系统永久接口 |
| ORCH-03 | 共享迭代请求构造携带 apiPresetName/llmPresetName，非流式分支调用 context.generateTask；其 sender 再传局部配置与信号给 sendOpenAIRequest。[请求组装][supp-iter-request]、[调用][supp-iter-dispatch]、[发送接缝][supp-task-dispatch] | 编排可复用现有请求能力，不需要据此强迫单模型 RP 包进 Agent 图 |

**新设计需求，不是现状已实现结论：**
- 将内置变量、编译 scratch、模块持久状态明确分域，是本次企划需求；既有 env、chat variables 或 runtime scratch 不等于这一新契约。
- 旧聊天变量持久化只作能力与迁移证据；新 Native 模块不必暴露或永久支持旧 setvar/全局存储 ABI。
- 作者 CoT prompt 是可组合的任务/判断指令；模型原生 reasoning 是请求能力；编排 runtime 管节点与调用，三者不处于同一层，也不等于读取模型隐藏推理。
- 编排可承接部分原本放在单模型提示中的阶段，是待设计和验证的衔接需求；上述接缝不证明自动拆分或接管已经完成。
- 单模型 RP 必须保持一等路径，不强迫启用 Agent 编排；源码不能推出编排必然提高质量或必须替代单模型。

**新增未来验证缺口（由设计/实施文档承接，不另立权威）：**
- 预览和 dry-run 不得写模块持久状态或旧聊天变量；需覆盖宏、嵌套展开及异常路径，而非只检查 skipSideEffects 参数。
- 验证角色、请求和节点间的变量/scratch 隔离；明确哪些持久状态可共享，不能借旧全局对象默认共享。
- 重试、取消和恢复不重复提交状态、不接受过期输出；调用次数、预算与副作用需要可观测证据。
- 单模型模式不会因启用 CoT 模块隐式增加模型调用，也不会被要求启动编排 runtime。
- 编排节点按职责消费 CoT 阶段及必要输入，而非每节点复制整套 CoT；阶段覆盖、去重与用户可见结果需分别验证。

本补充源码锚点（均钉住原 main，未新增运行回执）：

[supp-env]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/macros/definitions/env-macros.js#L14-L95
[supp-env-builder]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/macros/engine/MacroEnvBuilder.js#L81-L174
[supp-setvar]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/macros/definitions/variable-macros.js#L8-L33
[supp-variable-bridge]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/st-context.js#L2714-L2734
[supp-local-state]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/variables.js#L65-L107
[supp-global-state]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/variables.js#L132-L160
[supp-macro-guard]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/generate-task.js#L101-L116
[supp-phi]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L5076-L5082
[supp-prompt-overrides]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L2062-L2079
[supp-native-reasoning]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L3733-L3743
[supp-plan]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions/orchestrator/engine-v2/preset-compiler.js#L11-L33
[supp-agent-context]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/lib/agent-runtime/context-compiler.js#L24-L38
[supp-model-port]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/lib/agent-runtime/runtime.js#L217-L237
[supp-model-adapter]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions/orchestrator/legacy-runtime-ports.js#L10-L24
[supp-iter-request]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/lib/iter-tool-calling.js#L222-L235
[supp-iter-dispatch]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/lib/iter-tool-calling.js#L287-L291
[supp-task-dispatch]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/generate-task.js#L410-L451

## 6. 验证账本

### 6.1 已实际执行：主审在固定 main 上的回执

| 定向套件 | 通过项 | 证据范围 |
|---|---:|---|
| [generate-task/pure][test-pure] | 37 | 纯请求/消息辅助逻辑 |
| [connection-manager/gemini-cache-profile][test-cache] | 2 | profile 缓存字段 |
| [orchestrator-agent-preset-resolver/unit][test-resolver] | 10 | agent preset 解析 |
| [agent-runtime/prepared-context][test-context] | 7 | 已有 PreparedContext 契约 |
| [generate-task/integration][test-integration] | 19 | 套件定义的集成边界，非浏览器验收 |
| [agent-runtime/workspace-presets][test-workspace] | 4 | workspace preset 接口 |
| [character-presets/openai-has-unsaved-changes][test-dirty] | 7 | origin-aware dirty helper；比较器依赖被 mock |
| [character-presets/save-dispatch][test-dispatch] | 11 | 保存 origin 分派 |
| [prompt-injections][test-injections] | 27 | 注入位置、override、attach 边界 |
| [native/context-compiler][test-native] | 14 | Native 编译器的定向场景 |
| [atria-shell/utility-workspaces][test-utility] | 4 | utility workspace 套件限定行为 |
| **合计** | **142** | **11 套，不是 full suite** |

- 主审复用已安装依赖；不是 fresh npm ci，也不是干净环境可重现性证明。
- 早期批量尝试出现命令路径、外置模块解析和跨 suite VM 启动错误；不能把“0 产品断言失败”当测试通过。
- 调整解析顺序后 pure 套件先通过，其余相关套件改为分进程、分套运行；上表各套均有成功回执。早期启动错误不混入产品回归结论。
- 本文没有重跑这些测试，也未复制含本机路径的命令或原始日志；执行依据为主审回执。
- 文本三项 VM 复现单独归 R，不计入上述 142 项；字面 JSON 分组也不算测试套件。

### 6.2 仅检查过测试源码，不计入通过数

- preset E2E #33：保存、切换、重启后参数恢复；主要断言 temperature/top_p/max_tokens，不证明完整提示一致性。
- preset E2E #41：角色同名与全局同名主体保存隔离，不覆盖通用扩展字段写入隔离。
- preset E2E #64：ghost 数字索引/名称读取及碰撞优先级，不代表写入路径安全。
- preset E2E #63：分组拖动与 reload；PresetRepo 合约及 settings parity 测试记录底层已具备的覆盖。
- 上述测试在本轮未执行；不可将“有测试文件”或历史 CI 结果登记为本轮通过。

### 6.3 明确未执行

- 浏览器/真实 SillyTavern 交互、真实模型请求、Android、Docker、full lint、构建、full suite。
- 全 provider、全模型、全部多模态分支、所有插件 ABI 与完整 E2E 矩阵。
- 在途分支与未来 main 的代码验证；142 项不能替代未来实施的基线和验收。

## 7. 未来回归必测

以下是从证据导出的验收候选，不另立设计；届时按实际切割边界修正，旧路径只作为对照或迁移 fixture。

1. 切换完成：延迟 listener、懒加载、快速连续切换后，完成信号与真正生效的方案一致。
2. origin 隔离：角色/全局同名和不同名，主体及扩展写入均不落入错误对象；新身份模型不依赖 DOM 判定。
3. 保存失败：设置、角色/方案提交的非成功 HTTP、网络异常不显示成功，未提交态可解释。
4. 字段完整性：缺省/未知字段、旧文档迁入、非法类型、坏引用、导入导出范围均有确定行为。
5. 提示可塑性：角色/顺序/启用、marker、宏、trigger、override、attach 与分组装配的可观测结果。
6. 双生成策略：chat/plugin 的共同规则和有意差异分别有 fixture，避免无意重复或漏注入。
7. 参数隔离：请求局部 profile、LLM 参数、提示方案不污染全局；TC adaptive 缺值与 bias 缓存隔离。
8. 模板选择：instruct 未命中时 fallback 正确；字面相同模板也须完成语义与删除安全核验。
9. Native 与预算：复用现有 Context/PreparedContext 边界，预算约束、稳定身份及持久化隔离不回退。
10. 设置状态域：设备语言、账户设置、运行态、待刷新状态及失败反馈独立可验。
11. 新扩展契约：玩家 mod 不改 kernel；模块组合和一角色一 active 方案可解释、可验证，不靠永久旧 ABI 托底。
12. 实施后补真实浏览器及代表性后端验收；测试规模由改动确定，不沿用本文数字冒充新验证。

## 8. 重要证据缺口

- CC-04/05、SAVE-01、SET-03/04 仍是静态可达路径，尚缺针对性故障注入及浏览器证明。
- dirty helper 单测不覆盖真实 comparator；注入单测不覆盖完整预算、hook 和最终 provider payload。
- 文本 VM 的 mock 边界、JSON 字面统计与实际生产行为不能混同。
- 未取得完整格式迁移/旧接口删除安全证据；最大切割仍须先明确可迁移数据与必要能力。
- A6 接口、最新 main 以及在途改动须在实施前重新对齐；本文没有授权或实施任何产品变更。

## 源码锚点

[cc-library]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L6186-L6196
[pm-state]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L570-L596
[cc-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L7174-L7207
[card-store]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/character/presets.js#L46-L109
[pm-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L1177-L1179
[card-sync]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L6723-L6784
[cc-await]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L7770-L7783
[pm-await]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/preset-manager.js#L834-L842
[cc-switch]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L7787-L7913
[pm-write]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/preset-manager.js#L1476-L1510
[pm-list]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/preset-manager.js#L1054-L1070
[preset-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/preset-manager.js#L892-L924
[old-card-sync]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/preset-manager.js#L344-L370
[cc-dirty]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L7567-L7584
[dirty-origin]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/character/has-unsaved-openai-preset-changes.js#L51-L99
[cc-io]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L7343-L7422
[pm-fields]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L250-L266
[pm-order]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L2269-L2301
[pm-export]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L4559-L4566
[pm-import]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L4585-L4661
[pm-validate]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L4671-L4686
[pm-drag]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L4948-L4977
[pm-collect]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/PromptManager.js#L3477-L3513
[plugin-compile]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/st-context.js#L2221-L2307
[request-settings]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L825-L843
[cc-compile]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L2109-L2199
[cc-request]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L4591-L4645
[global-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L7126-L7135
[extension-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions.js#L2281-L2308
[preset-repo]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/src/storage/repositories/preset-repo.js#L17-L67
[preset-api]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/src/endpoints/presets.js#L60-L85
[tc-adaptive]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/textgen-settings.js#L379-L395
[tc-adaptive-apply]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/textgen-settings.js#L1238-L1240
[tc-adaptive-entry]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/textgen-settings.js#L1736-L1737
[tc-bias-key]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/textgen-settings.js#L121
[tc-bias]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/textgen-settings.js#L1875-L1878
[custom-request]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/custom-request.js#L402-L421
[instruct-auto]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/instruct-mode.js#L180-L247
[tc-fallback]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/textgen-settings.js#L751-L757
[utility-settings]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/atria-shell/utility-workspaces.js#L287-L369
[workspace-lifecycle]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/atria-shell/workspace-host.js#L311-L380
[workspace-routes]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/atria-shell/workspace-host.js#L571-L608
[utility-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/atria-shell/utility-workspaces.js#L173-L182
[settings-save]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/script.js#L16030-L16050
[extension-reload]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions.js#L476-L502
[settings-patch]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/src/endpoints/settings.js#L306-L338
[language-device]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/i18n.js#L345-L368
[connection-fields]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions/connection-manager/index.js#L52-L99
[connection-apply]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions/connection-manager/index.js#L719-L797
[profile-resolver]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/extensions/connection-manager/profile-resolver.js#L178-L215
[native-context]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/native/context-compiler.js#L755
[native-context-call]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/script.js#L7943
[prepared-context]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/lib/agent-runtime/prepared-context.js#L10
[native-projection]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/native/session-projection.js#L134-L145
[native-persist]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/public/scripts/openai.js#L479-L482
[test-pure]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/generate-task/pure.test.js#L1
[test-cache]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/connection-manager/gemini-cache-profile.test.js#L1
[test-resolver]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/orchestrator-agent-preset-resolver/unit.test.js#L1
[test-context]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/agent-runtime/prepared-context.test.js#L1
[test-integration]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/generate-task/integration.test.js#L1
[test-workspace]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/agent-runtime/workspace-presets.test.js#L1
[test-dirty]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/character-presets/openai-has-unsaved-changes.test.js#L27
[test-dispatch]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/character-presets/save-dispatch.test.js#L1
[test-injections]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/prompt-injections.test.js#L1
[test-native]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/native/context-compiler.test.js#L1
[test-utility]: https://github.com/ZZZdragondYNGPHX/Atria/blob/fd9a493c9040b32f4892bd92531030e58b066244/tests/atria-shell/utility-workspaces.test.js#L1
