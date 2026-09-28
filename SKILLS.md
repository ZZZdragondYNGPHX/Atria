# Atria Repository-Agent Skills Index

本文件只负责路由 repository-agent Skills，不复制 Skill 正文。

## Loading rule

只有以下任一条件成立时才加载 Skill：

1. 用户明确要求该 Skill；
2. 当前正式 Plan 明确要求该 Skill。

加载顺序：

`SKILLS.md -> 指定 Skill 目录`

Skill 不得扩大任务范围，也不得覆盖用户指令、`docs:README.md` Governance 或正式 Plan。

## Active Skills

当前没有迁移或安装 repository-agent Skill。

特别说明：`main:default/skills/**` 是 Atria Runtime Skills / 产品资产，故意不列入本索引，也不迁移到 `skills` 工作空间。

## Adding a Skill

新增 Skill 时在此记录：

- 名称；
- 用途；
- 适用条件；
- 目录；
- 第三方来源仓库与原始路径（如适用）；
- upstream commit/tag/version；
- 是否有本地修改。
