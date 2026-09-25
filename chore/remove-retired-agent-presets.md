# Remove retired bundled agent prompt presets

Date: 2026-09-25. Branch: `chore/remove-retired-agent-presets`.
Baseline: `3f5b001cd1ef16870816d6ee0ca0e4087bf6cc7a`.
Implementation: `40dbf651b4cbd2abe4486c30a485cba9c87e0fbf`.

User authorized deleting unused bundled presets and pushing this cleanup together
with the previously held native orchestration prompt update.

Repository reference audit confirmed no runtime loader/importer uses the three
static public/presets assets. Removed plugin-only.json, agent-non-director.json,
and agent-director.json. Removed their two obsolete content tests and eight unused
import-related translation entries per locale (zh-CN / zh-TW). Updated the shipped
Agenda documentation to describe fixed-definition restoration and Runtime Routes.
No installed user preset copies, storage or route bindings are changed.

Remaining plugin-only matches in tests are an unrelated Regex fixture ID and a
historical user-seed example comment; neither references a bundled asset.

Validation: 18 tests passed across atri-agenda-defaults (4),
native-orchestration-prompts (9), workspace-preset-help (5). Changed-test ESLint,
native localization coverage (both locales, including JSON parsing), and git diff
whitespace checks passed. No full suite, paid inference, Android or Docker build.

Earlier prompt work: `fix/native-orchestration-presets.md`. Its no-push hold was
superseded by the user's explicit push request for this follow-up.
