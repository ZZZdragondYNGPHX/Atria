# 本仓库测试资产仅本地保留

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

## 2026-10-19 — 远端分支清退与规则落盘

- Task ID：`chore/local-only-tests`；Primary Workspace：main 源码工作空间，其他长期分支仅作本次同一清退任务的资产辅助工作空间。
- 用户明确要求：本仓库远端不保留测试；除非用户要求上传，测试一概只留本地，即使要求上传也应进入用户指定的专用测试仓库。
- 执行前 main / 视觉功能分支 / package / plugin 已有仅从索引取消跟踪测试的暂存变更，远端仍跟踪这些测试。先前 Termux 两笔存储修复提交没有上传新测试，但没有清退远端既有测试。

| 分支 | 本次清退文件数 | 实际提交 |
| --- | ---: | --- |
| main | 1470 | `727003268` |
| feat/native-visual-generation-deepening | 1236 | `9faf98a97` |
| package | 4 | `2dd7fb3ed` |
| plugin | 26 | `764d9c24f` |
| skills | 26 | `137887e70` |

- 清退范围包括测试目录、测试专用配置/fixtures、Android `src/test`、`*.test.*` / `*.spec.*` 和 Package smoke 测试脚本。原产品运行时 Eval/fixture source、类型规格和 Inspector 功能保留，它们不是仓库测试实现。
- 所有删除采用取消 Git 跟踪，本地文件保留。Package / Plugin / Skill / 视觉功能分支逐文件核对操作前后 SHA-256 一致；main 原 1470 项索引删除不触及本地文件。未上传本轮或此前新增的本地回归用例。
- 五个有测试资产的分支都加入共享忽略规则与 AGENTS 约束，docs Governance §12 保存完整规则；docs 和 feat/agent-intelligence-plan 原本没有测试资产。
- 不合并 main 到独立 package / plugin / skills；各分支各自提交、沿用原产品代码和资产，保留活跃视觉任务。临时语义分支提交后快进对应长期分支，未重写历史、未删旧 Tag。
- 以原子 push 同步五个分支，并对远端分支 tip 逐一枚举验证，确认本次测试路径规则匹配数为零。规则清退不需要运行产品测试；测试仍可在本地使用原安装依赖执行。
- docs 原未提交视觉参考继续保留。工具箱 cwd 修复在独立任务分支继续推进，按本规则仅上传产品脚本。
- skills 辅助工作树迁到长期 skills 工作空间，保留其本地测试文件和相对源码路径；未因清理临时任务而删除唯一的本地副本。
