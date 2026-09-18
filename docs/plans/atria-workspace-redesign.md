# Atria Agent & Memory Workspace Redesign

> 状态：Implementation / core redesign complete, validation and polish in progress  
> 工作分支：`feat/atria-workspace-redesign`  
> 基线：`main@ed2957eba42fdbd9099eacd15eedf7f94b790fab`  
> 日期：2026-09-18

## 1. 背景

Atria 的 Agent Runtime、Orchestration Engine、Memory OS、Workspace schema 与持久化命名空间已经完成独立产品化和底层 hard cutover。当前工作台虽然已承载新底层，但 UI 仍明显保留开发期/迁移期形态：

- 右侧 1080px Drawer；
- `Presets / Live Run / Graph / Agents / Memory / Diagnostics` 六个同级页签；
- Preset 编辑页将库、绑定、Graph、Agent、Tools、Capabilities、Budget、Raw Plan JSON 纵向堆叠；
- Live Run / Graph / Agents 实际属于同一个运行观察对象，却被拆成三个一级页面；
- Memory 页仍以按钮方式挂载完整 Memory OS Inspector，并继续嵌入旧设置表单；
- 大量 `details + pre(JSON)` 承担产品 UI；
- Trace、Raw Runtime Event、Checkpoint 等工程能力与普通用户操作混在同一层级。

本任务不再做旧 UI 搬运，而是对工作台信息架构、交互层级、视觉系统与响应式布局进行完整产品化重构。

## 2. 产品原则

### 2.1 外层产品化，内层保留专业深度

默认界面优先服务实际使用：

- 能快速选择编排方案；
- 能看懂当前运行发生了什么；
- 能查看和维护长期记忆；
- 能在需要时进入高级诊断。

复杂 Plan、Capabilities、Raw JSON、Trace、Checkpoint 等能力保留，但收进明确的高级层。

### 2.2 Standalone-first

遵循 `docs/development/STANDALONE_FIRST_PRODUCT_POLICY.md`：

- Workspace ViewModel 不依赖 SillyTavern DOM 语义；
- Atria host glue 放 adapter；
- Agent / Plan / Graph / Runtime / Memory provider 保持清晰边界；
- 不为旧 Workspace DOM、旧 Inspector DOM、旧入口形态保留长期兼容；
- 不创建第二套运行状态或第二套 Memory 数据源。

### 2.3 不改底层协议

本任务默认不改变：

- Agent Runtime event contract；
- Orchestration Engine Plan contract；
- Workspace preset schema；
- Memory OS source/state schema；
- Memory provider 接口；
- 当前 `atri_*` 持久化 namespace。

UI 重构应复用既有服务和 ViewModel；需要扩充 UI port 时只增加产品视图需要的只读/明确 action surface。

## 3. 新工作台总结构

产品名称统一显示为 **Atria 工作台**。

桌面端采用近全屏 Workspace；移动端采用全屏 Workspace。

### 3.1 一级导航

仅保留四个一级页面：

1. **编排**
2. **运行**
3. **记忆**
4. **诊断**

旧一级页签映射：

- Presets → 编排
- Live Run + Graph + Agents → 运行
- Memory → 记忆
- Diagnostics → 诊断

### 3.2 桌面布局

```
┌──────────────────────────────────────────────────────────────┐
│ Atria 工作台 | 当前作用域 | 当前绑定/运行状态 | 全局动作 | × │
├────────────┬─────────────────────────────────┬───────────────┤
│ 一级导航   │ 主工作区                        │ 上下文检查器  │
│            │                                 │               │
│ 编排       │ Preset / Run / Memory 主视图    │ Agent / Node  │
│ 运行       │                                 │ Entity / Event│
│ 记忆       │                                 │ 当前选择详情  │
│ 诊断       │                                 │               │
├────────────┴─────────────────────────────────┴───────────────┤
│ 仅在需要时出现的保存/校验/运行状态条                        │
└──────────────────────────────────────────────────────────────┘
```

桌面目标：

- 1024px 以上显示左导航 + 主工作区 + 可折叠 Inspector；
- 中间区域优先给 Graph、Timeline、Memory Graph；
- Inspector 默认宽 320–380px，可隐藏；
- 禁止页面级横向溢出。

### 3.3 移动布局

- 全屏；
- 一级导航降为底部 4 项导航；
- Inspector 变为全屏详情 sheet；
- Graph 使用独立可平移画布；
- 主操作（保存、停止运行等）固定在安全区上方；
- 不通过简单堆叠桌面三栏来“兼容”移动端。

## 4. 编排页

### 4.1 信息架构

桌面三段式：

- 左：Preset Library
- 中：Plan / Agent Graph 或 Agent 列表
- 右：当前 Preset / Agent / Node Inspector

普通模式只暴露高频配置。

### 4.2 Preset Library

显示：

- 搜索；
- 模式筛选；
- Preset 名称；
- 模式标签；
- 当前绑定状态；
- 新建入口。

模式文案继续产品化：

- Spec：固定流程
- Loop：研究循环
- Agenda：动态委派
- Director：直接写作
- Single Agent 作为 Spec 模板，不新增第五种底层 mode。

### 4.3 顶部操作

主操作：

- 新建
- 保存
- 验证

次级操作进入 `⋯`：

- 复制/另存为
- 导入
- 导出
- 重命名
- 删除
- 高级 Plan JSON

危险操作不与保存并列。

### 4.4 Binding

不再显示大量 `Bind as ...` 按钮。

改为作用域控件：

- 默认
- 当前角色
- 当前对话

界面明确展示：

- 当前有效 Preset；
- 来源；
- 当前编辑 Preset 是否为有效绑定；
- 一键应用到对应作用域。

### 4.5 Agent Inspector

分组：

#### 基本
- 名称
- 角色/说明
- Instructions

#### 模型
- API profile
- Prompt preset
- 继承状态

#### 工具
- 搜索
- 分类
- 全部允许
- 全部禁止
- 恢复默认
- 工具状态不再一次性铺满长 checkbox 列表

#### 权限
Capabilities 采用权限矩阵：

- Inherit
- Allow
- Deny

普通模式显示语义化名称；底层 capability key 放 tooltip/高级模式。

#### 高级
- Node ceiling
- raw IDs
- host adapter metadata
- 结构化 Plan 字段

### 4.6 Graph 编辑

Spec / Director / Agenda 可显示可交互 Graph。

普通模式允许：

- 选择节点；
- 添加 Agent；
- 删除可安全删除的 Agent；
- 修改输出 Owner；
- 常用连接操作。

涉及条件边、Join、Router、Judge、Synthesize、Retry bound 等复杂结构时进入高级 Graph 编辑器。

Raw Plan JSON 不作为主要编辑方式。

## 5. 运行页

Live Run、Graph、Agents 合并成一个运行控制台。

### 5.1 顶部状态摘要

展示：

- mode / status / duration；
- Agent 数；
- 内部调用；
- Tool 调用；
- Token；
- Memory recall；
- 当前并发；
- 当前输出 Owner。

`Stop Run` 仅在运行中显示。

### 5.2 二级视图

运行页内部切换：

- 图谱
- 时间线

不是一级 Workspace 导航。

### 5.3 Graph

节点状态视觉化：

- running
- waiting
- completed
- failed
- cancelled
- pending

突出：

- entry；
- active；
- output owner；
- delegated/dynamic nodes。

点击节点在右侧 Inspector 展示：

- Agent；
- 当前任务；
- 模型；
- Tool calls；
- Token；
- Memory evidence；
- Result；
- attempts；
- capability summary。

### 5.4 Timeline

按语义而非 raw event type 展示：

- 开始
- 委派
- handoff
- model call
- tool call
- memory recall
- join
- arbitration
- output
- failure/recovery

Raw event JSON 仅诊断页可见。

## 6. 记忆页

删除当前必须点击 **Knowledge · Sources · Build & Maintenance** 才进入 Memory OS 的中间按钮。

进入记忆页即进入 Memory Workspace。

二级导航：

1. 概览
2. 知识
3. 来源
4. 维护

### 6.1 概览

状态卡：

- Memory OS enabled
- extraction enabled
- recall enabled
- persistent injection
- entities
- relations
- facts
- pending/disputed
- latest extraction
- current chat coverage

常用开关保留产品化卡片：

- 自动提取
- 自动召回
- 持久注入
- 世界书参与
- 向量检索（根据 recall method 呈现）

### 6.2 知识

将现有 `graph-inspector.js` 的能力拆成 Workspace 原生 View：

左侧/顶部筛选：

- 搜索；
- 实体类型；
- 关系类型；
- 当前/历史；
- 局部深度。

中间：

- Cytoscape Memory Graph；
- list fallback。

右 Inspector：

- Entity / Relation / Fact 详情；
- alias；
- relations；
- source evidence；
- 当前 Run 使用者；
- audit/correction metadata。

### 6.3 来源

Provider / provenance 成为一级产品概念。

展示：

- Chat
- Manual correction
- LoreState
- MVU
- 未来 provider

可从来源追到：

Source → Episode → Fact → Entity / Relation → Recall / Agent use。

### 6.4 维护

集中原有维护动作：

- 历史构建 / 回滚
- Fill
- Rebuild
- Rebuild Recent
- Manual Compression
- Vector Recompute
- Import
- Export
- Schema Editor
- AI Iterate Schema

危险区域：

- Reset Chat Memory

重建类操作必须明确影响范围、预计操作对象和不可逆性。

### 6.5 Memory 设置分层

普通设置：

- Enable
- Extract
- Recall
- Recall method
- Update interval
- API / Prompt profiles

高级设置：

- Injection placement
- query rewrite / rerank
- vector Top-K / quotas
- schema
- compression
- provider inclusion
- advanced prompt / iteration AI
- raw advanced fields

不再把所有字段默认展开。

## 7. 诊断页

面向高级用户/开发者。

集中：

- Runtime event trace
- Trace import
- Trace export
- Checkpoint / recovery
- Context sources
- Token budgets
- ResultEnvelope
- Engine projection
- Plan JSON
- Memory diagnostics
- raw IDs / versions / generation
- replay mode

全局 Header 不再常驻 Export Trace。

## 8. 全局 Header

显示：

- Atria 工作台
- 当前角色/当前对话作用域
- 当前编排开关
- 当前有效 Preset
- 运行状态（如有）
- `⋯`
- Close

运行中的 Stop 进入运行状态区域，不长期占位。

## 9. 组件系统

新增/重构 Workspace 原生组件：

- WorkspaceShell
- WorkspaceNav
- WorkspaceHeader
- WorkspaceInspector
- WorkspaceToolbar
- WorkspaceStatusCard
- WorkspaceMetric
- PresetList
- PlanCanvas
- AgentCard / AgentInspector
- ToolPermissionPanel
- CapabilityMatrix
- RunSummary
- RunGraph
- RunTimeline
- MemoryOverview
- MemoryKnowledgeView
- MemorySourceView
- MemoryMaintenance
- EmptyState
- DangerZone

当前代码可以继续使用 vanilla DOM module，不强制引入框架；重点是职责拆分，不再将整个工作台集中在一个 `panel.js`。

## 10. 视觉系统

Workspace 自有 token，但继续继承 SillyTavern theme：

- `--atri-workspace-bg`
- `--atri-workspace-surface-1`
- `--atri-workspace-surface-2`
- `--atri-workspace-border`
- `--atri-workspace-accent`
- `--atri-workspace-success`
- `--atri-workspace-warning`
- `--atri-workspace-danger`
- spacing / radius / elevation / typography tokens

风格：

- 暗色半透明；
- 更少边框；
- 更明显的空间层级；
- 状态色只表示状态；
- 主色只表示选择/主操作；
- 禁止所有 `details`、按钮、卡片拥有相同视觉权重。

## 11. 删除 / 降级的旧 UI

删除作为主要产品控件的：

- 六个旧顶级 tabs
- `Knowledge · Sources · Build & Maintenance`
- `Preset Graph · compiled preview`
- `Preset Graph · visual`
- `Advanced Plan structure editor`
- `Delete and clear its bindings`
- Node 卡片里的重复 `This node's Memory` / `Diagnostics`
- 全局 `Export Trace`
- 大量直接展示 raw JSON 的 `details + pre`

功能分别迁移到新一级/二级页面或高级区。

## 12. 模块拆分目标

现有：

- `workspace/panel.js`
- `workspace/authoring.js`
- `workspace/memory.js`
- `workspace/panel.css`

逐步拆为：

```
workspace/
  shell.js
  navigation.js
  inspector.js
  ui.js
  styles/
    tokens.css
    shell.css
    controls.css
    responsive.css
  orchestration/
    page.js
    library.js
    plan-view.js
    agent-inspector.js
    permissions.js
  runtime/
    page.js
    summary.js
    graph.js
    timeline.js
    node-inspector.js
  memory/
    page.js
    overview.js
    knowledge.js
    sources.js
    maintenance.js
  diagnostics/
    page.js
```

实际落地允许根据依赖关系合并小模块，避免人为碎片化。

## 当前实施进度

- Phase 1 — Workspace Shell：完成
- Phase 2 — Orchestration Authoring：主体完成，进入交互/响应式验证
- Phase 3 — Runtime Console：完成
- Phase 4 — Memory Workspace：主体完成；高频 Maintenance 已原生化，高级参数仍通过 advanced adapter 承载
- Phase 5 — Diagnostics + Cleanup：Diagnostics 已产品化，正在进行浏览器 smoke、i18n、旧 CSS/入口清理

当前验证：
- Atria PR Checks 持续运行；
- 新增 Workspace UI Chromium smoke workflow；
- 重点覆盖移动端 Inspector、四入口导航、Run graph/timeline、Memory 原生视图、overflow 与 teardown。

## 13. 实施阶段

### Phase 1 — Workspace Shell
- 新近全屏 shell；
- 四个一级导航；
- Inspector 容器；
- 响应式骨架；
- 旧 view 先通过 adapter 挂到新 shell；
- 保持底层逻辑不变。

### Phase 2 — Orchestration Authoring
- Preset Library 重做；
- Binding UX；
- Plan / Agent 主视图；
- Agent Inspector；
- Tools / Capabilities 权限面板；
- 高级 Plan 编辑降级。

### Phase 3 — Runtime Console
- 合并 Live Run / Graph / Agents；
- Metrics；
- Graph/Timeline 二级视图；
- Node Inspector；
- Stop UX。

### Phase 4 — Memory Workspace
- Memory Overview；
- Knowledge 原生化；
- Sources；
- Maintenance；
- 设置重新分层；
- 删除挂载旧 Inspector 的按钮路径。

### Phase 5 — Diagnostics + Cleanup
- Trace / Replay / Checkpoint / Raw event；
- 删除旧 DOM/CSS/adapter；
- i18n 清理；
- accessibility；
- mobile polish。

## 14. 测试策略

每阶段至少：

- ESLint；
- workspace unit tests；
- Agent Runtime workspace tests；
- frontend Workspace smoke；
- Memory OS enabled E2E（Memory 阶段）；
- Orchestrator preset persistence regression；
- viewport：320 / 390 / 768 / 1024 / 1440；
- keyboard / focus / Escape；
- no horizontal overflow；
- teardown / remount；
- run subscription update；
- memory source invalidation guard。

最终：

- Node 完整单测；
- frontend build；
- namespace residual guard；
- relevant E2E；
- PR CI。

## 15. DoD

- 一级导航只有 编排 / 运行 / 记忆 / 诊断；
- 桌面为近全屏三层 Workspace，移动为真正全屏移动布局；
- Preset 页面不再是长表单堆叠；
- Live Run / Graph / Agents 不再分裂成三个一级页；
- Memory 进入即为原生工作台，不再通过“Knowledge · Sources · Build & Maintenance”按钮挂载旧 Inspector；
- Raw JSON / Trace / Checkpoint 不出现在默认产品层；
- 工具和 capability 有搜索、分组、继承/允许/禁止语义；
- 所有现有核心能力都有新归宿或明确删除理由；
- 不创建第二套 Runtime / Memory 状态；
- 相关自动化测试与 CI 通过。
