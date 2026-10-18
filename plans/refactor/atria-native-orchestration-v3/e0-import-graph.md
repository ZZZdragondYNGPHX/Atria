# E0 — AST import/worker/URL 反向闭包

基线：`main@60aca695726893e298b7d485f300c6efef3b79fd`；2026-10-15。使用本地已安装 Acorn 8.16.0，纯解析、不 import 产品模块、不执行产品代码；相对路径与 `/scripts/`、`/shared/` 归一化，静态 import/export、字面 dynamic import/require/new URL/Worker 均扫描。API/设置/字符串注册仍以 [consumer inventory](e0-consumer-inventory.md) 与 [处置矩阵](e0-audit.md#8-最新-main-全仓审计与零兼容处置矩阵) 补充。

解析 2886 个 JS/MJS/CJS 文件；解析失败 0；本地字面边 11053；计算表达式加载点 240；四根反向闭包 1152 个文件（含根内 151）。非 JS 资产由 consumer inventory 补充。工具结果仅为版本内静态事实，动态表达式及真实运行保持独立 Gate。

## 根外直接模块/路径边

| 消费者:行 | 种类 | 目标 | 存在 |
| --- | --- | --- | --- |
| `public/scripts/agents/memory/orchestrator-tools.js:2` | module | `public/scripts/lib/agent-runtime/host-ports.js` | true |
| `public/scripts/agents/memory/schema-iteration/studio.js:73` | module | `public/scripts/agents/orchestrator/iter-studio/edit-tool-result-envelope.js` | true |
| `public/scripts/atria-shell/workspace-host.js:195` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `public/scripts/capability-host.js:84` | dynamic | `public/scripts/agents/orchestrator/index.js` | true |
| `public/scripts/generate-task.js:1` | module | `public/scripts/lib/agent-runtime/prepared-context.js` | true |
| `src/native/agent-intelligence/evaluation/adapters.js:6` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `src/native/agent-intelligence/evaluation/adapters.js:8` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `src/native/agent-intelligence/evaluation/worker.js:20` | dynamic | `public/scripts/agents/orchestrator/skill-resolution.js` | true |
| `src/native/agent-intelligence/evolution-targets.js:7` | module | `public/scripts/lib/agent-workspace/prompt-versions.js` | true |
| `src/native/agent-intelligence/evolution-targets.js:8` | module | `public/scripts/lib/agent-workspace/strategy-versions.js` | true |
| `src/native/agent-intelligence/evolution-targets.js:9` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `src/native/agent-intelligence/evolution-targets.js:10` | module | `public/scripts/agents/orchestrator/workspace/host-profile.js` | true |
| `tests/agent-intelligence/adapters.js:6` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/agent-intelligence/adapters.js:8` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-intelligence/capture.test.js:6` | module | `public/scripts/agents/orchestrator/evidence-capture.js` | true |
| `tests/agent-intelligence/capture.test.js:7` | module | `public/scripts/agents/orchestrator/run-state/runtime-observer.js` | true |
| `tests/agent-intelligence/capture.test.js:8` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-intelligence/capture.test.js:9` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-intelligence/capture.test.js:10` | module | `public/scripts/lib/agent-runtime/prepared-context.js` | true |
| `tests/agent-intelligence/capture.test.js:12` | module | `public/scripts/agents/orchestrator/game-runtime-bridge.js` | true |
| `tests/agent-intelligence/capture.test.js:13` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/agent-intelligence/evolution-consumers.test.js:9` | module | `public/scripts/agents/orchestrator/workspace/host-refresh.js` | true |
| `tests/agent-intelligence/evolution-consumers.test.js:10` | module | `public/scripts/agents/orchestrator/workspace/host-profile.js` | true |
| `tests/agent-intelligence/evolution-fixture.js:20` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-intelligence/evolution-fixture.js:21` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-intelligence/evolution-fixture.js:22` | module | `public/scripts/lib/agent-workspace/prompt-versions.js` | true |
| `tests/agent-intelligence/evolution-fixture.js:23` | module | `public/scripts/lib/agent-workspace/strategy-versions.js` | true |
| `tests/agent-intelligence/evolution.test.js:10` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-intelligence/sources.test.js:9` | module | `public/scripts/lib/orchestration-engine/results.js` | true |
| `tests/agent-runtime/atri-agenda-defaults.test.js:2` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/atri-agenda-defaults.test.js:3` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/context-ports.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/context-ports.test.js:3` | module | `public/scripts/lib/agent-runtime/host-ports.js` | true |
| `tests/agent-runtime/context-ports.test.js:5` | module | `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` | true |
| `tests/agent-runtime/durable-recovery.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/engine-kernel.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/engine-kernel.test.js:3` | module | `public/scripts/lib/orchestration-engine/index.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:3` | module | `public/scripts/agents/orchestrator/engine-v2/loop-adapter.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:4` | module | `public/scripts/agents/orchestrator/engine-v2/director-adapter.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:5` | module | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:6` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:11` | dynamic | `public/scripts/agents/orchestrator/engine-v2/spec-adapter.js` | true |
| `tests/agent-runtime/engine-mode-recovery.test.js:12` | dynamic | `public/scripts/agents/orchestrator/engine-v2/agenda-adapter.js` | true |
| `tests/agent-runtime/handoff-routing.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/handoff-routing.test.js:3` | module | `public/scripts/lib/agent-runtime/contracts.js` | true |
| `tests/agent-runtime/handoff-routing.test.js:4` | module | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/agent-runtime/handoff-routing.test.js:5` | module | `public/scripts/agents/orchestrator/legacy-agent-routing.js` | true |
| `tests/agent-runtime/handoff-routing.test.js:117` | dynamic | `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` | true |
| `tests/agent-runtime/kernel.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/legacy-adapter.test.js:2` | module | `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` | true |
| `tests/agent-runtime/legacy-adapter.test.js:4` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/legacy-workflow.test.js:2` | module | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/agent-runtime/legacy-workflow.test.js:3` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/native-orchestration-prompts.test.js:2` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/native-orchestration-prompts.test.js:6` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/parallel.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/parallel.test.js:3` | module | `public/scripts/lib/agent-runtime/projection.js` | true |
| `tests/agent-runtime/policy-controller.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/prepared-context.test.js:3` | module | `public/scripts/lib/agent-runtime/prepared-context.js` | true |
| `tests/agent-runtime/preset-compiler.test.js:2` | module | `public/scripts/agents/orchestrator/engine-v2/preset-compiler.js` | true |
| `tests/agent-runtime/preset-compiler.test.js:3` | module | `public/scripts/lib/orchestration-engine/index.js` | true |
| `tests/agent-runtime/projection.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/projection.test.js:3` | module | `public/scripts/lib/agent-runtime/projection.js` | true |
| `tests/agent-runtime/projection.test.js:4` | module | `public/scripts/lib/agent-runtime/events.js` | true |
| `tests/agent-runtime/projection.test.js:5` | module | `public/scripts/agents/orchestrator/run-state/runtime-observer.js` | true |
| `tests/agent-runtime/projection.test.js:6` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-runtime/projection.test.js:7` | module | `public/scripts/agents/orchestrator/legacy-agent-routing.js` | true |
| `tests/agent-runtime/projection.test.js:8` | module | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/agent-runtime/races.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/tool-batch.test.js:2` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/agent-runtime/workspace-agent-editing.test.js:2` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/workspace-agent-editing.test.js:3` | module | `public/scripts/agents/orchestrator/workspace/agent-editing.js` | true |
| `tests/agent-runtime/workspace-agent-editing.test.js:4` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/workspace-call-counts.test.js:2` | module | `public/scripts/lib/agent-workspace/projection.js` | true |
| `tests/agent-runtime/workspace-host.test.js:2` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/workspace-host.test.js:3` | module | `public/scripts/agents/orchestrator/engine-v2/preset-compiler.js` | true |
| `tests/agent-runtime/workspace-host.test.js:4` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/workspace-host.test.js:5` | module | `public/scripts/agents/orchestrator/execution-mode-contract.js` | true |
| `tests/agent-runtime/workspace-preset-help.test.js:33` | dynamic | `public/scripts/agents/orchestrator/workspace/authoring.js` | true |
| `tests/agent-runtime/workspace-preset-help.test.js:34` | dynamic | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/workspace-preset-help.test.js:35` | dynamic | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/workspace-presets.test.js:2` | module | `public/scripts/lib/orchestration-engine/capabilities.js` | true |
| `tests/agent-runtime/workspace-presets.test.js:3` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/workspace-presets.test.js:5` | module | `public/scripts/lib/agent-workspace/projection.js` | true |
| `tests/agent-runtime/workspace-prompt-versions.test.js:2` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/workspace-prompt-versions.test.js:3` | module | `public/scripts/lib/agent-workspace/prompt-versions.js` | true |
| `tests/agent-runtime/workspace-prompt-versions.test.js:4` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/workspace-prompt-versions.test.js:6` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/agent-runtime/workspace-prompt-versions.test.js:7` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-runtime/workspace-state.test.js:2` | module | `public/scripts/lib/agent-runtime/projection.js` | true |
| `tests/agent-runtime/workspace-state.test.js:3` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/workspace-state.test.js:4` | module | `public/scripts/lib/agent-workspace/projection.js` | true |
| `tests/agent-runtime/workspace-state.test.js:5` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-runtime/workspace-state.test.js:7` | module | `public/scripts/agents/orchestrator/engine-v2/loop-adapter.js` | true |
| `tests/agent-runtime/workspace-state.test.js:11` | dynamic | `public/scripts/agents/orchestrator/engine-v2/spec-adapter.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:2` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:3` | module | `public/scripts/lib/agent-workspace/strategy-versions.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:4` | module | `public/scripts/lib/agent-workspace/prompt-versions.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:5` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:7` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:8` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:11` | module | `public/scripts/lib/orchestration-engine/policy-controller.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:12` | module | `public/scripts/agents/orchestrator/engine-v2/agenda-adapter.js` | true |
| `tests/agent-runtime/workspace-strategy-versions.test.js:13` | module | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/atria-shell/memory-workspace-lifecycle.test.js:5` | dynamic | `public/scripts/agents/orchestrator/workspace/memory/page.js` | true |
| `tests/character-presets/orchestrator-collect-unembedded.test.js:41` | dynamic | `public/scripts/agents/orchestrator/collect-unembedded-presets.js` | true |
| `tests/e2e/_lib/page.js:913` | dynamic | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/e2e/_lib/page.js:914` | dynamic | `public/scripts/agents/orchestrator/engine-v2/preset-compiler.js` | true |
| `tests/e2e/_lib/page.js:915` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/e2e/memorygraph/memory-os-enabled.e2e.js:38` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/e2e/native-session/11-utilities-redesign.e2e.js:266` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/native-session/11-utilities-redesign.e2e.js:282` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/native-session/12-native-agent-routes.e2e.js:217` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/native-session/12-native-agent-routes.e2e.js:218` | dynamic | `public/scripts/agents/orchestrator/snapshot-cache.js` | true |
| `tests/e2e/orchestrator/68-run-panel-stream-final-commit.e2e.js:60` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/orchestrator/68-run-panel-stream-final-commit.e2e.js:110` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/orchestrator/74-capsule-injection-main-and-sub-share.e2e.js:81` | dynamic | `public/scripts/agents/orchestrator/capsule-injection.js` | true |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:62` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:104` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:129` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:188` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/orchestrator/78-multi-skill-visible-director-and-subagent.e2e.js:75` | dynamic | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/e2e/orchestrator/78-multi-skill-visible-director-and-subagent.e2e.js:89` | dynamic | `public/scripts/agents/orchestrator/skill-resolution.js` | true |
| `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js:233` | dynamic | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js:234` | dynamic | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/e2e/orchestrator/80-lorebook-filter-director.e2e.js:165` | dynamic | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/e2e/orchestrator/81-dispatch-barrier-first-chunk-serialization.e2e.js:156` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/e2e/regression/125-orch-preset-switch-persist.e2e.js:82` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/e2e/regression/125-orch-preset-switch-persist.e2e.js:108` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agenda-tool-safety.smoke.mjs:23` | dynamic | `public/scripts/agents/orchestrator/agenda-runtime.js` | true |
| `tests/frontend/agenda-tool-safety.smoke.mjs:24` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agenda-world-info.smoke.mjs:25` | dynamic | `public/scripts/agents/orchestrator/agenda-runtime.js` | true |
| `tests/frontend/agenda-world-info.smoke.mjs:26` | dynamic | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:28` | dynamic | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:91` | dynamic | `public/scripts/agents/orchestrator/runtime-checkpoints.js` | true |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:92` | dynamic | `public/scripts/agents/orchestrator/legacy-parallel-adapter.js` | true |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:93` | dynamic | `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` | true |
| `tests/frontend/agent-runtime-projection.smoke.mjs:25` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agent-runtime-projection.smoke.mjs:26` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-runtime-projection.smoke.mjs:27` | dynamic | `public/scripts/lib/agent-runtime/projection.js` | true |
| `tests/frontend/agent-runtime-projection.smoke.mjs:28` | dynamic | `public/scripts/agents/orchestrator/legacy-agent-routing.js` | true |
| `tests/frontend/agent-runtime-projection.smoke.mjs:29` | dynamic | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:31` | dynamic | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:68` | dynamic | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:108` | dynamic | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:109` | dynamic | `public/scripts/agents/orchestrator/runtime-checkpoints.js` | true |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:110` | dynamic | `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` | true |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:111` | dynamic | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/frontend/agent-runtime.smoke.mjs:32` | dynamic | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/frontend/agent-runtime.smoke.mjs:33` | dynamic | `public/scripts/agents/orchestrator/legacy-runtime-adapter.js` | true |
| `tests/frontend/agent-runtime.smoke.mjs:34` | dynamic | `public/scripts/lib/agent-runtime/host-ports.js` | true |
| `tests/frontend/agent-runtime.smoke.mjs:67` | dynamic | `public/scripts/agents/orchestrator/legacy-workflow-adapter.js` | true |
| `tests/frontend/agent-runtime.smoke.mjs:73` | dynamic | `public/scripts/agents/orchestrator/legacy-agent-routing.js` | true |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:27` | dynamic | `public/scripts/agents/orchestrator/i18n.js` | true |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:28` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:29` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-host.smoke.mjs:18` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-host.smoke.mjs:43` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:33` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:34` | dynamic | `public/scripts/agents/orchestrator/workspace/authoring.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:35` | dynamic | `public/scripts/agents/orchestrator/workspace/memory.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:189` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:235` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:244` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:248` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:260` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:272` | dynamic | `public/scripts/agents/orchestrator/workspace/memory.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:273` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:301` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:312` | dynamic | `public/scripts/agents/orchestrator/i18n.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:313` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace-ui.smoke.mjs:314` | dynamic | `public/scripts/agents/orchestrator/workspace/authoring.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:26` | dynamic | `public/scripts/lib/agent-runtime/index.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:27` | dynamic | `public/scripts/lib/agent-runtime/durable-checkpoint-store.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:28` | dynamic | `public/scripts/lib/agent-runtime/indexeddb-checkpoints.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:29` | dynamic | `public/scripts/agents/orchestrator/engine-v2/runtime-bridge.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:30` | dynamic | `public/scripts/lib/orchestration-engine/index.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:31` | dynamic | `public/scripts/agents/orchestrator/engine-v2/output-adapter.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:32` | dynamic | `public/scripts/lib/agent-runtime/projection.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:33` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:34` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/agent-workspace.smoke.mjs:105` | dynamic | `public/scripts/agents/orchestrator/workspace/panel.js` | true |
| `tests/frontend/hm1-memory.smoke.mjs:36` | dynamic | `public/scripts/agents/orchestrator/workspace/memory/page.js` | true |
| `tests/game-runtime/llm-orchestrator-narrative.test.js:13` | module | `public/scripts/agents/orchestrator/game-runtime-bridge.js` | true |
| `tests/jest.setup.js:97` | dynamic | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/logging/l08-attribution-fixtures.test.js:5` | module | `public/scripts/agents/orchestrator/diagnostics.js` | true |
| `tests/memory-graph/orchestrator-tools-register.test.js:7` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/mg-schema-iteration/task-messages-toolcall-roundtrip.test.js:41` | module | `public/scripts/agents/orchestrator/iter-studio/edit-tool-result-envelope.js` | true |
| `tests/native/agent-goals-s14.test.js:12` | module | `public/scripts/agents/orchestrator/goal-context.js` | true |
| `tests/native/agent-goals-s14.test.js:13` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/native/agent-settings.test.js:3` | module | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/native/agent-settings.test.js:4` | module | `public/scripts/lib/agent-workspace/presets.js` | true |
| `tests/native/mcp-delegated-generation.test.js:15` | module | `public/scripts/lib/orchestration-engine/capabilities.js` | true |
| `tests/native/mcp-delegated-generation.test.js:69` | dynamic | `public/scripts/agents/orchestrator/delegated-run.js` | true |
| `tests/orch-iteration/assistantmsg-edits-v3.test.js:13` | module | `public/scripts/agents/orchestrator/iter-studio/session-store.js` | true |
| `tests/orch-iteration/control-tools.test.js:29` | dynamic | `public/scripts/agents/orchestrator/iter-studio/tool-display.js` | true |
| `tests/orch-iteration/popup-bug-regression.test.js:42` | dynamic | `public/scripts/agents/orchestrator/iter-studio/session-store.js` | true |
| `tests/orch-iteration/popup-bug-regression.test.js:45` | dynamic | `public/scripts/agents/orchestrator/iter-studio/tool-display.js` | true |
| `tests/orch-iteration/read-fields.test.js:21` | module | `public/scripts/agents/orchestrator/iter-studio/read-fields-dispatcher.js` | true |
| `tests/orch-iteration/read-fields.test.js:181` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orch-iteration/sandbox-result.test.js:27` | module | `public/scripts/agents/orchestrator/iter-studio/sandbox-result.js` | true |
| `tests/orch-iteration/session-store.test.js:14` | module | `public/scripts/agents/orchestrator/iter-studio/session-store.js` | true |
| `tests/orch-iteration/task-messages-toolcall-roundtrip.test.js:43` | module | `public/scripts/agents/orchestrator/iter-studio/edit-tool-result-envelope.js` | true |
| `tests/orch-iteration/tool-display.test.js:33` | dynamic | `public/scripts/agents/orchestrator/iter-studio/tool-display.js` | true |
| `tests/orchestrator-agent-preset-resolver/unit.test.js:17` | module | `public/scripts/agents/orchestrator/agent-preset-resolver.js` | true |
| `tests/orchestrator-skills/skill-orchestration-tools.test.js:43` | dynamic | `public/scripts/agents/orchestrator/skill-orchestration-tools.js` | true |
| `tests/orchestrator-skills/skill-resolution.test.js:26` | dynamic | `public/scripts/agents/orchestrator/skill-resolution.js` | true |
| `tests/orchestrator/agenda-host-gate.test.js:9` | URL | `public/scripts/agents/orchestrator/main.js` | true |
| `tests/orchestrator/agenda-spec-customs-seed.test.js:70` | dynamic | `public/scripts/agents/orchestrator/agenda-profile.js` | true |
| `tests/orchestrator/agenda-spec-customs-seed.test.js:71` | dynamic | `public/scripts/agents/orchestrator/spec-schema.js` | true |
| `tests/orchestrator/agenda-tool-safety.test.js:1` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/agenda-tool-safety.test.js:88` | dynamic | `public/scripts/agents/orchestrator/agenda-runtime.js` | true |
| `tests/orchestrator/agenda-tool-safety.test.js:90` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/agenda-world-info.test.js:5` | dynamic | `public/scripts/agents/orchestrator/agenda-world-info.js` | true |
| `tests/orchestrator/agent-prompt-preset-routing-data.test.js:84` | dynamic | `public/scripts/agents/orchestrator/agent-resolution.js` | true |
| `tests/orchestrator/api-fallback.test.js:2` | module | `public/scripts/agents/orchestrator/api-fallback.js` | true |
| `tests/orchestrator/chat-read-range-pair-expansion.test.js:2` | module | `public/scripts/agents/orchestrator/loop-tools/chat.js` | true |
| `tests/orchestrator/critic-regex-search-tool-primitives.test.js:18` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/critic-regex-search-tool-primitives.test.js:19` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/custom-tool-bridge-st.test.js:50` | dynamic | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/custom-tool-bridge-st.test.js:51` | dynamic | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/custom-tool-flags.test.js:3` | module | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/custom-tool-iter-studio.test.js:53` | dynamic | `public/scripts/agents/orchestrator/custom-tool-iter-studio.js` | true |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:70` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:71` | dynamic | `public/scripts/agents/orchestrator/spec-schema.js` | true |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:72` | dynamic | `public/scripts/agents/orchestrator/agenda-profile.js` | true |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:73` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/custom-tool-register.test.js:3` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/custom-tool-register.test.js:9` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/custom-tool-register.test.js:10` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/custom-tool-runtime-agenda.test.js:1` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/custom-tool-runtime-agenda.test.js:2` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/custom-tool-runtime-agenda.test.js:122` | dynamic | `public/scripts/agents/orchestrator/agenda-runtime.js` | true |
| `tests/orchestrator/custom-tool-runtime-director.test.js:1` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/custom-tool-runtime-director.test.js:9` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/orchestrator/custom-tool-runtime-director.test.js:10` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/custom-tool-runtime-director.test.js:12` | module | `public/scripts/agents/orchestrator/per-run-custom-tools.js` | true |
| `tests/orchestrator/custom-tool-runtime-loop.test.js:1` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/custom-tool-runtime-loop.test.js:4` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/custom-tool-runtime-loop.test.js:5` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/custom-tool-runtime-loop.test.js:62` | dynamic | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/custom-tool-runtime-spec.test.js:1` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/custom-tool-runtime-spec.test.js:101` | dynamic | `public/scripts/agents/orchestrator/spec-runtime.js` | true |
| `tests/orchestrator/custom-tool-sanitize.test.js:2` | module | `public/scripts/agents/orchestrator/custom-tools-sanitize.js` | true |
| `tests/orchestrator/custom-tool-sanitize.test.js:75` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/custom-tool-sanitize.test.js:76` | dynamic | `public/scripts/agents/orchestrator/spec-schema.js` | true |
| `tests/orchestrator/custom-tool-sanitize.test.js:77` | dynamic | `public/scripts/agents/orchestrator/agenda-profile.js` | true |
| `tests/orchestrator/custom-tool-sanitize.test.js:78` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/custom-tool-studio-prompt.test.js:14` | module | `public/scripts/agents/orchestrator/studio-prompt-augment.js` | true |
| `tests/orchestrator/default-custom-tools.test.js:73` | dynamic | `public/scripts/agents/orchestrator/default-custom-tools.js` | true |
| `tests/orchestrator/default-custom-tools.test.js:74` | dynamic | `public/scripts/agents/orchestrator/seed-default-custom-tools.js` | true |
| `tests/orchestrator/default-custom-tools.test.js:75` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/default-custom-tools.test.js:76` | dynamic | `public/scripts/agents/orchestrator/spec-schema.js` | true |
| `tests/orchestrator/default-custom-tools.test.js:77` | dynamic | `public/scripts/agents/orchestrator/agenda-profile.js` | true |
| `tests/orchestrator/default-custom-tools.test.js:78` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director-default-prompt-presets.test.js:2` | module | `public/scripts/agents/orchestrator/director-default-prompt.js` | true |
| `tests/orchestrator/director-factory-presets.test.js:2` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director-load-shape.test.js:16` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director-preset-swap.test.js:3` | module | `public/scripts/agents/orchestrator/director-preset-swap.js` | true |
| `tests/orchestrator/director-preset-swap.test.js:10` | module | `public/scripts/agents/orchestrator/pure-preset-body.js` | true |
| `tests/orchestrator/director-tools-draft-search.test.js:2` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/director-tools-runround-settle.test.js:9` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/director/abort.test.js:1` | module | `public/scripts/agents/orchestrator/per-run-custom-tools.js` | true |
| `tests/orchestrator/director/abort.test.js:3` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/orchestrator/director/abort.test.js:4` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/director/agent-task-messages.test.js:2` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/orchestrator/director/content-payload.test.js:2` | module | `public/scripts/agents/orchestrator/director-content-payload.js` | true |
| `tests/orchestrator/director/default-prompt.test.js:2` | module | `public/scripts/agents/orchestrator/director-default-prompt.js` | true |
| `tests/orchestrator/director/digest.test.js:2` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/director/dispatch-claim.test.js:2` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/orchestrator/director/integration.test.js:11` | module | `public/scripts/agents/orchestrator/director-runtime.js` | true |
| `tests/orchestrator/director/integration.test.js:13` | module | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/director/memory-scout-iou.test.js:27` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director/notes-subagents.test.js:2` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director/profile-shape.test.js:7` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director/studio-adapter.test.js:2` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director/sub-messages.test.js:2` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/director/subagent-max-rounds.test.js:20` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/director/subagent-max-rounds.test.js:24` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/director/tools.test.js:1` | module | `public/scripts/agents/orchestrator/per-run-custom-tools.js` | true |
| `tests/orchestrator/director/tools.test.js:26` | module | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/orchestrator/dispatch-barrier/dispatch-barrier.test.js:33` | module | `public/scripts/agents/orchestrator/dispatch-barrier.js` | true |
| `tests/orchestrator/editor-ops/context-replace.test.js:3` | module | `public/scripts/agents/orchestrator/editor-ops.js` | true |
| `tests/orchestrator/editor-ops/error.test.js:2` | module | `public/scripts/agents/orchestrator/editor-ops.js` | true |
| `tests/orchestrator/editor-ops/patch.test.js:3` | module | `public/scripts/agents/orchestrator/editor-ops.js` | true |
| `tests/orchestrator/editor-ops/pipe-from.test.js:3` | module | `public/scripts/agents/orchestrator/editor-ops.js` | true |
| `tests/orchestrator/editor-ops/reasoning-sections.test.js:3` | module | `public/scripts/agents/orchestrator/editor-ops.js` | true |
| `tests/orchestrator/editor-ops/slicing.test.js:3` | module | `public/scripts/agents/orchestrator/editor-ops.js` | true |
| `tests/orchestrator/execution-mode-contract.test.js:3` | module | `public/scripts/agents/orchestrator/execution-mode-contract.js` | true |
| `tests/orchestrator/execution-mode-contract.test.js:4` | module | `public/scripts/agents/orchestrator/anchors.js` | true |
| `tests/orchestrator/execution-mode-contract.test.js:5` | module | `public/scripts/agents/orchestrator/snapshot-cache.js` | true |
| `tests/orchestrator/factory-preset-shape.test.js:2` | module | `public/scripts/agents/orchestrator/defaults.js` | true |
| `tests/orchestrator/factory-preset-shape.test.js:8` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/get-effective-profile-presets.test.js:305` | dynamic | `public/scripts/agents/orchestrator/main.js` | true |
| `tests/orchestrator/get-effective-profile-presets.test.js:314` | dynamic | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/orchestrator/get-effective-profile-presets.test.js:324` | dynamic | `public/scripts/agents/orchestrator/workspace/host-presets.js` | true |
| `tests/orchestrator/get-effective-profile-presets.test.js:336` | dynamic | `public/scripts/agents/orchestrator/main.js` | true |
| `tests/orchestrator/grep-tool.test.js:2` | module | `public/scripts/agents/orchestrator/grep-tool.js` | true |
| `tests/orchestrator/iter-studio-lorebook-filter.test.js:3` | module | `public/scripts/agents/orchestrator/lorebook-filter.js` | true |
| `tests/orchestrator/iter-studio-session-store.test.js:2` | module | `public/scripts/agents/orchestrator/iter-studio/session-store.js` | true |
| `tests/orchestrator/loop-integration.test.js:27` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-integration.test.js:35` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/loop-iteration.test.js:23` | module | `public/scripts/agents/orchestrator/loop-iteration.js` | true |
| `tests/orchestrator/loop-iteration.test.js:27` | module | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-runtime.test.js:25` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-chat.test.js:24` | module | `public/scripts/agents/orchestrator/loop-tools/chat.js` | true |
| `tests/orchestrator/loop-tools-chat.test.js:28` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/loop-tools-chat.test.js:33` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook-filter.test.js:28` | module | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook-filter.test.js:34` | module | `public/scripts/agents/orchestrator/loop-tools/lorebook-force-activate.js` | true |
| `tests/orchestrator/loop-tools-lorebook-filter.test.js:35` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook-force-activate.test.js:34` | module | `public/scripts/agents/orchestrator/loop-tools/lorebook-force-activate.js` | true |
| `tests/orchestrator/loop-tools-lorebook-force-activate.test.js:35` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/loop-tools-lorebook-force-activate.test.js:36` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:28` | module | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:34` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:38` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:333` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:347` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:363` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:382` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:401` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:417` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:428` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:439` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:449` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:460` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:471` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:474` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:482` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:492` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:501` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:504` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:513` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:516` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:525` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:528` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:537` | dynamic | `public/scripts/agents/orchestrator/loop-tools/lorebook.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:551` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:623` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:637` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:651` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:668` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:679` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:693` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:712` | dynamic | `public/scripts/agents/orchestrator/loop-iteration.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:715` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:732` | dynamic | `public/scripts/agents/orchestrator/loop-iteration.js` | true |
| `tests/orchestrator/loop-tools-lorebook.test.js:735` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:35` | module | `public/scripts/agents/orchestrator/loop-tools/note.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:40` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:44` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:423` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:468` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:503` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:526` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-note.test.js:550` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/loop-tools-registration.test.js:14` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/loop-tools-simulation.test.js:20` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/loop-tools-simulation.test.js:26` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/loop-tools-simulation.test.js:30` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/lorebook-filter-persistence.test.js:61` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/lorebook-filter-persistence.test.js:62` | dynamic | `public/scripts/agents/orchestrator/spec-schema.js` | true |
| `tests/orchestrator/lorebook-filter-persistence.test.js:63` | dynamic | `public/scripts/agents/orchestrator/agenda-profile.js` | true |
| `tests/orchestrator/lorebook-filter-persistence.test.js:64` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/lorebook-filter.test.js:3` | module | `public/scripts/agents/orchestrator/lorebook-filter.js` | true |
| `tests/orchestrator/main-on-world-info-finalized-filter.test.js:17` | module | `public/scripts/agents/orchestrator/lorebook-filter.js` | true |
| `tests/orchestrator/multi-skill-visible-resolver.test.js:57` | dynamic | `public/scripts/agents/orchestrator/skill-resolution.js` | true |
| `tests/orchestrator/notes-panel-refresh.test.js:25` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/open-notes-cross-mode-injection.test.js:148` | dynamic | `public/scripts/agents/orchestrator/agenda-runtime.js` | true |
| `tests/orchestrator/open-notes-cross-mode-injection.test.js:149` | dynamic | `public/scripts/agents/orchestrator/spec-runtime.js` | true |
| `tests/orchestrator/open-notes-injection.test.js:20` | module | `public/scripts/agents/orchestrator/open-notes-injection.js` | true |
| `tests/orchestrator/persistence-loop.test.js:19` | module | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/persistence-loop.test.js:23` | module | `public/scripts/agents/orchestrator/loop-default-prompt.js` | true |
| `tests/orchestrator/persistence.test.js:15` | module | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/persistence.test.js:22` | module | `public/scripts/agents/orchestrator/anchors.js` | true |
| `tests/orchestrator/resolve-tool-source.test.js:10` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/resolve-tool-source.test.js:11` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/runtime-trace-export.test.js:12` | module | `public/scripts/agents/orchestrator/runtime-trace-export.js` | true |
| `tests/orchestrator/schema/director-fields.test.js:7` | module | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/orchestrator/schema/director-fields.test.js:13` | module | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/schema/director-fields.test.js:14` | module | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/orchestrator/simulation-payload-adapter.test.js:23` | module | `public/scripts/agents/orchestrator/simulation-payload-adapter.js` | true |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js:133` | dynamic | `public/scripts/agents/orchestrator/agenda-runtime.js` | true |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js:134` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js:135` | dynamic | `public/scripts/agents/orchestrator/spec-runtime.js` | true |
| `tests/orchestrator/skill-resolution-scope-precedence.test.js:41` | dynamic | `public/scripts/agents/orchestrator/skill-resolution.js` | true |
| `tests/orchestrator/skill-resolution-scope-precedence.test.js:242` | dynamic | `public/scripts/agents/orchestrator/skill-resolution.js` | true |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:77` | dynamic | `public/scripts/agents/orchestrator/defaults.js` | true |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:78` | dynamic | `public/scripts/agents/orchestrator/agenda-profile.js` | true |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:79` | dynamic | `public/scripts/agents/orchestrator/persistence.js` | true |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:80` | dynamic | `public/scripts/agents/orchestrator/spec-schema.js` | true |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:81` | dynamic | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:82` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/orchestrator/system-prompt-patch.test.js:2` | module | `public/scripts/agents/orchestrator/system-prompt-patch.js` | true |
| `tests/orchestrator/tool-call-source-tagging.test.js:9` | module | `public/scripts/agents/orchestrator/loop-runtime.js` | true |
| `tests/orchestrator/tool-call-source-tagging.test.js:10` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/orchestrator/tool-call-source-tagging.test.js:14` | module | `public/scripts/agents/orchestrator/simulation-payload-adapter.js` | true |
| `tests/orchestrator/tool-calling-fallback.test.js:2` | module | `public/scripts/agents/orchestrator/tool-calling.js` | true |
| `tests/performance/runtime-smoke.mjs:319` | dynamic | `public/scripts/agents/orchestrator/lorebook-filter.js` | true |
| `tests/performance/worldbook-performance-bench.mjs:13` | module | `public/scripts/agents/orchestrator/lorebook-filter.js` | true |
| `tests/search-tools/orchestrator-tools-register.test.js:7` | module | `public/scripts/agents/orchestrator/register-custom-tool.js` | true |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:113` | dynamic | `public/scripts/agents/orchestrator/loop-tools.js` | true |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:114` | dynamic | `public/scripts/agents/orchestrator/director-tools.js` | true |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:303` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:343` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/director-with-skills.spec.js:107` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/director-with-skills.spec.js:217` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/helpers.js:323` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/skills-ui/playwright/refresh-defaults.spec.js:124` | dynamic | `public/scripts/agents/orchestrator/director-defaults.js` | true |
| `tests/skills-ui/playwright/rp-demo-manual-flow.spec.js:381` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/rp-demo-manual-flow.spec.js:412` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/run-panel-live.spec.js:91` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/run-panel-live.spec.js:152` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/playwright/run-panel-live.spec.js:259` | dynamic | `public/scripts/agents/orchestrator/run-state/store.js` | true |
| `tests/skills-ui/skill-iter-studio-tools.test.js:80` | dynamic | `public/scripts/agents/orchestrator/skill-iter-studio-prompt.js` | true |
| `tests/world-info/provenance.test.js:2` | module | `public/scripts/agents/orchestrator/lorebook-filter.js` | true |

## 根外间接消费者全集

反向传递闭包只表示依赖，测试辅助文件并不因此成为生产消费者。

- `public/init.js`
- `public/script.js`
- `public/scripts/BulkEditOverlay.js`
- `public/scripts/PromptManager.js`
- `public/scripts/RossAscends-mods.js`
- `public/scripts/action-loader-slashcommands.js`
- `public/scripts/action-loader.js`
- `public/scripts/agents/memory/api.js`
- `public/scripts/agents/memory/extract-transaction.js`
- `public/scripts/agents/memory/index.js`
- `public/scripts/agents/memory/main.js`
- `public/scripts/agents/memory/orchestrator-tools.js`
- `public/scripts/agents/memory/read-api.js`
- `public/scripts/agents/memory/schema-iteration/studio.js`
- `public/scripts/agents/memory/ui-templates.js`
- `public/scripts/announcements.js`
- `public/scripts/atria-shell/index.js`
- `public/scripts/atria-shell/learning-center.js`
- `public/scripts/atria-shell/library-runtime-workspaces.js`
- `public/scripts/atria-shell/native-play-host.js`
- `public/scripts/atria-shell/preference-controls.js`
- `public/scripts/atria-shell/utility-workspaces.js`
- `public/scripts/atria-shell/workspace-host.js`
- `public/scripts/atriaContext.js`
- `public/scripts/audio-player.js`
- `public/scripts/authors-note.js`
- `public/scripts/autocomplete/AutoComplete.js`
- `public/scripts/autocomplete/EnhancedMacroAutoCompleteOption.js`
- `public/scripts/autocomplete/MacroAutoComplete.js`
- `public/scripts/autocomplete/MacroAutoCompleteHelper.js`
- `public/scripts/backgrounds.js`
- `public/scripts/backup-sync-center.js`
- `public/scripts/backup-sync/providers.js`
- `public/scripts/bookmarks.js`
- `public/scripts/browser-fixes.js`
- `public/scripts/browser-storage-inspector.js`
- `public/scripts/bulk-edit.js`
- `public/scripts/capability-host.js`
- `public/scripts/cfg-scale.js`
- `public/scripts/character/has-unsaved-openai-preset-changes.js`
- `public/scripts/character/manage-bound-presets-dialog.js`
- `public/scripts/character/presets.js`
- `public/scripts/chat-backups.js`
- `public/scripts/chat-merge-split.js`
- `public/scripts/chat-templates.js`
- `public/scripts/chats.js`
- `public/scripts/custom-request.js`
- `public/scripts/data-maid.js`
- `public/scripts/debug-export.js`
- `public/scripts/dom-handlers.js`
- `public/scripts/extensions/regex/engine.js`
- `public/scripts/extensions/regex/index.js`
- `public/scripts/extensions/regex/redos-reporter.js`
- `public/scripts/extensions/search-tools/index.js`
- `public/scripts/extensions/search-tools/main.js`
- `public/scripts/extensions/search-tools/settings-ui.js`
- `public/scripts/filters.js`
- `public/scripts/floor-state.js`
- `public/scripts/frontend-log-manager.js`
- `public/scripts/generate-task.js`
- `public/scripts/group-chats.js`
- `public/scripts/horde.js`
- `public/scripts/i18n.js`
- `public/scripts/input-md-formatting.js`
- `public/scripts/instruct-mode.js`
- `public/scripts/itemized-prompts.js`
- `public/scripts/iteration-library/index.js`
- `public/scripts/iteration-library/simulation-review/dry-run-capture.js`
- `public/scripts/iteration-library/simulation-review/i18n/index.js`
- `public/scripts/iteration-library/simulation-review/index.js`
- `public/scripts/iteration-library/simulation-review/popup-host.js`
- `public/scripts/iteration-library/simulation-review/popup.js`
- `public/scripts/kai-settings.js`
- `public/scripts/lan-sync.js`
- `public/scripts/lib/atria-tabs.js`
- `public/scripts/lib/edits/conflict-ui.js`
- `public/scripts/lib/edits/index.js`
- `public/scripts/lib/field-help.js`
- `public/scripts/lib/object-diff-view.js`
- `public/scripts/lib/runtime-help.js`
- `public/scripts/loader.js`
- `public/scripts/logging/bootstrap.js`
- `public/scripts/logging/error-adapter.js`
- `public/scripts/logging/incident-reporter.js`
- `public/scripts/logging/index.js`
- `public/scripts/logging/startup-analysis.js`
- `public/scripts/logging/workspace.js`
- `public/scripts/logit-bias.js`
- `public/scripts/logprobs.js`
- `public/scripts/macros.js`
- `public/scripts/macros/definitions/chat-macros.js`
- `public/scripts/macros/definitions/core-macros.js`
- `public/scripts/macros/definitions/env-macros.js`
- `public/scripts/macros/definitions/instruct-macros.js`
- `public/scripts/macros/definitions/state-macros.js`
- `public/scripts/macros/definitions/time-macros.js`
- `public/scripts/macros/definitions/variable-macros.js`
- `public/scripts/macros/engine/MacroBrowser.js`
- `public/scripts/macros/engine/MacroCstWalker.js`
- `public/scripts/macros/engine/MacroDiagnostics.js`
- `public/scripts/macros/engine/MacroEngine.js`
- `public/scripts/macros/engine/MacroEnvBuilder.js`
- `public/scripts/macros/engine/MacroRegistry.js`
- `public/scripts/macros/macro-system.js`
- `public/scripts/message-formatter.js`
- `public/scripts/messages.js`
- `public/scripts/nai-settings.js`
- `public/scripts/native/asset-editor.js`
- `public/scripts/native/embedded-knowledge-promotion.js`
- `public/scripts/native/experience-health-ui.js`
- `public/scripts/native/experience/index.js`
- `public/scripts/native/extensions-workspace.js`
- `public/scripts/native/knowledge-binding-manager.js`
- `public/scripts/native/knowledge-editor.js`
- `public/scripts/native/knowledge-entry-browser.js`
- `public/scripts/native/knowledge-form-controls.js`
- `public/scripts/native/library-revision-editor.js`
- `public/scripts/native/library-revision-history.js`
- `public/scripts/native/library-ui.js`
- `public/scripts/native/library-workspaces.js`
- `public/scripts/native/package-library-resources.js`
- `public/scripts/native/package-permissions.js`
- `public/scripts/native/persona-ui.js`
- `public/scripts/native/play-controls.js`
- `public/scripts/native/play-product.js`
- `public/scripts/native/project-lifecycle.js`
- `public/scripts/native/prompt-authoring.js`
- `public/scripts/native/prompt-presets.js`
- `public/scripts/native/prompt-runtime-controls.js`
- `public/scripts/native/prompt-semantics.js`
- `public/scripts/native/reference-remediation.js`
- `public/scripts/native/regex-authoring.js`
- `public/scripts/native/regex-scopes.js`
- `public/scripts/native/reply-variants.js`
- `public/scripts/native/resource-bundle-controls.js`
- `public/scripts/native/resource-reference-rows.js`
- `public/scripts/native/resource-setup.js`
- `public/scripts/native/runtime-workspace.js`
- `public/scripts/native/save-dependency-recovery.js`
- `public/scripts/native/session-history.js`
- `public/scripts/native/session-naming.js`
- `public/scripts/native/shared-session-ui.js`
- `public/scripts/native/skill-declarations-editor.js`
- `public/scripts/native/skill-organization.js`
- `public/scripts/native/source-editor.js`
- `public/scripts/native/studio-frontend-editor.js`
- `public/scripts/native/studio-knowledge-editor.js`
- `public/scripts/native/studio-workspace.js`
- `public/scripts/native/studio-worlds-editor.js`
- `public/scripts/native/task-binding-ui.js`
- `public/scripts/native/world-editor.js`
- `public/scripts/openai.js`
- `public/scripts/personas.js`
- `public/scripts/popup.js`
- `public/scripts/power-user.js`
- `public/scripts/preset-lorebook-embed.js`
- `public/scripts/preset-manager.js`
- `public/scripts/preset-persistence.js`
- `public/scripts/reasoning.js`
- `public/scripts/request-inspector-entry.js`
- `public/scripts/request-inspector.js`
- `public/scripts/samplerSelect.js`
- `public/scripts/scrapers.js`
- `public/scripts/secrets.js`
- `public/scripts/select2-actionable-single.js`
- `public/scripts/server-history.js`
- `public/scripts/showdown-exclusion.js`
- `public/scripts/skills/api.js`
- `public/scripts/skills/bundled-browser.js`
- `public/scripts/skills/embed-import-dialog.js`
- `public/scripts/skills/embed-lifecycle.js`
- `public/scripts/skills/i18n.js`
- `public/scripts/skills/scope-picker.js`
- `public/scripts/skills/skill-chips.js`
- `public/scripts/skills/skill-editor.js`
- `public/scripts/skills/skill-manager-panel.js`
- `public/scripts/slash-commands.js`
- `public/scripts/slash-commands/SlashCommand.js`
- `public/scripts/slash-commands/SlashCommandArgument.js`
- `public/scripts/slash-commands/SlashCommandAutoCompleteNameResult.js`
- `public/scripts/slash-commands/SlashCommandBreak.js`
- `public/scripts/slash-commands/SlashCommandBreakPoint.js`
- `public/scripts/slash-commands/SlashCommandBrowser.js`
- `public/scripts/slash-commands/SlashCommandClosure.js`
- `public/scripts/slash-commands/SlashCommandCommandAutoCompleteOption.js`
- `public/scripts/slash-commands/SlashCommandCommonEnumsProvider.js`
- `public/scripts/slash-commands/SlashCommandDebugController.js`
- `public/scripts/slash-commands/SlashCommandEnumAutoCompleteOption.js`
- `public/scripts/slash-commands/SlashCommandExecutor.js`
- `public/scripts/slash-commands/SlashCommandNamedArgumentAssignment.js`
- `public/scripts/slash-commands/SlashCommandNamedArgumentAutoCompleteOption.js`
- `public/scripts/slash-commands/SlashCommandParser.js`
- `public/scripts/slash-commands/SlashCommandReturnHelper.js`
- `public/scripts/slash-commands/SlashCommandScope.js`
- `public/scripts/slash-commands/SlashCommandUnnamedArgumentAssignment.js`
- `public/scripts/sse-stream.js`
- `public/scripts/st-context.js`
- `public/scripts/stats.js`
- `public/scripts/storage-inspector.js`
- `public/scripts/storage-management.js`
- `public/scripts/streaming-display.js`
- `public/scripts/swipe-picker.js`
- `public/scripts/sysprompt.js`
- `public/scripts/system-messages.js`
- `public/scripts/tags.js`
- `public/scripts/templates.js`
- `public/scripts/textgen-models.js`
- `public/scripts/textgen-settings.js`
- `public/scripts/tokenizers.js`
- `public/scripts/tool-calling.js`
- `public/scripts/undo-toast.js`
- `public/scripts/user.js`
- `public/scripts/util/AccountStorage.js`
- `public/scripts/utils.js`
- `public/scripts/variable-op-log/index.js`
- `public/scripts/variable-op-log/panel.js`
- `public/scripts/variables.js`
- `public/scripts/welcome-screen.js`
- `public/scripts/world-info.js`
- `public/scripts/world-info/workspace.js`
- `server.js`
- `src/electron/index.js`
- `src/endpoints/native-generation.js`
- `src/endpoints/native-memory.js`
- `src/endpoints/native-session.js`
- `src/endpoints/native-studio.js`
- `src/endpoints/vectors.js`
- `src/native/a2a-service.js`
- `src/native/adapters/generation-host.js`
- `src/native/agent-intelligence/evaluation/adapters.js`
- `src/native/agent-intelligence/evaluation/worker-bridge.js`
- `src/native/agent-intelligence/evaluation/worker.js`
- `src/native/agent-intelligence/evolution-evaluator.js`
- `src/native/agent-intelligence/evolution-observer.js`
- `src/native/agent-intelligence/evolution-service.js`
- `src/native/agent-intelligence/evolution-targets.js`
- `src/native/agent-intelligence/goal-continuation.js`
- `src/native/candidate-comparison.js`
- `src/native/illustration-prompt-service.js`
- `src/native/mcp-media-assets.js`
- `src/native/mcp-service.js`
- `src/native/memory-authority.js`
- `src/native/project-agent-executor.js`
- `src/native/retrieval-compute.js`
- `src/native/retrieval-execution.js`
- `src/native/session-public-work.js`
- `src/native/speech-service.js`
- `src/server-global.js`
- `src/server-main.js`
- `src/server-startup.js`
- `tests/agent-intelligence/adapters.js`
- `tests/agent-intelligence/baseline.mjs`
- `tests/agent-intelligence/baseline.test.js`
- `tests/agent-intelligence/capture.test.js`
- `tests/agent-intelligence/comparison.js`
- `tests/agent-intelligence/comparison.mjs`
- `tests/agent-intelligence/comparison.test.js`
- `tests/agent-intelligence/evaluation-revision.test.js`
- `tests/agent-intelligence/evaluation-skill-work.test.js`
- `tests/agent-intelligence/evolution-consumers.test.js`
- `tests/agent-intelligence/evolution-fixture.js`
- `tests/agent-intelligence/evolution-http.test.js`
- `tests/agent-intelligence/evolution-partial.test.js`
- `tests/agent-intelligence/evolution.test.js`
- `tests/agent-intelligence/f2-sources.test.js`
- `tests/agent-intelligence/feedback-contracts.test.js`
- `tests/agent-intelligence/feedback.test.js`
- `tests/agent-intelligence/judge.js`
- `tests/agent-intelligence/judge.test.js`
- `tests/agent-intelligence/learning-optimizer.test.js`
- `tests/agent-intelligence/live-bridge.js`
- `tests/agent-intelligence/live-bridge.test.js`
- `tests/agent-intelligence/live.mjs`
- `tests/agent-intelligence/m1-development-selection.test.js`
- `tests/agent-intelligence/m1-f2.js`
- `tests/agent-intelligence/m1-f3-lifecycle.test.js`
- `tests/agent-intelligence/m1-f3-promotion.js`
- `tests/agent-intelligence/m1-f3-promotion.test.js`
- `tests/agent-intelligence/m1-f3.js`
- `tests/agent-intelligence/m1-f3.test.js`
- `tests/agent-intelligence/m1-grader.test.js`
- `tests/agent-intelligence/m1-live.mjs`
- `tests/agent-intelligence/m1-quota.test.js`
- `tests/agent-intelligence/m1-renewal.test.js`
- `tests/agent-intelligence/m1-resume.test.js`
- `tests/agent-intelligence/m4-live.js`
- `tests/agent-intelligence/project-recovery.test.js`
- `tests/agent-intelligence/project-strategy.test.js`
- `tests/agent-intelligence/runner-failure.test.js`
- `tests/agent-intelligence/runner.js`
- `tests/agent-intelligence/s21-live.mjs`
- `tests/agent-intelligence/s21-longitudinal-live.js`
- `tests/agent-intelligence/s23-live.mjs`
- `tests/agent-intelligence/s25-live.js`
- `tests/agent-intelligence/s26-live.js`
- `tests/agent-intelligence/s27-live.js`
- `tests/agent-intelligence/s34-live.js`
- `tests/agent-intelligence/sealed-pairs.test.js`
- `tests/agent-intelligence/sources.test.js`
- `tests/agent-runtime/atri-agenda-defaults.test.js`
- `tests/agent-runtime/context-ports.test.js`
- `tests/agent-runtime/durable-recovery.test.js`
- `tests/agent-runtime/engine-kernel.test.js`
- `tests/agent-runtime/engine-mode-recovery.test.js`
- `tests/agent-runtime/handoff-routing.test.js`
- `tests/agent-runtime/kernel.test.js`
- `tests/agent-runtime/legacy-adapter.test.js`
- `tests/agent-runtime/legacy-workflow.test.js`
- `tests/agent-runtime/native-orchestration-prompts.test.js`
- `tests/agent-runtime/parallel.test.js`
- `tests/agent-runtime/policy-controller.test.js`
- `tests/agent-runtime/prepared-context.test.js`
- `tests/agent-runtime/preset-compiler.test.js`
- `tests/agent-runtime/projection.test.js`
- `tests/agent-runtime/races.test.js`
- `tests/agent-runtime/tool-batch.test.js`
- `tests/agent-runtime/workspace-agent-editing.test.js`
- `tests/agent-runtime/workspace-call-counts.test.js`
- `tests/agent-runtime/workspace-host.test.js`
- `tests/agent-runtime/workspace-preset-help.test.js`
- `tests/agent-runtime/workspace-presets.test.js`
- `tests/agent-runtime/workspace-prompt-versions.test.js`
- `tests/agent-runtime/workspace-state.test.js`
- `tests/agent-runtime/workspace-strategy-versions.test.js`
- `tests/atria-shell/app-shell.test.js`
- `tests/atria-shell/asset-editor.test.js`
- `tests/atria-shell/embedded-knowledge-promotion.test.js`
- `tests/atria-shell/knowledge-binding-manager.test.js`
- `tests/atria-shell/knowledge-browser.test.js`
- `tests/atria-shell/knowledge-editor.test.js`
- `tests/atria-shell/learning-center.test.js`
- `tests/atria-shell/library-import-flow.test.js`
- `tests/atria-shell/library-interactions.test.js`
- `tests/atria-shell/library-revision-history.test.js`
- `tests/atria-shell/library-runtime-workspaces.test.js`
- `tests/atria-shell/memory-workspace-lifecycle.test.js`
- `tests/atria-shell/native-personas.test.js`
- `tests/atria-shell/native-play-controls.test.js`
- `tests/atria-shell/native-play-host.test.js`
- `tests/atria-shell/native-play-product.test.js`
- `tests/atria-shell/native-product-workspaces.test.js`
- `tests/atria-shell/native-reply-variants.test.js`
- `tests/atria-shell/native-runtime-p5.test.js`
- `tests/atria-shell/package-library-resources.test.js`
- `tests/atria-shell/package-permissions.test.js`
- `tests/atria-shell/preference-controls.test.js`
- `tests/atria-shell/product-errors.test.js`
- `tests/atria-shell/project-lifecycle.test.js`
- `tests/atria-shell/prompt-authoring-p6.test.js`
- `tests/atria-shell/prompt-preset-receipt.test.js`
- `tests/atria-shell/prompt-runtime-controls.test.js`
- `tests/atria-shell/prompt-semantics.test.js`
- `tests/atria-shell/reference-remediation.test.js`
- `tests/atria-shell/regex-scope-readiness.test.js`
- `tests/atria-shell/resource-bundle-controls.test.js`
- `tests/atria-shell/resource-reference-rows.test.js`
- `tests/atria-shell/runtime-readiness.test.js`
- `tests/atria-shell/save-dependency-recovery.test.js`
- `tests/atria-shell/session-history.test.js`
- `tests/atria-shell/session-naming.test.js`
- `tests/atria-shell/skill-declarations-editor.test.js`
- `tests/atria-shell/source-editor.test.js`
- `tests/atria-shell/studio-experience-p9.test.js`
- `tests/atria-shell/studio-frontend-editor.test.js`
- `tests/atria-shell/studio-knowledge-editor.test.js`
- `tests/atria-shell/studio-workspace-a7.test.js`
- `tests/atria-shell/studio-worlds-editor.test.js`
- `tests/atria-shell/utility-workspaces.test.js`
- `tests/atria-shell/workspace-host.test.js`
- `tests/atria-shell/world-editor.test.js`
- `tests/bookmarks/_mocks/checkpoint-module-stack.js`
- `tests/bookmarks/checkpoint-group.test.js`
- `tests/bookmarks/checkpoint-nosource.test.js`
- `tests/bookmarks/checkpoint-solo.test.js`
- `tests/bootstrap-version-snapshot.test.js`
- `tests/character-presets/ctx-dispatch.test.js`
- `tests/character-presets/ctx-selected-live-state.test.js`
- `tests/character-presets/openai-has-unsaved-changes.test.js`
- `tests/character-presets/orchestrator-collect-unembedded.test.js`
- `tests/character-presets/rename-character-bound-preset.test.js`
- `tests/character-presets/unit.test.js`
- `tests/client-startup-telemetry.test.js`
- `tests/debug-export-android-bridge.test.js`
- `tests/e2e/_lib/page.js`
- `tests/e2e/_lib/ui-character.js`
- `tests/e2e/_lib/ui-chat-merge-split.js`
- `tests/e2e/_lib/ui-iter-studio.js`
- `tests/e2e/_lib/ui-mg-varops.js`
- `tests/e2e/_lib/ui-persona-preset.js`
- `tests/e2e/_lib/ui-worldinfo.js`
- `tests/e2e/_smoke/sanity-sqlite.e2e.js`
- `tests/e2e/_smoke/sanity.e2e.js`
- `tests/e2e/atria-shell/02-native-actions.e2e.js`
- `tests/e2e/atria-shell/05-workspaces.e2e.js`
- `tests/e2e/atria-shell/07-plugins-settings.e2e.js`
- `tests/e2e/atria-shell/08-final-hardening.e2e.js`
- `tests/e2e/atria-shell/09-immersive-integration.e2e.js`
- `tests/e2e/backup-sync-center/01-shell-and-preflight.e2e.js`
- `tests/e2e/browser-storage-inspector/01-enumerate-and-drill.e2e.js`
- `tests/e2e/browser-storage-inspector/02-delete-localstorage-key.e2e.js`
- `tests/e2e/browser-storage-inspector/03-delete-indexeddb.e2e.js`
- `tests/e2e/browser-storage-inspector/04-delete-cachestorage.e2e.js`
- `tests/e2e/browser-storage-inspector/05-mobile-and-cancel.e2e.js`
- `tests/e2e/browser-storage-inspector/06-crud-records.e2e.js`
- `tests/e2e/browser-storage-inspector/_helpers.js`
- `tests/e2e/character/15-import-png.e2e.js`
- `tests/e2e/character/16-import-json.e2e.js`
- `tests/e2e/character/17-import-charx.e2e.js`
- `tests/e2e/character/18-import-byaf.e2e.js`
- `tests/e2e/character/19-create-blank.e2e.js`
- `tests/e2e/character/20-edit-fields.e2e.js`
- `tests/e2e/character/21-avatar-upload.e2e.js`
- `tests/e2e/character/22-duplicate.e2e.js`
- `tests/e2e/character/22b-merge-attributes.e2e.js`
- `tests/e2e/character/23-delete-cascade.e2e.js`
- `tests/e2e/character/23b-bulk-edit.e2e.js`
- `tests/e2e/character/24-replace-world-book-entries.e2e.js`
- `tests/e2e/character/25-replace-popup-three-choices.e2e.js`
- `tests/e2e/character/26-replace-world-book-paths.e2e.js`
- `tests/e2e/character/27-import-embedded-persists-binding.e2e.js`
- `tests/e2e/character/28-replace-real-llm-sweep.e2e.js`
- `tests/e2e/chat/01-first-turn-persistence.e2e.js`
- `tests/e2e/chat/02-streaming-vs-non-streaming.e2e.js`
- `tests/e2e/chat/03-multi-swipe.e2e.js`
- `tests/e2e/chat/04-edit-user-message.e2e.js`
- `tests/e2e/chat/05-edit-assistant-message.e2e.js`
- `tests/e2e/chat/06-delete-single-message.e2e.js`
- `tests/e2e/chat/07-delete-from-here-truncate.e2e.js`
- `tests/e2e/chat/08-continue.e2e.js`
- `tests/e2e/chat/09-regenerate.e2e.js`
- `tests/e2e/chat/10-impersonate.e2e.js`
- `tests/e2e/chat/11-abort-mid-stream.e2e.js`
- `tests/e2e/chat/12-branch-regression.e2e.js`
- `tests/e2e/chat/13-rename-chat.e2e.js`
- `tests/e2e/chat/13c-recent-index.e2e.js`
- `tests/e2e/chat/14-export-import-roundtrip.e2e.js`
- `tests/e2e/chat/15-merge-basic.e2e.js`
- `tests/e2e/chat/16-merge-three-reorder.e2e.js`
- `tests/e2e/chat/17-merge-name-conflict.e2e.js`
- `tests/e2e/chat/18-merge-trim-ranges.e2e.js`
- `tests/e2e/chat/19-merge-repeat-source.e2e.js`
- `tests/e2e/chat/20-split-basic.e2e.js`
- `tests/e2e/chat/21-split-merge-roundtrip.e2e.js`
- `tests/e2e/chat/22-merge-state-isolation.e2e.js`
- `tests/e2e/chat/23-merge-db-mode.e2e.js`
- `tests/e2e/chat/openai-responses.e2e.js`
- `tests/e2e/entry/01-entry-surfaces.e2e.js`
- `tests/e2e/entry/03-account-backup.e2e.js`
- `tests/e2e/extensions/89-regex-pre-and-post.e2e.js`
- `tests/e2e/extensions/91-authors-note-depth.e2e.js`
- `tests/e2e/extensions/97-slash-commands.e2e.js`
- `tests/e2e/extensions/98-function-call-runtime.e2e.js`
- `tests/e2e/generation-basic/abort.e2e.js`
- `tests/e2e/generation-basic/basic.e2e.js`
- `tests/e2e/generation-basic/close-tab-ui-recovery.e2e.js`
- `tests/e2e/generation-basic/close-tab.e2e.js`
- `tests/e2e/generation-basic/iframe-fetch-proxy.e2e.js`
- `tests/e2e/generation-basic/kimi-partial.e2e.js`
- `tests/e2e/generation-basic/persist-to-disk.e2e.js`
- `tests/e2e/generation-basic/plugin-reconnect.e2e.js`
- `tests/e2e/generation-basic/plugin-request.e2e.js`
- `tests/e2e/generation-basic/reconnect.e2e.js`
- `tests/e2e/groups/84-rotation.e2e.js`
- `tests/e2e/groups/86-disable-member.e2e.js`
- `tests/e2e/groups/87-director-pick-speaker.e2e.js`
- `tests/e2e/groups/88-persist-branch-export.e2e.js`
- `tests/e2e/groups/89-group-merge.e2e.js`
- `tests/e2e/groups/_helpers.js`
- `tests/e2e/iterstudio/79-cpa-apply-global-persist.e2e.js`
- `tests/e2e/iterstudio/80-mg-schema-apply-persist.e2e.js`
- `tests/e2e/iterstudio/81-orch-director-apply-persist.e2e.js`
- `tests/e2e/iterstudio/82-cea-character-apply-persist.e2e.js`
- `tests/e2e/iterstudio/83-apply-paths-canonical-write-audit.e2e.js`
- `tests/e2e/iterstudio/84-migration-from-v2.e2e.js`
- `tests/e2e/iterstudio/85-cea-wi-entry-edit.e2e.js`
- `tests/e2e/iterstudio/86-orch-loop-apply-persist.e2e.js`
- `tests/e2e/iterstudio/87-orch-agenda-apply-persist.e2e.js`
- `tests/e2e/iterstudio/88-orch-spec-apply-persist.e2e.js`
- `tests/e2e/iterstudio/89-orch-director-read-first-flow.e2e.js`
- `tests/e2e/iterstudio/90-orch-anchor-drift-diagnosis.e2e.js`
- `tests/e2e/memorygraph/52-extract-render-persist.e2e.js`
- `tests/e2e/memorygraph/53-session-write-floor-anchor.e2e.js`
- `tests/e2e/memorygraph/54-mg-apply-multi-edit.e2e.js`
- `tests/e2e/memorygraph/55-branch-isolates-source-mg.e2e.js`
- `tests/e2e/memorygraph/56-schema-add-field-persists.e2e.js`
- `tests/e2e/memorygraph/57-import-no-id-collision.e2e.js`
- `tests/e2e/memorygraph/58-vector-index-rebuild.e2e.js`
- `tests/e2e/memorygraph/59-read-api-search.e2e.js`
- `tests/e2e/memorygraph/60-mg-var-ops-cooperation.e2e.js`
- `tests/e2e/memorygraph/65-extract-payload-keeps-old-floors.e2e.js`
- `tests/e2e/memorygraph/66-plugin-lane-applied-once.e2e.js`
- `tests/e2e/memorygraph/67-crawl-mode-extract.e2e.js`
- `tests/e2e/memorygraph/memory-os-enabled.e2e.js`
- `tests/e2e/native-session/01-live-runtime.e2e.js`
- `tests/e2e/native-session/02-product-ui.e2e.js`
- `tests/e2e/native-session/03-native-generation-p4.e2e.js`
- `tests/e2e/native-session/04-native-runtime-p5.e2e.js`
- `tests/e2e/native-session/05-compute-budget-g06.e2e.js`
- `tests/e2e/native-session/05-native-authoring-p6.e2e.js`
- `tests/e2e/native-session/06-native-cleanup-p7.e2e.js`
- `tests/e2e/native-session/08-prompt-controls.e2e.js`
- `tests/e2e/native-session/10-studio-redesign.e2e.js`
- `tests/e2e/native-session/11-utilities-redesign.e2e.js`
- `tests/e2e/native-session/12-native-agent-routes.e2e.js`
- `tests/e2e/native-session/13-native-knowledge.e2e.js`
- `tests/e2e/native-session/14-native-authoring.e2e.js`
- `tests/e2e/native-session/14-native-controls.e2e.js`
- `tests/e2e/native-session/15-knowledge-workflows.e2e.js`
- `tests/e2e/native-session/15-native-portability.e2e.js`
- `tests/e2e/native-session/16-native-search.e2e.js`
- `tests/e2e/native-session/16-prompt-presets.e2e.js`
- `tests/e2e/native-session/17-knowledge-originals.e2e.js`
- `tests/e2e/native-session/17-native-localization.e2e.js`
- `tests/e2e/native-session/17-regex-scopes.e2e.js`
- `tests/e2e/native-session/18-experience-p9.e2e.js`
- `tests/e2e/native-session/20-extensions-ui.e2e.js`
- `tests/e2e/native-session/21-task-binding-preflight.e2e.js`
- `tests/e2e/native-session/22-visual-media.e2e.js`
- `tests/e2e/native-session/28-studio-actors.e2e.js`
- `tests/e2e/native-session/29-studio-entrypoints.e2e.js`
- `tests/e2e/native-session/30-studio-worlds.e2e.js`
- `tests/e2e/native-session/31-studio-knowledge.e2e.js`
- `tests/e2e/orchestrator/49-director-cardbound-roundtrip.e2e.js`
- `tests/e2e/orchestrator/67-director-rp-roundtrip-bubble-fidelity.e2e.js`
- `tests/e2e/orchestrator/68-run-panel-stream-final-commit.e2e.js`
- `tests/e2e/orchestrator/71-critic-regex-search-flow.e2e.js`
- `tests/e2e/orchestrator/74-capsule-injection-main-and-sub-share.e2e.js`
- `tests/e2e/orchestrator/75-abort-mid-run.e2e.js`
- `tests/e2e/orchestrator/78-multi-skill-visible-director-and-subagent.e2e.js`
- `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js`
- `tests/e2e/orchestrator/80-lorebook-filter-director.e2e.js`
- `tests/e2e/orchestrator/81-dispatch-barrier-first-chunk-serialization.e2e.js`
- `tests/e2e/personas/100-persona-character-binding.e2e.js`
- `tests/e2e/personas/101-persona-avatar-upload.e2e.js`
- `tests/e2e/personas/102-settings-panels-persist.e2e.js`
- `tests/e2e/personas/103-i18n-language-switch.e2e.js`
- `tests/e2e/personas/99-create-and-switch-persona.e2e.js`
- `tests/e2e/preset/33-save-switch-reflect.e2e.js`
- `tests/e2e/preset/33b-character-default-preset.e2e.js`
- `tests/e2e/preset/34-export-import-roundtrip.e2e.js`
- `tests/e2e/preset/35-character-bound-auto-switch.e2e.js`
- `tests/e2e/preset/36-embedded-skills-roundtrip.e2e.js`
- `tests/e2e/preset/37-iter-studio-apply-global.e2e.js`
- `tests/e2e/preset/38-patch-threshold-persistence.e2e.js`
- `tests/e2e/preset/39-character-bound-edit-sync.e2e.js`
- `tests/e2e/preset/40-card-multi-slot-optgroup.e2e.js`
- `tests/e2e/preset/41-prompt-manager-card-bound-edit.e2e.js`
- `tests/e2e/preset/42-cpa-card-bound-transparent.e2e.js`
- `tests/e2e/preset/43-bind-and-manage.e2e.js`
- `tests/e2e/preset/43b-clear-with-salvage.e2e.js`
- `tests/e2e/preset/45-card-vs-local-same-name.e2e.js`
- `tests/e2e/preset/47-orch-inspect-bound-preset.e2e.js`
- `tests/e2e/preset/48-cea-inspect-bound-preset.e2e.js`
- `tests/e2e/preset/49-card-bound-preset-export-import.e2e.js`
- `tests/e2e/preset/50-iter-studio-apply-embed-summary.e2e.js`
- `tests/e2e/preset/50b-cardbound-active-desync.e2e.js`
- `tests/e2e/preset/51-cardbound-export.e2e.js`
- `tests/e2e/preset/52-cardbound-export-import-roundtrip.e2e.js`
- `tests/e2e/preset/53-cardbound-rename.e2e.js`
- `tests/e2e/preset/54-cardbound-rename-collision-in-card.e2e.js`
- `tests/e2e/preset/55-cardbound-rename-collision-across-origin.e2e.js`
- `tests/e2e/preset/58-hasUnsavedChanges-collision.e2e.js`
- `tests/e2e/preset/59-hasUnsavedChanges-name-mismatch.e2e.js`
- `tests/e2e/preset/60-cardbound-active-onSettingsPresetChange.e2e.js`
- `tests/e2e/preset/61-cardbound-rename-from-dialog.e2e.js`
- `tests/e2e/preset/62-cardbound-remove-promote-to-global.e2e.js`
- `tests/e2e/preset/63-prompt-group-drag-into.e2e.js`
- `tests/e2e/preset/64-card-bound-third-party-compat.e2e.js`
- `tests/e2e/preset/64b-jsr-live-integration.e2e.js`
- `tests/e2e/regression/107-uploads-enoent-selfheal.e2e.js`
- `tests/e2e/regression/112-worldinfo-cache-key-trim.e2e.js`
- `tests/e2e/regression/118-iter-studio-batch-approval-gate.e2e.js`
- `tests/e2e/regression/118-recent-chat-phantom-mint.e2e.js`
- `tests/e2e/regression/125-orch-preset-switch-persist.e2e.js`
- `tests/e2e/regression/126-tiktoken-worker-offthread.e2e.js`
- `tests/e2e/regression/127-branch-reload-recent-chat.e2e.js`
- `tests/e2e/regression/128-rebuild-keeps-chat-pointer.e2e.js`
- `tests/e2e/regression/129-welcome-rename-pointer.e2e.js`
- `tests/e2e/server/39-connection-profile-switch.e2e.js`
- `tests/e2e/server/41-four-backend-sources.e2e.js`
- `tests/e2e/server/42-empty-url-error.e2e.js`
- `tests/e2e/server/43-profile-isolation.e2e.js`
- `tests/e2e/server/44-live-three-backends.e2e.js`
- `tests/e2e/server/45-uploads-self-heal.e2e.js`
- `tests/e2e/server/49-attachment-in-prompt.e2e.js`
- `tests/e2e/server/50-large-character-import.e2e.js`
- `tests/e2e/server/51-data-maid-orphan.e2e.js`
- `tests/e2e/server/52-additional-params-save-and-update-bug.e2e.js`
- `tests/e2e/storage-inspector/01-self-drilldown.e2e.js`
- `tests/e2e/storage-inspector/02-sensitive-and-refresh.e2e.js`
- `tests/e2e/storage-inspector/03-mobile-viewport.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/01-fs-to-sqlite.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/02-sqlite-to-fs.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/03-fs-to-mysql.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/04-mysql-to-fs.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/05-fs-to-postgres.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/06-postgres-to-fs.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/07-sqlite-to-mysql.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/08-mysql-to-sqlite.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/09-sqlite-to-postgres.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/10-postgres-to-sqlite.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/11-mysql-to-postgres.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/12-postgres-to-mysql.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/99-real-data-sqlite-to-fs.e2e.js`
- `tests/e2e/storage/cross-mode-recovery/_lib/recovery-flow.js`
- `tests/e2e/storage/migrate-fs-to-sqlite.e2e.js`
- `tests/e2e/storage/migrate-sqlite-to-fs.e2e.js`
- `tests/e2e/sync/01-pair-and-first-sync.e2e.js`
- `tests/e2e/sync/02-disjoint-clean-sync.e2e.js`
- `tests/e2e/sync/03-conflict-bothModified.e2e.js`
- `tests/e2e/sync/04-delete-vs-edit.e2e.js`
- `tests/e2e/sync/05-category-toggle-and-undo.e2e.js`
- `tests/e2e/sync/06-sqlite-per-record-conflict.e2e.js`
- `tests/e2e/sync/09-mysql-mode-pair-and-sync.e2e.js`
- `tests/e2e/sync/10-postgres-mode-pair-and-sync.e2e.js`
- `tests/e2e/sync/11-cross-engine-sync.e2e.js`
- `tests/e2e/sync/walkthrough-screenshots.e2e.js`
- `tests/e2e/varops/61-multiple-var-ops-per-turn.e2e.js`
- `tests/e2e/varops/61b-conditional-var-op.e2e.js`
- `tests/e2e/varops/62-floor-state-inspector-ui.e2e.js`
- `tests/e2e/varops/63-rollback-one-turn.e2e.js`
- `tests/e2e/varops/64-vars-persist-across-restart.e2e.js`
- `tests/e2e/varops/65-malformed-op-no-pollute.e2e.js`
- `tests/e2e/varops/66-variable-op-log-e2e.e2e.js`
- `tests/e2e/worldinfo/25-activation-strategies.e2e.js`
- `tests/e2e/worldinfo/26-cache-key-trim.e2e.js`
- `tests/e2e/worldinfo/27-bind-character-switch.e2e.js`
- `tests/e2e/worldinfo/28-chat-lore-binding.e2e.js`
- `tests/e2e/worldinfo/29-import-export-roundtrip.e2e.js`
- `tests/e2e/worldinfo/30-bulk-edit.e2e.js`
- `tests/e2e/worldinfo/31-recursive-activation.e2e.js`
- `tests/e2e/worldinfo/32-vectorized-entries.e2e.js`
- `tests/e2e/worldinfo/33-import-array-form-entries.e2e.js`
- `tests/e2e/worldinfo/34-workspace-ui.e2e.js`
- `tests/floor-state/compaction-floor-anchor.test.js`
- `tests/floor-state/instance.test.js`
- `tests/frontend-bootstrap-order.test.js`
- `tests/frontend-bootstrap-ws-overlap.test.js`
- `tests/frontend-dom-ready-bootstrap.test.js`
- `tests/frontend-lazy-account-management.test.js`
- `tests/frontend-lazy-audio-player.test.js`
- `tests/frontend-lazy-bulk-edit-overlay.test.js`
- `tests/frontend-lazy-chat-skill-tools.test.js`
- `tests/frontend-lazy-cropper.test.js`
- `tests/frontend-lazy-request-inspector.test.js`
- `tests/frontend-lazy-select2.test.js`
- `tests/frontend-lazy-variable-ops-panel.test.js`
- `tests/frontend-on-demand-tools.test.js`
- `tests/frontend-post-visible-modules.test.js`
- `tests/frontend-startup-loader.test.js`
- `tests/frontend/ExecutionModes.e2e.js`
- `tests/frontend/ReasoningHiddenBlocks.e2e.js`
- `tests/frontend/agenda-tool-safety.smoke.mjs`
- `tests/frontend/agenda-world-info.smoke.mjs`
- `tests/frontend/agent-runtime-parallel.smoke.mjs`
- `tests/frontend/agent-runtime-projection.smoke.mjs`
- `tests/frontend/agent-runtime-recovery.smoke.mjs`
- `tests/frontend/agent-runtime.smoke.mjs`
- `tests/frontend/agent-workspace-call-counts.smoke.mjs`
- `tests/frontend/agent-workspace-host.smoke.mjs`
- `tests/frontend/agent-workspace-ui.smoke.mjs`
- `tests/frontend/agent-workspace.smoke.mjs`
- `tests/frontend/hm1-memory.smoke.mjs`
- `tests/frontend/memory-extract-transaction.smoke.mjs`
- `tests/frontend/memory-os-graph.smoke.mjs`
- `tests/frontend/memory-os-history.smoke.mjs`
- `tests/frontend/memory-os-source.smoke.mjs`
- `tests/frontend/native-frontend-authoring.smoke.mjs`
- `tests/frontend/native-frontend-heavy.smoke.mjs`
- `tests/frontend/orchestration-engine.smoke.mjs`
- `tests/frontend/project-agent-recovery.smoke.mjs`
- `tests/frontend/speech-completion.smoke.mjs`
- `tests/game-runtime/experience-ready-p4.test.js`
- `tests/game-runtime/llm-orchestrator-narrative.test.js`
- `tests/game-runtime/ui-full-host.test.js`
- `tests/game-runtime/ui-host-surfaces.test.js`
- `tests/generate-task/dispatch.test.js`
- `tests/generate-task/integration.test.js`
- `tests/generate-task/pure.test.js`
- `tests/generate-task/response-failures.test.js`
- `tests/iteration-library/simulation-review/i18n-smoke.test.js`
- `tests/iteration-library/simulation-review/popup.test.js`
- `tests/jest.setup.js`
- `tests/logging/backend-consolidation.test.js`
- `tests/logging/backend-module-migration.test.js`
- `tests/logging/diagnostics-mounting.test.js`
- `tests/logging/frontend-adapters.test.js`
- `tests/logging/frontend-consolidation.test.js`
- `tests/logging/frontend-startup-migration.test.js`
- `tests/logging/l08-attribution-fixtures.test.js`
- `tests/logging/l08-high-value-wiring.test.js`
- `tests/logging/l08-module-terminal-incidents.test.js`
- `tests/logging/l08-residual-coverage.test.js`
- `tests/logging/l09-cleanup.test.js`
- `tests/logging/l09-destructive-actions.test.js`
- `tests/logging/source-identity.test.js`
- `tests/logging/startup-analysis-structure.test.js`
- `tests/logging/startup-integration.test.js`
- `tests/logging/workspace-i18n.test.js`
- `tests/logging/workspace-structure.test.js`
- `tests/logging/worldinfo-mobile-anchor.test.js`
- `tests/logging/worldinfo-mobile-bulk-state.test.js`
- `tests/memory-graph/adapter.test.js`
- `tests/memory-graph/compaction-floor-range-rollup.test.js`
- `tests/memory-graph/create-node-floor-range.test.js`
- `tests/memory-graph/extract-transaction-schema-retry.test.js`
- `tests/memory-graph/extraction-floor-range.test.js`
- `tests/memory-graph/fact-extraction-pipeline.test.js`
- `tests/memory-graph/guarded-session.test.js`
- `tests/memory-graph/h0-baseline.test.js`
- `tests/memory-graph/injection-window.test.js`
- `tests/memory-graph/list-candidates-no-seq-window.test.js`
- `tests/memory-graph/orchestrator-tools-register.test.js`
- `tests/memory-graph/persistent-injection-recency-horizon.test.js`
- `tests/memory-graph/read-api.test.js`
- `tests/memory-graph/role-split-floor-provenance.test.js`
- `tests/memory-graph/schema-floor-range-flag.test.js`
- `tests/memory-graph/session-commit-anchor.test.js`
- `tests/memory-graph/tool-output-floor-range.test.js`
- `tests/memory-graph/wi-scan-listeners.test.js`
- `tests/message-delete-compat.test.js`
- `tests/mg-schema-iteration/apply-pending-edits.test.js`
- `tests/mg-schema-iteration/task-messages-toolcall-roundtrip.test.js`
- `tests/nai-settings.test.js`
- `tests/native/a2a-consumer-s31.test.js`
- `tests/native/activity-host-p5.test.js`
- `tests/native/activity-runtime-p5.test.js`
- `tests/native/actor-identity-s15.test.js`
- `tests/native/agent-goals-s11.test.js`
- `tests/native/agent-goals-s12.test.js`
- `tests/native/agent-goals-s13.test.js`
- `tests/native/agent-goals-s14.test.js`
- `tests/native/agent-settings.test.js`
- `tests/native/asset-delivery-p5.test.js`
- `tests/native/async-cognition-s25.test.js`
- `tests/native/authority-frontend-c3.test.js`
- `tests/native/authority-integration-c4.test.js`
- `tests/native/authority-narrator-c3.test.js`
- `tests/native/authority-publication-c3.test.js`
- `tests/native/authority-turn-c3.test.js`
- `tests/native/background-task-app-bridge-g2.test.js`
- `tests/native/candidate-comparison-s24.test.js`
- `tests/native/capability-retirement.test.js`
- `tests/native/closed-authority-preflight.test.mjs`
- `tests/native/cognition-disclosure-s16.test.js`
- `tests/native/cognition-inspection-s21.test.js`
- `tests/native/cognition-simulation-s21.test.js`
- `tests/native/comparison-http-s24.test.js`
- `tests/native/context-compilation-g02.test.js`
- `tests/native/continuity-runtime-p7.test.js`
- `tests/native/credential-target-review-ui.test.js`
- `tests/native/desire-intention-s17.test.js`
- `tests/native/event-appraisal-s18.test.js`
- `tests/native/experience-resources.test.js`
- `tests/native/expression-host-s27.test.js`
- `tests/native/extensions-workspace.test.js`
- `tests/native/frontend-bridge.test.js`
- `tests/native/frontend-heavy.test.js`
- `tests/native/generation-budget-p2.test.js`
- `tests/native/generation-local-work.test.js`
- `tests/native/helpers/authority-restore-process.js`
- `tests/native/helpers/authority-turn-fixture.js`
- `tests/native/helpers/frontend-heavy-harness.js`
- `tests/native/helpers/illustration-browser-fixture.js`
- `tests/native/helpers/run-fixture.js`
- `tests/native/helpers/runtime-checkpoint-restart-worker.mjs`
- `tests/native/helpers/session-task-restart-worker.mjs`
- `tests/native/hypothetical-http-s22.test.js`
- `tests/native/illustration-core.test.js`
- `tests/native/illustration-image.test.js`
- `tests/native/illustration-prompt.test.js`
- `tests/native/information-session-p6.test.js`
- `tests/native/lifecycle-scheduler-p4.test.js`
- `tests/native/long-memory-turn-consumer-g06.test.js`
- `tests/native/long-term-storage.test.js`
- `tests/native/long-turn-consumer-g06.test.js`
- `tests/native/mcp-artifacts.test.js`
- `tests/native/mcp-cognition-lifecycle.test.js`
- `tests/native/mcp-consumer-s30.test.js`
- `tests/native/mcp-credential-targets.test.js`
- `tests/native/mcp-delegated-generation.test.js`
- `tests/native/mcp-generation-lifecycle.test.js`
- `tests/native/mcp-media-binary.test.js`
- `tests/native/mcp-media-observe.test.js`
- `tests/native/mcp-memory-adapter.test.js`
- `tests/native/mcp-memory-authority.test.js`
- `tests/native/mcp-project-adapter.test.js`
- `tests/native/mcp-project-generation.test.js`
- `tests/native/mcp-runtime-observe.test.js`
- `tests/native/mcp-session-history.test.js`
- `tests/native/mcp-session-observe.test.js`
- `tests/native/mcp-turn-review.test.js`
- `tests/native/memory-applicability-s20.test.js`
- `tests/native/model-prompt-runtime-p4.test.js`
- `tests/native/model-prompt-runtime-p6.test.js`
- `tests/native/model-prompt-runtime-persistence.test.js`
- `tests/native/native-secret-flow.test.js`
- `tests/native/native-skill-platform.test.js`
- `tests/native/optional-budget-http-s26.test.js`
- `tests/native/optional-budget-s26.test.js`
- `tests/native/package-processing-cp2.test.js`
- `tests/native/package-runtime-cp1.test.js`
- `tests/native/package-runtime-cp3.test.js`
- `tests/native/package-turn-memory-bridge-g3.test.js`
- `tests/native/performance-preparation.test.js`
- `tests/native/persona-context.test.js`
- `tests/native/persona-session.test.js`
- `tests/native/persona-shared-host.test.js`
- `tests/native/prediction-host-s23.test.js`
- `tests/native/prediction-http-s23.test.js`
- `tests/native/project-agent-http.test.js`
- `tests/native/project-agent.test.js`
- `tests/native/project-async-s25.test.js`
- `tests/native/prompt-candidates.test.js`
- `tests/native/prompt-presets.test.js`
- `tests/native/provider-discovery.test.js`
- `tests/native/responses-provider-g04.test.js`
- `tests/native/retrieval-compute-g05.test.js`
- `tests/native/retrieval-runtime.test.js`
- `tests/native/runtime-checkpoint-consumer.test.js`
- `tests/native/runtime-http.test.js`
- `tests/native/session-history-p2.test.js`
- `tests/native/session-runtime-http.test.js`
- `tests/native/session-skill-continuation.test.js`
- `tests/native/session-task-continuation.test.js`
- `tests/native/shared-runtime-p8.test.js`
- `tests/native/simulation-session.test.js`
- `tests/native/speech-consumer-s28.test.js`
- `tests/native/startup-play-readiness.test.js`
- `tests/native/studio-health-p9.test.js`
- `tests/native/studio-http.test.js`
- `tests/native/studio-native-envelope-g04.test.js`
- `tests/native/studio-resource-http.test.js`
- `tests/native/task-binding-preflight.test.js`
- `tests/native/task-binding-ui.test.js`
- `tests/native/task-runtime-p3.test.js`
- `tests/native/theory-of-mind-s19.test.js`
- `tests/native/transformers-local-work-g05.test.js`
- `tests/native/visual-novelai-slice.test.js`
- `tests/native/world-evidence-use-g06.test.js`
- `tests/orch-iteration/assistantmsg-edits-v3.test.js`
- `tests/orch-iteration/control-tools.test.js`
- `tests/orch-iteration/popup-bug-regression.test.js`
- `tests/orch-iteration/read-fields.test.js`
- `tests/orch-iteration/sandbox-result.test.js`
- `tests/orch-iteration/session-store.test.js`
- `tests/orch-iteration/task-messages-toolcall-roundtrip.test.js`
- `tests/orch-iteration/tool-display.test.js`
- `tests/orchestrator-agent-preset-resolver/unit.test.js`
- `tests/orchestrator-skills/skill-orchestration-tools.test.js`
- `tests/orchestrator-skills/skill-resolution.test.js`
- `tests/orchestrator/agenda-host-gate.test.js`
- `tests/orchestrator/agenda-spec-customs-seed.test.js`
- `tests/orchestrator/agenda-tool-safety.test.js`
- `tests/orchestrator/agenda-world-info.test.js`
- `tests/orchestrator/agent-prompt-preset-routing-data.test.js`
- `tests/orchestrator/api-fallback.test.js`
- `tests/orchestrator/chat-read-range-pair-expansion.test.js`
- `tests/orchestrator/critic-regex-search-tool-primitives.test.js`
- `tests/orchestrator/custom-tool-bridge-st.test.js`
- `tests/orchestrator/custom-tool-flags.test.js`
- `tests/orchestrator/custom-tool-iter-studio.test.js`
- `tests/orchestrator/custom-tool-portable-roundtrip.test.js`
- `tests/orchestrator/custom-tool-register.test.js`
- `tests/orchestrator/custom-tool-runtime-agenda.test.js`
- `tests/orchestrator/custom-tool-runtime-director.test.js`
- `tests/orchestrator/custom-tool-runtime-loop.test.js`
- `tests/orchestrator/custom-tool-runtime-spec.test.js`
- `tests/orchestrator/custom-tool-sanitize.test.js`
- `tests/orchestrator/custom-tool-studio-prompt.test.js`
- `tests/orchestrator/default-custom-tools.test.js`
- `tests/orchestrator/director-default-prompt-presets.test.js`
- `tests/orchestrator/director-factory-presets.test.js`
- `tests/orchestrator/director-load-shape.test.js`
- `tests/orchestrator/director-preset-swap.test.js`
- `tests/orchestrator/director-tools-draft-search.test.js`
- `tests/orchestrator/director-tools-runround-settle.test.js`
- `tests/orchestrator/director/abort.test.js`
- `tests/orchestrator/director/agent-task-messages.test.js`
- `tests/orchestrator/director/content-payload.test.js`
- `tests/orchestrator/director/default-prompt.test.js`
- `tests/orchestrator/director/digest.test.js`
- `tests/orchestrator/director/dispatch-claim.test.js`
- `tests/orchestrator/director/integration.test.js`
- `tests/orchestrator/director/memory-scout-iou.test.js`
- `tests/orchestrator/director/notes-subagents.test.js`
- `tests/orchestrator/director/profile-shape.test.js`
- `tests/orchestrator/director/studio-adapter.test.js`
- `tests/orchestrator/director/sub-messages.test.js`
- `tests/orchestrator/director/subagent-max-rounds.test.js`
- `tests/orchestrator/director/tools.test.js`
- `tests/orchestrator/dispatch-barrier/dispatch-barrier.test.js`
- `tests/orchestrator/editor-ops/context-replace.test.js`
- `tests/orchestrator/editor-ops/error.test.js`
- `tests/orchestrator/editor-ops/patch.test.js`
- `tests/orchestrator/editor-ops/pipe-from.test.js`
- `tests/orchestrator/editor-ops/reasoning-sections.test.js`
- `tests/orchestrator/editor-ops/slicing.test.js`
- `tests/orchestrator/execution-mode-contract.test.js`
- `tests/orchestrator/factory-preset-shape.test.js`
- `tests/orchestrator/get-effective-profile-presets.test.js`
- `tests/orchestrator/grep-tool.test.js`
- `tests/orchestrator/iter-studio-lorebook-filter.test.js`
- `tests/orchestrator/iter-studio-session-store.test.js`
- `tests/orchestrator/loop-integration.test.js`
- `tests/orchestrator/loop-iteration.test.js`
- `tests/orchestrator/loop-runtime.test.js`
- `tests/orchestrator/loop-tools-chat.test.js`
- `tests/orchestrator/loop-tools-lorebook-filter.test.js`
- `tests/orchestrator/loop-tools-lorebook-force-activate.test.js`
- `tests/orchestrator/loop-tools-lorebook.test.js`
- `tests/orchestrator/loop-tools-note.test.js`
- `tests/orchestrator/loop-tools-registration.test.js`
- `tests/orchestrator/loop-tools-simulation.test.js`
- `tests/orchestrator/lorebook-filter-persistence.test.js`
- `tests/orchestrator/lorebook-filter.test.js`
- `tests/orchestrator/main-on-world-info-finalized-filter.test.js`
- `tests/orchestrator/multi-skill-visible-resolver.test.js`
- `tests/orchestrator/notes-panel-refresh.test.js`
- `tests/orchestrator/open-notes-cross-mode-injection.test.js`
- `tests/orchestrator/open-notes-injection.test.js`
- `tests/orchestrator/persistence-loop.test.js`
- `tests/orchestrator/persistence.test.js`
- `tests/orchestrator/resolve-tool-source.test.js`
- `tests/orchestrator/runtime-trace-export.test.js`
- `tests/orchestrator/schema/director-fields.test.js`
- `tests/orchestrator/simulation-payload-adapter.test.js`
- `tests/orchestrator/skill-resolution-runtime-plumbing.test.js`
- `tests/orchestrator/skill-resolution-scope-precedence.test.js`
- `tests/orchestrator/spec-agenda-loop-three-modes.test.js`
- `tests/orchestrator/system-prompt-patch.test.js`
- `tests/orchestrator/tool-call-source-tagging.test.js`
- `tests/orchestrator/tool-calling-fallback.test.js`
- `tests/performance/runtime-smoke.mjs`
- `tests/performance/worldbook-performance-bench.mjs`
- `tests/regex-engine/execution-plan.test.js`
- `tests/regex-engine/lane-semantics.test.js`
- `tests/regex-engine/native-scopes.test.js`
- `tests/search-tools/orchestrator-tools-register.test.js`
- `tests/search-tools/persistence.test.js`
- `tests/secret-inputs.test.js`
- `tests/server-lazy-horde-router.test.js`
- `tests/server-lazy-search-router.test.js`
- `tests/server-lazy-sync-router.test.js`
- `tests/skills-ui/bundled-browser.test.js`
- `tests/skills-ui/embed-import-dialog.test.js`
- `tests/skills-ui/embed-lifecycle.test.js`
- `tests/skills-ui/playwright/card-bound-cleanup.spec.js`
- `tests/skills-ui/playwright/character-export-with-skills.spec.js`
- `tests/skills-ui/playwright/cpa-orchestrator-optimize-proactive-sweep.spec.js`
- `tests/skills-ui/playwright/cpa-orchestrator-optimize-skill.spec.js`
- `tests/skills-ui/playwright/critic-regex-search.spec.js`
- `tests/skills-ui/playwright/director-with-skills.spec.js`
- `tests/skills-ui/playwright/embed-import-flow.spec.js`
- `tests/skills-ui/playwright/helpers.js`
- `tests/skills-ui/playwright/iter-bus-regression.spec.js`
- `tests/skills-ui/playwright/iter-studio-create-skill.spec.js`
- `tests/skills-ui/playwright/iter-studio-skill-proposal-card.spec.js`
- `tests/skills-ui/playwright/orchestrator-skill-chips.spec.js`
- `tests/skills-ui/playwright/preset-export-with-skills.spec.js`
- `tests/skills-ui/playwright/proposal-bus-flows.spec.js`
- `tests/skills-ui/playwright/refresh-defaults.spec.js`
- `tests/skills-ui/playwright/rp-demo-manual-flow.spec.js`
- `tests/skills-ui/playwright/run-panel-live.spec.js`
- `tests/skills-ui/playwright/scope-migration.spec.js`
- `tests/skills-ui/playwright/skill-conflict.spec.js`
- `tests/skills-ui/playwright/skill-edit-content-diff.spec.js`
- `tests/skills-ui/playwright/skill-manager-flow.spec.js`
- `tests/skills-ui/scope-picker.test.js`
- `tests/skills-ui/skill-chips.test.js`
- `tests/skills-ui/skill-editor.test.js`
- `tests/skills-ui/skill-iter-studio-tools.test.js`
- `tests/skills-ui/skill-manager-panel.test.js`
- `tests/skills/api.test.js`
- `tests/skills/embed-lifecycle-orch-preset.test.js`
- `tests/skills/scope-picker.test.js`
- `tests/startup-launcher-telemetry.test.js`
- `tests/startup-milestone-telemetry.test.js`
- `tests/variables/path.test.js`
- `tests/world-info/provenance.test.js`
- `tests/world-info/state-events-floor-state.test.js`
- `tests/world-info/timed-effects-baseline.test.js`
- `tests/world-info/workspace-boot-order.test.js`
- `tests/world-info/workspace-embedded-contract.test.js`

## 计算动态加载点全集

不能静态求值的点全部公开，不以未命中旧字面路径视作无引用。含通用 Extension/Plugin/Host 加载器；外部安装内容未读取，真实注册/启动/拒绝行为仍 BLOCKED。

| 文件:行 | 种类 | 表达式 |
| --- | --- | --- |
| `android-app/app/src/main/assets/nodejs-project/bootstrap.js:99` | dynamic | `import(serverEntryUrl)` |
| `android-app/scripts/fetch-nodejs-mobile.mjs:146` | URL | `new URL(directAssetUrl)` |
| `public/lib/epub.min.js:1` | URL | `new URL(t)` |
| `public/lib/epub.min.js:1` | URL | `new URL(t,this.base)` |
| `public/lib/epub.min.js:1` | URL | `new URL(t)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t,e)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t,e)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(e.pathToFileURL(t))` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t,window.location)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(e,i)` |
| `public/lib/pdf.min.mjs:21` | URL | `new URL(t,window.location)` |
| `public/lib/pdf.min.mjs:21` | Worker | `new Worker(t,{type:"module"})` |
| `public/lib/pdf.min.mjs:21` | dynamic | `import(this.workerSrc)` |
| `public/lib/pdf.worker.min.mjs:21` | URL | `new URL(e,t)` |
| `public/lib/pdf.worker.min.mjs:21` | URL | `new URL(e)` |
| `public/script.js:12237` | Worker | `new Worker(new URL('./scripts/workers/object-patch-worker.js', import.meta.url), { type: 'module' })` |
| `public/script.js:15512` | URL | `new URL(requestUrl, window.location.origin)` |
| `public/script.js:21920` | URL | `new URL(source)` |
| `public/scripts/agents/memory/inspector-compute.js:38` | Worker | `new Worker(new URL('./workers/inspector.js', import.meta.url), { type: 'module' })` |
| `public/scripts/atria-shell/navigation-authority.js:62` | URL | `new URL(windowRef.location?.href &#124;&#124; 'http://localhost/')` |
| `public/scripts/atria-shell/navigation-authority.js:77` | URL | `new URL(windowRef.location?.href &#124;&#124; 'http://localhost/')` |
| `public/scripts/client-tokenizers/sentencepiece-adapter.js:43` | Worker | `new Worker(` |
| `public/scripts/client-tokenizers/tiktoken-adapter.js:34` | Worker | `new Worker(` |
| `public/scripts/client-tokenizers/tiktoken-adapter.js:103` | dynamic | `import(\`/lib/tokenizers/js-tiktoken/ranks/${encodingName}.js\`)` |
| `public/scripts/client-tokenizers/web-tokenizer-adapter.js:45` | Worker | `new Worker(new URL('../workers/tokenizer-worker.js', import.meta.url))` |
| `public/scripts/kai-settings.js:83` | URL | `new URL(value)` |
| `public/scripts/logging/fetch-adapter.js:164` | URL | `new URL(urlValue, locationObject.href)` |
| `public/scripts/login.js:317` | URL | `new URL(window.location.href)` |
| `public/scripts/native/extension-runtime.js:5` | dynamic | `import(url)` |
| `public/scripts/native/frontend/media.js:76` | URL | `new URL(entry.source.url)` |
| `public/scripts/native/retrieval-contracts.js:40` | URL | `new URL(text(value.endpoint, 'Endpoint', 2048))` |
| `public/scripts/openai.js:984` | URL | `new URL(oai_settings.reverse_proxy)` |
| `public/scripts/scrapers.js:200` | URL | `new URL(link)` |
| `public/scripts/scrapers.js:372` | URL | `new URL(fandom)` |
| `public/scripts/tags.js:2765` | URL | `new URL(avatarSrc, window.location.origin)` |
| `public/scripts/textgen-settings.js:409` | URL | `new URL(value)` |
| `public/scripts/utils.js:286` | URL | `new URL(value)` |
| `public/scripts/utils.js:1991` | URL | `new URL(trimmed)` |
| `public/scripts/workers/tiktoken-worker.js:22` | dynamic | `import(\`/lib/tokenizers/js-tiktoken/ranks/${encodingName}.js\`)` |
| `public/shared/native-frontend-media.js:10` | URL | `new URL(value.url)` |
| `public/shared/native-frontend-media.js:35` | URL | `new URL(source.url)` |
| `public/shared/native-safe-prose.js:6` | URL | `new URL(value)` |
| `public/shared/novelai-illustration.js:32` | URL | `new URL(connection.endpoint)` |
| `src/additional-headers.js:253` | URL | `new URL(server)` |
| `src/atria-dispatch/providers/chat-completions/azure-openai.js:84` | URL | `new URL(\`/openai/deployments/${azure_deployment_name}/chat/completions\`, azure_base_url)` |
| `src/atria-dispatch/providers/chat-completions/claude.js:122` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_CLAUDE)` |
| `src/atria-dispatch/providers/chat-completions/deepseek.js:51` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_DEEPSEEK)` |
| `src/atria-dispatch/providers/chat-completions/makersuite.js:111` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_VERTEX_AI)` |
| `src/atria-dispatch/providers/chat-completions/makersuite.js:132` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_MAKERSUITE)` |
| `src/atria-dispatch/providers/chat-completions/mistralai.js:45` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_MISTRAL)` |
| `src/atria-dispatch/providers/chat-completions/openai-compatible.js:501` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_MOONSHOT)` |
| `src/atria-dispatch/providers/chat-completions/openai-compatible.js:540` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; defaultApiUrl)` |
| `src/atria-dispatch/providers/chat-completions/xai.js:44` | URL | `new URL(body.reverse_proxy &#124;&#124; body.base_url &#124;&#124; API_XAI)` |
| `src/atria-dispatch/providers/kobold.js:107` | URL | `new URL(apiServer)` |
| `src/atria-dispatch/providers/text-completions/dispatch.js:181` | URL | `new URL(apiServer)` |
| `src/command-line.js:348` | URL | `new URL(` |
| `src/command-line.js:356` | URL | `new URL(` |
| `src/command-line.js:381` | URL | `new URL(` |
| `src/endpoints/backends/chat-completions.js:570` | URL | `new URL(request.body.reverse_proxy &#124;&#124; request.body.base_url &#124;&#124; API_MISTRAL)` |
| `src/endpoints/backends/chat-completions.js:601` | URL | `new URL(request.body.reverse_proxy &#124;&#124; request.body.base_url &#124;&#124; API_DEEPSEEK.replace('/beta', ''))` |
| `src/endpoints/backends/chat-completions.js:606` | URL | `new URL(request.body.reverse_proxy &#124;&#124; request.body.base_url &#124;&#124; API_XAI)` |
| `src/endpoints/backends/chat-completions.js:628` | URL | `new URL(request.body.reverse_proxy &#124;&#124; request.body.base_url &#124;&#124; API_MOONSHOT)` |
| `src/endpoints/backends/chat-completions.js:636` | URL | `new URL(request.body.reverse_proxy &#124;&#124; request.body.base_url &#124;&#124; API_CLAUDE)` |
| `src/endpoints/backends/chat-completions.js:798` | URL | `new URL(\`/openai/deployments/${azure_deployment_name}/chat/completions\`, azure_base_url)` |
| `src/endpoints/backends/chat-completions.js:885` | URL | `new URL(\`${API_WORKERS_AI}/${encodeURIComponent(accountId)}/ai/models/search\`)` |
| `src/endpoints/backends/chat-completions.js:923` | URL | `new URL(urlJoin(apiUrl, '/models'))` |
| `src/endpoints/backends/google-models.js:37` | URL | `new URL(modelsUrl)` |
| `src/endpoints/backends/kobold.js:100` | URL | `new URL(server)` |
| `src/endpoints/backends/kobold.js:143` | URL | `new URL(server)` |
| `src/endpoints/content-manager.js:878` | URL | `new URL(url)` |
| `src/endpoints/content-manager.js:1178` | URL | `new URL(url)` |
| `src/endpoints/native-generation.js:901` | URL | `new URL(request.body.endpoint)` |
| `src/endpoints/native-skills.js:107` | URL | `new URL(i.url)` |
| `src/endpoints/search.js:56` | URL | `new URL(href, 'https://duckduckgo.com')` |
| `src/endpoints/search.js:81` | URL | `new URL(href, baseUrl)` |
| `src/endpoints/search.js:81` | URL | `new URL(href)` |
| `src/endpoints/search.js:161` | URL | `new URL(url)` |
| `src/endpoints/search.js:217` | URL | `new URL(url)` |
| `src/endpoints/search.js:258` | URL | `new URL(url)` |
| `src/endpoints/search.js:295` | URL | `new URL(url)` |
| `src/endpoints/search.js:337` | URL | `new URL(url)` |
| `src/endpoints/search.js:662` | URL | `new URL(baseUrl)` |
| `src/endpoints/search.js:713` | URL | `new URL(normalizedBaseUrl)` |
| `src/endpoints/search.js:725` | URL | `new URL(clientHref, normalizedBaseUrl)` |
| `src/endpoints/tokenizers.js:85` | URL | `new URL(model)` |
| `src/endpoints/users-private.js:218` | URL | `new URL(String(input).trim())` |
| `src/logging/failure-classifier.js:15` | URL | `new URL(raw)` |
| `src/logging/provenance.js:13` | URL | `new URL(raw)` |
| `src/native/adapters/comfyui-image-adapter.js:71` | URL | `new URL(connection.endpoint)` |
| `src/native/adapters/image-transport.js:6` | URL | `new URL(endpoint)` |
| `src/native/adapters/native-messages-provider.js:146` | URL | `new URL(connection.endpoint)` |
| `src/native/adapters/provider-discovery.js:8` | URL | `new URL(connection.endpoint)` |
| `src/native/adapters/runninghub-image-adapter.js:7` | URL | `new URL(value)` |
| `src/native/adapters/runninghub-image-adapter.js:8` | URL | `new URL(imageEndpoint(endpoint))` |
| `src/native/adapters/webui-image-adapter.js:25` | URL | `new URL(connection.endpoint)` |
| `src/native/agent-intelligence/evolution-evaluator.js:28` | URL | `new URL(name, import.meta.url)` |
| `src/native/authoring-reference.js:46` | URL | `new URL('../../' + selected[2], import.meta.url)` |
| `src/native/extension-install.js:15` | URL | `new URL(value)` |
| `src/native/extension-install.js:28` | URL | `new URL(url)` |
| `src/native/extensions-store.js:79` | URL | `new URL(input.sourceUrl)` |
| `src/native/host-plugin-loader.js:11` | dynamic | `import(specifier)` |
| `src/native/model-prompt-runtime/contracts.js:231` | URL | `new URL(item)` |
| `src/native/model-prompt-runtime/contracts.js:340` | URL | `new URL(endpoint)` |
| `src/native/model-prompt-runtime/credential-fetch.js:22` | URL | `new URL(String(url))` |
| `src/native/model-prompt-runtime/credential-fetch.js:26` | URL | `new URL(target)` |
| `src/native/model-prompt-runtime/credential-fetch.js:31` | URL | `new URL(String(url))` |
| `src/native/model-prompt-runtime/credential-fetch.js:31` | URL | `new URL(target)` |
| `src/native/model-prompt-runtime/credential-targets.js:14` | URL | `new URL(endpoint)` |
| `src/native/model-prompt-runtime/route-resolver.js:43` | URL | `new URL(connection.endpoint)` |
| `src/native/protocol-endpoint.js:5` | URL | `new URL(url)` |
| `src/native/repositories/persona-repo.js:237` | dynamic | `import(pathToFileURL(owner.resolve('@jsquash/' + format + '/decode.js')).href)` |
| `src/native/retrieval-execution.js:77` | URL | `new URL(profile.endpoint)` |
| `src/plugin-loader.js:101` | URL | `new URL(raw)` |
| `src/plugin-loader.js:102` | URL | `new URL(parsed.toString())` |
| `src/plugin-loader.js:131` | URL | `new URL(normalized)` |
| `src/plugin-loader.js:133` | URL | `new URL(normalizedUrl.toString())` |
| `src/plugin-loader.js:732` | dynamic | `import(fileUrl)` |
| `src/request-inspector.js:66` | URL | `new URL(raw)` |
| `src/updater.js:36` | require | `require(path.join(serverDirectory, 'package.json'))` |
| `src/updater.js:54` | URL | `new URL(normalized)` |
| `src/util.js:140` | require | `require(path.join(serverDirectory, './package.json'))` |
| `src/util.js:193` | require | `require(path.join(serverDirectory, './package.json'))` |
| `src/util.js:1043` | URL | `new URL(endpoint)` |
| `src/util.js:1273` | URL | `new URL(url)` |
| `src/vectors/extras-vectors.js:39` | URL | `new URL(apiUrl)` |
| `src/vectors/llamacpp-vectors.js:26` | URL | `new URL(urlJoin(trimV1(baseUrl), '/v1/embeddings'))` |
| `src/vectors/ollama-vectors.js:26` | URL | `new URL(baseUrl)` |
| `src/vectors/rerank.js:163` | URL | `new URL(apiUrl)` |
| `src/vectors/vllm-vectors.js:27` | URL | `new URL(urlJoin(trimV1(baseUrl), '/v1/embeddings'))` |
| `tests/agent-intelligence/comparison.js:24` | URL | `new URL(name, import.meta.url)` |
| `tests/agent-intelligence/evaluation-revision.test.js:21` | URL | `new URL(dependency, import.meta.url)` |
| `tests/agent-intelligence/judge.js:53` | URL | `new URL(name, import.meta.url)` |
| `tests/agent-intelligence/live-bridge.js:23` | URL | `new URL(endpoint)` |
| `tests/agent-intelligence/m1-live.mjs:156` | URL | `new URL(f, import.meta.url)` |
| `tests/agent-intelligence/runner.js:12` | URL | `new URL(name, import.meta.url)` |
| `tests/agent-intelligence/s21-live.mjs:82` | URL | `new URL(config.endpoint)` |
| `tests/agent-intelligence/s21-longitudinal-live.js:106` | URL | `new URL(config.endpoint)` |
| `tests/agent-intelligence/s23-live.mjs:50` | URL | `new URL(config.endpoint)` |
| `tests/agent-intelligence/s25-live.js:131` | URL | `new URL(config.endpoint)` |
| `tests/agent-intelligence/s26-live.js:65` | URL | `new URL(config.endpoint)` |
| `tests/agent-intelligence/s27-live.js:50` | URL | `new URL(config.endpoint)` |
| `tests/agent-runtime/workspace-preset-help.test.js:51` | URL | `new URL(\`../../public${url}\`, import.meta.url)` |
| `tests/atria-shell/product-localization-coverage.test.js:41` | URL | `new URL('../../public/locales/' + language + '.json', import.meta.url)` |
| `tests/atria-shell/structure.test.js:4` | URL | `new URL(\`../../${relative}\`, import.meta.url)` |
| `tests/e2e/_lib/page.js:39` | URL | `new URL(baseURL)` |
| `tests/e2e/native-session/01-live-runtime.e2e.js:42` | URL | `new URL(baseURL)` |
| `tests/e2e/native-session/01-live-runtime.e2e.js:44` | URL | `new URL(request.url())` |
| `tests/e2e/native-session/17-knowledge-originals.e2e.js:90` | URL | `new URL(request.url())` |
| `tests/e2e/native-session/21-task-binding-preflight.e2e.js:114` | URL | `new URL(response.url())` |
| `tests/e2e/native-session/21-task-binding-preflight.e2e.js:128` | URL | `new URL(response.url())` |
| `tests/e2e/personas/107b-oauth-avatar-seed.e2e.js:192` | URL | `new URL(location)` |
| `tests/e2e/personas/107b-oauth-avatar-seed.e2e.js:226` | URL | `new URL(location)` |
| `tests/e2e/personas/107b-oauth-avatar-seed.e2e.js:244` | URL | `new URL(startRes3.headers()['location'])` |
| `tests/e2e/regression/126-tiktoken-worker-offthread.e2e.js:150` | dynamic | `import('/scripts/client-tokenizers/tiktoken-adapter.js?_fallback=' + Date.now())` |
| `tests/frontend/a2ui-s32.smoke.mjs:20` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-evolution-ui.smoke.mjs:11` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-goals-ui.smoke.mjs:13` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:13` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:12` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:13` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-runtime.smoke.mjs:17` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:11` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:13` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/agent-workspace.smoke.mjs:12` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/expression-frontend-s29.smoke.mjs:28` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/game-runtime-r4.smoke.mjs:23` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/hm1-memory.smoke.mjs:11` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/immersive-experience.smoke.mjs:22` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-frontend-bridge.smoke.mjs:22` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-frontend-conversation.smoke.mjs:22` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-frontend-heavy.smoke.mjs:17` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-frontend-heavy.smoke.mjs:50` | URL | `new URL(route.request().url())` |
| `tests/frontend/native-frontend-platform.smoke.mjs:13` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-frontend-script.smoke.mjs:44` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-frontend-v3.smoke.mjs:14` | URL | `new URL(req.url, 'http://localhost')` |
| `tests/frontend/native-play-window.smoke.mjs:20` | URL | `new URL(req.url, 'http://local')` |
| `tests/google-models.test.js:57` | URL | `new URL(fetchMock.mock.calls[0][0])` |
| `tests/google-models.test.js:62` | URL | `new URL(fetchMock.mock.calls[1][0])` |
| `tests/google-models.test.js:73` | URL | `new URL(fetchMock.mock.calls[0][0])` |
| `tests/immersive/structure.test.js:4` | URL | `new URL(\`../../${relative}\`, import.meta.url)` |
| `tests/logging/l09-cleanup.test.js:13` | URL | `new URL(path, import.meta.url)` |
| `tests/native/agent-goals-s11.test.js:76` | URL | `new URL(\`../../src/storage/engines/${kind === 'fs' ? 'fs' : 'sqlite'}-engine.js\`, import.meta.url)` |
| `tests/native/bundled-authoring-skills.test.js:82` | URL | `new URL(url, 'http://fixture')` |
| `tests/native/capability-retirement.test.js:39` | URL | `new URL(file, root)` |
| `tests/native/frontend-hard-cut.test.js:10` | URL | `new URL('../../' + path, import.meta.url)` |
| `tests/native/frontend-hard-cut.test.js:13` | URL | `new URL('../../public/scripts/native/experience/ui/' + name + '.js', import.meta.url)` |
| `tests/native/mcp-consumer-s30.test.js:201` | dynamic | `import(pathToFileURL(path.join(sdk, 'dist/esm/server/mcp.js')).href)` |
| `tests/native/mcp-consumer-s30.test.js:202` | dynamic | `import(pathToFileURL(path.join(sdk, 'dist/esm/server/streamableHttp.js')).href)` |
| `tests/native/mcp-consumer-s30.test.js:203` | dynamic | `import(pathToFileURL(path.join(root, 'node_modules/zod/index.js')).href)` |
| `tests/native/mcp-delegated-generation.test.js:25` | dynamic | `import(pathToFileURL(join(root, 'src', file)).href)` |
| `tests/native/mcp-extension-source.test.js:96` | dynamic | `import(pathToFileURL(join(plugin, 'src/extension-actions.js')).href)` |
| `tests/native/mcp-extension-source.test.js:97` | dynamic | `import(pathToFileURL(join(plugin, 'src/kernel.js')).href)` |
| `tests/native/mcp-extension-source.test.js:102` | URL | `new URL(url)` |
| `tests/native/mcp-http-client-s30.test.js:141` | dynamic | `import(pathToFileURL(path.join(sdk, 'dist/esm/server/mcp.js')).href)` |
| `tests/native/mcp-http-client-s30.test.js:142` | dynamic | `import(pathToFileURL(path.join(sdk, 'dist/esm/server/streamableHttp.js')).href)` |
| `tests/native/mcp-http-client-s30.test.js:143` | dynamic | `import(pathToFileURL(path.join(root, 'node_modules/zod/index.js')).href)` |
| `tests/native/mcp-memory-adapter.test.js:17` | dynamic | `import(pathToFileURL(join(toolRoot, 'src/native-memory-actions.js')).href)` |
| `tests/native/mcp-memory-adapter.test.js:18` | dynamic | `import(pathToFileURL(join(toolRoot, 'src/kernel.js')).href)` |
| `tests/native/mcp-memory-adapter.test.js:35` | URL | `new URL(url)` |
| `tests/native/mcp-project-adapter.test.js:20` | dynamic | `import(pathToFileURL(join(toolRoot, 'src/project-actions.js')).href)` |
| `tests/native/mcp-project-adapter.test.js:21` | dynamic | `import(pathToFileURL(join(toolRoot, 'src/kernel.js')).href)` |
| `tests/native/mcp-project-adapter.test.js:41` | URL | `new URL(url)` |
| `tests/native/mcp-project-generation.test.js:64` | dynamic | `import(pathToFileURL(join(toolRoot, 'src/project-actions.js')).href)` |
| `tests/native/mcp-project-generation.test.js:65` | dynamic | `import(pathToFileURL(join(toolRoot, 'src/kernel.js')).href)` |
| `tests/native/mcp-project-generation.test.js:75` | URL | `new URL(url)` |
| `tests/native/mcp-resource-bundles.test.js:126` | dynamic | `import(pathToFileURL(join(plugin, 'src/resource-actions.js')).href)` |
| `tests/native/mcp-resource-bundles.test.js:127` | dynamic | `import(pathToFileURL(join(plugin, 'src/repository.js')).href)` |
| `tests/native/mcp-resource-bundles.test.js:128` | dynamic | `import(pathToFileURL(join(plugin, 'src/kernel.js')).href)` |
| `tests/native/mcp-resource-bundles.test.js:138` | URL | `new URL(url)` |
| `tests/native/mcp-session-archives.test.js:126` | dynamic | `import(pathToFileURL(join(root, 'src/session-archive-actions.js')).href)` |
| `tests/native/mcp-session-archives.test.js:127` | dynamic | `import(pathToFileURL(join(root, 'src/repository.js')).href)` |
| `tests/native/mcp-session-archives.test.js:128` | dynamic | `import(pathToFileURL(join(root, 'src/kernel.js')).href)` |
| `tests/native/mcp-session-archives.test.js:129` | dynamic | `import(pathToFileURL(join(root, 'src/operations.js')).href)` |
| `tests/native/mcp-session-archives.test.js:145` | URL | `new URL(url)` |
| `tests/native/mcp-skills.test.js:179` | dynamic | `import(pathToFileURL(join(plugin, 'src/skill-actions.js')).href)` |
| `tests/native/mcp-skills.test.js:180` | dynamic | `import(pathToFileURL(join(plugin, 'src/kernel.js')).href)` |
| `tests/native/mcp-skills.test.js:187` | URL | `new URL(url)` |
| `tests/native/mcp-skills.test.js:204` | dynamic | `import(pathToFileURL(join(plugin, 'src/skill-actions.js')).href)` |
| `tests/native/mcp-skills.test.js:205` | dynamic | `import(pathToFileURL(join(plugin, 'src/repository.js')).href)` |
| `tests/native/mcp-skills.test.js:206` | dynamic | `import(pathToFileURL(join(plugin, 'src/kernel.js')).href)` |
| `tests/native/mcp-skills.test.js:216` | URL | `new URL(url)` |
| `tests/native/mcp-skills.test.js:242` | dynamic | `import(pathToFileURL(join(plugin, 'src/skill-actions.js')).href)` |
| `tests/native/mcp-skills.test.js:243` | dynamic | `import(pathToFileURL(join(plugin, 'src/repository.js')).href)` |
| `tests/native/mcp-skills.test.js:244` | dynamic | `import(pathToFileURL(join(plugin, 'src/kernel.js')).href)` |
| `tests/native/mcp-skills.test.js:253` | URL | `new URL(url)` |
| `tests/native/mcp-turn-review.test.js:96` | URL | `new URL(path, import.meta.url)` |
| `tests/native/mcp-turn-review.test.js:156` | dynamic | `import(pathToFileURL(join(root, 'src/mutations.js')).href)` |
| `tests/native/mcp-turn-review.test.js:157` | dynamic | `import(pathToFileURL(join(root, 'src/kernel.js')).href)` |
| `tests/native/mcp-turn-review.test.js:162` | URL | `new URL(url)` |
| `tests/performance/memory-preparation-bench.mjs:11` | Worker | `new Worker(new URL(import.meta.url))` |
| `tests/performance/memory-preparation-bench.mjs:11` | URL | `new URL(import.meta.url)` |
| `tests/performance/runtime-smoke.mjs:153` | URL | `new URL(route.request().url())` |
| `tests/performance/worldbook-performance-bench.mjs:141` | URL | `new URL('../../' + path, import.meta.url)` |
| `tests/skills/api.test.js:334` | URL | `new URL(call.url, 'https://fixture.invalid')` |

## 解析失败

无。

## 旧根关联缺失字面目标

无。
