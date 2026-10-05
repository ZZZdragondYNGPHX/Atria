# B3 — Agents, Memory and Trace mapping

基于 B2 实现前后同一产品分支；先映射再修复。保留现有 dedicated inspector、graph/timeline、Memory 四页与 Trace，不建立新的 preset/runtime/Session authority。Shared description 保持停用。

| 表面 | 全字段/动作/模式/输出与 authority | 状态与验证门 |
| --- | --- | --- |
| Orchestration presets | spec/loop/agenda/director；factory/new/restore/single-agent/save/validate/duplicate/import/export/delete；id/name/mode/planTemplate/bindings；原 createPresetAuthoring→updatePresetLibrary→settings save；native preset immutable，仅 duplicate 自定义 | 原 scope/settings 身份复验、离开 dirty guard；新增 Source 原文保留与独立候选验证，不让 invalid JSON 毒化 Fields；禁止未 Apply Source 被 Save 悄悄丢弃 |
| Preset inspector | name；budgets maxSteps/maxTasks/maxConcurrency；agenda maxPlannerRounds/maxTotalRuns；spec entry、spec/agenda output owner、arbitration/allowPartial、nodes kinds/agent IDs、edges；完整 Native Plan JSON | 原 compileWorkspacePreset/workspaceHostProfile；Source 与 Fields 使用同一 transient draft；关闭/重新打开 inspector 保留尚未 Apply 原文；错误就近 alert |
| Agent inspector | name/instructions/nativeRouteRef；capabilities全 registry/工具组及 '*'、allow/deny、工具搜索；节点 metadata/spec/stage、状态与角色；add/delete/splice/owner guard | 原 route picker、effectiveCapabilities、removeWorkspaceAgent/编译器；conditional graph surgery 要显式修复，禁止删 final owner；四模式 targeted contracts |
| Bindings/defaults | 原当前 scope 可用绑定目标、bind/clear、enable、Runtime owner 跳转 | captured settings/scope/status 复验；迟到弹窗和旧 checkbox 不写新 scope；原 native route/default authority |
| Run | 摘要、graph/timeline/node/step/paging/clear、live状态及输出 | 原 runtime events/run view，不替换执行器；保留 readonly 与缺 run |
| Memory overview/knowledge/sources | Memory OS/Memory/Recall/自动抽取压缩/recallMethod；原 advanced settings/schema/route配置；query/type/history；entity/relation/fact、episodes/providers/corrections 与 evidence | 原 memory-graph workspace ports/snapshot.assertCurrent/Session作用域；graph加载/失败/空态/有限显示；迟到 load 不回写旧表面 |
| Memory maintenance | history/rollback/compress/vector rebuild/import/export/refresh/reset；原高级设置原完整契约 | 原 service 的 Session/branch/revision/确认 guard；新增 pending 去重与 dispose 防护；不取消原 destructive confirmation，不跨会话清空 |
| Trace | export/import/replay/live、20MiB限制、事件/calls/recalls/metrics/details | 原 runtime trace parser/replay；同一scope普通 redraw可完成导入，Session 切换迟到导入不可污染新scope；离线 replay 不运行模型 |
| Studio Agents/Memory | 完整 Project source JSON与字段 | 原 stageProject/project.save/human ChangeSet；与运行设置 authority 分开，不新持久化 |

代码入口：agents/orchestrator/workspace/{orchestration/page,orchestration/permissions,memory/page,diagnostics/page,panel,host-presets,agent-editing}.js、native/agent-settings.js、agents/memory/native-routing-ui.js。现有字段控件符合设计，局部修复具体状态差额。验证按 all four modes/permissions/budgets/remove owner/Trace/Memory scope/unit 和真实 Native browser；实际数量与限制只见同一 Record。
