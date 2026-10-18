# S21：认知、保存恢复与正式 Tick 消费

状态：2026-10-12 所选有限消费者出口完成，source `c73bad012`。依赖 [S20](s20-memory-applicability.md)、[M3](m3-cognition-design.md) 与所选 G06；实际结果、首组正文失败和有限评价只归同一 [Record](../../../records/refactor/agent-intelligence-runtime.md)。完整 HM3/任务不由单阶段升级，不重跑未受影响的历史阶段。

2026-10-13 source `f4815c727` 补完一个真实连续场景：6个正式Turn，第3回合后FS保存并portable导入SQLite，再续写3回合；原历史、公开认知和费用保持，exact replay不重发。7次HTTP200共47484tokens，六段各7维模型观察和恢复连续性均通过。场景由作者沿原writer推进，light记忆保持模糊；只证明这条有限连续链路，不等于500次真实生成、自主appraisal或一般长期收益。

认知继续保存在原 Lifecycle domains，由 Session writer/CAS 裁决。恢复或 fork 只从原 immutable coherent Revision 复制状态；在新分支内按原 exact Actor/Task view、当前 source fingerprint 和有界依赖顺序重新绑定有效 basis。失效、撤回、过期和不可见证据不被修复；历史 Revision、World Truth、行为、费用和作者设定不改写。

原 Save closure 继续携带 cognition、Clock、来源和历史。ordinary version 3 Save 可携带原 RunContinuation 的 foreground/background/retiredCompute，跨干净存储恢复 known/unknown 和 local work；同机独立花费不能被旧 archive 覆盖。旧无费用的 Save 保持兼容，缺失历史费用仍为缺失，不反推或补造。此产品运行数据与开发私有测试资料保留规则分别由原 Save authority 和 Governance 管理。

Session owner、操控 Actor、author JSON 与导入 Save 不能替代作者证明。player disclosure 只消费原 player view，inspector 不混入普通 display/context。已有 raw Session/load 与完整 portable archive 是原本地可信编辑/持久化接口，本阶段的有限投影 API 不宣称将整个旧接口重构成玩家安全传输边界。接管继续原 typed writer/CAS；

自主 NPC 由作品显式 Simulation job 选择原 background appraisal Task，使用原 Information context、事件 capture、outbox、Host sealed adoption 和 compute bank。只有合法 Clock 实际推进才准入；大跳仍受原 maxJobs/maxSteps/maxDeliberations 限制。纯读、线上等待、无推进、关闭 job/策略、过期 scope、回滚/晚到与无预算不能产生新正式效果；pending 与已经发生的成本保留。没有新 timer、全局默认自主开关或独立心理 writer。

授权 inspector/普通 player 投影分离；原 Simulation 与实际 Host 的 Tick 跳跃、无推进、关闭、缺预算和晚到。再在新临时 fixture 内执行实际原连接长期场景正文，审查来源、连续性、玩家自主权、叙事声音与实际费用；失败和 unknown 归 Record，不用 mock 或本地投影代替正文质量证据。独立人工偏好或未取得的长程材料保持 unknown。
