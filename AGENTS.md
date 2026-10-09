# Local Agent Instructions — main

本工作区是 Atria 的稳定产品/source 主线以及从它创建的短期产品任务分支。

完整 Repository Governance 位于 `docs:README.md`。本文件只提供本地/CLI 高频热路径与 Atria 产品工程边界。

## Workspace rules

- `main` 保持稳定；普通 feature/fix/refactor 不直接长期堆积在 `main`。
- 使用 `feat/<task>`、`fix/<task>`、`refactor/<task>` 等短期语义分支。
- `docs`、`package`、`plugin`、`skills` 是长期独立工作空间，不将 `main` merge 进去。
- `main:default/skills/**` 是 Atria Runtime Skills / 产品资产，不属于 repository-agent `skills` 工作空间。
- `main:plugins/**` 是 Atria 产品源码，不等同于长期独立工具 `plugin` 工作空间。
- 不读取或更新 `reference/*`，除非用户分别明确授权“参考”或“更新”对应项目。

## Local fast path

- 优先使用本地 Git、文件系统、搜索、测试、构建和 worktree；不要为了模仿 Web 流程绕远程 API。
- 本地负责开发、验证、提交、合并与清理；远端仅存储已提交结果。GitHub Actions 全部停用，不要求远端 CI/PR；APK、Docker 和分支清理按需要在本地执行。
- 辅助工作树集中到同级 `Atria-worktrees/{docs,package,plugin,tasks/<task>/{source,docs}}`，按需建立；阶段不进入目录名。机器绝对路径只保存在本地配置。迁移核对 HEAD、dirty/草稿和依赖链接。
- 修改前检查工作树状态，保护与当前任务无关的 dirty changes；必要时使用独立 worktree。
- 验证方式与 API 测试限制分别见 `docs:README.md` §12 / §13.1。

## Context routing

只读取当前任务真正需要的上下文：

- 新普通任务：本文件 + 直接相关代码/测试。
- `main:docs/` 维护产品使用与开发说明，不再保存 Plan / Record / HANDOFF 副本。企划、实际结果与实时路由统一归独立 `docs` 分支的 `plans/**`、`records/**`、`HANDOFF.md`，避免多处重复执行指令。
- 多阶段任务：核对真实 Git → Plan entrypoint → 当前所需模块 / 同一 Record；用户中断后恢复时先读已有 `docs:HANDOFF.md`。
- Skill：只有用户或正式 Plan 明确要求时才加载；本地/CLI 优先直接使用环境中已安装的 Skill。不要为了模仿 Web 流程而绕读 `skills` 分支；仅在本地缺失、用户明确要求仓库副本，或 Plan 明确锁定仓库版本时读取 `skills:SKILLS.md`。
- Reference：只读用户明确授权的 `reference/<project>`。
- 治理敏感操作：读取完整 `docs:README.md`。

不要默认扫描所有 Plans、Records、Skills 或 reference。

## Task lifecycle

持续执行、失败处理与交付统一遵循 `docs:README.md` §8；交接和真实阻塞分别见 §7 / §13。阶段用于逐步推进，不能作为自动停工点。

## Atria engineering boundaries

- 产品/UI/package identity 为 **Atria**。
- 新的 Atria-owned code 在合适时优先使用简洁 `atri_*` 命名；不要无理由重写上游兼容敏感名称。
- SillyTavern 是上游基础，不是日常开发基线；Luker 仅是明确授权时才读取的历史参考。
- 修 Bug 先定位根因；加功能先理解现有 authority/service/persistence 路径。
- 优先复用现有状态、服务与持久化系统，不建立平行 authority。
- 除非有明确迁移设计，否则保护数据/配置兼容性。
- 避免无关重构。
- 不提交 credentials、tokens、keystores、用户数据、本地路径、缓存、下载二进制、生成构建产物或 APK。

## Governance

以下属于治理敏感操作：长期分支创建/删除/重命名、工作空间结构变化、Plan/Record/HANDOFF 生命周期变化、reference 体系变化、跨多个长期工作空间的迁移、修改治理文件或新增资产类型。

遇到这些操作时以 `docs:README.md` 为完整权威，不从历史 handoff 路径恢复实时状态。
