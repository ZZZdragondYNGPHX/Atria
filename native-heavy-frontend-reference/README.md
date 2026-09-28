# Native Heavy-Frontend Reference Package

本目录是 **Native Heavy-Frontend Reference Package** 的长期资产目录。

Phase 3 仓库规范化迁移从：

`migration-source/native-heavy-frontend-reference@b3b6c4f01729325a789c92a15cc6946e1a97603a`

提取并原样保留了原 `packages/native-heavy-frontend-reference/` 下的 19 个 Package 专属文件，包括：

- `PLAN.md`、`PLATFORM_GAPS.md`、`PLAYTEST.md`；
- Project Source；
- Preview fixtures；
- recorded Scenarios；
- Phase 1–6 validators。

这里不包含 Atria 产品源码。需要对产品运行时做兼容验证时，应使用独立的 `main` 产品环境，而不是把 `main` 合入 `package`。

## Releases

正式 `.atria` 成品放在 `releases/`，按版本长期保留。

迁移审计未发现可归档的历史 `.atria` 文件，因此本次只建立 release 机制，不虚构历史成品。
