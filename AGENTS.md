# Atria 产品源码

完整治理见 `docs:README.md`，企划与结果归 `docs:plans/**` / `records/**`；恢复状态按真实 Git 核对。

- 使用当前任务的语义分支；保护无关未提交内容。
- 复用现有服务、状态与持久层；实现精简与兼容边界统一见 `docs:README.md` §12.1；产品名称为 Atria。
- `default/skills/**` 与 `plugins/**` 是产品资产；独立 docs/package/plugin/skills 工作空间不合入 main。
- 本地开发与交付。远端只保存提交，不等待 Actions 或 PR。
- 按任务需要读取相关代码、Plan 模块和 Record；Skill 使用当前环境的相关版本。
- 外部 reference 按对应任务范围读取或更新；凭证、私有数据、缓存及构建产物不提交。
