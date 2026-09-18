# Atria Agent Web Access & API Fallback

## Status

Implementation completed on the task branch and validated through the normal Atria web/Node gates. PR #6 is the integration pull request into `main`.

## Task identity

- Repository: `ZZZdragondYNGPHX/Atria`
- Task branch: `feat/agent-web-access-api-fallback`
- Original task baseline: `main@b84d411431e72be39099cba1a0a42cde9052c778`
- Latest main synchronized before integration: `a32a2c4e815cb9e9590f303b36423f6e959d8076`
- Final task-branch head before merge: `af157c8dd79c358c8e56921d5d0a81e82fc3da5d`
- Formal implementation plan: `docs/plans/agent-web-access-api-fallback.md`
- Pull request: #6 — `feat: make Web Access agent-native with API fallback`

## Goal

Turn Search Tools from a workflow stage that is expected to run before every reply into an independent Web Access capability that Atria agents can call only when external information is actually useful.

At the same time, upgrade the Workspace Default API profile from a configuration inheritance fallback into a real runtime provider fallback for orchestration agents.

The implementation preserves a lightweight path for users who disable orchestration entirely.

## Web Access architecture

Search Tools remains an independent Atria extension and continues to own:

- search-provider configuration;
- web search execution;
- page visit/extraction;
- main-model function tools;
- the optional pre-request research agent.

Orchestrator consumes that service through its existing Layer-2 extension-tool registry.

### Main-model web access

The existing main-chat tools remain independent:

- `atri_web_search`
- `atri_web_visit`

Users can expose these to the main chat model without enabling Agent Orchestration.

This is the lightweight path for users who want web access but do not want the full multi-agent runtime.

### Agent web access

The orchestration-facing tools remain:

- `search_search`
- `search_visit`

They are now presented as the **Web Access** capability group in the Agent & Memory Workspace.

Agents decide when to call them. Search is no longer architecturally tied to a mandatory pre-generation stage.

### Automatic pre-request research

The old pre-request Search Agent is retained for specialist/high-cost workflows.

It is repositioned under an Advanced section in Search Tools settings and is no longer presented as the recommended Atria path.

The primary flow is now:

```text
user turn
  -> orchestration agent reasoning
       -> optional Web Access tool calls only when needed
  -> main result / reply
  -> memory pipeline
```

rather than forcing a dedicated web-search agent before every reply.

## Run-scoped Web Evidence Cache

A run-scoped evidence cache was added to the orchestration tool context.

Properties:

- identical `search_search` calls in one orchestration run share one provider request;
- identical `search_visit` calls in one orchestration run share one page fetch;
- concurrent duplicate requests share the same in-flight promise;
- failed requests are evicted so later calls can recover;
- semantically equivalent calls normalize provider defaults before cache-key construction;
- cache lifetime is one orchestration run only;
- no persistent cross-turn web cache is introduced.

The cache is transport/runtime optimization only.

A cache hit does **not** silently inject evidence into another agent. The second agent must still call the tool. It then receives the cached tool result through its own tool-message history.

This preserves the existing Spec / Agenda / Director information-flow boundaries instead of introducing a global web-context channel.

Director main-agent and sub-agent tool contexts were updated to share one run object so their Web Evidence Cache is truly run-scoped rather than recreated per tool call.

## Provider availability

Search Tools exposes provider availability through its Atria API.

The Workspace can distinguish states such as:

- Web Access available via DuckDuckGo;
- SearXNG unavailable because no instance URL is configured;
- Brave Search unavailable because the API key is missing.

The Search Tools main-model enable flag and pre-request-agent flag do not gate orchestration tool availability. Agent permission is controlled by the Agent Workspace tool policy, while provider readiness is controlled by Search Tools.

## Default Web Access policy

Atria uses least-privilege factory defaults.

- ordinary drafting / synthesis / critic agents do not receive Web Access by default;
- new Loop / Spec / Agenda Workspace factories explicitly start with Web Access off;
- the dependency-light Minimal Director Workspace factory remains the Workspace default and does not contain `canon_scout`;
- the Full Director factory retains `canon_scout`, with `search_search` and `search_visit` explicitly enabled on that specialist;
- users can enable or disable Web Access for any agent from the Workspace.

Existing saved user presets are not bulk rewritten.

## Canon scout policy

The default `canon_scout` guidance was tightened.

It should use public web search for:

- public-IP / canon verification;
- real-world facts;
- public external information;
- time-sensitive information.

It should not search merely because an original-fiction character or world is underspecified. Missing private fictional context is not evidence that the public web contains the answer.

## Workspace changes

The Agent Inspector now treats the two search tools as **Web Access** rather than a generic Search group.

The Workspace also distinguishes:

- **Primary API profile** — agent-specific route;
- **Default API profile · runtime fallback** — inherited route and runtime fallback.

The default API explanation now states that:

1. an agent with no primary route inherits the Workspace default;
2. an agent with a different explicit primary route uses that route first;
3. eligible provider/transport failure can retry through the Workspace default.

New labels are localized for simplified and traditional Chinese.

## Runtime API fallback

The fallback policy is centralized in:

- `public/scripts/extensions/orchestrator/api-fallback.js`
- the Orchestrator-specific `tool-calling.js` facade.

The shared iteration tool runner remains provider-agnostic so CPA / CEA / Memory Graph do not accidentally inherit orchestration routing semantics.

### Resolution

No per-agent API:

```text
Workspace Default API
  -> result / error
```

Explicit per-agent API:

```text
Primary API
  -> existing retries on the primary route
  -> if eligible failure and Default API differs
       -> Workspace Default API
  -> result / error
```

The same API name is never called a second time merely because it is also configured as the fallback.

### Eligible failures

Fallback is allowed for provider/transport conditions such as:

- rate limit / HTTP 429;
- provider overload / unavailable;
- HTTP 5xx;
- timeout;
- network / DNS / connection reset/refused failures;
- abnormal empty provider response.

### Non-fallback failures

Atria does not switch API for deterministic or user-driven failures such as:

- Stop / abort;
- context budget or context-window exhaustion;
- invalid request/profile input;
- missing/invalid authentication configuration;
- malformed tool-call arguments;
- JSON schema violations;
- orchestration validation errors.

## Runtime coverage

Fallback routing is integrated across:

- Loop;
- Spec workers and review nodes;
- Agenda Planner;
- Agenda workers/finalizer;
- Director main agent;
- Director sub-agents;
- Engine arbitration nodes.

Director keeps its existing streaming transport and retry behavior; fallback is added after the primary transport retries are exhausted instead of replacing the streaming path.

## CI / validation policy change

Per explicit project direction, Android and Docker builds are no longer default development validation.

Repository automation was changed accordingly:

- Android Debug APK no longer builds on every `main` push;
- Android APK workflow remains available manually and for explicit tag releases;
- Android JVM tests were removed from default PR Checks;
- a manual `Android JVM Tests` workflow was added;
- Docker image publishing is now manual-only;
- `AGENTS.md` records Android build/test and Docker build/extra validation as opt-in.

The Node unit workflow still uses its existing database service containers; this is test infrastructure, not a Docker image build/publish step.

## Validation

The implementation was exercised through:

- ESLint;
- complete Node unit suite;
- Atria Migration Guard;
- Workspace information-architecture guard;
- Workspace projection Chromium smoke;
- Workspace UI Chromium smoke;
- dedicated API-fallback policy tests;
- runtime fallback integration tests that verify primary retries are exhausted before switching routes;
- Search Tools orchestration tests for provider availability, same-run concurrent deduplication, cross-run isolation, and failure eviction;
- Workspace factory tests for least-privilege Web Access defaults.

Android and Docker build validation are intentionally not required by default under the current project policy.

## Main synchronization

During development `main` advanced with PR #5 (Termux main-branch pinning).

Before integration, that commit was merged into the task branch. The two Termux files from current `main` were preserved exactly, and the task branch reached zero commits behind `main` before final validation.
