# English and Simplified Chinese UI — Record

- Task ID: english-simplified-chinese-ui
- Primary Workspace: main
- Status: Complete
- Plan: 无；用户在前端设计梳理期间明确要求删除繁体，今后只保留英文和简中。

## Summary

界面语言菜单原本已只有 `en` / `zh-cn`。本次清理仍保留在源码中的不支持 UI 词表、繁体插件注册及相关测试依赖，校验器以 `public/locales/lang.json` 为语言清单权威。此任务不批准或实施整体前端视觉改版。

## Stage 1 — Language resource cleanup

- Start HEAD: `8cb5be336`
- End/Tested HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Status: Complete

### Completed

- 删除主 UI 的 15 个不支持语言词表，包括繁体；英文使用源文案，保留简中词表与 `lang.json`。
- 删除 Memory、Orchestrator、Skills、Search Tools 的繁体注册与 Simulation Review 繁体资源。
- 保留已有语言归一化：旧中文区域值进入简中，其他不支持值进入英文。
- 本地化扫描器动态读取支持语言；准确跳过明确创建的 style 元素 CSS，不放过同名普通元素上的可见文案。
- 补齐 3 条图片连接说明的英文源文案和简中翻译。
- 更新相关单元测试与 E2E 语言断言；简中 E2E 仍保留 390/1440 两种宽度。

### Validation

- `npm run check:native-localization`：通过。原基线失败 28 条，本次同时移除繁体校验依赖、补齐简中缺项并修复 CSS 误报。
- 7 个定向 Jest suite、68 个不同用例最终均通过：首轮 67/68；修正旧繁体断言后重跑该 suite 26/26；lint 格式调整后重跑受影响 2 suite 8/8。
- Suites：`atria-shell/product-localization-coverage`、`atria-shell/localization`、`logging/workspace-i18n`、`memory-graph/injection-window`、`memory-graph/persistent-injection-recency-horizon`、`sync/categories`、`iteration-library/simulation-review/i18n-smoke`。
- 修改 JS 定向 ESLint：0 errors，既有 `skill-manager-flow.spec.js:140` conditional warning 1 条。
- 修改 `.mjs` 使用 Node/ES module parser 配置定向 ESLint：通过。
- `git diff --check`：通过。
- 未执行浏览器 E2E、全量构建、Android 或真实提供商调用；没有报告远端 CI 通过。本次小型资源清理采用本地针对性验证。

### Boundaries

只清理应用 UI 支持语言；历史文档、用户内容、模型文本处理语言、第三方翻译服务的语言选项不属于本次删除范围。英文界面的每一条旧文案尚未作全量浏览器人工验收。

## Final state

产品实现合入 `main` 使用同一已测提交；确认远端与本地 HEAD 一致后清理短期分支。原有未跟踪依赖/日志保留。未创建 live HANDOFF；用户后续会提供视觉设计 HTML，再讨论正式前端企划。
