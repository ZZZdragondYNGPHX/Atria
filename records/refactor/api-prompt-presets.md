# API and Prompt preset refactor — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `api-prompt-presets`
- Date: 2026-10-20 (America/Los_Angeles)
- Primary Workspace: product `main`
- Plan: [API and Prompt preset responsibilities](../../plans/refactor/api-prompt-presets.md)
- Start HEAD: `47733e9d`
- Status: Complete

## Investigation

PromptPresetStore required exactly one generation member and rejected routes combining a preset program with independently owned generation settings. The model page exposed another editor for the same generation resources. Package task composition then replaced both player prompt and generation refs with package refs, making player settings misleading in games.

The user approved separating API settings from prompt content. The implementation was completed on `refactor/api-prompt-presets`, fast-forwarded into `main` and pushed through `05e7473d`. The detached stable checkout and the actual launcher checkout `D:/Atria` were updated; the production server was restarted and its final built-in-browser page was checked. Unrelated dynamic-world work was preserved.

## Delivered behavior

- API presets provide one editor and one atomic save for the existing RuntimeRoute, ModelProfile and GenerationProfile authorities. Shared model/generation resources are copied before editing; existing exact revisions remain valid. Optimistic fingerprints reject stale saves and failed validation rolls back all writes.
- Connection, remote model ID, output budget, reasoning and generation controls are visible together. Protocol selects applicable controls. Model capability limits, reuse and advanced routing are disclosures; separate model navigation and the old model generation editor were removed.
- Output budget is optional and follows the model ceiling when omitted. An explicit smaller budget is allowed; a value above the ceiling is rejected and focused before submission. Configured reasoning is recorded as a declared user override bound to the execution path, never as a verified provider measurement.
- Prompt presets own programs, modules, ordering and text rules. Existing mixed presets detach generation ownership without rewriting generation revisions or consumers. Legacy imports split generation resources. Direct deletion of a legacy prompt also detaches generation first, preventing its accidental archival.
- Package tasks compose the selected API preset's generation settings with the work's exact prompt and output contract. Trusted request snapshots are checked during result adoption; package prompts, envelopes, definitions, payloads and result provenance remain enforced.
- Game purposes select API presets, with a common selector for applying one preset to all compatible purposes. The UI displays the effective model, output budget and reasoning, and updates readiness immediately. It does not offer another parameter editor.
- Narrow editors use a native modal dialog inside the existing themed shell. Drafts survive breakpoint changes; keyboard focus is contained in the modal and Escape also works in the wide editor. Saving explains that changes apply to the next request.

## Validation executed

1. Targeted ESLint for changed frontend/backend modules and `git diff --check` passed. Relevant subsequent edits were checked again. The changed-copy localization comparison against `47733e9d` found no new recognized gaps; the broader product audit still has 18 pre-existing findings and is not claimed clean.
2. Local real-SQLite assertions passed for atomic create/update, fingerprint conflicts, output-limit rollback, shared-resource isolation, omitted output budgets, package prompt/API generation composition, prompt-only save, legacy migration/import and direct legacy deletion preserving generation. Declared reasoning was checked separately from verified capability evidence.
3. Task-result assertions exercised the real SessionCore result guard: API generation differing from package defaults was accepted with its trusted snapshot; missing/forged snapshot, hash, generation, route and prompt provenance were rejected.
4. Both contract scripts passed against the synchronized dynamic-world source; relevant ESLint passed there as well. These local scripts are verification artifacts under `previews/`, not shipped tests.
5. Real built-in-browser workflow: create/save/reopen an explicitly named QA API preset, retain reasoning and output settings, reject an excessive budget with focus feedback, clear the budget and reopen it as following the model limit. Existing prompt presets show text-only sections and the old generation configuration remains reusable.
6. The installed Fog work's three purpose selectors accepted one common QA API preset; readiness and effective parameter summaries updated correctly. Setup was canceled without starting a game or sending a generation request.
7. Desktop and simulated 390×844 viewport were inspected. Native dialog theme, no horizontal overflow, Tab containment, breakpoint draft retention and wide-editor Escape were verified. This is simulated browser layout evidence, not physical-device or performance evidence. No new motion was introduced.
8. QA resources were removed through the existing Storage Center lifecycle after asserting their exact identity and consumers. Only the task's QA route/model/generation/default prompt were removed. Original connection and existing General skeleton prompt/generation resources were retained. The final restarted browser page shows zero API presets, matching the initial state.

## UI self-check

| Before | After | Why |
| --- | --- | --- |
| Model, generation scheme and route required separate editing | One API editor with atomic save | One visible owner for request settings |
| Prompt and game setup exposed overlapping generation choices | Text-only prompt presets; API-only game selection | A changed setting has one predictable source |
| Compact editor moved outside themed shell | Native dialog remains under shell | Preserve tokens, control styling and modal focus |
| Game readiness retained stale missing-choice hints | Choice changes refresh summaries and readiness | Immediate, accurate selection feedback |

Controls retain native semantics and labels; loading requests are cancelable and stale results cannot overwrite a changed connection. Optional settings use defaults, errors explain the actual constraint and preserve the draft. Existing CSS tokens/components are reused. Necessary self-review used the frontend-design, emil-design-eng and web-design-guidelines skills; this was not an independent review workflow.

## External limitation

The real coffee provider list probe did not succeed. On this machine `cofi.date` resolved to `198.18.0.90`, a reserved fake-IP range. The existing credential network guard rejected that destination (`native_credential_network_denied`, surfaced as provider unreachable). A credential-free diagnostic reproduced the resolution and guard result. Network checks were not weakened; no real generation was sent. Provider reachability requires correcting this local DNS/proxy behavior before a successful live model-list claim can be made.

## Commits and coordination

| Main | Dynamic-world equivalent |
| --- | --- |
| `e809ef10` | `212d98c7` |
| `38fc4de7` | `5cae0186` |
| `f8d47205` | `a1d29b0a` |
| `5c87f84e` | `d28affc5` |
| `63c663f8` | `71c029a2` |
| `01e8f172` | `fbf63a06` |
| `de9c7786` | `40f1e7c3` |
| `05e7473d` | `7cd4f5f5` |

All eight changes were synchronized into the active `feat/dynamic-world` checkout. Locale integration retained the other task's staged/unstaged ownership: only this task's entries were committed and existing working values were checked unchanged. The other chat, **正式开始动态世界任务**, received the final hashes, ownership rules, validation results and network limitation. Its subsequent `7c7bbe8b` commit was observed. This task did not publish that task's ongoing branch work.

Local browser evidence: `previews/api-preset-desktop-final.png`, `previews/api-preset-mobile-final.png` and the final deployed form `previews/api-preset-delivered.png` (not committed). QA presets shown in earlier screenshots have been cleaned up. The final API presets tab is retained in the built-in browser.
