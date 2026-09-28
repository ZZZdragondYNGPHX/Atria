# NUX-042 dependency inventory

Captured before physical retirement on `6cb86b33c`. Static imports include product code and regression fixtures; dynamic loader/manifest and settings registrations are reviewed separately.

| Former extension owner | Disposition | External static consumers |
| --- | --- | --- |
| `assets` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `atria-tabs.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 1 |
| `attachments` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `caption` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `character-editor-assistant` | Retire extension product, registration, settings and dead source after consumers are removed. | 20 |
| `completion-preset-assistant` | Retire extension product, registration, settings and dead source after consumers are removed. | 6 |
| `connection-manager` | Retire profile UI/persistence/resolver; use existing Native Connections/Routes/Retrieval and preserve only required transport helpers under core owners. | 21 |
| `expressions` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `field-help.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 2 |
| `function-call-runtime.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 9 |
| `gallery` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `game-runtime` | Move to Native experience; preserve declarative World/logic/UI and Studio editor. | 46 |
| `hook-order` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `json-state-journal.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 2 |
| `memory-graph` | Move to Agents memory; Native Retrieval is the only embedding/rerank authority. | 56 |
| `object-diff-view.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 0 |
| `orchestrator` | Move to Agents orchestration; explicitly boot as a product capability. | 128 |
| `preset-help.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 5 |
| `quick-reply` | Retire extension product, registration, settings and dead source after consumers are removed. | 1 |
| `regex` | Global Plugin; retain its rules, presets and text engine. | 11 |
| `search-tools` | Global Plugin; retain search/visit and Native orchestration tools; remove old profile authority. | 2 |
| `shared.js` | Move required shared helpers to Atria core; remove obsolete extension helpers. | 6 |
| `stable-diffusion` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `third-party` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `token-counter` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `translate` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `tts` | Retire extension product, registration, settings and dead source after consumers are removed. | 0 |
| `vectors` | Move browser WebLLM inference to Native Retrieval; retire the extension and old settings. | 1 |

## Import edges

### assets


### atria-tabs.js

- `public/scripts/st-context.js`

### attachments


### caption


### character-editor-assistant

- `tests/cea-editor-unified/control-fallback-filter.test.js`
- `tests/cea-editor-unified/editor-bug-regressions.test.js`
- `tests/cea-editor-unified/editor-preview.test.js`
- `tests/cea-editor-unified/entry-point-bootstrap.test.js`
- `tests/cea-editor-unified/inspect-bound-preset-helper-api.test.js`
- `tests/cea-editor-unified/load-session-refreshes-live.test.js`
- `tests/cea-editor-unified/lorebook-approval-flow.test.js`
- `tests/cea-editor-unified/multi-target-apply.test.js`
- `tests/cea-editor-unified/post-replace-rollback.test.js`
- `tests/cea-editor-unified/post-replace-seed.test.js`
- `tests/cea-editor-unified/read-card-fields.test.js`
- `tests/cea-editor-unified/replace-diff-overview.test.js`
- `tests/cea-editor-unified/rollback-batch-v3.test.js`
- `tests/cea-editor-unified/runner-multi-round.test.js`
- `tests/cea-editor-unified/seed-and-autosend.test.js`
- `tests/cea-editor-unified/session-store.test.js`
- `tests/cea-editor-unified/simulate-source-floor-migration.test.js`
- `tests/cea-editor-unified/task-messages-filter.test.js`
- `tests/cea-editor-unified/tools.test.js`
- `tests/edits/ops/lorebook-entry-ops.test.js`

### completion-preset-assistant

- `tests/cpa-iteration/session-store.test.js`
- `tests/cpa-iteration/simulate-source-floor-migration.test.js`
- `tests/cpa-iteration/skill-prompt.test.js`
- `tests/cpa-iteration/system-prompts.test.js`
- `tests/cpa-iteration/tool-display.test.js`
- `tests/cpa-iteration/tools.test.js`

### connection-manager

- `public/script.js`
- `public/scripts/extensions.js`
- `public/scripts/extensions/character-editor-assistant/main.js`
- `public/scripts/extensions/completion-preset-assistant/main.js`
- `public/scripts/extensions/memory-graph/main.js`
- `public/scripts/extensions/memory-graph/vector-index.js`
- `public/scripts/extensions/orchestrator/agent-resolution.js`
- `public/scripts/extensions/search-tools/main.js`
- `public/scripts/extensions/shared.js`
- `public/scripts/extensions/stable-diffusion/index.js`
- `public/scripts/extensions/vectors/index.js`
- `public/scripts/horde.js`
- `public/scripts/kai-settings.js`
- `public/scripts/nai-settings.js`
- `public/scripts/openai.js`
- `public/scripts/st-context.js`
- `public/scripts/textgen-settings.js`
- `tests/connection-manager/embed-rerank-core.test.js`
- `tests/connection-manager/gemini-cache-profile.test.js`
- `tests/profile-retry.test.js`
- `tests/retry-whitelist-parser.test.js`

### expressions


### field-help.js

- `public/scripts/extensions/memory-graph/ui-templates.js`
- `public/scripts/st-context.js`

### function-call-runtime.js

- `public/scripts/extensions/character-editor-assistant/main.js`
- `public/scripts/extensions/memory-graph/extract-transaction.js`
- `public/scripts/extensions/memory-graph/main.js`
- `public/scripts/extensions/orchestrator/agenda-planner-tool.js`
- `public/scripts/extensions/search-tools/main.js`
- `public/scripts/lib/iter-tool-calling.js`
- `public/scripts/openai.js`
- `tests/function-call-runtime.test.js`
- `tests/memory-graph/fact-extraction-pipeline.test.js`

### gallery


### game-runtime

- `public/scripts/native/studio-ui-editor.js`
- `public/scripts/native/studio-workspace.js`
- `tests/atria-shell/native-generation-p4.test.js`
- `tests/atria-shell/native-play-host.test.js`
- `tests/game-runtime/command-registry.test.js`
- `tests/game-runtime/declarative-observations.test.js`
- `tests/game-runtime/declarative.test.js`
- `tests/game-runtime/formula.test.js`
- `tests/game-runtime/helpers/session-world-adapter.js`
- `tests/game-runtime/interpretation-mapping.test.js`
- `tests/game-runtime/llm-event-interpreter.test.js`
- `tests/game-runtime/llm-intent-resolver.test.js`
- `tests/game-runtime/llm-memory-bridge.test.js`
- `tests/game-runtime/llm-memory-ingestion.test.js`
- `tests/game-runtime/llm-model-runtime-config.test.js`
- `tests/game-runtime/llm-observation.test.js`
- `tests/game-runtime/llm-orchestrator-narrative.test.js`
- `tests/game-runtime/llm-roles.test.js`
- `tests/game-runtime/llm-runtime.test.js`
- `tests/game-runtime/llm-tools.test.js`
- `tests/game-runtime/llm-turn-context.test.js`
- `tests/game-runtime/llm-turn-controller.test.js`
- `tests/game-runtime/logic-package.test.js`
- `tests/game-runtime/logic-rules-integration.test.js`
- `tests/game-runtime/logic-runtime.test.js`
- `tests/game-runtime/package-loader.test.js`
- `tests/game-runtime/plugin-contributions.test.js`
- `tests/game-runtime/r3-exit-matrix.test.js`
- `tests/game-runtime/r5-exit-matrix.test.js`
- `tests/game-runtime/reducers.test.js`
- `tests/game-runtime/rng.test.js`
- `tests/game-runtime/rules.test.js`
- `tests/game-runtime/ui-component-model.test.js`
- `tests/game-runtime/ui-component.test.js`
- `tests/game-runtime/ui-declarative.test.js`
- `tests/game-runtime/ui-environment.test.js`
- `tests/game-runtime/ui-full-host.test.js`
- `tests/game-runtime/ui-host-surfaces.test.js`
- `tests/game-runtime/ui-live.test.js`
- `tests/game-runtime/ui-native-components.test.js`
- `tests/game-runtime/ui-package.test.js`
- `tests/game-runtime/ui-selectors.test.js`
- `tests/game-runtime/ui-surfaces.test.js`
- `tests/game-runtime/validators.test.js`
- `tests/game-runtime/world-package.test.js`
- `tests/game-runtime/world-session.test.js`

### hook-order


### json-state-journal.js

- `public/scripts/extensions/completion-preset-assistant/main.js`
- `public/scripts/extensions/object-diff-view.js`

### memory-graph

- `public/scripts/extensions/orchestrator/workspace/memory/page.js`
- `public/scripts/world-info.js`
- `tests/atria-shell/memory-native-routing.test.js`
- `tests/memory-graph/adapter.test.js`
- `tests/memory-graph/atomic-facts.test.js`
- `tests/memory-graph/benchmark.mjs`
- `tests/memory-graph/compaction-floor-range-rollup.test.js`
- `tests/memory-graph/create-node-floor-range.test.js`
- `tests/memory-graph/external-api.test.js`
- `tests/memory-graph/extract-link-seqto.test.js`
- `tests/memory-graph/extract-transaction-schema-retry.test.js`
- `tests/memory-graph/extraction-floor-range.test.js`
- `tests/memory-graph/fact-extraction-pipeline.test.js`
- `tests/memory-graph/fixtures/large-memory.js`
- `tests/memory-graph/graph-inspector.test.js`
- `tests/memory-graph/graph-ops-edge-seqto.test.js`
- `tests/memory-graph/graph-ops-remove-edge.test.js`
- `tests/memory-graph/history-build.test.js`
- `tests/memory-graph/hybrid-retrieval.test.js`
- `tests/memory-graph/in-flight-anchor.test.js`
- `tests/memory-graph/injection-window.test.js`
- `tests/memory-graph/list-candidates-no-seq-window.test.js`
- `tests/memory-graph/memory-os-adapter.test.js`
- `tests/memory-graph/normalize-isolation.test.js`
- `tests/memory-graph/op-link-delete.test.js`
- `tests/memory-graph/optimization.test.js`
- `tests/memory-graph/orchestrator-tools-register.test.js`
- `tests/memory-graph/per-type-cadence.test.js`
- `tests/memory-graph/persistent-injection-recency-horizon.test.js`
- `tests/memory-graph/primitives.test.js`
- `tests/memory-graph/read-api.test.js`
- `tests/memory-graph/recall-legacy-migration.test.js`
- `tests/memory-graph/recall-rag-pipeline.test.js`
- `tests/memory-graph/role-split-floor-provenance.test.js`
- `tests/memory-graph/schema-floor-range-flag.test.js`
- `tests/memory-graph/schema-iteration-session-store.test.js`
- `tests/memory-graph/schema-iteration-tools.test.js`
- `tests/memory-graph/session-commit-anchor.test.js`
- `tests/memory-graph/source-lifecycle.test.js`
- `tests/memory-graph/source-provenance.test.js`
- `tests/memory-graph/source-vector.test.js`
- `tests/memory-graph/state-providers.test.js`
- `tests/memory-graph/temporal-graph.test.js`
- `tests/memory-graph/tool-output-floor-range.test.js`
- `tests/memory-graph/vector-index-core.test.js`
- `tests/memory-graph/vector-index-persistence.test.js`
- `tests/memory-graph/wi-scan-listeners.test.js`
- `tests/memory-graph/write-api.test.js`
- `tests/mg-schema-iteration/apply-pending-edits.test.js`
- `tests/mg-schema-iteration/control-tools.test.js`
- `tests/mg-schema-iteration/read-fields.test.js`
- `tests/mg-schema-iteration/session-store.test.js`
- `tests/mg-schema-iteration/tool-display.test.js`
- `tests/mg-schema-iteration/tools.test.js`
- `tests/orchestrator/loop-integration.test.js`
- `tests/performance/worldbook-performance-bench.mjs`

### object-diff-view.js


### orchestrator

- `public/scripts/atria-shell/workspace-host.js`
- `public/scripts/extensions/character-editor-assistant/editor-iteration/studio.js`
- `public/scripts/extensions/completion-preset-assistant/cpa-iteration/studio.js`
- `public/scripts/extensions/memory-graph/schema-iteration/studio.js`
- `tests/agent-runtime/atri-agenda-defaults.test.js`
- `tests/agent-runtime/context-ports.test.js`
- `tests/agent-runtime/engine-mode-recovery.test.js`
- `tests/agent-runtime/handoff-routing.test.js`
- `tests/agent-runtime/legacy-adapter.test.js`
- `tests/agent-runtime/legacy-workflow.test.js`
- `tests/agent-runtime/preset-compiler.test.js`
- `tests/agent-runtime/projection.test.js`
- `tests/agent-runtime/workspace-agent-editing.test.js`
- `tests/agent-runtime/workspace-host.test.js`
- `tests/agent-runtime/workspace-preset-help.test.js`
- `tests/agent-runtime/workspace-state.test.js`
- `tests/cea-editor-unified/task-messages-toolcall-roundtrip.test.js`
- `tests/cpa-iteration/task-messages-toolcall-roundtrip.test.js`
- `tests/game-runtime/llm-orchestrator-narrative.test.js`
- `tests/jest.setup.js`
- `tests/logging/l08-attribution-fixtures.test.js`
- `tests/memory-graph/orchestrator-tools-register.test.js`
- `tests/mg-schema-iteration/task-messages-toolcall-roundtrip.test.js`
- `tests/native/agent-settings.test.js`
- `tests/orch-iteration/assistantmsg-edits-v3.test.js`
- `tests/orch-iteration/control-tools.test.js`
- `tests/orch-iteration/popup-bug-regression.test.js`
- `tests/orch-iteration/read-fields.test.js`
- `tests/orch-iteration/sandbox-result.test.js`
- `tests/orch-iteration/session-store.test.js`
- `tests/orch-iteration/task-messages-toolcall-roundtrip.test.js`
- `tests/orch-iteration/tool-display.test.js`
- `tests/orchestrator-agent-preset-resolver/unit.test.js`
- `tests/orchestrator-skills/skill-orchestration-tools.test.js`
- `tests/orchestrator-skills/skill-resolution.test.js`
- `tests/orchestrator/abort-mid-run.test.js`
- `tests/orchestrator/agenda-spec-customs-seed.test.js`
- `tests/orchestrator/agenda-tool-safety.test.js`
- `tests/orchestrator/agenda-world-info.test.js`
- `tests/orchestrator/agent-prompt-preset-routing-data.test.js`
- `tests/orchestrator/api-fallback.test.js`
- `tests/orchestrator/chat-read-range-pair-expansion.test.js`
- `tests/orchestrator/critic-regex-search-tool-primitives.test.js`
- `tests/orchestrator/custom-tool-bridge-st.test.js`
- `tests/orchestrator/custom-tool-flags.test.js`
- `tests/orchestrator/custom-tool-iter-studio.test.js`
- `tests/orchestrator/custom-tool-per-run.test.js`
- `tests/orchestrator/custom-tool-portable-roundtrip.test.js`
- `tests/orchestrator/custom-tool-register.test.js`
- `tests/orchestrator/custom-tool-runtime-agenda.test.js`
- `tests/orchestrator/custom-tool-runtime-director.test.js`
- `tests/orchestrator/custom-tool-runtime-loop.test.js`
- `tests/orchestrator/custom-tool-runtime-spec.test.js`
- `tests/orchestrator/custom-tool-sanitize.test.js`
- `tests/orchestrator/custom-tool-studio-prompt.test.js`
- `tests/orchestrator/default-custom-tools.test.js`
- `tests/orchestrator/director-default-prompt-presets.test.js`
- `tests/orchestrator/director-factory-presets.test.js`
- `tests/orchestrator/director-load-shape.test.js`
- `tests/orchestrator/director-preset-swap.test.js`
- `tests/orchestrator/director-tools-draft-search.test.js`
- `tests/orchestrator/director-tools-runround-settle.test.js`
- `tests/orchestrator/director/abort.test.js`
- `tests/orchestrator/director/agent-task-messages.test.js`
- `tests/orchestrator/director/content-payload.test.js`
- `tests/orchestrator/director/default-prompt.test.js`
- `tests/orchestrator/director/digest.test.js`
- `tests/orchestrator/director/dispatch-claim.test.js`
- `tests/orchestrator/director/integration.test.js`
- `tests/orchestrator/director/memory-scout-iou.test.js`
- `tests/orchestrator/director/notes-subagents.test.js`
- `tests/orchestrator/director/profile-shape.test.js`
- `tests/orchestrator/director/studio-adapter.test.js`
- `tests/orchestrator/director/sub-messages.test.js`
- `tests/orchestrator/director/subagent-max-rounds.test.js`
- `tests/orchestrator/director/tools.test.js`
- `tests/orchestrator/dispatch-barrier/dispatch-barrier.test.js`
- `tests/orchestrator/editor-ops/context-replace.test.js`
- `tests/orchestrator/editor-ops/error.test.js`
- `tests/orchestrator/editor-ops/patch.test.js`
- `tests/orchestrator/editor-ops/pipe-from.test.js`
- `tests/orchestrator/editor-ops/reasoning-sections.test.js`
- `tests/orchestrator/editor-ops/slicing.test.js`
- `tests/orchestrator/ensure-settings-migration.test.js`
- `tests/orchestrator/execution-mode-contract.test.js`
- `tests/orchestrator/factory-preset-shape.test.js`
- `tests/orchestrator/get-effective-profile-presets.test.js`
- `tests/orchestrator/grep-tool.test.js`
- `tests/orchestrator/iter-arg-validator.test.js`
- `tests/orchestrator/iter-studio-lorebook-filter.test.js`
- `tests/orchestrator/iter-studio-session-store.test.js`
- `tests/orchestrator/loop-integration.test.js`
- `tests/orchestrator/loop-iteration.test.js`
- `tests/orchestrator/loop-runtime.test.js`
- `tests/orchestrator/loop-tools-chat.test.js`
- `tests/orchestrator/loop-tools-lorebook-filter.test.js`
- `tests/orchestrator/loop-tools-lorebook-force-activate.test.js`
- `tests/orchestrator/loop-tools-lorebook.test.js`
- `tests/orchestrator/loop-tools-note.test.js`
- `tests/orchestrator/loop-tools-registration.test.js`
- `tests/orchestrator/loop-tools-simulation.test.js`
- `tests/orchestrator/lorebook-filter-persistence.test.js`
- `tests/orchestrator/lorebook-filter.test.js`
- `tests/orchestrator/main-on-world-info-finalized-filter.test.js`
- `tests/orchestrator/multi-skill-visible-resolver.test.js`
- `tests/orchestrator/notes-panel-refresh.test.js`
- `tests/orchestrator/open-notes-cross-mode-injection.test.js`
- `tests/orchestrator/open-notes-injection.test.js`
- `tests/orchestrator/per-run-custom-tools-isolation.test.js`
- `tests/orchestrator/persistence-loop.test.js`
- `tests/orchestrator/persistence.test.js`
- `tests/orchestrator/resolve-tool-source.test.js`
- `tests/orchestrator/run-state-helpers.test.js`
- `tests/orchestrator/run-state-store.test.js`
- `tests/orchestrator/runtime-trace-export.test.js`
- `tests/orchestrator/schema/director-fields.test.js`
- `tests/orchestrator/simulation-payload-adapter.test.js`
- `tests/orchestrator/skill-resolution-runtime-plumbing.test.js`
- `tests/orchestrator/skill-resolution-scope-precedence.test.js`
- `tests/orchestrator/snapshot-cache-hits-invalidates.test.js`
- `tests/orchestrator/spec-agenda-loop-three-modes.test.js`
- `tests/orchestrator/system-prompt-patch.test.js`
- `tests/orchestrator/tool-call-source-tagging.test.js`
- `tests/orchestrator/tool-calling-fallback.test.js`
- `tests/performance/worldbook-performance-bench.mjs`
- `tests/search-tools/orchestrator-tools-register.test.js`
- `tests/skills-ui/skill-iter-studio-tools.test.js`
- `tests/world-info/provenance.test.js`

### preset-help.js

- `public/scripts/extensions/character-editor-assistant/editor-ui.js`
- `public/scripts/extensions/completion-preset-assistant/main.js`
- `public/scripts/extensions/memory-graph/ui-templates.js`
- `public/scripts/extensions/search-tools/settings-ui.js`
- `tests/agent-runtime/workspace-preset-help.test.js`

### quick-reply

- `public/global.d.ts`

### regex

- `public/script.js`
- `public/scripts/extensions.js`
- `public/scripts/extensions/memory-graph/main.js`
- `public/scripts/preset-manager.js`
- `public/scripts/reasoning.js`
- `public/scripts/slash-commands.js`
- `public/scripts/st-context.js`
- `public/scripts/welcome-screen.js`
- `public/scripts/world-info.js`
- `tests/regex-engine/execution-plan.test.js`
- `tests/regex-engine/lane-semantics.test.js`

### search-tools

- `tests/search-tools/orchestrator-tools-register.test.js`
- `tests/search-tools/persistence.test.js`

### shared.js

- `public/scripts/extensions/caption/index.js`
- `public/scripts/extensions/connection-manager/index.js`
- `public/scripts/extensions/expressions/index.js`
- `public/scripts/extensions/stable-diffusion/index.js`
- `public/scripts/extensions/vectors/index.js`
- `public/scripts/st-context.js`

### stable-diffusion


### third-party


### token-counter


### translate


### tts


### vectors

- `public/scripts/native/retrieval-client.js`

## Authority constraints

- Retain Native Session/Project/Library/Resource Graph/Runtime Routes and Secret boundaries.
- Package runtime plugins remain declarative and exact-version-owned.
- Current Atria retained configuration must survive ownership moves; retired extension keys must not remain live configuration authority.
- Core bootstrap explicitly owns Agents and Native experience; only Regex/Search Tools are plugin products.
- No replacement generic third-party loader, legacy install endpoint or compatibility catalog.

## Implemented ownership

- `public/scripts/capability-host.js` explicitly boots the two Global Plugins plus Agents Orchestration, Agents Memory and Native Experience. It has no discovered catalog or arbitrary module installer.
- Retained implementation lives in `public/scripts/agents/orchestrator/`, `public/scripts/agents/memory/`, `public/scripts/native/experience/` and named `public/scripts/lib/` helpers. Native Studio editors and package runtime consumers use those owners.
- Current Atria capability settings are saved as `atri_capabilities`. Initial hydration retains only the current capability allowlist from pre-cutover Atria settings; all later reads/writes use the Native-owned object. Retired profile, vector, expression, media and extension-manager keys do not hydrate or serialize. Boot-watchdog recovery disables only Regex and Search Tools.
- Memory vector and hybrid retrieval use exact Native Retrieval references. The server rejects raw provider configuration without an exact reference, including attempted nested override bags. Browser embeddings use the bundled WebLLM SDK, serialized model ownership and abort checks; Runtime offers the supported embedding-model catalog.
- Retired source, manifests, templates and server endpoints were removed, including extension installation/discovery/update, Stable Diffusion providers, Quick Reply authoring/default seeds, translation, caption/classification and speech products. File-name validation remains a core helper used by Native file uploads. The legacy manager stylesheet was reduced to the retained Global Plugin staging layout.
- Backup category selection no longer offers user/global extension installation trees. Native backups, exact resources, project sources and asset blobs retain their existing storage and restore authorities.
- Regression fixtures follow retained module moves; retired-only tests and published feature pages were removed. Native Agents onboarding replaces the obsolete preset-assistant workflow.

## Validation boundaries

The SDK catalog was loaded in real Edge and inspected at 390px. Browser embedding execution uses injected SDK/GPU tests; actual GPU inference and model downloads were not exercised. Android and Docker builds and external MySQL/PostgreSQL services were not provisioned.
