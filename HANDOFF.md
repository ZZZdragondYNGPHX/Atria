# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Current product branch: `refactor/atria-immersive-workspace`
- Product HEAD / tested content: `2d0df2cef1d5580358555f553203a9cf5616700a`；已 push，未合并 main。
- Current docs branch / HEAD: `docs`；本 A2 持久化提交（读取真实 Git HEAD，不自引用 hash）。
- Current stage: A2 complete; A3 next。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- A3 required modules: states、coverage 的 S09–S16、delivery 的完整编辑保留清单、validation。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 A2。

## Completed

D1/P01–P06 冻结保持；A1 浮动外壳/搜索/导航与离开 guard 保持。A2 完成继续/最近会话、独立 Library install/import-save 流程、exact 依赖恢复（匹配旧版本且保留新版默认）、真实写入回执/只读重试、历史预览的 fork/switch/retry 接线与只读/生成/过期禁用、退出草稿取消/确认/继续。平台正文 serif、显示名首字头像回退/消息序号、悬浮输入 no-blur 回退及 P01 AUTO/显式 Enter/Shift/modifier/IME/229 已接；未接受草稿失败恢复与实际 Stop 保持。

World/Knowledge/Prompt 保留原完整字段/Source/闭包与权限；内部 Back、preset 上层 Back、成功后刷新失败补齐。独立 Full recovery 随原 Runtime capability 更新并重验。用户已授权分阶段开工，普通问题自行处理；产品阶段提交已 push，docs 阶段 Record/HANDOFF 本次持久化。S00–S20 全矩阵与最终集成仍待后续阶段。

## Pending / next target

A3：创作、运行配置、智能体与扩展接线。保留 20 视图/全部 Source、资源页引用 Attach/Fork/Update/Review detach/Used By、人工 Apply vs Agent Commit；Runtime 全角色路线/exact ref/Secret/Embedding/Rerank/compile 与缺项修复返回原任务；Agents 固定 Session 范围/Run/Memory/Diagnostics/四编排模式完整字段；扩展 Skills/Plugins/官方插图管理与会话工具入口。按真实 controller/call graph 补能力差额，不建立平行 authority。只做本地最小相关验证，完成实现/验证/commit/push 和同一 Record/HANDOFF 后停止。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 也可直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复同 Session/基准 revision；已提交输入不重发。Stop 不被 submit pending 状态禁用。

Library flow 通过同一导航 authority 原子进入 domain/child；匹配依赖安装不改变已有默认，import 前再次预检。已保存/安装/导入的 receipt 不因刷新/打开失败重放。历史 Explore branch 只筛选列表；先 Preview exact revision 才操作该分支，switch/fork 仍由 Runtime/CAS 决定。列表查询为当前 controller 内的 UI 状态，不是持久化 authority。

内部/跨域离开取消保留原字段与 Source，确认丢弃；没有跨路由自动草稿存储。A3 继续核对 Studio/Runtime/AI 长任务内部导航和 revision 边界。Persona/第四分类/Host picker 属 A4；头像当前首字回退。FS 不支持整批 rollback；Persona retryReply 两条路径、旧 JSON 限制与 Save v3 仍见 personas 权威模块，未实施。旧整站迁移保持退役。

## Validation

A2 最后一轮 15 suites/73 unit tests，通过后两项最终小修改分别复验 2 suites/9 tests（Library inventory 部分失败）和 1 suite/12 tests（pending submit 的 Stop）；计数重叠，最终 75 个不同用例有通过证据。12 个不同 Chromium 场景最终通过：真实阅读/继续/Save、320px/中文/横屏、安装权限重试、World/Knowledge、history fork/switch/退出草稿、加密 Save 旧版本恢复且保留新版默认、Full recovery、390px preset module/Regex。初始 flow 路由失败与 history 测试缺 Preview 已修复复验，详见 Record。ESLint/本地语言覆盖/diff whitespace 通过。

未执行全量测试、完整 E2E、构建、真机/WebView/中文 IME、真实模型/远端 CI。实际 Save 往返为隔离 FS fixture；Full recovery 为宿主 fixture，不冒充完整 custom-font/shared-seat 验收。阶段截图和 fixture ignored，本地证据；未提交用户数据或生成产物。

## Read first / preserve / do not repeat

核对真实 Git/远端 → 本 HANDOFF → index → A3 指定模块 → Record A2。不要全量扫描 Plans/Records/Skills/reference，不重复 D1/A1/A2，不把局部验证当 S00–S20 集成完成。

保留产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原有 dirty changes；提交仅任务文件。package/plugin/skills 未改，reference 未读。不要将 main merge 进独立长期工作空间。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 A3。先核对真实 Git 状态，读 docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → states/coverage S09–S16/delivery 完整编辑保留清单/validation，再读同一 Record 的 A2。产品分支 refactor/atria-immersive-workspace@2d0df2cef，A2 已实现/本地验证/push，用户已授权普通问题自行处理。推进创作、运行配置、智能体与扩展接线，保留全部编辑器/Source、exact authority、人工 Apply 与 Agent Commit 的边界；不要提前开放 A4 Persona。每阶段只做本地最小相关验证；完成实现/验证/push 后更新同一 Record/HANDOFF 并停止。
