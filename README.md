# Package Releases

`package` 是 Atria 游戏发行包分支，不是游戏源码工作空间。完整规则见 `docs:README.md` §2 `package`。

每个项目只保留 `releases/` 中的版本化 `.atria`、发行说明和必要的 Git LFS 属性；根目录仅保留仓库说明、Agent 入口和 Git 配置文件。

| 项目 | 发行目录 | 现有发行包 |
| --- | --- | --- |
| Doupo Living World | [releases](doupo-living-world/releases/README.md) | 14 |
| Foglight Inn | [releases](foglight-inn/releases/README.md) | 4 |
| Original Occult Western Fantasy Game | [releases](original-occult-western-fantasy-game/releases/README.md) | 4 |
| Native Heavy-Frontend Reference | [releases](native-heavy-frontend-reference/releases/README.md) | 尚无已发布成品，仅保留发行目录说明 |

## 获取发行包

部分大包使用 Git LFS。克隆本分支后运行 `git lfs pull`，不要把 LFS 指针文件当作发行包导入。

## 开发与发布

源码、构建脚本、原始素材、设计原型和测试留在本地开发目录；只将已生成的发行包和发行说明复制到本分支。历史版本不覆盖，版本新增时同步对应发行说明。

本分支历史已清除各项目开发文件。旧源码 checkout 不能直接 merge、rebase 或强推回来；继续本地开发时，应从清理后的 `package` 建立独立发布 checkout，再复制发行成品。`.gitignore` 是误添加防护，不是服务端访问控制，不能阻止 `git add -f` 或外部客户端强推。
