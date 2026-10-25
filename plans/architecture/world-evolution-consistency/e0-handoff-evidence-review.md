# ARCH-DWE-01 · P2 身份存储选择与最小数据

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

[唯一入口](index.md) · [物理实现](e0-gate0-physical-contracts.md)。W21-B 已确认 **P2 优先**，具体字段不是预先存在的 API。当前 **Draft / Paused**。

| 方案 | 功能与取舍 |
| --- | --- |
| P2：同一 SessionRevision 的受保护 SessionState | 独立于某一本 World 的形状，支持 Worldless／多 World；原 stateHeads/Save/GC 可承接最小身份。只保存身份与来源，不重复业务事实。无专用 World delta 压缩，因此保持内容小，不预先引入分区引擎 |
| P1：`atri_world_state` 的受保护子树 | 与原 World delta 接近，但必须同时处理所有原写入口与 WorldScope。仅在实际实现发现其改动更小且满足相同功能边界时提出替代；不与 P2 并行上线 |

## 必须表达的数据

- **SessionSubject**：稳定 ID、类别、合法 origin、Session/World 作用域、原 admission/Revision 来源。名称与可见别名是表达／信息投影，不能代替身份。
- **DomainFactLink（仅在必要时）**：所属主体／关系与 Domain FactKey、已提交来源、无法从原事件推导的有效区间／结束／更正关联。值由原 Domain 读取。
- **EffectiveWorldQuery**：合法 Session/Branch/Revision、可用时的领域 GameTick、范围与查询用途；实际 Audience/Grant 来自原 Host 授权，不能由请求正文自证。

不要求每种逻辑引用另建 ID family、资源表或持久对象。字段命名、引用复用、提交生成时点与原 schema 整合由执行者在原实现中完成。具体实现分工见[WP-A～F](e0-preflight-execution.md)。
