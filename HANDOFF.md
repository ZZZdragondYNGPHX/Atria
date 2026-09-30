# Live HANDOFF — Package P3 in progress / G2 correction

- Task ID: package/original-occult-western-fantasy-game
- Primary Workspace / branch: package (long-lived, independent)
- Root: original-occult-western-fantasy-game/
- Stage: **P3 authorized/in progress, NOT complete. User instructed autonomous resolution of problems; do not stop merely at G2. P4/P8 not started.**
- Package diagnostic / probe-tested / pushed HEAD: bb13a1e47c6407a195c85f9974d7a8f81f113f8a
- Last gameplay-tested Package HEAD: 8e7dec443d39beec5a182c16cfe7bcad97ebd6c0 (P2)
- Installed runtime remains 0.2.0-p2; only an unpackaged diagnostic tool has been added.
- Core inspected / probe-tested main: cd6bff19d54f651a4bffd8981f62ec77c0f84acb
- Plan entrypoint: plans/package/original-occult-western-fantasy-game/index.md
- Current modules: simulation.md, institutions.md, implementation-staging.md, technical-design.md (scheduling contract)
- Sole Package Record: records/package/original-occult-western-fantasy-game.md

## Do not repeat

P0/P1/P2 are complete. G1 is resolved and must not be reopened. No full game/P4/P8 work. Preserve independent package and historical releases; no main merge into package, no reference reads, no Package workaround.

## Current finding / evidence

G2 is a missing orchestration bridge, not absence of all existing scheduling. Lifecycle Task inputs are literals; authority-producing execution requires exact outbox input. Current Workflow/automation contracts cannot build a fresh private institutional payload or invoke an independently anchored background Authority Transaction. The Host loop uses sequential changing anchors and a fixed four-call cap, not same-tick anchored ordering/relevance budgeting. Large-jump Lifecycle pumping uses declaration order, not next-event order. Full details and source references are in the same Record.

`tools/simulation-contract-check.mjs` passes seven diagnostic checks against actual main. It uses real contract validators and in-memory Lifecycle preparation; the real Host dispatch loop has explicit storage/provider doubles. This is NOT an installed P3 Session/provider/save test. Tool syntax and whitespace checks passed. Diagnostic HEAD pushed; runtime declarations, main and releases remain unchanged at this checkpoint.

Budget recount: interview and intervene reserve 24/24 App Commands, including the entire publication hook; advance_time reserves 21/24. Read/effect/expanded-work/UTF-8 limits must not be relaxed.

## Next work

Continue resolving G2 autonomously as requested. Reuse existing authority wherever possible. If Core correction is necessary, make a minimal formal product change on a short-lived branch in the independent product worktree, validate/integrate it, then resume Package implementation against real latest main. Do not fabricate player turns, duplicate authority in tools/frontend, substitute broad information context or claim a hard-coded schedule is full simulation.

P3 requires authoritative deterministic/conditional/deliberative progress, obligations/recovery/deadlines, relevance/budgets, same-tick ordering/stale handling, event-driven multi-day fast-forward and actual save-container restoration evidence. Update this HANDOFF during execution. Only after P3 exit gates pass: push tested Package HEAD, close this stage in the same Record and provide P4 instructions.

## Copyable continuation prompt

继续 Atria 的 package/original-occult-western-fantasy-game P3，仅 P3，不进入 P4/P8。先 fetch 并核对真实 refs/worktrees/dirty，读 Governance、适用 AGENTS、唯一 HANDOFF、Plan index、P3 模块和同一 Package Record。P2 已完成；Package bb13a1e47c6407a195c85f9974d7a8f81f113f8a 仅新增 G2 诊断工具，不是 P3 实现。G2 证据已写入 Record，用户要求自行解决并持续推进；不要因契约问题直接结束，也不要做 Package workaround。必要时在独立产品工作树修复正式 Core 契约并验证集成，再实施 P3。保留 required authority-transaction@1、Ready、静态授权、严格 schema/UTF-8/工作量上限，不重开 G1、不伪造背景玩家事务、不建立平行 authority。真实验证保存恢复与同锚重放区别。P3 完成后提交推送并更新同一 Record/HANDOFF，给 P4 提示词后停止。
