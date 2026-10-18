# D6：Context、角色视角与长会话

U2 + E2 + H2 + V2：消费原 Context/Information/Memory 的结果，Prompt 负责表达和装配。

## 依消费者提供材料

Narrator、角色、Project Agent 与 Judge 使用各自任务的 Context。沿原 Source/Actor/Audience/Branch 选择结果，不在 Prompt 层重做检索或保存第二份角色记忆。

Narrator 的视角、NPC 已知内容和正文揭示时机各有作品语义。角色猜测以猜测呈现，旁白风格不改角色知道的事实。Anchor 和 Contribution 的匹配、顺序与去重详见[D5](semantic-ir-lowering.md)。

## 历史、当前事实与角色认识

保留原材料携带的来源、时间和认识状态：正式状态、已发生事件、观察、信念、传闻、许诺、假设、争议和未知各有含义。这里只消费现有字段，不新造一套 Memory schema。

历史台词“我会还钱”说明当时说过；正式债务及清偿状态读取原领域。已经成立且仍有效的债务不因这轮未召回旧话而消失。角色是否记得、愿不愿偿还另读角色认知。旧承诺的历史记录也不自动证明今天仍未履行。

## 长会话

沿原 lanes、required、atomicGroup、minima/caps 选择当前状态、人物身份、有效承诺、未决因果和最新输入，再纳入完整近文、Narrative Spine、Memory/Knowledge 与表达参考。使用原 Context 分配和 Provider 最终计数。

保留压缩材料已有的来源、覆盖与遗漏信息；剧情摘要不覆盖 Timeline 和正式状态。必需内容装不下时指出缺少哪组材料，让用户调整模型容量或选择范围。分支切换、资源修订和继续运行使用原业务的当前 Context。

普通 RP 一次 Narrator Context 足够时沿单次路径。检索、重排和额外模型调用只按原任务需要发生。
