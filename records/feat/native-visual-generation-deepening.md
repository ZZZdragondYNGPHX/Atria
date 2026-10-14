# Native visual generation deepening — Implementation Record

- Task ID: `atria-native-visual-generation-deepening`
- Plan: [index](../../../plans/feat/native-visual-generation-deepening/index.md)
- Product branch: `feat/native-visual-generation-deepening`
- Start main: `7e1045ab836c22cafbc92c5de056ad701f56e723`
- Frozen design read: `docs@54c8949dccad402ca4471efad3c473bee7d60050`
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
