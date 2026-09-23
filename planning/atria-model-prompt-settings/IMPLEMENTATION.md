# 实施蓝图：Atria Native Model / Prompt / Runtime P0–P8

**P0–P8 已实现并完成本地验收；PR #85 的最终 CI 与 main 集成待完成。**

正式实现分支：`refactor/atria-model-prompt-settings`

基线：`main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`

设计权威：`planning/atria-model-prompt-settings/DESIGN.md`

证据：`planning/atria-model-prompt-settings/EVIDENCE.md`

## 总体执行规则

这是多阶段任务。

每个阶段必须：

1. 开始前 fetch 远端工作分支，以实际 HEAD 为准；
2. 保留其他会话已经推送的工作，不回退；
3. 只执行当前阶段；
4. 运行 focused tests / lint / relevant frozen guards；
5. 不把未执行检查写成 passed；
6. 更新 docs 的正式进度与 `handoff/latest-handoff.md`；
7. 记录当前 branch HEAD、完成项、未完成项、关键决策和验证；
8. **停止继续实施**；
9. 给用户下一阶段可直接复制的新对话提示词。

Android / Docker 仍为 opt-in。

## P0 — Baseline / Contracts / Guard Evolution

### 目标

把最终设计落成代码 contract 与 CI 边界，但不进行大规模用户行为切换。

### 范围

- 再次核对 live branch/main；
- 冻结六个核心 object contracts：
  - Connection Profile
  - Model Profile
  - Generation Profile
  - Prompt Module
  - Prompt Program
  - Runtime Route
- 冻结 runtime artifacts：
  - RequestContextPlan
  - Prompt IR
  - EffectiveRequestSnapshot
- 冻结 capability tri-state/provenance；
- 冻结 package runtime metadata schema；
- 冻结 Port contracts：
  - Generation Service
  - Route Resolver
  - Provider Port
  - Secret Port
  - Context Provider
- 建立本 refactor residual/architecture guard skeleton；
- 建立 frozen-guard evolution matrix，明确哪些 old assertions 属于 invariant、哪些属于 transitional seam。

### 特别 guard

必须明确处理：

- A6 Advanced Connection compatibility assertion；
- A6 standalone Capabilities route assertion；
- A8 Studio Agent `generateTask` assertion。

P0 不能提前删除旧 seam；只记录 replacement gate。

### 退出

- contracts 有定向 tests；
- invalid cross-scope refs fail closed；
- secret value 不可序列化进 snapshot；
- package 不允许私有 Connection/Secret；
- architecture guard 能识别 Native Core → ST global/import 的违规依赖；
- frozen guards 仍通过；
- 无用户可见功能切换。

---

## P1 — Native Resource & Persistence Foundation

### 目标

建立 Native Prompt / Generation / Connection / Model / Route 唯一持久化真源。

### 范围

- generic versioned JSON resource handler；
- `core.prompt-module`
- `core.prompt-program`
- `core.generation-profile`
- exact revision identity；
- Library list/get exact；
- Attach/Fork/Update；
- derived Resource Graph；
- Package closure；
- project-owned / library-owned origin/provenance；
- Connection Profile persistence；
- Model Profile persistence；
- Runtime Route persistence；
- Secret 只存 ref。

### 边界

- 不建立 PromptStore 平行系统；
- 不重写 WorldRepo / KnowledgeRepo / AssetStore；
- 不让 Resource Graph 可写；
- Studio writes 继续通过 A1 authoring operations；
- Project Agent 继续走 Registry/Graph/A1 authority。

### 退出

- prompt/generation resources 可 list/get/fork/attach/update；
- exact refs 不追 latest；
- same-name IDs 不冲突；
- Package closure 缺依赖 fail closed；
- delete safety / reverse refs 正确；
- A1/A2/A7/A8 guards 仍成立。

---

## P2 — Generation Core & Route Resolution

### 目标

建立独立于 `Atria.getContext()` 的 Native Generation Core。

### 范围

- `GenerationService.execute()`；
- common Route Resolver；
- Connection/Model/Generation/Prompt deterministic resolution；
- capability evaluation；
- fallback full-route re-resolution；
- Secret Port；
- Provider Port；
- Effective Request Snapshot；
- request-local immutable config；
- transitional sender adapters。

### 规则

Transitional ST adapter 允许调用成熟 sender，但：

- 不允许自行读取 active PresetManager；
- 不允许自行读取 active Connection Manager 作为 hidden authority；
- 不允许读取 `oai_settings` / `power_user` 来补齐 Native request；
- 所有 Native 参数必须从 resolved snapshot 进入 adapter。

### 退出

- A→B route switch 与直接 B 结果一致；
- 并发 role/request 配置不串值；
- capability required failure 可解释；
- fallback 只处理 eligible transport/provider failure；
- cancellation 不继续 fallback；
- secret redacted；
- OpenAI-compatible + raw-text fixtures 至少各有一条；
- first-party 尚未全部切换，本阶段不删除 `generateTask`。

---

## P3 — Request Context & Prompt Compiler

### 目标

让 Native request assembly 不再依赖 ST PromptManager。

### 范围

- RequestContextPlan；
- Native Session Context Provider；
- Task/Studio Context Provider；
- Prompt Module/Program compiler；
- finite condition DSL；
- typed parameters；
- Request Local scratch；
- cross-stage declared artifacts；
- semantic targets；
- ordered stages；
- Response Directive；
- single-parent derive resolution；
- Prompt IR；
- provider-neutral render contracts；
- deterministic diagnostics/provenance；
- token/budget accounting。

### 边界

- Prompt Compiler 不写 Session state；
- Stage 不执行 Orchestrator；
- Prompt 不授予 tools/secrets/state authority；
- Context Provider 决定事实，Prompt Program 只决定使用说明；
- 不重新扫描一套 Timeline/Knowledge；
- hidden chain-of-thought 不是跨-stage dependency。

### 退出

- compilation deterministic；
- disabled/replace/configure 正确；
- conflict/exclusive targets fail clearly；
- invalid variable scope fail；
- preview 不产生持久副作用；
- context budget 不重复计数；
- message/raw renderer fixtures 成立。

---

## P4 — First-party Runtime Cutover

### 目标

把 Atria 自己的 first-party generation 调用切到 Generation Service。

### 必须覆盖

- Game Runtime；
- Runtime Role Router；
- Studio Agent；
- Orchestrator；
- Memory/Search 等 first-party model requests；
- Native Play 所依赖的 generation path。

### 切换规则

最终 first-party Native 路径不再调用：

- `Atria.getContext().generateTask`
- `buildPresetAwarePromptMessages`
- `connectionProfiles.resolve`
- `getPresetManager`

第三方 legacy extension compatibility 可继续调用 facade。

### Frozen guard evolution

当 Studio Agent 已完成新 seam 并通过测试后：

- 更新 A8 guard 的 `generateTask` 字面断言；
- replacement 必须继续证明 tool schema projection 与 human Review/Commit authority；
- 不删除 A8 其他 invariants。

### 退出

- first-party residual search 清零或只剩明确 whitelist；
- Game Runtime role/fallback behavior 不回退；
- Native Session/Branch/Revision identity 不变；
- Studio Agent 仍不能 AI commit/silent rebase；
- orchestration 与 single-model RP 使用同一 Prompt resources；
- relevant N/A frozen guards 通过。

---

## P5 — Native Runtime Product UI

### 目标

正式替代 A6 的 Model/Prompt/Connection compatibility shell。

### 产品结构

Runtime：

- Routes
- Models
- Connections
- Profiles
- Diagnostics

Capabilities 不再需要 standalone technical page；能力在 Model / Route / Diagnostics 中按任务呈现。

### UX

- Routes 为第一视角；
- route editor 显示 Model → Connection → Generation → Prompt → Fallback；
- Connections 只编辑连接；
- Models 显示 model ID/capabilities/limits/provenance；
- Profiles 编辑 Generation；
- Diagnostics 显示 Effective Request、context budget、prompt provenance、fallback attempts；
- no legacy DOM reparent；
- errors 有 remediation action；
- mobile 是独立 full-screen/editor flow，不压缩桌面 panel。

### Frozen guard evolution

当 Native Connections UI 完成后：

- 更新 A6 Advanced Connection compatibility assertion；
- 更新 standalone Capabilities route assertion；
- 保留 A6 Native Play、search navigation、no-second-storage 等 invariants。

### 退出

- desktop + mobile screenshot/visual review；
- loading/empty/error/configured states；
- keyboard/focus；
- search deep-link；
- no legacy DOM as primary/advanced product editor；
- save failure 不假报成功。

---

## P6 — Library & Studio Authoring

### 目标

把 Prompt/Generation 真正变成游戏制作资产。

### Library

- Prompt Programs；
- Prompt Modules；
- Generation Profiles；
- origin badges；
- exact revision；
- Derived From；
- Used By；
- read-only package original；
- Fork/Derive。

### Existing Build / Studio

本阶段不改变 A6 primary `Build` global navigation。

在 A7 Studio workspace 中增加：

- Prompt Authoring；
- Runtime Design；
- Simple/Advanced Prompt editor；
- stage/module tree；
- workspace editor；
- inspector；
- conditions/parameters/provenance；
- preview compile；
- AI Assistant actions 必须走 A1 operations/review，不直接 mutation。

### Package

- package runtime requirements；
- recommended prompt/generation refs；
- exact build closure；
- derived resources flatten/freeze。

### 退出

- package original 不被 player edit；
- Project authoring 通过 A1 Workspace/ChangeSet；
- Library exact refs；
- offline installed Package 不追 Library latest；
- mobile Studio views 独立布局；
- A2/A7/A8 frozen invariants 保持。

---

## P7 — Product Surface Cleanup

### 目标

移除正式产品路径中的旧 Model/Prompt/Runtime UI authority。

### 范围

- Settings 删除 Model/Prompt/Connection/Runtime 配置职责；
- Runtime 不再 embed Connection Manager；
- Runtime 不再 embed PresetManager editor；
- Global Search 只导航到 owning route；
- docs/labels/localization 更新；
- legacy compatibility 收拢至明确 developer/host island；
- `package.presets` 不再参与 Native runtime；
- old name-based Runtime identity 清理。

### 退出

Native product paths residual scan 不得包含未白名单的：

- `getPresetManager(`
- `PromptManager`
- `buildPresetAwarePromptMessages`
- `extensionSettings.connectionManager`
- `oai_settings`
- `power_user`
- `#left-nav-panel`
- `#AdvancedFormatting`
- `#rm_api_block`
- `package.presets`

---

## P8 — Hard Cut / Integration / Freeze

### 目标

验证新 authority 已完整闭环，删除只为迁移存在的 bridge，准备合并 main。

### 范围

- final architecture guard；
- first-party residual guard；
- exact dependency graph；
- no dual-write；
- no hidden fallback；
- docs/API docs 更新；
- real-host Browser acceptance；
- full relevant unit/regression；
- frontend build；
- root lint；
- A0–A9 / N0–N10 applicable guards；
- new P0–P8 guard；
- branch compare / PR / merge readiness。

### 允许仍保留

仅在明确 adapter/legacy island：

- mature ST provider sender；
- tokenizer implementation；
- existing Secret Store backend adapter；
- non-Native ST chat；
- legacy third-party extension compatibility；
- shell/bootstrap host seam。

### 最终定义

完成不等于全仓删除 SillyTavern。

完成意味着：

    Atria Native Core
         X
    legacy ST authority

只剩：

    Atria Native Core
         ↑
       Port
         ↑
    ST Host Adapter

---

# 验收矩阵

## Identity / persistence

- stable ID 与 displayName 分离；
- exact revisions；
- Package 不追 latest；
- Connection/Model/Route 不以旧 preset 名为 identity；
- no dual-write；
- secret values never serialized。

## Generation

- deterministic resolution；
- concurrent isolation；
- capability three-state；
- fallback re-resolution；
- cancel/timeout/provider errors 分类；
- message + raw-text path；
- request snapshot immutable。

## Prompt / Context

- semantic target；
- ordered stage；
- finite DSL；
- single-parent derive；
- conflict diagnostics；
- no persistent side effects in preview；
- one Native Session fact-selection authority；
- no second history/world scanner；
- single-model and orchestrated projections reuse same resources。

## Product UI

- native Runtime Route flow；
- no embedded legacy DOM；
- origin/provenance visible；
- desktop/mobile；
- keyboard/focus；
- empty/error/loading/conflict；
- search navigation；
- Settings ownership correct。

## Frozen architecture

- Native Session/Package authority preserved；
- Resource Graph stays derived-readonly；
- A1 human commit boundary；
- A8 human Review gate；
- A6 Native Play no second persistence；
- N10 no Character/Swipe/WorldInfo/FloorState Native authority regression。

## Stop conditions

立即停止当前阶段并回到设计门，如果实施要求：

- 创建第二个 Session/Project/Library authority；
- 恢复 ST preset/global 为 Native hidden fallback；
- Package 获得任意 JS 权限；
- Prompt 能直接写持久状态；
- 需要 silent migration/data loss；
- 需要重做 N0–N10/A0–A9 核心 authority；
- 要为了一个阶段同时重写全部 provider network stack；
- 发现 live branch 已被其他会话推进且本地计划会回退它。


## P0 completion checkpoint

P0 validated HEAD：`472e1a9f0759a460d845a2e6c618983c35e18654`  
Workflow：Model Prompt Runtime P0 Checks #6  
Run：`35832249672`

### P0 commits

- `7de1e882` — define P0 model prompt runtime contracts
- `8f45fd91` — define P0 generation port contracts
- `c92bd06a` — add Native model/prompt/runtime identity families
- `cf0c0198` — freeze Package `runtime.modelPrompt`
- `1ada3f4d` — export P0 contracts
- `db4c7013` — narrow secret-material detection
- `66821215` — add P0 contract tests
- `c16f83da` — add P0 architecture residual guard
- `9885659b` — add P0 CI workflow
- `2682444d` — evolve frozen Native ID family test
- `734c850b` — narrow N10 literal-validator exception
- `9d269b7a` — focused lint fixes
- `6ace980a` — remove unused P0 fixture
- `472e1a9f` — align P0 lint workflow with repository module rules

### Frozen guard evolution matrix

| Existing assertion | P0 classification | Replacement gate | P0 action |
| --- | --- | --- | --- |
| A6 requires Advanced Connection compatibility editor | Transitional seam | P5 Native Connections product UI is implemented and validated | Preserve unchanged |
| A6 requires standalone Runtime Capabilities route | Transitional seam | P5 capabilities are represented through Models / Routes / Diagnostics with product/navigation tests | Preserve unchanged |
| A8 requires Studio Agent `generateTask` | Transitional seam | P4 Studio Agent uses Generation Service while tool-schema projection + human Review/Commit invariants are proven | Preserve unchanged |
| N0 opaque Native identity families | Semantic invariant, extensible vocabulary | New first-class objects require opaque IDs | Extended expected family list |
| N10 rejects legacy Character/WorldInfo identity/storage | Semantic invariant | Never replaced | Kept; contract-validator literal exception narrowed to `authoring-contracts.js` only |

No frozen guard was wholesale disabled.


## P1 completion checkpoint

P1 validated HEAD：`802a68654f53015800e141fd052f1a006df149e0`  
Workflow：Model Prompt Runtime P1 Checks #6  
Run：`35836303381`

### P1 commits

- `a2c2fee0` — add P1 Native resource persistence foundation
- `bff67534` — integrate P1 resources with A2 authoring authority
- `1822358d` — close P1 model/prompt Package dependencies
- `577eeedc` — preserve frozen P0 Package metadata contract
- `84d3fe50` — add P1 resource/package integration tests
- `fd38b8ec` — add P1 CI workflow
- `342452b4` — align persistence test fixture with normalized Model contract
- `ce900854` — focused lint fix
- `61f0b1aa` — prove project/library/package origin + provenance
- `0ff8fcb4` — add P1 architecture guard
- `802a6865` — enforce P1 architecture guard in CI

### P1 exit status

- generic resource schema / revision round-trip: passed;
- exact refs do not follow latest: passed;
- same-name different IDs: passed;
- Library list/get exact: passed;
- Attach/Fork/Update through A1 authority: passed;
- Resource Graph forward/reverse refs: passed;
- Package closure + missing exact fail closed: passed;
- delete safety / reverse refs: passed;
- Connection/Model/Route persistence: passed;
- secret value never serialized: passed by contract and persistence tests;
- project/library/package origin + provenance: passed;
- P0 architecture guard: passed;
- A1/A2/A7/A8 frozen guards: passed;
- focused ESLint: passed.

P1 stopped before P2. Generation Service, Route Resolver execution, provider adapters, Prompt Compiler, first-party cutover and Runtime UI remain unimplemented.

## P2 completion checkpoint

The preceding P1 statement is historical. P2 is complete on
`5d5ab196c37ad7ff25db44d9dd249c0863b94115`.
Generation Core, common exact resolution, capability enforcement, full-route fallback,
Secret send boundary, Provider adapters and immutable concurrency isolation are implemented.
P2 focused: 33 tests; Native FS/SQLite: 48 suites / 347 tests; required guards, lint,
syntax and frontend build passed locally. See P2-VALIDATION.md for exclusions and limits.
P3 Compiler, P4 first-party cutover and P5 UI remain unimplemented. Stop until continuation.

## P3 completion checkpoint (2026-09-23)

P3 is complete at `5e51332b34146236fd4d4a6d45c25ef7c37a9e08` on the existing work branch.
Request Context Providers, exact Prompt Compiler, typed request-local values and declared
artifacts, bounded condition DSL, derive/conflict checks, semantic stage/target projections,
immutable IR/provenance and protocol render fixtures are implemented. No first-party/UI
cutover or main merge occurred. Earlier P3-future statements above are historical.

Local validation: Native FS/SQLite 49 suites / 385 tests; final P3 focused 38 tests;
P0–P3 and A1/A2/A7/A8 guards, root/focused lint, syntax and frontend build passed.
See planning/atria-model-prompt-settings/P3-VALIDATION.md for exact commands, the final
narrow adapter change retest and exclusions. P4 First-party Runtime Cutover is next,
only after explicit continuation. A6/A8 transitional gates remain unchanged in P3.

## P4 implementation checkpoint (2026-09-23)

P4 complete at `6cba266814a7ff04666220f1031efdb844ad4e46`. See P4-VALIDATION.md
for exact commands, exclusions and actual transport/browser evidence. P4 composes
existing storage/context/Session/Studio authorities and cuts first-party Native
requests over to GenerationService. Legacy dispatch is an explicit non-Native
island; native preset/WI lookups and outer retries are bypassed. A8
executeNativeGeneration replacement retains tool projection and human authority;
A6 replacement gates remain unchanged for P5. No main merge or P5 implementation.
Runtime host ABI, supported controls and residual whitelist are documented in
src/native/model-prompt-runtime/README.md. P5 must provision explicit routes and
use Native compile-only preview instead of legacy Generate dryRun.

## P5 completion checkpoint (2026-09-23)

P5 complete at `0cb56b9a0d37789025fb8069d08f6f43ead2413d`. Native Runtime Routes/Models/Connections/Profiles/Diagnostics
replace the compatibility editors, reuse P1 exact storage and P4 host, and provide
compile-only preview, remediation, search deep links and mobile fullscreen editors.
A6/P0 replacement gates evolved after actual visual verification. Broad FS/SQLite:
206 suites / 1811 tests; final focused: 6 / 39; real P4/P5 browser: 8 passed.
Guards/lint/syntax/prebuild passed. Exact commands, intermediate visual defects,
exclusions and P6 obligations: P5-VALIDATION.md. No main merge or P6 implementation.
P6 Library & Studio Authoring is next, only after explicit continuation.


## P6 completion checkpoint (2026-09-23)

P6 complete at `2351be51e8c8cbdadf0966104ec607018e93de6e`. Library Prompt/Generation exact resource
views and Fork/Derive, A1-reviewed Studio Prompt Authoring/Runtime Design, scoped
pickers/preview, Package derive freeze and owner-aware Package Resource Graph are
implemented. Primary Build and A1/A2/A7/A8 authority remain. Final regression:
209 suites / 1830 tests; final P6 real-browser desktop/mobile: 2 passed, with 8
adjacent P4/P5 cases passing separately in the combined run. Final screenshots
inspected. Broader storage run has four failures reproduced on unchanged P5;
see P6-VALIDATION.md for exact evidence, intermediate failures and exclusions.
No main merge or P7/P8 implementation. P7 is next only on explicit continuation.


## P7 completion checkpoint (2026-09-23)

P7 complete at `bde2fbc1ed58bc8f9a915dc7c2e72c210917c245`. Settings is preference-only,
Studio no longer edits package.presets, Search navigates to exact owner/revision
Library details and refreshes on Command open, and legacy preset UI reads are
Native-disabled behind one explicit compatibility boundary. Simplified Chinese
Prompt/Runtime/Settings labels and dynamic stages use existing localization.
Final FS/SQLite regression: 210 suites / 1837 tests; P4-P7 combined browser: 12
passed, final P4/P7 follow-up: 6 passed (overlapping). Screenshots inspected.
P0-P7/A0-A8/N9-N10 guards, lint/syntax/diff and prebuild-cache passed.
Details/exclusions: P7-VALIDATION.md. No main merge; stop before P8.
