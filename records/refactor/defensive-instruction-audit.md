# Defensive Programming Instruction Audit

- Task ID: `refactor/defensive-instruction-audit`
- Primary Workspace: `docs`；产品入口通过临时 `refactor/defensive-instruction-audit` 修改并集成 main。
- Status: Complete
- Date: 2026-10-16
- Start HEAD: main `695acf3bc`；docs `30a161073`。执行期间保留其它任务已提交的 docs `978e02558` / `4d46be677`。
- Product tested commit: `b983846d4`；main integration `ec1ed7b548057d3135382a10e7d5cace7587cd36`（树与已验证任务提交相同）。

## 范围与继承

按 Governance Authority → 工作区 AGENTS → CLAUDE/Copilot/任务模板 → 当前 Plan 入口及所需模块定位。检查 main README、贡献/维护说明、三语言开发指南、测试 README/Agent Brief、原生 authoring Skills/脚手架与相关源码注释；核对 package/plugin/skills 工作区入口。现有 CLAUDE 薄入口可沿继承生效，无需复制新规则。未扫描 reference 或遍历历史 Record；已完成 Plan 只用于核对入口状态与现有契约，不把历史验收重开。

main 没有 `.github/workflows/`；现有 CI 说明已明确停用 Actions，没有发现当前覆盖率门槛或逐次改动必须新增测试的 CI 指令。

## 删除与改写

- 删除 main AGENTS、贡献指南及新任务模板中的无条件兼容要求，统一引用 Governance §12.1。
- R8 旧立项稿删除默认 Compatibility Layer、保留 facade、兼容评审门槛、每拆分单元先补 contract test、全量 Node/多域回归和 correctness fallback 要求；按当前调用方和真实风险处理。清除该文件失效的专用/多份 handoff 路由。
- 旧 E2E 批量生成提示词从 161 行缩为 12 行：删除固定机器路径、并行 Agent/批次/用例数、每处磁盘操作都重启、强制 RP 长夹具和重复模板；保留隔离、清理及真实持久化语义。README 不再重复清单。
- Storage 新行为指南取消逐方法强制新增测试及无条件禁止 Mock；按重要持久化风险选择真实引擎证据。
- 活跃 V3 Plan 改为按行为复用证据，取消按设计项建 case、按目录/文件追加测试的暗示；不降低 Host/权限/费用/副作用合同。前端提示词不再要求为每个状态建立恢复机制。
- 测试 README 停止推荐旧 `live.mjs` 累计配额流程，改指当前 disposable consumers 与 Governance §13.1。旧消费者代码及历史实测事实未重写。
- 代码注释删去假设未来驱动升级、future-proof、just-in-case、为未知调用者保留导出或放宽断言的推理，准确描述现有行为。没有改实现、断言或新增测试。
- 修正三语言指南及 Copilot/维护入口中的阶段即停工/自动交接指令；Plan 索引更新已完成/实施中状态，避免重新触发旧兼容与测试义务。

## 修改位置

行号为本次提交内容中的新行号；跨分支路径按所属工作区解释。

| 文件 | 修改行 |
| --- | --- |
| `main:.github/copilot-instructions.md` | 7, 9 |
| `main:AGENTS.md` | 6 |
| `main:CONTRIBUTING.md` | 12, 16 |
| `main:FORK_MAINTENANCE.md` | 21, 37 |
| `main:NEW_BUG_PROMPT.md` | 9, 14 |
| `main:NEW_FEATURE_PROMPT.md` | 11 |
| `main:README.md` | 24 |
| `main:docs/development/contributing.md` | 87, 150 |
| `main:docs/zh-CN/development/contributing.md` | 87, 150 |
| `main:docs/zh-TW/development/contributing.md` | 87, 150 |
| `main:public/scripts/slash-commands.js` | 3634, 3691 |
| `main:src/endpoints/users-private.js` | 771 |
| `main:src/storage/README.md` | 39 |
| `main:src/storage/engines/mysql-engine-transaction.js` | 24, 95 |
| `main:src/storage/engines/mysql-engine.js` | 270 |
| `main:src/storage/engines/postgres-engine-transaction.js` | 26, 106 |
| `main:src/storage/engines/postgres-engine.js` | 220 |
| `main:tests/agent-intelligence/README.md` | 284, 297, 300, 310 |
| `main:tests/character-presets/ctx-dispatch.test.js` | 34 |
| `main:tests/e2e/AGENT_BRIEF.md` | 1, 3, 5, 12 |
| `main:tests/e2e/README.md` | 70 |
| `main:tests/iteration-library/storage/target-registry-dual-lorebook.test.js` | 43 |
| `main:tests/orch-iteration/task-messages-toolcall-roundtrip.test.js` | 511 |
| `main:tests/skills-ui/playwright/skill-manager-flow.spec.js` | 106 |
| `main:tests/skills/integration-smoke.test.js` | 61 |
| `docs:README.md` | 3, 277 |
| `docs:plans/README.md` | 17 |
| `docs:plans/architecture/atria-frontend-audit/claude-code-frontend-prompt.md` | 104 |
| `docs:plans/refactor/README.md` | 5 |
| `docs:plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md` | 114 |
| `docs:plans/refactor/atria-native-orchestration-v3/implementation-plan.md` | 32, 118 |
| `docs:plans/refactor/atria-platform-architecture-modernization.md` | 24, 28, 32, 86, 119, 169, 170, 180, 182, 184, 235, 287, 305, 348, 381, 461, 467, 485, 487, 494 |
| `docs:templates/PLAN-BUNDLE/index.md` | 44 |
| `docs:templates/PLAN.md` | 19 |

## 保留与统一原则

唯一简明规则为 Governance §12.1 的五条：YAGNI/KISS/DRY、Dev 不默认兼容、实际失败边界集中处理、按风险/业务价值复用与补足测试、保留必要安全与数据约束。其它入口只引用，不复制第二套。

保留认证/权限、不可信输入验证、CAS/并发版本检查、持久化一致性、异步间隙后的授权复验、外部未知提交只观察与真实费用记录。产品质量来源与权限合同不等同于开发代理独立审查流程；本次未引入审查代理或额外审查门槛。

历史 Record 和另一活跃任务 HANDOFF 原文未改；产品文档中描述现有 alias、fallback、不可变副本或已支持互换格式的事实继续保留。旧措辞仍可能存在于历史资料，但按 Authority 不构成新增测试或兼容许可。

## 实际验证与交付

- 两工作区 `git diff --check` 通过；23 个修改 Markdown 的代码围栏和 16 个新增相对链接通过检查（不含本 Record）。
- 11 个 JavaScript 文件通过 `node --check`；使用现有 TypeScript 解析/移除注释后比较执行 token，前后相同。未运行产品全量测试、浏览器、构建或 API 测试；本次没有运行行为变更。
- 本地 main 合并无冲突；与已验证任务树相同。docs 独立提交，不将 main 合入 docs。远端同步与临时分支/工作树清理由本任务执行，结果可从最终 Git refs 核对。

## 用户追加：同步当前开发分支

用户明确选择“同步规范整改，保留开发工作”。只迁移本次规范与注释差异，不合入 main 的产品功能，不删除开发分支或工作树。

| 当前开发分支 | 同步提交 | 文件数 |
| --- | --- | --- |
| `refactor/atria-native-orchestration-v3` | `50dffc4c6` | 25 |
| `feat/native-visual-generation-deepening` | `dd99c57ea` | 25 |
| `feat/atria-project-skill-routing` | `eb18fa12a` | 24 |
| `refactor/test-suite-defensive-cleanup` | `c9e13f33a` | 21 |

项目 Skill 分支保留自己的 AGENTS 路由；缺失的 Agent Intelligence README 不创建。测试清理分支的已删除 Brief/浏览器测试不恢复，正在删除的旧 roundtrip 测试不触碰，已重写的 E2E README 保留其原生产品说明。其余 31 个原未提交路径与原暂存状态在本次同步前后相同；开发工作继续保留。

四个提交的差异空白、Markdown 围栏及九个新增相对链接检查通过；42 处 JavaScript 注释同步通过语法与去注释执行 token 一致性检查，未引入运行行为或断言变更。四分支分别推送同名远端，不作为产品实现集成回 main。

## 用户更正：直接删除验证提示词

用户要求删除所有面向开发 AI 的验证提示，而非保留“最小相关验证”或测试复用建议。本节是后续改动事实；前述保留策略是上一轮历史结果。

删除 Governance 的验证策略/测试建议、任务和 PR 模板的验证步骤/报告栏、E2E Agent Brief、V3 未来测试矩阵/阶段验证门槛、Prompt 深化的未来验证建议，以及 Atria 自有前端 Skill 的验证流程。API 资源限额、隐私资料保留规则、运行时权限/输入校验/持久化契约和既有结果事实不变。没有新增替代验证规范。

产品文字提交 `09f5bc18f`，main 集成 `5618cd8fa`；package `11d4e7a1b`、plugin `e84727e6f`、skills `44f7b806d` 分别在所属工作空间提交。开发分支同步如下，原开发工作与未提交内容保留：

- `refactor/atria-native-orchestration-v3`：`5a95c7461`。
- `feat/native-visual-generation-deepening`：`00edac0a3`。
- `feat/atria-project-skill-routing`：`b0005b68d`。
- `refactor/test-suite-defensive-cleanup`：`d7d5002b3`。

本轮仅修改或删除 Markdown；差异空白检查通过。实际历史 Record 只追加本节，另一任务 HANDOFF 未改。
