# D3：旁白、角色表达与玩家叙述

E2 + A2 + K2 + G1 沿已有 Program、Context 与 V3 实现。

## 表达分工

| 内容 | 使用方式 |
| --- | --- |
| Actor Identity | 角色已有的人格、经历与关系，由原角色资料提供 |
| Actor Cognition | 当前知道、记得、相信与怀疑的内容，由原 Information/Memory 提供 |
| Character Expression | 个体台词、停顿、措辞与语域，按角色表达配置使用 |
| Narrator/Scene Expression | 作者的叙述人称、镜头距离、节奏、描写密度和场景风格 |
| Agent Task/Intent | V3 Node 本轮任务、所需材料与输出；Intent 表达提议，正式事件读取原业务结果 |

全局文风、场景风格与 Narrator/Actor 标记用于表达对象；同一 target 内仍按作者显式序列编译，不以 expression layer 再排序。热烈的旁白不自动使所有角色说话相同，也不改写角色身份或关系。

## 玩家叙述

默认保留玩家的决定、重要行动、同意、承诺与内心选择；NPC 和世界可以依作品规则主动推进。有限的连接动作叙述沿原玩家／Session 操作提供；相应产品操作尚未具备时保留默认行为，具体能力单列实现。

角色知道什么、Narrator 使用什么视角、正文何时向玩家揭示，是作品叙事的不同配置。NPC 推测按推测呈现，角色误解、悬念和多视角写作仍可成立。

## 调用方式

普通 RP 保持 Context → 单 Narrator → 正文。按用户精修要求或原 V3 任务配置调用 Planner/Reviewer/Judge，使用原 Compute 与费用结果。原 Compiler 中已有的 world/memory/narrative 等固定说明也应在 Effective 中可见；相同职责只组装一次，内容随对应来源或任务使用，避免在每条材料前重复加入长段规则。

局部精修保留作者文风、人物差异、历史因果和玩家选择；结果采用走原业务链。可选质量反馈详见[质量模块](quality-evolution.md)。
