# Atria tests

Install product dependencies at the repository root and test dependencies in this
directory.

- `native/`: Runtime, permission, authority, Agent, storage and save contracts.
- `orchestrator/`, `agent-runtime/`, `memory-graph/`: live orchestration behavior.
- `e2e/`: current product UI and HTTP flows with isolated local servers.
- `frontend/*.smoke.mjs`: explicit browser fixtures; run only the relevant script.

`npm test` combines Jest, Node's `.test.mjs` contracts and Playwright. Targeted
commands are preferred for local work. There are no active Actions workflows.

Jest uses committed default configuration and removes its temporary data root.
Browser module tests opt into explicit context fixtures; missing services are not
synthesized by a global Proxy. HTML tests use jsdom and the real sanitizer.

The default storage matrix includes filesystem and SQLite. The command fails without a configured URL.
An unavailable configured database fails its tests. Unconfigured database cases
are excluded or explicitly skipped; they are not passing evidence.

Preserve business regressions and test real production functions.
