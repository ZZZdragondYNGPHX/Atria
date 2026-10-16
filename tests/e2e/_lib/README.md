# E2E helpers

- `server.js`: isolated data root, committed default YAML with scenario overrides,
  local server startup, restart and teardown.
- `mockLLM.js`: deterministic local provider responses; no external API keys.
- `fixtures.js`: explicit settings/card/world/preset builders used by retained specs.
- `page.js`: current product navigation and shared UI actions.
- `storage-ui.js`, `sync.js`, `db-containers.js`: storage and synchronization flows.

Use `tearDownServer` in teardown. A server started with `useExistingDataRoot`
uses caller-owned data; the caller must remove it. Failed readiness and UI actions
must surface as failures instead of being converted to successful no-ops.
