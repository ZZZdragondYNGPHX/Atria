# Atria 视觉连续性与来源权威（D-005）

- Task ID: `atria-native-visual-generation-deepening`
- Stage owner: 视觉身份/世界状态/参考图关联；建议实施阶段 S3，最终依赖见 [index.md](index.md)。
- **Status**: 第五轮 D-005 已冻结分层视觉权威；**第六轮 D-006 选定方案 C：证据驱动的混合更新、冲突仲裁和按用途参考图选择原则**。详细更新阈值、冲突 UI、Vibe 强度与特定 Provider 限制仍待进一步设计。
- Cross-module decisions authority: [decisions.md](decisions.md) D-005；Provider capability and configuration: [provider-protocol.md](provider-protocol.md) D-003/D-004；Director timing: [architecture.md](architecture.md) D-002。

## 1. Problem and current source facts

- Atria `src/native/contracts.js:assertActor` 已以正式 `actorId` 标识 Package Actor；`public/shared/native-actor-profile.js:projectActorDefinition` 读取固定作者设定，不读取动态 Session 状态。不能简单将 Actor Profile 作为角色全部当前外观。
- 旧官方绘图角色来自 `public/shared/illustration-plugin-contract.js:assertDrawingCharacter`：`id/name/aliases/fixedPrompt/defaultClothing/enabled/storyActorId`；`storyActorId` 目前只是可选字符串，绘图角色的自动姓名匹配有歧义风险。
- `src/native/illustration-context.js` 已基于被标注的历史 `revisionId` 选取选段、邻近段落和正式 Context Compiler 的部分已选知识/状态；但 LLM 输出只覆盖 `scene`、角色 `dynamicPrompt` 和 `clothing`，尚无统一的已证明身份—时点状态—参考图解析闭环。
- `public/shared/native-information-runtime.js` 的 Information Runtime 有独立信息投影、可用性、视图权限和来源锚定；`public/scripts/native/context-compiler.js` 区分知识、当前状态与叙事。使用时必须区分“可作为模型私有上下文”与“可以向玩家显示”。
- `src/native/session-illustrations.js`、`public/shared/native-illustration-contract.js` 与 `src/native/repositories/asset-store.js` 已有历史标注、分支图片、SavePoint/AssetStore 引用约束；新增视觉引用不得绕过分支或资产 GC 权威。

## 2. Frozen architecture: three distinct layers (D-005)

### 2.1 Visual Identity — stable character identity

- **“谁”使用权威身份，而非视觉猜测**。正式 Package Actor 以精确 `actorId` 绑定；可支持无正式 Actor 的临时/自由 RP 角色，但应有会话内稳定身份及明确归属，不能按同名文本跨作品/分支自动合并。
- 身份视觉描述可以包含经作者或玩家明确设定的基础面容、发瞳色、物种/种族外观特征、永久身体特征，以及被批准的通用角色标准参考图。
- 角色固定外观的**视觉设定**和 Package Actor 的**叙事身份**关系应可追溯；与正式剧情冲突时，不能让视觉模型靠生成输出反向修改 Actor 定义。
- 由于模型能力差异，身份连续性是语义约束与引用目标，不能宣称一定实现像素级一致。

### 2.2 Visual State — branch/revision-scoped appearance

- Dynamic Visual State 不得成为与 World/Session/Actor 竞争的独立剧情事实库。可以保存用于渲染的快照/缓存和 provenance，但它们是**派生结果**而非状态写入授权。
- 同一个角色在分支 A 穿黑裙、左臂受伤，分支 B 换旅行装且未受伤；跨分支沿用稳定身份可以，但**绝不能把 A 的时点动态状态或选中图片直接算作 B 的当前事实**。
- 始终绑定正确的 `sessionId/branchId/revisionId`，必要时绑定 `messageId/variantId` 和具体片段；读档与创建新分支要读取目标历史来源而非最新内存缓存。
- 默认不得把上一张生图的偶然错误（莫名出现的戒指、伤痕、第三人）自动推广成角色当前外观或 World Truth；图片内容本身不是剧情状态的可信写入来源。

### 2.3 Visual References — controllable presentation inputs

- **“如何画”**与“真实发生了什么”分离。语义上区分 `character_identity`（角色身份参考）、`outfit`（服装）、`environment`（场景）、`style/vibe`（画风与迁移）及 `composition`（构图）等用途。
- 参考资产必须具有 AssetStore 或其他已批准、受控的资源引用和来源/用途/权限信息。既有图片再用作参考时，需标明是用户批准的“标准”还是仅属于原历史剧情的“快照”；未批准的历史图不能隐式升格为全分支角色身份标准。
- 参考素材只辅助模型呈现；例如用于人脸身份的图中含旧衣服/旧伤势，这些偶然像素**不得自动压过**目标 Revision 的当前服装/伤势。能力协商负责判定当前 Provider 是否能区分/控制这些条件，不能静默丢失强制一致性要求。
- NovelAI 专有 Vibe、Precise Reference，ComfyUI 控制节点，云模型自然语言参考图属于不同 Adapter 能力；不假定它们可互换，不允许一个 Provider 的专有权重参数污染 Image Prompt IR。
- **本轮只冻结用途分层与冲突必须显式受控**；Vibe 的实际支持型号、参考强度、多图数量、融合顺序、缓存与上传费用、图生图/Inpaint 支持范围仍待后续讨论。

## 3. Disclosure and safety boundary (frozen)

- **世界真实状态 ≠ 玩家可观看的画面**。Visual Director 与图片编译器必须遵守源 Revision 已授权的可见性/披露范围；即使 NPC 私有事实在正式数据里存在，也不能仅因图像模型拿到这些数据就生成包含剧透、密室、未公开身份、私有心声的玩家可见图像。
- 统一的视觉信息投影应重用 Atria 正式 Information Runtime、Session/World 权威和其适用的 disclosure 决策；**不能新建“扫描所有世界书/所有角色记忆然后据此生成插画”的影子检索通路**。
- 对事实来源不足、观察视角冲突、角色身份不明确或未被授权披露的关键信息，不把模型猜测当成画面事实；如何停止/询问/降级在 Round 6 细化，不因开发方便而默默越过权限。
- 图片、参考图解析和生图结果都不得直接提交 Narrative/Memory/World State，更不能让视觉模型替玩家作剧情决定。需要修改剧情状态必须经过原有正式写入/发布途径。

## 5. Round 6 冻结：证据驱动的混合更新与冲突仲裁（D-006；方案 C）

第六轮用户明确选定方案 C。**D-005 规定身份/状态/参考图分别由谁负责；** 本节冻结执行原则而非任意数值阈值或完整持久化 Schema。

### 5.1 状态更新与生效来源

1. **只从已提交的目标历史来源求解**：以 source `sessionId/branchId/revisionId` 固定版本；该版本正式 World/Lifecycle/Actor 状态、已提交的合法状态事件与叙事证据是读取入口。优先利用已有 Atria authority、Context/Information Runtime、事件或 Revision 状态差异；不另建一套可写的世界真相。
2. 未被结构化状态明确表达的自由 RP 换装、伤痕、发型、场景变化，可由 LLM 在剧情 Commit 后从**该分支、该时点**的已提交文本中提取**有引用锚点**的外观变化提议。提议含人物身份、字段、变更前后/持续范围、来源、置信/歧义状态（精确字段后定），不能直接推进 World、Actor、Memory 或 Narrative。
3. **高确定且无冲突候选可自动影响派生的 Visual State 投影**，但不等于自动提交正式世界状态；证据不足或关键矛盾应进入待审查/不可发布状态，拒绝以猜测补充稳定事实。没有提及某一特征不代表该特征自动消失；默认延续仍有有效证据的上一次状态。
4. **时态分区**：持续特征（服装、伤痕、持有装备等）延续到有可信更改/撤销/失效依据；一次性状态（表情、姿态、动作）通常局限于所引用的画面片段。**单个 Revision 内的早晚片段可能不同**，必须识别语句顺序、选段范围及合法时间/事件锚点，不能将该 Revision 的最终服装反投到开头画面。
5. **增量与缓存**：以确定的源快照、角色身份、选段与有效视觉事实来源为可复算输入；缓存与衍生图保持版本/可见性/分支约束。重新生成、重试、切换分支、读取旧 SavePoint 时不得偷用当前 HEAD、未来场景或其他分支缓存。

### 5.2 先过硬门禁，再仲裁视觉事实，最后考虑画质

**硬门禁（不可被权重排序覆盖）**：
- 来源身份、正式剧情已提交、正确角色/分支/时点、当前允许向玩家显示的信息（disclosure）、参考资产授权与可访问性。
- 目标 Provider 在给定模型/Workflow 上对**被标记必需的**参考/控制能力须真实支持；不允许未经确认静默删除角色身份约束或把跨分支资料泄漏到图像请求。
- 人工修改 Raw Prompt / 视觉风格偏好不会自动授权覆盖现实剧情或公开私有信息。

**事实解算（不是“一张优先级表一律覆盖”）**：
- 正式的 Actor 身份/固定外观与已提交的当前 World/Session 状态及同一时点明确叙事内容共同约束视觉；允许合法的剧情变化，例如换装/恢复。
- 否则标记冲突并阻断关键事实的自动采用，提供用户审查或明确的视觉替代选项。**不能让 LLM 自行判定另一方错误，更不能偷偷改 World State。**
- 玩家/作者明确固定的外观特征和画风偏好分离：画风是渲染偏好，不自动推翻剧情事实；手动要求与硬事实冲突时，必须显式区分“非正史的创作版本”与“正式剧情插画”，该交互的具体产品规则后轮再定。
- 参考图、Vibe 与模型输出只提供辅助条件，不会成为比正式状态更高的事实源；随机多出的戒指、旧衣服、未知角色、伤口等不会自动永久化。

### 5.3 参考图自动选择分层与冲突处理

采用 **先过滤、再按用途排序、最后以实际 Provider 能力协商** 的流程：

1. **过滤**：错误角色身份/作品、错分支或时点、不兼容的服装/场景状态、未经授权/私有不可公开、来源/AssetRef 失效、模型接口不接受该引用用途、用户显式禁用等全部排除。经用户确认可跨分支的**稳定身份标准图**是可受控复用的例外；其他分支的历史剧情快照默认不可直接复用其动态事实。
2. **用途独立**：角色身份参考主要约束长相，服装参考约束当期衣物，场景参考约束环境，Style/Vibe 参考约束画风，构图参考约束镜头；**不得因为身份图内的旧衣服/旧伤势而把它们视为当前事实**，也不把 Vibe 的风格迁移当作严格身份一致性承诺。
3. **候选排序因素**：用途匹配、正式身份/状态的来源可靠性、当前时间与分支匹配程度、用户显式锁定或选择、参考图质量/清晰度与模型接受程度。**用户锁定是适用偏好，不可越过硬门禁**。精确分数与权重、强度、top-K、输入数量、Vibe 算法之后再冻结。
4. 若要求不可同时满足，提示修改 Target/优先需求，或者只按未来明确批准的 fallback 策略继续，不静默削减必需条件或跨 Provider 付费重试。
5. **记录追踪**：在非秘密 Evidence 中固定每项已选/排除参考的用途、来源标识、目标版本/指纹与关键决策摘要，图片版本指向实际输入资产；资产引用纳入 SavePoint/GC 的已有权威保护，不复用过时内容或输出伪造可复现性。

### 5.4 本轮没有批准的细节

- 状态 LLM 具体模型、触发条件/频率、置信阈值、持续状态的过期时间及“无冲突”判定表；参考图数量、强度、排序权重、用户冲突弹窗。
- 各 Provider 的 Vibe、Precise Reference、LoRA、ControlNet、图生图、Inpaint 实际功能矩阵与 API 细节；参考图编码缓存与计费、跨 Provider 的自动 fallback 许可。
- 全自动剧情生图的“何时值得画、每次画几张、费用限额、失败重试/恢复”属于**第七轮**，本轮没有暗中授予自动付费或流式预生成权限。

## 7. D-006 之后遗留的视觉状态实现精度（历史待办；D-007/D-008 已定案）

2. **冲突仲裁优先级**：固定身份、已提交结构化状态、叙事显式描述、玩家手动校正、上一张图的观感、参考图包含的旧衣物相互冲突时谁先谁后？硬冲突阻止还是提示？
3. **参考图选择策略**：来源于角色标准图、当前服装图、时点场景图、画风 Vibe、多张历史图时按什么规则筛选？是否允许自动强度推荐、跨模型自动转换、超预算降级？
4. **分支与复用**：通用素材与分支时点素材各自的缓存键、生命周期、GC 引用；存档分叉与时间回退不能泄漏未来状态。
5. **角色范围与权限**：正式 Actor、自由 RP 的临时身份与玩家角色如何统一；Image Provider 接收私人图像资料的授权是否另设规则？

以上是 **D-006 的实现精度待办项**，不得解释为重新开启已冻结的混合更新方向。**D-007/D-008** 已冻结 Visual Director、评分/频率/预算/可靠恢复，详情见 [visual-director.md](visual-director.md)；精确视觉投影/Actor 绑定与引用缓存合同已登记为 [e0-closure-audit.md](e0-closure-audit.md) 的 S0/S3 工作项。
