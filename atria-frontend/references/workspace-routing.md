# 工作空间路由

归属不清、跨工作空间或涉及资产路由时读取。先确认真实 checkout，分支名不是文件路径前缀。

| 工作空间 | 前端任务归属 | 边界 |
| --- | --- | --- |
| main | 主程序 DOM / CSS、Webpack 入口、公共 Host UI、Runtime renderer、main:plugins/** 产品插件 | 产品改动按治理使用 main 派生的任务工作树；复用既有 service / persistence |
| package | 目标游戏的 Package frontend、.aui、呈现控制器、设计文档和游戏构建资产 | 一个游戏一个顶级目录；Host / Core 修复归产品工作树，不把 main 合入 package |
| skills | repository-agent Skill、引用资源与 SKILLS.md 路由索引 | 一个 Skill 一个顶级目录；不承载产品 UI 实现或 Runtime Skills |
| plugin | 独立 preview / debug / validator / MCP 等开发工具及其界面 | 不承载 main:plugins/**；产品集成验证使用独立产品工作树 / 实例 |
| docs | 前端任务的正式 Plan、永久 Record、治理文档 | 不存放产品代码、Package 资产或 Skill 实现；遵循既有文档生命周期 |

普通组件按实际宿主归属；不依赖 Atria 的独立组件使用所属项目的通用约定。
区分 Atria 产品插件、plugin 工作空间的工具、Codex Plugin；Context7 的接口不是 Atria Plugin UI 契约。
main:default/skills/** 是 Atria Runtime 产品资产，不迁入 repository-agent skills 工作空间。

## 必要上下文

1. 工作区 AGENTS.md、README.md、真实分支和 dirty 状态。
2. Package 的目标游戏 README.md、frontend/DESIGN.md；产品 Plugin 的实际加载、事件、样式与 teardown 契约。
3. 只在当前任务需要时读取对应正式 Plan；续接任务按既有 HANDOFF / Plan / Record 路由。
4. 实现时补读直接相关代码、.aui、compiler / bridge / Host 契约、构建入口和测试。

不默认扫描所有游戏、Plans、Records、Skills 或 reference。治理敏感操作先读 docs:README.md；本文件不替代完整 Governance。

## 跨工作空间与能力分层

- 跨 Package / Core 的问题分别定位呈现层和 Host 契约，只在已授权工作空间操作。
- 全局通用设计能力、atria-frontend 路由和目标游戏 DESIGN 叠加使用，不维护互相覆盖的同名规则。
- Codex 不自动加载另一个工作树的 AGENTS.md；解析目标工作树后读取其规则。
- 根目录启动不会向下发现所有游戏级 Skills；需要时在对应目录启动或明确读取已获准的目标 Skill。
- 需要版本锁定时记录所用 Skill / Core / Package 版本，不把历史验收当成本次测试。
