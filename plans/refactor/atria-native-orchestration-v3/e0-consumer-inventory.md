# E0 — main 全仓消费者索引（静态、不可充当运行闭包）

基线：`main@60aca695726893e298b7d485f300c6efef3b79fd`；2026-10-15。仅扫描该提交的 tracked text；不读取用户数据、Secrets、未跟踪插件、node_modules 或远端安装内容。处置权威在 [e0-audit.md](e0-audit.md) §8；接口在 [interface-contracts.md](interface-contracts.md)。

方法：`git ls-files -z` 固定全集；记录命中行号，命中不是执行事实；注释、翻译、同步系统同名项由处置矩阵区分。模板动态加载由专节列出，静态无法求值者保持 BLOCKED。

扫描 3949 个 tracked 文件、3556 个选中文本；旧四根共 151 个文件。

## 生产源码与资产

| 文件 | 根路径字面命中行 | 语义/API/设置命中行 |
| --- | --- | --- |
| `default/skills/global/director-dispatch-protocol-zh/SKILL.md` | — | 45 |
| `public/css/atria-shell.css` | — | 1198 |
| `public/css/atria-studio.css` | — | 5, 79, 430, 841, 902, 989, 1069, 1160, 1233, 1234, 1439, 1588 |
| `public/locales/zh-cn.json` | — | 5455, 5470, 5471, 5487, 5492, 5494, 5498, 5499, 5504, 5505, 5559, 5732, 5733, 5734, 5867, 5940, 5977, 6028, 6041, 6044, 6298, 6599, 6703, 6858, 6862, 7585, 8148, 8149, 8198, 8285, 8310, 8311, 8817 |
| `public/script.js` | — | 2133, 7478, 9079, 9801, 15934, 18787 |
| `public/scripts/agents/memory/api.js` | — | 7 |
| `public/scripts/agents/memory/default-prompts.js` | — | 14 |
| `public/scripts/agents/memory/graph-observation-core.js` | — | 50 |
| `public/scripts/agents/memory/import-export.js` | — | 4 |
| `public/scripts/agents/memory/main.js` | — | 38, 39, 40, 42, 1714, 5554, 7069, 14074, 14075, 14077 |
| `public/scripts/agents/memory/manual-corrections.js` | — | 4 |
| `public/scripts/agents/memory/memory-os.js` | — | 6 |
| `public/scripts/agents/memory/orchestrator-tools.js` | 2 | 4, 5, 7, 9, 11, 17, 19, 20, 35, 38, 56, 62, 81, 95, 163, 656, 675, 1021, 1027, 1028, 1031, 1032, 1033, 1038, 1042, 1045, 1046, 1049, 1061, 1062, 1064, 1065, 1066, 1068 |
| `public/scripts/agents/memory/persistence.js` | — | 767 |
| `public/scripts/agents/memory/schema-iteration/read-fields-dispatcher.js` | — | 18, 25 |
| `public/scripts/agents/memory/schema-iteration/studio.js` | 76, 2039 | 76, 163, 183, 877, 915, 1011, 1996, 2039, 2214, 2267, 2573 |
| `public/scripts/agents/memory/schema-iteration/tools.js` | — | 53 |
| `public/scripts/agents/memory/vector-index.js` | — | 11 |
| `public/scripts/agents/memory/write-api.js` | — | 26 |
| `public/scripts/atria-shell/app-shell.js` | — | 28 |
| `public/scripts/atria-shell/localization.js` | — | 153, 674, 675, 724, 1156, 1161, 1276, 1279 |
| `public/scripts/atria-shell/navigation-authority.js` | — | 68 |
| `public/scripts/atria-shell/product-search.js` | — | 13, 26, 27, 28, 29, 152, 153, 188 |
| `public/scripts/atria-shell/workspace-host.js` | 195 | 30, 37, 53, 80, 163, 173, 195, 207, 571, 572, 723, 764, 766, 770, 771, 772, 774, 775 |
| `public/scripts/capability-host.js` | 84 | 18, 30, 84 |
| `public/scripts/character/presets.js` | — | 15 |
| `public/scripts/chat-merge-split.js` | — | 102, 421 |
| `public/scripts/events.js` | — | 79 |
| `public/scripts/extensions/search-tools/main.js` | — | 26, 2709, 2845, 2846, 2848, 2849, 2850, 2853, 2855 |
| `public/scripts/extensions/search-tools/orchestrator-tools.js` | — | 3, 4, 6, 8, 10, 23, 26, 153, 236, 313, 314, 317, 318, 319, 324, 329, 332, 333, 336, 348, 349, 351, 352, 353, 355 |
| `public/scripts/extensions/search-tools/settings-ui.js` | — | 132 |
| `public/scripts/generate-task.js` | 1 | — |
| `public/scripts/iteration-library/iter-message-filter.js` | — | 6 |
| `public/scripts/iteration-library/read-fields-helper.js` | — | 9 |
| `public/scripts/iteration-library/render-scheduler.js` | — | 8 |
| `public/scripts/iteration-library/simulation-review/i18n/en.js` | — | 4, 5, 6, 7 |
| `public/scripts/iteration-library/simulation-review/popup.js` | — | 6, 7, 8, 9, 34, 35, 36, 37 |
| `public/scripts/iteration-library/simulation-review/renderers/shared.js` | — | 95 |
| `public/scripts/iteration-library/storage.js` | — | 4 |
| `public/scripts/iteration-library/text-diff.js` | — | 5, 11 |
| `public/scripts/iteration-library/tools/_lorebook-helpers.js` | — | 10 |
| `public/scripts/iteration-library/tools/character-presets-reads.js` | — | 5, 10 |
| `public/scripts/iteration-library/tools/ctx-and-docs-discovery.js` | — | 6, 20 |
| `public/scripts/iteration-library/tools/index.js` | — | 10, 14, 18, 24, 27 |
| `public/scripts/iteration-library/tools/lorebook-reads.js` | — | 5, 9 |
| `public/scripts/iteration-library/tools/lorebook-writes.js` | — | 20 |
| `public/scripts/iteration-library/tools/skill-iter-studio.js` | — | 8, 160, 534, 555, 710 |
| `public/scripts/iteration-library/ui/diff.js` | — | 297 |
| `public/scripts/iteration-library/ui/strings.js` | — | 8 |
| `public/scripts/lib/abort-utils.js` | — | 7 |
| `public/scripts/lib/iter-tool-calling.js` | — | 4, 8, 38, 52, 84, 116, 138, 171, 186, 204, 226, 298 |
| `public/scripts/lib/plugin-floors.js` | — | 5 |
| `public/scripts/logging/console-adapter.js` | — | 35 |
| `public/scripts/logging/error-adapter.js` | 10 | 10 |
| `public/scripts/logging/incident-reporter.js` | — | 22, 36 |
| `public/scripts/logging/model.js` | — | 9, 17 |
| `public/scripts/logging/modules.js` | — | 2 |
| `public/scripts/logging/ownership.js` | 3 | 3 |
| `public/scripts/logging/safe-config.js` | — | 4 |
| `public/scripts/logging/workspace-model.js` | — | 5 |
| `public/scripts/message-takeover.js` | — | 3 |
| `public/scripts/native/context-derived.js` | — | 11, 21, 394, 426 |
| `public/scripts/native/experience/index.js` | — | 21, 63, 102, 115, 123, 133, 218, 382, 705, 706, 715 |
| `public/scripts/native/experience/llm/narrative.js` | — | 37, 39, 69, 76, 91, 166, 167, 174, 200, 206, 207, 211, 223, 235, 240, 241, 243, 249 |
| `public/scripts/native/experience/llm/orchestrator-bridge.js` | — | 13, 15, 47, 52, 53, 59, 71, 74, 87, 90, 99, 100, 145, 150, 151 |
| `public/scripts/native/experience/llm/roles.js` | — | 8, 38 |
| `public/scripts/native/experience/llm/runtime.js` | — | 529, 530, 531, 534, 535, 536, 540, 546 |
| `public/scripts/native/experience/llm/turn-context.js` | — | 9, 121, 123, 124, 125, 156, 176, 209 |
| `public/scripts/native/experience/llm/turn-controller.js` | — | 12, 23, 24, 25, 517 |
| `public/scripts/native/generation-controller.js` | — | 44 |
| `public/scripts/native/play-generation.js` | — | 75, 77, 85, 90, 91 |
| `public/scripts/native/runtime-workspace.js` | — | 23, 26 |
| `public/scripts/native/studio-entrypoints-editor.js` | — | 6, 119, 122 |
| `public/scripts/native/studio-workspace.js` | — | 1304 |
| `public/scripts/openai.js` | — | 3923 |
| `public/scripts/power-user.js` | — | 519 |
| `public/scripts/skills/embed-export-helper.js` | — | 13 |
| `public/scripts/skills/embed-export-hook.js` | — | 85, 98, 120, 123, 127, 129, 130, 153, 246, 249 |
| `public/scripts/skills/embed-import-dialog.js` | — | 48 |
| `public/scripts/skills/embed-lifecycle.js` | — | 253 |
| `public/scripts/skills/i18n.js` | — | 5, 17, 27, 28, 209, 212, 219, 220 |
| `public/scripts/skills/scope-picker.js` | — | 15, 122, 123, 124, 125, 126, 135, 215, 238, 249, 361 |
| `public/scripts/skills/skill-editor.js` | — | 255 |
| `public/scripts/skills/skill-manager-panel.js` | — | 4, 17, 46, 117, 309, 460 |
| `public/scripts/st-context.js` | — | 184, 2445, 2507 |
| `public/scripts/world-info-bulk-edit.js` | — | 6 |
| `src/endpoints/sync.js` | — | 27, 164, 371, 414, 543, 554, 560, 761, 1141 |
| `src/endpoints/users-private.js` | — | 148, 725, 731 |
| `src/logging/console-adapter.js` | — | 49 |
| `src/logging/incidents.js` | — | 9, 41 |
| `src/logging/model.js` | — | 9, 27 |
| `src/logging/modules.js` | — | 5, 10 |
| `src/logging/ownership.js` | 19, 20 | 19, 20 |
| `src/logging/runtime.js` | — | 23 |
| `src/logging/safe-config.js` | — | 9 |
| `src/native/adapters/generation-host.js` | — | 100, 315, 319 |
| `src/native/agent-intelligence/evaluation/adapters.js` | 6, 8 | 6, 8 |
| `src/native/agent-intelligence/evaluation/worker.js` | 20 | 20 |
| `src/native/agent-intelligence/evolution-evaluator.js` | 22 | 22 |
| `src/native/agent-intelligence/evolution-service.js` | — | 15, 48, 72, 100 |
| `src/native/agent-intelligence/evolution-targets.js` | 7, 8, 9, 10 | 10, 33, 63, 72, 284, 288 |
| `src/native/agent-intelligence/experience-repository.js` | — | 64 |
| `src/native/agent-intelligence/learning-trajectory.js` | — | 104 |
| `src/native/contracts.js` | — | 45, 317, 556, 742 |
| `src/native/model-prompt-runtime/README.md` | — | 56, 134, 299, 300, 334, 336, 337, 338 |
| `src/native/project-source.js` | — | 50, 171 |
| `src/prompt-converters.js` | — | 1453 |
| `src/safe-mode.js` | — | 42 |
| `src/skills/scope.js` | — | 12, 17 |
| `src/storage/engine-backup-entries.js` | — | 16 |
| `src/storage/engines/mysql-engine.js` | — | 244 |
| `src/storage/engines/postgres-engine.js` | — | 197 |
| `src/storage/engines/sqlite-engine.js` | — | 213 |
| `src/storage/migration/cross-mode-errors.js` | — | 59 |
| `src/storage/migration/cross-mode-restore.js` | — | 4 |
| `src/storage/migration/gc-scratch.js` | — | 3 |
| `src/storage/migration/runner.js` | — | 127, 170, 195 |
| `src/storage/migration/selection-mapping.js` | — | 26, 28 |
| `src/storage/migration/transient-source.js` | — | 2 |
| `src/storage/repositories/settings-repo.js` | — | 6, 7, 8, 12, 51, 53, 54, 62 |
| `src/sync/conflicts.js` | — | 17, 34, 47, 93, 187 |
| `src/sync/in-progress-gate.js` | — | 6, 16, 24, 68, 118, 137, 169 |
| `src/sync/materialize.js` | — | 9, 318, 660, 775 |
| `src/sync/orchestrator.js` | — | 2, 35, 208, 271, 401, 725 |
| `src/tokenizers/command-a.json` | — | 1 |
| `src/tokenizers/command-r.json` | — | 1 |
| `src/tokenizers/llama3.json` | — | 1 |
| `src/tokenizers/qwen2.json` | — | 1 |

## 开发文档、配置与其它

| 文件 | 根路径字面命中行 | 语义/API/设置命中行 |
| --- | --- | --- |
| `.github/readme-de_de.md` | — | 27 |
| `.github/readme-ja_jp.md` | — | 27 |
| `.github/readme-ko_kr.md` | — | 27 |
| `.github/readme-ru_ru.md` | — | 27 |
| `.github/readme-zh_cn.md` | — | 27 |
| `.github/readme-zh_tw.md` | — | 27 |
| `.github/readme.md` | — | 25 |
| `README.md` | — | 3 |
| `docs/.vitepress/config.ts` | — | 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 157, 195, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 294, 332, 392, 395, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 431, 442, 469 |
| `docs/basics/character-cards.md` | — | 74, 89, 91, 93 |
| `docs/changelog.md` | — | 7, 10, 11, 18, 51, 57, 60 |
| `docs/development/extension-api/chat-and-state.md` | — | 23 |
| `docs/development/extension-api/generation.md` | — | 7 |
| `docs/development/extension-api/iteration-studio.md` | 7, 252 | 7, 252, 255 |
| `docs/development/extension-api/low-level-endpoints.md` | — | 86 |
| `docs/development/extension-api/memory-graph.md` | — | 58, 203, 1048, 1050 |
| `docs/development/extension-api/message-takeover.md` | 6, 180 | 6, 11, 16, 180, 188, 194, 195, 196 |
| `docs/development/extension-api/orchestrator-tools.md` | 27 | 1, 3, 7, 9, 13, 19, 20, 23, 26, 27, 30, 32, 53, 57, 64, 66, 75, 90, 92, 102, 104, 108, 111, 112, 119, 121, 124, 129, 130, 131, 134, 136, 140, 144, 146, 148, 155, 158, 159, 160, 162, 171, 172 |
| `docs/development/extension-api/plugin-integration.md` | — | 94 |
| `docs/development/extension-api/presets-and-prompts.md` | — | 69 |
| `docs/development/extension-api/skills.md` | — | 5, 85, 259, 279, 338, 424, 445 |
| `docs/features/chat-merge-split.md` | — | 65 |
| `docs/features/logging.md` | — | 25, 29 |
| `docs/features/memory-graph.md` | — | 19, 23, 26, 67 |
| `docs/features/orchestrator/agenda.md` | — | 16, 21, 23, 51, 113, 117, 121, 135, 165, 166, 167, 168, 170, 175 |
| `docs/features/orchestrator/custom-tools.md` | — | 3, 7, 9, 11, 16, 24, 31, 41, 43, 53, 82, 100, 115, 119 |
| `docs/features/orchestrator/director.md` | — | 3, 5, 9, 24, 35, 46, 52, 72, 74, 78, 81, 89, 160, 187, 243, 262, 269, 272, 277, 279, 280, 281, 282, 283, 284, 285, 290 |
| `docs/features/orchestrator/index.md` | — | 1, 5, 7, 10, 22, 24, 26, 30, 33, 67, 69, 70, 71, 74, 81, 82, 83, 84, 85, 90, 94, 103, 112, 116, 134, 135, 137, 142, 183, 185, 193, 194, 212, 214, 223, 224, 225, 226, 227, 228, 230, 232 |
| `docs/features/orchestrator/iteration-studio.md` | — | 3, 6, 11, 13, 15, 17, 21, 25, 36, 40, 67, 91, 93, 94, 98, 110, 120, 126, 128, 132, 147, 148, 149, 150, 151, 152 |
| `docs/features/orchestrator/loop.md` | — | 14, 28, 78, 80, 84, 86, 94, 143, 158, 162, 232, 233, 234, 235, 236, 240, 245 |
| `docs/features/orchestrator/notes.md` | — | 3, 21, 34 |
| `docs/features/orchestrator/presets.md` | — | 1, 3, 8, 18, 45, 50, 54, 58, 60, 64, 68, 70, 72, 74, 76, 80, 81, 101, 105, 106, 107, 108, 109 |
| `docs/features/orchestrator/skills.md` | — | 3, 9, 11, 41, 42 |
| `docs/features/orchestrator/spec.md` | — | 3, 6, 10, 28, 112, 114, 128, 151, 152, 155, 157, 158, 162, 190, 191, 192, 193, 194, 195, 200 |
| `docs/features/skills/authoring.md` | — | 13, 59, 169, 187 |
| `docs/features/skills/index.md` | — | 7, 11, 58, 63, 76, 86, 103, 132, 136, 149, 155, 157 |
| `docs/features/skills/management.md` | — | 3, 6, 27, 106, 131, 141, 143, 151 |
| `docs/features/skills/orchestrator-integration.md` | — | 1, 3, 5, 9, 199, 230, 240, 244, 253, 254 |
| `docs/features/state-system.md` | — | 72 |
| `docs/guide/migration.md` | — | 94 |
| `docs/guide/what-is-atria.md` | — | 23, 33, 35, 37, 105 |
| `docs/improvements/backend-storage.md` | — | 42 |
| `docs/improvements/card-bound-presets.md` | — | 53, 55, 57, 59, 60, 74, 83 |
| `docs/improvements/function-call-runtime.md` | — | 113, 125 |
| `docs/improvements/overview.md` | — | 16, 23, 85, 87 |
| `docs/index.md` | — | 7, 21 |
| `docs/recipes/agent-onboarding.md` | — | 4, 10 |
| `docs/recipes/card-customization-walkthrough.md` | — | 1, 5, 6, 13, 15, 27, 45, 51, 59, 147, 148, 150 |
| `docs/recipes/rp-skills-walkthrough.md` | — | 13, 35, 48, 49 |
| `docs/zh-CN/changelog.md` | — | 58 |
| `docs/zh-CN/development/extension-api/generation.md` | — | 7 |
| `docs/zh-CN/development/extension-api/iteration-studio.md` | 7, 252 | 7, 252, 255 |
| `docs/zh-CN/development/extension-api/memory-graph.md` | — | 58, 1048, 1050 |
| `docs/zh-CN/development/extension-api/message-takeover.md` | 6, 179 | 6, 11, 16, 179, 187, 193, 194, 195 |
| `docs/zh-CN/development/extension-api/orchestrator-tools.md` | 27 | 19, 20, 23, 26, 27, 32, 62, 90, 102, 106, 109, 117, 119, 122, 127, 128, 129, 132, 153, 156, 157, 158, 160, 169, 170 |
| `docs/zh-CN/development/extension-api/plugin-integration.md` | — | 77 |
| `docs/zh-CN/development/extension-api/skills.md` | — | 445 |
| `docs/zh-CN/features/orchestrator/agenda.md` | — | 26, 33, 127, 145, 175, 176, 177, 178, 180 |
| `docs/zh-CN/features/orchestrator/custom-tools.md` | — | 41, 100, 119 |
| `docs/zh-CN/features/orchestrator/director.md` | — | 24, 35, 46, 52, 74, 81, 243, 272, 277, 279, 280, 281, 282, 283, 284, 285 |
| `docs/zh-CN/features/orchestrator/index.md` | — | 28, 71, 72, 73, 76, 83, 84, 85, 86, 87, 92, 96, 136, 137, 139, 144, 187, 195, 196, 214, 216, 225, 226, 227, 228, 229, 230, 232 |
| `docs/zh-CN/features/orchestrator/iteration-studio.md` | — | 13, 17, 25, 36, 40, 67, 110, 120, 128, 132, 147, 148, 149, 150, 151, 152 |
| `docs/zh-CN/features/orchestrator/loop.md` | — | 14, 78, 80, 86, 143, 158, 232, 233, 234, 235, 236, 239 |
| `docs/zh-CN/features/orchestrator/presets.md` | — | 18, 105, 106, 107, 108, 109 |
| `docs/zh-CN/features/orchestrator/skills.md` | — | 9, 41, 42 |
| `docs/zh-CN/features/orchestrator/spec.md` | — | 10, 114, 128, 151, 152, 155, 157, 162, 190, 191, 192, 193, 194, 195 |
| `docs/zh-CN/features/skills/authoring.md` | — | 13, 186 |
| `docs/zh-CN/features/skills/index.md` | — | 86, 132, 149, 155, 157 |
| `docs/zh-CN/features/skills/management.md` | — | 106, 151 |
| `docs/zh-CN/features/skills/orchestrator-integration.md` | — | 240, 253, 254 |
| `docs/zh-CN/features/state-system.md` | — | 72 |
| `docs/zh-CN/guide/what-is-atria.md` | — | 33, 37 |
| `docs/zh-CN/improvements/backend-storage.md` | — | 42 |
| `docs/zh-CN/improvements/card-bound-presets.md` | — | 83 |
| `docs/zh-CN/recipes/card-customization-walkthrough.md` | — | 147 |
| `docs/zh-CN/recipes/rp-skills-walkthrough.md` | — | 48, 49 |
| `docs/zh-TW/changelog.md` | — | 58 |
| `docs/zh-TW/development/extension-api/generation.md` | — | 7 |
| `docs/zh-TW/development/extension-api/iteration-studio.md` | 7, 252 | 7, 252, 255 |
| `docs/zh-TW/development/extension-api/memory-graph.md` | — | 58, 1048, 1050 |
| `docs/zh-TW/development/extension-api/message-takeover.md` | 6, 179 | 6, 11, 16, 179, 187, 193, 194, 195 |
| `docs/zh-TW/development/extension-api/orchestrator-tools.md` | 27 | 19, 20, 23, 26, 27, 32, 62, 90, 102, 106, 109, 117, 119, 122, 127, 128, 129, 132, 153, 156, 157, 158, 160, 169, 170 |
| `docs/zh-TW/development/extension-api/plugin-integration.md` | — | 77 |
| `docs/zh-TW/development/extension-api/skills.md` | — | 445 |
| `docs/zh-TW/features/orchestrator/agenda.md` | — | 16, 23, 117, 135, 165, 166, 167, 168, 170 |
| `docs/zh-TW/features/orchestrator/custom-tools.md` | — | 41, 100, 119 |
| `docs/zh-TW/features/orchestrator/director.md` | — | 24, 35, 46, 52, 74, 81, 243, 272, 277, 279, 280, 281, 282, 283, 284, 285 |
| `docs/zh-TW/features/orchestrator/index.md` | — | 26, 69, 70, 71, 74, 81, 82, 83, 84, 85, 90, 94, 134, 135, 137, 142, 185, 193, 194, 212, 214, 223, 224, 225, 226, 227, 228, 230 |
| `docs/zh-TW/features/orchestrator/iteration-studio.md` | — | 13, 17, 25, 36, 40, 67, 110, 120, 128, 132, 147, 148, 149, 150, 151, 152 |
| `docs/zh-TW/features/orchestrator/loop.md` | — | 14, 78, 80, 86, 143, 158, 232, 233, 234, 235, 236, 239 |
| `docs/zh-TW/features/orchestrator/presets.md` | — | 18, 105, 106, 107, 108, 109 |
| `docs/zh-TW/features/orchestrator/skills.md` | — | 9, 41, 42 |
| `docs/zh-TW/features/orchestrator/spec.md` | — | 10, 114, 128, 151, 152, 155, 157, 162, 190, 191, 192, 193, 194, 195 |
| `docs/zh-TW/features/skills/authoring.md` | — | 13, 186 |
| `docs/zh-TW/features/skills/index.md` | — | 86, 132, 149, 155, 157 |
| `docs/zh-TW/features/skills/management.md` | — | 106, 151 |
| `docs/zh-TW/features/skills/orchestrator-integration.md` | — | 240, 253, 254 |
| `docs/zh-TW/features/state-system.md` | — | 72 |
| `docs/zh-TW/guide/what-is-atria.md` | — | 33, 37 |
| `docs/zh-TW/improvements/backend-storage.md` | — | 42 |
| `docs/zh-TW/improvements/card-bound-presets.md` | — | 83 |
| `docs/zh-TW/recipes/card-customization-walkthrough.md` | — | 147 |
| `docs/zh-TW/recipes/rp-skills-walkthrough.md` | — | 48, 49 |

## 旧根完整清退/抽离 manifest

除 e0-audit 明确保留的共用纯函数，四根旧产品执行/配置/UI 退出；保留算法须移除旧模式依赖、更新全部消费者后放入既有共用模块或新 Host 内核，不保留旧 API 重导出层。此 manifest 是未来操作清单，本轮没有删除。

### `public/scripts/agents/orchestrator/`

- `public/scripts/agents/orchestrator/abort-utils.js`
- `public/scripts/agents/orchestrator/agenda-defaults.js`
- `public/scripts/agents/orchestrator/agenda-planner-tool.js`
- `public/scripts/agents/orchestrator/agenda-profile.js`
- `public/scripts/agents/orchestrator/agenda-runtime.js`
- `public/scripts/agents/orchestrator/agenda-world-info.js`
- `public/scripts/agents/orchestrator/agent-preset-resolver.js`
- `public/scripts/agents/orchestrator/agent-resolution.js`
- `public/scripts/agents/orchestrator/anchors.js`
- `public/scripts/agents/orchestrator/api-fallback.js`
- `public/scripts/agents/orchestrator/bridge-st-tool-picker.js`
- `public/scripts/agents/orchestrator/canonical-stringify.js`
- `public/scripts/agents/orchestrator/capsule-injection.js`
- `public/scripts/agents/orchestrator/character-import-tools-review.js`
- `public/scripts/agents/orchestrator/collect-active-skills.js`
- `public/scripts/agents/orchestrator/collect-unembedded-presets.js`
- `public/scripts/agents/orchestrator/custom-tool-editor.js`
- `public/scripts/agents/orchestrator/custom-tool-iter-studio.js`
- `public/scripts/agents/orchestrator/custom-tools-sanitize.js`
- `public/scripts/agents/orchestrator/default-custom-tools.js`
- `public/scripts/agents/orchestrator/defaults.js`
- `public/scripts/agents/orchestrator/delegated-run.js`
- `public/scripts/agents/orchestrator/diagnostics.js`
- `public/scripts/agents/orchestrator/director-content-payload.js`
- `public/scripts/agents/orchestrator/director-default-prompt.js`
- `public/scripts/agents/orchestrator/director-defaults.js`
- `public/scripts/agents/orchestrator/director-preset-swap.js`
- `public/scripts/agents/orchestrator/director-runtime.js`
- `public/scripts/agents/orchestrator/director-tools.js`
- `public/scripts/agents/orchestrator/dispatch-barrier.js`
- `public/scripts/agents/orchestrator/editable-spec.js`
- `public/scripts/agents/orchestrator/editor-ops.js`
- `public/scripts/agents/orchestrator/engine-v2/agenda-adapter.js`
- `public/scripts/agents/orchestrator/engine-v2/arbitration-adapter.js`
- `public/scripts/agents/orchestrator/engine-v2/director-adapter.js`
- `public/scripts/agents/orchestrator/engine-v2/director-worker.js`
- `public/scripts/agents/orchestrator/engine-v2/loop-adapter.js`
- `public/scripts/agents/orchestrator/engine-v2/observer.js`
- `public/scripts/agents/orchestrator/engine-v2/output-adapter.js`
- `public/scripts/agents/orchestrator/engine-v2/panel-adapter.js`
- `public/scripts/agents/orchestrator/engine-v2/preset-compiler.js`
- `public/scripts/agents/orchestrator/engine-v2/runtime-bridge.js`
- `public/scripts/agents/orchestrator/engine-v2/spec-adapter.js`
- `public/scripts/agents/orchestrator/evidence-capture.js`
- `public/scripts/agents/orchestrator/execution-mode-contract.js`
- `public/scripts/agents/orchestrator/game-runtime-bridge.js`
- `public/scripts/agents/orchestrator/goal-context.js`
- `public/scripts/agents/orchestrator/grep-tool.js`
- `public/scripts/agents/orchestrator/html-escape.js`
- `public/scripts/agents/orchestrator/i18n.js`
- `public/scripts/agents/orchestrator/index.js`
- `public/scripts/agents/orchestrator/iter-studio/edit-tool-result-envelope.js`
- `public/scripts/agents/orchestrator/iter-studio/read-fields-dispatcher.js`
- `public/scripts/agents/orchestrator/iter-studio/sandbox-result.js`
- `public/scripts/agents/orchestrator/iter-studio/session-store.js`
- `public/scripts/agents/orchestrator/iter-studio/studio.css`
- `public/scripts/agents/orchestrator/iter-studio/tool-display.js`
- `public/scripts/agents/orchestrator/legacy-agent-routing.js`
- `public/scripts/agents/orchestrator/legacy-parallel-adapter.js`
- `public/scripts/agents/orchestrator/legacy-runtime-adapter.js`
- `public/scripts/agents/orchestrator/legacy-runtime-ports.js`
- `public/scripts/agents/orchestrator/legacy-worker-protocol.js`
- `public/scripts/agents/orchestrator/legacy-workflow-adapter.js`
- `public/scripts/agents/orchestrator/line-diff.js`
- `public/scripts/agents/orchestrator/loop-default-prompt.js`
- `public/scripts/agents/orchestrator/loop-iteration.js`
- `public/scripts/agents/orchestrator/loop-runtime.js`
- `public/scripts/agents/orchestrator/loop-tools.js`
- `public/scripts/agents/orchestrator/loop-tools/chat.js`
- `public/scripts/agents/orchestrator/loop-tools/lorebook-force-activate.js`
- `public/scripts/agents/orchestrator/loop-tools/lorebook.js`
- `public/scripts/agents/orchestrator/loop-tools/note.js`
- `public/scripts/agents/orchestrator/lorebook-filter.js`
- `public/scripts/agents/orchestrator/main.js`
- `public/scripts/agents/orchestrator/notes-panel.js`
- `public/scripts/agents/orchestrator/notes-template.js`
- `public/scripts/agents/orchestrator/notes.css`
- `public/scripts/agents/orchestrator/open-notes-injection.js`
- `public/scripts/agents/orchestrator/output-formatting.js`
- `public/scripts/agents/orchestrator/per-run-custom-tools.js`
- `public/scripts/agents/orchestrator/persistence.js`
- `public/scripts/agents/orchestrator/profile-projection.js`
- `public/scripts/agents/orchestrator/prompt-embed-unembedded.js`
- `public/scripts/agents/orchestrator/pure-preset-body.js`
- `public/scripts/agents/orchestrator/quick-guidance.js`
- `public/scripts/agents/orchestrator/register-custom-tool.js`
- `public/scripts/agents/orchestrator/review-feedback.js`
- `public/scripts/agents/orchestrator/run-state/events.js`
- `public/scripts/agents/orchestrator/run-state/helpers.js`
- `public/scripts/agents/orchestrator/run-state/runtime-observer.js`
- `public/scripts/agents/orchestrator/run-state/store.js`
- `public/scripts/agents/orchestrator/run-state/types.js`
- `public/scripts/agents/orchestrator/runtime-checkpoints.js`
- `public/scripts/agents/orchestrator/runtime-trace-export.js`
- `public/scripts/agents/orchestrator/seed-default-custom-tools.js`
- `public/scripts/agents/orchestrator/simulation-payload-adapter.js`
- `public/scripts/agents/orchestrator/skill-iter-studio-prompt.js`
- `public/scripts/agents/orchestrator/skill-orchestration-tools.js`
- `public/scripts/agents/orchestrator/skill-resolution.js`
- `public/scripts/agents/orchestrator/snapshot-cache.js`
- `public/scripts/agents/orchestrator/spec-runtime.js`
- `public/scripts/agents/orchestrator/spec-schema.js`
- `public/scripts/agents/orchestrator/studio-prompt-augment.js`
- `public/scripts/agents/orchestrator/system-prompt-patch.js`
- `public/scripts/agents/orchestrator/template-vars.js`
- `public/scripts/agents/orchestrator/tool-calling.js`
- `public/scripts/agents/orchestrator/workspace/agent-editing.js`
- `public/scripts/agents/orchestrator/workspace/authoring.js`
- `public/scripts/agents/orchestrator/workspace/diagnostics/page.js`
- `public/scripts/agents/orchestrator/workspace/host-presets.js`
- `public/scripts/agents/orchestrator/workspace/host-profile.js`
- `public/scripts/agents/orchestrator/workspace/host-refresh.js`
- `public/scripts/agents/orchestrator/workspace/memory.js`
- `public/scripts/agents/orchestrator/workspace/memory/page.js`
- `public/scripts/agents/orchestrator/workspace/native-preset-prompts.js`
- `public/scripts/agents/orchestrator/workspace/orchestration/page.js`
- `public/scripts/agents/orchestrator/workspace/orchestration/permissions.js`
- `public/scripts/agents/orchestrator/workspace/panel.css`
- `public/scripts/agents/orchestrator/workspace/panel.js`
- `public/scripts/agents/orchestrator/workspace/shell.js`
- `public/scripts/agents/orchestrator/world-info.js`

### `public/scripts/lib/agent-runtime/`

- `public/scripts/lib/agent-runtime/abort.js`
- `public/scripts/lib/agent-runtime/checkpoint-store.js`
- `public/scripts/lib/agent-runtime/context-compiler.js`
- `public/scripts/lib/agent-runtime/contracts.js`
- `public/scripts/lib/agent-runtime/durable-checkpoint-store.js`
- `public/scripts/lib/agent-runtime/events.js`
- `public/scripts/lib/agent-runtime/host-ports.js`
- `public/scripts/lib/agent-runtime/index.js`
- `public/scripts/lib/agent-runtime/indexeddb-checkpoints.js`
- `public/scripts/lib/agent-runtime/parallel.js`
- `public/scripts/lib/agent-runtime/prepared-context.js`
- `public/scripts/lib/agent-runtime/projection.js`
- `public/scripts/lib/agent-runtime/registry.js`
- `public/scripts/lib/agent-runtime/runtime.js`
- `public/scripts/lib/agent-runtime/state.js`

### `public/scripts/lib/orchestration-engine/`

- `public/scripts/lib/orchestration-engine/arbitration.js`
- `public/scripts/lib/orchestration-engine/capabilities.js`
- `public/scripts/lib/orchestration-engine/contracts.js`
- `public/scripts/lib/orchestration-engine/graph.js`
- `public/scripts/lib/orchestration-engine/index.js`
- `public/scripts/lib/orchestration-engine/policy-controller.js`
- `public/scripts/lib/orchestration-engine/projection.js`
- `public/scripts/lib/orchestration-engine/results.js`
- `public/scripts/lib/orchestration-engine/scheduler.js`

### `public/scripts/lib/agent-workspace/`

- `public/scripts/lib/agent-workspace/graph-view.js`
- `public/scripts/lib/agent-workspace/presets.js`
- `public/scripts/lib/agent-workspace/projection.js`
- `public/scripts/lib/agent-workspace/prompt-versions.js`
- `public/scripts/lib/agent-workspace/strategy-versions.js`

## 旧根及外部直接路径消费者的动态加载点

以下保留原代码行（不含用户数据）；变量/模板须在正式 P6 用真实启动/路由测试补证，不能因为 grep 没有命中旧路径而视作安全。

| 文件:行 | 表达式 |
| --- | --- |
| `public/scripts/agents/memory/orchestrator-tools.js:90` | `const mg = await import('./api.js');` |
| `public/scripts/agents/orchestrator/agenda-runtime.js:128` | `_skillResolutionPromise = import('./skill-resolution.js');` |
| `public/scripts/agents/orchestrator/director-runtime.js:77` | `_skillResolutionPromise = import('./skill-resolution.js');` |
| `public/scripts/agents/orchestrator/director-tools.js:70` | `_skillResolutionPromise = import('./skill-resolution.js');` |
| `public/scripts/agents/orchestrator/loop-runtime.js:70` | `_skillResolutionPromise = import('./skill-resolution.js');` |
| `public/scripts/agents/orchestrator/loop-runtime.js:179` | `import('./tool-calling.js'),` |
| `public/scripts/agents/orchestrator/loop-runtime.js:180` | `import('./agent-resolution.js'),` |
| `public/scripts/agents/orchestrator/loop-runtime.js:820` | `const { executeLoopTool } = await import('./loop-tools.js');` |
| `public/scripts/agents/orchestrator/main.js:891` | `css.href = new URL('./workspace/panel.css', import.meta.url).href; document.head.append(css);` |
| `public/scripts/agents/orchestrator/notes-panel.js:31` | `style.href = new URL('./notes.css', import.meta.url).href; document.head.append(style);` |
| `public/scripts/agents/orchestrator/spec-runtime.js:124` | `_skillResolutionPromise = import('./skill-resolution.js');` |
| `public/scripts/agents/orchestrator/workspace/panel.js:439` | `css.href = new URL('./panel.css', import.meta.url).href;` |
| `public/scripts/atria-shell/workspace-host.js:195` | `const panel = await import('../agents/orchestrator/workspace/panel.js');` |
| `public/scripts/atria-shell/workspace-host.js:216` | `const studio = await import('../native/studio-workspace.js');` |
| `public/scripts/atria-shell/workspace-host.js:222` | `import('../logging/workspace.js'),` |
| `public/scripts/atria-shell/workspace-host.js:223` | `import('../user.js'),` |
| `public/scripts/capability-host.js:80` | `const regex = await import('./extensions/regex/index.js'); await regex.init();` |
| `public/scripts/capability-host.js:82` | `await load('game-runtime', () => import('./native/experience/index.js'));` |
| `public/scripts/capability-host.js:83` | `await load('search-tools', () => import('./extensions/search-tools/index.js'));` |
| `public/scripts/capability-host.js:84` | `await load('orchestrator', () => import('./agents/orchestrator/index.js'));` |
| `public/scripts/capability-host.js:85` | `await load('memory-graph', () => import('./agents/memory/index.js'));` |
| `src/native/agent-intelligence/evaluation/worker.js:7` | `setConfigFilePath(fileURLToPath(new URL('../../../../default/config.yaml', import.meta.url)));` |
| `src/native/agent-intelligence/evaluation/worker.js:20` | `await import('../../../../public/scripts/agents/orchestrator/skill-resolution.js');` |
| `src/native/agent-intelligence/evaluation/worker.js:34` | `const { runRp, runProject } = await import('./adapters.js');` |
| `src/native/agent-intelligence/evaluation/worker.js:36` | `const { createFrozenEvaluationBridge } = await import('./worker-bridge.js');` |
| `src/native/agent-intelligence/evaluation/worker.js:37` | `const { readSealedSource } = await import('./sealed-sources.js');` |
| `src/native/agent-intelligence/evaluation/worker.js:99` | `await import('./adapters.js');` |
| `src/native/agent-intelligence/evaluation/worker.js:104` | `const { selectCases } = await import('./cases.js');` |
| `src/native/agent-intelligence/evaluation/worker.js:105` | `const { readSealedSource } = await import('./sealed-sources.js');` |
| `src/native/agent-intelligence/evolution-evaluator.js:28` | `.map(name => [name, readFileSync(new URL(name, import.meta.url), 'utf8')]));` |
| `src/native/agent-intelligence/evolution-evaluator.js:215` | `const child = fork(fileURLToPath(new URL('./evaluation/worker.js', import.meta.url)), [], {` |
| `src/native/agent-intelligence/evolution-evaluator.js:216` | `execArgv: ['--experimental-loader', new URL('./evaluation/loader.js', import.meta.url).href], env: { PATH: process.env.PATH &#124;&#124; '', NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced',` |
| `tests/agent-intelligence/capture.test.js:205` | `const { createHttpGenerationProvider } = await import('../../src/native/adapters/http-generation-provider.js');` |
| `tests/agent-intelligence/capture.test.js:206` | `const { createNativeMessagesProvider } = await import('../../src/native/adapters/native-messages-provider.js');` |
| `tests/agent-intelligence/comparison.js:12` | `const root = fileURLToPath(new URL('../../', import.meta.url));` |
| `tests/agent-intelligence/comparison.js:24` | `.map(name => [name, fs.readFileSync(new URL(name, import.meta.url), 'utf8')]));` |
| `tests/agent-intelligence/comparison.js:64` | `const { runRp, runProject } = mode === 'scripted' &#124;&#124; bridge ? await import('./adapters.js') : {};` |
| `tests/agent-intelligence/evolution-consumers.test.js:94` | `const otherSource = structuredClone(f.source); otherSource.project.projectId = (await import('../../src/native/identity.js')).createNativeId('project');` |
| `tests/agent-intelligence/evolution-consumers.test.js:104` | `const { buildNativeProjectAgentSystemPrompt } = await import('../../public/scripts/native/studio-agent.js');` |
| `tests/agent-intelligence/evolution.test.js:131` | `const { rm } = await import('node:fs/promises'); await rm(f.h.dirs.root, { recursive: true, force: true });` |
| `tests/agent-intelligence/evolution.test.js:133` | `const { Readable } = await import('node:stream'); await f.h.engine.restoreUser(f.h.handle, Readable.from(Buffer.concat(chunks)));` |
| `tests/agent-intelligence/evolution.test.js:181` | `const { cp, rm } = await import('node:fs/promises'); const copy = f.h.dataRoot + '/directory-backup';` |
| `tests/agent-runtime/engine-mode-recovery.test.js:11` | `const { runSpecEngine } = await import('../../public/scripts/agents/orchestrator/engine-v2/spec-adapter.js');` |
| `tests/agent-runtime/engine-mode-recovery.test.js:12` | `const { runAgendaEngine } = await import('../../public/scripts/agents/orchestrator/engine-v2/agenda-adapter.js');` |
| `tests/agent-runtime/handoff-routing.test.js:117` | `const { runLegacySingleRequest } = await import('../../public/scripts/agents/orchestrator/legacy-runtime-adapter.js');` |
| `tests/agent-runtime/workspace-preset-help.test.js:14` | `window.eval(fs.readFileSync(new URL('../../public/lib/jquery-3.5.1.min.js', import.meta.url), 'utf8'));` |
| `tests/agent-runtime/workspace-preset-help.test.js:32` | `const { renderRuntimeHelpButton } = await import('../../public/scripts/lib/runtime-help.js');` |
| `tests/agent-runtime/workspace-preset-help.test.js:33` | `const { createPresetAuthoring } = await import('../../public/scripts/agents/orchestrator/workspace/authoring.js');` |
| `tests/agent-runtime/workspace-preset-help.test.js:34` | `const { createWorkspaceFactoryPreset } = await import('../../public/scripts/agents/orchestrator/workspace/host-presets.js');` |
| `tests/agent-runtime/workspace-preset-help.test.js:35` | `const { emptyPresetLibrary, updatePresetLibrary } = await import('../../public/scripts/lib/agent-workspace/presets.js');` |
| `tests/agent-runtime/workspace-preset-help.test.js:51` | `globalThis.fetch = jest.fn(async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(new URL(\`../../public${url}\`, import.meta.url), 'utf8')) }));` |
| `tests/agent-runtime/workspace-state.test.js:11` | `const { runSpecEngine } = await import('../../public/scripts/agents/orchestrator/engine-v2/spec-adapter.js');` |
| `tests/atria-shell/memory-workspace-lifecycle.test.js:5` | `const { createMemoryWorkspace } = await import('../../public/scripts/agents/orchestrator/workspace/memory/page.js');` |
| `tests/character-presets/orchestrator-collect-unembedded.test.js:41` | `const { collectUnembeddedPresets } = await import(` |
| `tests/e2e/_lib/page.js:39` | `const target = new URL(baseURL);` |
| `tests/e2e/_lib/page.js:92` | `const mod = await import('/scripts/openai.js');` |
| `tests/e2e/_lib/page.js:913` | `const { updatePresetLibrary, emptyPresetLibrary } = await import('/scripts/lib/agent-workspace/presets.js');` |
| `tests/e2e/_lib/page.js:914` | `const { compilePreset } = await import('/scripts/agents/orchestrator/engine-v2/preset-compiler.js');` |
| `tests/e2e/_lib/page.js:915` | `const dirDefaults = await import('/scripts/agents/orchestrator/director-defaults.js');` |
| `tests/e2e/memorygraph/memory-os-enabled.e2e.js:38` | `const { openWorkspace } = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/e2e/native-session/11-utilities-redesign.e2e.js:266` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/native-session/11-utilities-redesign.e2e.js:282` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/native-session/12-native-agent-routes.e2e.js:50` | `const profiles = await page.evaluate(async () => (await import('/scripts/native/retrieval-client.js')).listRetrievalProfiles());` |
| `tests/e2e/native-session/12-native-agent-routes.e2e.js:87` | `const profiles = await page.evaluate(async () => (await import('/scripts/native/retrieval-client.js')).listRetrievalProfiles());` |
| `tests/e2e/native-session/12-native-agent-routes.e2e.js:217` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/native-session/12-native-agent-routes.e2e.js:218` | `const { getChatKey } = await import('/scripts/agents/orchestrator/snapshot-cache.js');` |
| `tests/e2e/orchestrator/68-run-panel-stream-final-commit.e2e.js:60` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/orchestrator/68-run-panel-stream-final-commit.e2e.js:110` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/orchestrator/74-capsule-injection-main-and-sub-share.e2e.js:81` | `const mod = await import('/scripts/agents/orchestrator/capsule-injection.js');` |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:62` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:104` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:118` | `const m = await import('/script.js');` |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:129` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/orchestrator/75-abort-mid-run.e2e.js:188` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/orchestrator/78-multi-skill-visible-director-and-subagent.e2e.js:75` | `const { updatePresetLibrary } = await import('/scripts/lib/agent-workspace/presets.js');` |
| `tests/e2e/orchestrator/78-multi-skill-visible-director-and-subagent.e2e.js:89` | `const mod = await import('/scripts/agents/orchestrator/skill-resolution.js');` |
| `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js:160` | `const worldInfoMod = await import('/scripts/world-info.js');` |
| `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js:185` | `void (await import('/scripts/world-info.js'));` |
| `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js:233` | `const { createWorkspaceFactoryPreset } = await import('/scripts/agents/orchestrator/workspace/host-presets.js');` |
| `tests/e2e/orchestrator/79-lorebook-filter-loop.e2e.js:234` | `const { updatePresetLibrary, emptyPresetLibrary } = await import('/scripts/lib/agent-workspace/presets.js');` |
| `tests/e2e/orchestrator/80-lorebook-filter-director.e2e.js:116` | `const worldInfoMod = await import('/scripts/world-info.js');` |
| `tests/e2e/orchestrator/80-lorebook-filter-director.e2e.js:165` | `const { updatePresetLibrary } = await import('/scripts/lib/agent-workspace/presets.js');` |
| `tests/e2e/orchestrator/81-dispatch-barrier-first-chunk-serialization.e2e.js:156` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/e2e/regression/125-orch-preset-switch-persist.e2e.js:82` | `await page.evaluate(async () => { const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.openWorkspace('Orchestration'); });` |
| `tests/e2e/regression/125-orch-preset-switch-persist.e2e.js:108` | `await page.evaluate(async () => { const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.openWorkspace('Orchestration'); });` |
| `tests/frontend/agenda-tool-safety.smoke.mjs:23` | `const { runAgendaOrchestration } = await import('/scripts/agents/orchestrator/agenda-runtime.js');` |
| `tests/frontend/agenda-tool-safety.smoke.mjs:24` | `const { getCurrentRun } = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/frontend/agenda-world-info.smoke.mjs:23` | `const wi = await import('/scripts/world-info.js');` |
| `tests/frontend/agenda-world-info.smoke.mjs:24` | `const { generateTask } = await import('/scripts/generate-task.js');` |
| `tests/frontend/agenda-world-info.smoke.mjs:25` | `const { runAgendaOrchestration } = await import('/scripts/agents/orchestrator/agenda-runtime.js');` |
| `tests/frontend/agenda-world-info.smoke.mjs:26` | `const { createWorkspaceFactoryPreset, workspaceHostProfile } = await import('/scripts/agents/orchestrator/workspace/host-presets.js');` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:9` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:13` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:28` | `ParallelExecutor, createRuntimeBranchPort } = await import('/scripts/lib/agent-runtime/index.js');` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:91` | `const { configureRuntimeCheckpoints } = await import('/scripts/agents/orchestrator/runtime-checkpoints.js');` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:92` | `const { runLegacyParallel } = await import('/scripts/agents/orchestrator/legacy-parallel-adapter.js');` |
| `tests/frontend/agent-runtime-parallel.smoke.mjs:93` | `const { runLegacySingleRequest } = await import('/scripts/agents/orchestrator/legacy-runtime-adapter.js');` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:8` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:12` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:25` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:26` | `const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:27` | `const { replayRuntimeEvents } = await import('/scripts/lib/agent-runtime/projection.js');` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:28` | `const { runRoutedLegacyWorkflow, createLegacyAgentGraph } = await import('/scripts/agents/orchestrator/legacy-agent-routing.js');` |
| `tests/frontend/agent-runtime-projection.smoke.mjs:29` | `const { modelIntent, toolIntent } = await import('/scripts/agents/orchestrator/legacy-workflow-adapter.js');` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:9` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:13` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:31` | `const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/index.js');` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:68` | `const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/index.js');` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:108` | `const { AgentRuntime, AgentRegistry, DurableCheckpointStore, openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/index.js');` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:109` | `const { configureRuntimeCheckpoints, listRuntimeCheckpoints, cancelRuntimeCheckpoint } = await import('/scripts/agents/orchestrator/runtime-checkpoints.js');` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:110` | `const { runLegacySingleRequest } = await import('/scripts/agents/orchestrator/legacy-runtime-adapter.js');` |
| `tests/frontend/agent-runtime-recovery.smoke.mjs:111` | `const { runLegacyWorkflow, modelIntent } = await import('/scripts/agents/orchestrator/legacy-workflow-adapter.js');` |
| `tests/frontend/agent-runtime.smoke.mjs:9` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-runtime.smoke.mjs:17` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-runtime.smoke.mjs:32` | `const { AgentRuntime, AgentRegistry } = await import('/scripts/lib/agent-runtime/index.js');` |
| `tests/frontend/agent-runtime.smoke.mjs:33` | `const { runLegacySingleRequest } = await import('/scripts/agents/orchestrator/legacy-runtime-adapter.js');` |
| `tests/frontend/agent-runtime.smoke.mjs:34` | `const { createMemoryOSPort } = await import('/scripts/lib/agent-runtime/host-ports.js');` |
| `tests/frontend/agent-runtime.smoke.mjs:67` | `const { runLegacyWorkflow, modelIntent, toolIntent } = await import('/scripts/agents/orchestrator/legacy-workflow-adapter.js');` |
| `tests/frontend/agent-runtime.smoke.mjs:73` | `const { createLegacyAgentGraph, runRoutedLegacyWorkflow } = await import('/scripts/agents/orchestrator/legacy-agent-routing.js');` |
| `tests/frontend/agent-runtime.smoke.mjs:81` | `const { generateTask } = await import('/scripts/generate-task.js');` |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:7` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:11` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:27` | `const locale = await import('/scripts/agents/orchestrator/i18n.js'); locale.registerLocaleData();` |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:28` | `window.store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/frontend/agent-workspace-call-counts.smoke.mjs:29` | `window.panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-workspace-host.smoke.mjs:18` | `const state=await page.evaluate(async()=>{const panel=await import('/scripts/agents/orchestrator/workspace/panel.js');panel.openWorkspace('Orchestration');return document.querySelector('#agent-memory-workspace').textContent;});` |
| `tests/frontend/agent-workspace-host.smoke.mjs:43` | `await page.evaluate(async()=>{const panel=await import('/scripts/agents/orchestrator/workspace/panel.js');panel.openWorkspace('Orchestration');});` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:9` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:13` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:25` | `const memoryFixture = (await readFile(new URL('../memory-graph/fixtures/large-memory.js', import.meta.url), 'utf8')).replace('../../../public/scripts/', '/scripts/');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:27` | `const cytoscape = await readFile(new URL('../../node_modules/cytoscape/dist/cytoscape.esm.min.mjs', import.meta.url), 'utf8');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:33` | `const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:34` | `const { createPresetAuthoring } = await import('/scripts/agents/orchestrator/workspace/authoring.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:35` | `const { createMemoryWorkspace } = await import('/scripts/agents/orchestrator/workspace/memory.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:189` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:235` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:244` | `await page.evaluate(async () => { const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.openWorkspace('Diagnostics'); });` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:248` | `const store = await import('/scripts/agents/orchestrator/run-state/store.js'); store.finishRun({runId:window.runId,status:'aborted'});` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:260` | `await page.evaluate(async () => {const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.destroyWorkspace(); panel.destroyWorkspace(); panel.openWorkspace('Orchestration');});` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:269` | `const { largeMemory } = await import('/__workspace_large.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:270` | `const { default: cytoscape } = await import('/__workspace_cytoscape.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:271` | `const { computeInspector } = await import('/scripts/agents/memory/inspector-compute.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:272` | `const { createMemoryWorkspace } = await import('/scripts/agents/orchestrator/workspace/memory.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:273` | `const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:301` | `const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:312` | `const { registerLocaleData } = await import('/scripts/agents/orchestrator/i18n.js'); registerLocaleData();` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:313` | `const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-workspace-ui.smoke.mjs:314` | `const { createPresetAuthoring } = await import('/scripts/agents/orchestrator/workspace/authoring.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:8` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/agent-workspace.smoke.mjs:12` | `const path = resolve(root, \`.${new URL(req.url, 'http://localhost').pathname}\`);` |
| `tests/frontend/agent-workspace.smoke.mjs:26` | `const { AgentRuntime, AgentRegistry } = await import('/scripts/lib/agent-runtime/index.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:27` | `const { DurableCheckpointStore } = await import('/scripts/lib/agent-runtime/durable-checkpoint-store.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:28` | `const { openIndexedDBCheckpoints } = await import('/scripts/lib/agent-runtime/indexeddb-checkpoints.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:29` | `const { runEnginePlan } = await import('/scripts/agents/orchestrator/engine-v2/runtime-bridge.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:30` | `const { CAPABILITIES } = await import('/scripts/lib/orchestration-engine/index.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:31` | `const { assertOutputAuthorized } = await import('/scripts/agents/orchestrator/engine-v2/output-adapter.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:32` | `const { replayRuntimeEvents } = await import('/scripts/lib/agent-runtime/projection.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:33` | `const panelStore = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:34` | `const panel = await import('/scripts/agents/orchestrator/workspace/panel.js');` |
| `tests/frontend/agent-workspace.smoke.mjs:105` | `await page.evaluate(async () => { const panel = await import('/scripts/agents/orchestrator/workspace/panel.js'); panel.openWorkspace('Run'); panel.destroyWorkspace(); panel.openWorkspace('Run'); });` |
| `tests/frontend/hm1-memory.smoke.mjs:7` | `const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));` |
| `tests/frontend/hm1-memory.smoke.mjs:11` | `const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);` |
| `tests/frontend/hm1-memory.smoke.mjs:36` | `const { createMemoryWorkspace } = await import('/scripts/agents/orchestrator/workspace/memory/page.js');` |
| `tests/frontend/hm1-memory.smoke.mjs:59` | `const { buildMemoryGraphSettingsHtml } = await import('/scripts/agents/memory/ui-templates.js');` |
| `tests/jest.setup.js:97` | `const orchestratorMod = await import('../public/scripts/agents/orchestrator/register-custom-tool.js');` |
| `tests/memory-graph/orchestrator-tools-register.test.js:12` | `const { __setSessionForTest } = await import('../../public/scripts/agents/memory/orchestrator-tools.js');` |
| `tests/memory-graph/orchestrator-tools-register.test.js:110` | `const { __setSessionForTest } = await import('../../public/scripts/agents/memory/orchestrator-tools.js');` |
| `tests/native/mcp-delegated-generation.test.js:25` | `for (const [key, file] of [['delegation', 'agent-delegation.js'], ['kernel', 'kernel.js'], ['browser', 'browser.js']]) loaded[key] = await import(pathToFileURL(join(root, 'src', file)).href);` |
| `tests/native/mcp-delegated-generation.test.js:59` | `app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url)))); app.get('/', (_req, res) => res.type('html').send('<!doctype html><main>Delegated Native fixture</main>'));` |
| `tests/native/mcp-delegated-generation.test.js:69` | `const { createDelegatedRunApi } = await import('/scripts/agents/orchestrator/delegated-run.js');` |
| `tests/orch-iteration/control-tools.test.js:22` | `const { default: lodash } = await import('lodash');` |
| `tests/orch-iteration/control-tools.test.js:29` | `({ ORCH_TOOL_DISPLAY } = await import(` |
| `tests/orch-iteration/popup-bug-regression.test.js:26` | `const { default: lodash } = await import('lodash');` |
| `tests/orch-iteration/popup-bug-regression.test.js:42` | `({ normalizeMessageShape } = await import(` |
| `tests/orch-iteration/popup-bug-regression.test.js:45` | `({ ORCH_TOOL_DISPLAY } = await import(` |
| `tests/orch-iteration/read-fields.test.js:181` | `const { sanitizeLoopProfile } = await import('../../public/scripts/agents/orchestrator/persistence.js');` |
| `tests/orch-iteration/tool-display.test.js:26` | `const { default: lodash } = await import('lodash');` |
| `tests/orch-iteration/tool-display.test.js:33` | `({ ORCH_TOOL_DISPLAY } = await import(` |
| `tests/orchestrator-skills/skill-orchestration-tools.test.js:43` | `const { registerSkillOrchestrationTools, unregisterSkillOrchestrationTools } = await import(` |
| `tests/orchestrator-skills/skill-resolution.test.js:26` | `} = await import('../../public/scripts/agents/orchestrator/skill-resolution.js');` |
| `tests/orchestrator/agenda-host-gate.test.js:9` | `const main = readFileSync(new URL('../../public/scripts/agents/orchestrator/main.js', import.meta.url), 'utf8');` |
| `tests/orchestrator/agenda-host-gate.test.js:11` | `const core = readFileSync(new URL('../../public/script.js', import.meta.url), 'utf8');` |
| `tests/orchestrator/agenda-spec-customs-seed.test.js:70` | `({ sanitizeAgendaWorkingProfile } = await import('../../public/scripts/agents/orchestrator/agenda-profile.js'));` |
| `tests/orchestrator/agenda-spec-customs-seed.test.js:71` | `({ sanitizeSpec } = await import('../../public/scripts/agents/orchestrator/spec-schema.js'));` |
| `tests/orchestrator/agenda-tool-safety.test.js:88` | `const runtime = await import('../../public/scripts/agents/orchestrator/agenda-runtime.js');` |
| `tests/orchestrator/agenda-tool-safety.test.js:90` | `panel = (await import('../../public/scripts/agents/orchestrator/run-state/store.js')).getCurrentRun;` |
| `tests/orchestrator/agenda-world-info.test.js:5` | `beforeAll(async () => { resolve = (await import('../../public/scripts/agents/orchestrator/agenda-world-info.js')).resolveAgendaWorldInfo; });` |
| `tests/orchestrator/agent-prompt-preset-routing-data.test.js:84` | `} = await import('../../public/scripts/agents/orchestrator/agent-resolution.js'));` |
| `tests/orchestrator/custom-tool-bridge-st.test.js:50` | `} = await import('../../public/scripts/agents/orchestrator/register-custom-tool.js');` |
| `tests/orchestrator/custom-tool-bridge-st.test.js:51` | `const { executeLoopTool } = await import('../../public/scripts/agents/orchestrator/loop-tools.js');` |
| `tests/orchestrator/custom-tool-iter-studio.test.js:53` | `mod = await import('../../public/scripts/agents/orchestrator/custom-tool-iter-studio.js');` |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:70` | `({ sanitizeLoopProfile, sanitizeAgentToolFlags } = await import('../../public/scripts/agents/orchestrator/persistence.js'));` |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:71` | `({ sanitizeSpec } = await import('../../public/scripts/agents/orchestrator/spec-schema.js'));` |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:72` | `({ sanitizeAgendaWorkingProfile } = await import('../../public/scripts/agents/orchestrator/agenda-profile.js'));` |
| `tests/orchestrator/custom-tool-portable-roundtrip.test.js:73` | `({ sanitizeDirectorProfile } = await import('../../public/scripts/agents/orchestrator/director-defaults.js'));` |
| `tests/orchestrator/custom-tool-runtime-agenda.test.js:122` | `({ runAgendaOrchestration, runAgendaTextAgent } = await import('../../public/scripts/agents/orchestrator/agenda-runtime.js'));` |
| `tests/orchestrator/custom-tool-runtime-loop.test.js:62` | `const { registerOrchestrationTool } = await import('../../public/scripts/agents/orchestrator/register-custom-tool.js');` |
| `tests/orchestrator/custom-tool-runtime-spec.test.js:101` | `({ runSpecOrchestration } = await import('../../public/scripts/agents/orchestrator/spec-runtime.js'));` |
| `tests/orchestrator/custom-tool-sanitize.test.js:75` | `({ sanitizeLoopProfile } = await import('../../public/scripts/agents/orchestrator/persistence.js'));` |
| `tests/orchestrator/custom-tool-sanitize.test.js:76` | `({ sanitizeSpec } = await import('../../public/scripts/agents/orchestrator/spec-schema.js'));` |
| `tests/orchestrator/custom-tool-sanitize.test.js:77` | `({ sanitizeAgendaWorkingProfile } = await import('../../public/scripts/agents/orchestrator/agenda-profile.js'));` |
| `tests/orchestrator/custom-tool-sanitize.test.js:78` | `({ sanitizeDirectorProfile } = await import('../../public/scripts/agents/orchestrator/director-defaults.js'));` |
| `tests/orchestrator/default-custom-tools.test.js:73` | `({ DEFAULT_CUSTOM_TOOLS } = await import('../../public/scripts/agents/orchestrator/default-custom-tools.js'));` |
| `tests/orchestrator/default-custom-tools.test.js:74` | `({ seedDefaultCustomToolsIfNeeded, importDefaultCustomTools } = await import('../../public/scripts/agents/orchestrator/seed-default-custom-tools.js'));` |
| `tests/orchestrator/default-custom-tools.test.js:75` | `({ sanitizeLoopProfile } = await import('../../public/scripts/agents/orchestrator/persistence.js'));` |
| `tests/orchestrator/default-custom-tools.test.js:76` | `({ sanitizeSpec } = await import('../../public/scripts/agents/orchestrator/spec-schema.js'));` |
| `tests/orchestrator/default-custom-tools.test.js:77` | `({ sanitizeAgendaWorkingProfile } = await import('../../public/scripts/agents/orchestrator/agenda-profile.js'));` |
| `tests/orchestrator/default-custom-tools.test.js:78` | `({ sanitizeDirectorProfile } = await import('../../public/scripts/agents/orchestrator/director-defaults.js'));` |
| `tests/orchestrator/director-load-shape.test.js:16` | `const { sanitizeDirectorProfile } = await import(` |
| `tests/orchestrator/get-effective-profile-presets.test.js:56` | `const { default: lodash } = await import('lodash');` |
| `tests/orchestrator/get-effective-profile-presets.test.js:168` | `// Mock can't \`await import(...)\` the same specifier — that would loop` |
| `tests/orchestrator/get-effective-profile-presets.test.js:305` | `main = await import('../../public/scripts/agents/orchestrator/main.js');` |
| `tests/orchestrator/get-effective-profile-presets.test.js:314` | `const { getWorkspaceLibrary } = await import('../../public/scripts/agents/orchestrator/workspace/host-presets.js');` |
| `tests/orchestrator/get-effective-profile-presets.test.js:324` | `const { getWorkspaceLibrary } = await import('../../public/scripts/agents/orchestrator/workspace/host-presets.js');` |
| `tests/orchestrator/get-effective-profile-presets.test.js:336` | `const { runOrchestration } = await import('../../public/scripts/agents/orchestrator/main.js');` |
| `tests/orchestrator/loop-tools-lorebook.test.js:333` | `const { execWorldBookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:347` | `const { execWorldBookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:363` | `const { execWorldBookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:382` | `const { execWorldBookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:401` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:417` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:428` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:439` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:449` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:460` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:471` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:474` | `const { ToolError } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:482` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:492` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:501` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:504` | `const { ToolError } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:513` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:516` | `const { ToolError } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:525` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:528` | `const { ToolError } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:537` | `const { execLorebookList } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:551` | `const { runLoopOrchestration } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:554` | `const { jest } = await import('@jest/globals');` |
| `tests/orchestrator/loop-tools-lorebook.test.js:623` | `const { sanitizeAgentToolFlags } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:637` | `const { sanitizeAgentToolFlags } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:651` | `const { sanitizeAgentToolFlags } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:668` | `const { sanitizeAgentToolFlags } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:679` | `const { sanitizeLoopProfile } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:693` | `const { sanitizeAgentToolFlags } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:712` | `const { applyLoopProfilePatchArgs } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:715` | `const { sanitizeLoopProfile } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:732` | `const { applyLoopProfilePatchArgs } = await import(` |
| `tests/orchestrator/loop-tools-lorebook.test.js:735` | `const { sanitizeLoopProfile } = await import(` |
| `tests/orchestrator/loop-tools-note.test.js:423` | `await import('../../public/scripts/agents/orchestrator/loop-runtime.js');` |
| `tests/orchestrator/loop-tools-note.test.js:468` | `await import('../../public/scripts/agents/orchestrator/loop-runtime.js');` |
| `tests/orchestrator/loop-tools-note.test.js:503` | `await import('../../public/scripts/agents/orchestrator/loop-runtime.js');` |
| `tests/orchestrator/loop-tools-note.test.js:526` | `await import('../../public/scripts/agents/orchestrator/loop-runtime.js');` |
| `tests/orchestrator/loop-tools-note.test.js:550` | `await import('../../public/scripts/agents/orchestrator/loop-runtime.js');` |
| `tests/orchestrator/lorebook-filter-persistence.test.js:61` | `({ sanitizeLoopProfile } = await import('../../public/scripts/agents/orchestrator/persistence.js'));` |
| `tests/orchestrator/lorebook-filter-persistence.test.js:62` | `({ sanitizeSpec } = await import('../../public/scripts/agents/orchestrator/spec-schema.js'));` |
| `tests/orchestrator/lorebook-filter-persistence.test.js:63` | `({ sanitizeAgendaWorkingProfile } = await import('../../public/scripts/agents/orchestrator/agenda-profile.js'));` |
| `tests/orchestrator/lorebook-filter-persistence.test.js:64` | `({ sanitizeDirectorProfile } = await import('../../public/scripts/agents/orchestrator/director-defaults.js'));` |
| `tests/orchestrator/multi-skill-visible-resolver.test.js:57` | `const mod = await import('../../public/scripts/agents/orchestrator/skill-resolution.js');` |
| `tests/orchestrator/open-notes-cross-mode-injection.test.js:148` | `({ runAgendaPlannerStep, runAgendaTextAgent } = await import('../../public/scripts/agents/orchestrator/agenda-runtime.js'));` |
| `tests/orchestrator/open-notes-cross-mode-injection.test.js:149` | `({ runWorkerNode } = await import('../../public/scripts/agents/orchestrator/spec-runtime.js'));` |
| `tests/orchestrator/persistence.test.js:54` | `const { applyPatch } = await import('../../public/scripts/util/fast-json-patch.js');` |
| `tests/orchestrator/persistence.test.js:131` | `const { compare } = await import('../../public/scripts/util/fast-json-patch.js');` |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js:133` | `({ runAgendaOrchestration } = await import('../../public/scripts/agents/orchestrator/agenda-runtime.js'));` |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js:134` | `({ runLoopOrchestration } = await import('../../public/scripts/agents/orchestrator/loop-runtime.js'));` |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js:135` | `({ runSpecOrchestration } = await import('../../public/scripts/agents/orchestrator/spec-runtime.js'));` |
| `tests/orchestrator/skill-resolution-scope-precedence.test.js:41` | `const mod = await import('../../public/scripts/agents/orchestrator/skill-resolution.js');` |
| `tests/orchestrator/skill-resolution-scope-precedence.test.js:242` | `const mod = await import('../../public/scripts/agents/orchestrator/skill-resolution.js');` |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:77` | `} = await import('../../public/scripts/agents/orchestrator/defaults.js'));` |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:78` | `({ sanitizeAgendaWorkingProfile } = await import('../../public/scripts/agents/orchestrator/agenda-profile.js'));` |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:79` | `({ sanitizeLoopProfile } = await import('../../public/scripts/agents/orchestrator/persistence.js'));` |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:80` | `({ sanitizeSpec } = await import('../../public/scripts/agents/orchestrator/spec-schema.js'));` |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:81` | `({ runLoopOrchestration } = await import('../../public/scripts/agents/orchestrator/loop-runtime.js'));` |
| `tests/orchestrator/spec-agenda-loop-three-modes.test.js:82` | `({ clearCurrentRun } = await import('../../public/scripts/agents/orchestrator/run-state/store.js'));` |
| `tests/performance/runtime-smoke.mjs:153` | `const url = new URL(route.request().url());` |
| `tests/performance/runtime-smoke.mjs:180` | `const { mountWorldInfoWorkspace } = await import('/scripts/world-info/workspace.js');` |
| `tests/performance/runtime-smoke.mjs:244` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:251` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:257` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:262` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:288` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:296` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:302` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:315` | `const wi = await import('/scripts/world-info.js');` |
| `tests/performance/runtime-smoke.mjs:316` | `const core = await import('/script.js');` |
| `tests/performance/runtime-smoke.mjs:317` | `const { capabilitySettings } = await import('/scripts/capability-host.js');` |
| `tests/performance/runtime-smoke.mjs:319` | `const { applyProfileWorldInfoFilter } = await import('/scripts/agents/orchestrator/lorebook-filter.js');` |
| `tests/performance/runtime-smoke.mjs:320` | `const { createWorldInfoDispatchAttribution, markWorldInfoDispatch } = await import('/scripts/atri-world-info-provenance.js');` |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:113` | `const loopMod = await import('/scripts/agents/orchestrator/loop-tools.js');` |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:114` | `const dirMod = await import('/scripts/agents/orchestrator/director-tools.js');` |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:303` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/critic-regex-search.spec.js:343` | `const mod = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/director-with-skills.spec.js:107` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/director-with-skills.spec.js:217` | `const mod = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/director-with-skills.spec.js:335` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:69` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:88` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:109` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:139` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:162` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:188` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:247` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:305` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/helpers.js:323` | `const mod = await import('/scripts/agents/orchestrator/director-defaults.js');` |
| `tests/skills-ui/playwright/helpers.js:387` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/refresh-defaults.spec.js:124` | `const mod = await import('/scripts/agents/orchestrator/director-defaults.js');` |
| `tests/skills-ui/playwright/refresh-defaults.spec.js:208` | `* @param {import('@playwright/test').Page} page` |
| `tests/skills-ui/playwright/rp-demo-manual-flow.spec.js:381` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/rp-demo-manual-flow.spec.js:412` | `const mod = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/run-panel-live.spec.js:91` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/run-panel-live.spec.js:152` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/playwright/run-panel-live.spec.js:259` | `const m = await import('/scripts/agents/orchestrator/run-state/store.js');` |
| `tests/skills-ui/skill-iter-studio-tools.test.js:73` | `} = await import('../../public/scripts/iteration-library/tools/skill-iter-studio.js');` |
| `tests/skills-ui/skill-iter-studio-tools.test.js:80` | `} = await import('../../public/scripts/agents/orchestrator/skill-iter-studio-prompt.js');` |

覆盖限制：正则扫描不是 AST/打包器解析或运行时 trace，未证明计算属性 API、跨行字符串、下载插件或用户自定义工具的真实可达性；这些在 E0 最终就绪表保持 BLOCKED。允许清退的是上述版本内旧编排权威与入口；不以此清单声称外部生态没有消费者。

## Skill/旧协议补充逐文件索引

补充检索 `orch-preset|orchPreset|atri_orchestrator|Atria_AgentRuntime_|extensions/orchestrator`，避免只找 orchestrator 单词漏掉共享 scope。行号仅用于定位，不代表已执行。

| 文件 | 行号 |
| --- | --- |
| `docs/features/orchestrator/director.md` | 272 |
| `docs/features/orchestrator/index.md` | 134, 135 |
| `docs/features/state-system.md` | 72 |
| `docs/improvements/backend-storage.md` | 42 |
| `docs/zh-CN/features/orchestrator/director.md` | 272 |
| `docs/zh-CN/features/orchestrator/index.md` | 136, 137 |
| `docs/zh-CN/features/state-system.md` | 72 |
| `docs/zh-CN/improvements/backend-storage.md` | 42 |
| `docs/zh-TW/features/orchestrator/director.md` | 272 |
| `docs/zh-TW/features/orchestrator/index.md` | 134, 135 |
| `docs/zh-TW/features/state-system.md` | 72 |
| `docs/zh-TW/improvements/backend-storage.md` | 42 |
| `public/scripts/iteration-library/proposal-bus/diff-bodies/skill.js` | 56 |
| `public/scripts/iteration-library/text-diff.js` | 11 |
| `public/scripts/iteration-library/tools/skill-iter-studio.js` | 161, 178, 179, 534, 536, 538 |
| `public/scripts/lib/agent-runtime/indexeddb-checkpoints.js` | 11 |
| `public/scripts/lib/iter-tool-calling.js` | 8, 204 |
| `public/scripts/skills/api.js` | 11, 78, 79, 290 |
| `public/scripts/skills/embed-export-hook.js` | 88, 92, 117, 132, 177, 182, 184, 187 |
| `public/scripts/skills/embed-import-dialog.js` | 48 |
| `public/scripts/skills/embed-lifecycle.js` | 252, 271, 278, 284, 309, 314 |
| `public/scripts/skills/i18n.js` | 207, 218, 221 |
| `public/scripts/skills/scope-picker.js` | 160, 163, 166, 178, 205, 207, 209, 210, 211, 221, 234, 238, 247, 250, 301, 302, 305, 307, 318, 353, 354, 355, 359, 365, 390, 395 |
| `public/scripts/skills/skill-editor.js` | 255 |
| `public/scripts/skills/skill-manager-panel.js` | 46, 66, 84, 116, 118, 309, 313, 322 |
| `public/shared/skill-invocation.js` | 10 |
| `src/endpoints/skills.js` | 235 |
| `src/native/agent-intelligence/evolution-targets.js` | 73 |
| `src/skills/repository.js` | 180, 181, 184, 188, 621, 624, 629, 660, 839, 919 |
| `src/skills/scope.js` | 57, 59, 86, 87, 90, 92, 118 |
| `tests/e2e/storage-inspector/_helpers.js` | 49 |
| `tests/endpoints/skills.test.js` | 28, 36, 41, 46, 47, 52, 57, 70, 80, 132, 138, 139, 142, 143, 150, 154, 160, 161, 168, 174, 185, 186, 208, 210, 213, 216, 221 |
| `tests/native/contracts.test.js` | 176, 215 |
| `tests/native/save-system.test.js` | 202, 269 |
| `tests/native/session-core.contract.test.js` | 230, 245 |
| `tests/orch-iteration/session-store.test.js` | 112, 154 |
| `tests/orchestrator/persistence.test.js` | 506 |
| `tests/orchestrator/skill-resolution-runtime-plumbing.test.js` | 5, 6, 13, 22, 115, 212 |
| `tests/orchestrator/skill-resolution-scope-precedence.test.js` | 139, 154, 163, 169, 174, 179, 181, 184, 185, 195, 207, 212, 217, 230, 239, 246, 252, 255, 257, 260, 261, 262, 263 |
| `tests/skills-ui/playwright/critic-regex-search.spec.js` | 42, 531 |
| `tests/skills-ui/playwright/helpers.js` | 185 |
| `tests/skills/api.test.js` | 214, 222, 225, 238, 241, 258, 265, 283, 284, 290, 291, 301, 307 |
| `tests/skills/embed-export-hook-orch-preset.test.js` | 9, 15, 61, 65, 84, 88, 92, 129, 163, 183, 196 |
| `tests/skills/embed-lifecycle-orch-preset.test.js` | 33, 40, 62, 74 |
| `tests/skills/repository.test.js` | 641, 642, 649, 654, 658, 659, 672, 673, 678, 679, 683, 687, 688, 695, 696, 705, 720, 721, 722, 735, 736, 744, 745, 749, 750, 756, 759, 760, 766, 767, 769, 776, 784 |
| `tests/skills/scope-picker.test.js` | 7, 70, 71, 76, 82, 88, 90, 91, 93, 94, 95, 104, 115, 120 |
| `tests/skills/scope.test.js` | 153, 154, 155, 156, 157, 158, 161, 162, 164, 168, 169, 171, 175, 176, 177, 178, 179, 182, 183, 184, 185, 188, 189, 193, 194, 195, 196, 197, 200, 201 |
| `tests/storage-inspector/_fixture-helper.js` | 44, 104 |
| `tests/storage-inspector/enumerate-chats.test.js` | 141 |
