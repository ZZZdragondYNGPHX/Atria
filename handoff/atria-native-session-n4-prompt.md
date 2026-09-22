# Copyable N4 handoff prompt

你现在接手 GitHub 项目：
https://github.com/ZZZdragondYNGPHX/Atria

当前实施 Atria Native Content & Session Architecture Refactor。
不要重新讨论产品设计，不要重做 N0/N1/N2/N3，不要创建新分支，也不要合并到 main。

工作分支：refactor/atria-native-content-session-architecture
N3 validated HEAD：c42ee3e98a27fbea97ded0917de081bcc8893680
N3 CI：Native Content Session Dev Checks #44
Run：35679448236，success
N3：3 suites / 49 tests passed，覆盖 FS / SQLite / MySQL / PostgreSQL。
N1：9 suites / 64 tests passed；N0、N2、source ESLint、full root ESLint 均成功。

开始前 fetch 并重新读取远端工作分支，以实际最新 HEAD 为准；其他会话若已推进，不要回退。
依次读取：
1. main:AGENTS.md
2. main:FORK_MAINTENANCE.md
3. docs:handoff/latest-handoff.md
4. docs:handoff/atria-native-content-session-architecture.md
5. docs:refactor/atria-native-content-session-architecture.md
6. src/native/session-core.js、session-snapshot.js、session-knowledge.js
7. SessionRepo / SavePointRepo、N3 三组测试及当前相关 runtime / projection / R7 Play host 代码。
Master Plan 是最高实施依据。

N3 已完成：SessionCore、BranchGraph、Timeline/Variant、SessionState base、SessionRevision、SavePoint primitive、精确 KnowledgeBindingSet、load/reload、opaque-ID 分支、commit-last/HEAD CAS、历史与引用保护、Checkpoint A。
使用现有 SessionCore 命令，不要另建 Conversation engine，也不要用 N1 低层原语另拼一条运行时持久化路径。
当前 Session descriptor 与历史 revision 要区分；历史视图以返回的 revision/snapshot 为准。

现在进入 N4 — SillyTavern Runtime Projection：
- 实现 Native Package/Session → SillyTavern runtime 的单向 compatibility adapter；
- 复用 characters[] / this_chid / chat[] / chat_metadata / swipe 等运行时 ABI；这些不是持久化 authority；
- 用户操作回写必须转成 Native command，只写 Native stores；
- 验证 Send、Stop、Continue、用户/助手编辑、Delete、Swipe、Regenerate、Branch；
- 验证 prompt assembly、Regex、现有 World Info compatibility、generation、attachments；
- 保持 R7 Play host 的身份/DOM 不变量；
- 精确 API 查当前代码，不凭记忆填写；真机才能证明的行为保留真实运行验证。

继续保持：
- 精确 PackageVersion / WorldRevision / KnowledgeRevision，不跟随 Library latest；
- Package 依赖自包含，运行时不依赖作者机器 Library；
- Studio Native identity 只认 projectId；
- 不读 PNG / Character JSON / JSONL / World Info 作为 Native authority；
- 不双读、不双写，不以 name / filename / path / uid / charDir / characterId 作为 Native identity。

不要提前做 N5 完整 Runtime State Integration、N6 KnowledgeCompiler、N7 完整便携存档系统、N8 UI Cutover 或 N9 Legacy Retirement。
普通代码/测试/CI 问题自行修复并继续；不运行未明确要求的 Android / Docker build 或额外 Docker 验证。
遵守 Master Plan 的长 CI 等待与真实环境外部输入停点。

N4 完成并验证后，更新正式方案和 docs/handoff，记录 HEAD、完成/未完成项、关键决策、CI，停止开发并给出 N5 可复制接手提示词。
现在直接开始 N4。
