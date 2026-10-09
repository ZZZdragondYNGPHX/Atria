# 贡献指南

默认在本地开发、验证、提交、合并与清理；远端仅保存已提交结果。GitHub Actions 全部停用，包括手动运行、APK/Docker 构建和自动分支清理。

仓库治理统一位于 `docs:README.md`（本地用 `git show docs:README.md` 读取）。本指南说明贡献步骤；当前用户指令与治理定义实际任务边界。企划、实施记录和实时交接统一维护在独立 `docs` 分支，`main:docs/` 只维护产品使用与开发说明。

感谢你对 Atria 项目的关注！本文档介绍如何为 Atria 贡献代码、文档和其他改进。

## 开发环境准备

1. 克隆仓库到本地，或使用现有工作区：

```bash
git clone https://github.com/ZZZdragondYNGPHX/Atria.git
cd Atria
```

2. 使用 `npm install` 安装依赖。
3. 使用 `node server.js` 启动开发服务器。

默认地址为 `http://localhost:8000`；端口可通过命令行参数或 `config.yaml` 配置。外部贡献者可按需要使用 fork。

## 分支策略

- **`main`** — 稳定分支，始终保持可发布状态。完成的产品任务在本地集成到 `main`；可选 PR 以 `main` 为目标
- 功能开发请从 `main` 创建特性分支

```bash
git checkout -b feat/my-new-feature main
```

> [!IMPORTANT]
Atria 的稳定分支是 `main`。

分支命名建议：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat/` | 新功能 | `feat/memory-graph-export` |
| `fix/` | Bug 修复 | `fix/chat-sync-race-condition` |
| `docs/` | 文档改进 | `docs/extension-api-examples` |
| `refactor/` | 代码重构 | `refactor/preset-manager` |
| `chore/` | 构建/工具链 | `chore/update-dependencies` |

## Commit 规范

Atria 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**类型（type）：**

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构（不新增功能或修复 bug） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建/工具链/依赖更新 |

**示例：**

```
feat(memory-graph): add hierarchical compression for event nodes

fix(search-tools): handle empty query in web search

docs(extension-api): add examples for registerExtensionApi
```

## 本地开发流程

1. 检查 Git 状态，保护无关修改，建立或沿用对应任务分支。
2. 实现改动，运行最小充分的相关本地检查。
3. 本地提交，在独立 `docs` 分支写入或更新同一 Record。
4. 完成的产品任务在本地合并 `main` 并核对集成结果，不重复未受影响的检查。
5. 推送已提交结果用于存储，清理已完成的本地及远端任务分支。
6. 多阶段任务更新 Record/HANDOFF，在正式阶段边界停止。

明确需要审阅时可使用 PR；PR 和已停用的远端 CI 不作为默认合并门槛。

## 代码风格

### 基本规则

- **缩进**：4 空格
- **引号**：单引号（JavaScript）
- **分号**：必须使用
- **换行符**：LF（`\n`），不使用 CRLF
- **文件末尾**：保留一个空行

> [!IMPORTANT]
> 所有文件必须使用 LF 换行符。Windows 用户请配置 Git：
> ```bash
> git config core.autocrlf input
> ```
> 或在 `.gitattributes` 中确保 `* text=auto eol=lf`。

### 命名规范

| 场景 | 风格 | 示例 |
|------|------|------|
| 变量和函数 | `camelCase` | `loadSettings()` |
| 常量 | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |
| CSS 类名 | `kebab-case` | `chat-message-container` |
| 文件名 | `kebab-case` | `preset-manager.js` |

### 模块系统

- **前端代码**：ES Module（`import`/`export`）
- **后端代码**：ES Module（`import`/`export`）

### 注释

- 关键逻辑和公共 API 需要 JSDoc 注释
- 复杂的算法或业务逻辑应有行内注释说明意图
- 避免无意义的注释（如 `// 增加计数器` 后面跟 `counter++`）

## 项目结构概览

```
Atria/
├── server.js              # 服务器入口
├── src/                   # 后端源码
│   ├── endpoints/         # API 路由
│   └── middleware/        # 中间件
├── public/                # 前端资源
│   ├── scripts/           # 前端脚本
│   │   ├── extensions/    # 内置扩展
│   │   │   └── third-party/  # 第三方插件
│   │   └── ...            # 核心模块
│   └── ...                # 静态资源
├── docs/                  # 文档（英文版位于根目录）
│   ├── zh-CN/             # 简体中文文档
│   └── zh-TW/             # 繁体中文文档
└── config.yaml            # 服务器配置
```

## 测试

- 根据改动行为与风险选择最小充分检查，不默认全量 lint/test/build。
- 优先单元/集成测试、浏览器自动化和模拟器。
- 只有关键验收无法由自动化替代时，说明具体缺口与最小人工实机需求。
- 只有相关新变化或未解决失败才重复已通过检查。
- 仅报告实际执行的检查，保留缺失证据。

## 文档贡献

文档位于 `docs/` 目录下，使用 Markdown 格式：

- 英文文档：`docs/`（根目录）
- 简体中文文档：`docs/zh-CN/`
- 繁体中文文档：`docs/zh-TW/`

文档贡献遵循上述本地流程；Plan、Record 和 HANDOFF 归独立 `docs` 分支。编写文档时请注意：

- 使用准确的技术术语
- 代码和 API 名称保留英文
- 适当使用代码块和表格
- 交叉引用：英文版使用无前缀路径（如 `/development/contributing`），中文版使用 `/zh-CN/` 或 `/zh-TW/` 前缀
- 所有文件使用 LF 换行符

## 报告问题

如果你发现了 bug 或有功能建议，请在 GitHub Issues 中提交。提交 Issue 时请包含：

- 问题描述
- 复现步骤（如适用）
- 预期行为与实际行为
- 环境信息（操作系统、Node.js 版本、浏览器）

## 行为准则

请尊重所有贡献者和用户。保持友善、专业的交流态度。

## 相关页面

- [前端插件开发](/zh-CN/development/frontend-plugin) — 第三方插件开发入门
- [扩展 API 参考](/zh-CN/development/extension-api/) — 完整的 API 文档
- [角色卡定制教程](/zh-CN/recipes/card-customization-walkthrough) — 使用 Studio 定制角色卡
