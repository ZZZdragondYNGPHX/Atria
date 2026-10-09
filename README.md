# Atria Repository Governance

**Governance version: 1.4**

本文件是 `ZZZdragondYNGPHX/Atria` 的完整 Repository Governance 权威入口。它规定最终仓库状态与任务生命周期，不绑定 Web、CLI、桌面 Agent 或人工开发者的具体执行工具。

## 1. Authority

“应该怎么做”的优先级：

1. 用户当前明确指令；
2. 本 Governance；
3. 当前已批准 Plan；
4. 当前执行环境 Adapter；
5. 默认行为。

“仓库实际上是什么状态”的优先级：

1. 真实本地 Git 状态；远端 refs 只证明已同步的存储状态；
2. 当前 Record 中有版本与验证依据的实际结果；
3. HANDOFF 的中断快照；
4. Plan。

文档与真实仓库冲突时，以真实状态为准并修正文档，不为迎合旧文档而回退实现。

执行规则按职责集中：任务推进归 §8，交接归 §7，真实阻塞归 §13，验证与环境归 §12，API 测试限制归 §13.1。Plan 只定义设计、依赖与验收，Record 保存事实，HANDOFF 保存用户要求中断时的恢复快照；它们不另建执行许可或停止规则。

同一条详细规则只保留一个权威来源，其它文档通过链接引用；局部确有差异时只写差异和适用范围。规则直接描述要求，不在正文中添加旧对话背书。历史决定、Record 和旧 HANDOFF 不构成当前指令；与当前规则冲突时修正生效入口，保留历史事实。

## 2. Branch model

### `main`

正式、稳定的 Atria 产品源码主线。普通产品开发使用短期语义分支，例如 `feat/*`、`fix/*`、`refactor/*`；需要其它前缀时必须有清晰任务语义。

产品任务的集成与清理见 §14。

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

- 目录表达职责与稳定任务归属；阶段与实际进度写入 Plan / Record，不随阶段反复改目录名。
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

`docs:HANDOFF.md` 仅用于用户明确要求中断、换设备续接或写交接时的恢复快照，全仓库同时最多一个有效 HANDOFF。任务分阶段、一次实验退出、验证失败、提交完成或 Agent 自行结束工作轮都不触发创建或刷新；正常进度归同一 Record。

用户要求交接时记录 Task ID、Primary Workspace、实际分支/HEAD、阶段、Plan entrypoint / 当前所需模块、Record、已完成与未完成、关键决策、实际验证及下一行动。只有此时生成新对话接手提示词。已有 HANDOFF 恢复后从真实 Git 和当前 Plan/Record 推进，旧“到此停止”等指令不恢复为执行限制。

本任务完成或交接快照已不再需要时删除它；有价值的事实归入 Record，不创建历史交接副本。

## 8. Task lifecycle

### Continuous execution

AI 持续推进已授权任务直到整体完成。阶段只是拆解工作、安排依赖与验收的工具，不是默认暂停边界。通过当前阶段后记录结果、读取下一阶段所需模块并继续，不等待逐阶段“继续”许可。未批准的任务范围或影响冻结设计的实质变更仍须讨论，不把普通工程选择变成新审批。

验证未通过时，保留失败证据，分析根因，尝试有依据的替代方法，修复实现、工具、环境或评价来源问题并做相关复测。仅复核“确实未通过”、一轮实验结束或一次修复无效，都不算任务完成，也不能转交下一轮 Agent。没有新变化时反复运行相同有效负面评分不是修复；继续寻找可验证的改进，不降低验收标准或伪造结果。

### Implementation and delivery

小任务：分析 → 建适当短期分支 → 实现与相关验证 → 本地 commit → Record → 本地集成并核对 `main` → push 存储 → 清理已完成分支。

多阶段任务默认沿用同一 Primary Workspace / 工作分支。每阶段实现、验证、持久化并更新同一 Record；方案实质变化才更新 Plan。阶段检查通过后继续，最终或已约定的交付组验收通过后执行集成与清理。任务完成条件见 §14。

## 9. Minimal Context Routing

默认按需加载：

- Level 0：用户请求 + 当前工作区热路径规则 + 直接相关代码；
- Level 1：任务需要时增加 Plan entrypoint；用户中断后恢复才读取已有 HANDOFF。Plan Bundle 先读 `index.md`，再读当前阶段所需模块；
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

用户明确要求中断时按其要求暂停。确实需要用户专属权限、Secret/登录、无法取得的关键外部证据，或超出已授权范围的实质设计取舍时，先完成所有可独立推进的工作，再说明具体阻塞、已尝试的方法、尚缺证据及最小用户动作。真实阻塞不自动触发交接，交接仍按 §7。

普通代码错误、测试失败、临时网络故障、merge conflict、常规实现选择及文档中的旧停止记录，按 §8 继续处理。测试 runner 停止某次实验、产品预算或发布 gate 拒绝某次操作，只表示该操作未通过；AI 仍应继续诊断和工程工作，不能把操作拒绝当作整个任务结束。

## 13.1 API 测试执行规则

测试 API 的硬限制只有 **每日 2000 次调用、20 RPM**。本节是仓库 API 测试限制的唯一权威，覆盖旧 Plan、Record、HANDOFF 和测试配置中的更严限制。

- 两个限制由发送端自动统一执行，实际 retry、judge、诊断等调用均计数；20 RPM 通过排队等待处理，日额度用尽等待恢复。日重置规则未知时可用滚动 24 小时计数；已过期调用不再占用当日额度，历史累计不是终身上限。
- 删除累计 1000 次、每批 60/72 次、Step 12/18/24 次、token 总额和输出 token 数等额外测试配额。调用估算、历史预算、旧 breach/stop/claim 只作记录，不构成继续测试的准入条件。输出与 timeout 按实际任务和 Provider 能力配置，不作为额外 API 配额。
- 已授权任务内的必要测试、诊断、修复后复测沿现有测试连接继续，不逐轮申请次数许可，不另建 scope/claim 审批。发送端正常计数与保存结果即可；不要求每轮人工重建账本、逐项 hash 审计或重复证明未触限。token/费用统计随实际结果汇报，不为历史建议超额重复停工或申请确认。
- 普通测试失败、校准输出格式错误、偶发网络错误和旧错误窗口不能成为交接终点；定位根因、修复并做必要复测。真实持续不可用的连接按实际错误等待或处理；仅在确实需要用户登录、权限、Provider 配置等外部条件时请求用户介入，不为旧 stop 记录申请次数豁免。
- 验收仍依据真实结果：保留失败与缺失，不伪造通过、不降低质量标准、不泄露独立验收材料；必要工程复测不等于反复追分。生产权限与数据保护沿产品契约，不把产品生产预算套成测试 API 限额。

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
