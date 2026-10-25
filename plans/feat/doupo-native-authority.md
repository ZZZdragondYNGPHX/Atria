# Doupo Native authority 接纳扩展

> 执行规则入口：[Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

Task ID：`feat/doupo-native-authority`。Primary Workspace：独立产品源码工作树。游戏与主线之间不迁移资产；关联 [package 任务](../package/doupo-living-world/index.md)。

目标是让首批生活世界复用原有 Native 权威，修正实际接纳阻碍：单记录 privateReads 无法接纳有界人物/关系集合；动态 Subject 作为模型评价 target 被 manifest Actor 检查拒绝；完整 computation 状态在 invariant 中重复传入使二十四人目标样本超过消息预算。规则评价还需要宿主提供真实 anchor 以通过现有 Cognition 来源与分支验证。

只扩展现有 grant/typed computation 路径：集合声明明确字段、最多 256 个结果、可选标量筛选与原记录哈希，扫描与值字节仍计入原预算，超限拒绝而不静默截断。computed 路径允许受 schema 限制的数组下标。invariantContext 明确选择已存在的上下文，invariantReads 只缩减原 grants 的字段，不新增读取授权。Subject target 复用 hasPerspectiveIdentity，保留自评拒绝、来源引用、Host 交付证明、CAS 和未知身份拒绝。

由执行代理验证声明拒绝、字段隔离、排序、哈希、筛选前扫描计费、超限、scope 失效、原有单记录与 computation、模拟、评价和 Session 恢复。测试实现只留本地。没有独立审查或额外审批。源码任务结果与实际 HEAD 归 [Record](../../records/feat/doupo-native-authority.md)，游戏结果仍累计到同一 package Record。

2026-10-21 补充：关系读取可用先前已授权字段中的有界 ID 数组，和标量谓词显式取交集或并集；仍计费全量扫描，不提高预算。Bridge 的作者声明可选择 deterministic transaction，经同一 SessionCore prepare/publish、真实 action receipt、CAS 与存档提交，避免内部后续步骤触发模型。稳定玩家机械锚点同时用于普通生成与确定性提交，原 invocation 的重试不改变随机结果。
