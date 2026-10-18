# Native Package 首启模型用途预检 — Record

- Task ID: fix/native-package-task-binding-preflight
- Primary Workspace: main 产品源码；短期分支 fix/native-package-task-binding-preflight
- Plan: 小型修复，无独立 Plan。
- Date: 2026-10-02

## Summary

首次安装声明 Task Runtime 的作品时，generation permission 已授予不代表玩家已配置 Task Slot → Runtime Route。旧 Works 启动路径先创建 Session，再在 lifecycle prepare 发现缺失绑定并进入 INVALID，Full Native UI 因此从未挂载。

本修复在 Works 默认版本及历史精确版本的创建入口加入只读绑定预检和模型用途配置；复用现有 player settings、Runtime Route picker、RouteResolver 与 reloadPackage。已有失败 Session 可从 Play 提示或 Experience Health 原地配置后重载，无需重新安装。

## Implementation

- Start HEAD: e8d0b983f (origin/main)
- Implementation HEAD: 1d352701a21e88b757195ebe398251224a99d0a2
- Final Tested HEAD: 542e926e2c4a0e05769bce0c7631932becacaafc（仅为真实包回归补充等待刷新 loading 完整结束；
- 按唯一 bindingSlotId 枚举用途，展示实际 Task ID 和能力要求；不硬编码 narrative/structured 中文含义。
- 每用途选择有效 player route；仅共同兼容路由提供“全部用途使用同一路由”。不替玩家选模型，无可用路由时链接现有 Runtime 配置。
- 取消、过期路由、外部 scope、能力不满足及网络错误均不能绕过屏障。
- 扩展既有 runtime/resource 支持声明资源 ID 批量读取；
- 复用 Library 表单/按钮组与 design tokens，包含窄屏 44px 选择器、加载/禁用/错误反馈，补齐 zh-CN/zh-TW。

## CI / Integration

- 将新浏览器回归加入 Native Model Prompt Runtime workflow；精确 release 从本地 package 工作区由环境变量提供，不复制到 main 或 CI。
- PR: https://github.com/ZZZdragondYNGPHX/Atria/pull/102
- CI HEAD: 542e926e2c4a0e05769bce0c7631932becacaafc
- Model Prompt integration 未完成。
- Codex CI connector 要求 ChatGPT 登录；公开 GitHub REST API 无需凭据可读取该公开仓库 CI，未使用 source-control CLI 读取诊断。
- PR #102 于 2026-10-02 12:16（Asia/Shanghai）正常 merge，merge commit 与 main HEAD 为 fa0c5df4f45b91c7750ed63f87c32100df68ad32。

## Final state

- Status: Complete
- main / origin/main: fa0c5df4f45b91c7750ed63f87c32100df68ad32
- git diff --exit-code 无差异。
- live HANDOFF 已删除；
- 未修改 package / release 1.0.0；DELETE 409 在已测首启流程中未复现。
