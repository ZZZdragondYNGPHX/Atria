# Atria Repository Governance

**Governance version: 1.3**

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

1. 真实本地 Git 状态；远端 refs 只证明已同步的存储状态；
2. `HANDOFF.md`；
3. Record；
4. Plan。

文档与真实仓库冲突时，以真实状态为准并修正文档，不为迎合旧文档而回退实现。

2026-10-09 用户确认：本地是开发、验证、提交、合并与清理的主力；远端仅保存已提交的源码、资产、文档与历史。GitHub Actions 全部停用，包括自动/手动测试、APK/Docker 构建、发布与分支清理；不以远端 CI、PR 或自动合并作为日常任务的前置条件。

Plan 保存产品设计与当前验收目标，Record 保存实际结果，HANDOFF 只路由当前进度；不要在各处复制另一套执行限制或次数许可。历史 Record、已关闭实验封包和旧 HANDOFF 不是当前执行指令，不得据此恢复旧配额、重复申请授权或阻断正常修复。当前用户指令覆盖旧文档时，清理冲突并继续工程工作，避免让不同文档反复要求 agent 互相否决。

## 2. Branch model

### `main`

正式、稳定的 Atria 产品源码主线。普通产品开发使用短期语义分支，例如 `feat/*`、`fix/*`、`refactor/*`；需要其它前缀时必须有清晰任务语义。

任务完成后应做最小相关本地验证、记录、在本地合并 `main` 并核对集成结果，再同步远端、删除已完成短期分支。没有相关新变化或未解决风险，不重复已通过的测试。

### `docs`

长期、独立的治理与项目文档工作空间。一级职责：

- `README.md`：本 Governance 与仓库路由；
- `plans/**`：准备怎么做及其设计边界；
- `records/**`：实际上做成了什么的永久历史；
- `templates/**`：Plan / Record / HANDOFF 模板；
- `HANDOFF.md`：仅在确有活跃交接任务时存在；
- `WEB-PERSISTENT-PROMPT.md`：停用状态说明；只有用户另行明确授权远端执行时才适用。

不得放置产品实现、Package 资产、独立工具或 AI Skill 资产。

产品使用/开发文档与站点资产在 `main:docs/`；设计和实施历史只在本分支保留。阅读入口：[Plans](plans/README.md)、[Records](records/README.md)、当前 [HANDOFF](HANDOFF.md)。

### `package`

长期、独立的游戏 / Atria Package 资产工作空间。一个游戏一个顶级目录，每个游戏必须有自己的 `releases/`，历史 `.atria` 成品默认保留且不覆盖。

不得为了获得产品源码而将 `main` merge 进 `package`。

### `plugin`

长期、独立的开发工具工作空间。一个独立工具一个顶级目录。适用于 MCP、validator、preview/debug 工具等，不用于承载 Atria 产品内置的 `main:plugins/**`。

不得为了集成验证而将 `main` merge 进 `plugin`；需要产品环境时使用独立产品工作树/运行实例。

### `skills`

长期、独立的 repository-agent AI Skill 资产工作空间，**主要为 Web / remote Agent 提供仓库内可直接读取的 Skill 副本**。每个 Skill 一个顶级目录，由 `SKILLS.md` 负责摘要路由。

Local / CLI / desktop Agent 若已经安装对应 Skill，应优先直接使用本地 Skill；不要为了模仿 Web 流程而绕读 `skills` 分支。只有本地缺失、用户明确要求仓库副本，或正式 Plan 明确锁定仓库版本时，才读取 `skills:SKILLS.md -> 对应 Skill`。

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

### 3.1 Local workspace layout

本地主源码目录保留 `Atria/`，辅助 Git 工作树集中到同级 `Atria-worktrees/`：

```text
Atria/                         # 稳定 main
Atria-worktrees/
├─ docs/                       # 长期治理与项目文档
├─ package/                    # 长期 Package 资产，按需建立
├─ plugin/                     # 长期独立工具，按需建立
└─ tasks/
   └─ <task>/
      ├─ source/               # 任务实现
      └─ docs/                 # 需要隔离修改文档时才建立
```

- 目录表达职责与稳定任务归属；阶段只写入 Plan / Record / HANDOFF，不随阶段反复改目录名。
- 只按实际任务需要建立工作树；迁移使用 `git worktree move`，核对 HEAD、未提交文件、草稿、忽略内容及相关路径/依赖链接。
- 机器绝对路径与本地映射只存在于本地配置，不提交到共享治理或资产中。
- 本地分支与远端同名存储分支对应；未提交内容仍只在本地，不能声称已备份。
- 清理工作树/分支前确认任务已完成且提交已集成；未合并、活跃或用途不明的保留。对 detached 工作树，须确认提交已包含在目标历史，且没有未提交、未跟踪或忽略内容。
- 不强推覆盖历史，不因目录整理读取或更新未经授权的 reference。

## 4. Task identity and Primary Workspace

一个实质任务应有稳定 Task ID，并且只能有一个 Primary Workspace。辅助工作空间只提供实现、验证或资产证据，不为同一任务建立重复 Record。

稳定关联依靠：

`Task ID + 稳定文档路径 + 实现/资产 HEAD`。

docs 可以记录实现、Package、Plugin、Skill 与实际本地验证 HEAD；实现工作空间不要求反向记录当前 docs commit。历史 CI 证据可保留，不构成新的执行要求。

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

阶段记录通常包含：Stage、Start HEAD、End/Tested HEAD、状态、完成内容、关键决策、实际本地验证、已知限制与下一 checkpoint。

不得等最终阶段结束后再凭记忆补写早期阶段。

## 7. HANDOFF

`docs:HANDOFF.md` 是当前实时恢复状态，不是历史档案。全仓库同时最多一个有效 HANDOFF。

多阶段、跨对话/Agent、外部依赖中断或用户明确要求交接时建立；一次连续闭环的小任务无需形式化创建。

一旦存在，每个实际工作轮结束必须刷新，至少记录 Task ID、Primary Workspace、当前分支/HEAD、阶段、Plan entrypoint、当前阶段所需 Plan modules、Record、已完成、未完成、关键决策、实际本地验证、下一目标、开始前必读内容、不要重复的工作和新对话接手提示词。

任务完成后删除 HANDOFF。历史 handoff 的有价值事实应进入对应 Record，而不是继续作为多个“实时交接”存在。

## 8. Task lifecycle

### Small task

分析 → 建立适当短期分支 → 修改 → 最小相关本地验证 → 本地 commit → Record → 本地合并 `main` → 核对集成结果（仅相关变化需要补测）→ push 已提交结果 → 本地删除已完成任务分支并同步远端删除 → 删除本任务曾创建的 HANDOFF。

普通技术问题自行处理，不把测试、提交、合并等常规步骤反复交回用户确认。

### Multi-stage task

整个任务默认沿用同一 Primary Workspace / 工作分支。

每个阶段：实现本阶段 → 最小相关本地验证 → 本地提交并 push 存储 → 方案实质变化时更新 Plan → 更新同一 Record → 更新 HANDOFF → 给出接手提示词 → **停止**。不等待已停用的远端 CI。

不得因为还有能力继续就跨越正式阶段边界。全部阶段完成并验证后，才执行最终集成与清理。

## 9. Minimal Context Routing

默认按需加载：

- Level 0：用户请求 + 当前工作区热路径规则 + 直接相关代码；
- Level 1：任务需要时增加 Plan entrypoint / HANDOFF；若为 Plan Bundle，先读 `index.md`，再仅读当前阶段所需模块；
- Level 2：续接或历史决策敏感时增加当前 Record / 必要历史；
- Level 3：仅触发时读取完整 Governance、明确指定 Skill、明确授权的 reference。

不得启动时全量扫描所有 Plans、Records、Skills 或 reference。Search 用于定位，不代表应全文加载所有命中项。

## 10. Skills loading

只有用户明确要求某 Skill，或当前正式 Plan 明确要求某 Skill 时，才加载。

- **Web / remote：** 以仓库 `skills` 工作空间作为可访问 Skill 源，按 `skills:SKILLS.md -> 对应 Skill` 加载。
- **Local / CLI / desktop：** 优先使用环境中已安装的本地 Skill；不要为了模仿 Web 流程而绕读 `skills` 分支。仅在本地缺失、用户明确要求仓库副本，或正式 Plan 明确锁定仓库版本时读取 `skills` 工作空间。

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

### Web / remote (inactive)

当前远端仅承担存储，不主动使用 Web / remote Agent、Actions 或远端自动整理。`WEB-PERSISTENT-PROMPT.md` 明示该状态；只有用户另行明确授权远端执行时才使用实际可用能力。不得把远端存储成功当作本地验证通过，也不得自动恢复 Actions。

### Local / CLI

使用当前工作区 `AGENTS.md`。开发、验证、提交、合并与清理由本地 Git、文件系统、搜索、项目脚本和独立 worktree完成；GitHub API 只在存储管理/配置核查确有必要时使用。保护已有 dirty changes，不为模仿 Web 流程而绕远程 API 或 `skills` 分支。

`CLAUDE.md` 只作为 Claude Code 薄入口，不复制第二套 Governance。

### Minimal relevant validation

- 根据实际改动与风险选择最小充分的本地检查；优先针对性静态检查、单元/集成测试、浏览器自动化或模拟器。不默认全量 lint/test/build，不默认 APK/Docker 构建或跨设备矩阵。
- 已通过且未受后续相关变化影响的检查不重复；本地合并仅引入已验证相同内容时核对 Git/差异即可，冲突解决或新变化才补相关验证。
- 尽可能避免人工实机验证。只有关键验收确实依赖自动化与当前本地环境无法取得的真实设备证据时，说明具体缺口、已尝试的替代方式与最小人工动作；不将人工实机设为常规阶段门槛。
- 文档/治理/目录整理只验证对应内容、链接/路径、Git 注册和同步状态，不因此运行产品全量测试或实机验证。
- 仅报告实际执行的检查；自动化替代不能伪造设备证据，也不能删除明确的产品质量、生产权限或数据保护要求。

## 13. Stop conditions

### Governance Stop

无论环境能力如何，都必须在正式多阶段任务的当前阶段结束时停止并完成 Record/HANDOFF。

### Environment Stop

仅当下一步确实依赖自动化与当前环境无法取得的关键设备/UI 证据，或用户专属 Secret/权限/登录时暂停。先完成可独立推进的工程工作；不因已停用的 CI 或惯例人工实机检查暂停。

普通代码错误、测试失败、workflow 问题、merge conflict 或常规实现选择应自行处理。

## 13.1 API 测试执行规则

2026-10-09 用户最新指令：测试 API 的硬限制只有 **每日 2000 次调用、20 RPM**。本节是仓库 API 测试限制的唯一权威，覆盖旧 Plan、Record、HANDOFF 和测试配置中的更严限制。

- 两个限制由发送端自动统一执行，实际 retry、judge、诊断等调用均计数；20 RPM 通过排队等待处理，日额度用尽等待恢复。日重置规则未知时可用滚动 24 小时计数；已过期调用不再占用当日额度，历史累计不是终身上限。
- 删除累计 1000 次、每批 60/72 次、Step 12/18/24 次、token 总额和输出 token 数等额外测试配额。调用估算、历史预算、旧 breach/stop/claim 只作记录，不构成继续测试的准入条件。输出与 timeout 按实际任务和 Provider 能力配置，不作为额外 API 配额。
- 已授权任务内的必要测试、诊断、修复后复测沿现有测试连接继续，不逐轮申请次数许可，不另建 scope/claim 审批。发送端正常计数与保存结果即可；不要求每轮人工重建账本、逐项 hash 审计或重复证明未触限。token/费用统计随实际结果汇报，不为历史建议超额重复停工或申请确认。
- 普通测试失败、校准输出格式错误、偶发网络错误和旧错误窗口不能成为交接终点；定位根因、修复并做必要复测。真实持续不可用的连接按实际错误等待或处理；仅在确实需要用户登录、权限、Provider 配置等外部条件时请求用户介入，不为旧 stop 记录申请次数豁免。
- 验收仍依据真实结果：保留失败与缺失，不伪造通过、不降低质量标准、不泄露独立验收材料；必要工程复测不等于反复追分。生产权限、数据保护及正式阶段边界沿原 Governance，不把产品生产预算套成测试 API 限额。

## 14. Completion criteria

产品短期任务完成：实现、最小相关本地验证、Record、必要 Plan 更新、本地合并并核对 `main`、远端同步已提交结果、删除已完成临时分支与本任务 live HANDOFF；不删除其它活跃任务的 HANDOFF。

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
