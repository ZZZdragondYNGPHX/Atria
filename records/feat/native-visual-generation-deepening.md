# Native visual generation deepening — Implementation Record

- Task ID: `atria-native-visual-generation-deepening`
- Plan: [index](../../plans/feat/native-visual-generation-deepening/index.md)
- Product branch: `feat/native-visual-generation-deepening`
- Start main: `7e1045ab836c22cafbc92c5de056ad701f56e723`
- Frozen design read: `docs@54c8949dccad402ca4471efad3c473bee7d60050`
- Status: **paused at user request**，S5 已提交验证，S6 审查刚开始。恢复入口：[HANDOFF](../../HANDOFF.md)。
- Authorization: 2026-10-14 用户正式授权连续完成 S0～S6、阶段提交推送、最终按 Governance 集成。
- Initial local audit: main/docs/package/plugin/已有 skill-routing feat 均 clean；fetch origin 后 main 未变，docs 从 e9107ba4b fast-forward 到 54c8949dc。新任务独立 worktree；其它任务保留。
- Verification policy: 每阶段只做最小相关本地验证。远端为提交存储；CI `not_run`，不启用 Actions。
- Provider L3: `not_run`，尚无本任务真实 Target/Secret/明确付费授权；开发不主动收费。设备证据按实际取得记录。

## S0 — contracts / hard cutover (completed)

- Start HEAD: `7e1045ab836c22cafbc92c5de056ad701f56e723`
- S0.1: 中立 SourceRef、IR、三态 Capability、Required/Preferred/Optional 协商、Canonical JSON hash、非秘密编译证据；增加 Native ID 家族。Source 通过 SessionCore 校验已提交祖先可达与原文 hash/选段。
- S0.2: Image Target/Rendering 注册既有版本化 Native Resource；精确合同与读写/CAS/权限职责归产品 docs/native-visual-generation.md。
- S0.3: 删除中立插画验证器的 NovelAI renderer 依赖；图片证据 schema 2 hard cutover，同一现有插画服务写新证据，不建 v1/v2 执行双路。
- Local checks: 首轮 23/25 通过；2 项失败来自既有 illustration-image fixture 调用已不存在的 SessionCore.forkBranch。改为正式 createSavePoint/restoreSavePoint 路线后复测中。
- End/Tested HEAD: `5b7b21edd`（完整 SHA 见 Git）。
- Final local checks: visual-contract + illustration-image 共 25/25（含 FS/SQLite、真实本地 mock HTTP、save/import/secret）；受影响产品文件 ESLint、git diff --check 通过。
- Next: S1 三层配置/持久 Job/预算/媒体闭包。

## S1 — neutral kernel (completed)

- Start HEAD: `5b7b21edd`; End/Tested HEAD: `8cdc38bb6`.
- S1.1: Adapter Registry / Target fingerprint / independent four-level selection / versioned Target and Rendering; Native Connection/Secret unchanged.
- S1.2: Persistent Native Job/Attempt, atomic admission with image/global-money/auto-money and independent Planner ledger, lease/fence, frozen receipt, uncertain-submission recovery, conservative cancellation. Scheduler only executes.
- S1.3: Immutable media operation/multi-parent DAG and canonical gray8 Mask dependency, AssetStore locks/roots expanded to Native jobs/drafts/references/leases.
- S1.4: Save closure includes Mask/reference inputs; import checks hashes, DAG, Mask/base geometry. Idempotent publisher port and stored result recovery prepared for S2.1 integration.
- Local checks: 9/9 kernel tests FS/SQLite; 22/22 existing image tests in prior combined run. Initial kernel 2 failures were single-owner test harness refusing unknown owner; negative test corrected to assert refusal. Changed product files ESLint + diff check passed.
- CI/L3: `not_run`. No remote Actions, API credentials or paid requests.
- Limitation: Durable worker integration into the production image entrypoint is next in S2.1; full Mask UI/GC grace policy remains S4 by plan. No claim of live Target availability.
- Next: NovelAI vertical slice on one new kernel, then ComfyUI/OpenAI Images.

## S2 — P0 backends (completed)

### S2.1 NovelAI vertical slice (completed)

- Start HEAD: `8cdc38bb6`; End/Tested HEAD: `4d9aaf979`.
- Production entrypoint now uses prepare/approval -> persistent Native Job -> Adapter -> AssetStore -> immutable ImageVersion/MediaOperation. Settings schema 2 selects Target/Rendering; no old connection-only execution route.
- Manual raw prompt preserved. Image selection is separate from asynchronous history publication. Targets/renderings/budgets are configurable through Native authenticated UI/API and CAS.
- V3/V4/V4.5 and explicit V5 Full protocol declarations; V5 native parameter version/tag hints/default steps handled separately. V5 Live/Medium effort not inferred.
- Checks: 10/10 new vertical-slice FS/SQLite; 6/6 NovelAI protocol; 19/19 illustration core; 4/4 settings; 9/9 kernel (other suites passed before correction). Product ESLint passed.
- Failure/fix: first combined slice run had HTTP fixture supplying wrong router factory and a SQLite nested transaction deadlock in publication. Fixture fixed; publication now retains the ledger lock outside the storage transaction and finalizes with CAS. Related 10 tests all passed on retest.
- Provider constraint: fetched official OpenAPI https://image.novelai.net/docs/doc.json requires human initiation. NovelAI automatic sends fail closed; manual/semi-auto remain available. Other permitted targets still use the automatic core. This is legal Target capability, not removal of D-007/D-008.
- L3/CI `not_run`; no external paid generation. Next S2.2 ComfyUI, then S2.3 OpenAI Images.

### S2.2 / S2.3 ComfyUI and OpenAI Images (completed)

- End/Tested HEAD: `b8cbf6a2c`. S2.1 was integrated first at `4d9aaf979`.
- ComfyUI: typed API graph, required slots/link/output/cycle checking, actual read-only object_info preflight, remote prompt ID, bounded history/view normalization and reconcile port. Shared global interrupt never sent.
- OpenAI: dedicated Images generation/edit compiler, native model/size/quality/input fidelity constraints; JSON edit input descriptors and canonical inverse-alpha conversion. Mask is a provider guidance constraint, not falsely a pixel preservation guarantee. Media input authorization/UI is completed in S4.
- Native Runtime now offers ComfyUI/OpenAI image Connections. Editable capability JSON cannot override adapter capability/price authority.
- Verification: ComfyUI/OpenAI independent L1/L2 6/6; NAI slice unaffected 10/10; affected product ESLint/diff check. L3/CI `not_run`.
- Next: S3 exact Actor/State/disclosure/reference projection, reliable post-commit Director, scene/shot scores, modes/budgets.

## S3 — continuity / Director (completed)

- Start HEAD: `b8cbf6a2c`; initial implementation `1dd6e05da`; source/admission correction `33d602d85a2e401ad29e948f4ce5fe0d7235f298`.
- S3.1: exact installed Actor or explicitly Session-scoped provisional identity; references independently scoped by identity/purpose/branch and explicit standard-image sharing.
- S3.2: historical Source/State projections, anchored proposals and confidence/review separation; only independent display fields are read. Formal/narrative conflicts block automatic adoption; future spans and siblings excluded. Raw prompt preserved.
- S3.3: Native Commit discovery markers cover commitSnapshot paths, restart-deduplicated scans, cross-turn Scene/Shot, present/dream/flashback, five default weights, thresholds and coverage penalties. Optional explicitly invoked Director LLM analysis is source bounded.
- S3.4: manual/semi/automatic mode UI (default manual), density, exact target preauthorization, Image/Planner independent ledgers; real LLM sends/retries now reserve Planner tokens/calls. Unknown automated cloud cost and NovelAI non-human sends are blocked.
- Checks: Director 7/7; prompt 17/17 FS/SQLite, P0 protocol 6/6 passed in related run. Product ESLint/diff check.
- Failure/fix: two old forkBranch fixtures updated to real SavePoint restore. A queued historical prompt exposed a stale execution admission snapshot; fixed by refreshing admission only, keeping historical context/route frozen. Explicit narrator disclosure remains enforced; without a narration policy, committed Timeline retains its existing public source contract while World fields still require player display grants.
- L3/CI `not_run`. Scene detection/scoring remain documented heuristics; no claim of perfect artistic quality or live model availability.
- Next: S4 Mask commands/checkpoints/CAS, common editing jobs, Gallery/reference promotion and two-scan GC/full media save.

## S4 — Media Studio / Gallery (completed)

- Start HEAD: `33d602d85a2e401ad29e948f4ce5fe0d7235f298`; End/Tested HEAD: `5985d3ddfbf1decf1991c3db0dfd12c13109f6fe`.
- S4.1: original-pixel gray8 mask, brush/erase/rectangle, pan/pinch/keyboard, persisted undo/redo command/checkpoint CAS, idle/periodic sync, immutable submitted masks and explicit conflict fork. Concurrent checkpoint/undo preserves local work.
- S4.2: common regenerate/img2img/inpaint/upscale jobs; NAI V3/V4/V4.5/V5 operation wire formats, V4.5 precise reference scope/combination refusal; reachable typed Comfy graph upload/upscale; OpenAI inverse-alpha JSON edits. Raw model result and explicit server composite are separate immutable versions; no automatic display replacement.
- S4.3: current-branch paginated/lazy Gallery, explicit selection CAS, history/comparison/lineage, separate hide/soft-delete/collection metadata, explicit reference promotion/grants. Reference authority lives in Native presentation snapshots, not a parallel provider catalog.
- S4.4: normalized immutable ImageVersion documents/manifest refs eliminate repeated evidence copies; full editable SavePoint closure/import validates parent DAG/mask/base/refs/hashes; double-scan grace/lease GC. Ironman retains only current narrative with checked immutable visual packet aliases.
- Local verification: media 17/17 (FS/SQLite and NAI four model editing L1/L2); P0 adapter 7/7 (independent Comfy/OpenAI); illustration core 19/19; renderer 3/3; unchanged durable slice 10/10 earlier S4 run; affected ESLint/diff check passed. First renderer run failed because its helper imported the expanded server persistence graph in jsdom without structuredClone; changed helper to direct SHA. Protocol fixture transport omission fixed. Existing conditional test lint assertions corrected.
- CI/L3: `not_run`, no paid API. Strict model Mask preservation remains unsupported where unverified; explicit composite has seam/geometry limitations. Vibe encoding is unknown and refused, not silently paid. Whole-history materialization/browser layout/actual platform evidence are S6 acceptance work. No display-only compact export masquerades as a full editable SavePoint.
- Next: S5 Gemini, WebUI/Forge, RunningHub, plus Adapter extensibility; then S6 cross-platform/security/performance/final acceptance.

## S5 — P1 families / extension ports (completed)

- Start HEAD: `5985d3ddfbf1decf1991c3db0dfd12c13109f6fe`; End HEAD: `5c8131e67c380d07a699bb6fc4c75414d417af3d`.
- S5.1 Gemini: documented native GenerateContent image models/inputs/result parser, semantic edit, model-specific limits; required Canonical Mask/strict Mask/upscale safely unsupported. No ordinary text Route masquerades as image generation.
- S5.2 SD WebUI and Forge: independent Connection Adapter names, actual read-only models/samplers/upscalers/scripts/OpenAPI discovery; installed LoRA/ControlNet catalogs/combination gates, opaque white-edit masks and Img2Img/Upscale. Optional Basic Secret auth. No global interrupt.
- S5.3 RunningHub: frozen full typed Workflow with explicit bindings, upload/create/outputs, durable remote task ID/reconcile, owner-specific cancel receipt, restricted no-credential CDN fetch. HTTP status now recovers known jobs; transient query failures do not resubmit. P2 extensibility uses the same validated unique registry ports.
- Checks: independent P1 22/22 (FS/SQLite each family, editing, LoRA/ControlNet, upload/polarity, failure/sanitization, no retry, cancel/recovery/unsafe URL); kernel 9/9; P0 7/7. Changed product ESLint/diff check passed. One lint pass found formatting only, automatically fixed. Protocol catalog does not prove artistic/model compatibility or L3.
- Total input byte guard added at preview: 24 MiB, Gemini 14 MiB to bound base64 request size. Head-specific P1 minimal verification completed; result appended below.
- L3/remote CI `not_run`, no provider charge. RunningHub official main documentation pages intermittently timed out; official pre.runninghub.ai pages and current outputs/upload/error references provided exact protocol evidence. No third-party code copied.
- Next: S6 desktop/mobile responsive control plane, minimum browser and performance/security acceptance, full closure invariant review, final delivery and Governance merge.
- Head-specific minimal retest at `5c8131e67`: P1 22/22 passed after adding the aggregate-input guard.

## User-requested pause / S6 review checkpoint

- 用户明确要求在合适节点暂停，以新对话继续；停在 S5 HEAD `5c8131e67c380d07a699bb6fc4c75414d417af3d`。S6 只读审查，未新增产品改动。
- source/main/docs 本地工作树在交接写入前均 clean；main 保持 `7e1045ab836c22cafbc92c5de056ad701f56e723`，没有合并或删除 feat。
- S6 审查发现需继续处理：annotation/task Target/Rendering 覆盖实际 API/UI、Workflow 导入/映射体验、whole-history/Gallery 重复读取性能、standard-reference 分支授权与保存、Mask 保存竞争/上传认证、GC 临时 root 生命周期、generated ironman 编辑/导入闭环及实际传输/审批证据。具体恢复线索归 live HANDOFF；不把阶段标签当全范围最终验收。
- 环境核对：实际 CachyOS/KDE Wayland；Node FS/SQLite 验证已有证据，浏览器未启动。Windows/Termux 真机及 Provider L3 全部 `not_run`。
- 本次暂停仅按用户指令；新对话明确恢复后沿原完整授权连续推进 S6，不重开分支、不重新实施 S0，不追加阶段审批。
- Remote sync: S5 source 首次 push 遇 TLS EOF，重试成功；origin feat 已到 `5c8131e67c380d07a699bb6fc4c75414d417af3d`。
