# Plugin Workspace

这是 Atria 的长期独立工具资产工作空间。

一个独立工具使用一个顶级目录，例如 MCP、validator、preview/debug 工具。工具内部结构由工具自身决定。

规则：

- 不放置 Atria 产品源码或游戏/Package 资产；
- 不为了获得产品源码而 merge `main`；
- 不把 `main:plugins/**` 当成独立工具搬到这里；那是 Atria 产品运行时/产品插件源码；
- 需要 Atria 集成验证时使用独立产品工作树、运行实例或测试环境；
- 复杂/多阶段工具任务使用 `docs:plans/plugin/**` 与 `docs:records/plugin/**`。

Phase 3 仓库规范化迁移没有发现需要从现有产品树抽离的独立工具，因此当前没有虚构工具目录。
