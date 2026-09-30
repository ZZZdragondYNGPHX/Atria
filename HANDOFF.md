# Live HANDOFF — Package P2 / G1 resolved

- Task ID: package/original-occult-western-fantasy-game
- Primary Workspace / branch: package (long-lived, independent)
- Root: original-occult-western-fantasy-game/
- Stage: **P2 authorized and in progress; G1 resolved. P2 NOT complete; no P3/P8.**
- Package checkpoint / policy-probe-tested / pushed HEAD: 6be0ed75d68a9f8e0df5b1f3c0b291f00d73ed47
- Last complete P1 runtime tested HEAD: ecbad17290e2a8626cd99c515bc3d98f71b7da4d
- Core main / policy-probe-tested HEAD: cd6bff19d54f651a4bffd8981f62ec77c0f84acb (unchanged)
- Plan entrypoint: plans/package/original-occult-western-fantasy-game/index.md
- P2 modules: technical-design.md, implementation-staging.md, gameplay.md, simulation.md
- Sole Package Record: records/package/original-occult-western-fantasy-game.md
- Core Record: records/feat/authority-transaction.md (read only if needed)

## Decision now approved

User allowed appropriate Plan adjustment. Gameplay 6.28.2 / technical-design 6.48.5 now distinguish internal deterministic draw allocation from gameplay Fortune use. The existing Core static bounded_fortune policy is sufficient: Automatic / Impossible cases take priority and never depend on the draw. Their outcome/effects/time/projections/safe result must be invariant across rolls, and an unused roll must not enter player/Narrator output. Only Uncertain uses Fortune; wholly deterministic verbs remain deterministic. No Core extension or further G1 approval needed.

Previous strict no-draw probe findings remain historically correct, but **do not block P2** under this clarified interpretation. Do not recreate the same blocker. No custom RNG, model-selected eligibility, shadow domain, dynamic targets, safety relaxation or multi-commit workaround.

## Actual assets / tests

P1 runtime/data/manifest and releases remain unchanged. Only the contract-policy probe has been updated since the prior checkpoint. Nine gameplay verbs, full Resolution/effects/index and typed frontend binding are still unimplemented.

Executed: tools/probe-conditional-fortune.mjs against independent main; all 3 roll values checked through Core formula evaluation, plus 16 real non-Uncertain candidate preparations across eight ordinals; result/effects/projections invariant, source unchanged, unused roll excluded from semantic result. Prior same-anchor/rejection checks remain. Tool syntax and staged diff checks passed; probe checkpoint pushed.

This is **APPROVED_FORTUNE_POLICY_SUPPORTED_NOT_P2_PASS**. It is not actual nine-verb acceptance, installation, provider/typed-bridge integration, save-container, UI/device or full-suite/CI evidence. Do not repeat historical P1/P0 checks without relevant changes; their evidence remains in Records.

## Continue P2 (already authorized)

Fetch all remotes and check real refs/worktrees/dirty state first. Read Governance and applicable AGENTS → this HANDOFF → Plan index → four P2 modules → Package Record. Use independent main for product integration; no main merge into package, no reference reads, no releases overwrite.

Implement nine verbs, ephemeral Resolution Frame, Automatic/Impossible/Uncertain, Risk Tier and bounded Fortune, multi-authority effects, safe projections/index/receipt and free-text/typed equivalence in a small synthetic world. Replace P1 placeholder schemas as used. Keep required authority-transaction@1, Ready, static targets, field/reference/computed-schema closure and UTF-8/expanded-work ceilings. Distinguish in-process selection pin, same-anchor RNG and actual save restoration.

Add actual gameplay tests for the clarified Fortune invariance, not only this diagnostic fixture. On actual P2 completion: validate, commit/push tested Package HEAD, update this sole HANDOFF and same Record, supply P3 prompt, stop. Do not enter P3/P8 early.

## Copyable continuation prompt

继续 ZZZdragondYNGPHX/Atria 的 Package P2 — Interaction Runtime。Task ID：package/original-occult-western-fantasy-game；沿用独立长期 package 分支。先 fetch 并核对真实 refs/worktrees/dirty，读 docs:README.md、适用 AGENTS.md、唯一 HANDOFF、Plan index、P2 模块和同一 Package Record。用户已允许适当调整方案，G1 已解除：允许 Core 内部预抽确定性值，但 Automatic/Impossible 的 outcome/effects/time/projections/公开结果不得依赖或暴露该值；只有 Uncertain 使用 Fortune。不要再为此请求 Core 条件抽取扩展。当前 Package policy-probe checkpoint 6be0ed75d68a9f8e0df5b1f3c0b291f00d73ed47；Core main cd6bff19d54f651a4bffd8981f62ec77c0f84acb，均仅作为历史 pin。P1 runtime 未变，九动词与 typed binding 尚未实施。继续已授权 P2 完整实现和实际集成验证，不进入 P3/P8，不做 Core workaround、不 merge main、不读 reference、不覆盖 releases。仅在 P2 Exit Gate 真正通过后提供 P3 接手提示词并停止。
