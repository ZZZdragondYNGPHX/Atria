# ARCH-DWE-01 · 遗留 E0 编号的功能对应

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md) · [同一 Record](../../../records/architecture/world-evolution-consistency.md)。**Draft / Paused**。旧编号保留用于定位现有讨论，不再表示一组必须先通过的审计／验证关卡。

| 历史编号 | 要实现的功能 | 原责任与主要工作 |
| --- | --- | --- |
| E0-01 Subject/Fact | 正式主体身份与关键事实来源 | WP-A/B：受保护 P2 身份，原 Domain Fact owner，最小必要引用 |
| E0-02 Publication | 主体／效果提交与叙事衔接 | WP-A：原 Native publication、Domain Receipt、分次发表和未知结果读取 |
| E0-03 Time/Branch | 当前／历史、纠错、存读档 | WP-B：Revision/领域 Clock、有效区间、合法祖先与来源 |
| E0-04 Perspective | 动态 NPC 的私人视角 | WP-C：原 Information/Cognition/HCM 授权，不借 Narrator 或表达模板读取 |
| E0-05 Claim Context | 旧设定、史料、传闻与当前事实正确使用 | WP-D：EffectiveWorldRead、来源用途／有效性、原 Context/Prompt |
| E0-06 Cutover | 实际旧调用方切到新语义 | WP-A～F：直接使用者同步替换，保留有效业务，不创建兼容双轨 |
| E0-07 Product UI | 世界创作、装配、档案／历史与媒体 | WP-E/F：原 Host/Library/Studio/Play 与统一前端 |
| E0-08 Persistence/Cost | 长会话不全量重放、主体与历史可保存 | WP-B/C/D：最小身份、既有 History、有限调度、局部读取和原存储维护 |
| E0-09 Integration | 对接编排、提示词、视觉及前端 | 对应原服务处理实际重叠接口，不等待无关分支 |

实现顺序由功能依赖决定，不增加“完整 E0 后再做功能”的阶段。实际缺失的 API、写入保护、受众过滤和存档引用是功能工作本身；历史 PASS/BLOCKED、搜索数量及端侧测试状态留在 Record，不在企划里反复要求补证。
