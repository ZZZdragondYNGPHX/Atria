# Agent Intelligence local evaluation

Test-only, synthetic cases and report v1. Nothing is registered in production;
there is no migration or improvement publication. Run serially in an isolated
Node/Jest process with the repository's existing locked dependencies.

Output targets must be new files; the command refuses to overwrite existing
files. Generated reports stay outside Git. Serialization/collection failures
are errors or failed/incomplete trials, never silent drops.

## Cases and consumers

 Revision changes
require an explicit case-set change. `selectCases` and `loadFixture` require a
purpose and split; extraction rejects promotion fixtures.

`runner.js` executes all 12 cases exactly once through `adapters.js`:

- RP: `runMainAgentLoop` → current Director Engine / AgentRuntime → injected
  scripted generation → per-run tools → message takeover / finalization.
  The captured request includes fixture-visible promise revisions. A private
  clue is withheld by the fixture; this does not test the production Memory
  resolver. Aborted v1 generation receives a late response after committed v2.
- The bridge routes actual tool calls to real services and denies unrecognized
  requests (including model Commit). An explicit fixture reviewer commits after
  Review. Conflict retains the human revision.

 Services receive only fixture directories; no
production owner/project is loaded. Globals and presentation
runtime evidence are restored. S01 itself made no persistence claim; its Project
adapter now consumes the S04 async durable task and idempotent receipt APIs while
retaining the same cases and observed model/tool counts. The existing util API
cannot unset a previously unset config path, so
this dedicated process retains the repository default when it began without
config. No user config or Secret discovery is performed by the runner.

## Evidence and gaps

 Scripted replies are not behavioral gold answers.
All behavior dimensions are `not_run`; no model judge or human preference is
invented. Scripted generation/tool counts are observed at the injected transport/
actual tool boundary. No provider is contacted. Provider usage, economics,
upstream identity and exact Prompt/Skill/Preset pinning are unavailable, not
reported as zero tokens or exact configuration. `knownTokens` sums only known
records; `totalTokensStatus=unavailable` prevents treating that subtotal as a
complete cost. Scripted results always have `empiricalReady=false`.

 Its call graph
contains observed request order (`callIndex`), entrance and foreground execution.
Target, upstream, actual root/child/attempt identity, TTFT, token subdivisions and
price remain listed as missing. A call index is not a provider retry identity.
Current production Director may dispatch workers and perform transport retries /
fallback; Studio may execute multiple model/tool rounds and retain provider state.
This scripted graph is a baseline observation, not a replacement for those paths
or an ordinary-RP one-call SLO.

## Model pilot and budget

The model command retains all six development pilot slots (RP agency and Project
authoring, three trials each).
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
of the submitted EvidenceSet.
Evaluation v1 reports source validity, with per-reference missing/stale/denied/
unavailable/budget_blocked states. Expanded content is returned only when every
source passes a coherent scope read and final recheck. It is not a behavior grade or promotion.

`maxBytes` counts UTF-8 JSON bytes prepared for expansion, including prepared
content later withheld on failure. `maxScanMessages` counts the message batches
read for lookup and recheck. Neither budget claims to limit the original authority's
full storage IO, provider tokens, or Task Artifact's separate dependency scanner.
S02 adds no automatic runtime subscriber, persistent evidence resource, HTTP/UI
surface or migration. Durable RP capture and Project recovery remain S03/S04.

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/sources.test.js tests/native/task-artifact-consumption.test.js tests/native/project-agent.test.js
```

The source suite uses isolated FS/SQLite chats and Native Sessions, real Studio
Review/commit on fictional Projects, and an explicit in-memory Native Artifact
authority fixture. It performs no network/model calls or production-user reads.

## S03 durable RP capture

 It uses the existing FS/SQL resource
handlers, CAS, backup and migration paths. An unfinished `capturing` marker is
incomplete after restart; it never resumes a model call or authority effect.

The RP observer records a bounded metadata prefix (512 events / 256 KiB), with
explicit missing markers. Prompt, tool arguments/results, reasoning payloads and
credentials are excluded. Browser records are `client_observation`. Capsule-only runs and unsaved/cancelled
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

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/capture.test.js tests/native/task-runtime-p3.test.js --testNamePattern='^(?!.*(?:MysqlEngine|PgEngine)).*$'
```

S03 leaves Project recovery to S04 and retention/feedback to S05.
S03 does not persist opaque continuation state or claim empirical model benefits.

## S04 durable Project recovery

`ProjectAgentService` uses `ProjectTaskRepository` on the existing StorageEngine
and `atri_project_agent_task` keyed by authenticated handle / projectId / taskId.
Its public APIs are async, including task reads, plan updates and takeover.

 Task storage failure or response loss after that commit reconciles the
same receipt; repeated Commit returns it without applying operations again.
Recovery reads at most 200 history entries.
No recovery automatically sends a model request, rebases or commits. Historical
Preview handles are observations, not reopened Preview sessions.

The browser restores its conversation from the task API. Provider-private state
is excluded from persistence; resumed model context uses public tool observations
and current task authority. The live loop preserves its existing provider state.
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

The new kind is additive, without DDL or legacy-task backfill. Task and Project
HTTP deletion clean up through the existing resource API; missing Projects cannot
release task evidence. FS ordering is limited to one Host writer. Retention,
feedback and lesson cascades remain S05.

## S05 feedback and diagnosis lifecycle

`AgentExperienceService` is the authenticated, shared RP / Project consumer at
`POST /api/native/generation/experience/<action>`.
The feedback shape is `{kind, signal, dimension, note}`.

The diagnosis is a user hypothesis. Weak observations alone can only yield an
undetermined direction; repeated observations of one source cannot fabricate
an aggregate.

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

Local command:

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/feedback.test.js tests/agent-intelligence/capture.test.js tests/agent-intelligence/project-recovery.test.js tests/agent-intelligence/sources.test.js tests/native/project-agent-http.test.js
```

The feedback suite uses real temporary FS / SQLite, physical reopen, dump /
restore and a generic FS → SQLite → FS resource roundtrip. RP / Project HTTP
requests use the real consumer and isolated sources; No UI, external database, model,
build, device, or remote CI result is claimed.

## S06 paired comparison (legacy fixture consumer)

The comparison consumer accepts exactly one synthetic evaluator target:
`rpPrompt`, `projectSkill`, or `roundLimit` (1–6, changed from the baseline).
Prompt and Skill content reaches the existing Director / Studio request builders;
round limits reach the original loops. These are fixture settings, not published
versions or installed production bindings. Each arm gets a fresh chat / Project /
Workspace / task. RP generation currently runs the original Director with a
synthetic task context, not a production Session generation replay.

The old `live.mjs` consumer and cumulative evaluation budgets are historical
fixtures, not current API-test instructions.

`blindPair` produces an evaluator-only pair for explicit human observations.
`recordJudgment` binds votes to both artifacts and envelopes; disagreement requires
review. This does not fabricate unrun behavior scores. The optional model judge makes one fresh, blind request per pair with both outputs,
using the configured connection. Missing outputs remain unavailable; malformed
scores remain invalid and cannot count as quality evidence. Its strict
report binds the full comparison, rule, public inputs, confidence, 0–4 dimension
scores and actual usage. Failed authority remains visible. A single same-model
judge is a model observation; human preference and judge disagreement remain
unobserved until separately reviewed. It cannot authorize publication or fill the
original S01 ungraded behavior slots. Quality / cost promotion thresholds and
equivalent body / cognition / critic ablations are not yet implemented. Director scripted graph observation is available; unsupported
ablations stay unavailable.

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-intelligence/comparison.test.js tests/agent-intelligence/baseline.test.js tests/agent-intelligence/live-bridge.test.js tests/agent-intelligence/runner-failure.test.js tests/agent-intelligence/judge.test.js
```

 RP Agent, Native narrative
and Studio preparation carry the exact version through always instructions,
on-demand reads, file listings and search. Accepted RP workers share versions in
one run; a new preparation sees current files. Missing or corrupt history fails
closed. Deletion revokes pins; name rename starts a new declared identity.

 The
original `file`, `files` and `search` GETs accept `version`; management reads may
omit it. This manual edit authority does not grant
Evaluation eligibility or automatic promotion. Original Package content remains
read-only; internal first installation is preserved.

Snapshot history is bounded to 64 versions / 64 MiB raw file bytes per Skill and
64 candidates (each at most 2 MiB serialized metadata). Existing pins remain
readable in read-only mode; new snapshots and all mutations require writable
storage. Serialization supports one Host writer per user root. Multiple Hosts or
out-of-band editors do not share the queue; content identity does not detect ABA.

The S06 Project evaluator fixture now installs its instructions through the real
Skill repository and reads the same pinned version through its restricted bridge.
Historical model reports retain their original source identities. S07 makes no
new model requests and does not change their ineligible promotion state.

## Local learning metadata and prompt optimization

`POST /experience/export-learning` uses the authenticated Generation router and
accepts `{scope, subject, expectedSequence, purpose: "offline-analysis"}`. It
returns `atria-learning-trajectory` v1 metadata, without conversation text,
feedback notes, private reasoning or credentials. Downloaded copies cannot be revoked by the application.

Analyze downloaded files without starting Atria:

```sh
node scripts/analyze-learning.js -- export.json another-export.json
```

The CLI accepts 1–32 local files of at most 256 KiB each.

`POST /evolution/start-learning` separately requires `purpose:
"prompt-optimization"`, backend `native-prompt-optimizer-v1`, the trajectory,
scope, subject and the current Evolution `expectedSequence`. The server compares
the complete metadata against current owner-authorized Experience. Only existing
`review` policies for `workspace-prompt` and `project-prompt` are supported.
Downloaded JSON cannot introduce prompt bodies, labels, owners or new authority.
An ordinary completed job is never retroactively marked as a learning job.
Existing inspect, label, publish and rollback endpoints retain their meanings.

Relevant local tests are `learning-trajectory.test.js`, `learning-cli.test.js`,
`learning-optimizer.test.js` and the S33 HTTP cases in `feedback.test.js`.
Synthetic evaluators in these tests prove lifecycle behavior, not model quality.

The disposable live consumers below use `private-test-run.js` and the configured
local `atria.private.directory`. Model runs share its quota lock and must run
serially. They print metadata and retain failed costs, then remove temporary
fixtures and raw model material. Without `--live`, the model scripts only prepare
their inputs and make no provider requests.

```sh
node tests/agent-intelligence/m4-live.js --local
node tests/agent-intelligence/s21-longitudinal-live.js --live
node tests/agent-intelligence/s23-live.mjs --live
node tests/agent-intelligence/s25-live.js --live
node tests/agent-intelligence/s26-live.js --live
node tests/agent-intelligence/s27-live.js --live
node tests/agent-intelligence/s34-live.js --live
```

S21 longitudinal commits six real turns, saves after the third, imports the save
into SQLite and continues with the inherited history and compute ledger. Its
model observation covers one authored sequence, not general long-term autonomy.
M4 compares two valid deterministic alternatives through real Session authority
and Studio Review/Git receipts; it does not measure independently sampled agent
decisions. S25 compares an ordinary direct turn with an authored background Task
whose advisory is consumed through the original projection, and reports the
actual quality floor and additional cost without assuming a slow-path gain.
S26 uses the optional private `api-retrieval.json` connection for actual rerank
and Embedding, compares fixed and reserved request budgets, and preserves unknown
local work. A tight-budget exhaustion control is separate from the valid paired
comparison with sufficient budget; Embedding availability is not a benefit claim.
S27 compares the original undeclared text path with an authored
ExpressionPlan and reports a blind model observation. S34 runs one development
pair per domain through the original optimizer and isolated worker. Its report
does not satisfy the independent production promotion gate, fabricate human
labels or publish a candidate.
