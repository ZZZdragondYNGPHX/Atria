# Model generation settings — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `model-generation-settings`
- Date: 2026-10-19 (America/Los_Angeles)
- Primary Workspace: product `main`
- Start HEAD: `aaeccd8e`
- Implementation HEAD: `47733e9d`
- Dynamic world cherry-picks: `31f706cf`, `80618f17`, `b4c27af6`, `70e0993b`, `312a6e14`
- Status: Complete

## Result

The user approved removing the connection's minimum total output budget and editing generation parameters from the model page, with existing configuration authorities reused. The actual local launcher clone was deployed and verified in the built-in browser.

- Removed `minimumOutputTokens` from the connection editor, provider request calculation and execution reserve calculation. Connection normalization strips the retired option from existing records. Generation output remains bounded by the model output ceiling.
- The model editor now exposes maximum output, protocol-specific reasoning controls, temperature, Top P and streaming. Stop/tool/cache controls use an advanced disclosure. Model connection and capability limits remain a separate save.
- Reused `core.generation-profile` and PromptPreset persistence; no sampling or reasoning fields were duplicated on ModelProfile. Standalone configurations publish through resource revisions; preset-owned configurations publish through the preset authority and its expected revision.
- Users select a named exact configuration, inspect routes using it, and explicitly check current-model routes to adopt a published revision. Other routes retain their exact configuration and prompt pins. Route adoption uses the existing configuration fingerprint as `If-Match`.
- Project/Package configurations remain read-only and can be copied to Library. A scheme without routes can be saved for later route creation. Publish success followed by adoption failure remains recoverable without publishing a duplicate revision.
- Added dirty-draft guards, keyboard submission with IME guards, immediate pending state, inline validation/error focus and status announcements. Reused existing controls and global button styles.
- Fixed the observed desktop-to-compact transition hiding the active editor. The existing editor DOM and draft remain visible across the breakpoint.

## Executed validation

- Targeted ESLint passed for all eight changed runtime/adapter/endpoint JavaScript modules on main and after dynamic-world integration. Locale JSON parsing, syntax checking and `git diff --check` passed.
- The generated shell localization map retains its pre-existing ESLint baseline: 215 errors, with the same rule counts as the starting commit (212 quote errors, 3 duplicate keys). The three deleted obsolete entries introduced no new lint errors. This unrelated baseline was not reformatted.
- Local inline assertions verified removal of old connection floors, a 4,000-token generation reserve under a 20,000-token model ceiling, rejection above the ceiling, and OpenAI request output/reasoning serialization without the old floor.
- Local inline assertions exercised standalone/preset publication, expected-revision conflicts, exact route adoption preserving prompt pins, configuration fingerprints and partial adoption failure.
- Actual built-in browser on the deployed service: no connection floor control; provider-specific reasoning controls; native rejection of output 20,001 against model limit 20,000; standalone generation publication; model and route creation; save-and-apply of a new generation revision; concurrent route change rejected while retaining the competing edit; preset-owned generation publication; Package read-only and editable Library-copy draft.
- Canceling the dirty-reload confirmation retained the edited draft. Desktop and simulated 390 × 844 layouts were inspected. The breakpoint fix retained the draft and produced a visible editor without horizontal document overflow. This is simulated viewport evidence, not physical-device testing.
- Test-only persisted model, route, preset and generation resources were removed through existing APIs. The temporary route recovery payload had to be purged before deleting its retained dependencies; user data was not targeted. Active configuration returned to its original one connection, zero models, zero routes and zero Library generation resources. No provider generation request was sent.

## UI self-check

| Before | After | Why |
| --- | --- | --- |
| Connection budget could silently raise a generation request | Only generation output and the model ceiling determine output | Removes overlapping controls and preserves a single effective budget |
| Parameters were only available in prompt authoring | Model settings edits the same exact generation resources | Gives model setup a coherent entry point without new persistence |
| All provider controls appeared together | Connection protocol selects relevant thinking controls | Keeps the common path understandable and advanced controls available |
| A concurrent route edit could be overwritten | Fingerprint conflict leaves the route untouched with recovery feedback | Protects parallel editing |
| Switching desktop editing to compact hid the editor | Existing editor and draft stay visible | Preserves continuity and keyboard work |

Microinteraction diagnostic: 7/8 rows, rounded score 9/10. Visible triggers/states, predictable revision rules, synchronous pending feedback, proportional status/error feedback, visible editing modes and first-use labels pass the code/browser self-check. Long-term reduction of beginner help is not implemented; if that later becomes necessary, reuse an existing persisted help/disclosure preference rather than adding a second configuration system. Sub-100ms timing was not instrumented. Keyboard/IME guards were inspected in code; a real IME session was not exercised.

The Web Interface Guidelines self-check covered labels, input names/autocomplete, existing focus styles, error focus, live status and layout continuity. No new animation system or independent review workflow was introduced.

## Delivery

Integrated and pushed main, updated the stable checkout and actual local launcher clone, and cherry-picked/pushed only this feature to `feat/dynamic-world`. The locale-tail conflict was resolved by retaining both World translations and the new model settings translations. All eight unrelated in-progress files in the parallel workspace remained unstaged and uncommitted.

Notified “正式开始动态世界任务” (`01a15768-5215-7ae1-a707-7b7806bcfc13`) of the synced commits, authority reuse, retired field, concurrency protection, verification and live deployment. The temporary implementation branch was deleted after main integration. Screenshots remain local, outside version control.
