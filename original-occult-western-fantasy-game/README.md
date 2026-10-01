# Original Occult Western Fantasy — Eastbank Field Register

Task: package/original-occult-western-fantasy-game. Long-lived independent package workspace.

## Release 1.0.0

[Download the retained Atria Package](releases/1.0.0.atria). PackageVersion: pkgv_4ca39e21c235a6126c70f8327f0b194f.

A bounded 30-day campaign: six-step ordinary character creation, Second Death, six semi-open Signature inquiries, earned Breach/Claim/Price, professional Patterns and the six-dimensional Eastbank Hearing. The Native field register exposes acquired evidence, provenance, attributed testimony, findings and hypotheses without revealing hidden Canon. Deep cause remains unresolved. No new gameplay was added in P9.

The final archive is 201572 bytes, SHA-256 e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09. History is retained; builds never overwrite an existing file. The ignored P8 build is not this release.

## Install and play

Import the .atria through Atria's Package installer, grant its required generation permission, and select Second Death — Eastbank Convergence. Use a host supporting required authority-transaction@1, world-simulation@1 and Native frontend-script@1; verified Core main is e8d0b983f30c22a169e8283157ccd7b4a1dd475d. Configure generation through the Host; no credentials are bundled. Enter Ready, complete ordinary identity creation, then use Field notes/Host Composer and the reviewed typed actions. Save/restore is owned by the Host.

## Validate / build / preview

Run with Node and an independent current Atria main checkout with its dependencies:

~~~text
node tools/content-check.mjs
node tools/frontend-model-check.mjs
node tools/package.mjs validate --core <main-checkout>
node tools/package.mjs validate --fixture --core <main-checkout>
node tools/package.mjs validate --campaign-only --core <main-checkout>
node tools/package.mjs validate --frontend-only --core <main-checkout>
node tools/package.mjs preview --release-only --archive releases/1.0.0.atria --core <main-checkout>
node tools/package.mjs build --core <main-checkout> --out <new-build-path.atria>
~~~

Default validation retains the complete P5/P6/P7 matrix. --fixture retains P2/P3/P4 under a distinct immutable regression identity. --campaign-only performs a continuous committed campaign, interleaved Signatures, actual Branch Retry and save-container continuation through day30. --frontend-only requires Edge Chromium (or ATRIA_BROWSER_CHANNEL) and the Core Playwright/browser bundle; screenshots go to build/ui-<version>. These are real Native/UI tests with a local synthetic HTTP provider, not hosted-model evidence.

--archive decrypts and validates the saved archive, comparing its normalized manifest, every compiled file and every Data asset against the current build. --release-only checks fixed budgets, model-resource origins, permission/install/Ready, safe views and corruption refusal. This preview is an integration preview, not itself a screenshot; the separate frontend suite supplies visual evidence. Container salt/nonce vary, so payload equality, not rebuilt archive hash equality, establishes source correspondence.

## Ownership and boundaries

- manifest.json and runtime/model-resources.json own immutable Package/model origins. Build-time compilers emit declarations and Native presentation assets, not an alternate authority engine, RNG or persistence service.
- data/ contains 40 hash-pinned resources / 240 structured assets (482200 bytes; largest 78485 bytes). Hidden Canon and private institutional/actor state remain behind safe projections. Six public Knowledge entries are installed but unbound.
- runtime/OPENING.md, NETWORK.md and CONVERGENCE.md describe retained stage contracts; their historical version/scope notes are not current release status. runtime/FRONTEND.md describes the unchanged P8 UI.
- 64/64 transactions, 9 publication reads/15 commands, static maximum24; Evidence248/256, summary232/256, Graph169/256; maximum formula2000/2048. Intent keeps compact investigation.nodes; both full-detail Graphs use investigation.details. P9 observed maximum15 reads/17 commands/19 effects and13492 observation bytes, below16384.
- One world clock, day30 horizon, <=2880 minutes per advance, maxSteps3/maxDeliberations1. Day31 rejects atomically. The16 Seeds/32 archetypes are bounded supervised-carrier contracts, not arbitrary Claim Engineering. Extra Pattern instances are bounded. Hearing dimensions remain independent.
- Normal new operations acquire a current bridge handle. Unknown-commit retry retains original epoch/revision/input/key. Process-local selection pinning, same-anchor RNG, committed idempotency and actual save-container restoration are distinct guarantees.
- No claim of cross-process uncommitted journal recovery, old-version save migration, hosted-model behavior, physical-device/screen-reader or OS-crash verification. Paper/light UI is intentional, not a separate dark theme. Later-state browser setup uses Native transactions, not every action clicked.

Exact tested/pushed HEADs and durable P9 reports/screenshots are in the same Package Record on docs. package remains independent; main is not merged into it.
