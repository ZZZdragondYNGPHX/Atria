# Atria Native Frontend Runtime v3 — Implementation Phases

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 22. Implementation Phases

正式开工后，所有 Phase 默认沿用同一任务分支：

`refactor/native-frontend-runtime-v3`

不为每个 Phase 重复开分支。

执行与记录流程见 [Governance §8](../../../README.md#8-task-lifecycle)。

### Phase 1 — Contract Reset / Compiler Skeleton

目标：

- 定义新 Package/Experience/Frontend/Bridge schema；
- hard-cut legacy authoring contract；
- 建立 `.aui` parser/CST/semantic AST 最小骨架；
- Frontend Source Index；
- Canonical Frontend Index / Component IR / View IR；
- exact resource graph；
- Compiled Bridge Descriptor；
- Source Map/Provenance；

- 最小 `frontend.json + Main.aui` 可通过正式 Compiler 生成 exact Runtime Graph；
- Preview和Build共用Compiler；
- installed Runtime只消费compiled artifacts；
- 不执行author TS/source/npm scripts。

### Phase 2 — Presentation Runtime / Containment

目标：

- semantic DOM renderer；
- full CSS/font pipeline；
- ShadowRoot + Visual Containment；
- Component runtime / props/emits/slots；
- View mount/lazy load；
- Local/View/Component/Draft/Prefs state；
- Interaction baseline；
- Overlay/FocusScope；
- local routing/forms；
- Frame Scheduler；
- NodeRef measurement/observer/pointer capture；
- responsive Environment基础。

- Component/Hybrid/Full均可运行自定义DOM/CSS/fonts；
- Package fixed/z-index/top-layer无法越过授权surface；
- Full Host System Layer始终可用；
- mobile/desktop responsive场景通过；
- keyed list/virtualization基础可用。

### Phase 3 — Host Bridge / Data Plane

目标：

- Frontend Host Bridge v1；
- Experience Binding Registry；
- scoped Component `uses`；
- snapshot Read；
- Collection Read/cursor；
- Action；
- Operation；
- unified Receipt/Error；
- Experience Epoch/stale revocation；
- prefs/environment fixed projections。

- 未声明 Binding不可调用；
- collection pagination不读取raw DB；
- Authority write只经过正式typed target；
- late async completion在Epoch变化后被丢弃；
- Declarative与future Script使用同一compiled binding semantics。

### Phase 4 — Conversation / Session / Prose

目标：

- Managed Conversation/Composer迁移到统一Headless contract；
- Headless committed message collection；
- GenerationProjection；
- Reply alternative / branch controls；
- `host.composer` / `host.conversation` / `host.session`；
- Safe Prose AST；
- Message Block integration；
- SavePoint/reload/recovery/diagnostics；
- Host Failure Surface。

- Managed与Headless UI对同一Session得到一致语义；
- streaming永远不冒充committed Timeline；
- raw HTML不能进入Prose renderer；
- Full/Hybrid自绘Conversation无需Host-owned message DOM。

### Phase 5 — Media / Localization / Input / Accessibility / Boundaries

目标：

- Frontend Media Catalog；
- Exact Image/Audio/Video；
- Remote ImageRef / HostIssuedMediaRef；
- Media Resolver/cache/fallback/privacy；
- Package Localization；
- RTL；
- IME Composition Lock；
- VisualViewport/keyboard inset；
- Accessibility environment/diagnostics；
- Error/Loading Boundaries。

- 大量Remote Portrait不打入Package bytes；
- denied/offline Remote Media有fallback；
- arbitrary runtime URL construction被拒绝；
- CJK composition不被rerender破坏；
- soft keyboard场景输入区可用；
- locale/RTL切换无需重载Session Authority；
- child resource/controller/read失败不会默认整页白屏。

### Phase 6 — Script Sandbox / Canvas

目标：

- Supervisor Worker；
- isolated JS VM adapter；
- JS/TS compile/bundle；
- static module graph；
- Controller ABI；
- scoped capability injection；
- CPU/memory/message budgets；
- scheduler/timer/frame/yield；
- crash/restart recovery；
- Canvas2D command buffer；
- source-mapped diagnostics。

- Script无法访问window/document/fetch/storage；
- Script只能访问Component `uses` handles；
- runaway loop可被Host terminate；
- Worker/VM重启不破坏Authority；
- Canvas支持代表性地图/关系图/动画；
- third-party pure JS算法依赖可bundle运行。

### Phase 7 — Studio / AI Authoring

目标：

- Native `.aui` editor；
- format-preserving structured edits；
- Source Graph browser；
- View/Component/style/state/bridge/localization editors；
- Studio Preview使用正式Compiler/Renderer；
- Source Map diagnostics；
- AI semantic patch surface；
- permission/feature visibility；
- Accessibility/Localization/Health diagnostics。

- Studio编辑不直接改IR；
- Preview与Production无第二套语义；
- AI可按semantic ID修改Component/Node/Binding；
- Source comments/format尽量稳定；
- invalid frontend在Build前得到source-level diagnostics。

## 23. 实施纪律

正式实现开始前：

2. 读取最新 `main:AGENTS.md` 与 `docs:README.md`；
3. 从最新 `main` 创建 `refactor/native-frontend-runtime-v3`；
4. 创建 Implementation Record；
5. 以本 Baseline 为权威，不重新发散架构。

执行与真实阻塞分别见 [Governance §8](../../../README.md#8-task-lifecycle) / [§13](../../../README.md#13-stop-conditions)。

---

## 24. Baseline Gate

第二轮 Gap Review 结论：

**PASS WITH CLARIFICATIONS → Implementation Baseline v1.0。**

冻结前补入的三项 Clarification 已纳入 Core：

1. Frame Scheduler；
2. Layout Measurement / Local Observers；
3. Remote Media Privacy Threat Model correction。

没有剩余 architecture blocker 需要在开始实施前继续讨论。

本文件现在是正式 Implementation Baseline。除非实施阶段出现被真实代码/测试证明的 blocker，否则不得重新扩建范围或静默改变核心边界。
