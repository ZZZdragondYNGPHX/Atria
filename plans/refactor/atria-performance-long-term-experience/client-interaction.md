# Atria 长会话与产品交互 — Native Play / 旧楼层操作退出

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第 9 轮讨论稿。第七轮严格方案 A 和第八轮混合自动存档 C 均已获批准；尚未执行产品代码修改。分支命名、管理与游戏模式权限待讨论。
- **源码快照**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`；后续实施须以实际集成后的 `main` 复核。
- **相关权威**：[index.md](index.md) 为 S2/硬切换/增量历史/阶段路由的冻结原则；[runtime-storage.md](runtime-storage.md) 为 Revision、存档和无损保留的底层契约。

## Responsibility

本模块负责 P1 长会话/Native Play 的 UI 交互范围，以及第七轮用户新提议：**退出 SillyTavern 旧「单条消息/楼层 Swipe、Delete、Hide」产品操作，剧情路线主要通过 SavePoint/Load/Branch 管理**。

用户已批准**严格方案 A**：玩家正式游玩阶段移除旧楼层 Swipe/Delete/Hide，并且同时移除 Native `Restart From Here`、`Re-enter Turn`、`Retry Reply`、任意 `Fork from Revision` 玩家快捷入口；从明确的 SavePoint 加载派生新 Branch，已有分支允许切换。游戏路线可因此分化，但不强制每次读档生成不同文本。

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

## 第七轮产品边界（**用户已批准方案 A，尚未实施**）

**设计 A：严格存读档驱动（第七轮正式定案）**

- 产品界面移除旧 Swipe/Delete/Hide，以及 Native 层绕过 SavePoint 的 `Retry Reply`、`Restart From Here`、`Re-enter Turn` 和任意 `Fork from Revision` 快捷入口。
- 保留 `Inspect History`（只读）、`Load SavePoint`（从保存根创建新分支）、`Switch Branch`（选择现有路线）；需要新路线先生成/选择明确的 SavePoint，再从那里继续。
- 保留“仅对**未提交失败生成**重试”的正常错误恢复，避免把真正失败重试也当成 Swipe 删除。
- 存档默认为定期创建且可配置；允许玩家手动存档和置顶，明确区分“每回合已经 S2 落盘”与“是否方便从此点开始一条新路线”。

**设计 B：清理旧 Swipe/Delete/Hide，但保留显式原生 Fork/Retry（已否决，仅供历史对照）**

- 对比 A：仍可直接在任意 Revision 创建新 Branch；不丢历史，技术上安全，但玩家不需要预先放置 SavePoint，可能弱化存读档的游戏玩法语义。

**设计 C：用户模式/权限约束两者（未选，不作为现阶段产品要求）**

- 标准游玩仅允许 SavePoint 加载；制作/调试模式允许直接 Fork 具体 Revision。需要新增模式/权限边界、UI 解释和测试，不能自动假设这种复杂度值得引入。

**实施时须区分的能力边界（严格 A 下的关键要求）**：
1. Swipe 移除后，原生只读 `Reply Variants` 预览不得再暴露或暗示可直接切换到另一楼层；只读真实分支历史可以保留并统一命名为 Branch/Timeline。
2. Hide 对应的上下文控制不得改写已确认 Timeline 记录（旧 `is_system`）；合法的上下文排除/压缩应放在 Native Context 编译与 Studio 诊断规则中，不要留下楼层突变 API。
3. 整个 Session/Branch/Project/SavePoint 删除（释放磁盘或管理玩家自己创建的资源）仍是独立资源管理，不能因为去掉逐楼层 Delete 而误删；手动存档不被自动 GC 覆盖与用户主动删除它并不矛盾。
4. 两次从同一 SavePoint 读档应分别产生有效分支和相互独立的后续状态；文本结果可能相同，不应默认修改随机种子以强制不同走向。

## 第八轮：存档入口、操作权限与生成失败恢复（**混合触发 C 已批准；其他细节待讨论**）

### D1. 防止从任意 Revision 变相重新开放 Swipe/Retry

- 正式 Play 的 Save/Load UI 应以受支持的 **SavePoint** 为恢复来源：新建手动 SavePoint 默认为当前持久 HEAD；Load 从明确保存的 Revision 派生 Branch（若已经处于该存档 root，可直接使用当前 Branch 而不重复派生）。
- 目前底层 `SessionCore.createSavePoint` 支持传入 `revisionId`，这是一个**潜在的绕过入口**。严格 A 意味着正式 Play 不能提供事后从任何历史 Revision 铸造 SavePoint、进而任意回溯的公共入口；当前 HEAD 的保存和已有 SavePoint 的加载不受影响。具体如何约束 API、CLI/Slash、插件权限与原生内部服务需在实施前做消费者审计。
- 不将只读历史预览、源数据定位、当前提交崩溃后自动续接解释为用户「选择任意历史分叉」的许可。

### D2. 自动存档触发（**方案 C 已选**，默认间隔与权限未定）

- **A — 固定周期**：每 N 次正式提交创建一份轻量自动 SavePoint。容易解释和测试，但故事选择节点可能落在两个存档点之间。
- **B — 关键抉择触发**：每当明确的故事决策、战斗/交易或玩家可撤销选择出现时自动保存。与玩家期望一致，但识别需要游戏/Runtime 结构化事件，不能依赖 LLM 猜测，也可能频繁创建存档。
- **C — 双触发、无实时过度存档（第八轮已批准）**：固定低频底线 + **在受游戏结构化协议明确标记的重大选择前**创建恢复锚点，玩家随时可手动存档；即使漏判也不丢 S2 的每回合提交。自动保留数量/频次按 P0 实测，并与模式规则（例如铁人模式禁止 rewind）相容。
- **时间点语义必须明确**：存档如果要允许重新选这一步，必须锚定抉择前的可信 Revision，而不是动作效果已提交之后的状态；后台存档不能抬升当前游戏状态。

### D3. Crash Resume / Load SavePoint / Failed Draft 分离

| 情形 | 推荐行为 | 禁止的误解 |
| --- | --- | --- |
| 进程/断电重启 | 自动恢复最近一个已确认且 S2 持久的当前 HEAD，继续同一条路线 | 不把崩溃续接当成玩家主动读档分支 |
| 玩家主动 Load SavePoint | 读取指定 S2 SavePoint，派生新 Branch；保留旧 Branch | 不直接删除后续原始回合或篡改世界状态 |
| 流式生成取消/失败且**未正式提交** | 丢弃失败 Draft，可按相同 `commitId`/请求状态确定是否真的已提交后安全重试；仅允许未提交 Draft 的正常重试 | 不允许对已经成功确认的旧回复做一键重生 |
| 回复已成功提交但客户端未收到 ACK | 查询原提交回执并重载对应 Revision，不重放模型外部副作用 | 不能把网络超时当成「一定失败」来重复生成 |

### D4. 后续仍需讨论

1. **已确定 C**：固定低频周期 + 结构化重要抉择前自动存档 + 玩家手动保存；保留触发间隔与配额待测。
2. 关键选择前预存档的时间点/授权边界：是否仅 Game Runtime 发出的结构化 decision boundary，或普通 Narrative 模式也为用户输入之前做可选轻量锚点。
3. 当前 Run/Gameplay 模式（包括 Ironman/无回退玩法）是否允许自动保留存档但禁止 Load；是否有必要区分显示与管理权限。
4. 多次从同一存档加载的 Branch 命名、排序、可视化和缓存恢复；不将备选具体 UI/参数提前冻结。

## 第九轮：分支命名、读档管理及游戏模式权限（**候选，尚未批准**）

### 为什么要讨论

严格 Play 方案 A 限制任意历史回退：SavePoint 的定位、识别、管理能力必须提升，才能让玩家清楚“当前玩的是哪条路线”“从哪个存档分叉”。同时不能因方便操作而重新加入任意 Revision Fork。

### 分支管理候选

- **方案 A — 仅自动编号**：每次 Load SavePoint 生成独立 Branch，以创建序号命名；简单，但长游戏中难以区分。
- **方案 B — 人工命名为主**：读档时必须输入分支名称；语义明确，但每次读档都会多一次输入。
- **方案 C — 自动命名 + 自愿重命名（推荐讨论）**：新的派生 Branch 默认显示来源存档、创建时机与独立路线编号，允许任意时候修改展示名称；内部稳定 ID/来源 Revision 不因重命名变化。若当前 HEAD 已处于该 SavePoint，可明确显示“当前状态”而不产生重复分支。
- 使用根/分支关系进行树状或列表式视图，列出来源 SavePoint、分叉回合、当前标记、更新时间、原始历史只读预览；是否提供缩略图与标签由后续 UI/性能基线决定。
- **Branch 删除与“删楼层”不同**：仅允许作为整体路线管理，必须验证该分支是否有已保存锚点、其他引用、进行中任务和共享对象；绝不通过误删引用而破坏其它分支或可恢复性。

### 关键权限矩阵候选

| 游戏规则/情形 | 创建自动 SavePoint | 手动 Save | 加载旧 SavePoint | 现有 Branch 切换 | 崩溃自动恢复 |
| --- | --- | --- | --- | --- | --- |
| 自由剧情 / 普通 Narrative | 是；重大选择需结构化声明，其他按周期 | 是 | 是；派生分支 | 是 | 是；同一路线 |
| 标准有状态游戏 | 是；周期+结构化抉择前 | 是（需遵守游戏公开规则） | 默认是；派生分支 | 默认是 | 是；同一路线 |
| 铁人/禁止回退的游戏规则 | 作为**恢复/续玩**凭据可以存在，但不自动成为可选的历史回退点 | 可以限制为仅续玩/导出，不作为多槽可随意回溯工具 | 禁止历史读档回退；崩溃只能安全续接有效当前状态 | 依游戏规则，可禁用旧路线切换 | 必须允许恢复合法当前 HEAD，不能以“禁止读档”为由丢失已确认回合 |
| 生成中未提交草稿 | 不为未提交草稿建立正式 SavePoint | 未提交前不可伪称保存成功 | 不靠旧存档修复网络失败 | 不触发叙事状态改写 | 查 commitReceipt 确认后安全继续 |

**以上为第九轮待选产品边界，不属于已批准规则。** 尤其铁人/禁止回退玩法须区分“生存用的最新恢复点”和“玩家可自选的历史回溯点”；可能需要用受限 Latest Resume 取代常规 SavePoint 列表。严禁用事后回写/隐性删除等方式伪造旧历史消失。

### 第九轮需要的取舍

1. 选自动命名+可重命名（C）还是强制玩家手动命名。
2. Branch 数量增长时：只支持搜索/折叠归档，还是默认展示全树；推荐有限窗口按需加载、按来源存档与活跃路线分组。
3. 铁人模式：是否将自动续玩与主动回溯权限严格分开（推荐），以及玩家删除整个 Session 是否仍保留管理权限。
4. 分支管理与 SavePoint 回收：删除过期自动 SavePoint 时不得连带丢弃玩家仍在使用的分支或剧情原文。

## 需要的最小验证（未来实施才执行）

- Native Player 界面中无旧 Swipe/Delete/Hide 或绕过规定 SavePoint 的入口；旧 DOM ABI 不再提供可触发的已提交消息突变，非 Native 路径也不保留独立隐藏入口。
- 旧高层 API/Slash Commands/键盘/批量工具无法悄悄篡改 Native 已提交的 Timeline、上下文权威与 Revision；不等于删除独立文件/素材的常规管理 API。
- Load SavePoint 后出现新分支、旧 Branch/HEAD/世界状态与正文内容保持可达；Switch Branch 恢复完整一致的世界状态。
- 撤销失败/取消的**未提交**生成不会影响已保存回合；空闲/有界后台维护不诱发重复回复。
- 分析与验证只覆盖实际修改的模块和关键安全边界，不要求不相关全仓测试或真人实时 UI 证据。

## Material design changes

- 2026-10-13 / 第七轮：根据用户明确诉求新增模块并登记审计，待讨论「严格存读档驱动 / 保留显式 Fork / 模式分级」三种产品边界；未修改产品代码，未做浏览器真机验证。
- 2026-10-13 / 第八轮开端：用户正式批准第七轮严格方案 A，确认退役旧 Swipe/Delete/Hide 及 Native Retry/Restart/Re-enter/Fork 的正式 Play 入口，只保留 Save/Load/Branch、只读历史、未提交生成恢复及独立资源管理。第八轮新增自动 SavePoint 的选项及公开权限绕过审计要求；尚未实施代码改动。
- 2026-10-13 / 第九轮开端：用户确认第八轮混合自动存档 C，固定周期、结构化关键选择之前与手动三种触发源已冻结；第九轮新增 Branch 自动命名/重命名、分组管理与普通/有状态/铁人模式权限候选，均未批准。
