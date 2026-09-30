# Atria Native Frontend Runtime v3 — Implementation Phases

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 22. Implementation Phases

正式开工后，所有 Phase 默认沿用同一任务分支：

`refactor/native-frontend-runtime-v3`

不为每个 Phase 重复开分支。

每个 Phase 完成后必须：

1. 更新 `docs:records/refactor/native-frontend-runtime-v3.md`；
2. 更新唯一 `docs:HANDOFF.md`；
3. 记录 task branch HEAD、main baseline、验证结果、未完成项；
4. 生成下一阶段可直接复制的新对话提示词；
5. 主动停止，不提前进入下一 Phase，等待用户继续。

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
- Build/Package validation path。

验收：

- 最小 `frontend.json + Main.aui` 可通过正式 Compiler 生成 exact Runtime Graph；
- invalid source/binding/style/resource fail closed；
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

验收：

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
- idempotency/revision guards；
- Experience Epoch/stale revocation；
- prefs/environment fixed projections。

验收：

- 未声明 Binding不可调用；
- cursor/query/revision stale fail closed；
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

验收：

- Managed与Headless UI对同一Session得到一致语义；
- streaming永远不冒充committed Timeline；
- retry/fork/switch/save/restore都有revision guard；
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

验收：

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

验收：

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

验收：

- Studio编辑不直接改IR；
- Preview与Production无第二套语义；
- AI可按semantic ID修改Component/Node/Binding；
- Source comments/format尽量稳定；
- invalid frontend在Build前得到source-level diagnostics。

### Phase 8 — Integration / Heavy Frontend Acceptance

目标：

使用与 `native-heavy-frontend-reference` 等价的重前端 acceptance fixture 验证：

- Story / Headless Conversation；
- Phone/SMS/Social/Mail；
- Church/经营；
- Schedule；
- People/Character；
- Remote Portrait；
- Collection pagination；
- AI Operation；
- Canvas关系图；
- Component/Hybrid/Full；
- mobile/touch/IME；
- offline/denied/recovery。

注意：`package` 是独立长期 workspace，本 Core task 不把 `main` merge 到 `package`。Core acceptance fixture应存在于 `main` 测试/fixture体系；Core稳定后如需升级正式 Package，另开 Package workspace任务。

验收：

- representative heavy frontend不再依赖v2 style/semantics workaround；
- providerCalls在deterministic tests中保持0；
- Desktop/Mobile关键E2E通过；
- Package build/install/preflight通过；
- Session/Authority/Memory/Lifecycle邻接回归通过。

### Phase 9 — Legacy Removal / Regression / Finalize

目标：

- 删除 Native UI v1/v2 正式Runtime/compiler路径；
- 删除 legacy manifest/componentModelVersion plumbing；
- 删除/改写旧Studio/Preview paths；
- 清理 dead CSS/fixtures/tests；
- 全量关联测试/CI；
- 最终 Docs Record；
- merge回 `main`；
- 删除 task branch。

验收：

- 非Text Native Experience只存在 v3 正式路径；
- repo搜索无意外 legacy Runtime selector；
- targeted + adjacent + repository-required CI通过；
- docs Record记录最终HEAD/CI/关键决策；
- HANDOFF在任务最终完成后删除；
- task branch确认merge后删除。

---

## 23. 实施纪律

正式实现开始前：

1. 重新核对真实远端 refs；
2. 读取最新 `main:AGENTS.md` 与 `docs:README.md`；
3. 从最新 `main` 创建 `refactor/native-frontend-runtime-v3`；
4. 创建 Implementation Record；
5. 以本 Baseline 为权威，不重新发散架构。

普通代码问题、测试失败、可自行解决的CI问题由执行者自行处理，不中断等待用户。

只在以下情况暂停：

- 一个 Phase 完成，需要正式 checkpoint；
- CI 进入明显耗时验证且下一步必须依赖结果；
- 必须依赖 Android/Termux 真机日志；
- 必须依赖真实 UI 截图；
- 需要用户本人权限/Secret/账号授权。

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
