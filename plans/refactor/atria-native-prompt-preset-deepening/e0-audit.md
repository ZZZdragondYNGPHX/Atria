# D9 / E0 审计：真实消费者、跨合同缺口与开发前 Gate

> **2026-10-16 开工更新**：G3=AUTHORIZED，用户包含 D2–D8 全后端实施，前端交 Claude Code。C1–C6 工程落点见 [后端实施](backend-implementation.md)。此前只文档/不建分支是前轮限制；当前已授权实施。E0 整体仍 NOT_CLOSED，不把授权冒充生产 Port/质量来源/端侧验收。

> **E0_IN_PROGRESS / NOT_CLOSED（2026-10-15，本轮本地续审）**。这是 Prompt Preset 深化的唯一 E0 台账；不是另一个 V3 E0，也不是前端视觉定稿。D1–D8 功能/交互语义不重开，视觉未冻结。实际历史继续记录在[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。本轮只写 docs，未建立本任务实现分支、未修改 main。

## 1. 本轮精确基线、方法与证据边界

| 对象 | 实际基线与并发核对 |
| --- | --- |
| main | `695acf3bcad1d42e331459189532a76056278bec`，与origin/main相同、源码工作树干净；相对735由其他任务合入Storage Center UI，已补审drawer/批量/确认/刷新/相关测试并重建索引；非本任务产品改动 |
| docs | 起点 `0a758827eaed96713ab9efed25ef1a0fdf31674c`；过程中依次看到 `ab5461eb1`、`5e2117393`、`d2a3d21d9`、`d346f895b`、`ca43a0a8442036639c264bde14f9f2b9616fd554`；他人 V3/Storage 文档与预览保留；本次提交基于当时真实 HEAD |
| V3 | 99da3eadb → da4c38e90 → 0d799fc28（合入main@735 Storage权威）→ 最新 `31bef95723885c1547a9c3686200cbaf122799a8`（有界dependency transition/显式loop）；固定Git archive读取，未改其工作树 |
| 结构证据 | 本地 `git`/`rg`、JS AST、逐控件/事件/导入/服务调用/端点/CSS/测试索引；全产品研究入口见[前端审计](../../architecture/atria-frontend-audit/index.md) |
| 静态规模 | 1,065 个前端/模板/CSS/原生包装层文本文件、355,257 行；2,390 个 JS control factory 候选、1,221 个 HTML 标签点、3,206 个事件注册候选；不是可见控件数或通过功能数 |
| 全仓相关索引 | main 前端+服务器 5,960 import/resource edges；main/V3 1,630 目标符号/字符串位置，1,908 Router 注册表达式；1,527个main测试树JS（含helper/fixture）目录及15个V3控制流测试目录，全部 NOT_RUN；[相关测试解释](../../architecture/atria-frontend-audit/test-evidence-map.md) |

上一轮是远端有界搜索首审；本轮已获得本地源码并系统追踪真实挂载、动态 literal import、handler、client/endpoint/领域 authority，补充了具体物理缺口。**仍不是所有运行时表达式、外部插件、用户作品和 SourcePort 的完整动态闭包，更不是逐行人工审阅 355,257 行或产品验收 PASS。** 完整证据方法、索引局限和未知入口见[coverage](../../architecture/atria-frontend-audit/coverage-and-evidence.md)。

本轮未启动产品、未跑产品 Node/Jest/build/CI、未发 Provider/模型请求、未做 Browser E2E/权限攻击/故障恢复/三端实测。只运行了文档证据生成与相关静态验证。已有测试的断言仅证明测试设计，不能复用历史“通过”作为本任务新结果。

## 2. 真实入口与消费者台账（静态已推进，G1 未闭合）

源码链接和行号集中在[固定源码索引](../../architecture/atria-frontend-audit/source-map.md)，全位置附件见[control/event/import/service/E0 TSV](../../architecture/atria-frontend-audit/coverage-and-evidence.md)。

| 域／真实链 | 本轮复核到的物理消费者 | 剩余闭包／处置 |
| --- | --- | --- |
| Shell/路由/启动 | `public/script.js:306,2011` → atria-shell/index → workspace-host/library-runtime-workspaces；`capability-host.js:62–86` 明确加载 regex/game-runtime/search/orchestrator/memory；Studio/旧 Agents/Diagnostics dynamic imports | Literal 图不含任意 plugin URL、Work Source Graph 的完整 UI；Script/Worker/模板/注册器不能只看 ES import；保留原 Navigation/Host Bridge，清退旧兼容入口 |
| Library/Prompt | prompt-presets、prompt-authoring、prompt-semantics、resource bundle/Used By、package original、native product/studio/runtime clients | 同 preset/Library/Project/package 的确切写入、revision、archive/delete/ref/closure 已定位；资源与依赖操作的全运行组合未测；不能造第二 Prompt Store |
| Play/普通 RP | play-product → `generateNative` → play-generation → generation-client；Task Turn、game free text、普通 narrator 三出口；play-generation:79–96 仍读旧 mode并运行 Director/guidance | 旧 Workspace 的清退会影响真实默认 Native Play，不只是旧设置页；保留 Session/Turn/World/Memory 原业务；不要沿用旧资料“必经隐藏 textarea”的推断 |
| Settings/Account/Storage | 新六类 Settings，Account 可见 Sign out；Storage Center server/browser scope、preview/task/recovery；storage-change-events 到 client/session/runtime/search | 新旧备份/高级 inspector 混合内容需按原生价值拆分；旧全文盘点中“缺 Logout/Secret 总是首步”等已纠正；当前 Stage 不能绕原资源删除/恢复权威 |
| 原 Native Model/Prompt | RouteResolver 读 Route.promptProgramRef；PromptCompiler/ContextProvider/renderers；GenerationService fallback、compiledBinding、Provider adapters | 受信 Node 独立 Program 与 Route、fallback、Source/currentness、Typed Blocks 尚不能由现生产接口证明；详 E0-01/02/03 |
| Context/Memory/Cognition | ContextProvider 按 lane映射 history/fact/directive；原 context compiler/selection/provenance/Persona、Memory snapshot/currentness、Session branch/revision guards | 已有 history 降权和精确来源检查，不能误称全部未实现；D6 Actor/Grant/Time/Branch/Disclosure/Join/缓存的全链定向失效仍无闭包 |
| Experience/Eval/Evolution | agent-goals/evolution panel 在旧 Run 和 Project Task 挂载；quality.requirePilotSources、evolution-targets、evaluator、PromptCandidateStore | UI/类存在不等于质量来源 ready；旧 workspace-prompt/workspace-strategy/Director 与 V3 plan-prompt 串联仍阻塞 |
| Studio/Project/Package | 20 个资源视图；Source/Asset/typed editors → inspectWorkspace/executeWorkspace；Project Agent → Review/Commit；frontend source graph/analyze/preview | 有实际作品前端 Draft Preview，**不能用它销账未发布 Prompt Draft Preview**；原 Project/Package/Skill/Media/World 是有效业务，不随旧 orchestration JSON 清退误删 |
| Skills/Plugins/Search/Media | Skills file expectedSha256、scope/invocation；extensions import(url)；Regex 资源规则；Search Tools UI/main 的原生 lifecycle+旧注入；官方 illustration/Visual Director/Mask/Speech/Shared | 旧 scope/注入与有效原生工具需拆；Visual Director 非旧 Agent Director；外部插件和任意 Work UI 动态扩展 UNKNOWN，不能判无功能或全通过 |
| V3 Plan Authoring | 最新 `native-orchestration.js:7–55` 只注册 plans/list/get/revisions/validate/create/save/publish；authoring-service:20 对 bindings 明确报 `native_orchestration_source_unavailable` | 已不再使用“controller.js NOT_FOUND”推断 runtime 不存在；准确事实是生产 HTTP/服务接线仍有限，不把测试注入 callback 当 production Port |
| V3 控制流 | RunRepository、AttemptController、GraphController、EffectController、ApprovalController、JoinController、AttemptSettlement 已存在；Join freeze/member/epoch/source digest 与 verifyResults；Effect ready/claim复验 | 成员/结果/Source/授权依赖注入 hooks；原真实 Model/Context/Source/Effect consumer、Narrative output 和完整 Host RunProjection 生产主链未证实接通；新 Graph/Run UI 未交付 |
| V3 Storage 并发合并 | `0d799fc28` 合入 main ResourceCenter/lifecycle/quota；Host owner参与 Engine handover，withAccountLock 纳入 ownership；ResourceGraph:700 接 `getOrchestrationReferences`，persistence route/resource删除有 pin/reference checks | 0d相对da4的Orchestration控制器/endpoint/schema无新diff；31bef的transition/schema增量另已核查；新增 lifecycle 分支和回收/GC/backup对 Plan pins 的保留仍须原完整权限/恢复组合验收；本轮不替他人实现出结论 |

**G1 = PARTIAL / NOT_CLOSED。** 现已从“已知路径、有界远端搜索”推进为全域语法索引和核心消费者人工闭链；但非 literal、注册器、外部插件/作品、原生端口的完整动态/source consumers仍不能称穷尽。缺口须列具体对象，不再以“没有 local checkout”作为理由。

## 3. 跨合同缺口和证据结论

| ID | 本轮事实与修正 | 唯一责任／必须明确的物理出口 | 状态 |
| --- | --- | --- | --- |
| **E0-01 Node/Route/fallback** | main RouteResolver:92 使用 Route Program；GenerationService:46–49 hash绑定首 Route.promptProgramRef，改变时报 `generation_semantic_authority_changed`；V3 Node 的 agentPinId/dependencyPinIds不等于 Behavior Program已发送 | 原 V3受信 NodeAttempt/ModelPort 与 RouteResolver/Compiler确定 Node Program Selection 的内部字段、purpose/role/版本/授权；同有效Program/输出/工具/网络/费用策略的 fallback 重编译和发送前复验。D4 的物理备选未在本轮擅自选定 | **BLOCKED（物理合同未闭）** |
| **E0-02 ContextSlot trust** | `context-providers.js:5,38–44` 已把 recent_raw/memory/narrative_spine作为 user history，属于已有防护；其他 context.fact及模块 ContextSlot仍经 Compiler:234/242 和 renderer system路径，需保留来源/指令类别；不能写“全部 Memory 都被提成 system” | 原 PromptCompiler/ContextPort/ProviderPort 的 D5 Typed SemanticBlocks/lowering；明确 Host-only policy、author instructions、state/fact、低信任 quotation/tool/result边界，保存 raw且不可数据提权 | **BLOCKED / STATIC RISK；未复现漏洞、未修复** |
| **E0-03 Source-aware/长会话** | compiledBinding 有 source/resource/target/content fingerprints；ContextProvider复验 revision/branch，Session/Memory/媒体有各自 current guards；V3 Join/Effect已按 epoch/source digest/hook检查 | 原 Information/HCM/C2/Context authority 明确Source/Actor/Grant/Branch/Variant/WorldTick/ScopeEpoch/Disclosure的失效传播、缓存读取前/compile/send/Join消费前复验；hash/TTL不发权限；长会话来源/遗漏/认识地位保真 | **PARTIAL / UNKNOWN；新D6质量与全链NOT_RUN** |
| **E0-04 Draft Preview/Diff** | Runtime Diagnostics `/preview`为受权exact refs编译；Studio前端 Source Graph有自己的草稿表现preview；都不证明D8未发布Prompt draft可由可信Host无发送编译 | 原 Host 内确定合法 Draft handle/validation/source/capability/脱敏Wire 的隔离编译端口与同源 Diff identity；不resolve Secret/send/write、不放宽 execute，不造 Browser compiler | **BLOCKED（接口未定/未接）** |
| **E0-05 source_unready/质量来源** | `quality.js:91–93` 的 requirePilotSources合法 profile后仍直接 throw `source_unready`；evolution-evaluator compare消费；相应 negative tests存在，本轮未执行 | 原 Experience/Eval固定来源目录、QualityProfile、Worker取得合法受审development/promotion来源与独立评价；不伪造样本，不把任意拒答计失败，不自设额外样本/第二模型审批 | **BLOCKED；新增文学/Agent/误拒/长篇实证NOT_RUN** |
| **E0-06 旧清退/plan-prompt** | EvolutionTargets:18/41/64/101–102仍有workspace prompt/strategy与bounded Director；Play/Settings/Skills/Search/Studio仍消费旧合同；V3 PlanRepository已有Binding CAS内部能力，但authoring-service拒source binding，完整plan-prompt未接 | 原 EvolutionTargets/PromptCandidateStore + V3 PlanRevision/PlanBinding/publication journal/rollback；选已获准exact Module、更新immutable Plan、CAS与恢复；清退旧target和mode，保留Native Memory/Goal/World/Visual等 | **BLOCKED；内部CAS存在不等于产品链已运行** |
| **E0-07 全前端输入与视觉** | 独立研究资料已按整个产品清点、操作链/组件/三端/处置分账；D8功能已冻结；新视觉完全开放 | 原 Library/Studio/Play/V3 Shell/Graph/Inspector复用；外部AI之后提供HTML+全功能表现+整体指导，再由用户多轮确认；不在本轮建新视觉权威 | **RESEARCH_DELIVERED；VISUAL_OPEN；运行NOT_RUN** |
| **E0-08 实施验证** | 本轮只有文档/静态索引，不借用其它Record的历史测试作为本轮PASS；Storage并发合并的测试仍归其原Record | 后续原Host/Source/Provider/Eval/Storage/UI按实际改动做针对性验证；模型/费用、权限、恢复、三端端侧证据在获准实施时取得 | **NOT_RUN；不是设计E0永远不能完成的前提** |

### 3.1 下一次合同讨论必须带出的物理项目

| 项目 | 已知可复用落点 | 还缺什么可审查决定／证据 |
| --- | --- | --- |
| C1 Node Behavior Program | V3 Node/dependency pins/ModelPort；原 RouteResolver/Compiler/GenerationService | exact Program的内部选择和仲裁字段、允许来源、fallback恒等判定；不能只加Browser selector |
| C2 Semantic trust/lowering | 原 context provider/compiler/renderers/adapter capability | Typed block来源/role/priority/provenance映射、冲突和unsupported失败出口；维持同一compiler |
| C3 Source currentness | 原 HCM/Information/Context、compiledBinding、V3 hook | 失效触发者/consumer清单及read/compile/send/Join各检查点；失败要 unknown/stale而非静默复用 |
| C4 Unpublished Prompt Preview | 原Host preview与原Draft/Plan validation | Draft handle、合法source、无发送/无写权限、脱敏wire、exact diff identity；本轮未新增API |
| C5 plan-prompt Evolution | 原candidate store/quality sources、V3 immutable revision/binding CAS | target union、exact Module/Node pin、publication journal/回执reconcile与rollback；先来源ready |
| C6 跨域删除/恢复 | ResourceGraph/getOrchestrationReferences、原Storage Center/lifecycle/pin roots | Plan/Revision/Run/Result/Source/版本/资产的引用保留、恢复closure与权限重验；合并不等于全部组合已验收 |

这是跨合同的待核对接口清单，不是新增第二份 schema 或授权实施的方案。

## 4. 实施依赖顺序（仍为规划，未建立实现分支）

1. **S0 消费者与协议设计闭包**：原台账+本轮索引中有界/动态/UNKNOWN的具体对象，补调用与读写/删除/恢复责任；完成C1–C6设计，不用新层盖旧系统。
2. **S1 V3与原Model/Prompt对齐**：受信Node Program/Route/fallback/Output/Attempt/费用身份，原Context trust/lowering；依赖V3实时HEAD和原Port。
3. **S2 Compiler/Provider语义**：D5 S2/L2/D2/K2/T2，原token/compute权威；unsupported/unknown不得变成功。
4. **S3 Context消费与长会话**：D6 U2/E2/H2/V2，原Source/Audience/Actor/Branch/Time/grant/Disclosure失效；普通RP默认单Narrator热路。
5. **S4 Experience/Eval/plan-prompt**：来源ready→独立评价→candidate/review→PlanRevision/Binding CAS/journal/rollback；同一硬切中删除旧Workspace/Director consumers。
6. **S5 D8功能UI与可信Draft Preview**：Library/Studio/Play原位资源、无损raw/structured、authored/effective/wire、diff/inspector；视觉重构仍等用户外部材料与批准。
7. **S6 针对性工程与端侧验收**：按实际变化取最小相关Node/Host/权限/Provider/恢复/UI/三端证据；不伪造PASS，不把Agent自设数量当新用户Gate。

## 5. 开发前 Gate（设计、授权、视觉、实测分别记账）

| Gate | 满足标准 | 本轮真实状态 |
| --- | --- | --- |
| **G0 既有设计** | D1–D8功能语义同一Plan/Record，单Host/原权威/零旧兼容/视觉开放边界清楚 | **功能冻结保持**，非产品验收 |
| **G1 消费者E0** | main/V3固定HEAD的实际入口、动态/注册、配置、权限、读写/删除/恢复和测试consumer闭包；未穷尽者有具体未决责任 | **PARTIAL / NOT_CLOSED**；本地全域索引已取得，动态/Source/替代删除闭包仍未完成 |
| **G2 跨合同E0** | C1–C6的原物理落点、输入identity、失败出口、复验与责任一致；实现后才可运行的测试单独列 | **BLOCKED / NOT_CLOSED**；不能把原Port未接通写成仅缺视觉 |
| **G3 本Prompt任务开发授权** | 用户明确授权正式开发/创建实现分支并核当时基线 | **AUTHORIZED（2026-10-16）**；用户确认包含 D2–D8 全后端，允许非破坏性自主推进及子代理；本任务实际基于 main@695 建同名语义分支 |
| **G4 前端参考与实施** | 源码功能审计、外部代表性 HTML/全功能表现/设计指导、真实能力边界 | **REFERENCE_RECEIVED / FRONTEND_DELEGATED**；三文件已收到，189 ID 各一次验证；用户指定 Claude Code 实现。§8.4 的未定产品提案与美术没有被本后端任务伪称冻结 |
| **实施验收** | 按改动取得权限、编译、Provider、来源、恢复、UI/三端证据 | **后端定向本地验证已有 PASS；整体仍 PARTIAL**。实际组别/失败修复归同一 Record；真实模型质量、独立来源、完整 V3 和前端/三端仍 NOT_RUN/BLOCKED |

用户当前开工指令已更新此前仅研究限制；工程决定落在 [backend-implementation](backend-implementation.md)。G1/G2 的生产消费者/质量来源缺口仍不能靠开工或 UI 演示核销。没有把 V3 活跃分支、独立受审来源或前端实现交付冒充本任务已完成。

## 6. 当前结果与剩余工作

2026-10-15 的 §1–4 静态事实仍绑定其旧固定 SHA；**当前实施增量以 §8 和同一 Record 为准**。E0 整体 NOT_CLOSED；不能继续把已实现的核心 Draft Preview/Typed lowering 全部称为“接口未定”，也不能把原 V3 生产、独立质量来源或旧消费者清退写成已通过。前端交接详见 [Claude Code 提示词](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)。

## 7. 历史首审与本轮并发变更

上一轮远端首审使用main `5eb3bc765…`，后发现Storage合入`73557f809…`；V3由`c04f36925…`到`cff1d2453…`新增Join/settlement。当时已保留G1/G2 NOT_CLOSED。原“controller.js路径未找到”只证明该路径，不能证明没有runtime controller；本轮已用真实目录/注册链纠正。

本轮V3又由`99da3eadb…`到`da4c38e90…`（本地volume adapter/ownership），最终`0d799fc28…`合入最新main。已核对endpoint/Orchestration控制器/schema无新差分，补读Storage Host owner/lifecycle、quota、persistence和ResourceGraph接线；索引已按最终固定V3快照重建。docs并发提交只更新其它任务文档/预览，保留其原提交和资料；本任务不提交别人的未跟踪企划或实现。

本台账所有静态结论都绑定上述版本；未来开发前仍核真实HEAD。文档提交/推送的最终SHA由Git与同一Record追溯，不预先伪造提交号。

### 提交前最新增量复核

- main由73557f809推进到695acf3bc：只有Storage Center UI/CSS/中文文案和相关E2E/helper变更。补读新的storage-center-drawer与storage-management完整控制链，增加C09/C10条目（drawer/Back/焦点/拖动/减动/IME刷新延期；不可逆清理二次确认）。未采用其视觉作为本任务新审美权威。
- V3由0d799fc28推进到31bef9572：新增TransitionController，显式loopBack/forward DAG/maxVisits/maxLoopIterations及deadline Join部分输出许可；generic beginAttempt不再通过换commandId重复准入。只读authorizeTransition hook返回原Source/Result/Grant/Budget identity、durable producer receipts和transition CAS；控制器不reserve或send、没有新增生产HTTP dispatcher。已补O09和15份V3测试索引，Model/Context/Source/plan-prompt的既有阻塞不因此销账。
- 本轮结构/行号/证据以最新固定main/V3重建；main新UI尚未合入该V3提交，两分支状态分别表述。source和docs并发变更均非本任务实现。

## 8. 2026-10-16 后端实施增量与真实剩余 Gate

实施使用 `refactor/atria-native-prompt-preset-deepening`，基线 `main@695acf3bc`。当前实际提交/验证与并发 SHA 只归同一 Record；下表替代 §3 中相应“尚未实现”的旧状态，未重写前一轮证据。产品实际接口说明在源码 `src/native/model-prompt-runtime/README.md`。

| 项目 | 本任务取得的事实 | 剩余 Gate |
| --- | --- | --- |
| E0-01 / C1 | 原 Host.execute→scheduler→Resolver→Compiler→Provider 已接可信 internal `programSelection`，JSON 无权提交；实际 ContextPlan 交原授权回调复验。Fallback 逐路解析/编译/计数，锁有效 Program closure/作者语义/参数/工具/输出/网络/原预算，允许合法 Context 重选 | **CORE_TESTED / V3_CONSUMER_BLOCKED**。原 V3 Node pin/Plan admission 必须构造真实权限回调、提供 Audience Context 并写 Attempt/Receipt；单元注入不算正式 Node Run 上线 |
| E0-02 / C2 | Typed SemanticBlocks 与 Inspector 字段双投影校验；事实/Persona 为 user evidence，Host policy/作者指令分账；提交的 system/developer task envelope 保留原文并降数据。Provider count/render/send 使用同一降低路径；不支持的中间 system 仍拒绝 | **CORE_TESTED**。不是对自然语言 Prompt Injection/角色串知的绝对保证；不同真实模型的文学/拒答表现 NOT_RUN |
| D2/D3 F2/E2/A2 | Module 可选 literal/template（不补默认字段）；任意花括号、CRLF/Unicode 原文可无插值保留。global/scene/narrator/actor scope 在原 Module/Compiler/真实 wire 表达，作用域不是 grant；Narrator 严格自主权/身份与表达分离 policy | **CORE_TESTED / QUALITY_NOT_RUN**。原 Player/Source 没有已接通的有限委托 UI/授权链，不用 Prompt 伪造；审美、叙事质量不因 policy 文本存在而通过 |
| E0-03 / C3 | 编译前、Secret 后发送前、实际重试、Preview 返回前复验原 Source。原 Session branch/revision/authority state 与 Project/Task fingerprint 变化阻止外发；暂存 World 用原 committed authority 比较。Browser 消费与 retained result 再独立复验 | **PARTIAL**。完整 V3 Source/Audience/Disclosure/Join、Provider continuation 和长会话来源保真/文学/成本全链仍需原生产消费者 |
| E0-04 / C4 | 新 `/preview/draft` 在原 exact reader 上临时覆盖现有 Library/当前 Project Program/Module/Generation；同身份/基础 hash/closure/权限、未消费替换拒绝；三层+同源 Diff，无 Secret/send/write。公开资源指纹可用于 CAS 预览 | **CORE_TESTED / UI_NOT_RUN**。限现有 exact 基础资源；Package 原件先 Fork；不把新建身份或作品 Source Graph Preview 当受支持的 Prompt 草稿。三端编辑器还没接 |
| D8 Inspector 披露 | 原 Information 的 model context≠player display。旧 Preview 与新 Draft 对私有/不能证明完整显示权限的 Context 拒绝；public-only 独立投影可放行。Execute JSON/SSE/retained 成功结果只返回受限摘要，不回传私密 IR/Context/raw hashes，也不把成功改失败 | **CORE_TESTED**。含 Knowledge/Memory/derivation/processing/expression 等缺完整 player 字段证明的 Preview 目前保守 BLOCKED；不能在前端显示空白后冒充完整 wire |
| E0-05 / C5 | 原 QualityProfile 增文学/Agent/合法创作误拒，硬约束与来源等级独立；认证只读 `/quality-profiles` 提供真实 readiness。明确 Provider 协议拒绝得到专用 code/usage，不做内容拒绝 fallback；自然语言“抱歉”不冒充协议证据。移除自设固定评测数量/1024 输出上限；修反馈失效清理并发竞争 | **SOURCE_BLOCKED / source_unready**。未伪造 reviewed development、独立 withheld promotion、人工审阅/校准/质量收益。仍需真实材料与原评价消费者 |
| E0-06 / C5/C6 | 原 Candidate、Library/Project/Package、Storage 没有第二 writer；已有原 Project/Skill 评测/候选/发布/回滚消费者保持并回归。旧 Workspace/Director→V3 方法级缺口已核 | **BLOCKED**。`plan-prompt` 的 immutable PlanRevision→PlanBinding CAS→publication journal/reconcile/rollback、Node/Source/Output/RunProjection 生产链与旧目标/入口同切尚未完成；不做迁移、别名、转换或兼容 fallback |
| E0-07 / G4 | 三份外部文件已收到，189 个功能组在全功能文档各出现一次（无缺漏、额外或重复）；功能架构问题与视觉参考分开 | **REFERENCE_RECEIVED / FRONTEND_NOT_IMPLEMENTED**。HTML 的模拟能力、用户报告的浏览器检查不算本后端任务的产品验收 |

### 并发 V3 的当前边界

本轮已从初始 `618a04ae1` 只读复核到 `18c22338e`：新增原三银行 GenerationHost send、SourcePort、Effect dispatch 内部组合和 Audience ContextPort 的 compile/revalidate/provider。不能继续描述为“Source/Context 类完全不存在”。但该 SHA 的 production HTTP 仍只有 Plan Authoring，`authoring-service` 对 bindings 仍 source_unavailable；内部组合仍需要真实 effect authority，ContextPort 不能证明全产品 Node/Plan-prompt/Output/Evaluation 已接通。活跃工作树的新 ToolPort/恢复/引用根改动未混入本任务提交，也不冒充已发布证据。

提交前最后 fetch 又确认 V3=`4e0ce4bad896b45e6fd384554c13effd05790308`：`072a4e1ef` 已提交原 Tool 协议/凭证/A2A ownership，`4e0ce4bad` 已提交 Source/unknown budget 维护保留；补核相关差分/端点注册与 authoring bindings 后，production HTTP 仍仅 Plan Authoring，plan-prompt/Node Program 组合未因此变为已验收。本任务没有复跑或借用这些并发 Tool/SQL/恢复测试。

### 当前交付与停止位置

V3 后续中间范围同步已收到并核对 `docs@8f7458358` / source `4a62ba5cc` 的原 [整合入口](../atria-native-orchestration-v3/backend-integration.md)、接口 §17.15–17.19、验收 §9.1 和原 Record：D8/W08 全范围已并入统一前端提示词，P3 仍 IN_PROGRESS / NOT_READY，P4–P8 未交付。缺失 runtime API/领域消费者是原 V3 后续已授权实施，不当成仅需外部条件的 BLOCKED，也不转移给前端造假端口。此次是中间范围同步；最终后端完成 SHA/新接口尚待原任务交付，未合两源码、未运行组合回归、未改 main。

本任务可独立后端接口及相关本地验证交付；**整体 E0 仍 NOT_CLOSED**。保留语义分支而不向 stable main 混入未完成的跨任务组合，也不清理其他活跃分支。具体提交/测试只记同一 Record。前端由用户转交 Claude Code；后续需协调原 V3 接线及真实质量来源，不在浏览器创建假的运行/评测/发布权威。此处停止不表示 D2–D8 的模型质量、完整 V3 或全产品前端已全部完成。
