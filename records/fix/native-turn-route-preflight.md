# Native turn route preflight — Record

- Task ID: native-turn-route-preflight
- Primary Workspace: main
- Status: Complete
- Plan: 小型局部修复，无独立 Plan / HANDOFF。
- Start HEAD: e8a5b9fba80f68b7aaa05cf4943737fb6a608f28
- End/Tested HEAD: 302edb266c787a8717000e51bbc20f14106ea81a

## Problem and result

2026-10-04，用户配置模型并成功进入 Open Lives 3.0.0，发送“打听一份短工”后出现
`native_generation_route_missing`。三张本地截图中的实际报错是角色路由缺失；另外两张
诊断图仅有 frontend/request 的 request/HTTP 200 事件，不能据此判断是网络请求失败。

自由输入
还需独立 role.intent_resolver 主路由；

Package
preflight 增加 turnRoutes，ready 同时依赖 slots 和 Turn routes；歧义路由进入既有配置恢复提示；新增中文提示。
不自动借用其它角色路由、不发起 inference、不改写用户配置或存档。

## Known limits

在未修改的起始 main 上单独运行同一测试，复现相同失败；不把该既有问题并入本修复。
未声称该 suite 全部通过。

用户实例仍需要配置 role.intent_resolver 路由（可以使用同一模型，需支持工具调用）。实际运行实例的升级/重启
没有执行。

## Final state

实现已推送并快进集成 main；短期 fix 分支与 worktree
在完成记录后删除。无需 live HANDOFF。
