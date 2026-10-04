---
name: atria-frontend
description: 为 Atria 主程序、宿主 Plugin、Package 游戏界面及普通组件任务确定归属，编排设计 Skills、浏览器验证和文档查询。用户或正式 Plan 明确要求本 Skill 时使用；不用于纯后端工作或无关项目。
metadata:
  author: Atria
  version: "1.0.0"
  source: Atria local skill
---

# Atria Frontend

负责 Atria 前端路由与工作流程；按需使用已有通用能力。

## 使用边界

- 遵守用户范围、工作区 AGENTS.md、Repository Governance 和正式 Plan。
- 只有用户或正式 Plan 明确要求某个 Skill 后才加载其正文；调用本路由不自动授权全部依赖。
- 优先使用已安装的 Skill；本地缺失、明确要求仓库副本或锁定仓库版本时才读取 skills 分支。
- 只选当前任务需要且已获准的能力；未获准的 Skill 可列为候选，继续范围内工作。
- Skill 不扩大代码修改、安装、提交、推送或发布权限。

## 1. 确定任务归属

核对真实工作目录、Git 分支和 dirty 状态，按运行宿主与数据所有者分类。

| 界面 | 归属与必要上下文 |
| --- | --- |
| 主程序 UI / Runtime renderer | main 派生的产品工作树；AGENTS.md、README.md、相关 UI / Host 契约 |
| Atria 宿主 Plugin UI | 实际插件及宿主契约；main:plugins/** 是产品源码，不自动转入 plugin 分支 |
| Package 游戏 UI | package 工作树的目标游戏；AGENTS.md、游戏 README.md、frontend/DESIGN.md |
| 普通网页组件 | 所属项目及真实 DOM / CSS / 构建入口；独立组件使用通用流程 |

分支不是嵌套目录。归属不清、跨工作空间或涉及资产路由时读取 [workspace-routing.md](references/workspace-routing.md)。

## 2. 固定技术与设计约束

- 沿用当前 DESIGN、tokens 和目标行为；局部修复不默认重新设计产品。
- 产品前端保持原生 JavaScript、DOM、CSS 和既有 Webpack 入口；不主动建议 React / Next.js / Tailwind 重构。
- Package frontend 沿用 Atria Runtime、Native AUI renderer、.aui 和已有编译验证入口；语法与事件以当前契约为准。
- 复用状态、Host services 和持久化路径；UI 草稿不能成为新的 authority。
- Package / .aui 任务读取 [package-ui.md](references/package-ui.md)，并核对目标游戏自己的设计，不套用其他游戏风格。

## 3. 选择能力

加载 Skill 工作流、调用 MCP 工具和执行 CLI 是不同操作；按需要选择，不整套运行。

| 能力 | 使用条件与 Atria 适配 |
| --- | --- |
| frontend-design | 新界面或明确要求重建视觉方向；已有设计为基线 |
| ui-ux-pro-max | UX、布局、响应式、无障碍或组件问题；优先具体 domain 查询，无对应原生 JS / AUI stack 时不冒充其他框架 |
| web-design-guidelines | 用户 / Plan 要求规范审计或交付审查；获取最新规则，只应用当前技术栈适用的条目 |
| emil-design-eng | 结构稳定后的反馈、focus、动效与细节打磨；遵守现有游戏交互约束及该 Skill 的 review 格式 |
| playwright-cli | 页面操作、键盘导航、视口检查和截图；使用独立 session，在真实 Host 中验收 Package |
| Chrome DevTools MCP | console、network、布局、样式、性能或 Runtime 故障定位；先发现当前工具 schema，不猜参数或 pageId |
| Context7 | 第三方库的当前 API、版本行为或配置不确定；通过可用 MCP 工具查询，Atria 私有 Runtime / .aui API 查本地契约 |

设计搜索结果是建议，先确认场景匹配；沿用已有设计时不重生成 design system，不自动持久化查询结果。
工具缺失时说明局限并使用现有替代能力，不自动安装新生态 Skills / Plugin / MCP。
浏览器使用隔离测试数据；文档查询不携带存档、凭据或隐藏游戏数据。

## 4. 执行与验证

- 分析任务输出方案；实现任务只改已定位的呈现层及必要契约，不顺带改 gameplay 或建立平行 Runtime authority。
- 产品 / Plugin 从实际构建和测试入口选择相关检查，不预设 npm script。
- Package 从目标 README 选择内容、frontend model 或 Native frontend 检查，确认独立 Core checkout 与版本匹配。
- 浏览器覆盖变更相关的导航、focus、窄屏、状态反馈和错误恢复；涉及操作语义时检查草稿、确认和提交边界。
- Package 验收经过安装 / Ready / renderer 链路；HTML mock、DOM 快照和截图不能证明 Native authority、幂等性或 Save/Restore。
- 小型 UI 改动不默认运行长周期 soak；无法访问真实实例时记录未验证项。
- 关闭本次浏览器 session，保护无关工作树改动；只报告实际执行的检查、环境和证据。

## 交付

说明任务归属、采用的 Skills / 工具、改动或方案、验证结果和未验证项。
审查遵守所用 Skill 的输出格式；Git 与发布动作遵循当前授权和项目治理。
