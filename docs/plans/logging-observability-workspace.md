
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
- startup list/detail/compare；
- permission；
- redaction；
- 全部 caller 切换后删除旧 viewer-only logs endpoint。

### L06 Workspace UI

- 从 user.js 抽离；
- module-first list；
- filter/detail；
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
