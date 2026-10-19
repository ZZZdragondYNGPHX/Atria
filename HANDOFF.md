# 提示词／全产品前端交接：后端完成，转 Claude Code

## Task 与真实断点

- Task ID：`refactor/atria-native-prompt-preset-deepening`，继续原任务，不建立第二份 Plan／Record。
- Primary Workspace：本任务源码工作树；当前分支 `refactor/atria-native-prompt-preset-deepening`。
- 源码交接 HEAD：`3ca28c49828464261e44af86321f62e15b4f9a41`。
- 稳定 main：`745dbd19038938585d714b5c5be8f915a993fa27`；整体任务未完成，本轮没有合入 main／删除任务分支。
- docs 工作空间：独立 `docs` 分支，本文件与同一 Record／前端实施输入一并提交。读取最新 docs，不向 docs merge main。
- 用户最新安排：Codex 完成后端后停下，前端交由另一设备的 Claude Code。此文件是明确换设备所需的恢复快照。
- 原机器源码映射：`tasks/atria-native-prompt-preset-deepening/source`；另一设备按自己的路径定位仓库，不照搬机器绝对路径。
- 保留其他活跃工作：`feat/native-visual-generation-deepening@f030a38ff` 工作树本轮未修改／合入／清理；不要因为名称相近覆盖它。

## 接手先读

1. [治理入口](README.md)，尤其 §7、§8、§14；用户限制：禁止主动独立审查流程／审查子代理／多轮交叉审查。执行者做必要自查测试后直接交付。
2. [任务 Plan](plans/refactor/atria-native-prompt-preset-deepening/index.md)。
3. 当前前端所需模块：[D8 作者与界面](plans/refactor/atria-native-prompt-preset-deepening/preset-studio-experience.md)、[D4 Node 与继承](plans/refactor/atria-native-prompt-preset-deepening/agent-behavior-binding.md)、[D5 编排](plans/refactor/atria-native-prompt-preset-deepening/semantic-ir-lowering.md)、[D7 可选反馈](plans/refactor/atria-native-prompt-preset-deepening/quality-evolution.md)。
4. [全产品前端实施输入](plans/architecture/atria-frontend-audit/claude-code-frontend-prompt.md)，再按当前领域读取[操作链](plans/architecture/atria-frontend-audit/interaction-flows.md)、[组件归属](plans/architecture/atria-frontend-audit/component-and-architecture-findings.md)、[跨端操作](plans/architecture/atria-frontend-audit/cross-platform.md)与外部设计参考。
5. [同一 Record 的最后各节](records/refactor/atria-native-prompt-preset-deepening.md)。历史未完成／Gate／停止描述不覆盖最新源码和用户指令。
6. 源码中的 `src/native/model-prompt-runtime/README.md`、`docs/native-visual-generation.md`、`docs/features/native-orchestration.md`：实际接口与实现约束。

另一设备先 fetch，再核对源码分支／HEAD 与工作区。没有本地任务分支时从同名 origin 分支创建；已有脏改动先保留并判断归属。不要从 main 另开一份任务而丢失已完成实现。

## 已交付后端

- 合入已完成 V3 与原 Prompt 后端，保留同一次 Host 请求的 `programSelection` 与 `orchestrationSend`、原 Provider／Compute／业务结果。
- 同 target 的 Module／Anchor 单一显式条目顺序，稳定 entryId、exact Stage/Entry 派生、Context Contribution 与 SemanticBlocks；没有 priority／expression／ID 隐式重排。
- `derive` 新增 `stage.configure` 和 `stage.move`，详见源码 README。新增 Stage 仍写原 stages，再显式定位；Compiler `native.prompt.v5`。Anchor 本位置对完全相同且可识别来源的材料去重，匿名重复回合／不同来源和多 Anchor 有意复用保留。
- Draft Preview 两侧不同 exact 根／新资源／依赖 overlay，共享捕获环境，每侧编译一次。Library 独立样例无需游戏，手动试读走原 Scheduler／Host／Compute，unknown 用量保留。
- Node 独立 Program pin 接原 schema、dependency reader、各域准备／Fallback／ModelPort／候选。支持 Library／Project／Package exact refs；实际执行仍由当前原来源约束。Project 读取使用原 `observeProject`，不能退回会重入写队列的 `getProject`。
- Preset 多修订分享、完整 exact 映射、来源／本地基版、候选成对 refs；私人三方升级、原消费者采用接口。
- 原 PlanRepository 生命周期：`/plans/fork`（mode fork/derive）、`archive`（含恢复）、`delete`（仅未发布草稿），原 CAS 和 commandId 重试。Derive 是独立 graph/pins 草稿加 exact 来源，不是运行时 Graph 继承。归档保留 Binding／Run 已发布修订。
- 原图像服务独立 authoring source、exact Target/Rendering 预览、手动 Job、Asset、图片列表及归档／恢复。无需 Work／Session；已发布独立图片有长期资产根。当前独立试生成支持 txt2img，Session Media Studio 编辑／Mask／引用继续走原流程。
- 原 QualityProfile／Experience／Candidate／V3 Publication 保留。自动 plan-prompt 候选针对 Library 副本；普通 scoped 选择、编辑和运行不以评价来源就绪为前提。

## 已有前端：接续，避免重做

以下已在任务分支，不能按旧盘点的“尚未实现”重建：

- Library／Studio 共用 PromptEditor：正文／完整 JSON、共享 Undo/Redo、非法 JSON 缓冲、CRLF／选区／滚动、IME；Module/Anchor 条目移动和 exact entry 派生；空白／通用／RP／写作／Agent Task 普通模板。
- 无游戏样例表单、基准修订、Authored/Effective/Wire 和 Diff、显式试读／停止／结果；修改正文后旧结果有标记。
- 私人升级的旧／私有／新／合并视图、逐项冲突和依赖复制，合并进入原草稿历史；保存／导出／消费者采用分开。Used By 新增原 Plan pin，原 owner 深链保留。
- V3 Plan/Run/Binding 原页面，Library Plan 复制／派生／归档／恢复／草稿删除及未知结果同命令重试；修订面板可复制和派生，归档草稿恢复后编辑。
- Node Inspector 已有独立 Program 选择和原资源深链，但当前选择器仅筛 Library。
- Serene Canvas、Shell、NavigationAuthority、原 native ES modules/DOM/CSS、`--atri-*` tokens 已存在。此轮没切换新框架／全局主题。
- 手机 PromptEditor 底部新增安全滚动空间，修复 Dock 遮住末尾保存按钮；不要回退。

## 前端下一目标与完整范围

先补新后端的 UI 缺口，再按领域完成整份实施输入，不在每个提交或阶段结束时询问继续：

1. Program 派生编辑器接 `stage.configure`／`stage.move`；继承 Stage 的顺序和条件编辑。私人升级检查 Stage／移动相对目标消失，给明确重选／移除操作，和原 Draft／Undo/Redo／预览共用状态。当前升级组件只处理条目目标，不要假定已经支持新 Stage 操作。
2. Node Program 选择器按原来源显示可用 Project／Package exact refs；Pins 用原 `/dependencies/inspect` 取得 normalized fingerprint，不自己对未正常化 JSON 算 hash。保留 Route 默认与 Node 选择分别展示、深链与来源不符错误。自动候选的 Library 限制在对应操作说明。
3. Library 视觉作者 UI：保存／编辑 Target、Rendering 后选择 exact ref；无 Session 预览、显式试生成、观察／取消／重连、图片列表／归档恢复／读取下载。复用原客户端与服务，不建假游戏／假 Annotation／第二 Job Store。接口见下。
4. 全产品领域：Shell 搜索／深链／返回／Dock；Library Work/Session/World/Knowledge/Persona/预设和专业资源；Play 阅读／输入／生成停止／历史／存档／参数／作品 UI；Studio 全 20 视图与 Project Agent、Changes/Apply、Source、Assets、Preview、Simulation、Build；Agents/Memory/Goals/Experience/Eval；Runtime Route/Model/Connection/Generation/Retrieval；Settings/Account、Skills/Plugins/Search/Regex、Visual Director/Media/Speech、共享会话、备份／同步、Storage/Diagnostics。
5. 可选质量／候选展示实际原结果和具体缺项，无结果为未评价；普通编辑／分享／试读独立可用。
6. 随原生入口替代清退旧 ST／Workspace／Director／Loop／Agenda；保留有效 Memory／Goals／Experience／Skills／Visual Director。189 组旧清单用于定位，逐项对照实际源码，不照搬旧状态。
7. 桌面和手机具有相同操作能力，必要的键盘／触控／IME／Back/Escape／焦点／软键盘／reduced-motion；保存回执与刷新失败分开。做与实际改动直接相关的自查测试和真实浏览器操作，不能用 fixture 宣称真实付费 Provider 或真机证明。

完整任务完成后才按治理集成 main、push 并清理完成的任务分支／本 live HANDOFF；其他活跃任务保留。

## 独立视觉客户端接线速查

均在 `/api/native/generation` 下，沿既有认证和 CSRF：

- `POST /authoring/images/prepare`：`{prompt,imageTargetRef,title?,negativePrompt?,imageRenderingRef?,omittedPreferred?}`，refs 为 exact Library 资源；返回 `sent:false`、`prepareId`、prompt/evidence、capabilities/cost、`targetFingerprint`、`requestHash`。
- `POST /illustration-images`：原 `{prepareId,approval}` 显式手动提交。approval 字段见源码文档，未知费用不显示为零；同一 prepareId 重试得到同一 Job。
- `GET /illustration-images/:id/observation`：读原 Job，已发布时返回 `image`，其中 `ref` 是 AssetRef；显式恢复用 `POST /illustration-images/reconcile`，取消用 `DELETE /illustration-images/:id`。
- `GET /authoring/images`（可 `?archived=1`）：返回 `{operation,image}` 数组；`POST /authoring/images/archive`：`{operationId,archived:boolean}`。
- 图片字节复用 `/api/native/session/asset/:assetId?contentHash=...`；当前账号 owner 读取不需要 Session 参数。归档保留字节／Job，不能称为物理删除。
- 当前独立图库不会自动接入作品画面、Session 参考图或 Mask 编辑；这些功能继续原领域流程，不能伪造已经采用。

## 验证事实和限制

- Plan 生命周期 4 套件 29 项，后续归档错误信息 6 项复测通过，包含归档后原 Binding/ModelPort 真实本地 HTTP 发送。
- Scoped Node／可选候选／原视觉及独立图像 8 套件 216 项通过；资源／编译／预览合同 10 套件 143 项通过；最后 Anchor／Stage 相关 4 套件 89 项通过。分组有重叠，不相加。
- 最后 P4 原 Host fixture 补 `observeProject` 后 38 项通过；Node、P6、升级 UI 另已通过。Native maintenance fixture 有 writer-unavailable 警告，未造成这些套件失败。
- 产品 JS ESLint、简体中文覆盖、diff 检查通过。最终后端收尾没有新增浏览器或真实付费 Provider 调用；此前真实 Chromium 的作者编辑／升级和手机保存结论在 Record 中。
- 测试入口在源码 `tests/`：`npm run test:unit -- --runInBand --runTestsByPath native/... atria-shell/... native-orchestration/...`。不要在源码根运行不存在的 test:unit，也不要误建 `tests/tests`。
- 源码根检查：`npm run check:native-localization`、`./node_modules/.bin/eslint <变更产品 JS>`、`git diff --check`。依赖链接是本机忽略项，另一设备自行安装／关联，不提交它们。

## Claude Code 接手提示词

请接手 Atria 的 `refactor/atria-native-prompt-preset-deepening`，继续完成提示词／全产品前端重构。先同步远端源码同名任务分支（交接 HEAD `3ca28c49828464261e44af86321f62e15b4f9a41`）和独立 docs 分支，读 `docs:HANDOFF.md`、`README.md`、原 Plan 入口、全产品前端实施输入及同一 Record 的最后各节；根据你的设备定位工作树，保留已有脏改动和其他活跃任务。后端已收齐，已有 PromptEditor、样例／试读、分享升级、V3 及 Plan 生命周期前端必须接续，不重做。先补继承 Stage 控件／升级冲突、scoped Node Program 选择器、独立视觉 UI，再完成实施输入中的全产品范围、跨端交互和旧入口清退。复用原 native ES modules/DOM/CSS、Shell、tokens、客户端和原服务，按已确认视觉参考实现。不要新增独立审查／审查子代理；执行者做必要自查和真实浏览器操作。沿同一分支／Record 持续推进，阶段完成不自动暂停；整体完成才集成 main、同步并清理本任务。不能把后端完成当作整份前端方案已经完成。
