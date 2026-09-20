
# Atria Logging Observability Workspace Refactor

Status: implementation-ready

Branch: refactor/logging-observability-workspace

Base: main@148950dec7a8ab63229bd1f3c616f82438d165f4

## 1. 目标

把当前“后端日志 / 前端日志 + 大文本框”的查看方式，重构为模块化、结构化的 Atria 日志工作台，并新增独立的“启动分析”窗口。

最终用户不需要再把整份混合后端日志发给开发者，而可以直接：

- 选择具体模块；
- 查看错误/警告；
- 按 correlation ID 跟踪一次请求或生成；
- 选择某次启动；
- 从扇形图直接看到耗时占比；
- 仅导出相关模块、启动会话或请求链。

本任务只改 Atria 自有日志/诊断体系，不重构无关业务。

## 2. 当前问题

当前实现存在多个独立来源：

- src/log-capture.js：后端 5000 条内存环形缓冲，供日志 UI 查询；
- src/server-main.js 中另有 backendLogBuffer：另一套 500 条后端缓冲，专供 Debug Export；
- public/scripts/frontend-log-manager.js：前端 3000 条 console/fetch/error buffer；
- Request Inspector：独立请求生命周期数据；
- /api/startup/client-timing：启动 timing 只被打印成 JSON；
- public/scripts/user.js：日志 UI 主要是 Server / Frontend 选择器 + readonly textarea。

问题：

1. 后端存在两套 source of truth；
2. Server / Frontend 粒度太粗；
3. 启动数据只能人工读 JSON；
4. 业务模块无法直接筛选；
5. 大量 UI 逻辑塞在 user.js；
6. 故障报告经常需要整份日志；
7. 无法方便关联一次 generation / orchestration / request。

## 3. 核心数据模型

Atria 自有日志统一使用结构化 LogEntry，字段至少包括：

- id
- timestamp
- side: backend / frontend
- level: trace / debug / log / info / warn / error
- module
- category
- event
- message
- data
- correlation
  - requestId
  - generationId
  - orchestrationRunId
  - startupSessionId
  - operationId
- source
  - structured
  - console
  - fetch
  - window-error
  - promise-rejection
  - third-party

Atria 新代码必须显式提供 module。

第三方/上游继续允许 console.*，通过 compatibility adapter 捕获，不要求修改第三方代码。

## 3.1 产品假设：默认用户不具备可靠的故障判断能力

日志工作台必须按“非技术用户也能正确提交诊断信息”的标准设计。

系统默认假设用户可能出现以下行为：

- 把症状当原因，例如看到“网络错误”就认定是网络问题；
- 把第三方扩展异常当成 Atria 核心异常；
- 把 Atria API 边界捕获到的异常误认为是 Atria 抛出的；
- 只复制最后一行错误，遗漏前面的真正原因；
- 忘记说明使用的模型、预设、扩展版本、分支、设备环境；
- 在排障过程中继续修改配置、切换模型、重试、启停扩展，导致现场发生变化；
- 不理解 request ID、generation ID、run ID 等技术概念；
- 在日志中看到大量正常 debug 信息后自行得出错误结论；
- 复制过多无关日志，或者复制过少关键日志；
- 在不知道后果的情况下清空日志、重置设置或关闭扩展。

因此本项目的设计原则是：

1. 不要求用户自己识别根因。
2. 不要求用户自己决定该复制哪几十行。
3. 不把原始日志作为普通用户的默认入口。
4. 系统自动保存必要上下文、关联 ID、阶段、模块和环境。
5. 系统自动生成可直接交给开发者的诊断摘要。
6. 所有“疑似来源”必须有证据，不做武断归责。
7. 专家用户仍然可以进入原始日志视图，但这是二级能力。
8. 诊断操作尽量只读；清空、重置等破坏现场的操作必须降级展示并二次确认。
9. 如果现场已经被用户操作改变，诊断包要明确记录“问题发生后又发生了哪些操作”。

## 3.2 Diagnostic Incident：故障事件

新增一等公民 Diagnostic Incident。

普通用户遇到问题后，工作台首先展示“故障事件”，而不是让用户面对数千条日志。

Incident 至少包含：

- incidentId
- createdAt
- type
- severity
- status
- primaryModule
- summary
- primaryFailure
- stage
- causeChain
- correlation IDs
- related log entry IDs
- relevant request-inspector entry IDs
- startup session ID
- environment snapshot
- extension/plugin provenance
- recent user actions
- safe configuration snapshot
- ownership attribution
- evidence list

典型 Incident 类型至少包括：

- startup_failure
- generation_failure
- orchestration_failure
- agent_failure
- tool_failure
- network_failure
- extension_install_failure
- extension_update_failure
- extension_runtime_failure
- plugin_runtime_failure
- storage_failure
- sync_failure
- websocket_failure
- unhandled_frontend_error
- unhandled_backend_error

Incident 必须是结构化对象，而不是把若干日志拼成一段字符串。

## 3.3 Incident 自动生成

以下事件应能够自动形成或更新 Incident：

- uncaught exception；
- unhandled rejection；
- generation 最终失败；
- orchestrator run 最终失败；
- agent retry/fallback 全部耗尽；
- tool 调用失败或 schema validation 失败；
- extension 安装/更新失败；
- extension runtime error；
- plugin runtime error；
- storage write/read/migration 失败；
- sync/backup 失败；
- websocket 异常中断；
- startup 阶段失败；
- 连续重试后仍失败的网络请求。

Incident 聚合优先使用真实 correlation ID、operation ID 和时间窗，不依赖文本关键字猜测。

## 3.4 Ownership Attribution：来源与责任边界

为了处理“用户认为是 Atria，但实际是第三方插件或外部服务”的场景，Incident 必须包含 ownership attribution。

owner 类型至少包括：

- atria
- sillytavern-upstream
- third-party-extension
- server-plugin
- external-service
- network-environment
- local-environment
- user-configuration
- unknown

Attribution 不是“自动甩锅系统”，而是证据化判断。

必须展示：

- probableOwner
- ownerName
- confidence
- evidence[]

证据示例：

- exception throw site 位于 public/scripts/extensions/third-party/<name>/...
- 首个非框架 stack frame 位于第三方扩展；
- Atria 仅在 extension boundary 捕获该异常；
- Atria-owned stack 中没有先行错误；
- upstream API 返回明确的 401/429/5xx；
- DNS/TLS/connect 阶段失败，尚未进入 Atria 业务处理；
- Atria 自有函数主动抛出 contract/schema/storage 错误；
- 插件调用 Atria API 后在 Atria-owned implementation 内失败。

UI 文案使用“疑似来源”“证据指向”，避免使用无证据的“就是某某的错”。

## 3.5 Stack frame 所属关系

新增 stack ownership classifier。

根据路径和模块映射 frame：

- Atria 自有代码；
- SillyTavern upstream；
- third-party extension；
- server plugin；
- browser/runtime；
- external library；
- unknown。

Incident 中记录：

- throw frame；
- first application frame；
- first Atria frame；
- first third-party frame。

即使第三方异常最终由 Atria 的 catch/logging boundary 输出，也应能识别真正的 throw site。

## 3.6 扩展 / 插件 Provenance

发生扩展或插件相关故障时，诊断包自动加入安全的 provenance：

- extension/plugin name
- display name
- type: system/local/global/server-plugin
- version
- commit/revision（可得时）
- origin repository/host（脱敏后）
- loading_order
- enabled/disabled
- manifest minimum version
- dependencies
- install/update operation ID

这样插件故障可以直接交给插件作者复现，而不需要用户自己去找版本号。

## 3.7 Recent User Actions：最近操作轨迹

新增轻量、脱敏的用户操作轨迹，用于解释“刚才还能用，点了某个东西后坏了”。

只记录结构化动作，不记录聊天正文、密码、API key 等内容。

优先覆盖：

- 切换模型/连接配置；
- 切换预设；
- 启停扩展；
- 安装/更新/删除扩展；
- 导入/恢复配置；
- 开始/停止 orchestrator；
- 手动中断生成；
- 切换角色/聊天；
- 修改与当前故障模块直接相关的设置；
- 执行同步/恢复/迁移；
- 清空日志或重置诊断状态。

Incident 中记录“故障前 N 条”和“故障后 N 条”相关操作。

## 3.8 Safe Configuration Snapshot

Incident 自动附带最小必要配置快照。

只保存诊断需要且安全的字段，例如：

- Atria revision/version；
- 当前分支；
- 当前模型名；
- provider 类型；
- 当前 orchestration profile 名称；
- 关键 feature toggle；
- storage backend；
- 已启用扩展名称和版本；
- 网络/代理模式的非敏感状态；
- Android/desktop/browser 基本环境。

密钥、完整 endpoint credential、prompt/chat 正文等必须脱敏或省略。

如果用户在问题发生后修改了相关配置，应保留 incident-time snapshot，而不是只读取当前值。


## 4. 模块维度

后端初始模块：

- startup
- http
- websocket
- auth
- storage
- sync
- backup
- generation
- dispatch
- orchestrator
- memory
- worldbook
- extensions
- plugins
- request-inspector
- system
- uncategorized

前端初始模块：

- startup
- ui
- network
- generation
- extensions
- orchestrator
- memory
- worldbook
- regex
- editor
- studio
- storage
- settings
- system
- uncategorized

模块表必须是 registry，不做散落 switch。

## 5. 后端日志架构

建议拆分为独立 logging package：

- src/logging/logger.js
- src/logging/store.js
- src/logging/query.js
- src/logging/redact.js
- src/logging/modules.js
- src/logging/console-adapter.js
- src/logging/startup-store.js

要求：

- 只保留一个 canonical backend log store；
- 移除 server-main.js 的 backendLogBuffer；
- src/log-capture.js 的能力迁入统一 logging package；
- console wrapper 只能有一层；
- Debug Export 与日志工作台读取同一个 store；
- 不为每个模块复制一份数组；
- 保持 bounded ring；
- log capture 永远不能把异常反抛给业务代码。

Atria 自有模块通过 createLogger(module) 写 structured log，不再依赖消息前缀。

## 6. 前端日志架构

把 frontend-log-manager.js 拆成：

- public/scripts/logging/logger.js
- public/scripts/logging/store.js
- public/scripts/logging/query.js
- public/scripts/logging/modules.js
- public/scripts/logging/console-adapter.js
- public/scripts/logging/fetch-adapter.js
- public/scripts/logging/error-adapter.js

Atria 自有前端模块使用 createLogger(module)。

保留：

- console 捕获；
- fetch 摘要；
- window error；
- unhandled rejection；
- 第三方扩展 console fallback。

前缀识别只用于 legacy fallback，不作为新体系主路径。

## 7. 查询 API

新的 diagnostics API 建议：

- POST /api/diagnostics/logs/query
- POST /api/diagnostics/logs/clear
- GET /api/diagnostics/logs/modules
- GET /api/diagnostics/startup/sessions
- GET /api/diagnostics/startup/session/:id
- POST /api/diagnostics/startup/compare

日志查询支持：

- backend/frontend；
- module(s)；
- category/event；
- level(s)；
- start/end time；
- sinceId；
- free text；
- correlation ID；
- limit。

返回结构化 entry，不返回拼好的大文本。

权限：

- 多账号开启时，backend logs 保持 admin-only；
- frontend logs 属于当前浏览器/用户；
- startup client session 不允许非管理员跨用户读取；
- accounts-disabled 保持单用户便利性。

## 8. 启动会话

启动 timing 变成 first-class diagnostic object，不再只 console.log JSON。

StartupSession 至少包含：

- id
- serverBootId
- user
- createdAt
- appVersion
- revision
- device/runtime 信息
- server phases
- client timings / durations / navigation
- extensions 列表
  - name
  - totalMs
  - localeMs
  - scriptMs
  - styleMs
  - hookMs
- linkedLogWindow

只持久化 compact summary，不持久化整份 raw log。

默认保留最近 20 次完整 client startup session，超出滚动清理。

## 9. 日志工作台 UI

不要继续把日志 UI 放在 user.js。

拆成独立 Logs Workspace。

主视图：

- 实时日志
- 启动分析

### Desktop

三栏：

1. 模块导航 / 错误计数；
2. 日志列表；
3. 选中 entry 的 structured detail。

### Mobile

单栏 drill-down：

- 顶部过滤栏；
- module chips / drawer；
- log list；
- 点击 entry 打开 detail sheet。

禁止把桌面三栏硬压到手机宽度。

### 日志条目

默认行展示：

- 时间；
- level；
- backend/frontend badge；
- module；
- message；
- event/category；
- correlation marker。

展开后显示：

- structured data；
- correlation IDs；
- source 信息。

### Filter

必须有：

- module；
- side；
- level；
- 时间；
- 搜索；
- correlation；
- errors-only shortcut。

模块导航显示 warn/error 数量，让用户一眼知道哪个系统异常。

## 10. 启动分析窗口

在 Logs Workspace 中单独增加“启动分析”。

### 10.1 会话选择

顶部展示：

- 启动时间；
- revision；
- device/runtime；
- server startup 总耗时；
- client startup 总耗时；
- 最近 startup session selector；
- 与上一轮比较。

### 10.2 扇形图 / donut chart

使用轻量 SVG，自行绘制，不引入 Chart.js / ECharts。

提供 scope：

- 服务端
- 客户端
- 扩展

扇形必须使用互不重叠的时段，禁止把父级 duration 与其子级同时计入导致超过 100%。

服务端示例：

- module evaluation
- bootstrap init
- pre-setup
- listening preparation

客户端示例：

- HTML / classic-script gap
- init/import
- bootstrap/settings
- visible → batch1
- batch2
- batch3/ready

扩展示例：

- 每个 extension activation total；
- 小项可合并为“其他”。

每个 slice：

- 名称；
- ms；
- 百分比；
- hover/tap 高亮；
- legend 同步；
- 无障碍文本。

### 10.3 慢项榜

图表下显示：

- 最慢 phase；
- 最慢 extension；
- extension 的 script/style/locale/hook 分解；
- 相比上一 startup session 的增减。

### 10.4 Timeline

再提供轻量 waterfall/timeline。

Pie 回答“占比”，timeline 回答“顺序”。

## 11. Correlation

尽量复用真实 ID：

- Request Inspector request ID；
- atri_generation_id；
- orchestrator run ID；
- startup session ID；
- storage/sync operation ID。

目标是支持“只看这次失败生成相关的所有日志”。

有真实 ID 时禁止依赖 message string 猜关联。

## 11.1 故障事件中心

Logs Workspace 增加默认首页“故障事件”。

普通用户打开日志工作台时优先看到：

- 最近发生的错误；
- 当前未解决 Incident；
- 每个 Incident 的模块、严重程度、时间、简短说明；
- 疑似来源；
- 一键“复制故障摘要”；
- 一键“复制完整故障上下文”；
- “查看相关日志”；
- “查看请求链”；
- “查看启动会话”（如果相关）。

原始实时日志放到二级标签，不作为普通用户默认首页。

## 11.2 “我刚遇到问题”按钮

提供显眼但只读安全的“我刚遇到问题”操作。

用户点击后：

1. 记录当前时间；
2. 查询最近几分钟内的 error/warn；
3. 关联最近 generation/orchestration/request/extension operation；
4. 关联最近用户操作；
5. 关联当前环境与安全配置快照；
6. 自动生成临时 Incident；
7. 展示候选故障事件供用户选择。

即使应用没有自动识别到 fatal error，也能为“功能不对但没抛异常”的场景保存现场。

## 11.3 一键复制诊断包

每个 Incident 至少提供两种复制格式。

### 简洁摘要

用于聊天或 Issue 首次报告，内容包括：

- Atria version/revision
- incident ID
- 时间
- 模块
- 故障类型
- 当前 stage
- primary error
- probable owner
- ownership confidence
- 关键 evidence
- cause chain
- correlation IDs
- 最相关 5-20 条日志
- 关键环境字段

### 完整故障上下文

在摘要基础上增加：

- structured log entries
- stack frames + ownership
- Request Inspector 关联记录摘要
- extension/plugin provenance
- recent actions
- safe config snapshot
- retry/fallback history
- relevant startup session
- timeline

复制内容使用稳定、机器可读又可读的文本/JSON 混合格式，方便直接粘贴给 ChatGPT/Codex/开发者分析。

禁止要求用户自己选择“从哪一行复制到哪一行”。

## 11.4 Guided Mode 与 Expert Mode

默认 Guided Mode：

- 以 Incident 为中心；
- 用自然语言描述；
- 默认隐藏低价值 debug 噪音；
- 提供“复制诊断包”；
- 提供证据化来源提示；
- 清空日志等破坏现场的操作放入更多菜单并二次确认。

Expert Mode：

- 原始 structured logs；
- 完整 filter；
- timeline；
- request/correlation IDs；
- raw JSON；
- 高级导出。

切换模式不改变底层日志，只改变展示层。

## 11.5 系统健康概览

工作台顶部提供轻量 Health Summary：

- Startup
- Network
- Generation
- Orchestrator
- Memory
- Worldbook
- Extensions
- Storage
- Sync
- WebSocket

每个模块显示：

- 正常 / 有警告 / 有错误；
- 最近错误时间；
- 未解决 Incident 数量。

这不是主观健康评分，而是当前日志/Incident 状态的摘要。


## 12. 导出

支持：

- 当前筛选结果；
- 单模块；
- 单次 startup session；
- correlation chain；
- 选中条目；
- 完整 Debug Bundle。

Debug Bundle 必须读取 canonical stores，不再维护独立 backend buffer。

所有出口统一经过 redaction。

## 12.1 专项故障链：智能体编排

Orchestrator Incident 应尽可能生成完整阶段链：

- run started
- profile resolved
- agent selected
- round
- provider/model
- request
- tool call
- tool result
- schema validation
- retry
- fallback
- finalizer
- persistence
- abort/failure

发生失败时诊断摘要应直接回答：

- 哪个 agent；
- 第几轮；
- 哪个模型/provider；
- 哪个 tool；
- 是否发生 fallback；
- fallback 到谁；
- 原始错误与最终错误；
- retry 次数；
- 是否为 schema / network / model / tool / persistence 问题。

## 12.2 专项故障链：扩展安装/更新

Extension install/update Incident 拆分 stage：

- validate URL
- resolve repository
- DNS
- connect
- TLS
- git fetch/clone
- checkout
- filesystem write
- manifest read
- manifest validation
- dependency validation
- enable/activate

“网络错误”不能只留下一个笼统字符串。

诊断包应能区分：

- DNS 失败；
- TLS 失败；
- ECONNRESET；
- GitHub/远端不可达；
- HTTP 401/403/404/429/5xx；
- git clone/fetch 失败；
- checkout 失败；
- 本地文件权限问题；
- manifest 格式错误；
- Atria extension contract 错误。

## 12.3 专项故障链：第三方扩展运行时

第三方 extension runtime Incident 至少包含：

- extension provenance；
- exception stack；
- throw frame owner；
- Atria boundary frame；
- extension activation/runtime stage；
- 相关 user action；
- 是否为 Atria API contract failure；
- 是否能在禁用该扩展后消失（如果已有明确实验记录）。

目标是让开发者能快速区分：

1. 第三方扩展自身抛错；
2. Atria extension API 实现错误；
3. 双方 contract 不匹配；
4. 外部 API/网络错误；
5. 用户配置错误。

## 12.4 专项故障链：Generation

Generation Incident 至少记录 stage：

- payload build
- route/provider selection
- auth
- connection
- upstream request
- streaming
- response parse
- tool parse
- post-processing
- persistence
- UI delivery

并关联 Request Inspector 与 atri_generation_id。

## 12.5 专项故障链：Storage / Sync / Backup

记录：

- operation ID；
- storage backend；
- source/target；
- read/write phase；
- conflict/lock；
- retry；
- rollback；
- final state。

避免用户只看到“恢复失败”而不知道是压缩包解析、文件写入、schema、锁还是网络同步失败。


## 13. 隐私与安全

中央 redaction 至少覆盖：

- API key；
- Authorization；
- cookie/session；
- CSRF；
- password；
- OAuth token；
- bearer/JWT；
- 长 token/secret。

默认不把完整 prompt/chat content 放进通用 structured data。

## 13.1 防误操作设计

日志工作台默认是诊断工具，不是修复工具。

要求：

- “清空全部日志”放入次级菜单；
- 清空前提示会丢失当前故障现场；
- Incident 一旦生成，其摘要在 retention 期内不因清空实时日志立即消失；
- 不提供没有 rollback 的“一键修复所有问题”；
- 不根据一条 error 自动禁用扩展；
- 不根据归因结果自动删除/重装插件；
- 所有可能改变现场的动作都要与“复制诊断包”分开；
- 用户进行可能破坏现场的操作前，若存在未导出的高严重度 Incident，提示先保存诊断信息。

## 13.2 对用户解释而非要求用户解释

每个 Incident 展示三层信息：

第一层：发生了什么
- 例如“智能体 continuity_critic 第 3 轮工具调用失败”。

第二层：证据指向哪里
- 例如“异常首先在第三方扩展 chami_tavern-scene-plugin 内抛出”。

第三层：给开发者的信息
- 一键复制完整结构化上下文。

避免 UI 使用需要用户自行理解的术语堆砌。


## 14. 性能要求

日志重构不能成为新的性能问题。

要求：

- 无新重型图表依赖；
- Startup Analysis 懒加载；
- 单一 bounded ring；
- 不重复保存同一日志到多个 module buffer；
- sinceId 增量查询；
- 大日志列表使用 virtualization/windowing；
- auto-refresh 不整表重绘；
- Android 下图表和列表保持流畅；
- 正常启动不加载启动分析 UI 的重资源。

## 15. 实施阶段

### L01 Foundation

- structured envelope；
- backend/frontend logger；
- store/query/redaction；
- module registry；
- ownership registry / stack classifier；
- Incident schema/store/aggregator；
- recent user actions store；
- safe config snapshot；
- retention/filter 单测。

### L02 Backend consolidation

- 统一 backend store；
- 删除 duplicate backendLogBuffer；
- Debug Export 切换 canonical store；
- console compatibility adapter；
- 优先迁 startup/http/ws/generation/storage。

### L03 Frontend consolidation

- 拆 console/fetch/error adapters；
- frontend module logger；
- 迁 startup/network/UI；
- 保留 third-party fallback。

### L04 Startup diagnostics store

- server boot ID；
- server phase summary；
- client timing session；
- extension breakdown；
- recent-session bounded persistence。

### L05 Diagnostics API

- logs query / clear / modules；
- incident list/detail/create-from-recent/export；
- startup list/detail/compare；
- ownership/provenance；
- permission；
- redaction；
- 全部 caller 切换后删除旧 viewer-only logs endpoint。

### L06 Workspace UI

- 从 user.js 抽离；
- Incident-first Guided Mode；
- Expert Mode；
- “我刚遇到问题”；
- module health summary；
- module-first list；
- filter/detail；
- 一键复制故障摘要/完整上下文；
- desktop/mobile layout；
- incremental refresh；
- virtualization。

### L07 Startup Analysis UI

- SVG donut；
- scope selector；
- recent sessions；
- slow list；
- extension phase breakdown；
- compare mode；
- timeline。

### L08 Atria module migration

同时为高价值故障补齐 stage、correlation、ownership 与 Incident 触发点。

优先迁：

- startup
- ws-delivery
- generation/dispatch
- orchestrator
- memory-graph
- worldbook
- storage
- sync/backup
- extensions/plugins
- editor/studio

无需为了完成本项目而强制改完所有 SillyTavern upstream console。

### L09 Cleanup

- 删除旧重复 helper；
- Debug Export 收口；
- docs；
- residual scan；
- mobile/performance regression。

## 16. 测试

### Unit

- backend/frontend retention；
- module registry；
- normalization；
- query filters；
- correlation；
- redaction；
- startup session normalization/retention；
- pie slice 不重叠；
- 缺失/0 timing 时百分比稳定。

### API

- admin / non-admin；
- startup ownership；
- malformed query；
- limit clamp；
- clear；
- redacted export。

### UI

- module filter；
- error-only；
- incremental refresh；
- detail panel/sheet；
- startup session switch；
- chart/legend；
- compare delta；
- mobile layout。

### Regression

- third-party console 仍被捕获；
- fetch capture；
- global error/rejection；
- Request Inspector 独立；
- Debug Export 内容完整。

### Incident / Attribution

- orchestrator failure 自动形成 Incident；
- tool schema failure cause chain；
- fallback history；
- extension install 各 stage 分类；
- third-party stack ownership；
- Atria boundary 与 third-party throw site 区分；
- external-service/network attribution；
- unknown attribution 不强行归责；
- recent user actions 时间窗；
- safe config snapshot 不泄漏 secret；
- Incident 在实时日志清理后的 retention 行为；
- “我刚遇到问题”生成临时 Incident；
- 简洁/完整诊断包格式稳定。

### 场景验收

必须建立至少三组端到端 fixture：

A. 智能体编排失败：
用户无需理解 agent/tool/fallback，只复制 Incident，即能得到 agent、round、model/provider、tool、retry/fallback、最终失败 stage。

B. 扩展安装显示网络错误：
诊断包必须能区分 DNS/TLS/connect/git/HTTP/manifest/filesystem 等真实失败阶段，不能只返回“Network Error”。

C. 第三方插件运行异常：
诊断包必须包含插件 provenance、stack ownership 和证据，能够区分第三方插件自身异常与 Atria API implementation 异常。


### Performance

用 3000/5000 entries 验证：

- 搜索不冻结；
- 打开 Logs Workspace 不阻塞主界面；
- Startup Analysis 资源按需加载。

## 17. 完成标准

1. Logs UI 以 module 为核心，不再只是 Server / Frontend。
2. 存在独立 Startup Analysis。
3. Startup Analysis 有交互式 SVG 扇形/环图。
4. 可切 server/client/extensions scope。
5. 可查询并比较最近 startup sessions。
6. extension 能显示 script/style/locale/hook 耗时。
7. 后端只有一个 canonical log store。
8. 前端 logging 从 monolith 拆分。
9. Atria 核心模块使用 structured logger。
10. third-party/upstream console fallback 不破坏。
11. 可只导出相关模块/session/correlation。
12. Debug Export 使用 canonical stores。
13. 手机 UI 是专门设计，而不是压缩桌面版。
14. 不引入重型图表依赖。
15. Lint、完整单测、相关前端测试、移动端回归全部通过。

16. 默认 Guided Mode 不要求普通用户理解原始日志。
17. 自动形成 Diagnostic Incident。
18. Incident 能保存 cause chain、correlation、recent actions、safe config snapshot。
19. 支持证据化 ownership attribution。
20. 第三方扩展异常能标识 extension name/version/origin/stack owner。
21. 扩展安装失败能定位到 DNS/TLS/git/manifest 等具体 stage。
22. Orchestrator 失败能定位 agent/round/model/tool/fallback。
23. 提供“我刚遇到问题”现场捕获入口。
24. 提供“一键复制故障摘要”和“一键复制完整故障上下文”。
25. 日志清空不会立刻破坏已形成 Incident 的核心摘要。
26. 高风险/破坏现场操作必须二次确认。
27. A/B/C 三类真实场景通过端到端验收。


## 18. 实施规则

- 直接按本企划实施，不重新讨论产品方案。
- 不误改 SillyTavern 上游接口。
- Atria 自有代码优先结构化 logger，不靠字符串前缀。
- compatibility adapter 只服务 upstream/third-party。
- 日志只能有一个 source of truth。
- 不把完整工作台重新塞回 user.js。
- 不再用一个大 textarea 渲染所有日志。
- 启动分析读取结构化 startup session，不解析 raw log。
- 不引入 Chart.js/ECharts。
- Android/mobile performance 属于硬性验收项。

## 19. 最终用户工作流

普通故障：

1. 打开日志工作台；
2. 看哪个模块出现 warn/error；
3. 选模块/correlation；
4. 导出相关条目。

启动故障：

1. 打开启动分析；
2. 选最新 startup session；
3. 看扇形图与慢项榜；
4. 点开最慢 phase/module；
5. 仍需开发者帮助时，只导出这一启动会话。

目标：以后不再需要为了定位一个模块问题而粘贴整份混合日志。

## 20. 三类目标用户场景

### 用户 A：智能体编排出错

用户看到“编排失败”，打开工作台。

正确体验：

1. 首页直接出现 Orchestration Incident；
2. 用户无需筛日志；
3. 点“复制故障摘要”；
4. 摘要已经包含 agent、round、provider、model、tool、schema、retry、fallback、request ID、run ID；
5. 开发者拿到后可以直接定位到对应执行链。

### 用户 B：安装扩展时显示网络错误

正确体验：

1. 首页出现 Extension Install Incident；
2. Incident 展示失败 stage；
3. 如果真正失败于 git fetch，则展示 remote/connect 错误；
4. 如果网络成功但 manifest validation 失败，则明确显示“网络阶段成功，失败于 manifest”；
5. 用户复制诊断包即可，不需要提供完整 server log。

### 用户 C：第三方插件运行出错但怀疑 Atria

正确体验：

1. 首页出现 Extension Runtime Incident；
2. 显示疑似来源：第三方扩展；
3. 显示 extension name/version/origin；
4. 显示 throw frame 与 Atria boundary frame；
5. 显示归因证据；
6. 如果证据指向插件本身，开发者可以明确建议联系插件作者；
7. 如果真正失败于 Atria-owned API implementation，则归因仍应指向 Atria，而不是因为调用者是插件就错误归责。

这三类场景属于本项目的核心产品验收，不是可选增强。

## 21. 诊断包的目标质量

最终复制出的诊断信息必须达到：

- 无需用户补充“你用的什么版本”；
- 无需用户解释“我刚才点了什么”；
- 无需用户再截取前后几十行日志；
- 无需用户自己判断是网络、Atria 还是插件；
- 开发者能从单个 Incident 直接看到最可能的故障链；
- 如果仍无法确认，诊断包也应明确指出“缺少什么证据”，而不是伪造结论。



## 22. 实施状态

截至 2026-09-20，refactor/logging-observability-workspace 已按本企划完成 L01–L09 代码实施。

完成项：

- L01 structured logging / redaction / ownership / Incident foundation；
- L02 backend canonical store consolidation；
- L03 frontend logging split + adapters；
- L04 StartupSession store；
- L05 Diagnostics API；
- L06 Incident-first Diagnostics Workspace；
- L07 Startup Analysis；
- L08 高价值 Atria 模块迁移与 A/B/C 场景诊断；
- L09 canonical cleanup、Debug Export 收口、文档与 mobile/performance regression。

最终结构约束：

- backend 只有一个 canonical log store；
- frontend-log-manager.js 只保留第三方/上游兼容 shim；
- Atria 自有调用直接走 public/scripts/logging；
- backend 旧 src/log-capture.js 已删除；
- Debug Export 与 Diagnostics 共用 canonical stores，并输出安全化 Request Inspector 元数据；
- 不引入 Chart.js/ECharts；
- Android/Docker 不作为默认验证项。

合并前仍要求最终 CI 全绿。World Info mobile E2E 的历史可见性竞态在 L09 中通过 Entries 切换后的 next-frame virtual render 与测试状态隔离处理。
