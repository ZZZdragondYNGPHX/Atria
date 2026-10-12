# M3 入口设计：身份投影、认知可见范围与接管

状态：2026-10-12 已明确采用原作者/作品授权的可见范围与接管，M3 入口设计冻结；S15 有限身份消费者已交付，S16 有限cognition/Disclosure消费者已交付，S17 有限Desire/Intention与Goal关联已交付，S18 有限共享事件appraisal已交付（实际范围见 [S18](s18-event-appraisal.md)/Record），S19 有限一阶/二阶ToM已交付（实际范围见 [S19](s19-theory-of-mind.md)/Record），S20 有限因果轨迹/Memory applicability/遗忘已交付（实际范围见 [S20](s20-memory-applicability.md)/Record），S21 尚未交付。实施前置仍为 delivery §5 的 G06 验收与本设计冻结（已满足）。本文只细化已批准的 Actor / Information / Context 方向，不将研究能力或草案声明为已实现权限。

## 1. 当前代码与 S15 的有限交付

`src/native/contracts.js#assertActor` 保存精确 actorId/displayName/role 与原 JSON profile。`core.actor` 的 authoring authority 为原 project-source。`public/scripts/native/session-projection.js` 将 description/personality/scenario/examples/systemPrompt/postHistoryInstructions 投影到旧角色文本；普通模型更换不创建 Actor。Native Context 沿 `public/scripts/native/context-compiler.js` 和原 Host adapter 消费选定数据；Information 的 actor availability、view、source、exposure 在原 shared contract/runtime 裁决。

S15 沿这条链增加可检查的身份投影：固定 actorId、PackageVersion/Project revision、原 profile 内容指纹与来源；稳定作者设定、表达资源、运行期状态分域。没有明确分类的旧 profile 字段保留为原 scoped 数据，不猜测迁移成心理数值或写入动态状态。旧角色/Package 必须继续可读，源编辑沿原 authoring revision/CAS 生效，模型/Session 输出不能回写作者设定。Narrator 风格继续由精确 PromptModule/Program 指定，Actor 文本不自动覆盖 Narrator 或 Project 风格。

S15 的最小验证是旧 profile 原样兼容、两 Actor 身份/表达隔离、模型切换身份不变、原 PackageVersion/Branch/source 修订与撤回、真实 Host 选择/编译。只测试受影响本地 consumer；没有认知 writer 或 UI 变化时不增加付费调用和浏览器组。

## 2. 推荐的认知可见范围与接管

推荐沿原权限开放：作者在有原 Project authoring 权限的工作空间检查/修订自己作品的稳定设定；运行期私有 cognition 仅在作品显式授予的 inspector/Information view 内可见。普通玩家取得原 display/disclosure 投影，不因拥有 Session、切换模型或发出自然语言要求而自动取得其它 Actor 的私有状态。多角色原 actorId/scope/branch/exposure 守卫保持。

接管优先复用已有 authoring/运行控制：有明确控制授权的人可暂停认知更新、查看获准状态的来源和旧值、撤回或显式修订动态状态；每次修订仍带 actor、scope、base revision 和原因，沿原 state writer/CAS 保存。暂停不删除成本、原消息或 World Truth。玩家对自己操控角色的选择继续属于玩家，但操控角色本身不自动授予所有私有 cognition 的读取/改写权限。NPC 自动提案不得覆盖用户的显式接管，恢复后从当前正式状态继续。

已采用以上“原作者/作品授权接管”。玩家操控角色不默认新增完整私有认知读写权限；各阶段沿现有原授权实现。该取舍对应 [decisions R5](decisions.md#r5--两种认知控制权)：“认知状态的可见范围和 user takeover 在 M3 冻结前明确。”

## 3. 后续 S16–S21 的权威与停止出口

S16 消费原 Information / Hybrid 合法来源，Exposure、Belief、Disclosure 分域；belief 可以错误，不能以自己被保存为真而写入 World。S17 关联原 Goal 与角色意图，角色愿望不授予 Task/World effect。S18 用获准事件提出共享 appraisal，S19 在有界一阶消费者成立后再接二阶假设；他者假设不写成对方真实内心。S20 用原 source refs、revision 和 Memory applicability 串联因果/遗忘，不新建第二事实图。S21 通过原 Save/export/rollback、权限分离的 inspector 与正式 World Tick 验收恢复和有限自主。

默认事件驱动、轻度遗忘与作品可选自主/深度遗忘维持既有冻结语义。认知更新沿原 Run/Task scheduler 与已有显式 computePolicy；无授权事件、合法来源、配置或额度时保留 pending/unknown，不每 turn 固定多发模型。具体记录字段、事件合并/失效、ToM 容量与阈值在各 S 阶段按真实 consumer 深化；本设计没有偷偷设置新的 API 配额、模型表、全局 NPC 自动权限或金额上限。

进入各阶段前按同一 Plan/Record 固定实际 consumer、source/撤回/恢复和最小相关验证；阶段出口通过后继续已授权工作。认知状态的具体字段/消费者按阶段深化；本入口权限决定已满足，不再逐阶段重复询问同一授权。
