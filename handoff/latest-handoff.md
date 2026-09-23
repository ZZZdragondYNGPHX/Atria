# Active checkpoint: Model / Prompt / Runtime — P7 complete, ready for P8

- Repository: ZZZdragondYNGPHX/Atria
- Work branch: refactor/atria-model-prompt-settings
- Main unchanged: 2d1c3ec9c8039ecc4728ebe712f4a9f14186906f
- P6 HEAD: 2351be51e8c8cbdadf0966104ec607018e93de6e
- P7 validated/pushed HEAD: bde2fbc1ed58bc8f9a915dc7c2e72c210917c245
- Date: 2026-09-23
- Next: P8 Hard Cut / Integration / Freeze, only on explicit continuation.
- Continue this branch; no new task branch or P0-P7 redo. P7 did not merge main.

## Delivered

Settings now exposes only allowlisted preferences using original controls/events/
persistence; no unfiltered Advanced drawer or model/generation authority. Studio's
old Presets editor is replaced by Package Metadata without package.presets writes.
Search includes exact Prompt/Generation resources with scoped IDs/revisions, owning
Library detail routes, same-section focus and Command-open refresh. No cross-domain
editors or name-based resource identity. Existing routing aliases are navigation-only.

Legacy preset UI reads are concentrated in one explicit compatibility facade and
Native-disabled, even in an empty mounted Native Shell. Native options point at
Runtime; Native AI routing/card-embed flows do not consume legacy names. P4 execution
and A8 human Review remain. Added Chinese Prompt/Runtime/Settings labels and stage
formatting without translating user resource names/IDs/JSON. P7 guard/CI added;
P4/A6 transitional seams tightened rather than weakening authority invariants.

## Validation

- Final relevant Native/atria-shell/game-runtime/orchestrator FS/SQLite regression:
  **210 suites / 1837 tests passed**.
- Shell/compatibility focused after Command-open refresh: **24 / 95** (overlapping;
  final no-Session Shell boundary test is included in the final broad run).
- P4-P7 real local-server Playwright/Edge: **12 cases passed** at desktop/mobile.
  Final P4/P7 follow-up after the UI boundary check: **6 passed** (overlapping).
- Screenshots inspected and recaptured: desktop/mobile Settings/appearance, exact
  selected Library resource and Chinese Prompt editor. Fixed internal labels and
  same-section exact navigation; no unresolved visual defect observed.
- P0-P7, A0-A8, N9/N10 guards, repository/touched-test lint, syntax/diff passed.
  Frontend prebuild-cache passed (cache hit, not a forced cold build).
- No Android/Docker, MySQL/PostgreSQL services, external model credentials or real
  mobile device. Full storage extension not rerun: P6 records four pre-existing
  Windows SQLite failures reproduced on unchanged P5.

## Next

Read planning/atria-model-prompt-settings/NEXT.md and P7-VALIDATION.md. P8 owns final
hard-cut/adapter/residual audit, complete relevant acceptance/API docs/build and
branch/PR/merge readiness. Retain Build and A1/A2/A7/A8, exact references, Package
freeze, no dual-write/hidden fallback and P4 request/Secret/fallback boundaries.
Do not proceed without user continuation or describe merge readiness as an actual
main integration. Explicit non-Native/recovery/third-party host islands remain.
