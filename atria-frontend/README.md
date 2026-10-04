# atria-frontend

Atria local skill，版本 **1.0.0**，原生创建。

## 用途

为 Atria 前端任务确定工作空间、运行宿主、技术约束、能力选择与验证路径。
适用于用户或正式 Plan 明确要求的主程序 UI、宿主 Plugin UI、Package 游戏 UI 及相关组件工作。

## 为什么存在

通用设计 Skills 不知道 Atria 独立的 main / package / plugin 工作空间、Native AUI、Host bridge 与 authority 边界。
本 Skill 把这些项目约束接到已有设计和浏览器能力上，避免把游戏呈现改动误路由到产品源码，或由通用技术栈建议触发框架迁移。

## 与通用能力的关系

| 能力 | 分工 |
| --- | --- |
| frontend-design | 提供视觉方向与审美决策；atria-frontend 确定设计归属及既有 DESIGN 约束 |
| ui-ux-pro-max | 提供可查询的 UX / 组件建议；atria-frontend 确保查询匹配原生 JS / AUI 和实际场景 |
| web-design-guidelines | 提供规范审计；atria-frontend 限定适用实现与验证范围 |
| emil-design-eng | 提供交互细节打磨；atria-frontend 保持产品和游戏交互契约 |

本 Skill 不替代或复制上述 Skills，也不实现 Playwright、DevTools 或 Context7 的工具能力。
它不替代工作区 AGENTS.md、Repository Governance、正式 Plan 或 Runtime / compiler 契约。

## 目录与调用

```text
atria-frontend/
├── SKILL.md
├── README.md
└── references/
    ├── workspace-routing.md
    └── package-ui.md
```

- [SKILL.md](SKILL.md)：唯一工作流入口。
- [workspace-routing.md](references/workspace-routing.md)：工作空间与前端任务归属。
- [package-ui.md](references/package-ui.md)：Package frontend、AUI 与 Host 边界。
- [SKILLS.md](../SKILLS.md)：仓库索引，按需路由到本目录。

示例：使用 `$atria-frontend` 和 `$ui-ux-pro-max` 分析某个 Package 表单的 focus 问题。
调用本路由不自动授权加载其他 Skill，仍遵循仓库的明确请求 / 正式 Plan 规则。

## 分发与维护

规范资产位于 `skills:atria-frontend/`；skills 分支的 Skill 使用顶级目录。
本地 Codex 自动发现目录为 `~/.agents/skills/` 或相关工作区的 `.agents/skills/`，可使用固定版本副本或链接到本目录。
保存到 skills 分支不等于在其他工作树自动激活；项目与全局同名 Skill 不依赖覆盖机制。
不要为激活本 Skill 将 main 合入 skills 或 package。

来源为 Atria 本地评审草案，依据 main / package 的 AGENTS.md、README.md、目标游戏 frontend/DESIGN.md、skills:SKILLS.md 与 docs:README.md 整理。
维护项目路由与契约约束；游戏专属 tokens 和玩法细节继续由目标游戏文档维护。
