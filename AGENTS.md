# Local Agent Instructions — docs

本工作空间只负责 Repository Governance 与项目文档，不承载产品实现。

## Responsibilities

- `README.md`：完整 Repository Governance 与路由；
- `plans/**`：设计与实施方案；大型项目使用以 `index.md` 为入口的 Plan Bundle；
- `records/**`：永久实施历史；
- `HANDOFF.md`：用户中断时的恢复快照，生命周期见 `README.md` §7；
- `WEB-PERSISTENT-PROMPT.md`：Web 执行适配模板；
- `templates/**`：文档模板。

## Fast path

- 本地环境优先直接使用本地 Git、文件系统和搜索。
- 本地负责开发、最小相关验证、提交、合并和清理；远端仅保存提交。Actions 全部停用，不等待 CI，不将 PR 设为前置条件。
- 工作树布局、验证与 API 测试分别见 `README.md` §3.1 / §12 / §13.1。
- 只读其它分支时优先使用跨分支读取，不为阅读反复切换工作区。
- Plan Bundle 先读 `index.md`，再只读当前阶段明确需要的模块；不要为了“完整”一次加载整个 Bundle。
- 同时修改实现与 docs 时优先独立 docs worktree。
- 连续执行与结果记录见 `README.md` §8 / §6；交接和真实阻塞见 §7 / §13。执行恢复读取 `docs` 分支的正式 Plan / Record，辅助分支副本仅用于明确的设计编辑任务。
- 保护无关 dirty changes。
- 只加载当前任务真正需要的 Plan/Record/历史。

任何治理敏感变更前读取本分支 `README.md`。
