# ARCH-DWE-01 · WP-A～F 实现职责

[唯一入口](index.md) · [完整实现分工](e0-preflight-execution.md)。本文件沿用旧路径，描述工作包的功能归属。当前 **Draft / Paused**，尚未启动产品改动。

| 工作包 | 实现结果 | 主要原代码落点 | 依赖 |
| --- | --- | --- | --- |
| WP-A 主体／效果 | 开局与新涌现 Subject、正式关系／交易／事件及回执 | SessionCore、session-snapshot、Authority transaction、World reducer、SessionRepo | 前案合流后的原 Native 接口 |
| WP-B 历史／存档 | 事实有效期／纠错、历史读取、Save/Branch/GC | Domain History/Event、Observation、SavePoint/save-system、session-maintenance | WP-A 身份与原提交来源 |
| WP-C NPC／认知 | 动态 Perspective、个人记忆、目标、消息与有限自主行为 | Information/Cognition/ToM、HCM、Goal/Lifetime、Simulation/Task/V3 | WP-A；按功能使用 WP-B 时间与来源 |
| WP-D 世界／Context | 合法当前／历史／Claim/Belief 视图、必要事实进入 Prompt | Knowledge、Context Compiler、V3 ContextPort、PromptCompiler | WP-A/B；个人视角依 WP-C |
| WP-E Play／媒体 | 正式参与者、可见别名、表达模板、语音／图片绑定 | Timeline/contracts、Frontend Host、session-projection、Play、Speech/Visual | WP-A/C/D 的合法投影 |
| WP-F 作者／界面 | 世界自由创作、关键绑定、起点装配／预览、Play 档案与旧入口替换 | World/Knowledge service、Library、Studio editors、Package build、统一前端 | 作者编辑可并行；有效预览依 WP-A/D |

每个包完成相应产品链及其直接使用者；字段与函数落在原 owner，不创建通用 SubjectAdapter、第二 World/FactDB、另一 Shell。某项依赖未接只限制该操作，其余实现继续推进。
