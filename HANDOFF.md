# Live HANDOFF — Package P2 contract gate G1

- Task ID: package/original-occult-western-fantasy-game
- Primary Workspace / branch: package (long-lived, independent)
- Root: original-occult-western-fantasy-game/
- Stage: **P2 authorized/started; blocked at G1. P2 NOT complete; no P3/P8.**
- Package checkpoint / probe-tested / pushed HEAD: c4293fe7238b9f433b324c1778e16fc47ebfcf73
- Last complete P1 runtime tested HEAD: ecbad17290e2a8626cd99c515bc3d98f71b7da4d
- Core inspected / probe-tested main HEAD: cd6bff19d54f651a4bffd8981f62ec77c0f84acb
- Plan entrypoint: plans/package/original-occult-western-fantasy-game/index.md
- P2 modules: technical-design.md, implementation-staging.md, gameplay.md, simulation.md
- Sole Package Record: records/package/original-occult-western-fantasy-game.md
- Core evidence (read-only for this task): records/feat/authority-transaction.md

## Actual current state

P1 runtime is unchanged. Only tools/probe-conditional-fortune.mjs was added to package; it is excluded from the archive. No PackageVersion bump, releases overwrite, Core edit, main merge or reference read. Nine verbs and typed frontend binding remain unimplemented. Existing main/package/docs worktrees are reused; product validation stays in independent main.

## G1 evidence and decision needed

Frozen gameplay 6.28.2 requires eligibility before randomness, only Uncertain uses Fortune. Current Core bounded_fortune draws before cases even when private state selects Automatic/Impossible. Static resolution kind cannot depend on private reads; resolution.when is rejected; duplicate verbs are rejected. Validators can reject, not return accepted automatic outcomes. Probe confirms this on actual Core preparation/compiler and confirms unchanged same-anchor determinism.

Important distinction: this proves a missing strict conditional-draw seam, not that an ignored draw affects automatic outcomes or that retry is broken. Accepting ignored draws would need explicit design adjudication. Otherwise separately authorize a narrow Core contract extension in the existing Transaction authority; no Package workaround and no wholesale P0 redo. This Package task does not authorize Core changes.

## Checks actually run

- node tools/probe-conditional-fortune.mjs --core <main-checkout>: confirmed limitation; three authority states, same-anchor repeats, zero source mutation, three rejected declaration alternatives.
- Tool syntax and staged diff whitespace checks passed; diagnostic Package checkpoint pushed.
- No new install/build/provider/UI/device/save-container/full-suite/CI result. P1 and P0 historical evidence remains in Records.
- Probe PASS means CONFIRMED_CONTRACT_LIMITATION_NOT_P2_PASS, not acceptance of P2.

## Resume discipline / next target

Fetch all remotes, verify actual refs/worktrees/dirty state; no rollback to historical pins. Read Governance and applicable AGENTS → this sole HANDOFF → Plan index → P2 modules → Package Record. Resolve G1 with explicit authorization or approved contract semantics before resuming P2. Preserve static targets, closure/schema/UTF-8/work bounds, Ready Barrier, safe disclosures and required authority-transaction@1. No Outcome/Resolution shadow domain, Package RNG, model-selected eligibility or multi-commit workaround. Do not confuse in-process selection pin, same-anchor RNG and actual save-container restoration.

P2 scope remains nine verbs, Resolution/risk/Fortune, bounded multi-authority effects, safe projections/index/receipt and free-text/typed equivalence in a synthetic world. Only after all P2 gates pass: commit/push, update the same Record and this HANDOFF, supply P3 prompt and stop. No P3 prompt is issued at this blocked checkpoint.

## Copyable continuation prompt

接手 ZZZdragondYNGPHX/Atria 的 Package P2 契约检查点。Task ID：package/original-occult-western-fantasy-game；沿用长期 package 分支，不 merge main，不删除，不读取 reference/*，不做 Core workaround。先 fetch 全部远端并核对真实 refs/worktrees/dirty，再读 docs:README.md、适用 AGENTS.md、唯一 HANDOFF、Plan index、P2 四个模块和同一 Package Record。P1 已完成；P2 尚未完成。当前 Package checkpoint c4293fe7238b9f433b324c1778e16fc47ebfcf73 只增加条件 Fortune 诊断工具，Core probe HEAD cd6bff19d54f651a4bffd8981f62ec77c0f84acb。G1：Core bounded_fortune 在 eligibility cases 前无条件抽取；批准设计只允许 Uncertain 抽取。先确认此后是否已有明确设计裁定或已批准且集成的 Core 条件抽取能力；没有则报告所需决策，不擅自改变设计或修改 Core。解决 G1 后继续原 P2 九动词、Resolution、effects、安全投影与 typed/free-text 等价验证，不进入 P3/P8。只有实际通过 P2 Exit Gate 才提供 P3 提示词。完整事实以 Record/HANDOFF 和最新 Git 为准。
