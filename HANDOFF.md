# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Status: **Implementation Baseline v1.0 frozen — Ready for implementation approval**
- Primary Workspace: `main`
- Source Baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Plan Commit: `a7c56158f26c4e9c0beebb0c25fb2aa68370bf5e`
- Implementation Branch: **not created**
- Implementation Record: **not created**
- Package pressure-test sample: `package@58e8241bf0624c8f0c3d97292e116143f5866159` / `native-heavy-frontend-reference`

## 当前结论

Native Frontend v3 已完成多轮架构讨论、两轮 Gap Review 与 Baseline Gate。

Baseline Gate：

**PASS WITH CLARIFICATIONS → Implementation Baseline v1.0**

冻结的总原则：

> **Package owns presentation. Host owns capabilities and authority.**

Native v3 允许 Package 几乎完全控制自身 Presentation / Interaction：

- semantic DOM；
- full Package CSS / fonts；
- Component tree；
- layout / responsive / animation；
- Managed 或 Headless Conversation / Composer；
- Phone / IM / Inventory / management UI；
- typed local/remote media；
- Canvas；
- optional sandboxed JS/TS Controller；
- Localization / RTL；
- CJK IME / mobile keyboard；
- accessibility；
- Session UI / SavePoint / retry/fork/recovery。

继续禁止：

- Host DOM；
- raw browser global/network/storage；
- raw World/Session/DB objects；
- arbitrary executable HTML/remote JS；
- browser top-layer escape。

这些是安全/Authority 边界，不再属于 Presentation 能力不足。

## Hard Cut

不考虑 Native UI v1/v2 用户数据或作者兼容。

最终实现必须：

- 非 Text Native Experience 统一到 `native@3`；
- 删除 legacy `componentModelVersion` selector；
- 删除旧 v1/v2 renderer/compiler 正式路径；
- Studio/Preview/Health/Package validation 迁移到 v3；
- 旧 fixture/test/data 可直接改写或删除。

不做 migration assistant、compatibility CSS、legacy manifest parser 或长期双 runtime。

## Core Architecture

已冻结：

- Authoring Source Graph → Compiler → Canonical Runtime Graph；
- Native `.aui` SFC-like first-class authoring；
- small compiled Frontend Index + exact lazy resource graph；
- Shadow DOM + Visual Containment + Host System Layer；
- typed Frontend Host Bridge v1；
- Experience Binding Registry：Reads / Actions / Operations；
- fixed Host services：Composer / Conversation / Session / Media / Presentation / External；
- snapshot + bounded Collection Read；
- Managed + Headless Conversation；
- GenerationProjection；
- Safe Prose AST；
- typed dynamic style/media sinks；
- Remote Media Catalog + External Access Permission；
- Frame Scheduler；
- NodeRef measurement/resize/visibility/pointer capture；
- optional Script Sandbox：Supervisor Worker + isolated JS VM；
- Canvas2D batched command buffer；
- Localization / IME / Accessibility；
- Component/View/Root Error Boundary + Host Failure Surface；
- Experience Epoch / stale handle revocation。

## Baseline Gate Clarifications

### Frame Scheduler

程序化 presentation 使用 Host-driven local frame scheduler，不暴露 raw browser `requestAnimationFrame` global，也不用于 World Authority timing。

### Layout Measurement

Declared NodeRef 可读取 bounded local geometry并观察 resize/visibility；不暴露真实 DOM 或 Host geometry。

### Remote Media Threat Model

`remote-media` 是 External Access Permission。

Declared MediaRef/origin 可以限制 arbitrary URL/network，但不能保证获准 origin 完全无法从请求选择/时序观察信息。

Install/enable UI 必须披露 remote origins；Host strip credentials/referrer，并可 proxy/cache；用户可禁用。

## Implementation Phases

正式开工后，所有 Phase 使用同一分支：

`refactor/native-frontend-runtime-v3`

1. **Phase 1 — Contract Reset / Compiler Skeleton**
2. **Phase 2 — Presentation Runtime / Containment**
3. **Phase 3 — Host Bridge / Data Plane**
4. **Phase 4 — Conversation / Session / Prose**
5. **Phase 5 — Media / Localization / Input / Accessibility / Boundaries**
6. **Phase 6 — Script Sandbox / Canvas**
7. **Phase 7 — Studio / AI Authoring**
8. **Phase 8 — Integration / Heavy Frontend Acceptance**
9. **Phase 9 — Legacy Removal / Regression / Finalize**

详细目标与验收条件以 Plan 的 Implementation Phases 为权威。

## Phase Execution Rule

用户明确批准正式开工后：

1. 重新核对真实远端 refs；
2. 读取最新 `main:AGENTS.md` 与 `docs:README.md`；
3. 从最新 `main` 创建 `refactor/native-frontend-runtime-v3`；
4. 创建 `docs:records/refactor/native-frontend-runtime-v3.md`；
5. 开始 Phase 1。

每个 Phase 完成后：

- 更新同一 Implementation Record；
- 更新本 `HANDOFF.md`；
- 记录 task branch HEAD / main baseline / 验证 / 未完成；
- 生成下一阶段新对话提示词；
- 主动停止，等待用户继续；
- 不为各 Phase 重复创建 task branch。

## 当前停止点

**方案阶段已经完成。**

现在没有 architecture blocker，也没有需要继续发散讨论的前置项。

下一步只在用户明确批准“正式开工 / 开始实现 Native Frontend v3”后执行。

在获得批准前：

- 不创建 `refactor/native-frontend-runtime-v3`；
- 不创建 Implementation Record；
- 不修改 `main` 产品代码；
- 不开始 Phase 1。
