# Native Heavy-Frontend Reference — Platform Gaps

> Package branch: `package/native-heavy-frontend-reference`  
> Package baseline: `PLAN.md` — Implementation Baseline v1.0  
> Audit baseline: `main@35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b`

本文只记录由已冻结 Package 需求真实压出的 Atria Core Gap，不是功能愿望清单。

## G1 — Turn → Session Application Atomic Outcome

**状态：Resolved in `main@35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b`; Package Phase 1 confirmed the prerequisite and adds no Core workaround.**

### 当前能力与缺口

当前 `narrative-outcome` 已能在同一 Session Revision 中原子提交 Narrative、semantic World outcome、Timeline Variant 与 Task receipt。但本 Package 已冻结 Event Instance 属于 Session Application Domain；当前 semantic outcome authority preparation 最终只具备 World Command sink，不能在 `finalizeTurn()` 的同一事务中执行声明过的 Lifecycle/App Command。

不能接受 `commit Narrative/World → 第二次请求 app.command → advance Event`，因为第二步失败会造成 Narrative 与 Event Authority 裂缝。

### 需要的能力

允许预声明 semantic interpretation mapping 安全映射到 typed World Command 和/或 typed Session Application Command，并在一个 Session Revision 中原子发布。

安全边界：

- 模型仍只返回受限 semantic interpretation，不返回通用 patch；
- 模型不能自由选择 Domain / Command ID；
- World/App mapping 必须在 Package contract 中预声明；
- App args 必须经过目标 command `argsSchema`；
- 所有 mutation 必须先在 staged/private authority 中验证；
- 任一 mapped command 失败时 provisional Narrative 不得 commit；
- Narrative、World/App state、Timeline Variant、receipt 进入同一 Revision；
- `expectedRevisionId`、invocation、fingerprint、retry/idempotency 保持现有语义；
- 旧 World-only narrative-outcome Package 保持兼容；
- 不得开放 raw lifecycle/session patch。

### 最小验收

- narrative-outcome semantic event 能驱动 Session App typed Command；
- Narrative 与 App record 同 Revision 提交；
- 若同一语义需要同时产生 World + App 变化，两者必须同事务；
- App Command 校验失败时 Narrative / World / App 都不提交；
- stale revision 不提交；同 invocation retry 不重复推进；
- 旧 World-only tests 继续通过；
- 不调用真实 provider。

优先检查：`src/native/session-core.js`、`src/native/task-authority.js`、`public/shared/native-task-contract.js`、interpretation mapping、Lifecycle App Command authority 与相关 tests。

---

## G2 — Declared Background Task → App Command Bridge

**状态：Resolved in `main@35bc587bb78fd6a7c0fc4fc418d99c7315f5af8b`; Package Phase 1 confirmed the prerequisite and adds no Core workaround.**

### 当前能力与缺口

Atria 已有 Lifecycle Trigger/Workflow/Automation、background Task、durable Task outbox、proposal、typed `app.command`、scheduled interaction 与 Branch/Revision/receipt 安全。现有安全边界故意不允许 Package automation/workflow 自动消费 fresh proposal，普通 AI proposal 需要显式 Host acceptance。

本 Package 的 NPC SMS / Social / Mail / Morning Report 属于更窄场景：Runtime 已经决定业务动作必须发生，模型只负责生成受 schema 约束的内容。每条 NPC 短信都要求玩家批准 proposal 不符合目标体验。

### 需要的能力

`Lifecycle Trigger → declared Task → validated result → predeclared App Command / scheduled interaction`。

安全边界：

- 仅允许 Package contract 明确绑定的 Task/Variant → Domain/Command；
- 模型不能在输出中指定任意 Domain / Command；
- output schema 与 command args 必须严格兼容或经过 bounded declarative mapping；
- 普通 advisory/proposal 仍保持原 Host acceptance；
- stale revision、inactive scope、cancelled interaction、wrong branch 不提交；
- invocation/fingerprint/receipt 保证 retry 不重复 append；
- delayed delivery 复用现有 Lifecycle clock/scheduled interaction，不创建第二 scheduler；
- Host 继续掌握 Task binding/provider route/cancellation；
- 无 raw Session patch。

### 最小验收

- Trigger 启动已绑定 background Task 后可自动形成目标 App Command record；
- retry 不重复 append；invalid result 不提交；
- stale/branch change/cancelled scope 不提交；
- 普通 proposal Task 仍要求原有 acceptance；
- scheduled path 到 dueTick 前不投递、到期只投递一次；
- Host restart/pump 重入只恢复 durable intent；
- 不调用真实 provider。

优先检查：`public/shared/native-task-contract.js`、`public/shared/native-lifecycle-contract.js`、`src/native/lifecycle-authority.js`、`src/native/adapters/generation-host.js`、`public/scripts/native/lifecycle-client.js` 与相关 Task/Lifecycle tests。

---

## D1 — Dynamic Conversation Presentation Profile

**状态：Deferred / non-blocking for v1. Do not implement now.**

UI v2 conversation profile 支持 `default / novel / dialogue`，但当前是静态 UI Document 配置。理想状态是 Event Projection 可自动选择 Story/Dialogue profile；v1 已决定使用统一 profile + Event Header + canonical prose + text-first layout，因此 D1 不属于 G1/G2 feat 范围，未来加入立绘或更强 Scene Presentation 时再审计。

---

## G3 — Package Turn → Atria Memory Bridge

**状态：Satisfied / integrated and Package-validated. 不再阻塞 Phase 3。**

### Core resolution

G3 已由 Atria Core / Host 侧解决，没有在 Package 内增加 Memory workaround。

Integrated main：

- `main@698aec1ee5d366ed4e36b5b696c432793dad5e17`；
- G3 tested HEAD：`1f59ff7957a080f76d802e1d758054d1c2438f2c`；
- targeted run：`36376721567`，**success**；
- 5 suites / 134 tests 全部通过。

实现继续复用现有 Atria Memory Graph 与 Native Memory lifecycle：

- Package Turn 在 Narrator Context 编译前通过 Host-owned bridge 请求现有 Memory recall；
- `memory:false` 不 recall，`memory:true` 也只能提交有可见 Timeline provenance 的 evidence；
- Host 与 Context compiler 双重检查当前 Timeline / Branch / Revision / Information View；
- hidden / stale / foreign / unproven evidence fail closed；
- Memory unavailable 按既有 graceful policy 工作；
- route / Native retrieval / provider / Secret / cancellation / budget 继续由 Host/player 拥有；
- finalized Package Turn 通过现有 `TIMELINE_APPENDED` / `REVISION_COMMITTED` lifecycle 进入既有 Memory ingestion；
- replay 不重复 append / ingestion；
- G1 / G2 语义保持不变。

### Package Phase 3 validation

Package branch 已合入上述 main：

- PR：#88；
- merge commit：`09fd8ff0c3ecdb03040516c8f781271838f5c1f7`。

Package 原有 Narrator Information View 已正确声明 `memory: true`，因此无需修改项目 contract。本轮只升级 Package validator，并复用现有 Core bridge。

最终 Package 验证：

- run：`36378377773`；
- tested HEAD：`122396cbf9f4a139feaf5add66e4f707615f94a0`；
- job：`Phase 3 Memory Final Validation`；
- 结论：**success**；
- Phase 1 / Phase 2 / Phase 3 Package validators：PASS；
- recorded `story-turn`：PASS；
- fake/in-memory Atria Memory recall → Package Narrator Context Memory lane：PASS；
- `memory:false` no recall / no injection：PASS；
- hidden Timeline / stale Revision / foreign Branch evidence rejection：PASS；
- finalized canonical Narrative lifecycle boundary：PASS；
- committed `atri_lifecycle` App state 与 `atri_world_state` World state 在同一 lifecycle 边界可观察：PASS；
- exact replay dedupe：PASS；
- G3 / G1 / G2 / Memory Graph targeted suites：**5 / 5，134 / 134 tests PASS**；
- `providerCalls = 0`。

MySQL / Postgres 在 targeted Jest 中显式禁用；未运行真实 provider、无关全仓测试/全仓 lint、Android 或 Docker。

### Boundary retained

没有新增：

- Curator；
- Story Compression / Day Compression；
- Package Memory Store；
- 第二数据库；
- 第二 Timeline；
- 第二 scheduler；
- Package Memory Task。

因此 G3 已满足 Implementation Baseline v1.0 的平台前置要求，**Phase 3 可以正式关闭并进入 Phase 4 交接；G3 不再是 blocker。**


---

## G4 — UI v2 Read-only Temporal Projection

**状态：Satisfied / integrated in `main@6052a6d47b13d74be24c412a69527bd445dcc55c`; synced into Package via PR #90 / `3a60d365b9726d6c1b35ae98c649f3c7238f2a08`.**

Phase 4 Schedule 必须展示连续 Lifecycle Game Clock 的当前时间，但 UI v2 原先没有只读 Temporal root。把 Clock 镜像进 World 或 Session Application 会制造第二时间事实源，因此不能在 Package 内通过状态复制规避。

Core 最小修复只把现有 Host `getTemporalProjection()` 暴露为 UI v2 的只读 `temporal` root，并通过 Experience activation 传入；没有新增 Clock、数据库、scheduler、Lifecycle mutation 或 raw patch。

Targeted run `36381685191`：**success**，覆盖 `game-runtime/ui-live.test.js` 与 `game-runtime/experience-ready-p4.test.js` 以及 touched module syntax checks。正式记录：`docs:feat/native-ui-temporal-projection.md`。

Package Phase 4 只使用该 read-only projection 显示 Game Clock；Schedule records 仍来自现有 Session Application + Information Runtime。

---

## G5 — UI v2 → Session Application Typed Command

**状态：Satisfied / integrated in `main@86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`; synced into Package via PR #93 / `8129f69dba48e7435a1039b4329958c1d969c841`. Phase 5 Package-validated.**

### 缺口

Phase 5 需要玩家在 Phone 内自由发送 SMS / Social / Mail，但这些记录按冻结 Authority 属于 Session Application。Atria Core 已有 Lifecycle client `app.command`、typed Session Application Domain/Command 和 G2 background Task bridge；UI v2 却只有面向 World 的 `command.dispatch`，普通 declarative UI form 无法直接提交 Session Application typed Command。

不能接受的 Package workaround：

- 把 Communication 镜像进 World；
- 把已提交业务记录留在 Local UI；
- 把 Phone input 伪装成 Story Composer / main Timeline user message；
- 用 model Task 充当玩家 UI write proxy；
- 暴露 raw Lifecycle / raw patch。

### Core resolution

独立 Core branch：`feat/native-ui-session-application-command`。

UI v2 新增一个窄动作：

`application.command`

它只允许：

- 固定声明 `domainId`；
- 固定声明 `commandId`；
- bounded declarative `args`；
- 可选 `recordId`。

执行严格路由到现有 Host Lifecycle client 的 `app.command`。没有开放 raw Lifecycle action、raw Session patch、Timeline mutation、scheduler ownership 或任意方法调用。

安全语义：

- Action compile 将 `application.command` 计为 authority write，仍保持一个 UI action 最多一个 authority write；
- presentation/opening context 不允许 Session Application mutation；
- 显式 recordId 可由 projection/item 绑定；
- 未提供 recordId 时 Host 生成稳定 per-attempt identity；
- uncertain transport retry 复用同一 payload / record identity；
- 已知 4xx rejection 可清理 attempt；
- 目标 Domain/Command/args 最终继续由 Lifecycle authority 与目标 command schema 校验。

### Validation

Core targeted：

- tested HEAD：`9281cd1540e27c50cfb0601175988fba166609b5`；
- run：`36386573137`；
- 结论：**success**；
- 覆盖 `game-runtime/ui-v2.test.js`、`game-runtime/lifecycle-client-p4.test.js`、`native/background-task-app-bridge-g2.test.js`、`native/lifecycle-contract-p4.test.js`；
- PR #91 merge commit：`473e7c6ecd79fcacf7517ff54a20c67ce234b662`；
- one-off CI cleanup PR #92 后最终 integrated main：`86b900fd0821eff3cc9fcc23bb2ea343dc1d121b`；
- 正式 Core 文档：`docs:feat/native-ui-session-application-command.md`。

Package sync / Phase 5 validation：

- main → Package：PR #93 / `8129f69dba48e7435a1039b4329958c1d969c841`；
- Phase 5 tested Package HEAD：`e45109f3c695727ebdd72a13486199c58a57ddd7`；
- Phase 5 targeted run：`36390830174` — **success**；
- Package validators Phase 1–5：**PASS**；
- recorded `communication` Scenario：**PASS**；
- G2 background App Command + scheduled delivery：**PASS**；
- Communication → `events/story-current` → Narrator/Interpreter → canonical Timeline：**PASS**；
- adjacent Native regressions：**9 / 9 suites，458 / 458 tests PASS**；
- `providerCalls = 0`。

Repository-wide PR Unit Tests 仍有已知无关 fixture failure：`native/model-prompt-runtime-p4.test.js` 缺 Session snapshot；811 / 812 suites、10277 / 10278 tests 通过。该失败不由 G5/Phase 5 引入，未扩大范围修复。

### Boundary retained

G5 没有：

- 新建 Session database；
- 新建 scheduler；
- 新建 Timeline；
- 让 Phone input 调用 Narrator；
- 让模型选择 Domain / Command；
- 让 ordinary advisory proposal 自动拥有 Authority；
- 改变 G1 / G2 / G3 / G4 semantics。

因此 Phase 5 可以让玩家 Phone input 合法进入 Session Application，同时继续保持 World / Session Application / Lifecycle / Timeline 的冻结 Authority split。

