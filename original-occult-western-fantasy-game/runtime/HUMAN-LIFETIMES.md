# Phase 3 — Human Lifetime / Family / Institution Lifecycle

Development: **2.0.0-phase3**. Not the final Long-Lived World release.
Requires Core 80376ec9f0e5cce9ef1c29422f39604bb7446cfd or a descendant.

## Authority

The Package emits optional lifecycleRuntime.lifetimes declarations via tools/lifetime-compile.mjs. Native prepares them inside the same private Authority candidate as Clock, existing Lifecycle domains, History and the approved reply. CAS publication and SaveSystem are unchanged. State lives in atri_lifecycle.lifetimes; no Package evaluator, external database, second scheduler service or save format is introduced. Packages without this policy retain their behavior.

## People, age and event resolution

People have immutable world/session-scoped IDs, an explicit birth instant and a separate introduction instant. Negative birthdays represent pre-opening history. Meeting an adult never creates a newborn. The Anchor uses its reviewed name and Phase 1 ID only after creation; Elias remains the deceased client. Gregorian birthdays include pre-epoch and leap-year cases.

Tier A retains personal detail, health, career, family, offices and route state. Tier B omits detailed characterization but really matures, retires and dies. Two distinct supported relevance contacts promote B to A. Tier C stays aggregate: coarse births/deaths and named-person materialization, not literal per-capita simulation or Phase 6 macro demography.

Long advances resolve due maturation, gestation, retirement, death, succession, reconstruction and slow documentary-exposure boundaries. Ties have deterministic ordering. Work scales with relevant events, never every skipped day. Exact milestone dates survive a multi-year enclosing transaction. Inactive profiles lose detailed hot characterization, not identity, kinship, history, obligations or Claims. Dead NPC age freezes at death.

Institutions have independent stable IDs. Offices point to institutions; exact non-overlapping terms identify changing holders. Vacancies prefer eligible nominees/senior members, otherwise materialize adult institutional intake with an existing birthday and vacancy provenance. Retained opening actions cannot silently reenact retired/dead actors' living roles. Institution creation/merge/split/dissolution remains Phase 4.

## Exact history and limits

Person facts, milestones, bonds, kinship, pregnancies, institutions, offices/terms, legacies and protagonist continuity bind into Phase 2's Canonical Fact Ledger and indexes. Secret bonds/adoptions stay non-public. Derived ages are not recorded every turn. Compaction never erases referenced history or player marks.

Bounds: 256 relevant people, 512 due events per candidate, 1 MiB lifetime state, plus the existing 4,096 durable-history-entry / 2 MiB history budgets and 4,096 source-scan cap. Exhaustion refuses the candidate atomically. Durable lifecycle facts necessarily grow with real structural changes, not prose/no-op turns. Final-soak profiling remains required; arbitrarily accumulated saves/branches are not active-state growth.

## Typed operations

Reuse opening.wait with optional lifetime. Payload keys replace operation dots with underscores. Operations resolve **after** any requested interval. Example:

    { "minutes": 0, "lifetime": { "operation": "family.conceive",
      "family_conceive": { "parentId": "<actual actor ID>",
        "otherParentId": "<actual actor ID or empty string>",
        "name": "Mara", "consent": true } } }

Authoritative schemas: Core public/shared/native-lifetime-contract.js.

- person.enter / promote / exit / return / career / health;
- bond.form / change: romance, marriage, partnership, separation, estrangement, reconciliation; automatic widowhood and new bonds/remarriage;
- family.conceive / adopt;
- legacy.pledge;
- office.nominate;
- longevity.bind / offer;
- protagonist.die.

Relationships require adult eligibility and explicit consent. Multiple pairwise bonds allow nonexclusive structures without a universal household ban. Visible overlapping marriage can produce opening-society exposure; full jurisdiction/Era variation is deferred. Ordinary childcare is abstracted. Fixed 280-day gestation is an authored abstraction, not a medical/fertility model. Relevant children mature and can become parents. Adoption is explicit, chronology-checked and may be secret. Player control never transfers to an heir.

Legacies retain owner, beneficiary and causal source. Artifact legacies require actual custody and transfer it with durable provenance. Favors, grudges, secrets, obligations, institutional ties and explicit supernatural liabilities can carry forward. Unavailable heirs/assets leave disputes, not invented transfers. Full estate/property/business law remains Phase 5.

## Longevity and ordinary death

Chronological age, apparent body age and duration of the initial public identity are separate. Full public/legal identity rotation is Phase 5.

Normal adults can take Witness Covenant or Reconstructed Vessel. Each has an explicit aging/return profile and durable Claim/exposure costs, not an aging=false flag. Family does not inherit longevity. Sponsorship requires a bound protagonist, recipient consent and extra costs; this foundation allows at most two intentional grants. Refusal is recorded.

Ordinary protagonist death creates absence, a due return, Claim burden, exposure and an embodiment scar. World lifetimes/office succession continue. Return preserves identity, history and obligations, does not undo inheritance or refund costs. Active personal actions are refused until return. Ordinary death cannot select a terminal ending.

Family records can create documentary-exposure facts on slow 30-year boundaries, referencing real bonds/kinship. This is persistent pressure, not Phase 4 case generation or repetitive upkeep. Complete identity/wealth/Claim progression remains later work.

## Query and evidence

lifetimeView(snapshot, actorId) provides a bounded read-only age/status projection. Existing Chronicle APIs retrieve person/family/institution facts. The old scalar UI deliberately omits a broken structured editor; final family/Chronicle UI remains Phase 7.

    node tools/package.mjs validate --lifetime-only --core <compatible Core>

This executes real Native transitions over 90 years: two descendant generations, adoption, widowhood/re-partnering, leadership succession, causal intake, promotion, disappearance/return, inheritance and protagonist reconstruction. Nine SaveSystem containers import into fresh alternating Fs/SQLite stores around risky boundaries and continue play. Core also tests three seeds, JSON normalization, event budgets, invalid chronology and checkpoint/Retry.

These are Phase 3 tests, **not** Gate A/B/C or final Century Retrieval. Preserve releases/1.0.0.atria unchanged. No v1 save migration. Phase 4 needs a separate authorized work round.
