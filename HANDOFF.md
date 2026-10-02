# Live HANDOFF — Native Package 首启模型用途修复

- Task ID: fix/native-package-task-binding-preflight
- Primary Workspace: main 产品源码 / fix/native-package-task-binding-preflight
- Branch / HEAD: fix/native-package-task-binding-preflight @ 542e926e2c4a0e05769bce0c7631932becacaafc，已 push
- Stage: 普通修复的 CI / 最终集成；非多阶段 Plan
- Plan entrypoint/modules: 无独立 Plan
- Record: records/fix/native-package-task-binding-preflight.md
- PR: https://github.com/ZZZdragondYNGPHX/Atria/pull/102
- main 当前基线: e8d0b983f；尚未合并本任务

## 已完成

21 个产品/测试/workflow 文件在 1d352701a 提交，542e926e2 仅加强真实包刷新等待断言；重新运行实包回归并检查最终截图通过。Works 在 Session 创建前配置去重模型用途，复用玩家 settings、RouteResolver/Runtime Route picker；旧 INVALID Session 提供配置/reload 恢复；能力与 scope 严格校验保留。真实包启动超时通过既有 resource endpoint 批量精确读取解决，不放宽 Ready timeout，不修改游戏 Package。

本地 130 个不同单元/集成用例通过（分组见 Record），4 个通用 Edge E2E 通过；精确 1.0.0 release E2E 通过，Full app.root 在角色创建 Step 1/6 即显示。全产品 lint、变更测试 ESLint、双中文 localization、diff 检查通过。48 个 MySQL/Postgres 场景因本地无数据库服务无法执行成功，不要声称通过。CI 既有 env 禁用这两项外部依赖。

## 关键证据与边界

- Exact release: package:original-occult-western-fantasy-game/releases/1.0.0.atria（package HEAD 79447c0b8）。未改 release 或游戏逻辑。
- 原始用户 Task 要求已从前序 chat 附件核对；无需再从头定位 native_task_binding_missing。
- 原始 1.0.0 首次数据读取可与 Ready revision 竞争并显示 bridge_revision_stale；现有 Refresh record 已验证成功、错误清除。此独立现象没有扩展修复，须在最终报告如实说明。
- 真实首启监听 DELETE，未发现 409；不声称重现未知原始 DELETE 动作。
- CI connector 无 ChatGPT 登录，不能使用；该仓库公开，可用 fetch 公开 GitHub REST API 读取 checks/jobs，不需凭据，不要用 source-control CLI 读取 CI 诊断。

## 未完成 / 下一目标

1. fetch 并核对真实 PR head、main、docs 与干净工作树。
2. 对上述精确 HEAD 查询必要 CI。最新 runs: 36954666510 (Atria PR Checks), 36954666602 (Native Model Prompt Runtime), 36954666525 (Authority Transaction), 36954666502 (Native Frontend v3)。最新 HEAD 的 Migration Guard 已成功，其余运行中。旧 1d352701a 上除了 Model Prompt integration 外已成功，但不能挪作最新 HEAD 的通过证据。耗时 CI 是唯一剩余依赖，本轮按停止条件结束，不长轮询。
3. 若失败，读取具体 job/annotation，修复普通代码或 workflow 问题，更新同一 Record。
4. 必要 CI 成功后合并 PR 到 main（普通 merge），fetch/pull main，核对集成树与已测实现，运行相称 main 验证，删除远端/本地临时分支。
5. 更新 Record 的 CI 与最终 main HEAD，完成后删除本 HANDOFF，commit/push docs。

## 开始前必读 / 不要重复

真实 git status → 本 HANDOFF → 对应 Record；涉及 merge/文档生命周期按 docs:README.md 完整治理。不要扫描其他 Plans/Records/reference。不要重做已通过且代码未变的回归，不要改 Package、创建平行绑定 authority 或删除 lifecycle 校验。

## 接手提示词

继续 fix/native-package-task-binding-preflight，PR #102，head 542e926e2。实现和本地真实 1.0.0 Full UI 回归已通过。读取 docs:HANDOFF.md 及 records/fix/native-package-task-binding-preflight.md，检查必要 CI，成功后合并 main、验证并删分支/实时 HANDOFF；如实保留外部数据库未运行和初始 bridge_revision_stale 可刷新恢复的说明。
