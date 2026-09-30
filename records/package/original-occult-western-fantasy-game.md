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
