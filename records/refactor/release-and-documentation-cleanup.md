# 发行分支与文档治理清理

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `refactor/release-and-documentation-cleanup`
- Primary Workspace: `docs`
- Status: Complete (Git 分支历史与文档；托管端残留范围见下文)
- Date: 2026-10-25
- 起点：docs `28594b32`、main `3a0437bd`、package `ea81990e`、plugin `eb7b11eb`。

## 已完成的远端整理

- 删除远端 `skills`、`feat/agent-intelligence-plan`、`feat/doupo-living-world-design-reference`、`feat/native-visual-generation-deepening`、`refactor/atria-frontend-atrium`；本地开发分支和工作树保留。
- 两个标签由用户在整理期间删除；遵照后续明确指令，不恢复 `original-occult-western-fantasy-v2.0.0`、`archive/atria-project-skill-routing-2026-10-16`。首次含标签的原子推送被 lease 拒绝，没有部分更新；随后按当前远端只推送 package。
- `package` 的 70 个旧提交按发行路径白名单重写为 16 个有效历史提交，再追加发布说明与白名单。首次发布新根为 `d82084e6`，使用指定旧 HEAD 的 force-with-lease 更新。
- 22 个 `.atria` 的路径、模式和 Git blob 身份在全历史及分支顶端保持一致；其中 14 个斗破、4 个雾灯、4 个异闻之城。Native Heavy-Frontend Reference 原来没有已跟踪发行包，仅保留发行目录说明。
- 本地含源码的旧 package checkout 保留原位，改名 `local/package-source` 并取消远端跟踪、禁用默认 push 目标；新的 `package` checkout 只供复制发行成品。没有将未提交游戏实现或原始素材加入发布历史。

## 文档清理范围

- Governance 2.0 集中定义纯发行包边界、最小相关验证与轻量运行时检查；入口、模板和说明只路由到这一权威，不建立平行规则。
- 撤销斗破 L1–L4／整套验证矩阵、V1–V13 流水线、MCP 全领域必做基线、视觉全量 E0 前置审计及素材逐文件 hash／逐像素比较要求；保留实际玩法、权限和事务语义。
- 旧 Plan、审计附件与启动提示区分设计和执行；Record 保留历史事实，但标明不是可复制的验证清单。旧 migration 与暂停 handoff 改为历史入口。
- 修正 skills 路由、纯发行包用途、过期方案入口、资源中心与动态世界状态；区分已进 main 的 Prompt/V3 提交与尚未合入的本地 Atrium 工作。
- main 的 Agent/Copilot/贡献指南/任务模板及三语言开发说明、plugin 入口、发行说明同步当前规则；本地旧工作树入口与文档副本已同样清理，不合并或发布它们的开发代码。

## 本次续接收尾

- 续接时确认远端 package 已是 `d82084e6`，无需再次重写；待推送的是四个长期分支的文档提交。
- 本地同步记录覆盖 21 个工作空间、1015 次文档更新；源码、素材及尚未提交的领域设计保留原位。docs 的提交基线与本地设计改动分开处理，未跟踪的新方案和既有删除不进入发布提交。
- 进一步移除斗破实施正文残留的任务全场景矩阵、V1–V13 必做分工、分层验收引用及强制布局样本；相应玩法规则仍由任务、活动、功法等原领域模块负责。同步本地设计副本，不用旧远端方案覆盖较新的本地内容。
- 发布结果：main `7f4e9284`、plugin `7237e124`、package `76d913f6`；docs 在 `c659a845` 基础上追加本次残留修正与收尾记录。四分支通过同次明确 refspec 推送，不上传任何本地游戏源码分支或标签。

## 实际检查

- 沿用历史重写时已通过的发行路径与 Git 对象核对：22 个发行包及其历史版本未变。之后 package 的提交仅修改 Markdown，未重新计算发行包摘要或启动构建。
- 四分支待发布提交仅含 Markdown；差异空白检查通过。本次修改的 7 份方案，其相对文件链接目标存在。
- 发布白名单拒绝源码、发行目录内的 JavaScript 与 `.env`，允许版本化 `.atria`；本地游戏开发分支没有远端跟踪，默认 push 指向停用目标。
- 其它公开分支和 `v0.9.0` 的提交图没有旧 package 提交，其顶层也没有游戏源码目录。没有因这次清理删除 Atria 产品或独立工具源码。
- 曾尝试枚举其它分支的全部历史路径，但 partial clone 触发了与目标无关的历史树下载，已终止；改用上述提交图和顶层检查。未将未完成的全路径枚举报告为通过，也未枚举托管端 PR 引用的文件内容。

## 范围与边界

- 本次清理文档与发布历史，不修改游戏算法、Atria 运行时代码或现有安全检查；不声称运行性能已经改变。
- hash 的历史统计、Git 对象身份、确定性算法或实际安全边界与运行时重复自检不是同一用途；没有为文档整理启动游戏、构建、浏览器、真实模型、跨端或长时验收。
- 分支重写只能移除当前可达发布历史。GitHub 缓存、隐藏 PR refs、旧 SHA 页面、第三方 clone/fork 不因强推自动擦除；彻底清除托管端残留需要 GitHub 侧处理，不能承诺源码从未上传。
