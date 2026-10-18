# 雾灯旅舍 — 设计协作、实施准备与

> 先读 [index.md](index.md)。故事、规则、媒体分别链接其权威模块，不再复制详细规格。

## 1. 当前交付与后续边界

整体讨论、企划细化、外部设计回流与整合已完成，形成 v1.0 正式制作基线。用户带回的 HTML 与两份文档已原样归档至 [frontend-reference](frontend-reference/)，本轮已在浏览器审阅代表样稿；采纳、补齐和保留差异统一归 [frontend-integration.md](frontend-integration.md)。P2 外部设计整合与 P3 终稿/启动请求已完成，正式游戏制作仍待用户在新对话启动。

本轮交付包括最终企划、三项外部原件、整合决策与 [implementation-prompt.md](implementation-prompt.md)。启动请求用于用户自行新建制作对话，不是中断任务的 HANDOFF，也不自动创建新对话。

此前发给外部 AI 的 [需求包 README](frontend-design-package/README.md) 保留为设计输入，与当前启动请求职责不同。

## 2. 外部设计输入与三项输出

此前发给外部 AI 的 [frontend-design-package](frontend-design-package/README.md) 提供公开背景、必要操作、代表内容和状态要求。其 [interface-requirements.md](frontend-design-package/interface-requirements.md) 继续作为完整界面/操作/状态语义清单；外部原件的局部演示和省略不构成删除功能的依据。

| 已归档原件 | 参考职责 | 实施边界 |
| --- | --- | --- |
| [foglight-inn-concept.html](frontend-reference/foglight-inn-concept.html) | 舞台式场景、人物立绘、ADV 对话框及代表交互的审美标杆 | 原样保留；局部演示不代表完整功能或正式数值权威 |
| [feature-presentation.md](frontend-reference/feature-presentation.md) | 外部设计者对界面和演出的说明 | 原件覆盖不足由整合决策及完整语义清单补齐，不将标题上的覆盖声明当作完成证据 |
| [frontend-guidelines.md](frontend-reference/frontend-guidelines.md) | 外部视觉、排版、动效与适配建议 | 具体采纳与修订由整合决策统一确定，不把演示缓存、动效或新增媒体直接变成玩法与产品接口 |

原件不回写修改；对其任何采纳、补齐与例外只在 [frontend-integration.md](frontend-integration.md) 维护，其他模块引用。既定玩法与数值仍归 [gameplay.md](gameplay.md)，完整语义归需求清单，参考缺漏不能静默覆盖二者。

## 3. 正式制作的开工阅读顺序

1. **入口与整合权威**：[index.md](index.md) → [frontend-integration.md](frontend-integration.md)。先理解制作基线、采纳范围、必须补齐项及原件不能直接执行的建议。
2. **三项审美参考**：读取 [功能表现原件](frontend-reference/feature-presentation.md) 和 [整体指导原件](frontend-reference/frontend-guidelines.md)，在真实浏览器实际打开 [HTML 原件](frontend-reference/foglight-inn-concept.html)，查看代表布局并操作其已有流程。只读源码不能替代查看画面；
3. **规则与运行边界**：读 [gameplay.md](gameplay.md) → [media-and-runtime.md](media-and-runtime.md)。不从样稿反推或重写规则。
5. **内容制作**：涉及人物、事件、线索与披露时再读 [story.md](story.md)，保留有限视角与作者秘密；不把作者全文直接灌入玩家展示或每个角色上下文。
6. 后续发现新的适配差异，集中更新整合决策，避免在原件、玩法和多个说明中重复维护。

浏览器查看原件用于理解与评估参考，不能代替正式游戏在同场景、同密度下的实现对照。外部样稿中的演示数据、存储、音频播放或模拟生成逻辑不具有正式状态权威。

## 4. 工作空间与资产职责

- `docs`：本 Plan Bundle、外部设计输入、原样参考、整合决策与制作启动请求；不存正式图片、音频或产品实现。
- `package`：未来 `foglight-inn/` 游戏资产、逻辑、前端源码与媒体、构建工具，以及 `releases/` 历代 `.atria` 成品。旧版本保留。
- 产品源码：只为已核实的能力缺口在适当语义分支实施，优先为 [媒体模块](media-and-runtime.md) 的受限音频控制；复用原状态、存储与 Host。
- 外部参考：用户带回的 HTML/文档保留来源与版本。构图、样式和交互转译到游戏前端，避免任意脚本进入 Host 或另建持久规则。

此前核查的 `main@9241325a7` 只用于说明企划依据，不假设新对话中的仓库仍未变化。通用生命周期、测试和 API 限额只归 [Governance](../../../README.md)。

## 5. 正式实施阶段

| 阶段 | 可审阅成果 | 完成依据 |
| --- | --- | --- |
| M0 — 合同与媒体准备 | 终稿对应的状态/动作/披露合同，图片风格小样、声音小样，模型路由和资产清单 | 样例能对应规则与设计参考；|
| M1 — 一段完整流程 | 开局 → 一个地点 → 交谈/行动预览 → 正式结算 → 新场景/日志 → 存档恢复 | 真实规则有后果，失败无半提交，媒体和读取一致 |
| M2 — 必需音频能力 | 有界播放、环境/效果音量、首次手势、淡变与事件去重 | 不越权，退出/读档不残留或重播事件 |
| M3 — 三日完整游戏 | 人物主动事件、两条离岛路线与安全留守、三条结局及后记 | 计划可达性在运行时成立，无软锁，无隐藏免费改规则 |
| M4 — 表现打磨与作品交付 | 完整媒体、参考风格、响应式、恢复、`.atria` ||

P2/P3 文档与参考整合完成不表示 M0—M4 已实施；正式制作在用户新建的后续对话启动，媒体与音频能力等准备仍需实际完成。

## 7. 新对话启动请求与制作边界

正式制作入口为 [implementation-prompt.md](implementation-prompt.md)，由用户复制到自行新建的对话。启动请求应明确以下关联信息；详细规则只引用权威模块，不重新维护：

- v1.0 Plan entrypoint、本文件 §3 的必读顺序、三项原样参考、整合决策与完整语义清单。
- 已定方向、制作范围、状态权威、重要规则/信息/媒体约束。
- 实际源码与资产基线、工作空间职责、待补音频能力及其他已证实差异。
- 媒体 Target/预算等真实准备情况与尚缺资料；不含秘密值。

启动请求是正式制作的任务说明，不是将失败或阶段边界转移给用户的 HANDOFF。正式制作对话按实际 Git 与上述入口开始工作。
