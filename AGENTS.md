# Atria 产品源码

完整治理见本地 `Atria-worktrees/docs/README.md`，企划与结果归该目录的 `plans/**` / `records/**`；

- 在 `Atria-worktrees/tasks/` 的独立本地仓库使用任务语义分支；保护无关未提交内容。完成后集成至 `atria/main`。
- 复用现有服务、状态与持久层；实现精简、兼容边界和最小相关验证见本地 Governance §12.1–§12.2；产品名称为 Atria。
- `default/skills/**` 与 `plugins/**` 是产品资产；本地 `docs/`、`package/`、`package-releases/` 和 `plugin/` 各自独立，不能合入产品仓库。仓库开发使用本地 Skill。
- 只有稳定产品库 `atria/` 可连接并推送 Atria 远端，远端只保留 `main`；不等待 Actions 或 PR。
- 按任务需要读取相关代码、Plan 模块和 Record；Skill 使用当前环境的相关版本。
- 外部 reference 按对应任务范围读取或更新；凭证、私有数据、缓存及构建产物不提交。
- 测试代码、测试配置与专用测试资产仅本地保留，不提交到本仓库任何分支；只有用户明确要求时才上传至用户指定的专用测试仓库。
