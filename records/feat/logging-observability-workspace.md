# Logging Observability Workspace Refactor

## Task

- Branch: `refactor/logging-observability-workspace`
- Baseline: `main@148950dec7a8ab63229bd1f3c616f82438d165f4`
- Final validated head: `faf9da3a087d59e4560123f9a2db5c15361778b9`
- PR: #71
- Squash merge: `main@b8cd63d0a0f7afd647cd455a7555bf283758fea4`

## Goal

Replace the old mixed raw-log viewer with an incident-first observability workspace that lets non-technical users capture one accurate diagnostic package while preserving structured evidence for developers.

## Implementation summary

### Logging foundation

- Backend and frontend logs use structured envelopes with module/category/event/data/correlation/source.
- Central redaction covers credentials, Authorization/cookies, OAuth/JWT/Bearer tokens, passwords and long token-like values.
- Backend has one canonical bounded log store.
- Frontend logging is split into store/query/logger plus console/fetch/global-error adapters.
- The old backend `src/log-capture.js` facade was removed.
- `public/scripts/frontend-log-manager.js` remains only as a thin third-party/upstream compatibility shim; Atria-owned callers use `public/scripts/logging/` directly.

### Diagnostic Incident model

- Incident store/aggregation retains type, severity, module, stage, failure, cause chain, correlation, key log references, recent actions, safe config, retry/fallback history, provenance, ownership evidence and timeline.
- Ownership attribution distinguishes Atria, SillyTavern upstream, third-party extensions, server plugins, external services, network/local environment, user configuration and unknown.
- Frontend stack attribution records throw frame, first application frame, first Atria frame and first third-party frame.
- Clearing raw logs requires explicit confirmation and does not destroy already-captured Incident core summaries.

### Diagnostics API and Workspace

- Diagnostics API exposes module registry, bounded log query/clear, Incident list/detail/create/export, StartupSession list/detail/compare, ownership and provenance.
- Backend raw-log query/clear is admin-only.
- Ordinary users only see their own Incident/StartupSession scope.
- Workspace modes:
  - Guided: Incident-first diagnosis, module health, copy summary/full context, “My problem just happened”.
  - Startup: recent startup sessions, scope selector, slow items, comparison, per-extension timing and timeline.
  - Expert: structured raw logs with filters, incremental refresh and virtualized rendering.
- Mobile uses a dedicated list-to-detail drill-down.

### Startup diagnostics

- StartupSession retention is capped at 20.
- Server/client/extensions timing is normalized into non-overlapping slices.
- Native SVG donut and waterfall views are lazy-loaded with the Startup tab.
- Per-extension script/style/locale/hook timing and session deltas are shown.

### High-value failure paths

Structured logging and Incident triggers cover:

- startup / WebSocket delivery;
- generation / dispatch;
- orchestrator failures with run/agent/round/provider/model/tool/schema/retry/fallback context;
- Memory Graph extraction;
- World Info diagnostics;
- storage engines;
- LAN Sync and archive restore;
- extension install/update;
- server plugin import/init/runtime;
- editor / CardApp Studio failures.

Extension install/update diagnosis classifies DNS, TLS, connection/timeout, Git, HTTP, manifest, filesystem and repository-conflict stages.

### Debug Export

- Uses the same canonical stores as Diagnostics.
- Includes frontend logs, admin backend logs, safe Request Inspector metadata, Incidents, StartupSessions and allowed provenance/runtime metadata.
- Full prompt/message bodies and full response bodies are excluded.
- Cross-realm plain structured objects are preserved correctly during central redaction.

## A/B/C acceptance scenarios

- A — Orchestrator failure: one Incident carries run/agent/round/provider/model/tool/schema/retry/fallback/final-stage context.
- B — Extension install/update failure: Incident records operation ID and real failure stage instead of a generic network error.
- C — Third-party runtime failure: stack/provenance evidence distinguishes third-party fault from an Atria-owned implementation fault.

## Final validation

Final task head `faf9da3a087d59e4560123f9a2db5c15361778b9` passed:

- Atria PR Checks #713
  - Unit Tests
  - ESLint
  - Atria Migration Guard
- Worldbook Performance Foundation #341
- Backup and Storage UI #89
  - Server Storage Chromium
  - Browser Storage Chromium
  - Backup Center Chromium

The repeatedly flaky World Info mobile drill-down case was traced to stale bulk selection forcing `mobileDetail=true` when opening a book from the Library. Catalogue-to-Entries transitions now refresh bulk-selection UI without auto-entering bulk detail; actual user-driven multi-selection keeps the original behavior.

Android JVM/APK and Docker builds were not run because they were not requested and remain opt-in.

## Compatibility / migration impact

- No Luker compatibility was reintroduced.
- No chat, worldbook, storage, IndexedDB or localStorage migration is required.
- Existing frontend third-party/upstream imports of `frontend-log-manager.js` remain supported by the shim.
- Request Inspector remains independent; diagnostics/export only consume its sanitized metadata shape.
- No Chart.js/ECharts or other heavy chart dependency was added.

## Follow-up / known bounds

- IncidentStore is intentionally bounded and process-memory scoped.
- StartupSession persistence remains bounded to recent sessions.
- Raw console coverage for untouched SillyTavern upstream code remains adapter-based rather than forcing a mass structured-logger migration.
- Android-specific diagnostics delivery was not changed in this task.
