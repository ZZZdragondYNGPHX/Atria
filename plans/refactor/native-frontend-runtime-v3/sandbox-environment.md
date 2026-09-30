# Atria Native Frontend Runtime v3 — Sandbox / Environment / Reliability

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 14. Script Sandbox

Package Script 是可选 `frontend-script@1`。

Baseline architecture：

```text
Main Frontend Runtime
    ⇅ structured messages
Script Sandbox Supervisor Worker
    └ Isolated JS VM
```

Worker 负责 thread/failure/hard terminate；VM 负责 heap/global/capability isolation。

具体 VM 实现不在 Baseline 锁死。

### 14.1 JS/TS Pipeline

Authoring 支持 modern JS/TypeScript。

Build：

```text
JS/TS
→ transpile/bundle/link
→ compatibility validation
→ compiled sandbox modules
→ exact module graph/hash
```

Runtime 不执行 TS/source/npm build。

允许 package-local static import与 vendored pure JS dependency。

禁止：

- remote import；
- runtime dynamic import baseline；
- Node built-ins/native addon；
- DOM/browser runtime dependency；
- eval/dynamic Function；
- ambient fetch/WebSocket/storage。

### 14.2 Controller Context

每个 Component 可有独立 Controller instance。

只获得：

- readonly props/event/env；
- component state；
- emit；
- declared NodeRef/CanvasRef；
- scoped Reads/Actions/Operations；
- scoped fixed services；
- scheduler/frame；
- UI clock / non-authoritative random。

Script heap是 ephemeral non-authoritative state。

VM 可 kill/restart并从 Host/frontend state恢复。

### 14.3 Budgets / Recovery

Host policy必须支持：

- VM heap；
- invocation CPU/instruction/wall time；
- Experience script budget；
- module bytes；
- message payload/queue；
- outstanding async；
- operation concurrency；
- hard terminate。

Crash：

- ordinary exception → scoped diagnostic；
- runaway/engine failure → terminate Worker、rebuild VM/controllers；
- repeated required-script failure → Experience failure；
- optional script 可 declarative fallback。

### 14.4 Canvas2D

Core v3 使用 batched/retained Drawing Command Buffer。

不把真实 `CanvasRenderingContext2D` 注入 VM，不做每 draw call 一次 RPC。

Image 只能来自安全 MediaHandle。

WASM 不属于 `frontend-script@1`；future `frontend-wasm@1`。

---

## 15. Environment / Localization / Input / Accessibility

### 15.1 Environment

Reactive Environment 至少包括：

- device/orientation；
- layout viewport；
- visual viewport；
- safe-area；
- soft keyboard/occlusion；
- touch/pointer/hover/keyboard modality；
- reduced motion；
- color scheme；
- forced colors；
- contrast preference；
- Host text/UI scale。

同时投影 CSS variables供 Package 使用。

### 15.2 Localization

Package Localization Resource Graph 支持：

- stable message keys；
- interpolation；
- plural/select；
- number/date/time/relative/list formatting；
- locale fallback；
- RTL；
- missing/unused key diagnostics。

Locale是 Presentation，不自动改变模型生成语言。

### 15.3 IME / Input

Baseline events：

- beforeinput；
- input；
- compositionstart/update/end；
- key + isComposing；
- bounded caret/selection state。

Controlled input实现 Composition Lock，composition 期间普通 reconciliation 不覆盖 composing buffer/caret。

支持 `inputmode/enterkeyhint/autocomplete/spellcheck` 等安全输入属性。

### 15.4 Accessibility

Compiler/Studio/Health诊断：

- accessible name/label；
- heading/landmark；
- ARIA；
- keyboard access；
- hidden focus；
- touch target；
- focus style；
- reduced-motion fallback。

Overlay/Modal Runtime提供 FocusScope：

- initial focus；
- trap；
- restore；
- background inert；
- Escape coordination。

提供 Experience-local live region / announce helper。

---

## 16. Async Loading / Error Boundary

Native v3 提供：

- Component Boundary；
- View Boundary；
- mandatory Root Boundary；
- Host-owned Failure Surface。

Boundary可声明：

- loading；
- error；
- content；
- retry；
- optional timeout/escalation。

覆盖：

- lazy View/Component；
- style/controller resource；
- Controller init/invocation；
- Collection Read；
- required Media；
- local render/validation failure。

正常业务 rejection仍是 Bridge Receipt，不自动进入 Error Boundary。

Fatal Session/Authority/contract/preflight failure进入 Host-owned Failure Surface。

Error Projection只暴露 safe category/reasonCode/retryable/sourceId/diagnosticRef/message。

Retry创建新 request epoch，旧 completion丢弃。

不自动 retry Authority write，除非底层 idempotency contract明确安全。

---

## 17. Performance / Reliability Baseline

必须实现：

- small Frontend Index；
- exact lazy resource graph；
- keyed reconciliation；
- renderer batching/coalescing；
- virtualization；
- bounded snapshot/collection reads；
- media cache；
- script budgets；
- async cancellation；
- stale epoch revocation；
- source-mapped diagnostics。

Offline：

- Embedded assets + compiled Runtime可完整启动；
- Remote Media使用 cache/fallback degradation；
- Core不依赖 Service Worker。

---

## 18. Framework / Runtime 扩展边界

### 18.1 Native Authoring

`.aui` 是 Studio/AI first-class path，可完整 structured edit / preview / diagnostics。

### 18.2 Framework Adapter

React/Vue/Svelte 等可通过 Adapter/Compiler输出同一 Canonical Runtime Graph。

Core Studio可理解 compiled IR，但不承诺将任意视觉编辑 round-trip回原 framework source。

### 18.3 Future Web Island

Future `web-island@1` 使用独立 Browser Realm + strict CSP + typed message/RPC bridge。

Web Island不获得：

- Host DOM；
- raw Authority；
- Secret；
- default arbitrary network。

不属于 Core v3 Implementation Baseline。

---

## 19. Core Baseline 完成定义

Core v3 只有同时满足以下条件才算完成：

1. 非 Text Experience 使用 `native@3` Frontend Contract；
2. Authoring Source可编译为 exact Canonical Runtime Graph；
3. Package可自由控制自身 DOM/CSS/fonts/layout/component tree；
4. Component/Hybrid/Full visual containment 与 Host System Layer成立；
5. Typed Frontend Host Bridge与 Binding Registry成立；
6. snapshot + collection Read、Action、Operation成立；
7. Managed + Headless Conversation/Composer成立；
8. Prose AST、安全 Message Presentation成立；
9. Session/Conversation fixed services与 SavePoint/retry/fork/recovery成立；
10. Local/Remote MediaRef、Remote Media permission/cache/fallback成立；
11. Localization、IME、VisualViewport、Accessibility成立；
12. Loading/Error Boundary与 Host Failure Surface成立；
13. optional Script Sandbox、Canvas Command Buffer、Frame Scheduler成立；
14. Studio/Preview/AI authoring基于 Source→Compiler→Runtime链路；
15. 原有 Native UI v1/v2 正式执行路径删除；
16. Heavy Frontend representative acceptance、mobile/desktop regression、build/install、Health/Studio tests通过。

---

## 20. Non-goals — Core v3 不做

Core v3 不包含：

- v1/v2 migration/compatibility；
- arbitrary Host DOM；
- raw `window/document` for Package Script；
- raw `fetch/XMLHttpRequest/WebSocket`；
- localStorage/IndexedDB generic authority；
- arbitrary filesystem；
- raw database/repository；
- arbitrary executable HTML/remote JS；
- Browser Top Layer escape；
- install-time npm/pnpm/yarn/build scripts；
- generic durable frontend KV；
- Service Worker；
- arbitrary WebGL/WebGPU；
- WASM runtime；
- pointer lock；
- camera/microphone；
- clipboard/file import-export baseline；
- Browser History/deep-link routing；
- true DOM-owning arbitrary React/Vue/Svelte SPA runtime；
- Remote audio/video作为 Core remote-media 必须能力。

这些不是“忘记实现”，而是明确不阻塞 v3 Core。

---

## 21. Future Seams

正式预留但不在 Core v3 实现：

- `web-island@1`；
- Framework Adapter packages；
- `webgl@1` / `webgpu@1`；
- `frontend-wasm@1`；
- `network-client@1`；
- `frontend-cache@1`；
- OffscreenCanvas / graphics fast path；
- Remote audio/video；
- clipboard read/write；
- file picker/import/export；
- camera/microphone；
- browser history/deep-link routing；
- advanced read-only delta protocol。

---
