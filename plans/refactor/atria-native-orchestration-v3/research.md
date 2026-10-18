# 第一轮公开技术调研（官方原始来源）

以下是**设计参照**，不等于 Atria 实现，也不代表当前框架提供对 Atria 的开箱兼容、性能/安全收益或测试通过。

| 参照系统 | 一手来源 | 设计价值 | Atria 不应直接照搬的部分 |
| --- | --- | --- | --- |
| OpenAI Agents SDK | [Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)、[Handoffs](https://openai.github.io/openai-agents-python/handoffs/) | 将「Manager 以 Agent-as-tool 委派」与「Handoff 真正移交对话控制权」区分；最终输出归属明确；可混合 LLM/Code 路由 | 不直接替换 Atria 的 Host Session/预算/权限/世界写入链路 |
| LangGraph (JS) | [Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph) | 显式图状态、checkpoint 边界、恢复/interrupt、人类审批、按错误类型路由；节点粒度决定重复工作的风险 | Node checkpoint 重跑与外部副作用的准确一次/幂等并非天然等价；需原 Effect receipt |
| Anthropic | [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)、[Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) | 简单可组合 workflow、routing、parallel、orchestrator-workers、evaluator-optimizer；用真实任务质量/开销来判断是否需要多 Agent | 不把所有 RP 回合变成多模型链，也不把 Judge 意见视为正确世界事实 |
| Microsoft Agent Framework | [Workflows](https://learn.microsoft.com/en-us/agent-framework/journey/workflows)、[Checkpoints](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)、[HITL](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop) | 对 checkpoint 包含 executor/pending requests 的粒度划分；审批请求和恢复事件可追踪 | 不迁移到第二套 Workflow storage/权限体系 |
| Mastra | [Durable Agents](https://mastra.ai/docs/harness/durable-agents) | 在 TS/JS 语境中区分 pending/paused/suspended/running 快照、审批与进程恢复路径 ||

## 可采纳的跨框架共同做法

1. **两种委派要拆开**：`delegate` = 调用受限专家且父 Agent 保有最终控制权；`handoff` = 交出指定阶段/回合的控制权。二者的上下文、权限与输出 owner 不同。
2. **确定性与模型控制共同存在**：静态条件/依赖/权限/预算无需模型决定；真正动态任务才由 Planner 提议并通过 schema/admission。
3. **状态与副作用分开**：checkpoint 能记住执行点，但不能凭「可重启」证明一个远程提交没发生；外部 Effect 要保留 durable identity、receipt 与 reconcile/unknown。
4. **Human-in-the-loop 是原生等待状态**：请求持久化、明确的批准主体与 scope、重启后可重显，不靠页面仍打开作为保证。
5. **质量优先但成本有证据**：用隔离评估比较单 Agent、选择性并行/审查、复杂动态图，而非假设更多 Agent 一定更优。
6. **可解释的结果引用**：结果来源/效力/版本和是否可以发布由 Host 判定，模型不能自授权限。
7. **分层观测**：执行 checkpoint、用户可见 Run timeline、长期 Experience evidence、Provider usage 是不同信息/保留域。

## 结论与限制

第一轮选择 **自研 Atria Orchestration V3（方案 B）**，复用现有基础，不把任何外部框架升级为唯一执行依赖。
