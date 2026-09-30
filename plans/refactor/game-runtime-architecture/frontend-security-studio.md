# Atria Game Runtime Architecture Refactor — Frontend / Security / Studio

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 11. HTML authoring

### 11.1 HTML is first-class

Do not require authors to create all markup from JS strings.

Support real HTML files.

### 11.2 Declarative binding

Provide a safe binding/action layer for common UI.

Concepts may include:

- text binding;
- conditional visibility;
- lists;
- classes/styles derived from selectors;
- surface actions;
- command dispatch;
- modal/drawer toggles.

The exact syntax must be designed and tested; avoid an uncontrolled expression language in HTML.

### 11.3 UI JavaScript

Advanced UI scripts can manage interaction/presentation but cannot directly mutate World State.

UI mutation goes through:

- UI-only action API; or
- Command Bus.

---

## 12. Runtime security and capability model

Game Logic and UI Runtime require different capabilities.

### 12.1 Game Logic

Prefer a deterministic restricted context:

- world queries;
- events;
- commands;
- formula engine;
- deterministic RNG;
- clock abstraction;
- logging.

Game Logic should not normally receive:

- arbitrary DOM;
- unrestricted `window`;
- unrestricted network;
- filesystem;
- direct SillyTavern internals;
- arbitrary extension mutation.

### 12.2 UI/App capabilities

Sensitive host capabilities are manifest-declared and mediated.

Candidate permissions:

- chat read;
- chat send;
- regenerate;
- host fullscreen;
- audio;
- clipboard;
- network by explicit origin/policy if ever supported;
- advanced native component ownership.

A broken or malicious package must not be able to permanently trap the user.

Host-level escape/recovery remains available:

- exit game UI;
- emergency stop generation;
- disable package;
- diagnostics;
- permission review.

---

## 13. Game Studio

Evolve CardApp Studio into **Atria Game Studio**.

Reuse:

- fullscreen authoring workspace;
- CodeMirror;
- file tree;
- live preview;
- AI builder;
- diff approval;
- Git history.

Add first-class structured tools over time:

- World Schema Editor;
- Initial State Editor;
- Command Editor;
- Formula Editor;
- Rules Editor;
- Reducer/Event Inspector;
- Selector Editor;
- Observation Editor;
- UI/Surface Editor;
- Asset Manager;
- Simulation Console;
- Rule Trace;
- Event Timeline;
- World State Inspector;
- LLM Tool Preview;
- Observation Preview;
- raw Code Editor.

### 13.1 AI Builder

AI Builder edits the game project as an engineering artifact, not as one monolithic JS file.

A request such as:

> add poison: lasts 5 turns, deals 3% max HP each turn, antidote removes it

should result in a cross-file proposal such as:

- schema addition;
- poison tick rule;
- expiry rule;
- antidote command;
- HUD badge;
- observation update;
- narrator/event semantics.

All changes remain diff-reviewable.

### 13.2 Simulation/Trace

Studio must support deterministic command simulation and explain why rules fired/did not fire.

This is critical for both creators and support diagnostics.

---

## 14. Diagnostics

Game Runtime must integrate with Atria observability from the beginning.

Correlatable chain:

```text
UI action / LLM command
 -> command validation
 -> calculation
 -> optional semantic interpretation
 -> RNG
 -> event emission
 -> reducer
 -> rule trace
 -> commit
 -> narrator generation
 -> UI selector refresh
```

Diagnostic evidence should include stable identifiers:

- package id/version;
- command id;
- transaction id;
- event ids;
- branch/floor/swipe anchor;
- rule ids;
- selector id;
- LLM phase;
- failure owner/source.

Do not log secrets or entire sensitive user payloads by default.

---
