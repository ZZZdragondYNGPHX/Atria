# S15：精确 Actor 身份与作者 profile 投影

状态：2026-10-12有限消费者交付，source `1fb00fa5a`；M3可见范围与接管已按 [M3入口设计](m3-cognition-design.md) 明确。本文沿原 core.actor/project-source、immutable PackageVersion、Native Context 与旧 Session projection，不创建第二Actor或认知仓库。

## 有限物理投影与消费者

原 Actor 保存 actorId/displayName/role、任意合法 JSON profile/metadata；不要求旧包迁移。共享纯投影从当前精确 PackageVersion/EntryPoint的原Actor取得身份。身份固定actorId，source为packageId/packageVersionId/entryPointId和原Actor引用；Session branch/revision只作为本次读取anchor，不把模型ID/Session消息当Actor身份。明确三个数据面：作者description/personality/scenario等旧文本、examples/systemPrompt/postHistoryInstructions等旧表达字段、原样保留的未知JSON字段。分类只是投影，不修改源profile或推断心理字段，旧examples优先/null回落行为保持。

分类数据由纯投影复用，未知JSON保留在原source不额外塞入legacy ABI；临时投影修改不回写manifest/profile，动态states不会覆盖作者设定。无Actor的旧EntryPoint仍原Package名称与空文本，不生成虚构Actor身份；primaryActorId选择和fallback第一Actor沿原EntryPoint，不用姓名或数组avatar充当存储identity。

Native Host只消费EntryPoint中已选定的公开Actor身份（actorId/displayName/role）以及精确来源。该数据不携带任意profile文本、其它未选择Actor、动态cognition或World状态，也不成为Narrator声音指令；已有表达仍由精确PromptProgram/Module管理。含Information时继续原target/view/actorAvailability约束，不能以新身份投影替代原可见信息。无Information的旧Native上下文只带原EntryPoint选定primary/fallback Actor公开身份；Actor目标仅自己的身份。启用Information时新身份不能绕过原candidate replacement：仅所选合法context view显式绑定且available的Actor可带身份，未绑定/缺context grant保持原不投影。没有合法Actor/原授权时不补数据。

不存在额外模型调用、免费旁路或新增writer。未知profile高级字段不会自动升级成Native system指令，角色口吻不会污染Narrator/Project。S16再按Information view接入动态belief consumer；本阶段不预先添加认知更新/接管API。

## 最小相关本地出口

PackageVersion/源定义更换反映新source，branch/fork恢复沿实际旧anchor。未改UI不重跑浏览器。

实施后同一Record报告实际source、consumer、兼容/撤回/恢复证据和限制；通过后继续S16，不把S15或本组commit当默认停止点。

## 实际出口

共享 `native-actor-profile.js` 已被原 Session projection 与 Context compiler 消费。公开身份随精确源进入原 required current-state lane/预算；profile 分类在共享纯投影保留，legacy ABI 使用独立可编辑副本，不回写冻结定义。Information 缺少选定 Actor/context/availability 时没有身份补入。实际 Host preview、更换原 ModelProfile、SavePoint/fork/restore、新安装 PackageVersion 均有本地证据。

初 Host 夹具错误使用不存在的 request ID family 已修正，只重跑失败与改变项；没有外部 API/浏览器。70k 未知字段兼容、null/空 examples、Actor 目标隔离与缺授权、预算拒绝均通过。动态 cognition/writer、自然语言质量与全量迁移不是本阶段交付，继续 S16。
