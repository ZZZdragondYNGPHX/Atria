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


## Post-deferral real-device measurement

Real-device Termux log on 2026-09-20 after the router-deferral pass, baseline `main@95644b11837161041048f167f1989ba68869216a`:

```text
[startup] +3546ms server-main.module-evaluated
[startup] phase pre-setup.total 487ms
[startup] phase pre-setup.frontend-cache 2ms
[startup] +4097ms server.listening
[startup] +4303ms http.root.head
[startup] +17224ms http.root.get
[startup] +18244ms http.csrf-token
[startup] phase http.bootstrap 334ms
[startup-client-visible] {... "visibleTotalMs":1052.2, "htmlToInitJsMs":967.5, ...}
[startup-client] {... "visibleToBatch1Ms":460.1, "batch2Ms":4463.8, "batch3Ms":171.9, "firstLoadTotalMs":6384.5, ...}
```

### Comparison with the pre-deferral baseline

- `server-main.module-evaluated`: 3252ms -> 3546ms (+294ms, about +9.0%).
- `server.listening`: 3868ms -> 4097ms (+229ms, about +5.9%).
- `pre-setup.total`: 548ms -> 487ms (-61ms, about -11.1%).
- warm frontend-cache check: 3ms -> 2ms.

One real-device run is not enough to claim a causal regression, but this is sufficient to say that #62/#64/#65/#66 did **not** demonstrate a measurable backend-startup win. Do not keep splitting optional server routers on source-code intuition alone. The router-deferral direction is now paused unless later measurements show a specific static dependency is still dominant and independently removable.

### Browser-side interpretation

- Readiness HEAD -> actual browser `GET /`: 12.921s.
- This interval is outside Atria page JavaScript because browser navigation had not begun.
- Actual `GET /` -> CSRF: about 1.020s.
- Navigation response -> first visible Atria UI is about 2.08s:
  - `navResponseEndMs=33.4`
  - `htmlToInitJsMs=967.5`
  - `visibleTotalMs=1052.2`
- Atria first-load -> APP_READY: 6384.5ms.
- The previous `batch2Ms=4463.8ms` was not a pure batch-2 measurement: it also included the optional Welcome Screen interval between `batch1Done` and the real batch-2 task start.

This moved the optimization target again: first-visible Atria startup is already around two seconds after the browser starts navigation; the two unresolved large regions are Android/Termux browser launch and post-visible initialization before APP_READY.

## Follow-up diagnostics

### PR #67 — granular post-visible timing

- Baseline: `main@95644b11837161041048f167f1989ba68869216a`
- Final validated head: `26500c9f38a3617644e0909f3759817685bdcb5c`
- Squash merge: `48c28adc82c0764392e7261b89031c883512dda8`
- Atria PR Checks #667 passed.
- Worldbook Performance Foundation #318 passed, including real-host Chromium startup smoke and complete World Info acceptance.

No startup order changed. The telemetry now separates:

- `welcomeScreenMs`;
- `batch2TasksMs`;
- each batch-2 task:
  - text-generation model selects;
  - system messages;
  - announcements;
  - extension UI init;
  - extension bootstrap;
  - extension slash commands;
  - tool slash commands;
  - tokenizers;
  - personas;
  - slash-command autocomplete;
  - macro autocomplete;
- extension bootstrap internals:
  - first-load event;
  - discovery;
  - manifest fetch;
  - optional auto-update;
  - activation;
  - settings-loaded event.

Extension activation semantics remain unchanged. In particular, different `loading_order` groups remain serial because third-party listener ordering is a real compatibility contract; same-order groups were already parallelized.

### PR #68 — launcher-to-root timing in backend logs

- Baseline after #67: `main@48c28adc82c0764392e7261b89031c883512dda8`
- Final validated head: `db2464702bcee20c43a65dcbc25b3872b38c704a`
- Squash merge / resulting main: `8fd9fb53af028c6453338ae845827df91898122c`
- Final Atria PR Checks #672 passed.

The previous Termux launcher markers were written only to the raw shell log and therefore were absent from the in-app backend log the user supplied. #68 adds a loopback-only diagnostic path so the same backend log now contains:

- `[startup-launcher]` ready/open command events;
- `readyToBrowserOpenMs` where applicable;
- `browserOpenCommandMs`;
- on the first real homepage GET:
  - `readyToRootGetMs`;
  - `browserOpenToRootGetMs`;
  - launch method (`termux-open-url` or `am`).

The endpoint is restricted by the raw loopback socket address and is mounted before auth/CSRF only for local launcher diagnostics. Launcher reporting has a 0.2s connect timeout and 0.5s hard timeout so diagnostics cannot become a meaningful startup delay.

## New measurement gate

Update Termux to `main@8fd9fb53af028c6453338ae845827df91898122c` or later and collect one complete startup log.

The next decision is data-driven:

- large `readyToBrowserOpenMs` / `readyToRootGetMs` but small `browserOpenToRootGetMs`:
  launcher/menu/user-flow delay; consider opening automatically as soon as readiness is detected.
- large `browserOpenToRootGetMs`:
  Android/browser cold-start dominates; investigate safe browser pre-warm instead of Atria JavaScript.
- large `extActivateMs`:
  keep `loading_order` execution semantics, but consider prefetch/modulepreload of enabled extension assets after manifests are known.
- large `welcomeScreenMs` or another individual `b2*Ms` field:
  optimize only that component.
- no dominant post-visible field:
  revisit the approximately 0.67s DOM-interactive -> `init.js` start gap and the module/classic-script queue before `init.js`.

Do not resume broad router deferral, tokenizer/core-generation restructuring, Transformers graph restructuring, or extension Git-stack refactoring without new evidence.
