# Atria Repository Governance

**Governance version: 1.1**

本文件是 `ZZZdragondYNGPHX/Atria` 的完整 Repository Governance 权威入口。它规定最终仓库状态与任务生命周期，不绑定 Web、CLI、桌面 Agent 或人工开发者的具体执行工具。

## 1. Authority

“应该怎么做”的优先级：

1. 用户当前明确指令；
2. 本 Governance；
3. 当前已批准 Plan；
4. 当前 `HANDOFF.md`；
5. 当前执行环境 Adapter；
6. 默认行为。

“仓库实际上是什么状态”的优先级：

1. 真实 Git / 远端 refs；
2. `HANDOFF.md`；
3. Record；
4. Plan。

文档与真实仓库冲突时，以真实状态为准并修正文档，不为迎合旧文档而回退实现。

## 2. Branch model

### `main`

正式、稳定的 Atria 产品源码主线。普通产品开发使用短期语义分支，例如 `feat/*`、`fix/*`、`refactor/*`；需要其它前缀时必须有清晰任务语义。

任务完成后应验证、记录、合并 `main`、再次验证并删除短期分支。

### `docs`

长期、独立的治理与项目文档工作空间。一级职责：

- `README.md`：本 Governance 与仓库路由；
- `plans/**`：准备怎么做及其设计边界；
- `records/**`：实际上做成了什么的永久历史；
- `templates/**`：Plan / Record / HANDOFF 模板；
- `HANDOFF.md`：仅在确有活跃交接任务时存在；
- `WEB-PERSISTENT-PROMPT.md`：Web 执行适配层。

不得放置产品实现、Package 资产、独立工具或 AI Skill 资产。

### `package`

长期、独立的游戏 / Atria Package 资产工作空间。一个游戏一个顶级目录，每个游戏必须有自己的 `releases/`，历史 `.atria` 成品默认保留且不覆盖。

不得为了获得产品源码而将 `main` merge 进 `package`。

### `plugin`

长期、独立的开发工具工作空间。一个独立工具一个顶级目录。适用于 MCP、validator、preview/debug 工具等，不用于承载 Atria 产品内置的 `main:plugins/**`。

不得为了集成验证而将 `main` merge 进 `plugin`；需要产品环境时使用独立产品工作树/运行实例。

### `skills`

长期、独立的 repository-agent AI Skill 资产工作空间。每个 Skill 一个顶级目录，由 `SKILLS.md` 负责摘要路由。

Atria Runtime Skills（例如 `main:default/skills/**`）属于产品资产，继续留在 `main`，不得因为名称相同而搬入本工作空间。

### `reference/<project>`

真实外部项目镜像/参考分支。

- “参考 <project>”只授权读取对应 reference；
- “更新 <project>”只授权同步对应 reference；
- 读取与更新权限相互独立；
- 一个 reference 的授权不扩展到其它 reference；
- 不向镜像强行注入 Atria 的 `AGENTS.md`、`CLAUDE.md` 或其它治理文件；
- 不在 reference 上开发 Atria 功能。

## 3. Long-lived workspace isolation

`docs`、`package`、`plugin`、`skills` 是独立根工作空间。

禁止为了方便执行：

- `main -> docs` merge；
- `main -> package` merge；
- `main -> plugin` merge；
- `main -> skills` merge。

跨工作空间需要内容时，应只迁移真正属于目标工作空间的资产，并保留清晰来源与验证证据。

## 4. Task identity and Primary Workspace

一个实质任务应有稳定 Task ID，并且只能有一个 Primary Workspace。辅助工作空间只提供实现、验证或资产证据，不为同一任务建立重复 Record。

稳定关联依靠：

`Task ID + 稳定文档路径 + 实现/资产 HEAD`。

docs 可以记录实现、Package、Plugin、Skill、CI HEAD；实现工作空间不要求反向记录当前 docs commit。

## 5. Plans

Plan 描述准备怎么做、为什么这样做，以及已经冻结的设计边界；它不是实施历史。

建议结构：

- `plans/feat/`
- `plans/fix/`
- `plans/refactor/`
- `plans/package/`
- `plans/plugin/`
- `plans/architecture/`

### Single-file Plan

小型或中型任务可使用单文件，例如：

```text
plans/feat/custom-start-form.md
```

### Plan Bundle

大型项目或已经大到不适合每阶段整份加载的 Plan，必须改为项目目录：

```text
plans/package/example-project/
├─ index.md
├─ decisions.md
├─ nation.md
├─ religion.md
├─ economy.md
└─ ui.md
```

`index.md` 是唯一入口与路由文档，应包含项目目标、冻结核心原则、模块图/依赖、阶段图、当前设计状态，以及每个阶段究竟需要读取哪些模块。

模块文件只对自己的领域负责。同一条详细规则只保留一个权威来源；其它模块通过链接/依赖引用，不复制第二份。

`decisions.md` 可选，只保存会影响多个模块、未来 Agent 不应随意重开的冻结决策。

规则：

- 小型局部任务可以没有正式 Plan；
- 大型 feature/refactor、架构任务、复杂 Package/Plugin、或用户明确要求先讨论的任务应建立 Plan；
- 当单文件 Plan 已经大到需要阶段化按需阅读时，使用 Plan Bundle；
- Plan Bundle 必须先读 `index.md`，再只读当前阶段所需模块；
- 仅在已批准设计发生实质变化时更新对应模块；路由、依赖、阶段映射或跨模块冻结决策变化时更新 `index.md`；
- Plan 必须环境中立，描述 what/why，不绑定某个客户端的 Git/API 执行方式。

## 6. Records

建议结构：

- `records/feat/`
- `records/fix/`
- `records/refactor/`
- `records/package/`
- `records/plugin/`

Record 是永久实施历史。小任务可以在完成时一次写入；多阶段任务必须从第一阶段起持续更新同一份 Record，保留前序阶段。

阶段记录通常包含：Stage、Start HEAD、End/Tested HEAD、状态、完成内容、关键决策、实际验证/CI、已知限制与下一 checkpoint。

不得等最终阶段结束后再凭记忆补写早期阶段。

## 7. HANDOFF

`docs:HANDOFF.md` 是当前实时恢复状态，不是历史档案。全仓库同时最多一个有效 HANDOFF。

多阶段、跨对话/Agent、外部依赖中断或用户明确要求交接时建立；一次连续闭环的小任务无需形式化创建。

一旦存在，每个实际工作轮结束必须刷新，至少记录 Task ID、Primary Workspace、当前分支/HEAD、阶段、Plan entrypoint、当前阶段所需 Plan modules、Record、已完成、未完成、关键决策、验证/CI、下一目标、开始前必读内容、不要重复的工作和新对话接手提示词。

任务完成后删除 HANDOFF。历史 handoff 的有价值事实应进入对应 Record，而不是继续作为多个“实时交接”存在。

## 8. Task lifecycle

### Small task

分析 → 建立适当短期分支 → 修改 → 验证 → commit/push → 必要 CI → Record → 合并 `main` → 验证 `main` → 删除短期分支 → 删除曾创建的 HANDOFF。

普通技术问题自行处理，不把测试、提交、合并等常规步骤反复交回用户确认。

### Multi-stage task

整个任务默认沿用同一 Primary Workspace / 工作分支。

每个阶段：实现本阶段 → 验证 → 持久化/push → 方案实质变化时更新 Plan → 更新同一 Record → 更新 HANDOFF → 给出接手提示词 → **停止**。

不得因为还有能力继续就跨越正式阶段边界。全部阶段完成并验证后，才执行最终集成与清理。

## 9. Minimal Context Routing

默认按需加载：

- Level 0：用户请求 + 当前工作区热路径规则 + 直接相关代码；
- Level 1：任务需要时增加 Plan entrypoint / HANDOFF；若为 Plan Bundle，先读 `index.md`，再仅读当前阶段所需模块；
- Level 2：续接或历史决策敏感时增加当前 Record / 必要历史；
- Level 3：仅触发时读取完整 Governance、明确指定 Skill、明确授权的 reference。

不得启动时全量扫描所有 Plans、Records、Skills 或 reference。Search 用于定位，不代表应全文加载所有命中项。

## 10. Skills loading

只有用户明确要求某 Skill，或当前正式 Plan 明确要求某 Skill 时，才读取：

`skills:SKILLS.md -> 对应 Skill`。

Skill 可以指导技术方法，但不能扩大任务范围，也不能覆盖用户指令、Governance 或 Plan。

## 11. Governance-sensitive operations

以下操作开始前必须读取本完整 Governance：

- 创建、删除、重命名长期分支；
- 修改长期工作空间结构；
- 仓库迁移；
- 修改 `reference/*` 体系；
- 修改 Plan / Record / HANDOFF 生命周期；
- 跨多个长期工作空间的治理任务；
- 新增资产类型；
- 修改 `AGENTS.md` / `CLAUDE.md` / Web Adapter；
- 不确定内容归属哪个工作空间；
- 修改本 Governance。

普通局部产品任务只需使用工作区热路径，不必每次重读全文。

## 12. Execution adapters

Governance 定义结果，不规定客户端实现。

### Web / remote

使用 `WEB-PERSISTENT-PROMPT.md`。以远端 refs 为事实，使用实际可用的远程能力；没有运行过的本地测试、构建、真机或 UI 验证不得声称通过。

### Local / CLI

使用当前工作区 `AGENTS.md`。优先本地 Git、文件系统、搜索、测试、构建以及独立 worktree；保护已有 dirty changes，不为模仿 Web 流程而绕远程 API。

`CLAUDE.md` 只作为 Claude Code 薄入口，不复制第二套 Governance。

## 13. Stop conditions

### Governance Stop

无论环境能力如何，都必须在正式多阶段任务的当前阶段结束时停止并完成 Record/HANDOFF。

### Environment Stop

仅当下一步确实依赖当前环境无法取得的设备/UI 证据、用户专属 Secret/权限/登录，或远程 CI 已进入明显耗时且成为唯一剩余依赖时暂停。

普通代码错误、测试失败、workflow 问题、merge conflict 或常规实现选择应自行处理。

## 14. Completion criteria

产品短期任务完成：实现、适当验证、远端状态、Record、必要 Plan 更新、合并并验证 `main`、删除临时分支与 live HANDOFF。

Package / Plugin / Skill 任务分别以其长期工作空间的已验证资产、对应 Record、必要发布/索引状态与 live HANDOFF 清理为准。

仓库迁移类任务只有在长期工作空间边界、reference 历史、文档生命周期、Web/Local Adapter、迁移资产完整性和临时迁移状态均完成验证后才算结束。

## 15. Commit guidance

优先使用简洁语义化提交，例如：

- `feat(memory): ...`
- `fix(startup): ...`
- `refactor(runtime): ...`
- `package(<game>): ...`
- `plugin(<tool>): ...`
- `docs(<task>): ...`
- `skill(<name>): ...`

提交粒度服务于可审阅性，不为格式主义拆散一个完整改动。
