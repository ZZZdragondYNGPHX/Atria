# Atria 长会话与产品交互 — Native Play / 旧楼层操作退出

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第 7 轮源码审计及新产品设计讨论；**不在此文件授权执行产品删除操作**。
- **源码快照**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`；后续实施须以实际集成后的 `main` 复核。
- **相关权威**：[index.md](index.md) 为 S2/硬切换/增量历史/阶段路由的冻结原则；[runtime-storage.md](runtime-storage.md) 为 Revision、存档和无损保留的底层契约。

## Responsibility

本模块负责 P1 长会话/Native Play 的 UI 交互范围，以及第七轮用户新提议：**退出 SillyTavern 旧「单条消息/楼层 Swipe、Delete、Hide」产品操作，剧情路线主要通过 SavePoint/Load/Branch 管理**。

用户已经明确倾向将这些旧操作彻底移除，特别是 **Delete 及 Swipe 均由存读档机制替代**，每次从历史存档继续应代表可能分化的新路线。此为明确产品方向；是否连 Native `Restart From Here`/`Re-enter Turn`/`Retry Reply`/`Fork from Revision` 的公开入口一起移除，属于第七轮待细化边界，不能擅自猜测已经获批。

## 实际源码核对（不是实时 UI/真机验证）

| 机制 | 代码证据 | 确认事实及产品边界 |
| --- | --- | --- |
| SillyTavern Swipe 控件 | [`public/index.html` L7927-L7995](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/index.html#L7927-L7995) | 旧 Message Template 仍有左右箭头、swipe picker 等 |
| 旧 Swipe 可执行实现 | [`public/script.js` L18254-L18276](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/script.js#L18254-L18276)、[`swipe-picker.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/swipe-picker.js) | 非 Native 路径仍有完整 Swipe 操作；对已提交 Native 消息，`swipe()` 明确调用拒绝逻辑 |
| 旧 Delete | [`public/script.js` L3771-L3835](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/script.js#L3771-L3835)；[`public/scripts/messages.js` L168-L255](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/messages.js#L168-L255) | 仍有单/批消息 `splice` 与 patch 存储路径；`deleteMessage` 明确拒绝 Native 已提交消息，其他通用 API 的调用方/覆盖仍需逐路径审计 |
| 旧 Hide / Unhide | [`public/scripts/chats.js` L185-L209](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/chats.js#L185-L209)、[L2157-L2167](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/chats.js#L2157-L2167) | **Hide 改变 `message.is_system`，即是否纳入 AI Prompt，并非单纯将 DOM 隐藏。** 该函数没有直接 `denyCommittedAction` 检查；后续 `patchChatMessages` 在 Native 模式转向 Native persist（不把旧消息 patch 当权威），但内存投影仍可能受调用影响，因此需清理语义入口，不可直接视为 Native 正式状态已安全更新 |
| 旧当前聊天批量工具 | [`public/script.js` L20595-L20634](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/script.js#L20595-L20634) | 旧 UI 包含批量 Hide/Delete，但 [`resolveChatStateTarget` L11908](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/script.js#L11908-L11910) 在 Native active 时返回 null；批量工具有只读门槛 |
| Native 显示层 | [`public/scripts/atria-shell/native-play-host.js` L49-L107](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/atria-shell/native-play-host.js#L49-L107)、[`public/css/atria-shell.css` L1918-L1937](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/css/atria-shell.css#L1918-L1937)、[`public/scripts/native/play-product.js` L29-L65](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-product.js#L29-L65) | Native Play 使用独立 Conversation/Composer，旧 `#sheld` 以 **1px、不可指针交互** 的隐藏生成 ABI 存在；Native 正文 `messageNode` 没有旧楼层 Swipe/Delete/Hide 按钮。这些旧代码存在不等于正常 Native 产品界面暴露 |
| Native 消息权威 | [`public/scripts/native/session-runtime.js` L332-L345](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/session-runtime.js#L332-L345)、[`src/native/session-core.js` L792-L795](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-core.js#L792-L795) | 已提交 Timeline 不支持旧式直接改写/选择出生 Variant；但不可因此删掉所有名为 Variant 的 Native 数据契约 |
| Native 原生“绕过存档点”操作 | [`public/scripts/native/play-controls.js` L269-L312](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-controls.js#L269-L312)、[`src/native/session-core.js` L912-L965](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-core.js#L912-L965) | 原生 UI **仍提供 Restart From Here / Re-enter Turn / Retry Reply / Fork from Revision**，功能创建分支而非直接销毁已提交历史；但可以绕过 SavePoint 选择任意早期位置，是否保留需本轮讨论 |
| Native SavePoint 恢复语义 | [`src/native/session-core.js` L1004-L1044](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/native/session-core.js#L1004-L1044)、[`public/scripts/native/play-controls.js` L240-L255](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/scripts/native/play-controls.js#L240-L255) | 现有 Load SavePoint **已经非破坏性地从存档 Revision 创建派生 Branch**（如果当前根已经等于该 SavePoint 则返回当前）。旧路线保持不变，符合用户期望 |
| 相近但不同的操作 | [`public/index.html` L8194-L8196](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/index.html#L8194-L8196) | 图片左右翻页/image swipe 只是媒体浏览；删除 Session、Project、SavePoint 是资源管理，不属于逐楼层删除，**不能凭关键词扫描一并删掉** |

## 明确的用户意图（第七轮）

- 不再让旧单楼层 **Swipe** 替换已经生成的回答；剧情不同路线由读档后创建/进入不同 Branch 实现。
- 不再让旧单楼层 **Delete** 清理最近若干消息伪造回退；撤销剧情选择通过 Load SavePoint 与继续分支。
- 不再允许旧单楼层 **Hide/Unhide** 随意调整已经确认的历史对模型的可见性；应按原生权威上下文规则解决 Prompt 收录，而非修改消息的 `is_system` 位。
- 这项设计只清理**玩家剧情正文的旧楼层突变**，并不授权删除项目/会话/存档管理、媒体切换、已提交历史的只读浏览、生成前草稿编辑，也不应删除数据库中的合法 `Variant` / `Branch` 语义。
- 项目仍处 dev 阶段，无需旧格式、旧楼层操作的双读写或兼容层；但实施时应追踪旧 API、快捷键、Slash Commands、插件宿主以及 Native hidden ABI 的消费关系，避免在移除旧功能时破坏实际生成和投影链。

## 第七轮需要明确的产品边界（**尚未冻结**）

**设计 A：严格存读档驱动（推荐与用户当前意图最一致）**

- 产品界面移除旧 Swipe/Delete/Hide，以及 Native 层绕过 SavePoint 的 `Retry Reply`、`Restart From Here`、`Re-enter Turn` 和任意 `Fork from Revision` 快捷入口。
- 保留 `Inspect History`（只读）、`Load SavePoint`（从保存根创建新分支）、`Switch Branch`（选择现有路线）；需要新路线先生成/选择明确的 SavePoint，再从那里继续。
- 保留“仅对**未提交失败生成**重试”的正常错误恢复，避免把真正失败重试也当成 Swipe 删除。
- 存档默认为定期创建且可配置；允许玩家手动存档和置顶，明确区分“每回合已经 S2 落盘”与“是否方便从此点开始一条新路线”。

**设计 B：清理旧 Swipe/Delete/Hide，但保留显式原生 Fork/Retry**

- 对比 A：仍可直接在任意 Revision 创建新 Branch；不丢历史，技术上安全，但玩家不需要预先放置 SavePoint，可能弱化存读档的游戏玩法语义。

**设计 C：用户模式/权限约束两者**

- 标准游玩仅允许 SavePoint 加载；制作/调试模式允许直接 Fork 具体 Revision。需要新增模式/权限边界、UI 解释和测试，不能自动假设这种复杂度值得引入。

**需要区分的额外问题**：
1. Swipe 移除后，只读 `Reply Variants` 预览是否继续保留？若只反映真实分支历史，则它不是旧 Swipe，但可能因命名与 UX 混淆而需要统一到 Branch/Timeline。
2. Hide 可能涉及“临时调试 Prompt 内容”；建议将合法的上下文内容纳入显式编译策略或 Studio 调试层，而不是保留单条消息自由隐藏入口。
3. 整个 Session/Branch/Project 删除（释放磁盘空间）应保留独立资源管理能力，不与删除单层楼混淆。
4. 若玩家两次从同一 SavePoint 继续，新 Branch 的状态/权威根应分别独立；是否自动改变随机种子确保生成差异，不在此轮先拍板。

## 需要的最小验证（未来实施才执行）

- Native Player 界面中无旧 Swipe/Delete/Hide 或绕过规定 SavePoint 的入口；旧 DOM ABI 不再提供可触发的已提交消息突变，非 Native 路径也不保留独立隐藏入口。
- 旧高层 API/Slash Commands/键盘/批量工具无法悄悄篡改 Native 已提交的 Timeline、上下文权威与 Revision；不等于删除独立文件/素材的常规管理 API。
- Load SavePoint 后出现新分支、旧 Branch/HEAD/世界状态与正文内容保持可达；Switch Branch 恢复完整一致的世界状态。
- 撤销失败/取消的**未提交**生成不会影响已保存回合；空闲/有界后台维护不诱发重复回复。
- 分析与验证只覆盖实际修改的模块和关键安全边界，不要求不相关全仓测试或真人实时 UI 证据。

## Material design changes

- 2026-10-13 / 第七轮：根据用户明确诉求新增模块并登记审计，待讨论「严格存读档驱动 / 保留显式 Fork / 模式分级」三种产品边界；未修改产品代码，未做浏览器真机验证。
