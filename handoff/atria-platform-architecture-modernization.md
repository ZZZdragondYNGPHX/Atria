# Handoff — R8 Atria Platform Architecture Modernization

## 当前状态

R8 已完成立项准备，但**尚未允许开始功能开发**。

正式分支：

`refactor/atria-platform-architecture-modernization`

当前远端分支仅用于预留名称，已重置到当前：

`main@63da3141a3895d3386ed1bebc30876c9766315ba`

这不是 R8 的最终开发基线。

真正开发基线必须是：

> **R0-R7 已全部完成、验证并合并后的最新 `main`。**

Astra 接手时不得从 R7 长期分支、R7 候选 HEAD 或当前预留 HEAD 直接开始改代码。

---

## 必须先读

按顺序：

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-platform-architecture-modernization.md`
5. 本文件：`docs:handoff/atria-platform-architecture-modernization.md`

如 R7 最终文档/交接在 Astra 接手时已经更新，也一并读取最终 R7 completion 记录。

---

## 接手前硬门槛

在任何 R8 功能提交之前：

1. `git fetch origin`
2. 确认 R7 已经合并到 `origin/main`
3. 切换 R8 分支
4. `git merge --ff-only origin/main`
5. 推送 R8 分支
6. 验证：
   - `git rev-parse HEAD`
   - `git rev-parse origin/main`
7. 两个 SHA 必须完全相同。

如果不能 fast-forward：

- 不要开始 R8；
- 不要用普通 merge 制造并行历史；
- 不要基于旧 R7 branch 继续；
- 先恢复 R8 为干净的 `main` 基线。

---

## 立项背景

R7H 候选研究显示 Atria 已经形成大量新的 runtime / storage / shell / workspace 能力，但旧 SillyTavern 的应用所有权与巨型模块仍承担过多职责。

研究快照（仅用于立项，不是正式 R8 baseline）：

- 第一方 JS 约 17.51 MB；
- >=100 KB 第一方 JS 28 个；
- `public/script.js` 约 894 KB；
- `memory-graph/main.js` 约 692 KB；
- `world-info.js` 约 543 KB；
- `openai.js` 约 463 KB；
- `src/endpoints/chats.js` 约 177 KB；
- `public/index.html` 约 802 KB。

R8 的目标不是框架重写，而是让 Atria 新架构成为真正主干，让旧宿主边界逐步成为 compatibility layer。

---

## 第一阶段只做 R8A

不要一接手就拆 `script.js` 或 `world-info.js`。

R8A 必须先完成：

- 最终 merged-main SHA/tree 基线；
- frontend module graph；
- static/dynamic import graph；
- cycle scan；
- 巨型模块清单；
- startup profile；
- first visible / Play ready；
- Workspace cold/warm open；
- route switch；
- Long Task / CPU profile；
- heap/listener/DOM leak baseline；
- Android/Termux startup baseline；
- runtime matrix；
- plugin/API/DOM ABI inventory；
- architecture guard 设计并落地。

所有之后的拆分必须引用 R8A 的实际 profile / dependency evidence。

---

## 总体阶段

- R8A — Architecture Baseline & Guardrails
- R8B — Application Kernel & Lifecycle
- R8C — Route / Feature Lazy Loading
- R8D — Frontend Domain Decomposition
- R8E — Backend Application Services
- R8F — State / Event / Type Contract Modernization
- R8G — Runtime & Toolchain Modernization
- R8H — Final Performance & Architecture Hardening

---

## 关键约束

### 保留

- SillyTavern 上游格式和必要 compatibility；
- `Atria.getContext()` / extension API；
- R0-R7 Game Runtime contract；
- R7 Shell / Navigation / Workspace / Stage ownership；
- existing Storage Engine / Repository semantics；
- current FloorState / Memory / Orchestrator state ownership；
- PNG / JSON / CharX / `.atria`；
- 高价值第三方 plugin ABI。

### 不做

- React/Vue/Svelte 全项目重写；
- Vite/Rollup 全构建替换；
- 全仓 TypeScript 重写；
- 第二套 Conversation / Composer / generation / navigation authority；
- 无证据的缓存和 segmented storage 大迁移；
- 为了升级而升级 Express。

### Runtime

目标方向：

- Node 24 LTS 作为 primary；
- Node 22 是否保留为 minimum，由 R8A 实际平台兼容验证决定；
- Node 20 必须退出；
- ESLint 8 升到当前受支持 ESLint 10；
- Express 5 是独立兼容 checkpoint，可 defer。

---

## 开发纪律

普通代码问题自行分析、修改、测试、提交、推送并继续。

只在以下情况停下：

1. GitHub CI 进入明显耗时验证；
2. 必须依赖 Android / Termux 真机日志；
3. 必须依赖真实 UI 截图；
4. 用户本人必须完成权限 / Secret / 授权。

不要长时间轮询 CI。

每个 R8 子阶段完成后：

- 更新正式方案的实际状态；
- 记录 validated HEAD；
- 记录 workflow/run；
- 更新本 handoff；
- 若正式切换到 R8 且 R7 已归档，再更新 `docs:handoff/latest-handoff.md`。

---

## 当前下一步

当前不要实施 R8。

等待：

1. R7H 最终 CI；
2. R0-R7 合并到 `main`；
3. merged `main` 验证完成。

然后由 Astra：

1. 将 R8 分支 fast-forward 到最新 `main`；
2. 确认 SHA 完全一致；
3. 正式执行 R8A；
4. 按正式企划持续开发。
