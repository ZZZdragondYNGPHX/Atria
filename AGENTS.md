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
- 只读其它分支时优先使用跨分支读取，不为阅读反复切换工作区。
- Plan Bundle 先读 `index.md`，再只读当前阶段明确需要的模块；不要为了“完整”一次加载整个 Bundle。
- 同时修改实现与 docs 时优先独立 docs worktree。
- 一旦 live HANDOFF 存在，每个实际工作轮结束都刷新。
- 多阶段任务每个阶段更新同一 Record。
- 任务全部完成后删除 live HANDOFF。
- 保护无关 dirty changes。
- 只加载当前任务真正需要的 Plan/Record/历史。

任何治理敏感变更前读取本分支 `README.md`。
