# English and Simplified Chinese UI — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: english-simplified-chinese-ui
- Primary Workspace: main
- Status: Complete
- Plan: 无；用户在前端设计梳理期间明确要求删除繁体，今后只保留英文和简中。

## Summary

界面语言菜单原本已只有 `en` / `zh-cn`。此任务不批准或实施整体前端视觉改版。

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
- 简中 E2E 仍保留 390/1440 两种宽度。

### Boundaries

只清理应用 UI 支持语言；历史文档、用户内容、模型文本处理语言、第三方翻译服务的语言选项不属于本次删除范围。

## Final state

产品实现合入 `main` 使用同一已测提交；确认远端与本地 HEAD 一致后清理短期分支。原有未跟踪依赖/日志保留。未创建 live HANDOFF；用户后续会提供视觉设计 HTML，再讨论正式前端企划。
