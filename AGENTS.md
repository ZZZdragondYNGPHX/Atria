# Local Agent Instructions — package

本工作空间只承载游戏 / Atria Package 资产，不是产品源码树。

## Fast path

- 只在目标游戏的顶级目录内工作，除非任务明确跨多个游戏。
- Package 长期资产直接属于 `package` 工作空间，不因为普通游戏开发另建 `feat/*`。
- 不将 `main` merge 进本工作空间。
- 历史 `.atria` 输出保存在 `<game>/releases/`，默认不覆盖或删除旧版本。
- 需要产品侧兼容验证时使用独立 `main` 工作树、运行实例或测试环境。
- 本地环境优先直接使用 Git、文件系统和 Package 验证工具。
- 保护无关 dirty changes。
- 续接/多阶段任务只读对应 HANDOFF、Package Plan、Package Record。

治理敏感操作读取 `docs:README.md`。
