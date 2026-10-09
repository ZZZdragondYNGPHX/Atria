# Local Agent Instructions — docs

本工作空间只负责 Repository Governance 与项目文档，不承载产品实现。

## Responsibilities

- `README.md`：完整 Repository Governance 与路由；
- `plans/**`：设计与实施方案；大型项目使用以 `index.md` 为入口的 Plan Bundle；
- `records/**`：永久实施历史；
- `HANDOFF.md`：最多一个、仅当前任务使用的实时交接；
- `WEB-PERSISTENT-PROMPT.md`：Web 执行适配模板；
- `templates/**`：文档模板。

## Fast path

- 本地环境优先直接使用本地 Git、文件系统和搜索。
- 本地负责开发、最小相关验证、提交、合并和清理；远端仅保存提交。Actions 全部停用，不等待 CI，不将 PR 设为前置条件。
- 工作树布局和自动化优先验证统一遵循 `README.md` §3.1 / §12；不默认全量测试/构建或人工实机检查，不重复未受新变化影响的已通过检查。
- 只读其它分支时优先使用跨分支读取，不为阅读反复切换工作区。
- Plan Bundle 先读 `index.md`，再只读当前阶段明确需要的模块；不要为了“完整”一次加载整个 Bundle。
- 同时修改实现与 docs 时优先独立 docs worktree。
- 权威 live HANDOFF 为 `docs:HANDOFF.md`，不是辅助文档任务分支中的旧副本；涉及当前路由的实际工作轮结束后刷新它。
- 多阶段任务每个阶段更新同一 Record。
- 任务全部完成后删除 live HANDOFF。
- 保护无关 dirty changes。
- API 测试仅每日 2000 次调用 / 20 RPM；详细规则归 `README.md` §13.1。清理旧额外配额及逐轮许可/人工额度审计，必要测试和修复复测持续推进。
- 只加载当前任务真正需要的 Plan/Record/历史。

任何治理敏感变更前读取本分支 `README.md`。
