# Logging & Diagnostics

Atria is built around Diagnostic Incidents rather than asking users to search raw log dumps.

## Diagnostics Workspace

Open User Settings → Diagnostics.

- Guided: recent incidents, module health, ownership evidence, correlation IDs, cause chain, copy summary/full context.
- Startup: recent StartupSessions, Server/Client/Extensions timing, slow phases, per-extension timing, SVG donut and waterfall.
- Expert: structured frontend/backend logs with module, level and text filters, incremental refresh and virtualized rendering.

Mobile uses a list-to-detail drill-down instead of compressing the desktop layout.

## Diagnostic Incidents

An Incident can preserve failure type/stage/severity, correlation IDs, cause chain, key logs, recent user actions, safe config, retry/fallback history, provenance and evidence-based ownership.

Ownership can be Atria, SillyTavern upstream, third-party extension, server plugin, external service, network/local environment, user configuration, or unknown. Attribution follows stack and failure evidence; plugin participation alone is not treated as proof.

Use My problem just happened immediately after a failure to capture a bounded recent evidence window into an Incident.

## High-value failure paths

Structured diagnostics cover startup, WebSocket delivery, generation/dispatch, orchestrator, Memory Graph extraction, World Info diagnostics, storage, LAN sync, backup restore, extension install/update, server plugin runtime, and editor/studio failures.

Extension install/update diagnostics distinguish DNS, TLS, connect/timeout, Git, HTTP, manifest, filesystem and repository-conflict stages.

Orchestrator incidents can retain run/agent/round/provider/model/tool/schema/retry/fallback context without copying the full prompt or chat body.

## Startup Analysis

Atria retains up to 20 compact startup sessions. Analysis supports server phases, client intervals, extension discover/manifest/activate, per-extension script/style/locale/hook timing, slow items, session deltas and a waterfall timeline.

Charts use native SVG and load only when the Startup tab is first opened.

## Canonical stores and compatibility

The backend has one bounded canonical log store. Atria-owned frontend code uses the split modules under public/scripts/logging directly.

public/scripts/frontend-log-manager.js remains only as a thin compatibility shim for third-party/upstream imports.

## Debug Export

Debug Export uses the same canonical sources as Diagnostics. Depending on permission it can include frontend logs, admin backend logs, safe Request Inspector metadata, Incidents, StartupSessions and provenance.

Full prompt/message bodies and full response bodies are not copied into the diagnostic export. Secrets such as API keys, Authorization, cookies, OAuth/JWT/Bearer values and passwords are centrally redacted.

Ordinary users do not receive process-global backend raw logs. Incidents and StartupSessions are user-scoped; backend raw query/clear is admin-only.

## Recommended report flow

1. Reproduce the problem.
2. Open Diagnostics.
3. Select the newest Incident or press My problem just happened.
4. Copy Diagnostic Summary first.
5. Copy Full Context only when deeper evidence is needed.
