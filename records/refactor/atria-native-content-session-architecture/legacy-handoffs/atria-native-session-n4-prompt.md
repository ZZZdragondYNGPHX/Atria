# Copyable N4 continuation prompt — in-progress checkpoint

你现在接手 GitHub 项目 https://github.com/ZZZdragondYNGPHX/Atria。
当前任务：Atria Native Content & Session Architecture Refactor，继续 N4，不是 N5。

工作分支：refactor/atria-native-content-session-architecture
N4 已推送检查点：f3ac20f80f4691eee1d3c7ccab555a39e4322d3b
最后完整验收阶段仍为 N3：c42ee3e98a27fbea97ded0917de081bcc8893680
上一会话因用户额度不足提前收束；N4 尚未完成，切勿把检查点说成 validated HEAD。

先 fetch，使用远端实际最新工作分支与 docs，不回退，不新建分支，不合并 main。
依次读 main:AGENTS.md、main:FORK_MAINTENANCE.md、docs:handoff/latest-handoff.md、docs:handoff/atria-native-content-session-architecture.md、docs:refactor/atria-native-content-session-architecture.md、docs:handoff/atria-native-session-n4-prompt.md。
Master Plan 是最高依据。不要重做 N0–N3，不要重开产品设计。

已落地：SessionCore 原子 Timeline intents、指定消息/Variant fork、单向 Native runtime projection、Native HTTP 入口、现有 script.js 的 append/patch/save/reload 接线、Branch/Regex/World Info候选/AssetStore附件接线、失败锁与历史只读、N4单测及CI接入。
检查 c42ee3e98..f3ac20f80f4691eee1d3c7ccab555a39e4322d3b 的完整 diff；这些是真实代码，但尚未完成实际 SPA 会话流程验收。

本地证据：17 suites / 139 tests passed；full root ESLint、git diff --check passed。仅 FS/SQLite；MySQL/PostgreSQL 本地显式禁用。CI由推送触发，运行结果待查。未跑完整 Node suite、frontend build 或 live browser；未用真实模型。没有 Android/Docker build。

优先补真实 Atria server/SPA + mock LLM 浏览器测试，使用全新隔离数据根，不复制用户私有 data，不用用户真实服务。
验证 Send、Stop、Continue、用户/助手 Edit、Delete、Swipe、Regenerate、Branch、reload、历史 revision.branchId、prompt assembly、Regex、World Info、attachments；抓请求证明 Native 只写 Native stores、不落入旧 chat/character/worldinfo 持久化。特别核验 regenerate->swipe 生命周期、streaming下消息/variant ID绑定、异步保存和切换/失败恢复。
保持 R7 DOM 节点身份与唯一性。纯投影单测不能代替 live runtime 证据。
N4的World Info候选映射不是N6，目标/visibility/override暂时fail-closed跳过；完整状态后端为N5，当前不能宣称完整Runtime State Integration。

普通代码/测试/CI问题自行修复；长CI按Master Plan停止轮询等待用户确认；权限/Secrets/真实环境外部输入才停下询问。
不要提前进入N5/N6/N7/N8/N9。完成并验证N4后更新正式方案和handoff、记录准确HEAD和CI、停止开发，再给N5接手提示词。
