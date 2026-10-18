# Native visual generation deepening — Implementation Record

- Task ID: `atria-native-visual-generation-deepening`
- Plan: [index](../../plans/feat/native-visual-generation-deepening/index.md)
- Product branch: `feat/native-visual-generation-deepening`
- Start main: `7e1045ab836c22cafbc92c5de056ad701f56e723`
- Frozen design read: `docs@54c8949dccad402ca4471efad3c473bee7d60050`
- Status: **completed**。S0～S6 产品已集成并推送到 `main@9241325a7290e613e0fdaaa1870409105c161c89`；
- Authorization: 2026-10-14 用户正式授权连续完成 S0～S6、阶段提交推送、最终按 Governance 集成。
- Initial local audit: main/docs/package/plugin/已有 skill-routing feat 均 clean；fetch origin 后 main 未变，docs 从 e9107ba4b fast-forward 到 54c8949dc。新任务独立 worktree；其它任务保留。
- 远端为提交存储；CI `not_run`，不启用 Actions。
- Provider L3: `not_run`，尚无本任务真实 Target/Secret/明确付费授权；开发不主动收费。设备证据按实际取得记录。

## S0 — contracts / hard cutover (completed)

- Start HEAD: `7e1045ab836c22cafbc92c5de056ad701f56e723`
- 增加 Native ID 家族。
- S0.2: Image Target/Rendering 注册既有版本化 Native Resource；精确合同与读写/CAS/权限职责归产品 docs/native-visual-generation.md。
- 图片证据 schema 2 hard cutover，同一现有插画服务写新证据，不建 v1/v2 执行双路。
- 2 项失败来自既有 illustration-image fixture 调用已不存在的 SessionCore.forkBranch。改为正式 createSavePoint/restoreSavePoint 路线后复测中。
- End/Tested HEAD: `5b7b21edd`（完整 SHA 见 Git）。
- Next: S1 三层配置/持久 Job/预算/媒体闭包。

## S1 — neutral kernel (completed)

- Start HEAD: `5b7b21edd`; End/Tested HEAD: `8cdc38bb6`.
- S1.1: Adapter Registry / Target fingerprint / independent four-level selection / versioned Target and Rendering; Native Connection/Secret unchanged.
- S1.2: Persistent Native Job/Attempt, atomic admission with image/global-money/auto-money and independent Planner ledger, lease/fence, frozen receipt, uncertain-submission recovery, conservative cancellation. Scheduler only executes.
- S1.3: Immutable media operation/multi-parent DAG and canonical gray8 Mask dependency, AssetStore locks/roots expanded to Native jobs/drafts/references/leases.
- Idempotent publisher port and stored result recovery prepared for S2.1 integration.
- CI/L3: `not_run`. No remote Actions, API credentials or paid requests.
- Limitation: Durable worker integration into the production image entrypoint is next in S2.1; full Mask UI/GC grace policy remains S4 by plan. No claim of live Target availability.
- Next: NovelAI vertical slice on one new kernel, then ComfyUI/OpenAI Images.

## S2 — P0 backends (completed)

### S2.1 NovelAI vertical slice (completed)

- Start HEAD: `8cdc38bb6`; End/Tested HEAD: `4d9aaf979`.
- Production entrypoint now uses prepare/approval -> persistent Native Job -> Adapter -> AssetStore -> immutable ImageVersion/MediaOperation. Settings schema 2 selects Target/Rendering; no old connection-only execution route.
- Manual raw prompt preserved. Image selection is separate from asynchronous history publication. Targets/renderings/budgets are configurable through Native authenticated UI/API and CAS.
- V3/V4/V4.5 and explicit V5 Full protocol declarations; V5 native parameter version/tag hints/default steps handled separately. V5 Live/Medium effort not inferred.
- Product ESLint passed.
- Failure/fix: first combined slice run had HTTP fixture supplying wrong router factory and a SQLite nested transaction deadlock in publication. Fixture fixed; publication now retains the ledger lock outside the storage transaction and finalizes with CAS. Related 10 tests all passed on retest.
- Provider constraint: fetched official OpenAPI https://image.novelai.net/docs/doc.json requires human initiation. Other permitted targets still use the automatic core. This is legal Target capability, not removal of D-007/D-008.
- L3/CI `not_run`; no external paid generation. Next S2.2 ComfyUI, then S2.3 OpenAI Images.

### S2.2 / S2.3 ComfyUI and OpenAI Images (completed)

- End/Tested HEAD: `b8cbf6a2c`. S2.1 was integrated first at `4d9aaf979`.
- Shared global interrupt never sent.
- OpenAI: dedicated Images generation/edit compiler, native model/size/quality/input fidelity constraints; JSON edit input descriptors and canonical inverse-alpha conversion. Mask is a provider guidance constraint, not falsely a pixel preservation guarantee. Media input authorization/UI is completed in S4.
- Native Runtime now offers ComfyUI/OpenAI image Connections. Editable capability JSON cannot override adapter capability/price authority.
- L3/CI `not_run`.
- Next: S3 exact Actor/State/disclosure/reference projection, reliable post-commit Director, scene/shot scores, modes/budgets.

## S3 — continuity / Director (completed)

- Start HEAD: `b8cbf6a2c`; initial implementation `1dd6e05da`; source/admission correction `33d602d85a2e401ad29e948f4ce5fe0d7235f298`.
- S3.1: exact installed Actor or explicitly Session-scoped provisional identity; references independently scoped by identity/purpose/branch and explicit standard-image sharing.
- S3.2: historical Source/State projections, anchored proposals and confidence/review separation; only independent display fields are read. Formal/narrative conflicts block automatic adoption; future spans and siblings excluded. Raw prompt preserved.
- S3.3: Native Commit discovery markers cover commitSnapshot paths, restart-deduplicated scans, cross-turn Scene/Shot, present/dream/flashback, five default weights, thresholds and coverage penalties. Optional explicitly invoked Director LLM analysis is source bounded.
- S3.4: manual/semi/automatic mode UI (default manual), density, exact target preauthorization, Image/Planner independent ledgers; real LLM sends/retries now reserve Planner tokens/calls. Unknown automated cloud cost and NovelAI non-human sends are blocked.
- Failure/fix: two old forkBranch fixtures updated to real SavePoint restore. A queued historical prompt exposed a stale execution admission snapshot; fixed by refreshing admission only, keeping historical context/route frozen. Explicit narrator disclosure remains enforced; without a narration policy, committed Timeline retains its existing public source contract while World fields still require player display grants.
- L3/CI `not_run`. Scene detection/scoring remain documented heuristics; no claim of perfect artistic quality or live model availability.
- Next: S4 Mask commands/checkpoints/CAS, common editing jobs, Gallery/reference promotion and two-scan GC/full media save.

## S4 — Media Studio / Gallery (completed)

- Start HEAD: `33d602d85a2e401ad29e948f4ce5fe0d7235f298`; End/Tested HEAD: `5985d3ddfbf1decf1991c3db0dfd12c13109f6fe`.
- S4.1: original-pixel gray8 mask, brush/erase/rectangle, pan/pinch/keyboard, persisted undo/redo command/checkpoint CAS, idle/periodic sync, immutable submitted masks and explicit conflict fork. Concurrent checkpoint/undo preserves local work.
- S4.2: common regenerate/img2img/inpaint/upscale jobs; NAI V3/V4/V4.5/V5 operation wire formats, V4.5 precise reference scope/combination refusal; reachable typed Comfy graph upload/upscale; OpenAI inverse-alpha JSON edits. Raw model result and explicit server composite are separate immutable versions; no automatic display replacement.
- S4.3: current-branch paginated/lazy Gallery, explicit selection CAS, history/comparison/lineage, separate hide/soft-delete/collection metadata, explicit reference promotion/grants. Reference authority lives in Native presentation snapshots, not a parallel provider catalog.
- First renderer run failed because its helper imported the expanded server persistence graph in jsdom without structuredClone; changed helper to direct SHA. Protocol fixture transport omission fixed.
- CI/L3: `not_run`, no paid API. Vibe encoding is unknown and refused, not silently paid. No display-only compact export masquerades as a full editable SavePoint.

## S5 — P1 families / extension ports (completed)

- Start HEAD: `5985d3ddfbf1decf1991c3db0dfd12c13109f6fe`; End HEAD: `5c8131e67c380d07a699bb6fc4c75414d417af3d`.
- S5.1 Gemini: documented native GenerateContent image models/inputs/result parser, semantic edit, model-specific limits; required Canonical Mask/strict Mask/upscale safely unsupported. No ordinary text Route masquerades as image generation.
- S5.2 SD WebUI and Forge: independent Connection Adapter names, actual read-only models/samplers/upscalers/scripts/OpenAPI discovery; installed LoRA/ControlNet catalogs/combination gates, opaque white-edit masks and Img2Img/Upscale. Optional Basic Secret auth. No global interrupt.
- S5.3 RunningHub: frozen full typed Workflow with explicit bindings, upload/create/outputs, durable remote task ID/reconcile, owner-specific cancel receipt, restricted no-credential CDN fetch. HTTP status now recovers known jobs; transient query failures do not resubmit.
- P0 7/7. One lint pass found formatting only, automatically fixed. Protocol catalog does not prove artistic/model compatibility or L3.
- L3/remote CI `not_run`, no provider charge. RunningHub official main documentation pages intermittently timed out; official pre.runninghub.ai pages and current outputs/upload/error references provided exact protocol evidence. No third-party code copied.

## User-requested pause / S6 review checkpoint

- 用户明确要求在合适节点暂停，以新对话继续；停在 S5 HEAD `5c8131e67c380d07a699bb6fc4c75414d417af3d`。S6 只读审查，未新增产品改动。
- source/main/docs 本地工作树在交接写入前均 clean；main 保持 `7e1045ab836c22cafbc92c5de056ad701f56e723`，没有合并或删除 feat。
- S6 审查发现需继续处理：annotation/task Target/Rendering 覆盖实际 API/UI、Workflow 导入/映射体验、whole-history/Gallery 重复读取性能、standard-reference 分支授权与保存、Mask 保存竞争/上传认证、GC 临时 root 生命周期、generated ironman 编辑/导入闭环及实际传输/审批证据。具体恢复线索归 live HANDOFF；
- Windows/Termux 真机及 Provider L3 全部 `not_run`。
- 本次暂停仅按用户指令；新对话明确恢复后沿原完整授权连续推进 S6，不重开分支、不重新实施 S0，不追加阶段审批。
- Remote sync: S5 source 首次 push 遇 TLS EOF，重试成功；origin feat 已到 `5c8131e67c380d07a699bb6fc4c75414d417af3d`。

## Windows machine-transfer preparation

- 用户明确准备换到 Windows 新对话继续；保持暂停，只更新 live HANDOFF，不新增产品修改或合并。
- Linux 依赖 symlink/原生 binaries 不迁移。
- 原机私人数据/Secret 不构成开发 fixture 的恢复依赖；没有上传或读取真实 Secret。Windows 安装/运行/浏览器尚未执行，不预先标通过。

## S6 — Windows continuation and final delivery (completed)

- Resume baseline: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`, existing `feat/native-visual-generation-deepening@5c8131e67c380d07a699bb6fc4c75414d417af3d`, `docs@e0eaf19e087c57c95c612c5ee84e4aa8b8d94492`. 新 Windows 工作树复用既有 feat；未重开 S0～S5，也未触碰 docs 下另一任务未跟踪的 `plans/feat/agent-experience-evolution/`。
- S6 product commit: `9241325a7290e613e0fdaaa1870409105c161c89`. 该提交已推送 feat，并以 fast-forward 集成及推送 `main`；
- 配置与审批：Annotation 的 Target/Rendering 覆盖纳入受 CAS 约束的存档合同和 UI；单次生图可覆盖两者，预览显示来源；Rendering 默认 Target 按来源优先级解析，缺失 Rendering 拒绝。已形成的 Job/Evidence 保持冻结。Rendering 可编辑并使用 CAS，RunningHub 仍要求显式 typed nodeTypes。
- 媒体和性能：终态 Job 增加 summary 读取，客户端只在结束时另取 presentation；卡片证据与预览按需生成。标准 identity reference 从源分支解析并按显式 branch grant/revoke 使用，禁止其它用途、身份或未披露源越界。Mask fork 保存中新增笔画保留为 dirty/conflict；30 天 draft、7 天暂存 Mask/终态 Job 宽限后不再永久阻止 GC，正式 Session/SavePoint/DAG 根保留。
- Windows 环境：Node `v24.18.0`、npm `11.16.0`；产品和 tests 分别 `npm ci`，`better-sqlite3` 在本机单独 rebuild。Windows 的 Node 不提供 directory fsync，durable-file 改为文件同步与 atomic rename，目录元数据持久性由 Windows 管理；产品文档明确此限制。
- 最终 `visual-media` 27/27，新增 ironman 生成→Mask 编辑→导出/导入→再编辑及 post-fork reference、Annotation 覆盖定向复测通过。FS/SQLite fixture 涵盖弃用草稿 GC、24 图 Gallery 分页、SavePoint 闭包及恶意/缺失依赖拒绝。`npm start` webpack 编译并监听 `127.0.0.1:8000`，真实本机 headless Chrome 在 1280/390 宽度访问 Atria 返回 200、无文档横向溢出；独立 ComfyUI Workflow UI 浏览器 fixture 在两宽度导入/绑定/保存通过并人工查看截图。浏览器手机宽度/触控仿真不等于真机。
- 没有读取真实 Secret 或发送付费图片请求。
- 因此不宣称真实模型组合、艺术效果、实际费用或跨设备真机通过。不可变 Evidence 保存非秘密请求/资产描述与摘要；瞬时 hydration 的完整 wire bytes 未持久化，actual cost 不伪造。产品交付与这些外部证据分别记录，不将 fixture 当 L3。
- Governance closure: docs Plan/Record 已刷新；本任务 live HANDOFF 已删除。临时 feat/worktree 在 main 同步确认后清理，docs 独立推送；其它任务工作区和未跟踪内容保持原状。
