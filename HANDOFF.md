# Atria Native Orchestration V3 — 换设备交接（Linux）

Updated: 2026-10-18。用户要求推送并交接，在另一台 Linux 设备上完成收尾。停止不代表任务完成；恢复后继续原任务，不新增许可/审查前置。

## 身份与真实 Git

- Task ID / Source branch：`refactor/atria-native-orchestration-v3`；Docs 分支 `docs`。
- Source **`13a510bf2`**、Docs 本交接提交的父版本 **`dba20e670`**，均已推送、工作树 clean。恢复时以真实 Git 为准，以上哈希只是参考。
- 未合 main、未删除任务分支。前一设备（Windows）的路径与 `tasks/…/source` 布局无需照搬。

## 首先读取

1. 真实 `git fetch`/status/log；本 HANDOFF。
2. `records/refactor/atria-native-orchestration-v3.md` 最后两节：「分支内有界回环收口与 P6 余项」「回归清扫、缺陷修复与 P6 收口（续）」。
3. 按需：`plans/refactor/atria-native-orchestration-v3/index.md`、`implementation-plan.md`。

## 环境要点

- 依赖：`source` 与 `source/tests` 各自 `npm ci`。若用 `--ignore-scripts`，需在 `node_modules/better-sqlite3` 运行 `npx prebuild-install`，否则全部 SqliteEngine 用例失败（环境问题，非产品）。
- Jest 必须在 `source/tests` 用：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json <paths>`。`native/a2a-http-client-s31` 与 `native/mcp-http-client-s30` 是 `node:test`，用 `node --test`。
- 慢套件：project-control-fanout ≈8 分钟，project-delegation >10 分钟（可按 `-t` 分块）。
- 派生子进程脚本必须 `import tests/util/config.js`（`endpoints/secrets.js` 加载时读配置）；本轮已为 crash/goal/session-task/restart/C4 补齐。

## 当前状态

- P3/P4 实现与 FS/SQLite 回归已收口；P6 旧编排清退完成。`tests/native-orchestration` 在 Windows 上除 SQL-only 外全部通过；`tests/native` 本分支特有失败已全部修复。
- 用户精简（`c2451035d`/`b5a41a0fa`/`928afba0f`）有意去掉逐读哈希/完整性校验与 `*_final` 二次授权：旧断言已按新合同对齐，**不要恢复**；但写前 CAS 式当前性检查（`unchanged()`）与消费点 Source 重读须保留。
- 最终产品 Gate **NOT_READY**。

## Linux 上待完成（按顺序）

1. 环境与 POSIX 证据：装依赖后跑 `tests/native-orchestration` 全量（含 Windows 未跑的 POSIX-only `rp-native-output` 目录 fsync 用例）。新失败先与 `f7b929151`、`main` 快照对比定性，再修。
2. SQL 引擎：启动隔离 MySQL 8.4 / PostgreSQL（非 root、临时目录，方法见 Record P3 节），按 `storage/harness/contract-harness.js` 所需环境变量配置，跑 `p3-sql`、`sql-administration`、`sql-owner-loss` 及各套件的 Mysql/PgEngine 参数（可按 `-t "MysqlEngine|PgEngine"` 分块）。
3. Browser：`npx playwright test --project=e2e e2e/native-orchestration e2e/atria-shell/05-workspaces.e2e.js`。04/07 shell 规格在 main 上同样失败，非本分支范围。
4. 真实 Provider（若有凭证，按 Docs README §13.1，凭证不入库）：一次 RP/Project 端到端，费用/usage 记录如实。
5. 结果写入同一 Record 新节；Gate 仅在有证据时更新。合 main/删分支须用户明确指示。

## 已知、未在本任务处理

- main 基线失败（main 快照同样失败）：native/studio-http、persona-*、frontend-conversation/heavy、history、enterprise/regional/renewal/lifetime-session、studio-native-envelope-g04、provider-discovery、authority-frontend-c3、long-memory-turn-consumer-g06、long-term-storage、session-skill-continuation head_change、agent-settings；e2e 04-navigation、07-plugins-settings。
- `tests/agent-intelligence/s34-live.js` 仍引用已退役的 `workspace-prompt` 目标（live 脚本，未运行）。
- 无分支内回环正例端到端用例；`rp-context-retrieval-evaluation` 在高并行下偶发 flaky（单跑稳定）。
