# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Current product branch: `refactor/atria-immersive-workspace`
- Product HEAD / tested content: `f56b3d8526507719353d5905b0148eb5d4d1d56a`；已 push，未合并 main。
- Current docs branch / HEAD: `docs`；本 A1 持久化提交（读取真实 Git HEAD，不自引用 hash）。
- Current stage: A1 complete; A2 next。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- A2 required modules: experience、states、coverage 的 S02–S08/S17、validation。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 A1。

## Completed

D1 契约/P01–P06 冻结保持。A1 已实现浮动 Rail/顶栏/Focus/Dock；compact 阅读底部导航隐藏、顶栏五域与全局工具可达；分来源/owner 搜索重试、过期错误与原查询返回；navigation authority 草稿离开检查及 Library/Runtime 成功回执。学习、设置、账户、诊断继续使用原控制器。Persona 未开放；平台 serif 目前仅 token。

用户已授权分阶段开工、普通问题自行处理并简要说明。产品阶段提交和 docs 阶段记录已持久化/push。整个多阶段任务沿用当前分支，S00–S20 全矩阵和最终集成仍待后续阶段。

## Pending / next target

A2：继续/最近会话与作品入口、正文与悬浮输入、历史/回合动作、Library 分类/详情/安装与存档依赖恢复；保留 World/Knowledge/Prompt 全部字段与 Source 编辑器、exact 版本、现有 Session/revision authority、自有 UI 字体和独立宿主恢复。按 P01 统一 Native AUTO 换行和显式 send_on_enter 配置，并补 Shift/modifier/IME/229 验证。实际能力差额记录所属模块，不用模拟内存替代持久化。只运行本地最小相关验证，完成实现/验证/push 和同一 Record/HANDOFF 后停止。

## Key decisions / carry forward

D01–D20 不重开；P01–P06 已冻结。A1 来源失败仅重试对应来源/owner，exact 主域查询优先于 Skill 子串；返回搜索保持原查询。离开确认取消保留原控制器/字段，确认离开丢弃；没有跨路由自动草稿存储。A2/A3 须继续核对控制器内部换页的草稿与修订边界。

Persona 属于 A4，不提前添加入口。FS 不支持整批 rollback；retryReply 两条分支、旧 Persona JSON 限制和 Save v3 见 personas 权威模块，未实现/未验证。不建立平行 Prompt/Session/备份 authority；旧整站迁移仍退役。

## Validation

A1 针对性本地 unit/lint/语言覆盖通过。8 suites/52 tests 是排序/回执轮；最终 guard/Library 修改另跑 4 suites/13 tests，再补 Library 保存成功但刷新失败场景 1 suite/6 tests（计数重叠）。7 个不同 Chromium 导航/工具场景最终通过，320px runtime 搜索排序首轮失败已修复复验。Expanded/Medium/compact、深/浅色、Context Sheet、仿真键盘、查询返回/草稿 Back 与真实 fixture 诊断导出/复制失败有局部证据，命令和限制见 Record。

截图在产品 `tests/.e2e-scratch/a1-*.png`（ignored，仅本地）。阅读挂载与草稿 browser 场景使用 DOM fixture；不能代替完整 Session/编辑器验证。未执行完整 E2E、全量测试、构建、真机/WebView/中文 IME、真实模型或远端 CI。每阶段/任务仅本地最小相关验证，不发起或等待远端 CI。

## Read first / preserve / do not repeat

核对真实 Git/远端 → 本 HANDOFF → index → A2 指定模块 → Record A1。不要全量扫描历史/skills/reference，不重复 D0/D1 或把既有完成状态当成本任务验收。A1 已完成，不重建另一套外壳/搜索/authority。

保留产品 AGENTS.md 以及 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原有 dirty changes；提交仅包含当前任务文件。package 不是产品源码，本轮未改。不要将 main merge 进独立长期工作空间。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 A2。先核对真实 Git 状态，读 docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → experience/states、coverage S02–S08/S17、validation，再读同一 Record 的 A1 结果与限制。产品分支 refactor/atria-immersive-workspace@f56b3d852，A1 已实现/验证/push，用户已授权开工和普通问题自行处理，无需重问 D01–D20/P01–P06。A2 保留完整编辑器、exact Session/资源 authority、自有界面与宿主恢复，实施 P01 输入策略；Persona 等 A4。每阶段只运行本地最小相关验证，完成实现/验证/push 后更新同一 Record/HANDOFF 并停止。
