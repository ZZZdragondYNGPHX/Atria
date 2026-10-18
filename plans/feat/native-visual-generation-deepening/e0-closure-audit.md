# E0 收口审计：原生视觉生成深化 D-001～D-013

- **Task ID**: `atria-native-visual-generation-deepening`
- **Frozen Plan baseline**: `docs@179b8938cf2b5d13093e073861c772e7eedba06e`（D-013 最后跨文档提交完成）。本审计本身会产生新的 `docs` SHA，切勿把旧 SHA 当成当前 HEAD。
- **Read-only product baseline**: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`；本轮未创建或合并 `feat/*`，未修改 `main`，未启动软件、CI、浏览器/手机、FS/SQLite 本地测试或真实绘图 Provider API。
- **Rules authority**: `docs:README.md` Governance v1.5，尤其 §1、§2～5、§7～8、§12～14。**本 E0 属于同一 Plan Bundle 的设计审计，不是实施 Record/HANDOFF**。
- **Module routing**：[index.md](index.md) → [decisions.md](decisions.md) → 当前实现领域文档。最关键依赖：[native-contracts-ui-delivery.md](native-contracts-ui-delivery.md) D-013、[provider-protocol.md](provider-protocol.md) D-003/D-004、[visual-continuity.md](visual-continuity.md) D-005/D-006、[visual-director.md](visual-director.md) D-007/D-008、[media-editing-gallery.md](media-editing-gallery.md) D-009/D-010、[media-precision.md](media-precision.md) D-011、[provider-editing-matrix.md](provider-editing-matrix.md) D-012。
- 审计结论只是划清设计/实现/外部证据边界。

## 1. 前十三轮逐项交叉审计

| 轮次 | 已冻结的唯一方向 | 与后续轮次的兼容性 / 未完成部分 |
| --- | --- | --- |
| **D-001 C** | 手动/半自动/全自动 **一条**生成/作业/资产管线 | D-007/D-008 的独立预算与三种模式统一；UI 需要单一 Job/Media Core，不能复制每模式 Provider 调用 |
| **D-002 A** | 正文 Commit 后才允许 Director 正式读取/决定/生成 | D-008 Scene/Shot 锁定已提交 Revision；不实现未批准的流式推测/付费预生图 |
| **D-003 C** | 中立 ImagePromptIR + Provider Adapter + Capability Negotiation | D-012 细化单项与**组合**三态；精确请求/证据序列化与 SDK/HTTP 仍待 S0 |
| **D-004 B** | P0 NovelAI/ComfyUI/OpenAI Images → P1 Gemini/A1111-Forge/RunningHub，P2 扩展入口；Connection/Target/Rendering 三层 | D-013 S2/S5 覆盖对应家族；|
| **D-005 C** | Visual Identity/State/References 分层、正式 Actor/Scope/Branch/Disclosure 唯一权威 | D-006 实现证据更新；非正式临时角色 ID 及 standalone 非剧情创作需进一步定义作用域 |
| **D-006 C** | 世界/剧情事实 + 有锚点 LLM 候选的混合视觉状态，冲突硬门禁/参考按用途筛选 | D-008 Scene 时态与 D-012 Required 的事实/隐私锁不冲突；持续状态/同 Revision 多时点抽取的精确 Schema 在 S3 |
| **D-007 C** | 低成本筛选 → 必要时 Director LLM → 授权/预算 → Durable Job | D-008 的具体阈值/账本闭合；内存调度不能冒充 durable |
| **D-008 C** | 跨 Commit Scene/Shot；30/25/20/15/10 初始权重、75/55 阈值；自动默认关；双账、可调 2/8 图片及 8/24/30000 Planner 默认；持久恢复 | Scene/Job ID 与精确租约/原子账目仍需 S0/S1；云自动默认费用 0、提交不确定不自动重发不得放宽 |
| **D-009 C** | 不可变 ImageArtifact/MediaOperation DAG、Regenerate/Img2Img/Inpaint/Upscale/Gallery 正式范围 | D-010/D-011 细化 Mask/引用安全；不能把编辑结果当正文/另一分支的事实 |
| **D-010 C** | 可逆 Media Studio、跨 Provider 显式编辑、异步版本默认入历史、分级删除/SavePoint/参考晋升 | 现有 `addImageVersion` 自动选中行为必须改造；用户明确完成即使用仍需 CAS |
| **D-011 C** | 单通道 8-bit Mask（0 保留/255 编辑、原图像素坐标）、2 秒/50 命令草稿、30/7 天两阶段 GC、可编辑 SavePoint/导入 | D-012 的 Provider 原生 Mask 极性转换不改变 Canonical 语义；归档体积/并发/Root 列举仍需代码合同 |
| **D-012 C** ||缺 L3 只标 `not_run`|
| **D-013 C** | 强契约 Core-first、统一 Native 逻辑资源与 API、三层配置/三端响应式 UI、S0～S6 七阶段/25 子阶段和垂直薄切片 | 具体字段/HTTP URL/DB 表、权限/Blob 流传输与 stage 交付测试还需 S0 形成可执行合同；不改变前十二轮硬边界 |

**结论**：没有发现必须推翻已批准方向的架构级矛盾。发现多处**历史候选/旧轮次状态标签**（例如 Director 的 Round 9 展望、Provider Protocol 的 Round 13 待议、过去“尚未冻结 Mask 数值”），它们应保留为明确标注的历史上下文或改为当前 D-xxx 索引，避免 Codex 将历史说明误读成仍未批准；修订只修路由/状态，不改变决策正文。

## 2. 与现有 `main` 的真实静态差距（E0 证据）

| 当前代码位置 || 受阻的 D 与必须改造处 |
| --- | --- | --- |
| [`public/shared/native-illustration-contract.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/native-illustration-contract.js) | `assertImageRequestSnapshot()` 导入/调用 `renderNovelaiIllustration`，图片 State 为 `annotations[]/images[]` 且单状态 8192 images、8MiB JSON 上限 |大对话不能仅累积扁平图片状态|
| [`src/native/illustration-image-service.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/illustration-image-service.js) | 直接 `createNovelaiImageProvider`/`renderNovelaiIllustration`；运行时从内存 Scheduler 的 `operations` 查 active；以 Annotation 键去重，`retry:false` | D-003/D-007/D-008：Adapter/Target 解析、持久 Job/Attempt/Remote ID 与预算预留必须替换旧单路 |
| [`src/native/task-scheduler.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/task-scheduler.js) | `operations = new Map()`、`queue=[]`、`running = new Set()`，现有排队/取消/内存 retention | 可复用执行并发管理，但**不是服务重启可重连的持久作业数据库**；需另有事务/租约/unknown-submission |
| [`src/native/illustration-service.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/illustration-service.js) | `addImageVersion` 通常把新图设为 `selectedImageVersionId`；`selectImageVersion` 有 Branch/expectedHead | D-009/D-010/D-011：历史追加与显示指针 CAS 分离，晚到 Job 不抢用户选择；重新生成独立 Intent |
| [`public/shared/illustration-plugin-contract.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/shared/illustration-plugin-contract.js)、[`public/scripts/native/illustration-settings-ui.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/illustration-settings-ui.js) | Settings v1 将 NovelAI scale/steps/sampler 与图像连接及文本 prompt route 混合；按 Global/Work 覆盖 | D-004/D-013 三层 Profile 与 Task/Annotation/Work/Global 覆盖，应明确 hard cutover，不保留两套图片配置 |
| [`public/scripts/native/runtime-workspace.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/public/scripts/native/runtime-workspace.js) 与 [`src/native/model-prompt-runtime/contracts.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/model-prompt-runtime/contracts.js) | 已有 Connection/Secret/模型/Route UI，文本 Runtime 中已有三态 Capability/来源，图片接口目前以 NovelAI 为主 |扩展 Comfy Workflow 类型绑定|
| [`src/endpoints/native-session.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/endpoints/native-session.js)、[`src/endpoints/native-generation.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/endpoints/native-generation.js) | 已有 `/illustrations/read`/命令、Runtime Configuration/Resources/Secrets 和辅助图片任务操作 ||
| [`src/native/repositories/asset-store.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/repositories/asset-store.js) || D-009～D-011：MediaOperation 父图、Mask、Reference、草稿/Job、SavePoint 和导入导出租约必须进入可达性/GC 根 |
| [`src/native/save-system.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/save-system.js)、[`src/native/save-container.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/save-container.js) |现容器有 256MiB compressed、4096 entries、单项 64MiB、512MiB uncompressed 上限| D-011：正式 SavePoint 全可编辑会增加 DAG/Mask/Reference 依赖；必须设计闭包大小/过限显式错误、 streaming/chunk/budget 策略，不得绕过 Zip 安全限制 |
| [`src/native/session-core.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/session-core.js) | `appendTimeline` 存在 `commitId`/收据与正式 revision，`finalizeTurn` 另有 `invocationId` 路线 | D-002/D-007：Director 应只在**任一合法正式提交路径**成功落库之后被通知/扫描，需跨入口 exactly-once 本地派生意图，而不是只监听某一 UI 的流式完成事件 |
| [`src/native/identity.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/identity.js)、[`src/native/model-prompt-runtime/resources.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/src/native/model-prompt-runtime/resources.js) | Native ID 家族与资源类型当前未覆盖全部新的 Scene/Shot/ImageTarget/MediaOperation/Mask/Budget 等身份；版本化 Model/Prompt Resource 集只有现有 core 类型 | S0 必须正式增订新身份/ResourceType/作用域/版本引用，保持同一身份权威与不可变/CAS 语义 |

**Evidence limit**：上表只来自公开 `main` 远端文本审查；没有测得 CPU/GPU、内存、端点网络、SQLite 性能或任何 Provider 成功率。远端 Git HEAD 不等于本地测试 HEAD。

## 3. 尚未冻结的关键接口、最晚完成阶段与责任分类

`phase gate` = 到指定 S 阶段启用相应功能前处理；`scope` = 若要扩大已批准产品功能才需要用户重新决策。

| ID | 尚缺的具体合同/证据 | 最晚完成 | 责任及当前阻塞性质 |
| --- | --- | --- | --- |
| **E0-01** || **S0.1** |剧情外 standalone 创作不擅自纳入|
| **E0-02** || **S0.1 / S0.2** |Provider 原生参数不强塞所有目标|
| **E0-03** | `ImageConnection`（复用现有 SecretRef）、ImageTarget/Workflow/Rendering Profile 的 ResourceType、ID、owner/scope、覆写/版本/CAS、CapabilityManifest 与 TTL/组合指纹 | **S0.2 / S1.1** | **S0/S1 gate**：Codex 可定实现字段，必须支持 D-004 四级选择与三层拆分 |
| **E0-04** || **S0.2** | **S0 gate**：具体 URL/函数名可由 Codex 按当前入口选择，不允许双套事实路由 |
| **E0-05** | 正式 Commit → post-commit Director 的可靠发现/去重机制：`commitId`、`invocationId` 等多合法入口、Scan cursor/outbox、重启、同一源不重复发布 | **S0.1 / S1.2，S3.3 完成** | **S0/S1 gate**：不得仅监听 Stream/DOM；具体 enqueue/outbox 策略属工程实现，必须先证明事实只来自已 Commit 的 Revision |
| **E0-06** | `VisualIntent` vs `ImageJob` vs `Attempt` ID，远端 idempotency/Task ID、lease/fencing/状态不确定、CAS 结果发布、预算数量/金额原子预留与释放、重试/取消回执 | **S1.2** | **phase gate**：必须先于真实付费/自动任务外发；未知提交不得盲重试或退款 |
| **E0-07** | Media DAG 的 ID/父子/Mask/Reference 归属、Gallery selection CAS、Blob/AssetRef、全部 GC Root、软删/物理清理与导入导出保护租约 || **S0/S1 gate**：S1 的最小 Blob/历史闭包先可用；后期完整编辑 Root 不可在启用前缺席 |
| **E0-08** | `.atriasave` 完整编辑级 vs 展示级 closure Manifest、ID 映射、导入事务/补偿、体积/条目预算、跨平台 FS/SQLite、源秘密/图片权限 | **S1.4 最小；S4.4 完整** ||
| **E0-09** | Visual State/Actor/Scene 独立事实的增量投影、自由 RP 临时身份、情节显式换装 vs 结构化状态冲突、Reference 作用域与跨分支可见性 | **S3.1～S3.3** | **phase gate**：D-005/D-006 已规定权威与硬门禁，具体缓存/证据事件 Schema 可在阶段内自决 |
| **E0-10** || **首次外传/带图任务前：S2/S4** | **phase gate，部分 external**：不能从“玩家可见”自动推导“可以把私有素材发给任何云端”；|
| **E0-11** | 设置/UI：Controller/Writer 归属、草稿 CAS、作品/标注/单次覆写、Director Route、真实能力/费用来源显示；响应式 Canvas/图片历史/空态与错误说明 | **S2.1 最小、S3/S4 完整** | **phase gate**：布局/表单具体选型不应成为用户逐控件审批；不得静默改玩家选择 |
| **E0-12** | P0/P1 逐模型/Workflow 的官方协议、node binding、Mask 极性、Reference/Vibe/LoRA/ControlNet 组合与成本/错误回执、L1/L2/L3 状态 | **对应 S2/S5** | **phase gate + external L3**：模型/Service/插件版本会变；|
| **E0-13** | 历史迁移与 hard cutover：旧 `atri_illustrations`/NovelAI settings、旧测试与入口删改、Source/SavePoint 安全、资源版本注册 | **S0.3；S1/S2 回归** | **S0 gate**：dev 状态允许破坏式切换，不应持久双轨；精确迁移/弃用步骤由 Codex 明写 |
| **E0-14** | 用户设备与端点网络：Windows/CachyOS/Termux 真机 Browser/Node、ComfyUI 可达性、GPU、目标 Secret、充值或账号，安全受限 L3 || **external**：当前并无此类可访问凭据/现场；|
| **E0-15** | 独立角色肖像/游戏精灵/非叙事作品资产是否作为一等 VisualIntent、跨 Package 制作/发布的素材授权、批量任务 | **只在拟扩展范围前** | **scope**：前十三轮没有完整批准一个通用非剧情素材 DCC/批量/视频发布系统；默认不扩大本次正式核心，实现需求出现需单独决策 |

**分类结论**：E0-01～05/07/13 是**合同先决项**，在产品 S0/S1 实现前处理；并**不是当前必须用户逐条拍板的重大产品取舍**。E0-06/08～12 是各阶段的工程/安全必需完成条件；E0-14 是未来 L3/关键设备外部证据，确实缺时最小化请用户操作；E0-15 仅在用户要求扩充范围时触发。**当前没有发现阻止继续进行离线 S0～S1 代码工作所必需、且只能由用户立即完成的 API 授权**；但这不代表已得到开启产品开发分支的当前指令。

## 4. 尚存风险、解释冲突与修复要求

| 风险 | 审计认定与处理 |
| --- | --- |
| **历史备选/过期状态标签** | 旧 D-00x 模块保留当时的“Round 6/9/12 未批准”是时间轴背景，当前权威在 D-001～D-013 与领域最新模块。应修正顶部/当前阶段状态与路由，不必删除历史备选；不能将旧的限制恢复为新决策。 |
| **Stage 路由前后不一致** | 旧索引以 S1 中立/ S2 包括 P0+P1 / S4 Director / S5 Studio 为阶段**候选**；D-013 已把 S0/S1/S2(P0)/S3(导演)/S4(Studio)/S5(P1)/S6(三端) 冻结。以 D-013 及新索引为准，避免 Codex 依旧顺序跳过 P1。 |
| **当前追加版本会抢选中** | 旧 `addImageVersion` 自动写选择；D-010/D-011 要求默认先入历史/显式 CAS。属于必须修正的真实行为差异，不能声称已支持。 |
| **Mask alpha 误解** | Canonical 0 保留/255 编辑已冻结，但 OpenAI/Comfy/NAI/SD 的实际上传约定不同；像素级精准不能由自然语言语义编辑或模型“尽量保持”代替。 |
| **ImageJob 幂等性与上游收费** | 只保留一个本地 Job 不能保证未接回执时远端没有执行；记录 uncertain、冻结预算/请求证据、查询原 remote task。不能虚构第三方 Exactly Once 或取消即退款。 |
| **可见性和外部数据传输** | NPC 私密状态/其他分支图片不因本地能读就可向玩家展示或向第三方服务发送；|
| **长会话索引/存档体量** | 旧单一 state 有 8192 images / 8MiB 序列化上限；Media Studio 需要可分页版本/索引与不可变资源，而非扩大单 JSON 到任意大小。 |
| **Governance 与 Plan 默认配额混淆** | D-008 的产品自动图片/Planner 配额是用户可调运行时默认，D-011 GC/Mask 数字也是产品默认；`docs:README.md` §13.1 的开发测试 API **2000/day、20 RPM** 才是测试执行的独立规则。不得自创每阶段审批、额度或停止条件。|

## 6. 正式 Codex / Local CLI 交接要求

1. **唯一入口与权威**：先读取 `docs:README.md`（Governance）与 `docs:plans/feat/native-visual-generation-deepening/index.md`，再 `decisions.md`、本 E0 审计、`native-contracts-ui-delivery.md` 及当前 S 阶段所属模块；不要一开始一次性加载所有参考分支/历史记录。外部 st-chatu8 只作合规参考，**不复制 AFPL 代码**，无需同步其 reference 分支。
2. 正式启动时应重读最新 `main` 和变更差异。只在得到明确的**开始产品开发**指令后创建一个 `feat/*` 并使用独立 worktree；本 E0 不授权自动创建。
3. 任何需要改变 D-001～D-013 已冻结架构的决定才再次请求用户明确批准。普通字段/测试选择可由 Codex 自行决定。
4. 记录每阶段 Start/End/Tested HEAD、真实测试/CI、已知缺陷、L1/L2/L3/真机 `not_run`、下一步。阶段顺利通过立即推进，不要因为 Plan 描述 checkpoint 而人为停止。
5. **真正外部阻塞**：Live Provider 所需用户 Secret/付费确认、无法在当前设备模拟的关键 UI 真机/Termux 环境证据、仓库/外部必要权限或影响冻结范围的重大选择才可请求用户；不为普通 429、测试失败、CI 等待或旧文档配额停止开发。符合 Governance §13 的最小用户动作应明示。**不得私自实际调用收费服务**。
6. Windows、CachyOS、Termux 可用性证据也独立记录。尚未执行 L3 或真机只标 not_run，不把静态通过冒充正式发布可用。
7. 长期 `docs` 与 `main` 不 merge，计划不是产品改动证明。本审计没有创建 `HANDOFF.md`，因为用户没有要求中断交接快照。

**建议的首阶段 Codex 工作目标**：审计当前 `main` 与 D-013 的差异；在 S0.1～S0.3 明确 Image Source/IR/Config/Job/Media 的正式 Schema/资源身份和 Dev Hard Cutover，建立最小 contract+FS/SQLite 测试；保持现有 Session/Branch/SavePoint/Secret 语义；随后同分支继续 S1，不把每个技术字段反复交给用户审批。这个描述不是现在的自动执行授权。

## 7. 审计终判及剩余门槛

- **已通过**：13/13 轮架构与产品边界均有 D-001～D-013 已批准条目；主要代码改造锚点明确。
- 因此审计不能宣布“全量 Schema 工程实施就绪且全部 Live 可用”。这些是受计划约束的 S0/S1/S2～S6 必须解决的工作。
- **用户动作现状**：本次仅要求审计，没有要求创建 feat 或授予 API Key/云端费用。无须现在提供密钥、设备日志或逐字段批复；以后 L3/真实设备不可得时再按最小动作询问。
- **当前停留状态**：**E0 静态收口审计完成；Plan 可作为未来正式开发的架构依据，但接口级合同尚待 S0 实施固化，本次审计未创建任何开发分支。** 待用户下一条关于“启动开发/补充接口讨论”的明确指令再采取相应步骤，不提前创建 feat、不开始任何付费请求。
