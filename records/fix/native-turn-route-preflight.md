# Native turn route preflight — Record

- Task ID: native-turn-route-preflight
- Primary Workspace: main
- Status: Complete
- Plan: 小型局部修复，无独立 Plan / HANDOFF。
- Start HEAD: e8a5b9fba80f68b7aaa05cf4943737fb6a608f28
- End/Tested HEAD: 302edb266c787a8717000e51bbc20f14106ea81a
- Package verification harness HEAD: dbb3f30b2b6ec052039a6788409d4a99266ac925

## Problem and result

2026-10-04，用户配置模型并成功进入 Open Lives 3.0.0，发送“打听一份短工”后出现
`native_generation_route_missing`。三张本地截图中的实际报错是角色路由缺失；另外两张
诊断图仅有 frontend/request 的 request/HTTP 200 事件，不能据此判断是网络请求失败。

只读核对用户实例确认其运行 e8a5b9fba，仅有一个 role.narrator（正文）路由。自由输入
还需独立 role.intent_resolver 主路由；两个 authored purpose 都绑定正文路由仍可通过旧
preflight，因为它只验证 Task slots，没有验证隐式 Turn lanes。

修复在同一 Generation Host/RouteResolver 上检查所需主路由与 capabilities。Package
preflight 增加 turnRoutes，ready 同时依赖 slots 和 Turn routes；Session lifecycle prepare
也执行相同检查并保留 revision barrier。UI 显示具体 Intent resolver/Narrator 缺项并禁用
继续，重新检查成功后才保存绑定并启动。歧义路由进入既有配置恢复提示；新增中文提示。
不自动借用其它角色路由、不发起 inference、不改写用户配置或存档。

## Local validation

- 两个直接相关 Jest suites：22/22，通过缺失路由、重复主路由、tools 能力不足、
  完整用途绑定仍失败、补齐路由可继续、保存前再次失效、无 inference/无 Session mutation。
- Authority integration C4：FS/SQLite 18/18 在实现过程中通过。按本地环境禁用未启动的
  MySQL/Postgres harness，未启动外部数据库或远端 CI。
- 变更 JS 文件 ESLint、git diff --check 与 Package 脚本 node --check 通过；main ESLint 通过。
- main 上运行真实 stdio Atria MCP 的定向 smoke，捕获/审阅/安装精确 3.0.0 包并读取路由；
  owning HTTP preflight 复现 narrator-only false readiness 并检查添加 Intent resolver 后 ready。
  0 次模型请求，不创建 Session、不启浏览器，不要求用户操作设备。
  [结构化证据](native-turn-route-preflight-evidence/mcp.json)。
- 3.0.0 archive SHA256 保持 98e5208b1013370bd377b278d089a8e9f231d507df0a0ce6df0124591649db24，历史 releases 未修改。
- Core AGENTS.md 与 docs 四个既有 dirty 文件的差异快照逐字保持；用户游戏运行实例未重启。

## Known limits

最初扩大检查 task-runtime-p3 时，发现旧 P3 Model Execution Lane fixture 缺少
sessionCore.runs，产生 Cannot read properties of undefined (reading 'assert')。
在未修改的起始 main 上单独运行同一测试，复现相同失败；不把该既有问题并入本修复。
未声称该 suite 全部通过。起初未关闭的 MySQL/Postgres 检查因无本地数据库失败，
后续只验证 FS/SQLite。

用户实例仍需要配置 role.intent_resolver 路由（可以使用同一模型，需支持工具调用）。
main 的修复属于提前检查和明确提示，不会自动补齐个人配置；实际运行实例的升级/重启
没有执行。没有验证用户付费模型、Android 或实体设备。

## Final state

实现已推送并快进集成 main；Package 定向验证入口已推送；短期 fix 分支与 worktree
在完成记录后删除。无需 live HANDOFF。
