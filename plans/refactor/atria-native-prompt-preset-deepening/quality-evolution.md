# D7：可选反馈、候选与采用

Q2 + F2 + O2 + P2 沿原 Experience/Eval/Evolution、PromptCandidateStore 与 V3 Publication 实现。用户可以独立编辑、保存、分享和运行预设。

## 用户流程

1. 对实际文本／任务给偏好或指出问题；重生和编辑仅作为操作记录，不直接等于负面评分。
2. 按需查看文风、人物、上下文、运行结果与费用；无结果显示“未评价”。
3. 用户主动精修或原质量任务需要时，使用已有评价和局部候选功能。
4. 查看正文差异与适用目标，沿原候选应用或发布操作采用到下一次运行。

## 维度与归因

| 内容 | 可选观察 |
| --- | --- |
| 文学表达 | 叙事技巧、节奏、推进、长期一致性与作者风格 |
| 人物 | 角色声音、差异、经历连续性与承诺应用 |
| 玩家与信息 | 玩家自主权、角色知识与揭示时机 |
| Agent 任务 | 完成度、材料、输出、工具结果与成本 |
| 创作响应 | 协议拒绝、自然语言回避、表达淡化与文风偏离 |

沿原 Profile 返回适用维度、来源和版本；不自行生成总分。普通运行成功只说明完成了对应操作。

原诊断的 `prompt/context/state/runtime/evaluator/model/unknown` 用于指向具体问题。Context 漏选、业务 bug 或 Provider 参数问题修对应实现，不靠堆积 Prompt 掩盖。合法成年虚构表达按作者要求保留；用户自行选择 Route。

## 候选与版本

Preset/Route 候选沿原 PromptCandidateStore；V3 `plan-prompt` 沿 Module → PlanRevision → Binding，保留原 publication journal 与冲突反馈。用户手工改稿仍沿普通保存路径。候选只改声明的目标，采用后在下一次运行生效。

原 Profile 缺少对应来源时，仅该评价／自动候选操作显示具体缺项。反馈、文本编辑、导出、手选版本和正常生成继续使用。GEPA 类反思属于原 Evolution 的可选策略，普通 RP 默认单 Narrator。

分享与私人派生升级统一见[作者体验](preset-studio-experience.md)，不在质量功能内另造发行流程。
