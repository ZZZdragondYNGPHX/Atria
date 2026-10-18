# S12：目标 criteria、完成证据与失效

## 有限契约

依赖已交付S11。复用AgentEvidenceService的原Scope/selector、capture/evaluate、当前authority双读、字节/扫描边界与原EvidenceSet；不新增事实图、judge或成功标签来源。

- Goal的criteria/invariants固定。唯一source最多32个，每criterion只对原可见值执行固定path/equality，不执行表达式/脚本，不把描述文本或模型自述当判据。
- RP message criterion只能证明选定可见正文的精确物理输出，不能证明当前World/Actor事实；Native artifact仍须原只读context grant、当前branch/input/dependency；Project Task须原正式Task state/receipt/revision，model attempt completed不改Task事实。
- Actor desire尚无S17认知完成writer，不从聊天声明自动宣布满足；本组保存明确blocked，不借用户执行权限。
- 前后capture/evaluate及Goal sequence CAS通过才记录observed criterion proof；只保存原reference、结果/缺失code与观测时间，不复制正文。所有criteria满足且invariants成立才completed；
- 原证据失效后不能靠旧status绕过。新的Run complete、外部complete、公开成功字段均无完成写入口。
- 原Goal定义、声明budget和既有账本不可变；fork/rollback拒绝旧branch证据，相关改动/删源撤回完成，不用“最新”绑定或复制旧source到新scope。

S13自动消费者必须先接原Run/Task localWork和budget/currentness。不能据此宣称新Goal所有CPU已计量。

## 当前有限结果

实际HTTP evaluate、原Task正式receipt+Project当前field组合、RP精确物理正文、Actor blocked、真实读中fork及metadata发布后fork、源变更/删源/权限/IO分类、invariants和pause/cancel均有本地证据。readonly读源失效返回stale投影，不私自写bank或原doc。

Project field沿原Studio source+原Evidence adapter双读，只限project/package/worlds/knowledge/knowledgeBindings/dependencies及安全固定path，不扩到Runtime Profile/Secret；无Source正文持久复制。整个Goal唯一source上限仍原32，criteria/invariants共用一份coherent EvidenceSet。实际费用、Actor认知完成和自动续跑不由本组交付，详见Record。
