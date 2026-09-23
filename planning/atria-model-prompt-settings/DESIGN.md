# 总设计案：Atria Native Model / Prompt / Runtime

## 1. 状态与目标

状态：**approved / implementation-ready**。

基线：`main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`。

实现分支：`refactor/atria-model-prompt-settings`。

本任务不是重新设计 N0–N10 / A0–A9，也不是继续给 SillyTavern 旧 Preset/Connection UI 加壳。目标是把 Atria 的模型配置、Prompt 资产、Runtime 路由和请求编译从旧 ST authority 中切出，形成以后可由独立 Atria host 直接消费的核心。

长期边界：

    Atria Domain / Runtime / Authoring / Model / Prompt
                             |
                             v
                          Ports
                             |
               +-------------+-------------+
               |                           |
               v                           v
       ST Compatibility Host        Future Native Host

原则：**No New SillyTavern Authority**。

新 Atria-owned domain code 不得直接把 ST DOM、`extension_settings`、`power_user`、PresetManager、PromptManager 或 host globals 变成新的领域真源。

## 2. 保留的冻结 authority

本 refactor 必须继续服从下列既有权威，不建立平行系统：

- Package / immutable PackageVersion；
- Native Runtime Descriptor；
- Native Session / Branch / SessionRevision；
- `atri_world_state` / `atri_game_runtime` 与 Native Session State；
- A1 Studio Workspace / ChangeSet / Validation / Commit；
- A2 Resource Registry / derived-readonly Resource Graph；
- A4 Component Model / Native Preview；
- A5 Plugin / Skill boundaries；
- A6 Native Play；
- A7 Studio Authoring UX；
- A8 Project Agent human Review/Commit boundary；
- A9 hard-cut product authority。

不得恢复 CardApp、`game.json`、charId、Swipe、Chat State 或 legacy WorldInfo 为 Native authority。

## 3. 六个核心对象

### 3.1 Connection Profile

只回答“怎么连接”。

包含：

- stable ID / display name；
- transport/provider adapter；
- endpoint；
- proxy/network policy；
- `secretRef`；
- provider connection options。

不拥有 Model、temperature、Prompt、Context Template、Reasoning Prompt、stop list、tool permission。

### 3.2 Model Profile

表示一个玩家/设备可实际运行的模型实例。

包含：

- stable ID；
- Connection Profile ref；
- remote model ID；
- capability contract；
- context/output limits；
- tokenizer provenance；
- optional message-format details；
- provider hints。

同一 remote model 可通过不同 Connection 形成不同 Model Profile。

Model discovery 只产生候选信息，不直接成为持久 identity。

### 3.3 Generation Profile

可版本化 Native resource。

负责：

- sampling；
- output preference；
- reasoning control；
- stop policy；
- cache preference；
- streaming preference；
- tool-choice preference；
- narrowly scoped provider extensions。

它不授予 Tool 权限，也不改变 Runtime Output Contract。

### 3.4 Prompt Module

一个可组合的声明式提示单元。

核心字段：

- stable identity；
- semantic role/target；
- stage applicability；
- priority；
- conditions；
- typed parameters；
- body；
- provenance。

### 3.5 Prompt Program

一套完整提示方案。

V1 支持：

- ordered stages；
- semantic targets；
- single-parent derive；
- add / disable / replace / configure by stable module ID；
- finite condition DSL；
- typed parameters；
- Request Local scratch；
- declared cross-stage artifacts；
- Response Directive。

不支持：

- arbitrary JavaScript/EJS；
- arbitrary JSON Patch；
- multiple inheritance；
- workflow DAG；
- tool execution；
- model-call definition；
- 自建持久状态 authority。

### 3.6 Runtime Route

把运行角色绑定到：

- Model Profile；
- Connection Profile；
- Generation Profile；
- Prompt Program；
- fallback routes；
- timeout/retry/fallback policy；
- runtime requirements。

Game Runtime Role Router 继续负责角色语义、timeout/retry/fallback sequencing；公共 Route Resolver 下沉到 Generation Core，供 Game Runtime、Studio Agent、Orchestrator、Memory/Search 等复用。

## 4. Scope / Ownership / Override

不同层不是普通 JSON spread。

### Package / Project

作者拥有：

- Prompt Modules / Programs；
- Generation Profiles；
- role capability requirements；
- recommended Prompt/Generation resources；
- orchestration/authoring intent。

Package 不携带：

- API key；
- Secret；
- 玩家私有 Connection；
- 玩家本机 Model Profile。

### Player Runtime

玩家拥有：

- Connections；
- Models；
- Secrets；
- concrete Runtime Routes；
- Library derived resources。

### Session Override

只影响当前 Session，可被保存进 Session-owned配置，但不修改玩家全局 Runtime 或 Package 原件。

### Request Override

一次调用有效；绝不写回上层。

### Kernel / Runtime Authority

永远高于所有 Prompt/玩家 override。后层只能覆盖允许覆盖的产品参数，不能放宽 permissions、tools、state authority、output contract safety 或 Package runtime requirements。

## 5. Prompt Program

### 5.1 Semantic target

Native Prompt 不把 ST 的 position/depth/prompt_order/jailbreak/character-id 当 ABI。

示意 target：

- `system.foundation`
- `system.character`
- `system.world`
- `system.style`
- `system.response`
- `context.before_history`
- `context.after_history`
- `context.before_input`
- `context.after_input`
- `response.prefill`
- `response.post_history`
- `agent.task`
- `agent.evidence`
- `agent.constraints`

`response.post_history` 承接 PHI 能力，产品术语为 **Response Directive**。

### 5.2 Stage

Stage 是作者工作流语义，如：

- understand
- plan
- write
- review
- finalize

它不等于 Agent、Node 或模型调用。

单模型 RP 可一次完整消费所有适用 stage。

Orchestrator 只把同一资源按 node/role responsibility 投影，不自动把自然语言流程转成图，也不要求每个节点复制完整 Prompt Program。

### 5.3 Variables

V1 允许：

1. typed Host View：只读；
2. Program Parameter：显式配置；
3. Request Local：一次 request 内临时；
4. Cross-stage Artifact：显式声明的流程产物。

持久写入继续由 Runtime Intent + Native Session State/Revision 事务完成。Prompt Compiler 本身永远不写 Session DB。

### 5.4 Conditions

有限 declarative DSL：

- eq / neq
- gt / gte / lt / lte
- exists
- in
- and / or / not
- 有界 contains

不在 V1 加 eval、async lookup、任意函数或 script hooks。

### 5.5 Derive

V1：

- single parent；
- stable module IDs；
- add；
- disable；
- replace；
- configure。

Build 时 resolve + validate + flatten + freeze exact revisions。Package runtime 不追“latest”。

## 6. Request Context

Native Session Context Compiler 当前存在但还没有成为所有 generation 的最终请求 authority。

公共边界定义为：

    RequestContextPlan

Provider examples：

- Native Session Context Provider；
- Studio Context Provider；
- Task Context Provider。

Native Session Context 决定“哪些事实进入请求”；Prompt Compiler 决定“如何指示模型理解这些事实”。Prompt Module 不自行重新扫描 Timeline/Knowledge/Memory 建第二套 context authority。

## 7. Prompt IR

Prompt Program 不直接生成 provider-specific messages。

链路：

    RequestContextPlan
           +
      Prompt Program
           |
           v
      Prompt Compiler
           |
           v
        Prompt IR
           |
           v
     Provider Renderer

Prompt IR 至少表达：

- directives；
- context slots；
- history/current input；
- response directives；
- tools；
- output contract；
- prefill；
- provenance。

OpenAI / Anthropic / Gemini / raw-text renderer 再投影到各自协议。

## 8. Generation Core

Native Generation Core 是新的正式核心，不以 `Atria.getContext()` 为依赖前提。

概念入口：

    GenerationService.execute(request)

职责：

1. resolve Runtime Route；
2. resolve Model/Connection/Generation/Prompt exact identity；
3. resolve capability requirements；
4. obtain RequestContextPlan；
5. compile Prompt IR；
6. freeze Effective Request Snapshot；
7. dispatch through Provider Port；
8. normalize response/stream and diagnostics。

现有 `context.generateTask()` 变成 ST Compatibility Facade。

第一方 Native 调用最终直接使用 Generation Service；第三方 legacy extension 可暂时继续调用 compatibility facade。

## 9. Capability / Provider / Secret

### Capabilities

三态：

- supported
- unsupported
- unknown

每项带 provenance：

- built-in adapter metadata；
- provider discovery；
- provider capability endpoint；
- user override。

required + unsupported => fail。
required + unknown => 默认 fail，除非用户显式确认 override。
optional + unknown => 默认不启用。

### Provider

Core 通过 Provider Port，只认识类似：

- resolveCapabilities
- countTokens
- renderRequest
- send
- parseStream
- normalizeResponse

当前成熟 sender 可以由 Transitional ST Adapter 包装。

Adapter 只能消费显式 resolved request；不能在发送时重新读取 active ST preset/global settings 作为隐藏 authority。

### Secret

Connection 保存 `secretRef`。
Secret Port 在 send boundary 解引用。
Secret value 不进入 Package、Library、Prompt、Project、普通 diagnostics 或 Effective Request serialization。

## 10. Fallback

Fallback 是完整 Route，不是只换一个旧 connection preset 名。

切换前重新验证：

- Model capability；
- context budget；
- tools；
- output contract；
- reasoning；
- message format；
- provider compatibility。

V1 fallback policy：

- automatic
- confirm
- disabled

不引入虚假的 low/normal/high costClass；真实成本策略留给未来 Usage/Cost subsystem。

## 11. Native Resource

A2 Registry 已经 descriptor-driven，A8 Project Agent 也已根据 Registry 动态发现一部分资源能力。当前瓶颈主要在：

- `NativeLibraryService` 仍硬编码 World/Knowledge/Binding/Asset/Package；
- LibraryAuthoring Attach/Fork/Update 仍专用；
- package dependency closure 仍围绕现有类型。

本任务只增加足够通用的 versioned JSON resource handler，使：

- `core.prompt-module`
- `core.prompt-program`
- `core.generation-profile`

能复用 Library / exact revision / Attach/Fork/Update / Resource Graph / Package closure。

不重写 WorldRepo、KnowledgeRepo、AssetStore，不建立 PromptStore。

## 12. Package runtime contract

`package.presets` 当前只有零散 Studio metadata 使用，没有形成 Native runtime authority。

新合同使用新的明确 runtime metadata（最终字段名在 P0 contract 中冻结），表达：

- role requirements；
- recommended Prompt Program；
- recommended Generation Profile；
- exact resource refs。

`package.presets` 不升级为新 contract，也不做长期 fallback。

## 13. Product Frontend

### 13.1 Long-term IA

长期产品方向：

- Home
- Play
- Library
- Studio
- Runtime

但这不是本任务全部 UI 范围。

### 13.2 本任务范围

Runtime：

- Routes
- Models
- Connections
- Profiles
- Diagnostics

Library：

- Prompt Programs
- Prompt Modules
- Generation Profiles

现有 Build / A7 Studio workspace：

- Prompt Authoring
- Runtime Design

Settings：

- Appearance / Language / Interaction / Accessibility / Storage / Privacy / Advanced 等产品偏好；
- Model / Connection / Prompt / Runtime 不再放 Settings。

Search：

- 搜索结果导航至正式 owning route；
- 不把 B domain UI 注入 A domain。

### 13.3 A6 global-nav decision

当前 A6 guard 明确把 `Build` 作为 primary authoring domain，并拒绝 primary `Studio`。

本任务不为 Model/Prompt 重构顺带重开整个 global IA，所以保留 `Build` primary route；Prompt/Runtime Authoring 在已有 A7 Studio workspace 内产品化。

未来若正式升级整个 Atria Product Frontend V2，再单独讨论 Build → Studio 的一级导航变化。

### 13.4 Visual / Interaction

风格：现代专业创作工具，而非聊天软件或 AI 霓虹 SaaS。

要求：

- clear typography / spacing hierarchy；
- fewer cards；
- workspace/panel/tree/inspector 优先；
- color 用于状态和选择；
- desktop 与 mobile 独立布局；
- Simple/Advanced Prompt authoring；
- origin/provenance/derived/read-only 状态可见；
- empty/error/loading/conflict 都有正式 UI；
- 危险操作统一 Danger Zone；
- Runtime diagnostics 解释“为什么最终这样解析”。

正式页面不得通过 reparent 旧 ST DOM 完成“Native 化”。

## 14. Hard Cut / Migration

最终 first-party Native paths 不得继续以以下内容为 authority：

- PresetManager
- PromptManager
- `buildPresetAwarePromptMessages`
- `extensionSettings.connectionManager`
- `oai_settings`
- `power_user`
- legacy Context/Instruct/System Prompt preset identity
- ST macro side-effect state
- `package.presets`
- old DOM selectors/placement
- first-party `Atria.getContext().generateTask`

Legacy ST compatibility island可继续使用，不等于 Native 仍依赖它。

旧数据策略：

- 不自动双写；
- 不后台同步；
- 不隐式猜测迁移；
- Native 第一次配置允许从零建立；
- 以后若需要 Legacy Importer，只做显式、一次性、单向转换；
- importer 不是本 refactor 完成 blocker。

## 15. Frozen guard evolution

冻结的是**语义不变量**，不是所有阶段性正则永久不可变。

当前 main 已确认几个字面冲突：

1. A6 guard 要求 Runtime Connections 保留 `atriaRuntimeConnectionAdvanced` compatibility editor。
2. A6 guard 要求 standalone `capabilities` route。
3. A8 guard 要求 Studio Agent 代码出现 `generateTask` 与 tools projection。

本 refactor 在新 native replacement 完成前不得提前删这些 seam；完成后必须：

- 修改对应 old guard，使其断言新的正式 seam；
- 保留原 guard 中其他 frozen invariants；
- 新增本 refactor residual guard；
- 不能 wholesale disable A0–A9/N0–N10 guards；
- 不能为了通过 stale regex 恢复 legacy authority。

## 16. Non-goals

- 重做整个 A6 shell；
- 现在把 Build 一级导航改名 Studio；
- 重写 N0–N10 Session/Package authority；
- 第二个 Orchestrator；
- Prompt 持久状态数据库；
- 任意 Package JS；
- marketplace；
- 一次性重写全部 provider network stack；
- 自动无损转换所有 ST 用户数据；
- Android / Docker 默认构建。


## 17. P0 contract realization

P0 已把本设计的核心边界冻结为代码合同，validated HEAD 为 `472e1a9f0759a460d845a2e6c618983c35e18654`。

### 已冻结的具体 ABI

- Native ID families：
  - Connection Profile → `conn_*`
  - Model Profile → `model_*`
  - Generation Profile → `genprof_*`
  - Prompt Module → `pmod_*`
  - Prompt Program → `pprog_*`
  - Runtime Route → `route_*`
- Package runtime author intent：`runtime.modelPrompt`
- model/prompt resource exact refs：
  - `core.prompt-module`
  - `core.prompt-program`
  - `core.generation-profile`
- player-private objects remain outside Package：
  - Connection Profile
  - Model Profile
  - concrete Runtime Route
  - Secret values
- runtime artifact serialization must remain secret-free.

### Port boundary

P0 freezes these minimum Port shapes:

- Generation Service: `execute`
- Route Resolver: `resolve`
- Provider Port: `resolveCapabilities / countTokens / renderRequest / send / parseStream / normalizeResponse`
- Secret Port: `resolveSecret`
- Context Provider: `buildRequestContextPlan`

These are structural contracts only. P0 does not yet implement P2 Generation Service or provider adapters.

### No New SillyTavern Authority guard

`src/native/model-prompt-runtime/` may not directly depend on:

- `Atria.getContext()`
- `generateTask`
- PresetManager / PromptManager
- `extension_settings` / `power_user` / `oai_settings`
- host DOM / browser persistence
- direct `atria-dispatch` sender modules
- `package.presets` runtime authority

The guard includes a self-test proving that representative violations are detected.

## 18. P2 execution realization

P2 is implemented at `5d5ab196c37ad7ff25db44d9dd249c0863b94115`.
See P2-VALIDATION.md and the implementation branch's
src/native/model-prompt-runtime/README.md for concrete Port signatures, fallback
policy, immutable request configuration and validation. Prompt preparation remains
an injected Port for P3; no first-party or UI cutover occurred in P2.

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
