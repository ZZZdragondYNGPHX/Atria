# Atria 性能与长期使用体验 — 活跃交接

## Task

- Task ID：`refactor/atria-performance-long-term-experience`
- Primary Workspace：产品 `main`；施工位于 `Atria-worktrees/tasks/atria-performance-long-term-experience/source`。
- 当前分支：`refactor/atria-performance-long-term-experience`
- Current HEAD：`0433bc10c`，E4 WIP 检查点；E3 已验证阶段 HEAD 为 `6e26bca41`。
- 当前阶段：**E4 未完成**；E0–E3 已提交、推送并累计记录，E5–E7 未实施。
- Plan entrypoint：[index.md](plans/refactor/atria-performance-long-term-experience/index.md)，先读 [implementation-roadmap.md](plans/refactor/atria-performance-long-term-experience/implementation-roadmap.md)。
- E4 必读模块：[stability-recovery.md](plans/refactor/atria-performance-long-term-experience/stability-recovery.md)；按 GC 根、文件屏障与窗口需要查 [runtime-storage.md](plans/refactor/atria-performance-long-term-experience/runtime-storage.md) / [client-interaction.md](plans/refactor/atria-performance-long-term-experience/client-interaction.md)。E5 / E6 到阶段时分别读取 agent-compute / startup-resources。
- Record：[累计结果](records/refactor/atria-performance-long-term-experience.md)。
- docs 工作空间：`Atria-worktrees/docs`，分支 `docs`，独立于产品源码，不合入 main。
- 停止缘由：用户明确请求换新对话继续；误发 main.c 编译问题已撤回，与本任务无关。旧暂停快照不成为续接后的新限制。

## Completed

- 确认 `feat/agent-compute-runtime@f4815c727` 已快进合入 main，从最新 `73c7913b22daae98b6348fad0f3eee1cfce1f080` 建立当前产品工作树/分支。不要再建分支或从 main 重来。
- E0 `885916c45`：可重现 FS/SQLite 长历史 100/1k/5k 本地基线、内存排名夹具、运行时版本与缺证据清单。
- E1 `a21143dfa`（实现 `a28e28fff`）：FS staged durable redo journal、SQLite WAL/FULL、Blob 文件/目录屏障、原子 Session/RunControl/幂等 commit receipt，真实子进程五切点恢复测试。
- E2 `565b77a48`：Timeline v2 封存段 / COW 索引、世界 Delta / 物化、无损 Chronicle、轻量 SavePoint / 独立派生路线、铁人终局只读及引用根。
- E3 `6e26bca41`：Play 实际 Range 消费、64 正文窗口、滚动/异步 epoch/释放；退役 Native 任意 Fork/Retry/Restart/Re-enter 和正文 Hide 旁路；只允许当前 HEAD 创建存档、从既有 SavePoint 派生 Branch，历史搜索/路线 metadata。
- E4 草稿 `0433bc10c` 保存 18 个文件，详见下节；**不是已完成阶段**。

## Pending

先检查 `git show --stat 0433bc10c` 和修改，再完成 E4：

1. `src/native/session-maintenance.js` 草稿已有 persisted Mark/Quarantine/Sweep cursor、generation 二次核验、读者租约、Scheduler maintenance；还没有专项测试。验证 FS / SQLite 下孤儿隔离、宽限期、重启、有限批次 cursor、重新引用 / 并发 SavePoint、租约防误删、前台优先 / 暂停再继续。Mark 现在分散成逐次事务读取，不能因拆锁而弱化一致性证明。
2. `SessionRepo.gcRevisions` 旧立即删除路径仍在。审计真实调用者并统一到受保护维护，尊重 retainRevisionIds，不创建第二套 GC 权威。审计 `atri_gc_progress` 保留命名空间，防 Package / 用户状态覆盖它。
3. `AssetStore.gcBlobs` 已用 `atri_maintenance` scope blobs 保存隔离代际 / cursor；Blob publication 和 Package install 由同 hash 租约保护。批参数校验、候选数量 / 扫描字节限制、并发同域 maintenance、Scheduler / 前台让出仍须完成。保存期间 root 发布和删除之间的竞态必须专项验证。
4. 修复两套 Storage 测试的四项旧立即 Blob 删除期望，增加测试时钟推进和安全证明。当前失败是已知真实失败，不可宣称全绿。
5. `requestSessionMaintenance` 30 秒 cooldown / 512 keys，Turn 后调用，错误当前 `.catch(() => {})` 吞掉；补合适诊断且不把 GC 失败变成已提交 Turn 的重复提交。SQLite `wal_autocheckpoint=0` / PASSIVE checkpoint 尚须确认维护实际覆盖和并发事务正确性。
6. `ConversationWindow` 4 MiB 候选预算、pressure 半减、trim 当前 pop 尾部：超大窗口可能失去最新正文。保护阅读 / 最新锚，处理 fallback / suspend / clear 预算与释放；压力 API 尚未接实际消费者，须有针对验证。
7. `SourceLifecycle` scope/generation/dispose、Corpus 释放、Chat Snapshot 16 MiB 候选预算（active/write holds 保护）、Scheduler 终态闭包释放已有草稿和旧针对测试通过；仍需实际重复打开 / 关闭 / 切分支的 listener/lease/object/memory 证据，区分 Heap/External/RSS，不能强制生产 GC。
8. FS 原生资源现在按 kind/sessionId 分目录；dev 硬切无旧平铺数据兼容。异步文件屏障与 FS ALS open 标志已改，保留 journal 恢复安全。文档说明和相关发布 / GC 交错验证尚需补全。
9. E4 完成后更新同一 Record、提交推送，连续 E5（增量检索 / 精确 Context / DAG / 质量成本）→E6（Bundle / 真正 PlayReady）→E7（相关横切验收 / 最终集成）。
10. 最终验收通过后本地合并 main、检查结果、push，删除当前临时开发分支/工作树和 live HANDOFF；任务未完成前不要清理。

## Key decisions

- 冻结 C 方案 E0–E7 八阶段 30 任务，不能重开架构；只做改动部分及必要关联安全契约的本地验证，不全仓 test/build 或长等 CI。
- 用户已授权全部非破坏性工作及最终 merge/清理，续接后阶段自动推进，无需阶段许可；普通失败自主修复，真正权限 / 关键外部证据 / 无法继续才停。
- 当前 dev 格式硬切，无迁移 / alias / 双读双写；原始剧情 / Branch / Delta / 终局档案保留；SavePoint 是主动读档的唯一合法路线来源。
- 复用 NativeTaskScheduler、已有缓存 / 授权 / 持久层，不加第二套权威或调度器；S2 发布途中不能为前台优先强制打断。
- 进程 kill / 故障注入只有 S1 / 协议恢复证据；物理断电、Windows / Termux VFS、Android 低内存回收尚待证，不能声称三端 S2 全部通过。按 E7 Gate 如实列待办，不自设整任务停工门槛。
- 当前活动 Runtime / 隐藏 generation ABI 仍保留完整历史快照，DOM 窗口有界不能当成全部内存有界。完整 load / append 基准尚未提速。不要降低上下文质量隐藏成本。
- 参数（64 entries、16 KiB tail、fanout8、16 MiB / 4 MiB、32 batch、60 秒 grace 等）是当前本机候选值，未冻结为三端最佳值。

## Local validation

- 环境 CachyOS Linux 7.2.9-2-cachyos x64，i7-11800H，约 16 GiB，Node24.21.0 / ABI137，better-sqlite3 加载实际成功；未证明 Windows / Termux。
- 既有 E0–E3 通过项目见 Record，未受新改动影响的无需重跑。5k Range P95（3 次暖样本）FS31.05→2.83ms / SQLite33.22→3.07ms；完整 load / append 约 5% 更慢，如实保留。
- E3 本地 Chromium 141：1440/390px ×100/1k/5k，共六组 64 DOM、实际 FS Range、历史滚动 / draft / dispose 无 pageerror。mount 数字含固定80ms等待，不是 PlayReady / P95；手机视口不是 Termux。
- E4 检查点：18 个 JS ESLint、diff check 通过；6 套 Jest共 **58 passed / 4 failed**（6.79s）。四套通过：memory-graph/source-lifecycle、performance/chat-snapshot-cache、native/durable-commit、native/lifecycle-scheduler-p4。两套失败：native/storage-foundation.contract、native/storage-references.contract，各 FS / SQLite 的一次 gcBlobs 立即删除断言失败，收到 []。
- 本地命令（产品 source 工作树内）：

```sh
ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 \
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js \
--config tests/jest.config.json --runInBand \
tests/native/durable-commit.test.js \
tests/native/lifecycle-scheduler-p4.test.js \
tests/memory-graph/source-lifecycle.test.js \
tests/performance/chat-snapshot-cache.test.js \
tests/native/storage-foundation.contract.test.js \
tests/native/storage-references.contract.test.js
```

- source/node_modules 和 tests/node_modules 是指向稳定 main 依赖的本地忽略 symlink；不是要提交的资产。
- 没有新 Provider API 调用、全仓验证、CI 等待。原始临时日志不作为长期证据；验证摘要归本 Record。

## Next target / Read first

先核对真实 Git branch / HEAD / dirty changes 与 docs:README.md / AGENTS.md；读取上述 index → roadmap → stability-recovery → 当前 Record，再看 E4 WIP diff。优先写 GC 隔离 / 恢复 / 租约 / 并发专项并修实现，再收束预算生命周期，不要在基础未验收时开始 E5。

## Do not repeat

- 不重建分支、不重新 merge feat、不重做 E0–E3、不全量加载所有 Plan / Record。
- 不将 docs / package / plugin / skills 合入 main；不触碰其它活跃工作树（例如 feat/atria-project-skill-routing）。
- 不以恢复旧任意 Fork/Retry、截断剧情、关闭授权 / S2 来修旧测试。
- 不把用户的本次暂停延伸为续接后每阶段审批，也不处理已撤回的 main.c 问题。
- 不为补历史临时日志而重跑已通过实验，不将移动视口 / kill / HTTP Ready 冒充真实设备 / S2 / PlayReady。

## New-chat bootstrap prompt

接手续做 `ZZZdragondYNGPHX/Atria` 性能与长期使用体验优化。先读 docs 分支 `HANDOFF.md`、Governance/AGENTS、`plans/refactor/atria-performance-long-term-experience/index.md`、`implementation-roadmap.md` 和当前 E4 的 `stability-recovery.md`，再读累计 Record。沿用 `refactor/atria-performance-long-term-experience`，当前产品 HEAD `0433bc10c` 是 E4 未完成 WIP；E0–E3 已提交推送，E4 最小检查 58通过/4失败，失败及风险见 HANDOFF。不要重建分支或重复 E0–E3。先补 GC 隔离/重启/租约/并发专项并修复草稿，再连续完成 E4→E7；严格冻结 8阶段30任务，每阶段仅最小相关本地验证、提交推送并累计 Record，不等待 CI 或阶段确认。用户已授权持续非破坏性工作及最终合并 main、验证、删除临时分支；普通失败自主解决。三端/物理S2尚缺证据须如实记录，不伪造。全部完成后按 Governance 集成清理并删除 live HANDOFF。本次交接暂停不恢复为新执行限制。
