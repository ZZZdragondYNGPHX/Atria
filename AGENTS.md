# Local Agent Instructions — package

本工作空间只承载游戏 / Atria Package 资产，不是产品源码树。

## Fast path

- 只在目标游戏的顶级目录内工作，除非任务明确跨多个游戏。
- Package 长期资产直接属于 `package` 工作空间，不因为普通游戏开发另建 `feat/*`。
- 不将 `main` merge 进本工作空间。
- 历史 `.atria` 输出保存在 `<game>/releases/`，默认不覆盖或删除旧版本。
- 需要产品侧兼容验证时使用独立 `main` 工作树、运行实例或测试环境。
- 本地环境优先直接使用 Git、文件系统和 Package 验证工具。
- 用户或正式 Plan 要求 Skill 时，本地/CLI 优先使用环境中已安装的 Skill；不要为了模仿 Web 流程而绕读 `skills` 分支。仅在本地缺失、用户明确要求仓库副本，或 Plan 明确锁定仓库版本时读取 `skills:SKILLS.md`。
- 保护无关 dirty changes。
- 续接/多阶段任务只读对应 HANDOFF、Package Plan、Package Record。

治理敏感操作读取 `docs:README.md`。
