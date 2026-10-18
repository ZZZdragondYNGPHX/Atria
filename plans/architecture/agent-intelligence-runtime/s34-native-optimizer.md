# S34：原 Prompt optimizer 的轨迹准入与回归评价

2026-10-13 基本版补齐 source `507ece8f7`：原学习→current trajectory→candidate/evaluator→review/publish/rollback基本产品链路保留；补预算/RunControl/execution utils源pin，源码变化拒旧报告。双域旧真实tie不晋升与人审/价格约束保持，权重训练未选。下方首批范围说明保留历史，不将旧“仅Windows/仅rerank”的支持矩阵恢复为当前限制。

首批后端为已有 `EvolutionEvaluator` / `AgentEvolutionService`，固定 adapter ID `native-prompt-optimizer-v1`。只接原 `workspace-prompt` 与 `project-prompt` 声明字段、原 `review` 模式；不新增训练平台、模型权重 writer、独立发布器或新费用账本。依赖 [S33](s33-learning-export.md) 的元数据轨迹以及 S08/S10 原候选、评价、发布、撤回权威。

2026-10-13 双域有限真实pilot完成：修复隔离Studio Skill入口后，21次HTTP200共报告84484tokens；连首轮失败累计23次/89950tokens。两域各一个development pair的原Host输出、隔离和target消费通过，模型观察均tie，未观察到改善；候选保持awaiting_review、原晋升gate拒绝、未发布。

认证调用 `POST /evolution/start-learning` 必须明确 `purpose: prompt-optimization`、backend、scope、subject、原 Evolution expectedSequence 和 S33 trajectory。只允许时间戳不同。过期、撤回、纠正、源变化、伪造标签、跨 owner/scope、任意正文或字段均拒绝。

元数据仅用于准入及持久 provenance。既有普通 Job 不能因 dedup 被追认成轨迹优化 Job；来源 pin 不同需明确冲突。

提炼、候选准备、独立 baseline/candidate 评价、费用、失效、取消和恢复沿原 S10；没有新自动发布入口。原发布和回退仍走各自精确版本/CAS；样本少、未知费用、质量退化或缺失偏好不能被 adapter 转为 eligible。

真实有限 pilot 使用当前测试连接和原统一限流，提炼/对照与失败、费用如实归同一 Record。合成 transport 或单次有限模型观察只证明其对应范围；完整 M7 晋升与长期收益须依据原真实评价结果，不以 adapter 接线或 mock 宣称完成。
