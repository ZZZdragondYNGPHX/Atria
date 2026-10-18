# S26：普通路径的可选计算分配

2026-10-13 基本版补齐 source `507ece8f7`：原留额机制支持server Route明确roles：rerank/model_task/Native background，缺roles兼容rerank；日常路由可配置，本轮没有新模型收益声明。下方首批范围说明保留历史，不将旧“仅Windows/仅rerank”的支持矩阵恢复为当前限制。

状态：2026-10-13 有限普通规则工程及实际质量—成本对照完成，工程source `cedf44330`。充分预算两策略均完成原rerank/正文，5维模型观察通过，未观察成本改善。8实际请求报告12751tokens；37项本地工作中的12项unknown保留。此有限证据证明所选留额机制，不宣称一般检索/Embedding收益。依赖原 G05/G06、S25普通异步路径与 [compute-policy](compute-policy.md)；预测branch/critic、learned/classifier策略不由本组启用，另依赖S24及真实收益证据。

首批深化现有 optional Memory rerank：仍由合法候选覆盖、独立因果来源与currentness规则决定是否有价值，再由服务器实际 RuntimeRoute 的可选 `executionPolicy.optionalWork` 分配共享预算。缺该policy保留固定策略；显式 `mode:preserve_required` 没有 `requiredCompute` 时视为必要工作上界未知，拒绝该可选发送并回退合法基础检索。

`requiredCompute` 是该Route配置者明确设置的必要工作额度（maxRequests/maxTokens），仅证明所配置额度留存，不推导整个Narrator/必需Task图的真实上界或质量保证。未取得实际准备的必要工作上界时不能声称“留一次请求足够正文”。

通过后仍用原charge，不把临时留额写成更小的永久compute limit。普通必要工作继续原发送准入，使用原未花费额度。并行可选调用不能各看同一个余量，失败/取消/重启不退款；policy关闭仅回退原规则，不能恢复已花额度。

配置从server实际Route读取，client computeContext中的伪造policy/余额拒绝。原invocation trace记录optional停止原因；配置/调用预算门禁不作为Agent开发测试审批，测试执行仍归Governance。

controller自身开销与可观察成本归原计量边界，不能由零模型调用宣称零CPU。实际难例质量、延迟与quality-cost收益需要固定配置的真实配对证据，缺失保持pending；
