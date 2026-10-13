# Atria 性能与长期使用体验 — 累计 Record

- Task ID：`refactor/atria-performance-long-term-experience`
- Plan：[冻结总纲](../../plans/refactor/atria-performance-long-term-experience/index.md) / [E0–E7 路线](../../plans/refactor/atria-performance-long-term-experience/implementation-roadmap.md)
- Primary Workspace：产品 `main`；施工分支 `refactor/atria-performance-long-term-experience`
- 授权：2026-10-13 用户明确要求连续实施全部 8 阶段 / 30 任务，最终合并、验证和清理。
- 当前状态：E0 完成，继续 E1；E1–E7 尚未完成。

## E0 — 主线准入与本地基线（E0.1–E0.4）

- Start / baseline HEAD：`73c7913b22daae98b6348fad0f3eee1cfce1f080`；End HEAD：`885916c45`，已推送。
- Git reflog 证实 `feat/agent-compute-runtime@f4815c727` 快进合入 main；祖先检查通过，最新本地/远端 main 一致。
- 环境：CachyOS，Linux `7.2.9-2-cachyos`，x64，i7-11800H，16,477,622,272 bytes RAM；Node `24.21.0`、V8 `13.6.233.17-node.53`、ABI `137`。better-sqlite3 本地加载及真实写入成功。声明 `engines >=20`、`@types/node ^18.19.84` 与实际版本区别记录；Windows / Termux 尚无本机证据。
- 新增离线生产仓库基准 `tests/performance/native-long-term-bench.mjs`：100/1k/5k 正文，原始世界状态，SavePoint 三次派生分支、精确 20 条范围读取、GC 保留断言，以及带可核对答案的 Memory 排名。夹具走实际 SessionCore/SessionRepo/FS/SQLite，不创建旧数据兼容器；后续新格式复用同夹具。
- 3 次暖缓存样本的 P95 ms（小样本诊断，不是产品 SLA）：

| Engine / 消息 | Load | Range 20 | Append | GC |
| --- | ---: | ---: | ---: | ---: |
| FS / 100 | 17.47 | 3.39 | 29.07 | 1.38 |
| FS / 1k | 120.16 | 8.61 | 218.97 | 0.58 |
| FS / 5k | 531.82 | 31.05 | 1084.05 | 0.63 |
| SQLite / 100 | 10.75 | 2.62 | 23.94 | 3.30 |
| SQLite / 1k | 86.84 | 9.47 | 179.16 | 0.89 |
| SQLite / 5k | 413.73 | 33.22 | 927.78 | 0.97 |

- 排名 P95：100 / 1k / 5k = 3.58 / 12.67 / 54.17 ms。fixture 批量创建亦计入 event-loop monitor，P95/max 9504.29 ms，不能冒称为真实交互 P95。
- 问题排序：全历史加载/校验和每提交全 Timeline 复制随规模增长；Range 仍读取全量选择数组；检索重复词袋/图准备。S2 正确性优先于这份耗时排序：SQLite NORMAL、FS 多文件回调事务、Blob 目录落盘、HEAD 后 RunControl、Chronicle 截断/铁人死亡清理必须先解决。
- 决策：默认引擎、跨设备阈值、压缩与 Worker/WASM 暂不冻结。相关定向回归须保持全文、世界、分支、来源权限和精确预算，测同一设备/夹具且保留样本条件；出现实际回归需诊断，不以自设百分比停止。E1 将覆盖 dependency/prepare/publish/ACK 切点及 receipt 不确定返回。
- 实际最小验证：上述基准完整运行、`node --check`、`git diff --check`。未执行全仓测试/CI。
- 待证：浏览器 T0–T4/输入/滚动/DOM、Windows、Termux、物理断电、真实 Provider 费用/RP 质量和小时级内存。进程故障测试不能冒充 S2 设备证明。
- 下一 checkpoint：E1 durable 合同、SQLite FULL、FS journal/原子发布/恢复、资产目录屏障与幂等提交。
