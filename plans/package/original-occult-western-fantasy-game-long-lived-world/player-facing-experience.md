# Phase 7 — Player-Facing Long-Life Experience

**Task ID:** `refactor/original-occult-western-fantasy-long-lived-world`

**Status:** Implementation-ready UX specification; Phase 7 execution remains gated on Phases 5–6

**Baseline inspected:** Package `7937de304`, Core prerequisite `6e2611a0a`

**Scope:** Presentation of the approved long-life systems, not new gameplay or a second authority

## 1. Product direction and fixed decisions

Keep the Eastbank field register: marine cover, offset paper index and quiet reading surface. The register belongs to one continuous protagonist while its contents accumulate different generations, public identities, institutions and eras. Extend this existing language rather than redesigning the game as a management dashboard.

The player's recurring questions determine the layout:

1. What is happening now, and what can I do?
2. What happened before, how do I know it, and why does it matter now?
3. What will my continuing arrangements permit while time passes?

The memorable visual device remains the double-file spine. Historical depth is expressed through dated entries and provenance, not decorative parchment, occult glow, achievements, power scores, a giant family graph or a zoomable 200-year canvas. Era changes alter content/rules and dated context; they do not switch the entire UI theme. Low-profile play and a protagonist without a family or organization receive a complete experience.

This specification fixes navigation, reading order, defaults, states, components and acceptance scenarios. Implementers may adjust spacing to resolve measured overflow or contrast defects. They must not reopen the information architecture or choose a new visual direction without a concrete incompatibility.

### Skill application and design review

Applied `frontend-design` for subject-specific hierarchy and tokens, `ui-ux-pro-max` for usability/accessibility, and `emil-design-eng` for interaction feedback and motion restraint. Local Skills are preferred; a remote executor can use `skills:SKILLS.md` and those named repository copies. Skills guide implementation, while this Plan and Native contracts own scope.

The design-system search `narrative game archive history` returned a gaming product showcase/3D direction. The narrower retry `archive reading interface` returned a marketing demo/Swiss interface. Neither is a verified fit for an existing offline Native investigation register; neither palette/layout is persisted. Visual decisions below reuse the inspected Package design. A focused `keyboard focus modal` UX search supports visible focus and unobscured controls. General contrast, touch, safe-area and reduced-motion constraints come from the Skill's built-in guidance.

| Before | After | Why |
| --- | --- | --- |
| Phase 7 lists systems but leaves every page undecided | Three primary destinations with specified sections and return paths | Later AI can implement without inventing navigation |
| Opening-era date and identity header | Civil date, local Era, current hub and active public identity | A century-old protagonist must remain oriented |
| Generic scalar action fields omit nested long-life inputs | Dedicated stance, time, history and policy forms | Valid typed inputs without exposing JSON to players |
| Potential graph/dashboard treatment of accumulated state | Bounded dated lists with selected-record relations | Remains readable on phones and after many generations |
| Temptation to animate historical updates | Immediate filters/navigation; restrained pointer feedback | Repeated investigation should feel immediate |

## 2. Navigation and responsive structure

Exactly three primary destinations, in this order: **Field notes**, **Chronicle**, **Arrangements**. Existing Evidence, Cases and Identity are preserved as sections, not removed game functions.

| Destination | Local section choices | Default and entry behavior |
| --- | --- | --- |
| Field notes | Current inquiry, Evidence, Cases | Current inquiry; retains conversation, creation, Composer and contextual typed methods |
| Chronicle | Timeline, People & families, Institutions & places, Artifacts | Timeline; entity links open a bounded detail inside this destination |
| Arrangements | Identity & longevity, Time & stances, Delegation & organizations, Regions & holdings | Identity & longevity; header `Advance time` opens Time & stances |

Use text-labelled navigation controls and a visible current selection (`aria-current` or the supported semantic equivalent). Section choices wrap; they never form a horizontally scrolling strip. On narrow screens, a labelled native section select may replace the section buttons. Three primary controls remain visible. Do not add a fourth top-level destination for save/settings; Host save controls remain in Arrangements.

**Wide, at least 1200 CSS px:** retain the 212px cover. Chronicle uses a flexible list and a 320–400px selected-record panel only when both remain readable. Field notes prioritizes the existing 68ch conversation; forms follow or sit alongside only if width permits. No permanent dashboard of all systems.

**Medium, 768–1199px:** cover becomes a horizontal header; one main reading column, with inline detail. **Compact, below 768px:** three wrapping primary controls, 16px page gutters, one column. Record selection replaces the local list with detail and an explicit `Back to results`; it does not create a modal over the entire application. At 200% text, collapse split layouts based on available space, even at a nominal desktop width.

Keep the existing folio as the single content scroll owner. The desktop cover may remain stationary. Compact headers/actions stay in normal flow; do not add a fixed bottom dock that covers content or the software keyboard. Reserve Host chrome and safe-area insets. Detail/back navigation restores the list's filters, selected row, current page, scroll position and focus when the revision still matches.

```text
Wide
+------------------+---------------------------------------------+
| Eastbank spine   | Public identity   Civil date / Era / Hub     |
| Field notes      | Section choices                              |
| Chronicle        | Filters / current context                    |
| Arrangements     | Dated result list       | Selected record    |
|                  | Load next page          | Sources / relations|
+------------------+---------------------------------------------+

Compact
+-----------------------------------+
| Identity                           |
| Civil date / local Era / current hub|
| Field notes Chronicle Arrangements |
| Section / filters                  |
| Dated list OR selected detail      |
| Explicit next page OR back control |
+-----------------------------------+
```

The masthead shows the authoritative civil date, local Era title, current hub and current public identity. Allow wrapping across lines. Elapsed Day is secondary detail, not the primary long-life date. Show ordinal `Year 147` rather than pretending the epoch is a real historical date. Exact dates, pre-epoch birthdays and leap days use the Native chronology formatter. Never derive age by dividing ticks by 365 or use browser wall-clock dates.

## 3. Visual and component contract

Reuse `frontend/inquiry.css` tokens. These names describe existing CSS, not a second theme registry.

| Token | Value / role |
| --- | --- |
| `--cover` | `#173F49`, cover/navigation and primary action |
| `--paper` | `#F7FAF8`, reading background and on-cover text |
| `--ground` | `#DFE8E4`, selected detail and grouped form surface |
| `--ink` | `#243D43`, primary text |
| `--muted` | `#52666A`, dates and attribution |
| `--brass` | `#735826`, provenance labels and light-surface focus |
| `--caution` | `#853F45`, explicit risk/error text |
| `--testimony` | `#64445D`, attributed or subjective records |
| `--rule` | `#9CADAA`, separators; never the sole focus/state indicator |

Keep paper/light mode even under dark OS preference; a new dark theme is outside this phase. Use a light high-contrast focus outline on the marine cover. Check actual foreground/background pairs rather than assuming every token combination is accessible.

Titles and narrative: `Georgia, "Noto Serif", serif`; controls/provenance: `"Segoe UI", system-ui, sans-serif`. Use installed/offline fallbacks, including system CJK glyphs; do not download fonts. Base 16px/1.6; long prose 1.75 and max 68ch; metadata at least 14px. Primary heading 32–48px responsive, section heading 24–28px, record heading 20–22px. Left-align text. Date numerals may be tabular; body labels are not monospace or all caps.

Spacing scale: 4/8/12/16/24/32px, with 8px minimum between distinct touch targets. Controls are at least 44px tall, labels remain visible, text wraps. Preserve existing small control radii and asymmetrical selected folio; do not add equal rounded cards/shadows to every entry. Group historical entries by actual date/year, not arbitrary numbered sections.

Implement these bounded presentation patterns using Native AUI capabilities already supported:

- **Dated entry:** title button, date/range, record type, two/three-line summary, attribution and current consequence. Stable entity/history IDs are keys, never display names.
- **Record detail:** summary; exact date/range; participants; source; known consequences; known relations; optional memory clarity. A provenance chain is a labelled chronological list, not a node canvas.
- **Entity detail:** current known status first, then dated lifecycle/tenure/ownership changes and linked records.
- **Policy form:** current committed values, editable draft, known scope/constraints, before/after review and one explicit commit action.
- **Inline operation feedback:** status beside the initiating action. Errors remain until resolved/dismissed; no timed disappearing failure toast.
- **Bounded pager:** count for the current returned page, `Next page` only with a returned cursor. No fabricated total or infinite-scroll archive loading.

Record type always appears as text: Evidence, Testimony, Finding, Hypothesis, Historical summary or Recorded fact. A document's claims are not automatically true. Memory clarity is a separate line (`Clear memory` / `Faded memory`), never a replacement for a factual date/status or an invented confidence percentage.

## 4. Page and flow specifications

### 4.1 Field notes: preserve immediate play

Keep the six-step ordinary identity creation, committed conversation, Host Composer, acquired evidence, independent case/Hearing terms, typed investigation methods and advisory tasks. Reuse their eligibility and consent rules. Do not force a century-management tutorial before the opening case.

Add a compact `Since your last active inquiry` summary only from the latest committed interval/transition result: actual resolved date/range, interrupt if any, and links to known changes. Show at most five highlights initially, with `Read interval record` for the rest. Do not treat an unread counter as new authority or generate a model summary on mount. Background organizations' routine reports are grouped here or in Arrangements; they do not repeatedly steal focus.

Investigation methods stay contextual. Dedicated long-life forms live in Arrangements/Chronicle instead of duplicating them in an always-visible giant method selector. Existing investigation actions remain reachable.

### 4.2 Chronicle: timeline and historical retrieval

Default to the backend's recent public history slice. Timeline filters are **Year/date**, **Era**, **Person**, **Family**, **Institution**, **Place**, **Matter**, **Claim** and **Artifact**, with a record-kind selector. Use labelled fields and `Apply filters` / `Clear filters`; do not fetch the archive on every keystroke. Each query uses supported selectors. At the inspected baseline, `facet/value` is one dimension per query: UI must not silently imply unsupported AND filters. Choose a `Browse by` dimension and its value; exact `id` lookup is a separate path. Add multi-filter capability only if the then-current approved Native query supports it.

Offer current/recent year and direct year entry so Year 200 does not require scrolling through 199 groups. Date ranges or free-text global search appear only when the real backend supports them. Local text filtering must say `Within this page` and cannot claim to search an entire century. Do not invent archive text from merged interval bins: bins show their real range/count and retrievable facet links.

Selecting a dated entry opens the Record detail. Known actor/family/institution/place/artifact links open the corresponding Chronicle section, retaining a small presentation-only return stack. No browser routing/deep-link capability is assumed. Links to hidden records are absent; a stale/unavailable public target says `This record is no longer available in this view` and offers refresh/back without confirming a secret exists.

`Mark memory` / `Remove memory mark` and `Record in journal` use the existing history mutation contract. Never label these `Edit fact`. Reflect the mark only after confirmed commit; failures preserve previous state. Manual `Compact history` belongs under save/archive explanation, never a disguised delete button. Explain that an archived reply can still be read but its old Retry anchor may be unavailable; disable that Retry only on real Host status and display the archive reason. New eligible replies retain normal Retry behavior.

### 4.3 People and families

Default to known relevant people, with protagonist/family first when present. Filters: current/historical and selected family or person according to actual safe queries. Do not instantiate a person just to render a row. Display name, current status, authoritative age/date information and known relationship. Distinguish `Deceased`, `Retired`, `Missing` and `Absent`; these are not interchangeable.

Person detail orders biography/status, known bonds, parents/children or adoption links, career/office history, inherited consequences and related artifacts. Adult introduction is not a birth. Unknown birthday displays `Birth date not recorded`, not an inferred age. A deceased person's age freezes at death. Historic office terms show start/end and current successor separately.

Use a text family lineage with collapsible generation groups and a selected-person focus; expand one branch at a time. Do not require panning a full family tree. Private bonds/adoptions remain excluded by authority. No family empty state: `No family relationships recorded. Your life can continue without founding a family.` Do not offer an heir switch or force romance/children.

Relationship/adoption/longevity-offer actions appear only through approved player-capable operations, with adult/consent/Price review where required. Consent is affirmative and unchecked; the authority remains the final eligibility validator. Refusal remains a real outcome, not a UI failure to bypass.

### 4.4 Institutions, places and artifacts

Institutions & places uses one local section selector. Show durable identity, current name/status and known location; historical aliases support recognition. Details show actual renaming, construction/reuse, merger/split/dissolution, office succession and known causes. A dissolved institution is a historical entry with successor links, not an active command target.

Artifacts default to known available records; lost/destroyed records remain discoverable through their public history. Detail contains carrier/type, authored/attributed content, source event, creation date, copy-parent and custody/status history. Initially show the latest returned links and explicit total if supplied; inspect earlier exact anchors on demand. Do not pretend the latest eight links are the full provenance chain.

Allowed controls such as copy, archive or journal derive from typed schemas and safe availability. Destroyed artifacts cannot be copied/recovered through UI invention. A stale action is rejected by authority and refreshes current status. No unrequested new destructive artifact workflow.

### 4.5 Identity and longevity

Present **one continuous protagonist** above public identities. Three labelled facts remain distinct: `Chronological age`, `Apparent age`, `Public identity age/duration` using the real contract's meaning. Phase 3 has duration of the initial identity, not a fabricated legal birth date; Phase 5's exact schema must govern the final label.

Show bound route, known Claim/Price/Anchor duties, exposure indicators and their documentary sources. Use qualitative state labels actually projected by authority; do not invent an exposure meter, hidden probability or loyalty score. Public/legal identity detail includes active/retired status and known property, office, family or license dependencies from Phase 5.

Identity rotation reviews old/new public identities and known dependency consequences before commit. Preserve the persistent protagonist ID. If identity replacement is refused, show the real reason beside the form; do not silently detach assets or relationships.

During bodily death/reconstruction, show `Absent — return pending`, authoritative due/known return state and continuing world changes. Personal actions are disabled with explanation; history and safe reading remain available. Return shows changed family, offices/assets and embodied costs from committed records. It is not a game-over screen, a rewind or control transfer to a descendant.

### 4.6 Time and stances: one deliberate fast-forward flow

```text
Current date -> Choose interval -> Review stances + known commitments
             -> Review request -> Advance time
             -> Completed OR interrupted -> Read consequences / act now
                                        -> Review remaining request explicitly
```

Choose a positive integer quantity and supported unit. Presets: 1 day, 1 month, 1 year, 10 years; custom decades are valid. Use calendar-aware conversion supplied by Native/Host for months/years. The baseline action takes integer minutes only; if no supported calendar conversion exists, expose days and exact minutes first and complete the shared calendar adapter before claiming month/year presets. Never use `years * 365 * 1440` for civil-year intent, silently clamp, advance one year at a time or calculate world consequences in the frontend.

The review shows current date, requested target/maximum interval, six current stance values, draft changes, known unresolved matters/delegations and applicable alert rules. It clearly states `Time may stop early when your attention is required.` Review is not a forecast: do not promise no deaths, profits, successful delegation or a specific Era transition. Exact target dates are shown only if produced by an approved converter. Unsupported or out-of-safe-integer inputs fail beside the quantity field.

Six stance selectors reuse the closed enums in `tools/long-horizon-compile.mjs`: career, family, occult, social, wealth and investigation. Human labels map to real enum values. No assumed `delegated` investigation stance: delegation is a separate Phase 5 contract. Submit a complete six-domain policy when changing it; omission preserves committed policy. `Save stances` uses zero minutes plus stances and does not advance time. Unsaved values are explicitly drafts, preserved in-process across navigation, not guaranteed across restart.

The final review snapshots input, current revision and consent. Field or relevant revision changes invalidate review. Do not silently commit stances on navigation. For simultaneous policy/time change, use the supported atomic contract; do not split into two invisible writes.

While resolving, keep read navigation available when safe, block conflicting mutations, display `Resolving the requested interval…` and use actual operation state rather than a fake progress percentage. Stop/cancel is offered only if the Host contract supports it and cannot imply rolling back already committed time.

The result shows requested target, actual resolved date, elapsed interval, known interruption reason, source links and changes. `Act on interruption` opens the relevant safe matter/person view or Field notes. `Review remaining interval` creates a new reviewed request from refreshed authority. It never automatically resubmits the remainder; a failed/unknown operation is reconciled before any new request. No instruction promises ignoring mandatory high-impact interrupts.

### 4.7 Delegation and organizations

Default list: current responsibilities and items actually requiring a decision; routine reports stay collapsed. Empty state: `No responsibilities delegated. You can continue acting directly.` New delegation begins with a known eligible agent/organization and responsibility, not an invented employee.

Dedicated fields cover objective, authority boundary, resource access, acceptable risk, prohibited actions, escalation conditions and reporting cadence, only where Phase 5 exposes those fields. Review the before/after policy and affected responsibility. Plain labels explain thresholds in world terms; raw schema names and JSON remain developer information.

Organization detail separates founder policy, current leadership, known institutional Agenda and current reports. Named leaders link to real actor history; lower ranks remain aggregate. Show reported results with report date/source; concealed debt, betrayal, loyalty and corruption do not appear before discovery merely because they exist in runtime truth. `No recent report` is not `Everything is fine`.

Revocation/reassignment, major resource changes and founder-policy updates require their real typed authority operations and appropriate consequence review. Routine reporting does not require a confirmation every simulated month. Agent death/retirement or organization refusal/drift exposes actual consequences and succession, not a magically restored old agent.

### 4.8 Regions and holdings

Default to current hub and known connected regions. Use a labelled region list; a map is optional future decoration, not required for Phase 7. `Inspect region` is read-only. `Travel / Relocate` is a separate reviewed mutation. Viewing another region never changes the player's location or promotes simulation fidelity by frontend side effect.

Display player terms such as `Current base`, `Connected region`, `Distant record`, with actual last-known/update dates. Internally these may map to Active/Warm/Cold; do not imply a dormant or paused world. Show known family, agents, holdings, institution ties and Era/local conditions. Remote records are attributed to their reported time rather than falsely presented as live knowledge.

Travel review includes actual origin/destination, supported transport, authoritative duration/constraints and known absence commitments. The receipt shows resolved arrival/interrupt and refreshed world state. Returning after decades leads to changed place/institution history and ownership provenance, not resetting opening entities. Holdings include status, current legal owner/identity, source, manager and risks when known; no invented net-worth score.

## 5. Data wiring and platform-gap register

This is an integration plan, not a claim that every backend method is a sandbox binding. At baseline `inquiry-controller.js` reads four safe pages: `opening_summary_projection`, `player_matters`, `investigation_nodes_projection`, `investigation_edges`. The source `frontend/bridge.json` is a historical fixture input; inspect `tools/frontend-compile.mjs` and the compiled default package for the actual player frontend bindings.

| Surface | Confirmed authority or backend at baseline | Phase 7 integration requirement |
| --- | --- | --- |
| Current inquiry | Existing safe pages, Host conversation/Composer, typed methods | Preserve and extend their bounded views; no raw Lifecycle read |
| Date / interval / stance | Native chronology, `last_interval`, `long_term_stance`; `opening.wait` | Player-safe read binding and a dedicated nested-input time/stance form |
| Chronicle | SessionCore `getHistory(handle, sessionId, query)` and shared `queryHistory` | Authorized Native frontend bridge/read page; backend existence does not grant controller access |
| Person / family / offices | `lifetimeView(snapshot, actorId)` plus public Chronicle facts | Safe bounded player view and actual entity selection; no snapshot access in controller |
| History marks / artifacts | `opening.wait` optional `history` payload | Dedicated forms for `memory.mark`, artifact operations; schema-derived IDs/constraints |
| Renewal / historical world entities | Phase 4 bounded `renewalView` and Chronicle links | Player-safe projection; exclude hidden Matter truths and generation diagnostics |
| Identity / holdings / delegation | Approved Phase 5 scope; not implemented at inspected HEAD | Read the completed Phase 5 contracts and map these forms to actual operations |
| Regions / Era / travel | Approved Phase 6 scope; not implemented at inspected HEAD | Read completed Phase 6 contracts; map inspection separately from travel mutations |
| Save / Restore / Retry | Existing Host SaveSystem and reply/checkpoint semantics | Reuse Host actions/status; no Package pending journal or new save format |

At Phase 7 start, create a small mapping in the existing `frontend/DESIGN.md` identifying each actual binding, read schema, action and source. This documents the implemented wiring; do not create another authority registry. If a safe frontend adapter is missing, add minimal Core support in an independent product worktree and validate it, then bind it in Package declarations. Do not merge main into Package, import backend modules into the sandbox, use arbitrary resource reads, expose private snapshot fields or render a fabricated successful feature to hide a gap.

The inspected Chronicle query supports exact `id`, `kind`, one `facet/value`, `limit` 1–32 (default 12), opaque revision/query-bound cursor and subjective `memory`. Pages inspect at most 128 postings, cross-year archives at most 54 interval entries; output is bounded to 12,000 characters. Provenance exposes latest eight links plus count. Preserve these actual limits unless separately justified runtime work changes them. No frontend load-all/filter-all workaround or wider model context.

Only presentation state is local: destination, section, current page/filter, selected record, return path and unsent form draft. World state, marks, policies, ages, travel and histories remain Native authority. Use session/branch/revision plus stable IDs to scope cached detail; invalidate stale cursors after writes, Retry, Restore or Host epoch changes. Late responses from an old revision/query cannot overwrite the active page. Mount/recovery reads only.

Use the existing pending-write discipline: original invocation key, exact input and revision stay together. Known pre-publication rejection permits editing and fresh review; uncertain publication blocks competing writes until Host reconciliation. In-process retry retains the original key/input; never renew the epoch to disguise unknown status. Restart is not replay. Do not claim process-restart draft or pending-request recovery that the platform does not implement.

## 6. Shared state, accessibility and motion

| State | Required behavior |
| --- | --- |
| Initial loading | Labelled status and reserved reading area; no empty-world message before load completes |
| Loading another page/filter | Preserve visible results and draft while marking them as previous results; prevent duplicate query submissions |
| No records yet | Explain the absence and a valid next action; family/organization emptiness does not block play |
| No matches | Echo active browse dimension/value and offer Clear filters; do not offer hidden records |
| Read failure | Inline reason with read-only Retry; keep previous results labelled stale |
| Stale cursor/revision | Reset pagination and refresh the same selector; never append different revisions |
| Invalid input / authority refusal | Field-level cause, preserved draft, focus first invalid field, no claimed publication |
| Pending write | Local status, disable conflicting writes with explanation, preserve review/input |
| Unknown commit | Explain uncertainty, reconcile original request, block new mutations; no generic Retry that creates a new action |
| Confirmed success | Refresh committed state, announce once, link changed records; no optimistic facts |
| Unavailable capability | Explain the concrete unavailable operation; never advertise a functioning placeholder |
| Restore / branch change | Clear revision-bound record caches/cursors and renewed action review; maintain only valid presentation drafts |

Use supported native semantic controls, labels, heading order and disclosure elements. Focus moves to the destination heading after explicit navigation, to selected detail after opening, and back to its initiating row/control on return. Refresh/polling must not steal focus. Do not use CSS visual order that disagrees with DOM reading order. Selects/buttons need names; decorative marks are hidden from assistive tech. Status is polite; blocking errors use alert semantics without repeatedly announcing every poll.

All flows work with Tab, Shift+Tab, Enter/Space and explicit Back/Close controls. Modal risk review is unnecessary: prefer an inline review region, avoiding dependence on a new focus-trap capability. Any actual supported modal must trap focus, return focus and allow Escape before submission. Safe-area, long names, long years, wraps and 200% text cannot hide controls. Text contrast at least 4.5:1, meaningful component/focus contrast at least 3:1; no color-only warnings.

No route, timeline, list/filter, age counter or keyboard-triggered animation. Pointer-only press feedback may use 0.98 scale for 100–120ms; optional detail reveal uses opacity/transform at most 160ms, never delaying focus/input. Hover is gated by `(hover: hover) and (pointer: fine)`. Reduced motion disables movement and preserves instant state feedback. No new animation dependency, blur layer, autoplay or `transition: all`.

## 7. Implementation sequence within Phase 7

These are checkpoints inside one formal phase, not new phase branches or permission boundaries.

1. **Contract mapping and fixtures.** Recheck real Package/Core refs, Phases 5–6 Record and live HANDOFF; map safe reads/operations and close adapter gaps. Choose deterministic early/late public-state fixtures. Do not repeat earlier soak gates just to design screens.
2. **Navigation and orientation.** Extend `Inquiry.aui`, CSS and controller for three destinations, local sections and long-date masthead; preserve opening/Evidence/Cases/Identity behavior.
3. **Chronicle and detail.** Extend `inquiry-model.js` with bounded presentation models, query/cursor handling, entity relations, provenance and memory controls. Implement responsive return paths and checkpoint/Retry explanation.
4. **Long-term forms.** Add structured nested-input editors for time/stances, identity, delegation/organization and travel using actual schemas. Reuse pending-operation/consent handling. Keep `Main.aui` independent regression fixture intact.
5. **Interaction review.** Verify revision invalidation, late reads, interrupted intervals, no family/organization, absence/reconstruction, unknown writes and Save/Restore. Apply the specified restrained feedback; document any measured deviations in existing `frontend/DESIGN.md`.
6. **Real UI validation.** Extend existing `tools/frontend-model-check.mjs` and `tools/frontend-browser-check.mjs`, not a parallel UI harness. Run targeted model/frontend validation, then relevant Package integration/fixture checks against compatible Core. Update `runtime/FRONTEND.md` with actual flows, commands, limits and evidence.

If contracts require minimal Core additions, test those targeted APIs/bridge scopes and failure atomicity before Package UI validation. Keep actual schema/work budgets; do not widen them to fit one enormous projection. Paginate or select smaller views instead.

At Phase 7 completion, commit/push the same Package branch, update the same Record and live HANDOFF, provide Phase 8 prompt and STOP. Do not run final release/integration automatically or create `2.0.0.atria` early.

## 8. Acceptance matrix and required evidence

Use deterministic fixture setup to reach late-world conditions, and explicitly distinguish setup operations from UI clicks. A dedicated public test world may span 200 years for UI retrieval; it is not evidence of Gate C's 10,000 meaningful turns. Evidence must come from the real Native renderer/bridge, not static screenshots or an HTML mock pretending to be runtime.

| Scenario | Required visible behavior and assertion |
| --- | --- |
| Opening regression | Six ordinary creation steps, Composer, acquired evidence, independent Hearing terms, advice and save remain usable through new navigation |
| Century retrieval | Create early public letter/contract and mark; compact/advance using Native fixture; UI query by year/entity retrieves original ID/date/source, consequence and mark |
| Query bounds and privacy | Pagination stays bounded; changed filter/revision resets cursor; no hidden fact appears via direct ID, search, detail or relation |
| Families after decades | Two or more generations, widowhood/adoption where public, deceased age/status and office successor readable without a sprawling graph |
| Institutional/place change | Known old/new names, merger/split/dissolution or place reuse and causal successor links; closed entities are not active targets |
| Artifact chain | Copy/custody/status links retain source after compaction; latest-links truncation explicit; destroyed artifact cannot be copied |
| Fast-forward | Real multiyear request with six stances; reviewed target; actual high-impact interrupt; requested/resolved distinction; explicit new review of remaining interval |
| Stance-only update | Zero-minute policy commit persists through Save/Restore and does not advance clock; invalid/partial enum policy does not publish |
| Identity / reconstruction | Persistent protagonist unchanged across public identity/absence/return; three age concepts separate; known asset/office costs remain |
| Delegation drift | Routine reports grouped; genuine policy and escalation edits; known failure/refusal/succession visible while concealed runtime facts remain hidden |
| Regions / Era | Read-only inspection does not move player; real travel/relocation changes time/base; return shows changed region and local Era consequences |
| Empty-state play | No family, no organization and no matching history remain comprehensible without blocking ordinary investigation |
| Failure / reconciliation | Double click, stale review, failed narration, unknown commit, late read and epoch renewal cannot duplicate writes or fake success |
| Save / Restore / Retry | Real container export/import into fresh store preserves marks/policies/entities; stale cursors reset; old checkpointed reply Retry explained, new reply Retry still valid |
| Layout and input | 375/390/768/1024/1440 widths, compact landscape, 200% root text, long dates/names, keyboard, reduced motion and dark OS preference; no content clipping/overlap or hidden focus |

Retain browser screenshots for early Field notes, late Chronicle/detail, a public family lineage, interrupted fast-forward and regional return at wide and compact widths. Browser tests should assert real state changes, focus return, no duplicate mutation and actual overflow rather than only screenshot existence. Inspect the rendered screenshots; preserve logs and exact Package/Core tested HEADs in the same Record. Physical touch-device, screen-reader, hosted-model and Android evidence are separate claims and only reported if actually exercised.

Phase 7 exits only when all implemented flows above have appropriate actual runtime/browser evidence and no unresolved player-facing authority gaps. Phase 8 retains Gate A/B/C, the full Save/Restore matrix, multi-seed stress and final release ownership.

## 9. Phase 7 bootstrap prompt

```text
Continue refactor/original-occult-western-fantasy-long-lived-world on its existing
Package branch. Execute Phase 7 only after actual Phases 5–6 completion; this design
refinement did not implement them or advance the current Phase 4 stop boundary.

Read current Package AGENTS, real Git refs, docs:HANDOFF.md, Plan index,
implementation-staging.md, player-facing-experience.md, verification.md and the
same Record's relevant completion sections. Then read completed long-life runtime
contracts and existing frontend/compiler/checker files. Apply frontend-design,
ui-ux-pro-max and emil-design-eng using installed Skills or skills:SKILLS.md for
remote execution. The visual direction and page/default/state decisions are fixed
by player-facing-experience.md; do not begin another exploratory redesign.

Preserve the marine/paper field register and immediate investigation. Implement
Field notes / Chronicle / Arrangements, bounded public historical/entity details,
exact dates/provenance/memory, structured time/stances, identity/longevity,
delegation/organization and regional travel. Resolve actual safe bridge gaps with
minimal compatible Core support; do not invent frontend authority, calendar,
scheduler, persistence or private-state access. Preserve invocation reconciliation,
checkpoint/Retry and existing Host Composer/SaveSystem. Use actual Phase 5–6
contracts, not guessed names from this Plan.

Follow the implementation sequence and acceptance matrix. Extend existing model
and real Native browser checks, inspect rendered wide/compact/large-text results,
record only actual evidence and exact tested heads. Preserve releases/1.0.0.atria.
After validation, push the same branch, update the same Record and live HANDOFF,
provide the Phase 8 prompt and STOP before final integration/release.
```
