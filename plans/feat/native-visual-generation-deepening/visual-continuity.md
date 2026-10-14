# Atria 视觉连续性与来源权威（D-005）

- Task ID: `atria-native-visual-generation-deepening`
- Stage owner: 视觉身份/世界状态/参考图关联；建议实施阶段 S3，最终依赖见 [index.md](index.md)。
- **Status**: 第五轮用户确认方案 C（**状态驱动的分层视觉权威**）；架构原则已冻结。**第六轮的状态自动更新、冲突仲裁、参考图排序、Vibe 选择算法未冻结**。
- Cross-module decisions authority: [decisions.md](decisions.md) D-005；Provider capability and configuration: [provider-protocol.md](provider-protocol.md) D-003/D-004；Director timing: [architecture.md](architecture.md) D-002。

## 1. Problem and current source facts

本轮源代码静态检查基于 `main@7e1045ab836c22cafbc92c5de056ad701f56e723`，没有运行本地或真机测试。

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

- **“当前长什么样”是历史时点的投影**：服装、临时发型、装备、伤痕、受伤/恢复、妆容、姿势、周围场景与天气等，应读取相应已提交 Revision 所允许的事件、世界/角色状态及可验证叙事证据。
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

## 4. Candidate source and validation model (not frozen exact schema)

```text
VisualIdentityRef:
  authoritative Actor ID or explicit session-scoped character identity
  authoredVisualDefinitionRef?, approvedIdentityReferences[]

VisualStateSnapshot:
  visualSourceRef: sessionId + branchId + revisionId (+ optional variant/span)
  actorIdentityRefs[]
  sourcedAppearanceFacts[]
  allowedDisplayProjection
  provenance + confidence/ambiguity flags

VisualReferenceBinding:
  assetRef + purpose (identity/outfit/environment/style/composition)
  sourceScope + allowedBranches + disclosure/usage conditions
  optional provider-specific controls (only in chosen Adapter profile)

ResolvedVisualAppearance:
  identity + state facts + approved reference bindings
  policy/evidence and unresolved conflicts
```

这是检查字段职责的草图，不是最终持久化 Schema。需要明确：如何记录“没有发生的状态”、未知服装、角色同名歧义、用户覆盖、临时角色升级为 Actor、参考图资产权限、参考图派生追踪、何时同步时点缓存。D-005 并未授权自动反推图片事实。

## 5. Static acceptance concerns (planned, not tested)

- 相同 `actorId`、不同 Branch/Revision 会生成正确差异化的服装/伤痕等；分支 B 的图不误用分支 A 的动态状态。
- 同一通用身份参考可受控复用，服装/场景参考绑定对应状态，禁止把旧服装视为当前角色默认。
- 未公开/无权展示的世界事实不能通过玩家可见插图、替代文字、LLM 提示词回显或缓存泄漏。
- 与 `role.illustration_prompt`、Image Prompt IR、Provider Adapter 和 AssetStore 的接口有可审计来源；图片再生成不会改变正文已提交内容。
- 提供同名角色、同名临时 NPC、多图冲突、存档恢复、旧图片参考失效、未知状态和不同 Provider 不支持参考约束的测试样本。

## 6. Round 6 open questions: rules to decide next

1. **视觉状态自动更新机制**：正式世界状态写入驱动、已提交剧情 LLM 抽取提议、混合校验，哪些情况可以自动采用？“未提及”不是自动复位，状态何时持续或失效？
2. **冲突仲裁优先级**：固定身份、已提交结构化状态、叙事显式描述、玩家手动校正、上一张图的观感、参考图包含的旧衣物相互冲突时谁先谁后？硬冲突阻止还是提示？
3. **参考图选择策略**：来源于角色标准图、当前服装图、时点场景图、画风 Vibe、多张历史图时按什么规则筛选？是否允许自动强度推荐、跨模型自动转换、超预算降级？
4. **分支与复用**：通用素材与分支时点素材各自的缓存键、生命周期、GC 引用；存档分叉与时间回退不能泄漏未来状态。
5. **角色范围与权限**：正式 Actor、自由 RP 的临时身份与玩家角色如何统一；Image Provider 接收私人图像资料的授权是否另设规则？

上述均为待议，不因写进 Plan 就成为当前已批准算法。下一轮在用户选择后先更新本文件及 `decisions.md` 再展开后续议题。
