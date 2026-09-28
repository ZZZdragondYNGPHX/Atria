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
- 修改前检查工作树状态，保护与当前任务无关的 dirty changes；必要时使用独立 worktree。
- 只运行与触及面相称的验证；不得把未执行的测试、构建、Android/真机或 UI 检查称为通过。
- 普通代码错误、测试失败、merge conflict 与常规工程选择自行处理。

## Context routing

只读取当前任务真正需要的上下文：

- 新普通任务：本文件 + 直接相关代码/测试。
- 续接/多阶段任务：核对真实 Git 状态，再读 `docs:HANDOFF.md` → 对应 Plan → 对应 Record。
- Skill：只有用户或正式 Plan 明确要求时，读 `skills:SKILLS.md` 后加载对应 Skill。
- Reference：只读用户明确授权的 `reference/<project>`。
- 治理敏感操作：读取完整 `docs:README.md`。

不要默认扫描所有 Plans、Records、Skills 或 reference。

## Task lifecycle

小任务默认一次性闭环：分析 → 建短期分支 → 修改 → 验证 → commit/push → 必要 CI → Record → 合并 `main` → 验证 `main` → 删除任务分支。

多阶段任务默认沿用同一工作分支。每个正式阶段完成实现与验证后，更新同一 Record 和 live HANDOFF，给出接手提示词并停止，不自动进入下一阶段。

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

遇到这些操作时以 `docs:README.md` 为完整权威，不从旧的 `docs:handoff/latest-handoff.md` 或历史 handoff 路径恢复实时状态。
