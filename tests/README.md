# Atria tests

Install product dependencies at the repository root and test dependencies in this
directory. From `tests/`, choose the smallest check for the changed behavior:

```sh
npm run test:unit -- --runInBand --runTestsByPath native/session-durability.test.js
npm run test:contracts
npm run test:e2e -- native-session/02-product-ui.e2e.js --workers=1
npm run test:e2e -- --list
```

- `native/`: Runtime, permission, authority, Agent, storage and save contracts.
- `storage/`, `storage-management/`, `sync/`: data integrity and persistence.
- `orchestrator/`, `agent-runtime/`, `memory-graph/`: live orchestration behavior.
- `e2e/`: current product UI and HTTP flows with isolated local servers.
- `frontend/*.smoke.mjs`: explicit browser fixtures; run only the relevant script.

`npm test` combines Jest, Node's `.test.mjs` contracts and Playwright. Targeted
commands are preferred for local work. There are no active Actions workflows.

Jest uses committed default configuration and removes its temporary data root.
Browser module tests opt into explicit context fixtures; missing services are not
synthesized by a global Proxy. HTML tests use jsdom and the real sanitizer.

The default storage matrix includes filesystem and SQLite. To exercise a separate
**test database**, set `ATRIA_TEST_MYSQL_ROOT_URL` (account must create/drop test
Databases) and/or `ATRIA_TEST_POSTGRES_URL` (account must create/drop schemas), then
run `npm run test:db -- --runInBand`. The command fails without a configured URL.
An unavailable configured database fails its tests. Unconfigured database cases
are excluded or explicitly skipped; they are not passing evidence.

Preserve business regressions and test real production functions. Do not copy an
implementation into a test, assert historical filenames/source spellings, inherit
personal data/provider configuration, or use forced exit/expected failure to
manufacture successful execution.
