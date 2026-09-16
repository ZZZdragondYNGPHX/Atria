# Memory OS Phase 8 — 历史构建 / 重建 / 回滚

继续执行原 `MEMORY_OS_REFACTOR_PLAN.md` 第 29 节与 Phase 8，没有新建方案或替换记忆架构。

## 基线与实现位置

- 阶段前功能分支 HEAD：`3991c47864cb0dc9f0479c2172e7ba42e577dc9d`。
- 本地 `custom-release`：`38a8a2dc055dbda1406e71d43838c07de7e6c559`；本次 fetch 的远端 HEAD：`112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`。没有新提交需要同步，本地基线完整包含于功能分支。
- 原有 `rebuildStoreFromCurrentChat` 负责旧版节点、压缩及 FloorState 提交。Memory OS 历史构建复用 `extractNodesWithLLM` / `generateTask`、工具协议、语义校验与重试、既有连接和预设，不调用旧版破坏性重建路径。
- `history-build.js` 编排来源捕获、分批、暂存、去重、发布及回滚；`source-lifecycle.js` 仍是聊天作用域事务与来源校验的唯一所有者。
- 图谱工具栏新增“历史构建 / 回滚”，使用原生 popup；没有启动时自动扫历史、额外服务或模型安装。

## 行为

1. 手动选择最近 50 / 100 / 500 条、全部或自定义原始楼层区间（从 0 开始，结束楼层包含在内）。排除系统/隐藏标记及空消息；范围以原始聊天楼层计算，不重新编号。
2. 来源通过既有 capture 分配稳定消息 ID 和版本化 Episode。单批最多 6 条，通常按 24000 字符分组；单条较大消息单独一批，超过 120000 字符则明确报错，不静默截断。字符上限不是模型 token 上限。
3. 抽取在克隆账本上执行。下一批能够看到前一批已暂存的 Fact/Entity/Relation，使用同一证据、类型、时序策略和自然去重规则。模型输出必须包含 facts 与 graph 数组，空数组是有效结果。
4. 补建按 Episode 版本 ID 跳过已处理来源；有效空抽取也记录完成。原消息编辑后产生新版本，会重新处理。重复运行不重复请求模型。
5. 所有批次完成且无错误才一次发布事实与图谱。每批报告进度/错误；任一批错误不发布本次暂存结果。取消、关闭弹窗、聊天或来源变化会丢弃尚未发布的结果；迟到响应不能提交。源码中已经捕获的消息 ID / Episode 会保留，不回滚聊天文件。
6. 同聊天只允许一个历史构建运行。提交前、每个异步边界以及持久化 updater 内校验来源和快照；updater 重试时也重新比对实际账本，拒绝覆盖另一客户端的新修改。

## 重建与用户控制

重建替换自动 Fact/Graph，而不是清空整个聊天账本。保留所有用户触及的记录、修正日志及其引用依赖，包括关系端点、支撑事实、合并、冲突和 pending 记录。原 Episode、来源版本与外部状态快照仍保留；旧节点与 FloorState 不改写。

历史抽取只允许 entity / alias / relation 图操作，身份改名、合并、拆分和冲突裁决继续由用户检查器处理。历史抽取不得修改明确的用户 Fact。用户删除的别名以及完全相同的被拒绝事实/关系继续带拒绝标记，避免重建复活同一错误断言；不同内容或不同有效时间的断言仍按正常证据规则处理。普通文字卡无须提供者，MVU/LoreState 始终只读。

## 持久化与回滚

同一 `memory_graph__provenance` 新增一个 `historyBuild` 检查点：构建 ID、模式、完成时间、已处理 Episode ID、构建前的 Fact/Graph/修正/依赖数据及完成状态的 SHA-256 摘要。仅保留最近一次成功构建检查点，不递归保存检查点。

回滚恢复构建前的派生记忆，不撤销消息 ID 或 Episode 捕获，也不写回提供者。检查点可跨页面刷新使用。事实访问计数和读取时投影不阻止回滚；新的事实、关系、别名、用户修正等实质修改会使回滚拒绝覆盖。成功回滚后检查点不可再次回滚，来源可重新补建。失败或取消不会替换已有成功检查点。

## 实际验证

- Jest 定向测试覆盖区间、批次暂存、版本去重、空结果、取消、错误批次、聊天/来源/用户编辑并发、存储边界竞争、回滚、访问计数、用户修正与别名/拒绝保护、同作用域任务锁。
- 生产抽取测试通过真实 `main.js` 的工具调用调度与验证路径，模型回答为受控夹具；第二批看到第一批暂存的实体，最终可回滚。
- 完整回归命令（工作目录 `tests`）：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`。最终 157 suites / 1935 tests 全部通过。
- `tests/frontend/memory-os-history.smoke.mjs`：隔离实际 Luker 服务、Edge 153、真实 popup/表单/持久化/生产抽取调度，模型响应为夹具。7 项检查：现有入口、自定义范围双批提交、重复跳过、刷新后回滚、错误引用拒绝、取消后迟到响应拒绝、390px 无横向溢出；无 pageerror。窄屏截图已实际查看，未提交截图。
- 原 `memory-os-source.smoke.mjs` 含 LoreState 实际 bridge 源码夹具：22 项通过，包含来源失效、持久化、真实 tokenizer/FOCUS 注入、MVU getter 合约夹具、共存/ownership、只读及提供者退出。
- 新/改小模块和测试通过 ESLint、JavaScript 语法检查、`git diff --check`。`main.js` 与阶段前 HEAD 均有 202 条既存 lint 错误，无新增。恢复原有 LF 换行后，依赖源码匹配的旧回归通过。
- 隔离服务器启动时前端 webpack 编译成功。没有运行真实 LLM 历史抽取、完整 MVU/LoreState 模型更新链或 Android 真机/构建；这些仍是明确覆盖缺口，不要求用户先手测。

## 修改文件与下一阶段

- 新增 `public/scripts/extensions/memory-graph/history-build.js`、`history-build-ui.js`。
- 修改同目录 `main.js`、`graph-inspector.js`、`source-lifecycle.js`、`source-provenance.js`。
- 新增 `tests/memory-graph/history-build.test.js`、`tests/frontend/memory-os-history.smoke.mjs`；修改 `tests/memory-graph/fact-extraction-pipeline.test.js`。
- 更新 `AI_HANDOFF.md`、原方案 Phase 8 状态和本记录。

下一阶段按原方案进入 Phase 9：大图/大账本性能、召回调权、抽取准确率、Android 回归与调试工具。大规模构建当前需要内存暂存和一份持久化回滚副本；跨重启继续未完成批次、多级撤销及自动恢复不是本阶段能力。用户允许不兼容旧数据，未引入旧格式迁移前置条件；未合并回 `custom-release`。
