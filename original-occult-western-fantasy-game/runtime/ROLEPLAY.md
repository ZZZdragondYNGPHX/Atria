# Open Lives — content and Native interface contract

The default `tools/package.mjs validate|preview --core <checkout>` compiles this profile with its actual Native interface. It requires `refactor/open-roleplay-core` implementation `1661af11245c856363bfc1084275c02b55a97452`, with required authority-transaction/story-start/generation-budget/run-policy @1 plus fixed Host recent-message and terminal presentation reads. The old main baseline does not provide these opt-in capabilities. The validation archive is held in memory. Phase 5 owns new archive publication and Core integration.

The package identity remains the same game. Version 3.0.0 has a distinct immutable PackageVersion compiled by `ROLEPLAY_VERSION_ID` in `tools/roleplay-compile.mjs`; it never reuses the v1/v2 identity. No old-save migration is claimed. `manifest.json`, historical runtime inputs and both retained releases remain historical compiler inputs/assets.

## Start and authoritative state

`story.begin` takes the closed object `{mode, name, appearance, residence, livelihood, attachment, contact, aim}`. Name is 1–48 characters, personal appearance 0–160. Mode is ordinary/ironman, frozen by the Host. Choice IDs, their authored fragments, incompatibility and ordinary starting resources come from `data/roleplay.foundation.json`. The guest+solo combination is rejected rather than silently changed. Ready is required.

Core `beginStory` writes player background, actual place/tool/resources, at most one ordinary Mira relationship, the prefatory opening, action receipt and mode in one CAS and with zero model sends. Selected start fragments are stored in `roleplay_player.background` and the relationship text; the public overview and future question summary use those same approved values. The opening Timeline contains an authored preface. Phase 4 should display the selected fragments with it, not regenerate background or accept a client-supplied summary. Changing selections before confirmation writes no character; repeated confirmation is idempotent and post-confirmation changes are rejected by Core.

`roleplay_player.main` holds the ordinary protagonist and current place. `roleplay_world.main` holds bounded logical groups for progress, money/debt, relationship, institution contact/training/witness, one current Claim, conditions, evidence-backed pursuit, schedule, private proposal and eight dynamic entries. Grouping these fields keeps actual simulator scans within Core's 16 private-read budget. A `play_progress.main.effectiveTurns` protected projection is published atomically from the internal progress count and is the scalar consumed by Core's send budget; it cannot be a frontend App Command target. `roleplay_summary` and `roleplay_visible` are also derived outputs.

## Natural language and life actions

All resolver-exposed inputs are closed schemas. Ordinary free text is first appended through the Host conversation, then resolved to one transaction; typed actions create their own authoritative input entry. The outcome, time, resources, permissions, other people's consent and hidden Truth are never accepted as input fields. A receipt states that later intentions were not executed. Suggestions in Phase 4 must only fill the draft.

- `express`: words, personal stance or an unsupported attempt; no outside fact, time or effective turn.
- `talk`: a known reachable ordinary person or institution intake; 5 minutes. Public contact is not membership. Attributed reports are not deep Truth.
- `work`: one ordinary local carrying/repair/copy/assistant/helping job; tools and injury are checked, 60 minutes. Two days of basic living money starts at 20 coins, savings at 40; daily basic cost is 10. Ordinary income does not create a profession or authority.
- `travel`: one reviewed adjacent public city route, 20 minutes. `visit_place` enters/leaves a published public workbench in its actual parent place, 5 minutes. No teleport or restricted access.
- `rest`: 60 minutes; sleep clears fatigue, lodging care treats the authored minor practice injury. Neither repairs a broken carrier nor resurrects a person.
- `learn`, `practice`, `invoke`, `maintain`, `research`, `risk.resolve`: the bounded supernatural paths below.
- `help`: one introduced ordinary short-job affair, 60 minutes and 8 coins. It becomes fulfilled under the same stable ID; repeating it does not pay again.
- `attention`: persistently follow or let a known concern recede; no world time or effective turn.
- `wait`: 1–1440 minutes. `close_episode` concludes/continues a short experience in one minute, retaining all relationships, facts and duties. Episode completion does not mean death.

Every committed time-bearing attempt increments effective turns once, including an actual failed practice. Impossible results spend neither proposed time nor a turn; the receipt separates `plannedMinutes` from `spentTime`. Invalid input, clarification, Ready/start, failed generation, committed invocation replay and background delivery do not increment the count. Internal elapsed minutes and the single canonical minute clock advance atomically. Day costs and deadlines use that clock, never model text. First-edition scalar bounds are finite (one million effective turns/minutes); overflow rejects atomically, not by wrapping.

## Institutions and personal engineering

The existing Metropolitan Communion / Municipal University identities and the reviewed Memory/Witness / Name/Boundary Seeds are retained. Public contact → study → personal verification of independent contradictory supports → preserved carrier → accepted Anchor/Price → narrow use → a second supervised use → maintenance or breach form two separate authored routes. Neither route needs Second Death, a civil license, a case mandate, a family or a supernatural class. The institution's formal name is copied from its existing definition.

Church training preserves the contradictory promise token and a communal oath; knowing denial breaches it. University training isolates and verifies a calibration carrier; its Price includes recorded error and two coins per daily calibration. The retained carrier is the actual Anchor ID. First/second use flags persist; repeating one support does not farm growth. Claim stage has a bounded 0–4 representation. Missing the daily Price makes the Anchor unstable and disables use; qualified maintenance restores validity with the actual fee. Initial enrollment is not repeated to reset growth. First edition holds one current Claim and defers a general multi-Claim/transfer system.

Hearing about unsupervised practice unlocks research, not an office, power or prosecution. Engineering accepts only the reviewed `personal_carrier` and `narrow_condition` options, with a personally qualified Seed/carrier and explicit Price acceptance. Unsupported proposed effects remain research. Personal practice has no outside witness protection and a heavier daily four-coin Price. Narrowing confines use to the practice place and improves the cautious chance, without expanding the underlying law.

`risk.resolve` uses deterministic identity-bound bounded Fortune, three outcome bands and authored eligibility. A cautious attempt is Risky; forcing a repeat while injured is Desperate and requires `acknowledgeSevere`. Failure/partial cause concrete fatigue/injury; an acknowledged injured forced repeat can have the actual `death` outcome. Private draws, seeds and formulas are omitted from receipts. Ordinary deterministic life/institution work does not infer random harm. Fortune internals may still draw for an impossible case; the outcome/effects do not depend on it.

Public ferry practice supplies a signed worker witness report. A signal-house rebound supplies a caretaker's observed report; successful isolated practice supplies no automatic report. Research alone supplies none. Identified evidence and clock deadlines drive report → verification → summons/restrictions; repeated practice after summons supports limited detention. A formal petition can replace restrictions with supervised remedy while retaining evidence, without acquittal or a granted Claim. No omniscient motive scan, automatic conviction on suspicion or lethal enforcement is authored.

## Bounded local world creation

There are eight never-recycled IDs, `dynamic_01`…`dynamic_08`. Each introduced entry stores kind, authored template role, parent, sourceBatchId/sourceRevision, introduced turn, revision and status. A private slot starts empty; only a promoted entry acquires public identity/text. The public derived index contains approved entry fields and empty placeholders for unintroduced IDs, without private inbox/schedule/Canon. Guessing an empty or remote ID does not permit interaction.

One FIFO `world.create` Task takes at most three already known related objects and only one candidate or defer. It may supply public label/appearance, kind, current parent and neighbour/workbench/short_job template. It cannot supply law, Claim, appointment, arbitrary effects, eligibility or wages. `roleplay_world.proposal` is private. Core checks the actual queue identity/input/clock anchor, before a single deterministic `world.reconcile` reaction checks batch, current parent, template/kind and empty next slot. Receipt provenance can be resolved from sourceBatchId/sourceRevision to the actual queued Task's batchId/batchRevision and invocation. All eight write targets are statically authored; promotion, inbox consumption, schedule update and safe projection are one Task-result CAS. Invalid/defer consumes the inbox and publishes no partial entity.

The eight promotion branches and deterministic calendar/upkeep/pursuit checks share one reconciliation job. Separate per-slot jobs would repeatedly scan past the expanded read limit. Exactly two jobs are emitted: this deterministic job and one creative job. All static branches plus publications remain within 24 commands / 32 effects; actual expanded preparation is also checked by Core. Full capacity preserves every identity and fulfils existing stories, without a replacement or hidden name reuse.

The current scene belongs to the normal narrator. Followed/active contacts are hot; background opportunities are warm. Hot eligibility is four effective turns after consumed delivery, warm eight. Letting a concern recede persists cold with a 24-turn threshold and no periodic creative admission; explicit recontact makes it eligible under the hot floor. One merged batch/one pending job serves related public context, rather than per-NPC calls. Deterministic costs, obligations and evidence-backed procedures run independently of creative cadence. Stale work is cancelled before send/publication; spent attempts are not returned.

Core enforces resolver 2 / narrator 2 / foreground total 4 actual sends per original anchor, background 2 per four-turn window and 10 per twenty-turn period, including provider failures, scheduler retries and fallback. No window borrowing. Ordinary restore preserves the external spent ledger/high-water. The production Host automatically offers the persisted world outbox for delivery after foreground finalization; the verifier also drives it explicitly to control negative/budget cases.

## Modes, history and verification

Core owns ordinary/ironman mode, status and sequence. Only the proof-backed `risk.resolve:death` result declares death; text or direct App Commands cannot do so. Ordinary death stops continuation but explicit earlier SavePoint restore is available. Ironman refuses rollback; schema-2 current-head resume exports preserve necessary state and control ledger. A committed ironman death produces a tombstone, cancels the run's remaining work and cleans that run's managed data. Isolation, interruption and lower-level protection remain Core's P2 contracts; this profile verifies real game qualification/death and actual ordinary/ironman save operations with temporary data.

Run the minimal content-stage checks:

```bash
node tools/content-check.mjs
node tools/package.mjs validate --core <tested-P2-Core-checkout>
node tools/package.mjs validate --fixture --core <tested-P2-Core-checkout>
```

The content verifier uses real isolated FS install/Session/authority/Save/Task/provider paths with a local synthetic HTTP provider. It validates rule effects and actual sends, not production-model interpretation or narrative quality. It is not UI/browser, SQLite/MySQL/PostgreSQL, Android, a century soak or a new release acceptance. It does not touch personal saves. P2 already holds the corresponding Core FS/SQLite risk evidence. `--legacy` explicitly retains the v2 compiler/checks; `--v1-campaign` and `--fixture` retain their existing identities. Historical-only flags also select the historical compiler. No old `.atria` is overwritten or repackaged by the new profile.

## Phase 4 Native interface

`tools/roleplay-frontend-compile.mjs` compiles `frontend/OpenLives.aui` and `frontend/Companion.aui`, their sandboxed controllers, scoped CSS and an authored public choice/place catalogue. The default compiler no longer substitutes a neutral shell. Historical frontend sources remain separate. Two app-root views use the Native companion overlay for the right-edge drawer, including Host focus containment, Escape and focus return.

The questionnaire keeps selections local until a final review and one `host.session.begin`. Its unknown-result retry retains the exact input, invocation, epoch, revision and idempotency key; rereading an already committed start does not repeat creation or send a model request. The story displays the committed background and chronological Timeline, location and time. Suggestions append only to the local draft. The fixed Host composer owns actual submit, cancellation and recovery. Failure preserves the draft and blocks another submit until Host recovery or an observed completed reply; no poll replays actions.

Only `roleplay_summary` and `roleplay_visible` are Package read bindings. The companion displays public conditions, people, belongings, institutions and the accepted Claim's rule/Anchor/Price. Ordinary restoration requires a selected SavePoint and explicit inline confirmation. Ironman may save its current progress but exposes no rollback. Episode closure and authority death have distinct text and continuation behavior.

The fixed `host.conversation.recent` read returns at most 32 committed messages in chronological order, optionally before a sequence for earlier pages. Incoming replies keep the earlier reading window until the player chooses the latest page. The initial technical `Begin story` input marker is omitted from presentation; authored opening prose is preserved. Extremely large individual messages near Host maximums are not a browser acceptance claim.

After ironman cleanup removes Session/Timeline, the bridge may reopen the installed Native graph from the control tombstone's installation identity and content hash. The new epoch allows only terminal run status and Host exit, without exposing deleted state or authorizing gameplay/restoration. Tombstones written before this Core fix without installation identity still retain `/run` recovery but cannot reopen the Native graph this way.

Run the focused interface check with an existing Core QuickJS worker bundle and Playwright Chromium:

```bash
node tools/package.mjs validate --core <tested-P4-Core-checkout> --roleplay-ui-only
```

This local check uses real compiled Native components, QuickJS/bridge/Host composer, isolated FS and a synthetic HTTP provider. Background dispatch is held to keep UI cases focused; P3 owns its separate automatic-dispatch evidence. Later Claim/death states use real typed Native authority setup, and long reading samples use native Timeline appends; neither is described as player-click/model coverage. Desktop/mobile viewport, keyboard focus, reduced motion, landscape and Native 200% text are checked. Android keyboards, assistive technology, production models and a published archive remain outside this stage.
