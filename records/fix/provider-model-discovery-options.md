# Model discovery with generation options

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `provider-model-discovery-options`
- Date: 2026-10-19 (America/Los_Angeles)
- Primary Workspace: product `main`
- Start HEAD: `d7bea47b`
- Implementation HEAD: `5db03d71`
- Dynamic world cherry-pick: `e18649ba`
- Status: complete

## Cause and fix

The saved OpenAI-compatible connection used the correct `/v1/chat/completions` URL, with `responseMode: stream` and `minimumOutputTokens: 20000`. `prepareProviderDiscovery` rejected any non-empty connection options before issuing a request, producing a misleading unsupported-model-list error.

Generation options now have no effect on the model-list GET. Existing provider, transport, network policy, endpoint, credential authorization and HTTP response checks remain in place. No connection settings or Secret values were changed.

## Validation

- `node --check`, targeted ESLint and `git diff --check` passed for `src/native/adapters/provider-discovery.js`.
- Inline local assertions exercised empty options, streaming/output-budget options, schema compatibility options, exact `/v1/models` derivation, a successful model result, unchanged bearer authentication and absence of a generation body, unsupported network policy/transport, invalid query endpoint, HTTP 401 and HTTP 404.
- Deployed the committed source to the actual independent `D:/Atria` clone and restarted its local server to load the backend change.
- The real built-in browser then exposed a separate missing credential-target authorization. After the user explicitly authorized the exact existing provider destination, granted that authorization through the existing UI.
- The real provider returned 24 model choices through the normal model editor. No request overrides or mocked provider were used for this live verification. No generation was sent and no model profile was saved. Screenshot retained locally at `D:/Dev/Atria-worktrees/previews/provider-models-fixed.png` (not committed).

## Integration and coordination

- Committed, integrated and pushed `main`; synchronized the actual `D:/Atria` clone and `D:/Dev/Atria` checkout.
- At the user's explicit request, cherry-picked only the fix into `feat/dynamic-world` and pushed it. Existing in-progress cognition/session changes were preserved and excluded from the commit.
- Notified chat “正式开始动态世界任务” (`01a15768-5215-7ae1-a707-7b7806bcfc13`) with the commit, scope and verification result. Player credential authorization stays in local storage, outside Git.
