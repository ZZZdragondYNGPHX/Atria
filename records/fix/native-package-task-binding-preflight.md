# Native Package 首启模型用途预检 — Record

- Task ID: fix/native-package-task-binding-preflight
- Primary Workspace: main 产品源码；短期分支 fix/native-package-task-binding-preflight
- Status: Active — 本地实现与验证完成，PR #102 等待必要 CI 集成
- Plan: 小型修复，无独立 Plan；按用户交接要求执行。
- Date: 2026-10-02

## Summary

首次安装声明 Task Runtime 的作品时，generation permission 已授予不代表玩家已配置 Task Slot → Runtime Route。旧 Works 启动路径先创建 Session，再在 lifecycle prepare 发现缺失绑定并进入 INVALID，Full Native UI 因此从未挂载。

本修复在 Works 默认版本及历史精确版本的创建入口加入只读绑定预检和模型用途配置；复用现有 player settings、Runtime Route picker、RouteResolver 与 reloadPackage。已有失败 Session 可从 Play 提示或 Experience Health 原地配置后重载，无需重新安装。

## Implementation

- Start HEAD: e8d0b983f (origin/main)
- Implementation HEAD: 1d352701a21e88b757195ebe398251224a99d0a2
- Final Tested HEAD: 542e926e2c4a0e05769bce0c7631932becacaafc（仅为真实包回归补充等待刷新 loading 完整结束；重新运行真实包 E2E 通过并检查最终无 loading/错误截图）
- 按唯一 bindingSlotId 枚举用途，展示实际 Task ID 和能力要求；不硬编码 narrative/structured 中文含义。
- 每用途选择有效 player route；仅共同兼容路由提供“全部用途使用同一路由”。不替玩家选模型，无可用路由时链接现有 Runtime 配置。
- 保存前重新校验当前配置，通过现有 setTaskBinding/settings authority 保存，然后才创建 Session。取消、过期路由、外部 scope、能力不满足及网络错误均不能绕过屏障。
- 服务端预检仅读取精确已安装 Package，复用现有 Task 资源、默认/启动变体及 RouteResolver 能力校验，不创建 Session、不写 settings、不发送模型请求。
- lifecycle prepare 的严格绑定校验保持；同次只读预检复用精确 snapshot/manifest，结束重新核对 revision，拒绝并发变更。
- 真实作品回归另外暴露启动耗时根因：数十个 Data resource 串行请求，每次重复加载校验整个 Package，耗尽原 30 秒 Ready 窗口。扩展既有 runtime/resource 支持声明资源 ID 批量读取；同一次请求复用精确 Session/Package，每项仍校验声明、大小与 hash，单资源协议不变，无跨请求缓存、无超时放宽。
- 复用 Library 表单/按钮组与 design tokens，包含窄屏 44px 选择器、加载/禁用/错误反馈，补齐 zh-CN/zh-TW。
- 未修改 package 工作区、历史 1.0.0 release、Task 写权限或 player binding 安全边界。

## Validation

实际运行（后续重复运行仅因相关代码或断言变更）：

- 新增 task-binding-preflight 13 项、task-binding-ui 6 项通过：唯一 slot、同/不同 route、stale/deleted/invalid/foreign scope、slot-specific capabilities、并发 revision、无 Task、HTTP 认证/输入限制、无模型请求和 settings/UI 错误路径。
- experience-resources 5 项、runtime-http 3 项、runtime-lifecycle 5 项、lifecycle-scheduler-p4 6 项通过。
- task-runtime-p3 与 shared-runtime-p8 的非外部数据库测试共 71 项通过。另 48 项 MySQL/PostgreSQL 用例因本地端口 53306/55432 无服务而 ECONNREFUSED，不能称为通过；未修改测试以掩盖环境缺失。必要 CI 使用仓库既有禁用外部数据库设置。
- game-runtime/package-loader 10 项、game-runtime/experience-ready-p4 9 项、atria-shell/native-product-workspaces 2 项通过。
- 真实 Edge 浏览器：Works 首启 1440/390、已有有效绑定不拦截、同/不同 route、无 Task 包、INVALID Session 原地恢复共 4 项通过；已查看窄屏表单和 Full UI 截图。
- 原始 package:original-occult-western-fantasy-game/releases/1.0.0.atria：本地可选真实包 E2E 已验证预检前零 Session、两个用途使用玩家路由、Ready 与 app.root Full UI、四项导航及 Step 1 of 6。初次标题断言因 DOM 分段与大小写不同而失败，按实际 UI 更正后通过。
- 首次只读数据刷新观察到可恢复的 bridge_revision_stale（Ready 提交与初始查询竞争）；作品既有 Refresh record 已在真实浏览器中验证成功（真实 frontend/request 回执 ok=true，错误提示清除），未将该独立现象掩盖为 Task Binding 错误。
- npm run lint、变更测试文件 ESLint、npm run check:native-localization (zh-CN / zh-TW)、git diff --check 均通过。
- DELETE 409：真实作品回归监听所有 DELETE 响应，已通过的首启执行未发现 409；不声称覆盖未知原始 DELETE 操作。

## CI / Integration

- 将新浏览器回归加入 Native Model Prompt Runtime workflow；精确 release 从本地 package 工作区由环境变量提供，不复制到 main 或 CI。
- PR: https://github.com/ZZZdragondYNGPHX/Atria/pull/102
- CI HEAD: 542e926e2c4a0e05769bce0c7631932becacaafc
- 旧实现 HEAD 1d352701a：Lint、Migration Guard、Unit Tests、Authority Transaction、两项 Native Frontend v3 检查均成功；Model Prompt integration 未完成。
- 最新 HEAD 542e926e2 已有 6/7 checks 成功：Lint、Migration Guard、Unit Tests、Authority Transaction、Native v3 regression/Hard Cut、Native v3 Heavy/Studio browser。仅 Native Model Prompt Runtime integration 仍在运行；该 job 的单元测试、lint、frontend prebuild 与 Chromium 安装均已成功，当前为包含新首启回归的最后一组浏览器测试。续接时做过一次 60 秒有限等待，尚未完成，无已知失败。耗时 CI 仍是唯一剩余依赖，保留 PR 和 HANDOFF，不提前合并。
- 最新 Runs: 36954666510 (Atria PR Checks) / 36954666602 (Native Model Prompt Runtime) / 36954666525 (Authority Transaction) / 36954666502 (Native Frontend v3)。
- Codex CI connector 要求 ChatGPT 登录；公开 GitHub REST API 无需凭据可读取该公开仓库 CI，未使用 source-control CLI 读取诊断。
- Remaining: 最后浏览器 CI → 合并 main → 验证 main → 删除短期分支及 live HANDOFF → 更新本 Record。

## Final state

待完成集成。
