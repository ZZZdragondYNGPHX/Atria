# D7 · 可选质量反馈、误拒诊断与候选采用

D7 已确认 Q2/F2/O2/P2，沿原 Experience/Eval/Evolution、PromptCandidateStore 与 V3 Publication 实现。本模块描述**用户可选的产品功能**；普通编辑、保存、导出、选择预设和正常生成不等待质量认证，也不默认运行 Judge 或优化循环。[实现分工](backend-implementation.md) · [功能依赖](e0-audit.md)。

## 1. 用户如何使用

1. 用户可对实际文本／任务给明确偏好或指出问题；接受、重生和编辑等操作仅作为观察，不自动等于负面评分。
2. 按需打开诊断，分清文笔／风格、角色、上下文、事实、运行错误、Provider 拒绝与未知原因。
3. 用户主动精修或原获准质量任务需要时，调用已有评价／候选功能；仅对获准的 Prompt 文本目标提出局部修改。
4. 查看原文与候选差异、适用来源、变化维度、费用及影响；按原 Review/Publish 选择采用，不自动改活动 Run。
5. 作者仍可直接手动改稿、分享和选择版本。没有质量来源就显示未评价，不把它包装成已认证，也不禁止普通创作。

## 2. Q2：质量维度与硬错误分别展示

| 类型 | 展示的内容 |
| --- | --- |
| 文学表达 | narrative_craft、pacing、scene_progression、long_horizon_consistency、authorial_style_fidelity，含句式／意象、重复、伏笔与作者偏好 |
| 人物 | actor_voice、voice_distinctness、continuity、promise_application；身份、经历与角色声音的连续性 |
| 玩家与信息 | player_agency、knowledge_boundary；正式授权／来源／披露错误不由文笔均分抵消 |
| Agent 任务 | 任务证据、完成度、输出契约、工具使用与成本；提案不冒充实际提交 |
| 创作响应 | unwarranted_refusal、narrative_response；作者合法要求是否被无端回避或淡化 |

单场景只使用适用维度；报告注明来源／Case、模型／Route、版本、范围和未知项，不合成一个掩盖所有差异的总分。默认模板和“官方”标签只说明出处，不自带跨模型文学认证。

## 3. F2：诊断与归因

复用原 Experience，区分 authenticated 用户显式偏好、客户端操作观察、Host/Receipt 技术结果、模型 Assessment 与 unknown。Regenerate 不直接证明用户不喜欢文风，运行完成不证明文学优秀，模型自评分不自动等于独立评价。

原诊断按 `prompt/context/state/runtime/evaluator/model/unknown` 指向问题。只有可归因于获准 Prompt 文本的局部缺陷进入候选；缺来源、分支过期、Context 漏选、业务 bug、Provider 固定限制或评价器问题回到相应功能处理，不无限叠加提示词。

## 4. O2：合法成熟虚构创作的响应诊断

- 区分 Provider 协议明确拒绝、模型疑似回避、回答但淡化作者文学诉求、普通文笔问题与未知；不靠“抱歉”字符串作确定判断。
- 保留作者的合法成年虚构、情感、浪漫、欲望与强文学表达，不因主题标签自动说教或统一压低文风。
- Provider 实际限制、玩家授权、Source/World 权限仍由原服务处理；内容拒绝不静默换模型／供应商。Route 选择由用户决定。
- 可选评价报告标明场景、语言、Provider 适用性与正反控制来源，不以降低所有拒答率为目标，也不生成绕过外部限制的攻击候选。

来源与方法背景见 [research.md](research.md)。本模块不把语料收集、模型对照或误拒实验编成开发本功能的前置工程。

## 5. P2：原候选与发布链

```text
获准反馈／局部 Prompt 诊断
  → 原 EvolutionTargets / PromptCandidateStore
  → 原服务支持的可选评价与相应发布资格
  → 原 Review
  → 新 exact Module / immutable PlanRevision
  → 原 PlanBinding CAS / publication journal
  → 下一次获准 Run 采用；活动 Run 保持原版本
```

- 文本候选只改获准 Module/文本目标；Tool、Model、Source Grant、Budget、OutputOwner、World/Actor 事实不随其提权。策略变化走原 V3 `plan-strategy` 范围。
- 原 Preset/Route 候选应用与 V3 `plan-prompt` 采用各走本领域接口，分享文件不自动触发任一执行／发布路径。
- Module/PlanRevision 已保存但 Binding CAS 冲突时沿原 journal 处理，不能覆盖并发选择；回滚也使用原 exact/current CAS，不重放业务效果或费用。
- 开发样例、作者试读与支持自动晋升的独立来源分别标记；不得把同源改名或模型自评冒充独立质量依据。缺来源只影响对应自动评价／晋升／认证，不为用户强加第二模型审批。
- GEPA 类反思与多目标选择仅作为原 Evolution 可配置策略；普通 RP 保持单 Narrator 优先，无默认逐轮反思、Judge 或自动发布。

## 6. 保存、分享、发布与采用

原 Library/Project 保存修订，导出形成可移交的可编辑依赖包；原 Authority 发布可供消费的版本；Game/Route/Agent/Play 再显式选择采用／升级。这四类动作分别反馈。

发行包保留 Program/Module/Generation/Regex 的合法依赖与来源线索，不含 Secret 或私有会话内容。沿原 import/export 实现本地 identity mapping，重复导入不按名称覆盖。新发行版以 exact base/candidate 与私人 Fork/Derive 的三方差异处理升级；歧义时保留两份并让作者选择，不自动跟随 latest。游戏 Package 仍是原 Build 冻结的运行闭包；不新增线上市场、订阅、身份认证或自动同步。

官方基础／作者共享／私人派生是来源分组，不是新的权限系统。普通游戏作者可以直接采用现成资源；缺质量认证不会阻止手动保存、导出、分享和合法使用。

## 7. 实现归属

原 QualityProfile/Experience/Eval 实现维度、来源与报告；原 Candidate/Evolution 实现局部建议；V3 Repository/Publication 负责 PlanRevision 与 Binding；Library/Studio/Play 负责相应界面。后端不具备的具体可选操作列为接线项，其余编辑、模板、预览、发行和前端继续实现。实际结果记同一 Record，不以质量报告或模型实验替代功能交付。
