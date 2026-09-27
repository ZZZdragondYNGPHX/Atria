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