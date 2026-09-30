# Original Occult Western Fantasy Game — Package Record

- Task ID: `package/original-occult-western-fantasy-game`
- Primary Workspace: `package`
- Plan: `plans/package/original-occult-western-fantasy-game/index.md`

## P1 — Package Foundation (2026-09-30)

Status: **P1 complete; stopped at the stage boundary; P2 not started.**

- Fetched all remotes; package start HEAD: `21e02130e` (origin/package). No target assets or Package Record existed.
- Core main: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`; docs start: `da35388c8ccfcc52936864419a91318ec40f2d0d`. P0 is complete; no Core changes planned.
- Existing main/docs/plugin and detached worktrees were clean. Created separate local package tracking worktree; main was not merged into package. No live HANDOFF existed.
- Scope: modular installable skeleton, minimal bootstrap, safe projections, four Task declarations and a diagnostic-only transaction. No P2 gameplay, P8 UI, content production, or Core workaround.

### P1 implementation and decisions

- Added 21 Package-owned source/document files under the game root; no product source was copied or changed, no main merge, no reference reads, no new authority service.
- Installable schemaVersion 2 manifest, exact EntryPoint/World/actor IDs; native text Experience deliberately avoids P8 UI. Seven modular Package Data resources are hash-pinned at build: one minimal bootstrap and six empty definition/Case/Canon families.
- Required Experience capabilities: package-data@1, data-projection@1, perspective@1, model-task@1, session-application@1, temporal@1, runtime-automation@1, turn-contract@1 and authority-transaction@1. Explicit generation permission is enforced at install.
- Two Lifecycle scopes; eleven World domains, three Session authority domains and six derived Session domains. One canonical minute clock. Ready installs a synthetic entity once; two statically owned publications project only approved scene/status fields. Other domains/read models are intentionally empty scaffolds, not final gameplay schemas.
- Seven Sources, five Views, two bounded graphs. No mixed hidden authority is wired into a View. No duplicate Event Journal, Outcome or Resolution domain. Narrator/Reflection Knowledge and all automatic Memory are closed; Claim Advisor has no actual Knowledge binding in P1.
- Four exact-resource Tasks: Narrator (turn-blocking presentation), Reflection and Claim Advisor (latest advisory, no Apply Command), Agenda (FIFO background declared App Command, explicit bounded input, defer intent only). No Agenda scheduler or strategy is implemented.
- SchemaVersion 3 logic has only foundation.check: a deterministic diagnostic, no gameplay verb, World Event or clock effect. It binds to the real resolver/Session preparation path and returns a safe ephemeral receipt. Typed frontend binding remains P2/P8 work; no frontend API workaround was added.
- Seed constants are authored once in seed.bootstrap and compiled into the Ready command by the build tool. Runtime declarations are assembled into the manifest with exact data hashes and packaged model resources.
- Review caught a real Package contract mismatch before closure: declared Narrator must accept Host {stages} and return a string/Turn envelope, not a generic {context}/{text} pair. Corrected to the existing Core protocol and added a real local HTTP Turn smoke. Other initial failures were missing string maxLength, explicit install permission, text Experience metadata and correct projection purpose; no Core validation was weakened.

### Exact implementation / validation pins

- Package implementation / tested / pushed HEAD: `ecbad17290e2a8626cd99c515bc3d98f71b7da4d`.
- Committed tree: `704dbfbcfc6117cc00c90a1f4e6b220752016c11`; runtime source bytes match final successful validation/preview; committed tree was checked against the staged tree.
- Core main / tested HEAD: `cd6bff19d54f651a4bffd8981f62ec77c0f84acb`. Core worktree stayed clean.
- Package start HEAD: `21e02130e5bd0f79d18cc7c631001f13b687763d`.
- Local build: `0.1.0-p1.atria`, 8975 bytes; SHA-256 `752282327615b9b66138708a4260435d9cfe1b95633f450d063814374fb752f9`. Ignored build output is not a release and is not committed. Existing releases are untouched.

### Actually executed checks

1. `node tools/package.mjs validate --core <main-checkout>`: PASS. Actual temporary FS archive installation, reopen/runtime resolution and required authority capability activation.
2. Ready Barrier rejection before initialization; Ready bootstrap/derived publication and repeat-Ready idempotence: PASS.
3. All five Information Views and two graph queries resolve; private sentinel absent from safe Views, observation, receipt and actual model request bodies: PASS.
4. Private diagnostic preparation produces no stored state mutation; over-limit policy, broken static targets, missing exact Task resources and undeclared Agenda decision fail closed: PASS.
5. Local synthetic HTTP resolver plus exact packaged Narrator Task: PASS. Deliberate Narrator failure leaves revision/state unchanged; same-process retry succeeds and repeated invocation returns the same revision without provider re-execution. Diagnostic clock remains zero.
6. `node tools/package.mjs build --core <main-checkout>`: PASS; repeated build at the same path rejects EEXIST and archive hash remains unchanged.
7. `node tools/package.mjs preview --core <main-checkout>`: PASS on final runtime/tool source, including the integration checks above; prints safe JSON projections, not browser screenshots.
8. `node --check` on all three Package .mjs tools: PASS. Staged diff whitespace check: PASS.
9. Main adjacent Jest tests from tests/: `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --verbose=false --runTestsByPath native/package-build-install.test.js native/experience-resources.test.js`: **2 suites / 8 tests passed**. These FS-focused tests are adjacent regression, not a repeat of P0 closure.
10. Package commit/push succeeded; remote refs/heads/package verified equal to the tested commit. No new remote CI run was triggered or claimed.

### Limits / next checkpoint

- Integration uses real FS storage and a local synthetic HTTP provider. No production hosted model, browser/UI, Android/device, other storage engine, complete repository suite or save-container round trip was tested here.
- Same-process retry uses the Core selection pin; no RNG exists in the diagnostic. No claim of cross-process uncommitted selection recovery, persistent selection journal, process-kill recovery or new save restoration evidence. P0 evidence remains in its own Record.
- P1 does not supply final schemas, meaningful evidence/graphs, complete opening/content, P2 verbs/Resolution, NPC simulation or P8 visual design. P2 must version evolving installed Package identities rather than silently overwrite a published PackageVersion.
- Next: **P2 — Interaction Runtime only**, following index → technical-design + implementation-staging + gameplay + simulation, using a small synthetic world. Implement approved nine verbs, bounded Resolution/Fortune, authority effects/projections/receipt and free-text/typed equivalence. No P3/P8 or full campaign work.
- Continue this same Package Record and long-lived package branch. A single live HANDOFF is created for this Package task; P1 work stops here.


## P2 — Interaction Runtime: contract gate (2026-09-30)

Status: **P2 authorized and started; blocked at conditional Fortune contract confirmation. P2 is NOT complete; P3/P8 not started.**

- Fetch-all/prune confirmed main, docs and package at their recorded P1 closure refs. Main/docs/package and current detached checkout were clean. Package start HEAD: ecbad17290e2a8626cd99c515bc3d98f71b7da4d; docs start: dbe33d94a6331e8cdc9a7658d1d65d9aa71dc60f.
- Read Governance, workspace adapters, the existing sole HANDOFF, Plan index and P2 contract/gameplay/simulation sections, Package Record and relevant P0 Core evidence. No reference content read, branch merge, Core edit or releases modification.
- Package checkpoint / probe-tested / pushed HEAD: **c4293fe7238b9f433b324c1778e16fc47ebfcf73**. This is a diagnostic checkpoint, NOT a tested P2 gameplay implementation. P1 installable runtime/data/manifest remain byte-for-byte unchanged; PackageVersion is intentionally unchanged because the added tool is not packaged.
- Core inspected / probe-tested HEAD: **cd6bff19d54f651a4bffd8981f62ec77c0f84acb**. Product checkout remains independent and unchanged.

### G1 — Authority-dependent eligibility before Fortune

Frozen requirements: gameplay.md 6.28.2 says eligibility is determined before randomness and only Uncertain uses bounded Fortune; technical-design.md 6.48.5 requires Automatic / Impossible / Uncertain before bounded Fortune. The same verb/method may become automatic, impossible or uncertain as access/opposition changes. A model must not select an authoritative eligibility result.

Current Core evidence:

- public/scripts/native/experience/logic/transactions.js:137–153 accepts only static deterministic or bounded_fortune resolution, with kind/cases/fallback/sides; no conditional-draw predicate or authority-selected kind.
- src/native/authority-transaction.js:227–235 reads authority and applies validators, then bounded_fortune unconditionally draws before evaluating cases. Automatic/Impossible cases therefore still have a roll.
- transactions.js:254 rejects duplicate verbs. Splitting the same verb into deterministic/Fortune variants is not a supported same-verb dispatch. A fixed typed binding targets one transaction, not an authority-driven dispatch function.
- A validator can reject an ineligible action before RNG, but cannot return an accepted Automatic result or an Impossible result/receipt. World rules run after the frozen resolution; they are not a conditional replacement for Transaction Resolution.

Reproduction: tools/probe-conditional-fortune.mjs imports the independent Core candidate fixture (no copied product implementation), substitutes a minimal private-read eligibility policy and executes actual preparation. Automatic and Impossible each contain a bounded roll. It also confirms rejection of resolution.when, formula-selected kind and duplicate-verb declarations. The hypothetical fields are negative probes only, not proposed/installable Package declarations.

This establishes the missing **strict no-draw-on-non-Uncertain** contract. It does NOT establish that an ignored extra draw changes automatic success or causes rerolls: current deterministic same-anchor behavior passes. Treating that unused draw as acceptable would be a design interpretation/change requiring explicit approval, not something this Package task silently assumes.

### Actually executed at this checkpoint

- node tools/probe-conditional-fortune.mjs --core <main-checkout>: PASS in the sense **CONFIRMED_CONTRACT_LIMITATION_NOT_P2_PASS**. Three private authority states exercised; every result had roll in [1,3]; three same-anchor preparation retries matched; all source snapshots unchanged; three unsupported declaration alternatives rejected.
- node --check tools/probe-conditional-fortune.mjs: PASS.
- Staged git diff --check: PASS; Package checkpoint commit/push succeeded.
- No new install/build/preview, full gameplay, provider/typed bridge, save-container, browser/device, regression suite or CI execution claimed. Historical P1/P0 evidence remains above/in the Core Record and is not repeated.

### Required next checkpoint

Resolve G1 before representing P2 as implemented: separately authorize an existing-authority Core contract extension (conditional Fortune with closed schema, private-read eligibility, stable same-anchor identity and typed/free-text parity), or explicitly adjudicate that ignored non-Uncertain draws satisfy the approved design. Do not implement either policy change implicitly here; do not reopen/repeat P0 wholesale.

No nine-verb runtime, Resolution Frame/effects/index or typed binding has been implemented in this checkpoint. P2 exit gates remain open. Do not supply a P3 implementation handoff as though P2 passed. Resume the same Package task/Record after G1 is resolved, fetch actual refs and rerun/replace the limitation probe with acceptance assertions. Do not use Package RNG, model-selected eligibility, multi-commit dispatch or a shadow Resolution domain as a workaround.


### G1 resolved — user-authorized interpretation adjustment (2026-09-30)

Status: **G1 closed; P2 authorized/in progress, not complete. No Core extension is needed for this issue.**

- User explicitly permitted appropriate Plan adjustment after the G1 report. The previous strict "no internal draw" interpretation was unnecessarily restrictive: an unused deterministic draw is not a gameplay Fortune decision.
- Updated gameplay.md 6.28.2 and technical-design.md 6.48.5: Core may allocate its anchored draw before cases; Automatic / Impossible cases must have priority and must not depend on it. Their outcome, effects, time, derived projections and safe result are invariant; unused roll is not disclosed. Only Uncertain uses the roll. Always-deterministic verbs should declare deterministic resolution.
- No Core modification, Package RNG, model-selected eligibility, parallel authority, multi-transaction dispatch or relaxed safety limit. Historical G1 evidence above remains accurate for the strict interpretation, but is no longer a blocker under the approved semantics.
- Updated probe at Package tested/pushed HEAD **6be0ed75d68a9f8e0df5b1f3c0b291f00d73ed47**; Core probe HEAD remains cd6bff19d54f651a4bffd8981f62ec77c0f84acb. P1 runtime/data/manifest remain unchanged. This is a contract-policy test checkpoint, not nine-verb implementation.
- Actual checks: probe passes with APPROVED_FORTUNE_POLICY_SUPPORTED_NOT_P2_PASS; Core formula evaluation exhausts all 3 roll values for Automatic/Impossible/Uncertain, and 16 real private preparations across two eligibility states/eight ordinals preserve non-Uncertain effects/projections/results and source immutability. Public semantic result omits roll. Original declaration-rejection/same-anchor checks remain. Syntax and staged whitespace checks pass. Initial formula probe failure was corrected by using the same roots/strings compiler options as Core; no product change.
- No new install/build/hosted-model/typed bridge/save-container/UI/device/full-suite/CI validation claimed. Tests use a diagnostic fixture, not implemented gameplay; P2 must repeat the invariance property on actual nine-verb declarations.
- Next: continue the already-authorized P2 nine-verb runtime, bounded Resolution/effects/index, safe receipt and typed/free-text parity. No further approval for G1 is needed. No P3/P8 until the actual P2 exit gate passes.
