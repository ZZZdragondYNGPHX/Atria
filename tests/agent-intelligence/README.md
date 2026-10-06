# Agent Intelligence local evaluation

Test-only, synthetic cases and report v1. Nothing is registered in production;
there is no migration or improvement publication. Run serially in an isolated
Node/Jest process with the repository's existing locked dependencies.

```sh
node tests/agent-intelligence/baseline.mjs --output /tmp/s01-report.json --measurements /tmp/s01-measurements.json
node tests/agent-intelligence/baseline.mjs --validate /tmp/s01-report.json --measurements /tmp/s01-measurements.json
node tests/agent-intelligence/baseline.mjs --mode model --output /tmp/s01-pilot-state.json
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence
```

Output targets must be new files; the command refuses to overwrite existing
files. Generated reports stay outside Git. Serialization/collection failures
are errors or failed/incomplete trials, never silent drops. The consumer checks
schema, fixed case revisions, references, variant partitions, configuration,
evidence comparisons, counters and aggregates. It checks evidence consistency;
it does not authenticate independently supplied reports.

## Cases and consumers

`cases.js` exports six development and six promotion cases, with separate
synthetic inputs and fixed fixture/rubric/environment hashes. Revision changes
require an explicit case-set change. `selectCases` and `loadFixture` require a
purpose and split; extraction rejects promotion fixtures. This is the shared
consumer's split guard, not a security sandbox for code with filesystem access.

`runner.js` executes all 12 cases exactly once through `adapters.js`:

- RP: `runMainAgentLoop` → current Director Engine / AgentRuntime → injected
  scripted generation → per-run tools → message takeover / finalization.
  The captured request includes fixture-visible promise revisions. A private
  clue is withheld by the fixture; this does not test the production Memory
  resolver. Aborted v1 generation receives a late response after committed v2.
- Project: `runNativeStudioAgentTask` → existing `executeNativeGeneration` and
  `nativeStudioClient` → isolated fetch bridge → `ProjectAgentService` →
  `StudioService` Workspace / validation / Preview / simulated dry-run / Review.
  The bridge routes actual tool calls to real services and denies unrecognized
  requests (including model Commit). An explicit fixture reviewer commits after
  Review. Conflict retains the human revision. Repair d1 blocks after two actual
  validation failures; p1 fixes the proposal and reaches Review after one.

Every Project uses `makeTempFsEngine`, with a neighboring unrelated synthetic
Project hashed before/after. Services receive only fixture directories; no
production owner/project is loaded. Foreign task ownership is checked. Cleanup
verifies the runner-owned root and marker. RP hashes the player message before/
after and uses distinct run/request/variant anchors. Globals and presentation
runtime evidence are restored. S01 itself made no persistence claim; its Project
adapter now consumes the S04 async durable task and idempotent receipt APIs while
retaining the same cases and observed model/tool counts. The existing util API
cannot unset a previously unset config path, so
this dedicated process retains the repository default when it began without
config. No user config or Secret discovery is performed by the runner.

## Evidence and gaps

Deterministic checks, final-text availability, Review, authority, execution and
behavior grading are separate. Scripted replies are not behavioral gold answers.
All behavior dimensions are `not_run`; no model judge or human preference is
invented. Scripted generation/tool counts are observed at the injected transport/
actual tool boundary. No provider is contacted. Provider usage, economics,
upstream identity and exact Prompt/Skill/Preset pinning are unavailable, not
reported as zero tokens or exact configuration. `knownTokens` sums only known
records; `totalTokensStatus=unavailable` prevents treating that subtotal as a
complete cost. Scripted results always have `empiricalReady=false`.

The optional sidecar has its own strict schema v1 and report hash. Its call graph
contains observed request order (`callIndex`), entrance and foreground execution.
Target, upstream, actual root/child/attempt identity, TTFT, token subdivisions and
price remain listed as missing. A call index is not a provider retry identity.
Current production Director may dispatch workers and perform transport retries /
fallback; Studio may execute multiple model/tool rounds and retain provider state.
This scripted graph is a baseline observation, not a replacement for those paths
or an ordinary-RP one-call SLO.

## Model pilot and budget

The model command retains all six development pilot slots (RP agency and Project
authoring, three trials each). Without finite config it records `budget_blocked`.
`--pilot <file>` validates finite `maxRequests` (≤36, or ≤42 with `modelJudge=true`)
and `maxTotalTokens`; limits alone record `configured_generation_bridge_unavailable`.
The original baseline CLI remains a readiness consumer without a supplied bridge.
The explicit S06 live CLI below uses the original Native resolver/compiler/provider
and Studio Generation Host; it never silently substitutes scripted trials.

`PilotBudget` is a tested, test-only reservation ledger for the future existing-
generation bridge: input preview/count plus reserved output before each send,
six ordinary calls per trial, shared pilot cap for model/retry/fallback/grader,
unknown/cancelled usage retaining the upper bound, and no double settlement.
It is not installed in production RunControl. Scripted adapters enforce their
six-request limit before releasing a scripted response.

Before S06 comparisons and S10 automatic enablement, supply an explicitly finite
pilot and exact generation configuration, connect observation/reservation at the
existing RP and Studio generation boundaries, then run the six real development
trials and the independent promotion baseline. Capture real usage and any gateway
uncertainty. Current scripted reports do not satisfy that empirical checkpoint.

## S02 source contract and consumers

The production `AgentEvidenceService` export from `src/native/index.js` accepts
Host-owned `chatRepo`, `sessionCore`, `studio` and `agent` services. RP sources use
the existing ChatRepo (ordinary chat) or current SessionCore / Task Artifact
authority (Native); Project sources use Studio revisions and ProjectAgentService.
It provides callable read-only consumers for subsequent capture stages:

```js
const service = new AgentEvidenceService({ chatRepo, sessionCore, studio, agent });
const budget = { maxSources: 8, maxBytes: 32768, maxScanMessages: 128 };
const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'chat', isGroup: false, groupId: '' };
const set = await service.capture(authenticatedHandle, scope,
    [{ kind: 'message', messageId: persistedMessageId, floor: 0 }], budget);
const evaluation = await service.evaluate(authenticatedHandle, scope, set, budget, { expand: true });
```

The handle and expected scope come from the consuming Host boundary, independently
of the submitted EvidenceSet. Sets contain only exact references and hashes;
caller JSON cannot assert trusted/current status or supply an authoritative body.
Evaluation v1 reports source validity, with per-reference missing/stale/denied/
unavailable/budget_blocked states. Expanded content is returned only when every
source passes a coherent scope read and final recheck. This result is a reading
observation; future use revalidates it. It is not a behavior grade or promotion.

`maxBytes` counts UTF-8 JSON bytes prepared for expansion, including prepared
content later withheld on failure. `maxScanMessages` counts the message batches
read for lookup and recheck. Neither budget claims to limit the original authority's
full storage IO, provider tokens, or Task Artifact's separate dependency scanner.
S02 adds no automatic runtime subscriber, persistent evidence resource, HTTP/UI
surface or migration. Durable RP capture and Project recovery remain S03/S04.

Run the minimal source/authority checks locally:

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/sources.test.js tests/native/task-artifact-consumption.test.js tests/native/project-agent.test.js
```

The source suite uses isolated FS/SQLite chats and Native Sessions, real Studio
Review/commit on fictional Projects, and an explicit in-memory Native Artifact
authority fixture. It performs no network/model calls or production-user reads.

## S03 durable RP capture

`atri_agent_evidence` is an additive Native storage resource keyed by authenticated
handle and a SHA-256 scope/run identity. It uses the existing FS/SQL resource
handlers, CAS, backup and migration paths. An unfinished `capturing` marker is
incomplete after restart; it never resumes a model call or authority effect.

The RP observer records a bounded metadata prefix (512 events / 256 KiB), with
explicit missing markers. Prompt, tool arguments/results, reasoning payloads and
credentials are excluded. Browser records are `client_observation`. Director
output binding waits for the original generation save, then the server re-reads
its exact message/variant/content hash. Capsule-only runs and unsaved/cancelled
outputs remain incomplete when no output binding exists. Missing legacy message
IDs or transport failures are exposed through `getCurrentRun().evidenceCapture`.

The production Native Host captures Turn and standalone Task requests, send
attempts and lanes, followed by formal Session receipts. A capture write failure
after finalization returns a separate failed capture status and preserves the
committed result. Task receipt inspection reads metadata without expanding an
operation artifact. Directly reported usage survives provider normalization;
absent counters and settled cost remain unknown. `host_facade` observations do
not claim to count opaque provider/gateway retries.

The authenticated `/api/native/generation/evidence/{begin,update,inspect,delete}`
POST endpoints are metadata consumers. Client input cannot select `host` origin,
set owner or submit a formal outcome. For a trusted Host consumer:

```js
const repository = new AgentEvidenceRepository({ engine });
const result = await repository.inspect(authenticatedHandle, evidenceId, service,
    { maxSources: 8, maxBytes: 32768, maxScanMessages: 128 });
// result.captureStatus and result.validity are separate from model quality.
```

Minimal local capture checks (FS/SQLite; excludes unavailable external DB suites):

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/capture.test.js tests/native/task-runtime-p3.test.js --testNamePattern='^(?!.*(?:MysqlEngine|PgEngine)).*$'
```

S03 leaves Project recovery to S04 and retention/feedback to S05.
S03 does not persist opaque continuation state or claim empirical model benefits.

## S04 durable Project recovery

`ProjectAgentService` uses `ProjectTaskRepository` on the existing StorageEngine
and `atri_project_agent_task` keyed by authenticated handle / projectId / taskId.
Its public APIs are async, including task reads, plan updates and takeover.
The persisted task keeps exact proposals / Workspace, validation / Review,
bounded attempts / timeline, complete public conversation rounds and commit
intent. Limits are 2 MiB JSON, 128 attempts / messages and 1024 timeline events;
invalid versions, integrity/CAS conflicts or overflow fail explicitly.
Before the formal Git write, the task checks capacity for the complete receipt
and its recovery events; overflow restores the dry-run source and keeps Review.

Studio's formal Git commit carries the exact Workspace hash, base and validation
receipt. Task storage failure or response loss after that commit reconciles the
same receipt; repeated Commit returns it without applying operations again.
Recovery reads at most 200 history entries. Missing receipt with unchanged base
returns to Review; changed base or unverifiable receipt becomes conflict.
No recovery automatically sends a model request, rebases or commits. Historical
Preview handles are observations, not reopened Preview sessions.

The browser restores its conversation from the task API. Provider-private state
is excluded from persistence; resumed model context uses public tool observations
and current task authority. The live loop preserves its existing provider state.
Generation Host binds new-client attempt IDs to actual requests, visible sends,
snapshot hashes and directly reported usage; missing counters remain null.
Legacy requests lack this binding, and observation-save failure returns separate
failed capture metadata without repeating the generation. Neither conversation
nor model text grants a formal-write permission.

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/project-recovery.test.js tests/native/project-agent.test.js tests/native/project-agent-http.test.js tests/agent-intelligence/sources.test.js
node tests/frontend/project-agent-recovery.smoke.mjs
```

The recovery suite physically reopens temporary FS/SQLite engines, exercises real
builtin/system Git and Studio commit boundaries, injects persistence/response
failures, and uses synthetic provider responses with the actual Host. External
MySQL/PostgreSQL coverage is a generic kind/key contract only. The Chromium smoke
uses an isolated SQLite/Git/HTTP fixture and the real panel for reload, restored
Review/conversation, commit-save failure recovery, completed and conflict states.
It makes zero model requests; it is not a full application/device check.

The new kind is additive, without DDL or legacy-task backfill. Task and Project
HTTP deletion clean up through the existing resource API; missing Projects cannot
release task evidence. FS ordering is limited to one Host writer. Retention,
feedback and lesson cascades remain S05.

## S05 feedback and diagnosis lifecycle

`AgentExperienceService` is the authenticated, shared RP / Project consumer at
`POST /api/native/generation/experience/<action>`. Start with `target` and
`{kind: 'evidence'|'project_task', id, scope}`; it returns the Host-derived
exact target hash and subject without expanding content. `inspect` accepts
`{scope, subject}`. `submit` accepts `{target, feedback, expectedSequence}`;
use null for a new scope and the returned ledger sequence for subsequent writes.
The feedback shape is `{kind, signal, dimension, note}`. Explicit correction /
prefer / avoid is separate from observation regenerate / edit / abandon /
accept / review_reject (empty note). `outcome` accepts only target and sequence;
the Host derives validation / committed / failure / unknown from the source.

`reflection` returns an event or aggregate batch, exact feedback refs and hash,
with zero model calls. `diagnose` requires that batch hash, scope / subject,
expectedSequence, public rationale, conditions, counterexamples and direction.
The diagnosis is a user hypothesis. Weak observations alone can only yield an
undetermined direction; repeated observations of one source cannot fabricate
an aggregate. Exact sources are revalidated before every consumption.

`correct`, `withdraw`, and `delete` take scope / subject / feedback id and
expectedSequence (correct also takes new explicit feedback). Correction and
withdrawal revoke related diagnoses; deletion physically removes them.
`withdrawDiagnosis` / `deleteDiagnosis` independently revoke / remove a
hypothesis. `export` returns bounded public notes and metadata only.

`retention` sets 1–365 days (default 30), immediately tightening existing expiry;
extending never revives expired data. `purge` explicitly reconciles expiry and
source deletion; ordinary writable inspection also reconciles. Read-only
inspection filters expiry without persisting. `deleteScope` removes the ledger.
`purgeSources` takes `{scope, days, limit}` (1–365 days, 1–128 items), explicitly
cleans old evidence and terminal completed / cancelled / taken_over Project
tasks, and preserves active / Review tasks and Project source. CAS protects
source changes during cleanup. No app-closed timer or automatic model work is
registered; StorageEngine may load a full resource list before the bounded
selection. New feedback UI and candidate publication are later-stage work.

Run only the affected local cases:

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/feedback.test.js tests/agent-intelligence/capture.test.js tests/agent-intelligence/project-recovery.test.js tests/agent-intelligence/sources.test.js tests/native/project-agent-http.test.js
```

The feedback suite uses real temporary FS / SQLite, physical reopen, dump /
restore and a generic FS → SQLite → FS resource roundtrip. RP / Project HTTP
requests use the real consumer and isolated sources; Native actor / branch
checks use a synthetic snapshot port, while existing source / recovery suites
retain their original real authority fixtures. MySQL / PostgreSQL assertions
cover generic kind / key registration only. No UI, external database, model,
build, device, or remote CI result is claimed.


## S06 paired comparison and explicit live connection

The comparison consumer accepts exactly one synthetic evaluator target:
`rpPrompt`, `projectSkill`, or `roundLimit` (1–6, changed from the baseline).
Prompt and Skill content reaches the existing Director / Studio request builders;
round limits reach the original loops. These are fixture settings, not published
versions or installed production bindings. Each arm gets a fresh chat / Project /
Workspace / task. The separate Native Session export/import check proves exact
save-copy isolation; RP generation currently runs the original Director with a
synthetic task context, not a production Session generation replay.

```sh
node tests/agent-intelligence/comparison.mjs --candidate /tmp/candidate.json --split development --repetitions 1 --output /tmp/comparison.json
node tests/agent-intelligence/comparison.mjs --validate /tmp/comparison.json
node tests/agent-intelligence/live.mjs --connection /private/test-connection.json --ledger /tmp/evaluation-ledger.json --phase pilot --trial-suffix :run1 --output /tmp/model-pilot.json
node tests/agent-intelligence/live.mjs --connection /private/test-connection.json --ledger /tmp/evaluation-ledger.json --phase comparison --candidate /tmp/candidate.json --split promotion --repetitions 1 --baseline /tmp/independent-baseline.json --output /tmp/model-comparison.json
node tests/agent-intelligence/live.mjs --connection /private/test-connection.json --ledger /tmp/evaluation-ledger.json --phase judge --comparison /tmp/model-comparison.json --output /tmp/model-judgments.json
```

The private connection file contains `apiKey`, exact `endpoint` (complete chat
completions URL), `model`, `tokenizer` (`cl100k_base` or `o200k_base`),
`contextTokens`, `maxOutputTokens`, `maxRequests`, `maxTotalTokens`, and
`timeoutMs`. The tokenizer is an explicit local estimate, not a verified gateway
model tokenizer. No key, header, provider response body, or local credential path
enters the report. Keep this file and all generated artifacts outside Git.
The live CLI enforces paths outside this worktree; output targets are exclusive.

Use the same ledger throughout pilot, comparison and retries. Reservations are
atomically persisted before send and settled after directly reported usage.
Transport cancellation / failure / missing counters retain the reserved upper
bound. Unknown gateway retries, upstream identity, price and TTFT remain unknown.
Provider usage above the local estimate records actual usage and blocks further
sends. A process crash retains unsettled reservations; it cannot silently reset
spend. The ledger has exclusive writer ownership; inspect an abandoned `.lock`
after checking its process before removing it. New pilot attempts require a new
explicit trial suffix. Comparison execution IDs are unique per invocation; all charges still share the
same cumulative ledger.

Live comparisons finish and persist every independent baseline slot before
starting candidates. Freeze the candidate first; do not adapt it using promotion
answers. Scripted comparisons counterbalance arm order across repetitions.
Case / fixture / input / rubric, actual evaluator source bytes, tested HEAD,
resource settings, request hashes, source / outcome, attempts and charges are
validated together. Budget exhaustion preserves every planned failed / blocked
slot. The progress JSONL and baseline sidecar permit inspection if collection
fails; incomplete output is not a successful report.

`blindPair` produces an evaluator-only pair for explicit human observations.
`recordJudgment` binds votes to both artifacts and envelopes; disagreement requires
review. This does not fabricate unrun behavior scores. The optional model judge makes one fresh, blind request per pair with both outputs,
using the same explicit connection and cumulative grader budget. Missing outputs
remain unavailable; malformed scores are retained without repair calls. Its strict
report binds the full comparison, rule, public inputs, confidence, 0–4 dimension
scores and actual usage. Failed authority remains visible. A single same-model
judge is a model observation; human preference and judge disagreement remain
unobserved until separately reviewed. It cannot authorize publication or fill the
original S01 ungraded behavior slots. Quality / cost promotion thresholds and
equivalent body / cognition / critic ablations are not yet implemented. Director scripted graph observation is available; unsupported
ablations stay unavailable. Comparison reports remain `empiricalReady=false` and
`publicationStatus=ineligible`, including when deterministic checks pass.

Minimal local verification:

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/comparison.test.js tests/agent-intelligence/baseline.test.js tests/agent-intelligence/live-bridge.test.js tests/agent-intelligence/runner-failure.test.js tests/agent-intelligence/judge.test.js
```
