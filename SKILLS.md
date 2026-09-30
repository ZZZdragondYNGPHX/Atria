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

### frontend-design

- 用途：建立具有项目辨识度的视觉方向、字体/布局性格与去模板化审美。
- 适用条件：新界面、整体视觉方向、重大视觉重构。
- 目录：`frontend-design/`
- 来源：`anthropics/skills:skills/frontend-design`
- Upstream commit：`8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`
- 本地修改：无；仅新增 `UPSTREAM.md`。

### ui-ux-pro-max

- 用途：设计系统、UX、响应式、无障碍、触控、组件规范与 stack-aware UI 实现指导。
- 适用条件：系统级 UI/UX 设计、组件/页面实现与质量检查。
- 目录：`ui-ux-pro-max/`
- 来源：`nextlevelbuilder/ui-ux-pro-max-skill:.claude/skills/ui-ux-pro-max`
- Upstream commit：`09170eec67eefd46a7ae85de61b40c194020f997`
- 本地修改：无；仅新增 `UPSTREAM.md` 并附带仓库根 `LICENSE`。

### web-design-guidelines

- 用途：按最新 Web Interface Guidelines 审计无障碍、focus、forms、animation、performance、navigation、touch、safe area、i18n、hydration 等实现质量。
- 适用条件：UI 实现完成后的最终审计或专项规范检查。
- 目录：`web-design-guidelines/`
- 来源：`vercel-labs/agent-skills:skills/web-design-guidelines`
- Upstream commit：`063bee94c3f4df8453406c830b0a7df0f2860278`
- 本地修改：无；仅新增 `UPSTREAM.md`。
- 运行时规则来源：Skill 要求每次审计获取 `vercel-labs/web-interface-guidelines:command.md` 的最新规则。

### emil-design-eng

- 用途：交互细节、动效决策、组件手感、perceived performance 与 invisible polish。
- 适用条件：结构和可用性已稳定后的交互动效打磨与专项 review。
- 目录：`emil-design-eng/`
- 来源：`emilkowalski/skills:skills/emil-design-eng`
- Upstream commit：`d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128`
- 本地修改：无；仅新增 `UPSTREAM.md` 并附带仓库根 `LICENSE`。

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
