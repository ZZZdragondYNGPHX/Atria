# Copyable N4 continuation prompt — in-progress checkpoint

你现在接手 GitHub 项目 https://github.com/ZZZdragondYNGPHX/Atria。
当前任务：Atria Native Content & Session Architecture Refactor，继续 N4，不是 N5。

先 fetch，使用远端实际最新工作分支与 docs，不回退，不新建分支，不合并 main。
依次读 main:AGENTS.md、main:FORK_MAINTENANCE.md、docs:handoff/latest-handoff.md、docs:handoff/atria-native-content-session-architecture.md、docs:refactor/atria-native-content-session-architecture.md、docs:handoff/atria-native-session-n4-prompt.md。
Master Plan 是最高依据。不要重做 N0–N3，不要重开产品设计。

已落地：SessionCore 原子 Timeline intents、指定消息/Variant fork、单向 Native runtime projection、Native HTTP 入口、现有 script.js 的 append/patch/save/reload 接线、Branch/Regex/World Info候选/AssetStore附件接线、失败锁与历史只读、N4单测及CI接入。

本地证据：17 suites / 139 tests passed；仅 FS/SQLite；MySQL/PostgreSQL 本地显式禁用。CI由推送触发，运行结果待查。未跑完整 Node suite、frontend build 或 live browser；未用真实模型。没有 Android/Docker build。

抓请求证明 Native 只写 Native stores、不落入旧 chat/character/worldinfo 持久化。
保持 R7 DOM 节点身份与唯一性。纯投影单测不能代替 live runtime 证据。完整状态后端为N5，当前不能宣称完整Runtime State Integration。

普通代码/测试/CI问题自行修复；长CI按Master Plan停止轮询等待用户确认；权限/Secrets/真实环境外部输入才停下询问。
不要提前进入N5/N6/N7/N8/N9。
