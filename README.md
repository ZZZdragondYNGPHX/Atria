# Atria Repository Governance

**Governance version: 2.0**

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
2. 当前 Record 中的实际结果；
3. HANDOFF 的中断快照；
4. Plan。

文档与真实仓库冲突时，以真实状态为准并修正文档，不为迎合旧文档而回退实现。

执行规则按职责集中：任务推进归 §8，交接归 §7，真实阻塞归 §13，实现精简归 §12.1，最小相关验证与运行时检查归 §12.2，API 调用配置归 §13.1。Plan 只定义设计与依赖，Record 保存事实；历史验证清单、测试数量、分层矩阵和旧对话背书不构成当前执行义务。

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

产品使用/开发文档与站点资产在 `main:docs/`；设计和实施历史只在本分支保留。阅读入口：[Plans](plans/README.md)、[Records](records/README.md)；用户要求中断时的恢复入口为存在的 `HANDOFF.md`。

### `package`

长期、独立的游戏 / Atria Package **发行包分支**。一个游戏一个顶级目录；仅提交 `<game>/releases/*.atria`、相应发行说明和必要的 Git LFS 属性。根目录可保留仓库说明、Agent 薄入口和 Git 配置文件。历史发行包默认保留且不覆盖。

游戏源码、构建脚本、原始素材、设计原型、测试及开发缓存只保留本地，不上传本仓库的任何远端分支或标签，也不借文档、补丁、备份引用上传。游戏方案和实际结果以不含源码的文档保存在 `docs`。本条不禁止 `main` 的 Atria 产品源码或 `plugin` 的独立工具源码。

发布从干净的 `package` checkout 复制已生成成品，不 merge 含源码的本地开发历史；不得为了获得产品源码而将 `main` merge 进 `package`。本地旧源码分支只供开发与恢复，不能强推、rebase 或合回发布分支。

旧文档的 `package:<game>/source`、`frontend`、`tools`、`media` 等路径仅作本地历史定位，不再是远端文件地址或上传指令。只有 `releases/` 仍从当前发布分支读取。

### `plugin`

长期、独立的开发工具工作空间。一个独立工具一个顶级目录。适用于 MCP、preview/debug 工具等，不用于承载 Atria 产品内置的 `main:plugins/**`。

不得为了产品集成而将 `main` merge 进 `plugin`；需要产品环境时使用独立产品工作树/运行实例。

### Repository-agent Skills

不维护或重建远端 `skills` 分支。仓库开发使用当前环境中相关的本地 Skill；产品 Runtime Skills（例如 `main:default/skills/**`）仍是 `main` 的产品资产，二者不可混同。

### `reference/<project>`

真实外部项目镜像/参考分支。

- “参考 <project>”只授权读取对应 reference；
- “更新 <project>”只授权同步对应 reference；
- 读取与更新权限相互独立；
- 一个 reference 的授权不扩展到其它 reference；
- 不向镜像强行注入 Atria 的 `AGENTS.md`、`CLAUDE.md` 或其它治理文件；
- 不在 reference 上开发 Atria 功能。

## 3. Long-lived workspace isolation

`docs`、`package`、`plugin` 是独立根工作空间；远端长期分支为 `main`、`docs`、`package`、`plugin`。

禁止为了方便执行：

- `main -> docs` merge；
- `main -> package` merge；
- `main -> plugin` merge；

跨工作空间需要内容时，应只迁移真正属于目标工作空间的资产，并保留清晰来源。

### 3.1 Local workspace layout

本地主源码目录保留 `Atria/`，辅助 Git 工作树集中到同级 `Atria-worktrees/`：

```text
Atria/                         # 稳定 main
Atria-worktrees/
├─ docs/                       # 长期治理与项目文档
├─ package/                    # 本地游戏开发目录，可沿用既有路径
├─ package-releases/           # 纯发行包 checkout，按需建立
├─ plugin/                     # 长期独立工具，按需建立
└─ tasks/
   └─ <task>/
      ├─ source/               # 任务实现
      └─ docs/                 # 需要隔离修改文档时才建立
```

- 目录表达职责与稳定任务归属；阶段与实际进度写入 Plan / Record，不随阶段反复改目录名。
- 只按实际任务需要建立工作树；迁移使用 `git worktree move`，核对 HEAD、未提交文件、草稿、忽略内容及相关路径/依赖链接。
- 机器绝对路径与本地映射只存在于本地配置，不提交到共享治理或资产中。
- 仅发布需要同步的分支；本地游戏源码分支没有远端发布职责。未提交内容仍只在本地，不能声称已备份。远端短期分支删除不代表本地开发内容可以删除。
- 清理工作树/分支前确认任务已完成且提交已集成；未合并、活跃或用途不明的保留。对 detached 工作树，须确认提交已包含在目标历史，且没有未提交、未跟踪或忽略内容。
- 不擅自强推覆盖历史；用户明确要求清理历史时，只重写指定范围并使用精确 lease 保护远端并发改动。不因目录整理读取或更新未经授权的 reference。

## 4. Task identity and Primary Workspace

一个实质任务应有稳定 Task ID，并且只能有一个 Primary Workspace。辅助工作空间只提供实现与资产信息，不为同一任务建立重复 Record。

稳定关联依靠：

`Task ID + 稳定文档路径 + 实现/资产 HEAD`。

docs 可以记录实现、Package、Plugin、Skill 与实际实现 HEAD；实现工作空间不要求反向记录当前 docs commit。历史 CI 证据可保留，不构成新的执行要求。

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

阶段记录通常包含：Stage、Start HEAD、End HEAD、状态、完成内容、关键决策、实际结果、已知限制与下一 checkpoint。

不得等最终阶段结束后再凭记忆补写早期阶段。

## 7. HANDOFF

`docs:HANDOFF.md` 仅用于用户明确要求中断、换设备续接或写交接时的恢复快照，全仓库同时最多一个有效 HANDOFF。任务分阶段、一次实验退出、提交完成或 Agent 自行结束工作轮都不触发创建或刷新；正常进度归同一 Record。

用户要求交接时记录 Task ID、Primary Workspace、实际分支/HEAD、阶段、Plan entrypoint / 当前所需模块、Record、已完成与未完成、关键决策、实际结果及下一行动。只有此时生成新对话接手提示词。已有 HANDOFF 恢复后从真实 Git 和当前 Plan/Record 推进，旧“到此停止”等指令不恢复为执行限制。

本任务完成或交接快照已不再需要时删除它；有价值的事实归入 Record，不创建历史交接副本。

## 8. Task lifecycle

### Continuous execution

AI 持续推进已授权任务直到整体完成。阶段只是拆解工作、安排依赖的工具，不是默认暂停边界。通过当前阶段后记录结果、读取下一阶段所需模块并继续，不等待逐阶段“继续”许可。未批准的任务范围或影响冻结设计的实质变更仍须讨论，不把普通工程选择变成新审批。

### Implementation and delivery

小任务：分析 → 建适当短期分支 → 实现 → 本地 commit → Record → 本地集成并核对 `main` → push 存储 → 清理已完成分支。

多阶段任务默认沿用同一 Primary Workspace / 工作分支。每阶段实现、持久化并更新同一 Record；方案实质变化才更新 Plan。整体完成后执行集成与清理。任务完成条件见 §14。

## 9. Minimal Context Routing

默认按需加载：

- Level 0：用户请求 + 当前工作区热路径规则 + 直接相关代码；
- Level 1：任务需要时增加 Plan entrypoint；用户中断后恢复才读取已有 HANDOFF。Plan Bundle 先读 `index.md`，再读当前阶段所需模块；
- Level 2：续接或历史决策敏感时增加当前 Record / 必要历史；
- Level 3：仅触发时读取完整 Governance、明确指定 Skill、明确授权的 reference。

不得启动时全量扫描所有 Plans、Records、Skills 或 reference。Search 用于定位，不代表应全文加载所有命中项。

## 10. Skills loading

按当前任务需要加载相关 Skill，优先使用已安装的本地版本；不为普通技术方法选择新增授权。

- 使用当前环境已安装且与任务相关的本地 Skill；缺失时采用已有工具，不为加载 Skill 重建仓库分支或引入远端执行流程。
- Skill 提供实现方法，不扩大任务范围，也不另设独立审查、多轮验收或必须运行的验证清单；执行约束统一见 §12.2。

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

当前远端仅承担存储，不主动使用 Web / remote Agent、Actions 或远端自动整理。`WEB-PERSISTENT-PROMPT.md` 明示该状态；只有用户另行明确授权远端执行时才使用实际可用能力。不得自动恢复 Actions。

### Local / CLI

使用当前工作区 `AGENTS.md`。开发、提交、合并与清理由本地 Git、文件系统、搜索、项目脚本和独立 worktree 完成；GitHub API 只在存储管理/配置核查确有必要时使用。保护已有 dirty changes，不为模仿 Web 流程而绕远程 API。

测试代码、测试配置与专用测试资产只保留本地，不提交到本仓库任何分支。只有用户明确要求上传测试时，才提交到用户指定的专用测试仓库；验证结论仍按任务记录在 Record，不在文档分支存放测试实现或测试资产。

`CLAUDE.md` 只作为 Claude Code 薄入口，不复制第二套 Governance。

### 12.1 Minimal implementation

- 默认 YAGNI、KISS、DRY：实现当前需求的最短清晰路径，复用现有权威；删除无用代码，不为假设调用方新增抽象、wrapper 或 adapter。
- Atria 处于 Dev 阶段，不默认承担旧版本、旧配置或旧接口兼容义务。只有当前明确支持的外部契约或本任务明确要求才保留兼容；可替换旧实现并同步真实调用方，不默认双轨、双读或 fallback。
- 错误处理针对实际接口可能发生的失败，在能处理或转译的边界集中完成；不添加仅捕获再原样抛出的层、不静默吞错，不为纯假设风险添加检查、重试或恢复链。确需 fallback 时说明触发条件和业务结果。

### 12.2 Minimal validation and runtime checks

**AI 开发验证：最小、相关、足够即可。**

- 根据本次改动及直接受影响行为选择最小检查。纯文档修改只核对改动和相关引用，不启动产品、构建、游戏、模型或浏览器验收。
- 不默认建立独立审查、review-only Agent、多轮交叉复审、逐项测试矩阵、固定用例数、覆盖率或取证流水线；用户在当前任务明确要求时才执行对应工作。
- 已通过且没有相关新改动的检查不重复。出现实际失败就定位和修正根因，只重测受影响项；不以“再保险”为由扩成全量套件、跨设备/数据库矩阵或长时模拟。
- 不为交付形式额外重建、解包、逐文件比对或计算 hash / SHA-256。只有本次任务确实改变打包、传输或内容身份，且必须解决相应问题时，才做一次直接相关检查。
- 只报告实际执行的检查及其结论；没有运行的不冒称通过，也不罗列与本次改动无关的“尚未验收”清单制造后续义务。功能实现与最小相关检查完成即交付，不再追加审查阶段。

**程序运行时：不需要的检查不做，必要检查在所属边界轻量完成。**

- 信任同一权威已接纳、未变化的内部数据；优先复用已有 ID、revision、不可变引用和变更信号。普通读取、渲染、每次行动或每轮世界推进，不重复遍历全世界、全历史、全包或素材库来证明自身正确。
- 不以防御为由增加整包 hash / SHA-256 重算、逐字段二次验证、深复制后再校验、重复序列化比较、镜像账本、通用兜底和层层重试。先删除重复工作，再处理实际瓶颈；不建设新的“验证框架”。
- 外部不可信输入、权限、破坏性操作、导入完整性和真正的写入冲突由既有边界负责，必要时验证一次；缓存/普通读取不重复付同一成本。取消、迟到结果、幂等和事务只在真实异步/副作用边界处理，不向所有函数铺开。
- hash 仅在实际需要的内容寻址、外部完整性、凭据或确定性算法中使用；游戏随机种子/ID 混合与整包防篡改扫描不是同一用途。采用已有摘要不等于每次重算。保留必要安全边界，不把本节误读为删除认证或静默接受损坏数据。

本节适用于 Atria 产品、游戏项目、独立工具及开发 Agent。Plan 的功能约束、Record 的历史数字、Skill 示例和旧执行提示不能另行恢复验证门槛或运行时防御层；其它文档只链接本节。

## 13. Stop conditions

用户明确要求中断时按其要求暂停。确实需要用户专属权限、Secret/登录、无法取得的关键外部证据，或超出已授权范围的实质设计取舍时，先完成所有可独立推进的工作，再说明具体阻塞、已尝试的方法、尚缺证据及最小用户动作。真实阻塞不自动触发交接，交接仍按 §7。

普通代码错误、测试失败、临时网络故障、merge conflict、常规实现选择及文档中的旧停止记录，按 §8 继续处理。测试 runner 停止某次实验、产品预算或发布 gate 拒绝某次操作，只表示该操作未通过；AI 仍应继续诊断和工程工作，不能把操作拒绝当作整个任务结束。

## 13.1 API 调用配置

API 的调用限制以用户当前明确提供的配置为准，由发送端统一记录实际调用；只对明确配置的额度或真实 Provider 限流排队，不自行增加每日调用或 RPM 硬上限。当前 API 未设置调用硬上限，历史配置中的每日 2000 次、20 RPM 不自动沿用到新配置；历史累计不作为终身上限。

开发私有资料仅长期保留当前 API 配置、有效窗口内的滚动限流状态与阶段摘要。请求/响应、完整上下文、逐次费用账本、fixture、诊断日志与截图用于临时工作空间，结束后清理；生产用户数据、Save 与产品运行费用持久化不适用此规则。

## 14. Completion criteria

产品短期任务完成：实现、Record、必要 Plan 更新、本地合并并核对 `main`、远端同步已提交结果、删除已完成临时分支与本任务 live HANDOFF；不删除其它活跃任务的 HANDOFF。

Package / Plugin 任务分别以发行成品或工具实现、对应 Record、必要发布/索引状态与 live HANDOFF 清理为准。游戏源码留本地；验证范围只按 §12.2，不把历史全量验收当作交付条件。

仓库迁移类任务只有在长期工作空间边界、reference 历史、文档生命周期、Web/Local Adapter、迁移资产完整性和临时迁移状态均完成后才算结束。

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
