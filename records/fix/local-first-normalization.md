# Local-first normalization — Record

- Task ID: `local-first-normalization`
- Primary Workspace: `docs`
- Updated: 2026-10-09
- Status: Complete
- Plan: 本轮多轮讨论明确确认的范围；本任务一次闭环，不另建 Plan/HANDOFF。

## 已批准范围

远端仅保存已提交结果。彻底停用 Actions（包括手动触发、自动测试、APK/Docker 构建、发布及分支清理），移除当前工作流，历史由 Git 保留。优先自动化，仅在关键证据确实不能替代时提出最小人工实机需求。规范辅助工作树目录，保留无关 dirty、草稿、未合并/活跃任务及历史，不强推，不触碰未经授权的 reference。

## 本地实施

- Start HEAD: `main@f40824a93`、`docs@b39580f12`、`package@a13bce997`、`plugin@792a87286`。
- `main@cfbe51eda`：移除 29 个 Actions 工作流，统一 Agent/Copilot/PR 入口、维护说明与英/简中/繁中贡献指南。产品逻辑未改变。
- `package@6da5fd993` / `plugin@613285b75`：本地执行入口统一；长期工作空间仍独立，没有 merge main。
- `feat/agent-intelligence-plan@a86ac9520`：同步已提交治理/模板；原五份未提交企划文件不覆盖、不提交。改为对应同名远端存储分支，避免继续误跟踪 origin/docs。
- `feat/agent-intelligence-runtime@4638b1f9c`：整理时观察到的 HEAD，保留并行工程提交，仅追加执行入口/workflow 整理；
- `feat/atria-project-skill-routing@c99a601f3`：保留未合并 Skill 任务，同步治理入口和 workflow 清理，保留该分支的 Frontend Skill routing 与自身产品文档，不将 main 后续产品能力说明搬入旧任务。

## 工作树整理

- 主目录 `Atria/` 保留，辅助集中到同级 `Atria-worktrees/`。
- 长期 docs 从旧任务命名目录迁到 `docs/`；Runtime 实现和企划辅助分别迁到 `tasks/agent-intelligence-runtime/source` 与 `docs`。
- 按本次治理维护实际建立 `package/`、`plugin/`；为未合并 Skill 任务建立 `tasks/atria-project-skill-routing/source`。
- 清理旧的 detached F2 docs 工作树：HEAD `0e08f95f9` 已包含在 docs，工作树无修改、未跟踪或忽略内容。
- 整理期间并行任务新建 `tasks/agent-intelligence-runtime/docs-results` detached 辅助工作树；保留，不把它当成已结束的旧工作树删除，也不改写其快照。
- 修复 Runtime 本地 `node_modules/eslint-plugin-atria` 指向旧目录的 junction；其它忽略依赖保留。

## 最终状态

- 本文件状态/格式收尾提交随后同步 docs。
- 本次 `chore/local-first-normalization` 已在本地 fast-forward 集成 main 并删除；没有创建需要删除的同名远端临时分支。
- 企划分支已改为跟踪 `origin/feat/agent-intelligence-plan`；清除了两条远端已删除任务的陈旧 tracking refs。
- Actions 再次确认为 disabled，rulesets 为空，push 没有启动未完成的 Actions run。
- 八份原 dirty/草稿保留，其它活跃/未合并分支和并行 docs-results 工作树保留；Runtime live HANDOFF 继续承担原任务路由。
- 整理记录索引首次写入引入了 CRLF；
- Runtime 在整理期间持续推进；
