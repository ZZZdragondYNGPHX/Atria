# Android / Termux startup: static server router deferral

## Baseline measurement

Real-device Termux log on 2026-09-20, baseline `main@ffc2857b9fdf8225958c2bf8934b360ad4cff91b`:

```text
[startup] +3252ms server-main.module-evaluated
[startup] +3306ms pre-setup.start
[startup] phase pre-setup.version 86ms
[startup] phase pre-setup.user-directories 27ms
[startup] phase pre-setup.chat-journal-recovery 15ms
[startup] phase pre-setup.group-migration 4ms
[startup] phase pre-setup.content-seed 87ms
[startup] phase pre-setup.housekeeping 12ms
[startup] phase pre-setup.parallel-state 227ms
[startup] phase pre-setup.safe-mode 0ms
[startup] phase pre-setup.plugins 0ms
[startup] phase pre-setup.network-policy 0ms
[startup] phase pre-setup.frontend-cache 3ms
[startup] phase pre-setup.total 548ms
[startup] +3868ms server.listening
[startup] +4035ms http.root.head
[startup] +15754ms http.csrf-token
[startup] phase http.bootstrap 330ms
```

Interpretation:

- roughly 3.25s elapsed before `server-main.module-evaluated`, about 84% of the measured process-start -> listen interval;
- actual `preSetupTasks()` cost was only 548ms;
- the Termux-private Webpack cache was healthy and the warm cache path cost 3ms;
- CSRF -> bootstrap/WS remained sub-second;
- therefore the next backend target was the static Node module graph evaluated before pre-setup, not storage/pre-setup ordering;
- the ~11.7s readiness-HEAD -> CSRF gap was deliberately left unattributed because the HEAD request came from the launcher readiness probe, not browser navigation. It may contain Toolbox/manual delay, Android browser cold-start, cached HTML/module restore, and in-browser Atria execution.

No real-device speedup is claimed yet for the changes below; a new post-merge measurement is required.

## Merged work

### PR #62 — lazy Stable Diffusion router

- Baseline: `main@ffc2857b9fdf8225958c2bf8934b360ad4cff91b`
- Validated head: `af268179846624d19bc7db5b5c6f4c3c3f5345ce`
- Squash merge: `41602d8ba78e9cb70e108a19d787608692792dcf`
- Atria PR Checks #657 passed.

`/api/sd/*` now loads `src/endpoints/stable-diffusion.js` on the first SD request through a memoized, retryable lazy-router middleware. This removes the SD endpoint plus its broad provider/dispatch fan-out from ordinary pre-listen evaluation.

### PR #63 — browser-launch and first-visible telemetry

- Baseline: `main@ffc2857b9fdf8225958c2bf8934b360ad4cff91b`
- Validated head: `ce71c0026660974b88e89d7215f358b298acfd3a`
- Squash merge: `95eb234171198ff8c75e731ff396df6d806186da`
- Atria PR Checks #658 passed.
- Worldbook Performance Foundation #317 passed, including real-host Chromium startup smoke and full World Info acceptance.

Added:

- `[startup-client-visible] {...}` immediately after loader hide + one browser paint/yield;
- existing `[startup-client] {...}` remains at APP_READY;
- `visibleTotalMs`;
- Termux launcher events:
  - `ready-detected`
  - `browser-open-start`
  - `browser-open-return`
  - `ready-observed` / manual-open diagnostics where applicable.

Both direct `atria-termux` and Toolbox launch paths emit the browser boundary events.

### PR #64 — lazy Search router

- Baseline after #62/#63: `main@95eb234171198ff8c75e731ff396df6d806186da`
- Final validated head: `65115f0a425ac13e93102bda02ed98a5fa88216d`
- Squash merge: `dce66e4338d693fdd2f555d028219f72ef101ad5`
- Final Atria PR Checks #662 passed.

`/api/search/*` now loads on first search/visit/transcript request. This keeps the Search endpoint's exclusive `cheerio`, HTML entity and URL/IP parsing stack out of ordinary server startup.

### PR #66 — lazy LAN Sync router

- Final validated head before merge: `f7b08712ddfe3f7e8da1654f4be377cca6343737`
- Squash merge: `f65adfea5732031478e61d31c9d4ad381b1091c6`
- Final Atria PR Checks #664 passed.

`/api/sync/v1` now loads on its first sync request while remaining mounted at exactly the same authentication boundary: before `requireLoginMiddleware` and before the authenticated write gate. Bearer-token/basic-auth semantics are unchanged.

### PR #65 — lazy Horde router

- Final rebased head: `b529e2913906faec5132445aa92226af87df8e96`
- Squash merge / resulting main: `95644b11837161041048f167f1989ba68869216a`
- Final Atria PR Checks #666 passed.

`/api/horde/*` now loads on first Horde request. This keeps the endpoint's exclusive `@zeldafan0225/ai_horde` client stack out of ordinary pre-listen evaluation.

## Shared lazy-router contract

`src/middleware/lazy-router.js`:

- memoizes the first successful dynamic import;
- clears the cached promise after a rejected import so a later request can retry;
- forwards module/import errors through Express `next(error)`;
- preserves existing router paths and middleware placement;
- logs one-time import duration as `[startup] phase lazy-router.<label> Nms`.

The lazy boundary changes module-evaluation timing only; route implementations and external APIs are unchanged.

## Audit decisions / stop line

Deliberately not changed in this pass:

- Webpack cache/pre-setup overlap (#60): warm cache hit is already ~3ms; overlapping cache-miss compilation with storage startup could increase CPU/IO contention.
- `jquery.izoomify.js` removal (#61): Atria had no internal runtime consumer, but `vanilla` still exposes it globally; preserving SillyTavern extension compatibility was more important than ~7KB.
- Tokenizer server graph: `src/endpoints/tokenizers.js` is also imported by core chat-completion/generation code. Truly deferring tiktoken/SentencePiece/web-tokenizers would require changing core generation loading boundaries.
- Vectors/Speech/Caption/Classify: these share the Transformers backend graph; delaying only one route would be superficial.
- Extension Git stack / Card App Git stack: `extensions.js` has many Git operations and still imports both simple-git and isomorphic-git; removing this from startup would require a larger extension-management refactor.
- Data Maid / Backups: user-invoked and technically lazyable, but most of their dependencies are already present through core chat/settings paths, so expected marginal startup benefit is smaller.

Do not move into these higher-risk groups without a new real-device log showing that static module evaluation is still the dominant cost after #62/#64/#65/#66.

## Next measurement

Update Termux to `main@95644b11837161041048f167f1989ba68869216a` or later and collect one complete startup log.

Required lines:

- `server-main.module-evaluated`
- all `bootstrap.*`
- all `pre-setup.*`
- `frontend-cache ... hit=...`
- `server.listening`
- `http.root.head` and any `http.root.get`
- all `[atria-termux-launch]` events
- CSRF / WS ticket / WS connection / bootstrap start+done
- `[startup-client-visible] {...}`
- `[startup-client] {...}` if APP_READY completes
- any `lazy-router.*` line if an optional feature is used during startup.

That measurement determines whether the next work should target remaining Node static imports, Android browser launch, pre-visible browser module execution, or post-visible batches.
