# 模型、提示词与 Runtime：当前主线证据

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。

## 1. 证据基线

本文件已重新对齐当前集成主线：

- `main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- N0–N10 已完成并冻结
- A0–A9 已完成并冻结
- 旧企划中“A5/A6 仍在进行”的陈述已失效

这里只记录当前代码事实与因此产生的设计约束，不把未来计划写成已实现事实。

## 2. A6 产品壳已经 Native-first，但深层配置 authority 仍旧

`public/scripts/atria-shell/library-runtime-workspaces.js` 当前：

- Runtime sections 仍是 Overview / Roles / Connections / Model-Prompt Presets / Capabilities；
- Overview 直接读取 `extensionSettings.connectionManager.profiles`；
- Runtime Roles 直接使用旧 Connection Profile 名称作为 primary/fallback；
- Connections 的 Advanced 区会 reparent 旧 Connection Manager DOM；
- Presets 直接调用 `getPresetManager()`；
- Preset editor 会把 `left-nav-panel` / `AdvancedFormatting` 搬入 Atria workspace。

`public/scripts/atria-shell/utility-workspaces.js` 仍存在 Settings/legacy DOM 的兼容嵌入。

结论：A6 完成的是产品 shell / routing / presentation cutover，不代表 Model/Prompt/Connection 的深层 authority 已 Native 化。

## 3. generateTask 是统一 facade，但仍是 ST-hosted assembly

`public/scripts/generate-task.js` 当前是第一方 extension 的 one-stop generation API，并封装：

- connection profile resolution；
- world-info resolution；
- macro substitution；
- preset-aware prompt assembly；
- sender dispatch；
- streaming；
- tools / structured output；
- response normalization。

但它的默认依赖仍来自：

- `globalThis.Atria.getContext()`
- `connectionProfiles.resolve`
- `buildPresetAwarePromptMessages`
- ST world-info / macros
- existing host senders

因此它适合保留为 Compatibility Facade，不适合作为未来独立 Atria Core 的永久领域入口。

## 4. Prompt authority 仍在旧 ST 体系

当前仍有大量：

- `PromptManager.js`
- `preset-manager.js`
- `st-context.js`
- `sysprompt.js`
- `reasoning.js`
- old Context/Instruct/System Prompt preset semantics

`buildPresetAwarePromptMessages` 仍由 `st-context.js` 提供并被 `generateTask` 使用。

它仍负责或参与：

- prompt order/layout；
- legacy role/injection semantics；
- character prompt overrides；
- PHI/jailbreak placement；
- world-info placement；
- prompt extension fields；
- various formatting snapshots。

结论：Native Prompt Program 必须成为新 authority，而不是在 PromptManager 上增加一层 wrapper。

## 5. Connection Manager 当前混合多个领域

`public/scripts/extensions/connection-manager/index.js` / resolver 体系目前把下列概念混在一个 profile 中：

- provider / API / endpoint；
- model；
- proxy / secret ref；
- stop strings；
- reasoning；
- prompt formatting；
- provider-specific sampling/cache/tool flags；
- raw-text instruct/context/tokenizer settings。

因此需要拆为：

- Connection Profile
- Model Profile
- Generation Profile
- Prompt Program

而不是继续扩大现有 profile schema。

## 6. Native Context 存在，但尚未成为最终 request assembly authority

`public/scripts/native/context-compiler.js` 已有成熟的 lane / budget / authority / source refs 语义。

`public/scripts/native/session-runtime.js` 也有：

- `prepareContext(options)`
- `lastContextPlan`

但当前主线代码搜索显示，production code 中 `prepareContext()` 只有定义，没有真实 generation consumer。

所以不能把“Native Context 已接管最终 Prompt”写成现状。

新设计采用：

- Native Session Context 继续拥有 Native Session fact selection/budget；
- 公共 boundary 抽象为 `RequestContextPlan`；
- Generation Core / Prompt Compiler 消费该 contract；
- Studio/task 请求可有自己的 Context Provider，而不是强迫制造 Session。

## 7. A2 Registry 已泛化，但 Library/Authoring/Closure 仍有专用实现

`src/native/authoring/resource-registry.js`：

- descriptor-driven；
- plugin resource descriptors 已可注册；

A8 后的 `src/native/project-agent.js` 已经根据 Registry 动态生成部分 resource tool schema。这比旧企划记录更先进，因此不能再把 Project Agent 描述成“完全硬编码资源类型”。

真正瓶颈仍在：

`src/native/authoring/library-service.js`

- `LIBRARY_RESOURCE_TYPES` 仍固定为 World / Knowledge / Binding / Asset / Package；
- exact lookup 仍逐类型实现。

`src/native/authoring/library-authoring.js`

- Attach/Fork/Update 仍显式针对 World / Knowledge / Asset。

Package/dependency closure 同样围绕已有类型。

结论：只需要补一个可复用的 versioned JSON resource handler / handler seam，让 Prompt/Generation 进入现有 A1/A2 authority；不需要重写整个 A2。

## 8. package.presets 尚未形成 Runtime authority

当前搜索 `package.presets` 主要命中 `public/scripts/native/studio-workspace.js` 的 structured metadata 编辑。

没有发现它作为 Native generation/runtime 真源的成熟消费链。

因此现在最适合：

- 不把它扶正；
- 新 Runtime contract 使用明确 native metadata；
- 最终 hard-cut 不读 `package.presets`。

## 9. Native Session / Package / Studio frozen authority 必须保留

- Session 固定 exact PackageVersion；
- Runtime Descriptor 不成为第二个 package persistence authority；
- Resource Graph 保持 derived-readonly；
- Library exact refs 保持 immutable；
- Studio writes 必须通过 A1 Workspace/ChangeSet；
- Project Agent 不能 silent rebase / AI commit；
- Native Play 不能创建第二个 persistence/runtime authority；
- N10 禁止恢复 legacy Character/JSONL/WorldInfo/FloorState/Swipe authority。

本 refactor 必须在这些 contract 内扩展。

## 11. Product IA 的一个重要 scope 修正

- primary authoring domain 是 `Build`；
- primary `Studio` domain 被拒绝。

此前 Product Frontend V2 讨论中“Home / Play / Library / Studio / Runtime”属于长期 IA 目标。

本 refactor 为避免重新做一遍 A6：

- 不改全局 primary `Build` route；
- Prompt Authoring / Runtime Design 进入现有 A7 Studio workspace；
- 将来若要把 Build 升级/改名为 Studio，另开全局 IA 任务。

## 12. Legacy authority 搜索证据

当前 main 仍能找到：

- `getPresetManager` 于 st-context、sysprompt、reasoning、custom request、regex、orchestrator 辅助代码等；
- `extensionSettings.connectionManager` 于 Connection Manager、shared extension helpers、Atria Runtime shell、E2E fixture；
- `buildPresetAwarePromptMessages` 于 st-context、generate-task 与 extension API docs。

这些并不要求全仓立即删除。目标是：

- first-party Native Core / product path 不再依赖；
- compatibility island 可保留；

## 13. 允许保留的 Transitional Host seam

本次结束后仍可暂时存在：

- mature ST provider sender implementation；
- tokenizer implementation；
- current Secret Store backend adapter；
- non-Native ST chat；
- third-party legacy extension compatibility；
- host bootstrap / shell mounting ABI。

它们只能位于 Port/Adapter 外侧，不能反向成为 Native Domain authority。

## 14. 本次尚未取得的证据

当前没有宣称以下内容已经通过：

- 新 Native resource schema/tests；
- Generation Service；
- Prompt compiler；
- provider adapter cutover；
- Runtime V2 UI；
- real-host model request；

这些必须在 P0–P8 实施阶段逐步取得。

## 15. P0 implementation evidence

P0 is now implementation evidence rather than design-only intent.

`472e1a9f0759a460d845a2e6c618983c35e18654`

Workflow:

- Run `35832249672`

Actually executed and passed:

- 5 focused/adjacent suites, 63 tests;
- focused ESLint for P0 touched source/tests.

P0 also produced two intentional frozen-test evolutions:

1. N0 Native ID family test now includes the six new Native model/prompt/runtime identity families. This extends opaque Native identity without replacing any prior family.
2. Runtime implementation scanning remains unchanged.

The following remain future-stage evidence and are still not implemented by P0:

- generic versioned JSON resource persistence;
- Library Attach/Fork/Update for Prompt/Generation;
- Generation Service implementation;
- Prompt compiler;
- provider adapter cutover;
- Runtime product UI;
- first-party `generateTask` cutover;

## 14. P1 implementation evidence

Current code now proves:

- `src/native/model-prompt-runtime/persistence.js` supplies the generic versioned JSON resource handler and player-owned Connection/Model/Route persistence on the existing Native storage infrastructure;
- `NativeLibraryService` consumes the handler seam instead of introducing a second Library;
- `LibraryAuthoringPlanner` extends the existing Attach/Fork/Update path for Prompt/Generation resources;
- `ResourceGraph` derives Project/Library nodes and exact forward/reverse references without a write path;
- `resolveProjectDependencyClosure` recursively resolves exact model/prompt dependencies and reports `native_model_prompt_dependency_missing` rather than following latest;
- Package build vendors resolved Prompt/Generation resources and rewrites their refs to the generated immutable PackageVersion scope;
- Player Connection/Model/Route records use stable Native IDs and remain outside Package resources;
- secret material remains rejected by P0 contracts; Connection persistence carries only `secretRef`.

- 9 suites / 37 tests passed;
- focused ESLint: success;

P1 did not execute full Node regression, frontend build, browser E2E, Android, Docker, or a real-host model request.

## P2 implementation evidence

Generation Core / exact resolution / capability / fallback / Secret boundary / Provider
execution are now implemented. P2 focused: 33 tests. Native FS/SQLite: 48 suites / 347 tests.
Loopback HTTP and streamed response integration ran for both protocol adapters.
The earlier P0/P1 future-work statements are historical; P3–P8 remain unimplemented.

## P3 completion checkpoint (2026-09-23)

P3 is complete at `5e51332b34146236fd4d4a6d45c25ef7c37a9e08` on the existing work branch. No first-party/UI
cutover or main merge occurred. Earlier P3-future statements above are historical.

 P4 First-party Runtime Cutover is next,
only after explicit continuation. A6/A8 transitional gates remain unchanged in P3.

## P4 implementation checkpoint (2026-09-23)

P4 complete at `6cba266814a7ff04666220f1031efdb844ad4e46`. P4 composes
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
compile-only preview, remediation, search deep links and mobile fullscreen editors. Broad FS/SQLite:
206 suites / 1811 tests; final focused: 6 / 39; real P4/P5 browser: 8 passed. No main merge or P6 implementation.
P6 Library & Studio Authoring is next, only after explicit continuation.
