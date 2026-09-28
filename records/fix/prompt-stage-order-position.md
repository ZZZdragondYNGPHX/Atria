# Prompt stage ordering and add position

Date: 2026-09-25. Baseline: `b3beb59dd1cb0d37e6329b6d669448aba213753c`.
Task branch: `fix/prompt-stage-order-position`.

The user withdrew global module insertion, program-wide uniqueness and module
cross-stage movement after learning about module stage constraints. Final scope
retains automatic stage-local ordering and fixes the jump to the stage ID field
after insertion. No module stage declarations or cross-stage rules were changed.

The compiler and editor now share the existing semantic-target / descending
priority / stable ID comparator. The editor sorts its cloned stage references
when rendering; compiling pinned resources retains the same behavior as before.
Adding a module focuses the replacement module picker with preventScroll and
compensates ancestor scroll offsets for inserted rows, keeping the picker at
the same viewport position. Empty or duplicate additions no longer rebuild the
stage tree. No persistence format or migration changes.

Validation: 60 tests across prompt authoring, preset ownership and P3 compiler
suites passed. Fixed an obsolete P3 fixture write order to persist module
dependencies before their referencing program. Edge at 1440px and 390px passed
consecutive insertions, picker focus/position (under 3px displacement), ordering
and save/reload checks. Changed-file ESLint, native localization and whitespace
checks passed. No Android/Docker builds or external model calls.

The preceding loading fixes and this task remain local, not pushed.
