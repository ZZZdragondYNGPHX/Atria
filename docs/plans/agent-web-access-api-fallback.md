# Agent Web Access & API Fallback

## Goal

Evolve Atria Search Tools from a mandatory pre-generation search stage into an independent web-access capability that agents can invoke only when external information is actually needed, while keeping lightweight non-orchestrated use available.

At the same time, make the orchestration-wide Default API profile a real runtime fallback for agent transport/provider failures.

## Product decisions

### Web access architecture

Search Tools remains an independent extension and provider owner. It is not moved into Orchestrator.

It exposes three consumption paths:

1. **Main-model web access**
   - Existing `atri_web_search` / `atri_web_visit`.
   - Works when orchestration is disabled.
   - Controlled by Search Tools main-model exposure.

2. **Agent web access**
   - Existing Layer-2 tools `search_search` / `search_visit`.
   - Treated as first-class per-agent capabilities.
   - Agent decides whether external lookup is needed.
   - Raw search/visit results stay local to the calling agent's tool-message history.
   - Downstream agents receive only normal orchestration outputs through existing Spec / Agenda / Director dataflow.

3. **Automatic pre-request research**
   - Existing pre-request Search Agent is retained for specialist workflows.
   - It is an Advanced opt-in path and remains disabled by default.
   - It is no longer presented as the recommended/default Atria workflow.

### Web result reuse

Add a run-scoped Web Evidence Cache:

- de-duplicate identical searches and page visits during one orchestration run;
- cache is transport/runtime optimization only;
- cached evidence is never silently injected into another agent's prompt;
- another agent must call the tool to receive the cached result;
- expose cache-hit/source activity through runtime diagnostics where practical.

No persistent cross-turn web cache is introduced in this task.

### Default Web Access policy

Least-privilege defaults:

- `canon_scout`: web search + page visit enabled by default.
- Fact/canon/research agents may be explicitly enabled by preset authors.
- `plot_brainstormer`, `voice_critic`, ordinary drafting/synthesis agents: disabled by default.
- User can toggle web tools per agent in Workspace.

Web-search guidance is unified:

- use web access for external public facts, current/time-sensitive facts, real-world information, and public-IP/canon verification;
- do not web-search merely because an original-fiction character/world is underspecified.

### API fallback

`llmNodeApiPresetName` remains the Workspace **Default API profile** and gains runtime-fallback semantics.

Resolution:

- no per-agent API: use Default API profile;
- per-agent API succeeds: keep it;
- per-agent API fails with an eligible provider/transport failure: retry via Default API profile if it is configured and different;
- if fallback also fails: surface the failure;
- if primary and fallback names are identical: never duplicate the call.

Eligible fallback failures include transport/provider conditions such as rate limiting, provider overload/unavailable, HTTP 5xx, timeout/connection failures, and abnormal empty transport responses.

Do not switch API for:

- user abort/Stop;
- context-budget/token-limit failures;
- tool/schema/argument errors;
- orchestration logic errors;
- deterministic prompt/profile validation failures.

Same-API retry policy remains intact. Fallback happens only after normal retries for the primary route are exhausted.

Fallback attempts must be observable in runtime trace / Run UI where practical.

## Workspace UX

Preserve the new Agent & Memory Workspace architecture.

Adjust rather than redesign:

- group `search_search` / `search_visit` as **Web Access** in the Agent inspector;
- surface provider availability/status where possible;
- keep per-agent toggles authoritative;
- retain Workspace Default API profile and clarify it also acts as runtime fallback;
- Run/Diagnostics should expose primary failure → fallback success/failure when runtime trace supports it.

Search Tools settings are conceptually grouped into:

- Main model web access;
- Provider;
- Advanced automatic pre-request research.

## Implementation principles

- Reuse existing Search Tools provider/API and Orchestrator Layer-2 registry.
- Do not create a second web-search subsystem.
- Reuse existing orchestration output/dataflow; no global evidence prompt injection.
- Add only run-scoped deduplication.
- Centralize API fallback classification/routing so Loop, Spec, Agenda and Director do not drift.
- Preserve existing user settings unless a setting is merely being relabeled/repositioned.
- Keep Search Tools functional when Orchestrator is disabled.

## Validation

Targeted:
- Search Tools tool registration and provider tests.
- Orchestrator tool permission/default tests.
- Loop / Spec / Agenda / Director runtime API-routing tests.
- Workspace agent editing + UI smoke tests.
- New web-cache tests.
- New API-fallback classification/routing tests.

Broad:
- ESLint.
- Node unit suite.
- Frontend build.
- Relevant Workspace smoke/e2e guards.
