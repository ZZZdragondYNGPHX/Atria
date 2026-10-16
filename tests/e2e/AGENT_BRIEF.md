# E2E authoring

Follow the current workspace `AGENTS.md` and `docs:README.md` §12 / §12.1. Add an E2E scenario when a user workflow or integration risk needs browser evidence beyond existing checks.

- Reuse the relevant helpers in `_lib/`; inspect their current API and a nearby working spec. Set `batchKey` and a distinct `scenarioId` when using `startServer()`.
- Use an isolated server/dataRoot and clean up resources started by the spec. Never use personal data or credentials in fixtures.
- Use the real component whose behavior is under test. Script provider responses when the test concerns application behavior; use live providers only when their protocol or quality is the subject of validation.
- Use the smallest fixture that expresses the behavior. Exact output equality belongs to content-preservation assertions, not every chat test.
- Restart/reopen when proving durability or recovery across a process boundary; ordinary disk use alone does not require another restart test.
- Run the affected spec or group. Report actual passes, failures and missing evidence; an expected failure or skipped case does not prove the behavior works.

See [README.md](README.md) for commands and [_lib/README.md](_lib/README.md) for helper ownership.
