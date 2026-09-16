# Phase 8 — Engine diagnostics and browser projection

Engine graph, result, arbitration, capability-denial and output events flow into the existing Runtime projection and Run Panel. Metadata is allowlisted; policy, full plan identity, prompts, tool bodies and result text are excluded. Event replay remains deterministic. Existing authoring UI and presets are preserved, with no conversion on load. Typed plans remain an explicit compiler input; no automatic JSON rewrite or separate graph-editor infrastructure was added.

Loop and Director share the same metadata observer as Spec/Agenda. Agenda partial completion is displayed as partial rather than being relabeled budget exhaustion. The panel remains a view of Runtime events and has no scheduler state.

Executed validation:

- Projection/store targeted selection: **3 suites / 39 tests passed**.
- New Engine Edge headless smoke: real IndexedDB, actual page destruction, resume of a pending two-child graph, completed child not replayed (model invocation counts 1 and 2), output ownership validation, event export privacy/replay, mobile 390px and desktop 1440px overflow checks. No page errors.
- Targeted ESLint: no errors.

Browser evidence is synthetic/offline. It does not imply provider or Android WebView acceptance. Screenshots/logs stay in `.git`, outside committed artifacts. Chromium smoke and expanded Runtime browser checks are included in the final audit.
