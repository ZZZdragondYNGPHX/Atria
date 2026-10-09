# Local Agent Instructions — plugin

本工作空间只承载独立开发工具。

## Fast path

- 本地负责开发、最小相关验证、提交与清理；远端仅保存提交。Actions 全部停用，不等待 CI，不将 PR 设为前置条件。
- 工作树布局和自动化优先验证统一遵循 `docs:README.md` §3.1 / §12；不默认全量测试/构建或人工实机检查，不重复未受新变化影响的已通过检查。

- 只修改目标工具的顶级目录，除非任务明确跨工具。
- 不把工具实现写进 `main`，也不把产品源码复制进这里。
- 不将 `main` merge 进本工作空间。
- 需要产品集成时使用独立产品 worktree/runtime。
- 本地环境优先直接使用 Git、文件系统、搜索、测试和构建。
- 保护无关 dirty changes。
- 续接/多阶段任务只读对应 HANDOFF、Plugin Plan、Plugin Record。

治理敏感操作读取 `docs:README.md`。
