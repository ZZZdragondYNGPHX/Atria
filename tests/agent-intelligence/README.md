# S01 Agent Intelligence baseline

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
runtime evidence are restored; Runtime checkpoint and Task persistence are not
claimed. The existing util API cannot unset a previously unset config path, so
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
S01 has no configured standalone live bridge, does not choose a paid route, and
never silently substitutes scripted trials. Its model command is a readiness
report, not a live-model executor.

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

S04 Project task recovery and S05 retention/feedback are not implemented here.
S03 does not persist opaque continuation state or claim empirical model benefits.
