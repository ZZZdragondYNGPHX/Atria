# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Current product branch: `refactor/atria-immersive-workspace`
- Product HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`（D1 无产品源码改动）。
- Current docs branch / HEAD: `docs`；本 D1 持久化提交（读取真实 Git HEAD，不自引用 hash）。
- Current stage: D1 complete; A1 implementation next。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- A1 required modules: experience、states、coverage 的 S00/S01/S18/S19、validation。
- Record: [record](records/refactor/atria-immersive-workspace.md)

## Completed

D0 的 9 模块 Bundle 保持。D1 核对真实产品基线、冻结 P01–P06 与 Native Persona schema/API/CAS、Session/输入/retry、Context/任务过滤、Shared/Host、迁移账本、Save v3/现有备份扩展；validation C20 为待实现测试设计。用户已授权开工及普通问题自行处理，关键处理方式简要通报，不重复索要常规确认。

远端已 fetch；main/docs 已 fast-forward。产品任务分支已创建并推送，整个多阶段任务沿用。尚未开始产品实现，S00–S20 均未完成本任务验收。

## Pending / next target

A1：按现有 tokens/Environment 改造浮动外壳、五域/子路由、共享反馈/审阅骨架、分组搜索、认证/学习、设置/全局诊断；保留原 authority/控制器和离开草稿路径。实际新增能力差额记录到所属模块，不用模拟内存替代持久化。完成本地最小相关验证、push、同一 Record/HANDOFF 后停止。

## Key decisions

D01–D20 不重开；P01–P06 见 decisions。Native AUTO 换行与显式 send_on_enter 配置在 A2 统一。Persona 是 A4 新增能力，A1 不提前开放占位入口。FS 不支持整批 rollback；retryReply 有两条分支边界；旧 Persona JSON 无版本/头像/绑定。详细契约只读 personas 权威模块，不建立平行 Prompt/Session/备份 authority。旧整站迁移仍退役。

## Validation

D1 仅本地文档链接/路径/矩阵/阶段一致性与本任务 diff whitespace 检查；源码静态核对不等于产品合约通过。未运行产品测试、构建、E2E、真机/IME、模型实发或远端 CI。用户要求各阶段及任务完成时仅本地最小相关验证，不发起或等待远端 CI。

## Read first / preserve / do not repeat

核对真实 Git/远端 → 本 HANDOFF → index → A1 指定模块 → Record D1 限制。不要全量扫描历史/skills/reference，不重复 D0 原型讨论或 D1 契约审阅，不把旧任务 Complete 当成本任务验收。

保留产品 AGENTS.md 以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 的原有 dirty changes；提交仅包含当前任务文件。package 不是产品源码，本轮未改。不要在 package 实现 UI 或将 main merge 进独立长期工作空间。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 A1。先核对真实 Git 状态，读 docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → experience/states、coverage S00/S01/S18/S19、validation，再读同一 Record 的 D1 限制。D1 已冻结且用户授权开工/普通问题自行处理，无需重问 D01–D20/P01–P06。产品分支 refactor/atria-immersive-workspace@783bb6fd3，尚无本任务产品修改。A1 保留原控制器/authority，不提前开放 Persona；每阶段只运行本地最小相关验证，完成实现/验证/push 后更新同一 Record/HANDOFF 并停止。
