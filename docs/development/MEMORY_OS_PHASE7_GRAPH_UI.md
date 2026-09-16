# Memory OS Phase 7 — Graph UI / 手工纠错

执行依据仍为 `MEMORY_OS_REFACTOR_PLAN.md` 第 25–28 节及 Phase 7；本记录不替代原方案。

## 分支与真实架构

- 本阶段开始时 `feat/memory-os` 为 `dcd991f21505a78f112a368278b9ee8ffb845787`。
- 本地 `custom-release` 为 `38a8a2dc055dbda1406e71d43838c07de7e6c559`；获取到的远端为 `112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`，没有新提交需要同步。本地基线已经包含在功能分支中。
- 原生扩展的 `main.js` 持有旧图谱弹窗、设置入口和本地 Cytoscape 加载器；不存在方案假设中的独立 UI service。保留旧图谱入口，并在 Memory OS 启用时让“查看图谱”打开新的检查器。
- 实际 Entity、Relation、Fact、Episode、外部状态快照仍由同一聊天的 `memory_graph__provenance` 持有。新 UI 读取 source-lifecycle 的受保护快照，使用现有时序投影；不生成相似度边，不新建数据库。

## 已实现

- Global Graph、实体名称/别名搜索、实体类型/关系谓词筛选、当前/含历史切换，实体中心的 1–3 hop Local Graph。
- 复用本地 Cytoscape，支持缩放、拖动、平移、适应视图。一次最多绘制 250 实体、600 关系；显示数量和截断提示，使用不带动画的 circle layout。键盘列表最多展示当前结果前 100 条，可结合筛选/局部范围定位其余记录。
- 实体/关系详情展示真实 ID、类型、别名、端点、状态、置信度、时间、支撑事实引用、原始 Episode 正文和用户修正来源。可定位已加载的聊天消息；未加载时显示正文及说明，不凭空调用宿主 API。
- Pending 实体消歧接受/拒绝；disputed 关系选择胜者/败者裁决，或拒绝/替换错误关系。
- 手工新建实体、重命名、添加/删除别名、合并/拆分实体、新建/替换/使关系失效、删除错误事实或推断。修正原因必填，操作与时间保存在账本 `corrections` 中，UI 可查看最近 100 条。
- MVU/LoreState 状态、字段路径和现有映射只读展示。文字卡无需外部状态；没有新增外部状态写回或提供者安装要求。

## 用户来源与写入约束

用户修正拥有独立的 `manualId` 来源，关联同作用域的 user correction。不会伪造聊天楼层、Episode 或引用，也不把外部状态复制成用户可写变量。用户陈述的新关系创建独立 explicit Fact；推断不会因为普通模型操作而升级成 explicit。用户可以明确裁决推断与显式证据的冲突，模型的原有限制保留。

新增、别名和合并继续复用时序操作验证；拒绝采用保留原记录的 `manualDisabled` 标记。投影显示 rejected，召回过滤相关关系及无其他有效关系支撑的事实；替换关系保留旧记录，使用新 Fact 和新关系。向量指纹包含用户来源，下一次召回按原增量同步路径清理失效候选。

手工 writer 仅连接原生 UI，不注册为抽取工具或编排工具。写入沿用同一作用域队列及持久化事务；检查打开窗口时的聊天、来源、提供者版本及账本快照。另一操作修改记忆、消息变化、切换聊天或关闭功能后，旧窗口必须刷新才能写入。提交失败不会留下半条修正或半条关系。

用户修正不依赖聊天正文存活；原聊天证据仍按既有生命周期失效。混合来源支持（例如之后执行事实合并）同时检查其聊天证据，不能借用 manualId 绕过原始来源变化检查。Phase 8 重建应明确保留这些用户修正，不静默覆盖。

## 验证

- Jest：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`（工作目录 `tests`）：最终 156 suites / 1916 tests 全部通过。
- 新增 `graph-inspector.test.js`：用户来源、重载、别名、拒绝事实/关系、同端点替换、事务原子性、外部状态只读、合并拆分、pending/冲突裁决、模型证据限制、1–3 hop、过滤和大图绘制上限。source-lifecycle 补充旧窗口、持久化边界来源修改、聊天切换与关闭功能测试。
- 新增 `tests/frontend/memory-os-graph.smoke.mjs`，实际隔离 Luker 服务 + 系统 Edge 153：9 项通过，覆盖现有设置入口、可见表单写入、详情来源、局部/搜索、HTML 作为文本显示、拒绝/历史、390px 无横向溢出、刷新恢复、旧快照拒写；没有 pageerror。窄屏截图已实际查看，截图仅存临时目录。
- 原 `memory-os-source.smoke.mjs` 含真实 LoreState bridge 源码夹具复测：22 项通过，覆盖真实宿主事件总线、MVU getter 合约夹具、共存/ownership、状态变化失效、只读来源、退出提供者、真实 tokenizer 和 CORE/FOCUS 注入。
- 新/改小模块及测试 ESLint、JavaScript 语法与 `git diff --check`；`main.js` 与阶段前 HEAD 均为 202 条既存 lint 错误，没有新增。
- 隔离服务器启动时成功编译前端库；未运行完整 Android 构建，也未验证 Android 真机、完整外部更新模型流水线或真实 LLM 抽取。不把这些覆盖缺口转交为本阶段用户手测前置条件。

## 下一阶段

按原方案进入 Phase 8 历史记忆构建：进度、取消、去重和回滚/重建。继续复用当前来源、Fact/Graph 与抽取链，保留用户修正与提供者只读边界。用户已允许不兼容旧数据，无需以旧格式迁移阻塞开发。大规模投影/搜索性能与更多布局属于 Phase 9；本阶段的绘制上限不是任意规模性能保证。

## 修改文件

- `public/scripts/extensions/memory-graph/graph-inspector.js`、`graph-inspector.css`：图谱、检查器、表单及响应式样式。
- `public/scripts/extensions/memory-graph/manual-corrections.js`：用户修正与独立来源。
- 同目录 `main.js`、`source-lifecycle.js`：现有入口与事务接线。
- 同目录 `source-provenance.js`、`atomic-facts.js`、`temporal-graph.js`、`hybrid-retrieval.js`：来源、投影与召回。
- `tests/memory-graph/graph-inspector.test.js`、`source-lifecycle.test.js`：单元和生命周期回归。
- `tests/frontend/memory-os-graph.smoke.mjs`：隔离服务浏览器回归。
- `AI_HANDOFF.md`、`docs/development/MEMORY_OS_REFACTOR_PLAN.md`、本文件：交接与阶段记录。
