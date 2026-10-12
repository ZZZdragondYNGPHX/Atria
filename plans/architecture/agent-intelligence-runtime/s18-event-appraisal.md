# S18：共享事件 appraisal 与动态 Emotion / Relationship

状态：2026-10-12 有限事件 appraisal 阶段出口完成（source `fbe0f5b7a`）。依赖S16、S17已满足；原作者/作品授权保持。实际检查、原连接结果及私有 runner 证据缺失 / 下游重放消费边界归 [最新Record](../../../records/refactor/agent-intelligence-runtime.md)，不宣称S19–S21或完整跨Session恢复交付。

## 原链路与事件准入

沿原lifecycle workflow/明确事件Task、durable outbox、NativeGenerationHost/TaskScheduler和Run/Task budget，扩展原declared_app_command的固定cognition.appraise binding；普通turn只读已有state，不增加轮询/新timer/每NPC默认调用。绑定明确Task Actor context view、允许事件source和字段等值gate、原emotion/relationship domains/commands及可选的作品认知profile精确id/revision/允许维度/maxDelta。无独立profile时使用明确inline default；不创建平行资源authority。

排队时冻结已获准事件item hash、Actor/view/epoch、Task/binding和该Actor的当前目标state hash。付费调用前复验事件、scope/availability、源与旧状态；低重要性事件无付费发送，缺证明/成本不足保留pending/unknown。来源/用户接管在途改变不采纳旧结果，已发生费用保持。只有原author declaration选择的有限Task被触发，retrieval命中不触发更新。

## 一次提案、分别采纳

一次固定结构的候选输出包括significance/rationale和有限emotion/relationship updates。每项引用各自已授权source items；该次明确事件必须在支持内。Actor、base/branch/package/epoch、hash、原实际model/profile/Prompt/Generation refs由Host/source authority绑定，模型不选择写入domain/command或篡改provenance。

经原app.command/CAS分别采纳固定target中获准的组件。关系方向为本Actor对target的状态，不写对方内心；target须在引用的可见数据中出现。支持正负变化，强度/范围沿声明profile和canonical domain baseline，不强制单调亲近/玩家依赖。坏组件逐项拒绝并保存结果，不能冒称整批成功；所有实际采纳同一原Session publication原子发布。旧state保留在原Revision/Task receipt，撤回沿原作者权限与Source guard，不重写Actor stable traits/World。

## 读取与阶段出口

复用Information application emotion/relationship source、当前性和独立displayGrant。作者可只公开text、隐藏内部level和basis，玩家/Task不因owner或共享pass得到private field。Context解释动态情绪、方向性关系与相对数值；它们不是Truth、客观概率或新行为证据。

最小验证：真实FS/SQLite installed workflow/outbox→Task→分项domain command/receipt、正负更新/原state/profile保持、低信息零send、source/actor/epoch/profile/旧state失效、迟到/取消/恢复费用、坏组件拒绝、只读回合/独立display，以及一组必要的原连接结构化appraisal和后续正文消费。保留私有raw、失败、连续2000/20RPM ledger，不重跑原已通过组或不可用DB。S19–S21不冒称交付。
