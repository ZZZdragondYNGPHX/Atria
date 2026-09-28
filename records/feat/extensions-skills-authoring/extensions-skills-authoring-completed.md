# Extensions / Skills / AI Authoring Foundation — content and integrated verification

Completed implementation: 2026-09-27. Feature HEAD `93991c7ccea30ce7499935bbb91592ae137086dd` (pushed).

Integration on 2026-09-27: at the user's subsequent request, local and remote `main` fast-forwarded from `4dab353ac639d42eae885c79e18245267abd6820` to `93991c7ccea30ce7499935bbb91592ae137086dd`, retaining all 16 feature commits. Local and remote `feat/native-experience-modes-capability-deepening` were deleted after the remote main commit was verified. The already-merged remote `feat/component-form-composer-submit` was also removed. Long-lived branches remain. Incoming UI HEAD `cf6315abebdcb621b142e975d3ca0c3f61278a74` and every earlier P0–P9/Foundation commit remain ancestors of `main`.

## Delivered content

Five new global bundled Skills under `default/skills/global/`:

| Skill | Intended use |
| --- | --- |
| `atri-native-work-authoring` | Native Project/Package planning, modes, ownership, exact dependencies, plan/propose/Review workflow |
| `atri-native-ui-authoring` | UI v2, local state/preferences, typed actions, Opening, message/presentation and preview boundaries |
| `atri-native-runtime-authoring` | Turn/Task, lifecycle/workflow/time, Activity fact-before-Narrator, Scene/assets/Host cleanup |
| `atri-native-world-authoring` | Information exposure, Truth/Belief, exact Add-on/Community, Player, Shared ACL/seats and independent Realm |
| `atri-native-verification` | Production compilation, exact Preview, recorded Scenario and anchored Health repair evidence |

Each has focused Chinese instructions and one progressive reference. Work/UI/verification include valid JSON Project Source, interactive UI v2 and checkpoint/restore Scenario examples respectively. They are component/source/fixture documents, not self-contained importable Package archives. Current catalog IDs point to maintained compiler contracts; no copied schema or invented permission surface. Instructions distinguish API-reference character pagination from Skill-file line pagination, actual tool availability from requested authority, and Review from Commit.

Defaults are `metadata.atria-paths: studio,agents`: on-demand in those paths, off in narrative unless the user explicitly configures otherwise. Skills do not grant tools or bypass scope/deny. Existing accounts use Extensions → Skills → Browse bundled / import; this work did not mutate any real account or auto-overwrite user Skills.

## Integration fixes discovered by real installation/full regression

1. The existing frontmatter parser discarded `atria-paths`, which meant real installed Skill defaults differed from the earlier in-memory resolver fixtures. It now preserves a validated comma-separated list of known paths, including explicit empty/no-path, with duplicate normalization. Actual repository-install tests verify routing and deny behavior.
2. Native extension install/update now returns an operation ID and failed stage, and sends a correlated incident to the existing diagnostic authority. Installer stages cover URL, clone, manifest, files; save/lookup are tracked at the endpoint. Diagnostics omit URLs, downloaded code, request bodies and raw Git error text. No parallel log store or persistence path. Tests cover both install and update failures and correlation/privacy; prior revision/disabled behavior remains covered.
3. Restore staging path classification now uses the requested platform's path rules (POSIX versus Windows), fixing synthetic Linux/shared-storage path checks on Windows without changing the actual staging I/O authority.
4. SQLite closeHandle fixture uses close-before-file-swap on Windows, where open WAL unlink is forbidden; POSIX still tests stale-inode reads. A no-op closeHandle still fails on Windows. No SQLite production behavior was changed.
5. Updated obsolete assertions for the removed immersive Extensions button, removed legacy filesystem extension categories, actual World Info loader/new extension bootstrap, and A6's current direct `generate('normal')` bridge. None reintroduce duplicate managers or a second generation authority.

## Verification and exact accounting

Targeted new bundle suite: 7 tests passed. It installs real bundled content into a disposable SkillRepository, checks every linked file, validates per-path defaults and deny, reads current catalog topics, and drives the actual browser Studio agent tool loop through real ProjectAgentService/StudioService using mocked model responses. It reads the Skill reference and UI example, proposes UI v2, compiles/builds/previews, runs the production Scenario runner with `providerCalls: 0` and `persisted: false`, reaches Review, and verifies the live Project was not committed.

Full JS unit command:

`ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 npm --prefix tests run test:unit -- --runInBand --silent --verbose=false`

**Initial run: 793 suites passed, 9 failed, 7 skipped; 9116 tests passed, 9 failed, 92 skipped (809 suites / 9217 tests total).** This was not an all-green single run.

All nine failed suites subsequently passed in focused reruns:

- `termux/toolbox-update-guard.test.js` and `termux/toolbox-uninstall.test.js`: selected installed Git Bash in process-local PATH instead of the unusable WSL `bash.exe`; only shell syntax was checked, no Android/Termux runtime launched.
- `storage/engines/sqlite-close-handle.test.js`: portable Windows fixture order described above, 3 tests passed.
- `git-client.test.js`: same-second system backend test failed under the broad run and passed in isolated rerun without production change. **Treat as an intermittent test/backend timing limitation, not a proven root-cause fix.** Builtin authoring Git was covered by the new Studio integration and existing tests.
- `immersive/composer-message-actions.test.js`, `storage/migration/selection-mapping.test.js`, `world-info/workspace-boot-order.test.js`: current-contract assertions corrected, targeted reruns passed.
- `backup-sync/restore-staging.test.js`: platform-aware path classification fix, targeted rerun passed.
- `logging/l08-high-value-wiring.test.js`: current Native install/update diagnostics restored/tested instead of inspecting a deleted legacy endpoint, targeted rerun passed.

Final aggregate coverage is **802 executed suites / 9127 passing tests**, with 7 suites / 92 tests still skipped by the test configuration. This aggregate includes 2 newly added install/update incident tests after the broad run and the focused reruns above. It is **not** a claim that the final tree completed another full green run. No further blanket rerun was performed after the relevant checks passed.

Browser integration: **6/6 Edge tests passed** across `18-experience-p9.e2e.js` (3), `19-extension-runtime.e2e.js` (1), `20-extensions-ui.e2e.js` (2). Covers P9 Health/Shared at 390px, Studio exact preview/production Scenario at 1440px and 320px, authenticated module relative resources/disposal, and Extensions folder/path/script import/edit/activation at 1440px and 320px. Isolated temporary servers/data roots were cleaned. Browser checks preceded the final diagnostics-only endpoint and portability fixes; those final deltas received targeted unit/lint checks.

**21 relevant guards passed:** all `check-native-*.mjs`, A0–A9, and `check-p4-native-generation.mjs`. A6 initially failed its stale hidden-button pattern, then passed after correction to the existing Native generation bridge. Full product `npm run lint` passed; subsequent changed-code/test lint passed, with the `.mjs` guard checked using module/node parser options. Whitespace checks passed.

## Boundaries retained / remaining evidence

P5 fact-before-Narrator, P6 explicit context/display exposure and deny, P7 immutable exact content and independent Player, P8 canonical Session/ACL/Realm Sagas, and P9 production preview/recorded Scenario/anchored repair remain covered. No Android build/device run, Docker, paid inference, real-user data write, multi-device soak, actual speech/media/gamepad hardware evidence or CI run. MySQL/PostgreSQL container harnesses remained disabled. Six selected browser flows are integrated feature evidence, not a claim that every repository E2E specification ran.

The approved Foundation implementation sequence is complete (discovery, common invocation, runtime, unified UI, first Skill content, integrated verification), with the explicit intermittent Git-test caveat above. After fast-forward integration, 3 targeted suites / 25 tests, the Experience contract foundation guard and working-tree check passed on `main`. Prior detailed records remain `extensions-skills-invocation-completed.md`, `extensions-runtime-completed.md`, `extensions-ui-completed.md`. No new feature stage is inferred.
