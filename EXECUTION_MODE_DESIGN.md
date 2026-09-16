# 执行模式重整方案书

状态：用户已批准实施，功能已在独立分支完成。第 2—11 节保留原始分析与验收规划；实际实现、验证范围及差异以第 12 节为准。

基线：`ZZZdragondYNGPHX/Luker:custom-release`，`112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`。
工作分支：`feat/execution-mode-design`。方案提交后继续在此分支实装；未合并至 custom-release。

## 1. 建议拍板的结论

保留四个主模式：**自主调研（Loop）、固定流程（Spec）、动态分工（Agenda）、导演创作（Director）**。

Single 从与四者并列的主模式，降为 **快捷指引**：保留旧模式读取和原来的两个提示词编辑字段；新建时提供 Spec 的单节点简化模板。关闭编排仍然是开关，不再算一种模式。

先让用户选择“辅助正文”还是“接管正文”。辅助正文下再选自主调研、固定流程、动态分工；接管正文使用导演创作。界面分组只是现有模式的展示方式，不新增一套可任意组合的执行引擎配置。

区分依据是**流程控制权与最终交付物**。工具、模型、记忆、世界书、Skill、预设和运行面板是公共能力，不再被宣传为某一模式的独占优势。

Single 的价值是低配置成本，值得保留；它没有独立的调度机制，不值得长期占用第五个主模式位置。不会为了制造差异而删除现有模式已经具备的工具能力。

## 2. 当前到底有哪几种

当前 UI 有五个选项，默认设置是 Spec；一次生成选择其中一条路径，不存在 Spec → Agenda → Loop 自动串联。

| 当前模式 | 当前实际执行 | 最终产物 | 最有价值的用途 | 主要代价／重叠 |
|---|---|---|---|---|
| Single／单 agent | 用两个全局提示词字段合成单阶段、单 worker 的 Spec，实际走 Spec runtime | 指导胶囊，再交给正文模型 | 简单提醒、风格约束、提示词试验 | 是 Spec 的简化形态；没有独立的模式预设库 |
| Spec | 用户预先定义 stages；阶段内串行或并行；worker 产出，review 可批准或要求回跑 | 最终阶段结果形成指导胶囊 | 每回合必须执行的设定核验、角色分析、审查与汇总 | 固定流程可能执行无用步骤；worker 也可循环调用工具，与 Loop 重叠 |
| Agenda | Planner 维护 TODO，按轮派遣 agent，可根据已有结果增删任务；末尾由 finalAgent 汇总 | 指导胶囊 | 当回合需要哪些专家事先不确定的复杂筹备 | Planner 与汇总增加调用；与 Spec 都有多角色、与 Director 都有动态派工 |
| Loop | 一个 agent 在同一工具会话内反复读取资料、处理结果，调用 finalize；有轮次和墙钟预算 | 正常完成时为指导胶囊；预算耗尽存在自然文本回退 | 一个角色即可完成、资料要边查边决定的筹备 | 与 Single 都是单 agent，与 Agenda 都能动态决定下一步 |
| Director | 接管生成，主 agent 调工具、可派子 agent，读写正文草稿，最终提交消息 | 聊天里的正文 | 写作过程中需要检索、审稿、局部修订的创作 | 调用及编辑生命周期更复杂；并不保证一定更快或文笔更好 |

“指导胶囊”就是给后续正文模型的辅助指令，不等于聊天正文。前四种走胶囊路径；Director 明确跳过它，走生成接管事件。

调用成本只能按结构判断：Single 通常是一项简单筹备；Spec 取决于节点、工具轮数和回跑；Agenda 额外有规划和汇总；Loop 取决于查找轮数；Director 直接写正文但可能多次修订。重试、缓存复用、模型和上下文都会影响成本，不能承诺固定调用次数或成本排名。

### 当前作用域也不完全一致

- Spec／Agenda／Loop／Director 有全局和角色级模式预设库。角色库存在与角色覆盖启用是不同状态。
- 运行模式读全局 `executionMode`，切换角色时会根据角色保存的模式对齐；用户当前点击模式选择器也必须有效。
- Agenda 还保留聊天级 `chatOverrides[chatKey].agenda`，启用后优先使用。
- Single 从 `singleAgentSystemPrompt`、`singleAgentUserPromptTemplate` 合成 profile，不参与上述预设库。不能将其他模式的角色级能力直接宣传成 Single 已有能力。
- 编辑器正在显示“全局”，不等于运行时已经停用角色覆盖。当前私人修复保护的是用户明确选择的编辑作用域，不能在改界面时把两者重新混在一起。

## 3. 混乱来源

1. **同一层级混用了四种命名标准。** Single 描述人数，Loop 描述循环机制，Spec／Agenda 描述调度方式，Director 描述产物责任。
2. **Single 与 Spec 是实际包含关系。** 独立下拉选项掩盖了它只是一种简化配置，但两者又没有共享同一份可编辑预设状态。
3. **功能演进后，旧区别不再成立。** Spec worker 和 Agenda agent 已接入公共工具。使用工具并不必然意味着应该换 Loop。
4. **辅助生成与直接生成混排。** 用户容易把 Director 理解为“更强的 Agenda”，忽略它改变了正文写入责任和停止语义。
5. **文档存在可验证的漂移。** `docs/zh-CN/features/orchestrator/single.md` 的对比表称 Spec 不能用工具、Single 支持角色覆盖，并称切回 Spec 就能继续编辑同一节点。当前 `getEffectiveProfile` 分别从 Single 字段和 Spec 活跃预设构建配置，不能据该文档承诺互通。其“一次 LLM”也是简化描述，不能覆盖运行时重试。
6. **不同模式的结束语义不统一。** Loop 会返回 `budget_exhausted`，其上层适配没有保留该状态，通用路径随后按 completed 处理结果；Agenda 达到派工限制后可以用已有结果执行 finalAgent。预算结束不能统一显示成目标已完成。

以上是局部源码核查结果，不是全仓审计或真机复现结论。

## 4. 四个主模式的独特合同

| 最终名称 | 流程由谁决定 | 必须体现的独特优势 | 适用实例 | 不应扩张成什么 |
|---|---|---|---|---|
| **自主调研 · Loop** | 同一个 agent 随工具反馈决定下一步 | 一份连续上下文里完成查证，免去 Planner 与专家交接 | 回忆前文约定、查明一个世界规则后给写作建议 | 内置多人调度器或正文编辑器 |
| **固定流程 · Spec** | 作者定义步骤，模型在节点内完成任务 | 必需检查不会因 Planner 判断而省略；节点顺序和审查回跑可核对 | 每轮固定检查人物边界、设定一致性，再汇总 | 运行时任意增删拓扑的自动规划器 |
| **动态分工 · Agenda** | Planner 决定本轮需要哪些任务与专家 | 把不确定任务拆开，选择合适角色，按结果补充工作并追踪完成情况 | 一场谈判涉及多个阵营，临时需要政治、记忆、人物专家 | 直接写正文的第二套 Director |
| **导演创作 · Director** | 主 agent 围绕正文草稿决定写作和派工 | 能对实际草稿做读回、审稿、修改，直接提交最终正文 | 长回复先写后审，修掉泄露信息或角色失真段落 | 再生成一份胶囊交另一模型重新写一遍 |

### 同一个 RP 回合怎么选

用户说：“我把当年的信交给她，问她为什么一直瞒着我。”

- 只缺信件相关旧剧情：Loop 检索、确认事实，给正文模型一份简短指引。
- 作者规定每轮必查“角色认知／情绪／玩家边界”：Spec 固定执行这几个步骤，不由模型决定跳过。
- 还牵涉多个组织、时间线冲突，先不知道要查几项：Agenda 拆任务并派给不同专家，处理结果之间的矛盾后汇总。
- 希望正文先写出她的反应，再让审稿角色检查是否泄密并局部修改：Director 接管草稿到提交的全过程。
- 只需要一条“不要替玩家做决定”的辅助提醒：快捷指引；若提醒完全固定，优先直接写入已有提示词，没必要为固定文本增加一次模型筹备。

### 共同能力与硬边界

- 四个主模式继续共享现有工具注册、工具开关、API／提示词预设解析、Skill、世界书过滤、Notes 和运行面板。
- Spec 的动态工具调用局限于节点内；Agenda 的动态性位于任务调度层。可以使用同类工具，不代表同一种流程。
- Director 默认保持主 agent 写、子 agent 提建议的现有出厂方向；已有用户给子 agent 开启写入工具的配置继续兼容，最终提交仍归主 agent。不能把“建议单写者”误实现为删除现有权限。
- 不允许新的内置设计让一个模式偷偷启动另一个完整模式，也不将任意模式串联作为本期目标。
- 以上约束针对官方运行路径；用户自定义工具可能有额外副作用，模式名称不能被当作任意自定义脚本的权限沙箱。

## 5. 交互定案

启用开关下面先显示产物选择：“辅助正文”／“接管正文”。这只是将既有枚举投影到 UI，存储仍以 `executionMode` 为准。

辅助正文下显示三个选择卡：自主调研、固定流程、动态分工。每张卡展示一句用途和最终产物；固定流程旁提供“快捷指引”模板入口。旧用户当前为 Single 时，必须显示“快捷指引（兼容）”及原编辑字段，不得显示为空或自动切换模式。

接管正文对应导演创作，明确提示“本模式直接写入回复”。旧用户所有模式和启用状态原样保留；新用户在主动启用并选择辅助正文时推荐 Loop，不强制替换已有 Spec 默认配置。

顶部始终分别展示：

| 信息 | 示例 | 含义 |
|---|---|---|
| 执行方式 | 固定流程 · 产出指引 | 真正将运行哪个模式 |
| 本次生效来源 | 角色预设：某预设 | 运行时解析后的来源；Agenda 可显示聊天覆盖 |
| 正在编辑 | 全局预设：某预设 | 本次编辑写向何处，独立于运行时来源 |

预算控件按模式呈现：Loop 是工具轮数／时间，Spec 是节点迭代／审查回跑，Agenda 是规划轮数／并发／总派工，Director 是主循环／子 agent 并发及派工。避免用一个“智能程度”滑块隐藏不同开销。

运行面板也突出差异：Loop 展示查找步骤；Spec 展示阶段与审查；Agenda 展示任务、派工与汇总；Director 展示草稿、修改与最终提交。公共时间、用量和停止入口保持一致。

## 6. Single 的处理与迁移

不把旧 `single` 直接改写成 `spec`，也不删除任何旧提示词字段。

第一阶段保留原 runtime 分支，只改变主入口组织。旧 Single 用户可继续使用原配置；新用户可以创建单节点 Spec 快捷模板，其优势是两个字段的简化编辑，不是第五种引擎。

提供显式“复制为固定流程预设”动作，预览将创建的新预设和目的作用域。复制时使用现有实际生效的提示词值，保留模板变量、相关模型路由及输出合同；新建独立 ID，不覆盖已有 Spec 活跃预设。用户选择启用副本时才切换模式。原 Single 字段继续保留，可切回。

复制不等于语义无损：Spec 的工具默认值、Skill、模型路由及注入设置可能来自其他层。必须比较两边解析后的有效配置，让新模板保持预期的单节点轻量行为；不能只复制两段文本就宣称完全等价。正常目标是不做探索工具循环，但不把输出提交工具和网络重试算成新增探索能力。

单节点模板不承诺支持所有任意 Spec 的简化编辑。添加多个阶段或 review 后，进入完整 Spec 编辑器。

## 7. 必须保留的私人行为与数据

- 保留 `9ff33cc27`、`fcfcf80ab`、`a2c43a0d2`、`5fbfc6e4d` 所涉及的全局／角色预设显示和明确选择语义。以当前实现为准，不依赖旧 handoff 的简略描述。
- 保留 `presetLibraries.<mode>`、`activePresetIds.<mode>`、`overrideEnabled.<mode>`、角色 `override.mode` 以及现有导入／导出格式。
- 保留 Agenda 聊天覆盖；本期不把它扩展成所有模式的聊天级存储系统。
- 保留 card-first API／提示词预设解析、工具继承与自定义工具、Skill 作用域、世界书过滤、Open Notes 注入。
- 保留楼层状态与消息 swipe／分支／截断语义；停止后的旧异步回调不能向新聊天或新模式写入结果。
- 保留迭代工作台的现有模式适配和编辑持久化路径。新建单节点 Spec 模板走 Spec 适配器；旧 Single 工作台行为单独回归，不宣称已经与 Spec 预设互通。
- 本期不升级应用版本、不引入新依赖、不重新同步上游，也不触碰备份／存储检查器等无关私人功能。

## 8. 实施前必须补齐的两个运行合同

### 8.1 切换模式后的结果复用

当前 `canReuseLatestOrchestrationSnapshot` 按聊天、锚点楼层和内容 hash 判断，不包含模式／有效预设身份。需要核对外部失效事件是否覆盖全部路径；仅这个函数不足以证明跨模式复用安全。

目标：同一个用户楼层切换模式、有效预设、角色覆盖或聊天覆盖后，不能复用不匹配的旧胶囊。为快照补充执行配置身份的设计应包含模式、有效配置来源和规范化配置指纹；字段是后续设计候选，不在本轮写入数据。没有身份的旧快照保留历史可读性，但不能作为已匹配的新缓存命中。原有楼层有效性检查继续生效。

### 8.2 完成、预算到限、停止必须不同

目标状态至少区分完成、预算到限、失败、取消；复用也单独呈现。

- Loop 未 finalize 时不能把最后自然文本包装成正常完成。旧回退行为如需保留，应明确显示“预算到限，使用部分结果”；调整默认回退策略要列为行为变更。
- Agenda 达到派工上限后仍可汇总已有工作，但要显示未完成任务和到限原因；汇总生成成功不等于 TODO 全完成。
- Spec 审查回跑到限不等于审查通过。
- Director 只有正文提交成功才算完成；保留现有 abort／discard 配置，不自动宣称草稿已发布，也不静默改用另一模式接着生成。

先用可控测试固化当前路径，再在最小适配边界保留状态；不借此重写全部 runtime。

## 9. 模块归属与实施顺序

架构所有者为 `public/scripts/extensions/orchestrator/`。继续复用 `main.js` 分派、各 runtime、`preset-library.js`、`character-overrides.js`、`editor-display.js`、`editor-persist.js`、`run-state/store.js`、`snapshot-cache.js` 与既有迭代工作台适配器。

| 阶段 | 交付 | 主要涉及 | 完成条件 |
|---|---|---|---|
| 0，本轮 | 现状核查、模式方案、兼容合同 | 本文 | 能明确选型与后续变更范围 |
| 1 | 四主模式分组、名称、用途、生效／编辑来源提示，保留 Single 兼容入口 | UI 模板、i18n、既有模式可见性与说明文档 | 五个旧值仍可用；无隐式配置迁移；明确全局选择不被角色上下文抢回 |
| 2 | 切换／缓存身份及结束状态合同 | main、快照与必要 runtime 适配 | 旧胶囊不能冒充新模式结果；到限不冒充完成；取消不写错目标 |
| 3 | 快捷 Spec 模板及 Single 显式复制 | 现有 preset／编辑持久化／工作台 | 新建不覆盖旧数据；复制后可回退；有效配置对比通过 |
| 4 | 各模式出厂示例与说明同步 | 现有 defaults、工厂预设、文档 | 每个示例展示其独特用处；既有用户自定义提示词不被覆盖 |

每阶段只改对应行为，分别检查提交。阶段 1 可先单独交付，但整体模式重整不能在阶段 2、3 未验收时宣布完成。合并 `custom-release` 等待用户要求集成。

## 10. 验收矩阵

以下是后续需要执行的检查，本轮没有运行这些应用测试。

| 场景 | 验收标准 |
|---|---|
| 旧五种模式分别加载、刷新 | 模式、提示词、工具、启用状态均保留；Single 仍可使用 |
| 同一卡上显式选择全局编辑 | 全局列表持续可见；保存只写全局；角色覆盖开关与编辑来源独立 |
| 角色切换／模式切换／Agenda 聊天覆盖 | 显示正确生效来源，旧异步结果不串写 |
| 同一用户楼层改模式或有效预设后重生成 | 不复用之前不匹配的胶囊；合法的同配置复用仍有效 |
| Single 复制为 Spec | 原字段未删除，目标预设无覆盖；模板与实际有效配置符合预期 |
| Spec | 必需阶段都执行；串并行与 review 回跑遵守定义；节点仍可用已授权工具 |
| Agenda | 用受控返回动态添加任务和派工；汇总包含已知不足；派工到限可识别 |
| Loop | 工具反馈进入同一会话；finalize 成功和预算耗尽可区分 |
| Director | normal／regenerate／swipe／continue 的消息目标正确，停止遵守原有草稿策略，只提交一次 |
| Director 不支持的生成类型 | 不误认接管；不能把辅助模式的五类触发宣传为 Director 全支持 |
| 预设导入导出／工作台应用 | 各模式 payload、工具继承、Skill 和写入作用域不变 |
| Web 与 Android | 共用逻辑回归；Android 真机验窄屏选择、停止、切换聊天、草稿显示及刷新恢复 |

已有测试入口可复用：`tests/orchestrator/get-effective-profile-presets.test.js`、`preset-lifecycle-hooks.test.js`、`spec-agenda-loop-three-modes.test.js`、`snapshot-cache-hits-invalidates.test.js`、`loop-runtime.test.js`、`director/dispatch-claim.test.js`、`director/abort.test.js`，以及 `tests/e2e/regression/123-orch-preset-export-import.e2e.js`、`124-orch-preset-rename-scope.e2e.js`、`125-orch-preset-switch-persist.e2e.js`。这些是检查入口，不表示现有断言已经覆盖所有新合同。

## 11. 证据与本轮交接

核心源码位置（相对仓库根目录）：

| 证据 | 位置 |
|---|---|
| 五个枚举、默认 Spec | `public/scripts/extensions/orchestrator/defaults.js`：`ORCH_EXECUTION_MODES`、`defaultSettings` |
| 五个 UI 选项 | `public/scripts/extensions/orchestrator/ui-templates.js`：`luker_orch_execution_mode` |
| Single 合成、模式及作用域解析 | `public/scripts/extensions/orchestrator/main.js`：`getEffectiveProfile`，约 769 行 |
| Loop／Agenda／Spec 分派与结果适配 | 同文件：`runOrchestration`，约 883 行 |
| Director 跳过胶囊／接管写正文 | 同文件：约 1140 行及 `GENERATE_TAKEOVER_DISPATCH` 注册 |
| 固定阶段、工具与审查回跑 | `public/scripts/extensions/orchestrator/spec-runtime.js`：`runWorkerNode`、`runReviewNode`、`executeStage` |
| TODO、派工、到限后汇总 | `public/scripts/extensions/orchestrator/agenda-runtime.js`：`runAgendaOrchestration` |
| 同会话工具循环、预算回退 | `public/scripts/extensions/orchestrator/loop-runtime.js`：`runLoopOrchestration` |
| 接管类型、草稿生命周期 | `public/scripts/extensions/orchestrator/director-runtime.js`；`director-tools.js` |
| 私人作用域修复 | `public/scripts/extensions/orchestrator/editor-display.js`：`getDisplayedScopeForMode`；`preset-character-scope-ui.js` |
| 角色保存模式与覆盖开关 | `public/scripts/extensions/orchestrator/character-overrides.js` |
| 当前快照复用条件 | `public/scripts/extensions/orchestrator/snapshot-cache.js`：`canReuseLatestOrchestrationSnapshot`，196 行 |
| 与源码有差异的用户说明 | `docs/zh-CN/features/orchestrator/single.md` |

实际完成：读取四份仓库协议及 Copilot 指令；fetch 当前 custom-release；检查相关私人历史；从该 HEAD 创建独立 feat 分支；针对性阅读分派、配置、四个 runtime、缓存和已有测试；新增本文。

验证范围：文档路径与 Git 差异检查。没有安装应用依赖，没有运行 Jest、浏览器、真实模型或 Android 测试；这是分析与方案交付，不是功能上线报告。未改持久化字段，无运行时迁移，无 Web／Android 实现差异。

参考路由：tavern-card-builder；指南库快照 2026-08-18；读取 ST-A0 与 ST-A4 的相关部分，用于最小变更和提示词边界；其他路由候选不作为已读证据。架构核查采用 code-quality-workflow 的只分析边界。精确行为以本仓库源码为依据，宿主行为待后续真机验收。

新增维护负担：一份尚待采纳的设计文档。实施后需同步本文状态和用户文档，避免建议被误认为已实现。下一步为按已采纳方案实施阶段 1；不得从本文推导出已获模式重写、数据迁移或合并授权。

## 12. 实施回执（2026-09-16）

架构归属仍为 `public/scripts/extensions/orchestrator/`，复用现有 runtime 分派、预设库、角色扩展保存、编辑作用域与楼层快照。保留私人修复确立的“生效来源与编辑作用域分离”，以及角色优先模型解析、Agenda 聊天覆盖和现有工具／Skill 路径。

已实现：

- 辅助正文／接管正文入口，Loop、Spec、Agenda、Director 四主模式的用途说明与 Single 兼容分组；展示本次生效和正在编辑的来源及预设名。
- 新建单节点 Spec 快捷模板，关闭探索工具；Single 可预览后复制到全局或角色库，生成独立 ID，默认不激活；旧字段保持可用。简单工作流可直接编辑两段提示词。
- 新快照可选字段 `executionIdentity`：SHA-256 摘要绑定有效模式、来源、预设及关键运行设置；历史快照可读，但无指纹不复用。无 Web Crypto 时安全地跳过复用；不迁移旧用户配置，不增加第二套模式存储。
- 切换或停用时取消运行，并在异步完成边界检查聊天与有效配置，避免过时结果注入及更新当前缓存。
- Loop 适配保留 `budget_exhausted`；Agenda 同时遵守全局与预设预算，并暴露到限原因及未完成任务。部分指引仍可使用，但不写为成功缓存。

实现取舍：采用原生分组下拉框而非选择卡，保留原选择器及键盘操作，适配窄屏。保留现有各模式工厂提示词，使用模式文档中的同一场景实例说明独特用处；新增工厂能力仅为单节点快捷模板，未批量替换用户提示词。各阶段以一个实现提交交付，原方案另有独立提交。

变更文件：

- 运行与界面：`main.js`、`ui-templates.js`、`i18n.js`、`agenda-runtime.js`、`anchors.js`、`snapshot-cache.js`、`preset-library.js`；新增 `execution-mode-contract.js`、`quick-guidance.js`（均在编排器目录）。
- 单元测试：`tests/orchestrator/execution-mode-contract.test.js`、`custom-tool-runtime-agenda.test.js`、`get-effective-profile-presets.test.js`、`preset-library.test.js`、`snapshot-cache-hits-invalidates.test.js`。
- 浏览器测试：`tests/frontend/ExecutionModes.e2e.js`。
- 说明：本文、`AI_HANDOFF.md`；中／英／繁体 Single 文档；简体 overview、Spec 与新增 `execution-modes.md`。

实际验证：编排器 Jest 全套 109 suites／1242 tests 通过；隔离本地服务器的 Edge 浏览器检查覆盖复制、激活、编辑、刷新、390px 窄屏模式选择和角色生效时独立编辑全局预设。前端 webpack 编译通过。针对生产改动的 ESLint 与原基线对比无新增诊断；已有 33 条诊断仍在，不能称全量 lint 通过。差异及 JavaScript 语法检查通过。

Web 与 Android 共用前端实现，未改 Android 原生代码或版本；未执行 Android 真机、真实模型调用及全部生成类型的浏览器验收。已有相关 runtime 单元回归通过不代表真机验收完成。

维护负担：运行配置新增关键依赖时需更新指纹白名单；快捷编辑器只展示可表达的单节点配置；各语言模式名称与用途说明需同步。后续若要求日常集成，再合并 custom-release 并按届时最新分支验证。
