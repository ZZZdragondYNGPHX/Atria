# Atria 产品源码

完整治理见 `docs:README.md`，企划与结果归 `docs:plans/**` / `records/**`；恢复状态按真实 Git 核对。

- 使用当前任务的语义分支；保护无关未提交内容。
- 复用现有服务、状态与持久层，保留数据/配置兼容性；产品名称为 Atria。
- `default/skills/**` 与 `plugins/**` 是产品资产；独立 docs/package/plugin/skills 工作空间不合入 main。
- 本地开发与交付；每阶段及完成时只做最小相关本地验证。远端只保存提交，不等待 Actions 或 PR。
- API 测试只限每日 2000 次、20 RPM，自动计数和排队；必要诊断、修复和复测持续推进，不逐轮申请授权。
- 测试配额与执行细则只归 `docs:README.md` §12 / §13.1；旧 Plan、Record、HANDOFF 或配置不新增审批和停工条件。
- 按任务需要读取相关代码、Plan 模块和 Record；Skill 使用当前环境的相关版本。
- 外部 reference 按对应任务范围读取或更新；凭证、私有数据、缓存及构建产物不提交。
