# 模型、提示词与 Runtime：当前主线证据

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
- A2 guard 要求 Registry contract 保持 descriptor-driven。

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

当前 handoff 与 guards 确认：

- Session 固定 exact PackageVersion；
- Runtime Descriptor 不成为第二个 package persistence authority；
- Resource Graph 保持 derived-readonly；
- Library exact refs 保持 immutable；
- Studio writes 必须通过 A1 Workspace/ChangeSet；
- Project Agent 不能 silent rebase / AI commit；
- Native Play 不能创建第二个 persistence/runtime authority；
- N10 禁止恢复 legacy Character/JSONL/WorldInfo/FloorState/Swipe authority。

本 refactor 必须在这些 contract 内扩展。

## 10. Frozen guard 中存在会与本 refactor 字面冲突的过渡断言

### A6

`scripts/check-a6-native-product-frontend.mjs` 当前明确要求：

- `library-runtime-workspaces.js` 存在独立 `capabilities` route；
- Runtime Connections 必须有 `atriaRuntimeConnectionAdvanced` compatibility editor；
- Settings 必须有 compatibility controls。

这些是 A6 当时“Native-first + legacy advanced”过渡方案的字面合同。

本 refactor 的最终目标会替换其中部分过渡 seam，因此不能永久保持这些字面正则。

### A8

`scripts/check-a8-project-agent.mjs` 当前明确要求：

- `public/scripts/native/studio-agent.js` 中出现 `generateTask` 与 tool projection。

本 refactor 要把 first-party Native generation 切到 Generation Service，因此这条也会过时。

### 处理原则

不得：

- wholesale disable old guards；
- 删除 guard 后不补 replacement；
- 为了旧 regex 恢复 legacy authority。

应当：

1. 在替代 seam 尚未完成前保持 old guard；
2. 替代 seam 完成并有测试后，修改 old guard 的具体过渡断言；
3. 保留其真正安全/authority invariant；
4. 新增本 refactor residual/architecture guard。

## 11. Product IA 的一个重要 scope 修正

A6 guard 当前还明确：

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
- residual guard 使用窄白名单。

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

设计/代码审查不等于实现验证。

当前没有宣称以下内容已经通过：

- 新 Native resource schema/tests；
- Generation Service；
- Prompt compiler；
- provider adapter cutover；
- Runtime V2 UI；
- real-host model request；
- mobile visual acceptance；
- final residual guard。

这些必须在 P0–P8 实施阶段逐步取得。


## 15. P0 implementation evidence

P0 is now implementation evidence rather than design-only intent.

Validated branch HEAD:

`472e1a9f0759a460d845a2e6c618983c35e18654`

Workflow:

- Model Prompt Runtime P0 Checks #6
- Run `35832249672`

Actually executed and passed:

- 5 focused/adjacent suites, 63 tests;
- P0 architecture residual guard;
- architecture guard violation self-test;
- architecture guard syntax check;
- A0–A9 frozen residual guards;
- N9 Native Product authority guard;
- N10 Native hard-cutover residual guard;
- focused ESLint for P0 touched source/tests.

P0 also produced two intentional frozen-test evolutions:

1. N0 Native ID family test now includes the six new Native model/prompt/runtime identity families. This extends opaque Native identity without replacing any prior family.
2. N10 literal scanning now treats `src/native/authoring-contracts.js` as a contract validator, alongside existing contract validator files, so strings that are explicitly rejected as legacy fields are not misclassified as runtime dependencies. Runtime implementation scanning remains unchanged.

No full Node regression, frontend build, Android test, Docker validation, browser E2E, or real-host model request was executed for P0; none should be reported as passed.

The following remain future-stage evidence and are still not implemented by P0:

- generic versioned JSON resource persistence;
- Library Attach/Fork/Update for Prompt/Generation;
- Generation Service implementation;
- Prompt compiler;
- provider adapter cutover;
- Runtime product UI;
- first-party `generateTask` cutover;
- final P8 residual/integration validation.


## 14. P1 implementation evidence

Validated implementation branch HEAD: `802a68654f53015800e141fd052f1a006df149e0`.

Current code now proves:

- `src/native/model-prompt-runtime/persistence.js` supplies the generic versioned JSON resource handler and player-owned Connection/Model/Route persistence on the existing Native storage infrastructure;
- `src/native/model-prompt-runtime/resources.js` centralizes the three P1 resource type definitions, exact-reference discovery/mapping and Package resource-envelope validation;
- `NativeLibraryService` consumes the handler seam instead of introducing a second Library;
- `LibraryAuthoringPlanner` extends the existing Attach/Fork/Update path for Prompt/Generation resources;
- `ResourceGraph` derives Project/Library nodes and exact forward/reverse references without a write path;
- `resolveProjectDependencyClosure` recursively resolves exact model/prompt dependencies and reports `native_model_prompt_dependency_missing` rather than following latest;
- Package build vendors resolved Prompt/Generation resources and rewrites their refs to the generated immutable PackageVersion scope;
- Player Connection/Model/Route records use stable Native IDs and remain outside Package resources;
- secret material remains rejected by P0 contracts; Connection persistence carries only `secretRef`.

Validation evidence:

- Model Prompt Runtime P1 Checks #6 / Run `35836303381`: success;
- 9 suites / 37 tests passed;
- P0 architecture guard: success;
- P1 architecture guard + syntax: success;
- A1 / A2 / A7 / A8 frozen guards: success;
- focused ESLint: success;
- Model Prompt Runtime P0 Checks #17 / Run `35836303445`: success.

P1 did not execute full Node regression, frontend build, browser E2E, Android, Docker, or a real-host model request.

## P2 implementation evidence

P2 validated HEAD: `5d5ab196c37ad7ff25db44d9dd249c0863b94115`.
Generation Core / exact resolution / capability / fallback / Secret boundary / Provider
execution are now implemented. P2 focused: 33 tests. Native FS/SQLite: 48 suites / 347 tests.
P0/P1/P2 and A1/A2/A7/A8 guards, lint, syntax and frontend build passed locally.
Loopback HTTP and streamed response integration ran for both protocol adapters.
See P2-VALIDATION.md for complete evidence, environment repairs and exclusions.
The earlier P0/P1 future-work statements are historical; P3–P8 remain unimplemented.
