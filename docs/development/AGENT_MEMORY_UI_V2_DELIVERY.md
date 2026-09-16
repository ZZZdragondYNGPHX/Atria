# Agent & Memory UI v2 — implementation and verification

工作分支：`feat/agent-memory-ui-v2`。基线：`custom-release@be3a2f573d54a63182cf47ca8c2f145e2accc973`；原企划提交：`0da1c19b52c7ade3735084000b05f64b3f7d62d8`。

## 实现范围

- **统一 Workspace**：Presets / Live Run / Graph / Agents / Memory / Diagnostics；桌面侧栏、390px 全屏、运行 pill、停止、JSONL 导出/只读回放、键盘 tabs、Escape、焦点恢复。分页列表、按需 details/图谱、单订阅和关闭/切换清理。详情展开和分页在实时刷新中保留。
- **唯一预设库**：`settings.orchestrator.agentWorkspace` 保存 native definitions 和 ID bindings。优先级为 conversation → character → default；角色/会话绑定只有 scope、subjectId、presetId。新建、复制、重命名、搜索、导入/导出、显式删除并清理引用；引用完整性和 Plan 校验在持久化前完成。导入产生新 ID，不覆盖已有 definition。
- **原生编辑**：四种模式、Single Agent 的单节点 Spec 模板；Agent instructions/model profile/tool allowlist、11 项能力及 node ceiling、运行预算、Agenda planner limits、Spec 节点/边/条件/retry bound/join inputs/output owner、arbitration 及完整 native Plan JSON 编辑。Definition 修改仅影响后续 Run，不修改当前 checkpoint/policyState。禁止把 taskGraph/results/checkpoint 等运行状态作为 definition 导入。
- **Engine 展示**：已准入 Plan 的 graph、节点状态、能力、尝试次数、结果引用/来源、arbitration state、output owner；Runtime Handoff 与 Delegate/fan-out/join 分别标识；Agenda graphRevision、task dependency graph。配置型 Director delegate 使用 Plan agent/node ID；动态 agent 单独显示 Runtime 状态。
- **Memory**：This Run recall 的 run/agent/node/step/ref/token 关联；记录详情反查使用者。通过 Memory API 挂载现有 Inspector、Sources、correction/history/maintenance；没有新建 Memory ledger。每次读取沿用 guarded snapshot，关闭中止 Worker 并销毁图。
- **Diagnostics**：Runtime/Engine/Memory 元数据、context compiled sources/budgets、generation/version/recovery/stale state。ResultEnvelope 和 instructions 通过现有 runtime 的只读 inspector 按需读取；默认导出不含 prompt、任务正文、结果正文、记忆内容或凭据。结果引用用 delta 进入事件日志，避免每次 checkpoint 重复所有既有结果。

## 模块边界

- `lib/agent-workspace/presets.js`：native authoring/binding 的纯事务和校验。
- `lib/agent-workspace/projection.js`、`graph-view.js`：host-neutral 视图选择/图形；不发执行指令。
- `lib/orchestration-engine/projection.js`：Engine 元数据 allowlist；Runtime journal 在 replay 边界再次清洗。
- `orchestrator/workspace/host-presets.js`：Luker factory/scope/profile 适配。保存的是一个 Plan；旧形状仅是运行时临时 transport 参数，不写第二份 profile。
- `engine-v2/observer.js`：把现有 policy/runtime 事实投影到 UI；宿主 scratch 字段解释只在此适配边界发生。
- `memory-graph.getWorkspacePorts`：现有 source lifecycle/Inspector 的宿主接口；Workspace 不跨插件导入 Memory 实现。

Luker 当前 Loop/Director 仍要求固定 `owner`，Agenda 要求 planner/worker pool 布局；这些限制在 Host Adapter 验证。多结果 arbitration 使用 Spec 图，其他模式显示/提交已有 owner result，不把未经实现的控制器伪装成可用选项。通用 native schema 不含这些宿主命名限制。

## 删除和调用方审计

移除原 `preset-library`、`character-overrides`、editor state/display/persist、preset lifecycle/scope UI、旧 settings template/styles、旧 Run Panel renderer/runtime-trace，以及旧 Orchestrator iteration-studio 产品入口。Notes 模板/样式独立保留。旧 global/character definition migration 和 card-import preset custom-tool 写入入口删除。

`main.js` 的 effective resolver、执行身份、菜单和生命周期均转到 native library。CardApp 与 Character Editor 的编排工具改为查询/绑定/清除 preset ID，并同步修正提供给编辑 AI 的工具说明。旧 card definition 数据不会被读取或重新写入；不自动迁移，也不做兼容双写。旧 settings definition 字段在初始化时退役。

保留现有 Runtime/Engine/Memory 的实现与兼容执行辅助模块：它们仍有直接 API、共享工具或测试消费者。本次没有删除其执行历史、替换 scheduler，或为 UI 引入新 checkpoint。`iter-studio/edit-tool-result-envelope.js` 等仍被其他插件使用的共享模块保留。

旧双库/override/UI 的单测随产品合同退役，新增 native preset/state/host 测试；`orch-iteration` 中保留仍有效的纯数据测试，删除已移除 popup 的源码断言。旧 E2E 44、46、108、109、110、113、116、117、119、119b、120、121、122、123、124 已删除（均专测已撤销的编排 UI/角色 definition 写入）。125 改为 native binding 的真实宿主重载测试；78/79/80 和共用 Director fixture 转到 native definition。不能将退役的旧合同测试算作本次通过数量。

## 已执行验证

在 `tests` 目录运行：

```text
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand agent-runtime orchestrator memory-graph orch-iteration --silent
```

结果：**168 suites / 1,962 tests passed**。包括四模式 receipt recovery、取消/并发/late-result、Engine graph mutation/result/arbitration/output authority、Memory guard/corrections/history，以及新 binding/native import/privacy/result-delta/inspector/snapshot 测试。新 Spec 用例实跑 worker → join → worker，验证 join 数据进入下游和声明 owner 提交；新 Loop 用例验证未授权 finalize 无法绕过工具 allowlist。

Browser（生产模块，离线 fixture，无真实模型）：

| 命令 | 结果/范围 |
| --- | --- |
| `node tests/frontend/agent-workspace.smoke.mjs`，`ENGINE_BROWSER=msedge` / `chromium` | 两者通过；390/1440 viewport、Graph→Agents→Memory、真实 IndexedDB 页面销毁恢复、完成分支不重跑、投影 replay 一致、隐私、teardown/reopen |
| `node tests/frontend/agent-workspace-ui.smoke.mjs`，同上两浏览器 | 两者通过；native create/edit/bind/import/export、键盘、取消幂等、trace 回放、Memory 挂载/清理、真实 1000-record Memory Worker/Cytoscape、失效来源拒读，无 pageerror/横向溢出 |
| `node tests/frontend/agent-runtime-projection.smoke.mjs` | Edge 通过；取消、晚到结果、handoff、导出、只读刷新、未授权写入未发生 |
| `node tests/frontend/agent-runtime.smoke.mjs` | Edge 通过；模型/工具/worker 路径、context budget、取消 |
| `node tests/frontend/agent-runtime-recovery.smoke.mjs` | Edge 通过；model/tool receipt/unknown-write reconciliation/handoff 恢复、隔离、持久化 |
| `node tests/frontend/agent-runtime-parallel.smoke.mjs` | Edge 通过；parallel join、取消/恢复与 legacy caller |

新/修改的 Workspace、Engine adapter/projection、Runtime projection/store、Orchestrator main/defaults/runtime/Notes、Memory API/Inspector/tool hook 的 ESLint 通过。另三个既有大文件的全文件 lint 仍有基线问题：CardApp context 4、Character Editor ai-chat 1538、Memory main 202；未进行无关的全文件格式化。插件边界检查仍报 9 处既有违规（全部在原有 import 上），新 Workspace/Memory API 没有增加跨插件违规。静态解析与相对 module target 检查通过；服务器启动的 webpack 构建完成。`git diff --check` 在交付前执行。

临时服务数据、日志和截图均在 `.git/workspace-*`，没有加入提交，没有接触用户聊天或真实 provider。

## Coverage gaps 与已知边界

1. **完整宿主页初始化受基线错误阻塞**：隔离实例的 `agent-workspace-host.smoke.mjs` 在 `slash-commands.js:115` 报 `Cannot access 'SlashCommandParser' before initialization`，无法进入 app readiness。`workspace-baseline-check.mjs` 将所有修改过的 JS 响应替换为上述 custom-release 基线后复现同一错误两次，`ready:false`。这是失败/阻塞，不计作通过。真实宿主的 settings.json reload、完整聊天/角色切换、Memory correction/history 保存、现有 model takeover E2E 未宣称端到端验收；本次以生产模块 fixture 和单测验证其适配边界。
2. Memory source/history/graph/performance 的旧 full-host 脚本依赖同一 app readiness，本次未将它们算作通过；真实 Inspector/Worker 的嵌入、来源失效和销毁已在新离线 smoke 验证。
3. Android WebView/真机、真实模型/provider、长期 RP、完整场景/草稿崩溃恢复未验证。没有要求用户逐项测试；后续实际使用时再检查。
4. 导出的 metadata trace 能回放状态和来源引用，不能恢复未导出的结果/记忆正文，也不会恢复或执行 Runtime。私有详情依赖当前进程中的既有 runtime；进程重启后的恢复边界仍由 Runtime v2 决定。
5. 旧编排 AI iteration popup、角色内 preset definitions、旧格式导入已主动退役。新的结构编辑使用表单/Plan JSON；不提供旧 override 的兼容入口。

保持在 feature branch；不自动 merge `custom-release`，也不自动 push。
