# Local-first normalization — Record

- Task ID: `local-first-normalization`
- Primary Workspace: `docs`
- Updated: 2026-10-09
- Status: Complete
- Plan: 本轮多轮讨论明确确认的范围；本任务一次闭环，不另建 Plan/HANDOFF。

## 已批准范围

本地主导开发、最小相关验证、提交、合并与清理；远端仅保存已提交结果。彻底停用 Actions（包括手动触发、自动测试、APK/Docker 构建、发布及分支清理），移除当前工作流，历史由 Git 保留。优先自动化，仅在关键证据确实不能替代时提出最小人工实机需求。规范辅助工作树目录，保留无关 dirty、草稿、未合并/活跃任务及历史，不强推，不触碰未经授权的 reference。

## 本地实施

- Start HEAD: `main@f40824a93`、`docs@b39580f12`、`package@a13bce997`、`plugin@792a87286`。
- `main@cfbe51eda`：移除 29 个 Actions 工作流，统一 Agent/Copilot/PR 入口、维护说明与英/简中/繁中贡献指南。删除 P8 检查对被移除 workflow 的两个配置断言、namespace 检查中的旧 workflow 排除项，修正 Model/Prompt 维护说明；产品逻辑未改变。
- `docs@e3caee1af`：Governance 1.3，规范布局、本地生命周期、最小充分验证、远端停用状态和文档模板。当前 Runtime Plan 入口/验收模块补充共享执行规则，不降低质量/生产权限或正式阶段标准。
- `package@6da5fd993` / `plugin@613285b75`：本地执行入口统一；长期工作空间仍独立，没有 merge main。
- `feat/agent-intelligence-plan@a86ac9520`：同步已提交治理/模板；原五份未提交企划文件不覆盖、不提交。改为对应同名远端存储分支，避免继续误跟踪 origin/docs。
- `feat/agent-intelligence-runtime@4638b1f9c`：整理时观察到的 HEAD，保留并行工程提交，仅追加执行入口/workflow 整理；未将 Runtime 集成 main，未执行或宣称新的 F2 验收。
- `feat/atria-project-skill-routing@c99a601f3`：保留未合并 Skill 任务，同步治理入口和 workflow 清理，保留该分支的 Frontend Skill routing 与自身产品文档，不将 main 后续产品能力说明搬入旧任务。

## 工作树整理

- 主目录 `Atria/` 保留，辅助集中到同级 `Atria-worktrees/`。
- 长期 docs 从旧任务命名目录迁到 `docs/`；Runtime 实现和企划辅助分别迁到 `tasks/agent-intelligence-runtime/source` 与 `docs`。
- 按本次治理维护实际建立 `package/`、`plugin/`；为未合并 Skill 任务建立 `tasks/atria-project-skill-routing/source`。
- 清理旧的 detached F2 docs 工作树：HEAD `0e08f95f9` 已包含在 docs，工作树无修改、未跟踪或忽略内容。
- 整理期间并行任务新建 `tasks/agent-intelligence-runtime/docs-results` detached 辅助工作树；保留，不把它当成已结束的旧工作树删除，也不改写其快照。
- 修复 Runtime 本地 `node_modules/eslint-plugin-atria` 指向旧目录的 junction；其它忽略依赖保留。
- 机器绝对路径、工作区映射和迁移 SHA-256 证据只存放于本地 `.git/atria-local-workspaces.json` / `.git/atria-workspace-migration.json`，未提交。

## 实际验证

- 本地工作树注册、实际目录/HEAD 和归属核对；迁移前后状态比较。五份 dirty 企划和三份未跟踪草稿共八份文件 SHA-256 保持。
- 本次改动范围 `git diff --check` / staged check；原企划五份 CRLF dirty 独立保留，不替用户规范其字节内容，也不将它们的已有换行差异算为本次通过项。
- `node --check scripts/check-p8-model-prompt-integration.mjs` 与 Git Bash `bash -n scripts/check-atria-namespace.sh` 通过；不运行 P8 启动的全仓库 guards，因为本次只清除废弃 CI 配置依赖。
- 本地 main fast-forward 后与已验证整理分支树一致；集成没有冲突或新变化，不重复产品测试。
- 当前有效入口没有旧 `handoff/latest-handoff.md`、必要 CI、workflow 文件依赖等冲突路由；历史 Record/结果继续保留。
- GitHub API 确认 Actions `enabled=false`；仓库各分支无保护，rulesets 为空，因此无强制 CI 合并要求需要移除。无开放 PR、无未完成 Actions run。
- 未执行产品全量测试、build、API 调用、浏览器/UI、Android/人工实机验证；这些不属于本次整理的相关验证。

## 最终状态

- 七条已提交工作分支已推送并逐项核对同名远端 refs；本文件状态/格式收尾提交随后同步 docs。
- 本次 `chore/local-first-normalization` 已在本地 fast-forward 集成 main 并删除；没有创建需要删除的同名远端临时分支。
- 企划分支已改为跟踪 `origin/feat/agent-intelligence-plan`；清除了两条远端已删除任务的陈旧 tracking refs。
- Actions 再次确认为 disabled，rulesets 为空，push 没有启动未完成的 Actions run。
- 八份原 dirty/草稿保留，其它活跃/未合并分支和并行 docs-results 工作树保留；Runtime live HANDOFF 继续承担原任务路由。
- 整理记录索引首次写入引入了 CRLF；本次收尾改回 LF，并重新验证最终相关差异，不修改原企划 CRLF 文件。
- Runtime 在整理期间持续推进；这里的实现 HEAD 是观察记录，不能当作后续 F2 已验收证明。
