# API and Prompt preset responsibilities

## Approved outcome

The user selected the separation: API presets own connection, model and generation controls; Prompt presets own text, ordering and text-processing rules. A game purpose selects an API preset and uses the work's prompts by default.

## Implementation boundaries

- Reuse the existing player RuntimeRoute as the API preset identity, existing ModelProfile as its model metadata and exact GenerationProfile as its generation data. Present and save them as one API preset, rather than requiring users to assemble three resources.
- Save model, generation revision and route atomically under existing runtime write/transaction authorities. Copy shared dependencies before changing an API preset so another preset is not silently changed. Retain exact refs for request provenance.
- Remove the model-side generation scheme editor and separate model navigation. Connection administration remains separate for endpoint/Secret reuse. Advanced routing and non-game Prompt selection remain available without blocking basic game setup.
- Prompt presets no longer require or own a generation resource. Detach existing generation members without changing their exact content or losing consumers. Legacy mixed imports split parameter resources from text at the existing import boundary.
- During package tasks, keep generation settings from the chosen API preset and take the exact prompt and output contract from the work. Update provenance validation together; retain envelope, capability and result-authority checks.
- Show effective parameter/prompt sources in game setup; no generation editor there. Support a common API preset for multiple purposes and persist only existing route bindings.
- Output budget defaults to the model ceiling, with an optional smaller explicit budget. Protocol selects the relevant reasoning controls. Preserve existing components, typography and tokens.

## Validation and delivery

Targeted contract/transaction assertions, package task composition/provenance checks, Prompt preset split/import tests and real built-in-browser setup/edit/game workflows. Inspect desktop and narrow layouts and keyboard/error states. Test assets stay local. Deploy to the actual launcher checkout, integrate/push main, update the task Record and sync/notify the dynamic-world task as already requested in this conversation.

## Completion

Completed and pushed to `main` through `05e7473d`; all eight implementation commits are synchronized to the dynamic-world branch and its task has been notified. Actual launcher service and final built-in-browser page were checked after restart. See the [Record](../../records/refactor/api-prompt-presets.md) for executed validation, migration behavior, browser evidence and the remaining provider DNS/proxy limitation.
