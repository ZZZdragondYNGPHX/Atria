# Local Agent Instructions — skills

本工作空间只承载 repository-agent AI Skill 资产。

## Fast path

- 只有任务确实需要 Skill 时才先读 `SKILLS.md`。
- 只加载用户明确指定或正式 Plan 明确要求的 Skill。
- 不“顺手”扫描所有 Skill。
- 第三方 Skill 保留来源仓库、原始路径、版本/commit 与本地修改元数据。
- 每个 Skill 保持独立顶级目录。
- 本地环境优先直接使用 Git 与文件系统。
- 保护无关 dirty changes。

修改 Skill 治理结构或全仓路由规则前读取 `docs:README.md`。
