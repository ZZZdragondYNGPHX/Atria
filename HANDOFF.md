# HANDOFF

## Task and actual pushed Git state

- Task: refactor/original-occult-western-fantasy-long-lived-world
- Primary Workspace: Package
- Stage: **Phase 7 IN PROGRESS / INCOMPLETE — emergency device handoff**.
- Package branch: refactor/original-occult-western-fantasy-long-lived-world
- Package HEAD: 6045e9982a6920f04ac2f82a4d7e075d71ca2357
- Core support branch: feat/player-chronicle-bridge
- Core support HEAD: 1891176392f3c7d7529ab8b2188d796d509b6ecd
- Core main: 56df98f50409c7b17817c681f6e3976a564fbb99, unchanged.
- Both WIP branches pushed; no integration/release. Old feat/native-regional-history
  remains deleted; do not restore it. Do not merge main into Package.
- Development: 2.0.0-phase7; final target remains 2.0.0.
- Plan: plans/package/original-occult-western-fantasy-game-long-lived-world/index.md
- Record: records/package/original-occult-western-fantasy-game-long-lived-world.md

## Read first

1. Actual local/remote refs and Package/Core AGENTS; this HANDOFF.
2. Plan index, implementation-staging Phase 7, player-facing-experience.md,
   verification.md. Existing UX direction is fixed.
3. Same Record: latest **Phase 7 emergency device handoff** section contains exact
   implementation state, failures, diagnostic caveats and next steps. Phase 6
   focused acceptance amendment remains valid.
4. Existing frontend/DESIGN.md, runtime/FRONTEND.md and changed frontend/compiler/
   controller/check files; Core native-chronicle-host and Host service/catalog.
5. Installed frontend-design, ui-ux-pro-max, emil-design-eng; only needed runtime
   contracts. No reference reads without separate explicit authorization.

## Immediate next action and key blocker

Fix Chronicle detail: repeated historySelect is not a NodeRef and never invokes
its controller event handler. Declarative historyInspect currently only sets ID,
not detail/open. Native forbids repeated NodeRefs; fix using supported interaction
semantics, not a runtime bypass. Latest real browser diagnostic timed out waiting
for hidden history-detail, with no diagnostics. Then verify latest untested
seven-field paged typed forms and complete remaining Phase 7 flows.

Phase 7 is NOT complete. Last emergency edit is not built/tested. Five adapter
unit tests passed, earlier 16 bridge tests passed; only partial actual browser
coverage. See Record for exact evidence scopes and deficiencies. Do not call
--phase7-ui-only a stage acceptance or claim its clock-only stance assertion
proves committed policy. Local screenshots/build artifacts are not in Git.
Required DESIGN/FRONTEND binding/evidence documentation remains unfinished.

## Preserved validation and boundaries

Main Authority CI 37095803039 and additional Model Prompt CI 37095803004 succeeded.
No need to repeat them absent relevant changes. Phase 6 100-content-turn/50-year
focused local run remains passed (~7m7s); unchanged Native had 65 suites/1793 tests
and hosted four-adapter evidence. Local MySQL/PostgreSQL services were absent, not
product regressions; no local four-adapter success claim.

## User-approved validation amendment

The 2026-10-03 user request explicitly replaces the Phase 6 mandatory 5k regional
rerun with a short, local-first focused acceptance. Old resume prompts requiring
an unshortened 5k run are superseded. See Plan v1.2 verification.md for the sole
stage-gate authority.

- Default: 100 real content-mutating turns (not prose/compaction/setup counts).
- Retain event-driven 50-year coverage to exercise generations, multiple Eras and
  decades-away return; do not simulate each day or alter production time rates.
- The local focused run passed in 427252 ms, about 7m 7s.
- Force historical reuse, institution lineage and ten portable imports rather
  than simply dropping long-soak assertions and relabeling smoke as acceptance.
- --regional-only --regional-full remains optional 5000-turn stress coverage.
  Other custom short counts are diagnostic smoke, not acceptance.
- This is NOT Gate B, high-turn growth proof or Gate C. The Phase 8 final release
  requirement is unchanged; do not proactively rerun it in Phase 7.
- Default hosted package_check=regional is focused (20-minute cap);
  regional-soak explicitly opts into the long run. Prefer local execution.


Keep original releases/1.0.0.atria unchanged, SHA-256
`e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09` (rechecked).
Retain factual authority, old SavePoints, marked history, permissions, budgets,
true content-turn definition and original invocation reconciliation. No raw
Lifecycle/private truth in UI, no parallel authority/persistence. Complete Phase 7
before issuing Phase 8 prompt; do not perform Phase 8/final merge/release now.

## Resume prompt — remaining Phase 7 only

```text
继续 ZZZdragondYNGPHX/Atria 的 Original Occult Western Fantasy Long-Lived World，
仅完成 Phase 7。上轮因换设备紧急推送，Phase 7 未完成，不是阶段验收通过。
先核对真实 Git/远端 refs，再读 docs:HANDOFF.md Read first 和同一 Record 最新
Phase 7 emergency device handoff。Package 沿用
refactor/original-occult-western-fantasy-long-lived-world，HEAD
6045e9982a6920f04ac2f82a4d7e075d71ca2357；独立 Core 支持分支
feat/player-chronicle-bridge，HEAD 1891176392f3c7d7529ab8b2188d796d509b6ecd；
main 仍为 56df98f50409c7b17817c681f6e3976a564fbb99。
先修 repeated historySelect 的声明式 detail/open 交互（不能把 repeated node
加为 NodeRef），再验证尚未测试的分页完整嵌套表单与实际 binding/read/action。
严格执行已有 player-facing-experience.md，完成剩余 Phase 7 界面及 acceptance
matrix；--phase7-ui-only 仅诊断，不是阶段验收。按 Plan 加载三个本地 UI Skills。
保留既有 authority/persistence、隐私、权限、预算、旧 SavePoints 和标记历史。
100真实内容回合/事件驱动50年仍为区域默认验收，5k仅显式选跑，避免无关重跑。
不要恢复旧分支或长测门槛，不将main合入Package。仅报告实际执行证据。
完成 Phase 7 后更新同一 Record/live HANDOFF、给 Phase 8 提示词并停止；
不得提前 Phase 8、最终合并 Package 或发布2.0.0。
```
