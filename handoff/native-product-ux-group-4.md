# Native product UX — Group 4

Branch: `fix/native-product-ux-audit`.
Implementation commits: NUX-016 `9b6fdc7f6`, NUX-017 `dc49d4f39`, NUX-018 `3a33f86fb`.

## Group 4 — Native Knowledge Semantics

### NUX-016

Native Knowledge now shares a typed applicability contract between persistence and
compilation: bounded safe state predicates, all/any tri-state logic, and explicit
boolean direct activation. Successful direct activation bypasses keyword discovery,
while retaining target/authority/lifecycle controls. Compiled delivery no longer
re-evaluates applicability through compatibility providers. Unsupported stateEvents
fail with the field path before writes instead of remaining inert metadata; current
Native Event Journal facts remain available through state predicates. Semantics and
limits are documented in `docs/features/native-knowledge.md`.

Validation: four focused suites passed 64 cases, covering invalid fields and Native
Session/Package compilation. Three adjacent Library/Package/Studio suites passed 11
cases. FS/SQLite storage foundation passed two cases. MySQL/Postgres contract cases
could not run against the unavailable local services and were excluded from the
offline rerun; no external database validation claimed. Changed-file lint and diff
check passed. An initial test used the wrong entry-ID prefix; corrected fixture
passed. No UI surface was added in this contract/runtime issue.

### NUX-017

Knowledge delivery position and target selectors now share typed definitions across
server contracts, Native compilation and the current Studio editor. Positions are
before/after; targets are explicit kind strings or kind/id objects, optionally a
bounded OR list. Unknown aliases, empty selectors and arbitrary fields fail instead
of falling back or silently mismatching. Existing Studio fields use matching enums;
Source validation retains drafts before Review. Field errors expand the containing
section, focus the control and provide aria-invalid/describedby feedback. Package,
Binding and revision writes use the same validation.

Validation: five focused suites passed 90 cases, followed by 47 cases including the
new Binding persistence assertion and eight final editor cases including recovery
from invalid primitive types. Six adjacent Context/Library/Package/Studio suites
passed 30 cases. Real Edge 390px Studio typed editing, invalid Source rejection,
draft retention and corrected ChangeSet Review passed; screenshot inspected. The
first browser fixture reused the category name for its resource; giving the fixture
a distinct name removed the ambiguous test locator. Changed-file lint/diff passed.

### NUX-018

Native Knowledge discovery accepts only its supported keywords/aliases/regex
contract. semanticHints and vectorHints, even empty placeholders, now produce
field-path errors in Studio, server persistence and detached Native compilation.
They cannot imply retrieval behavior, invoke compatibility providers or silently
survive as inert authoring options. Native Memory retrieval remains its own
established responsibility; no speculative Knowledge retrieval service was added.

Validation: five focused suites passed 98 cases. Real Edge 390px Studio rejected
both unsupported hint fields while retaining the draft, and accepted a corrected
ChangeSet for Review. Changed-file lint and diff check passed.


Group 4 final regression covered 86 Native/Shell suites: 668 passed cases and
66 skipped cases (external database-engine cases excluded). The broad run found
two stale Group 3 fixtures: missing retrievalProfile in the frozen ID list and
a Memory routing service mock lacking retrieval ports/selecting the first form.
Both were corrected; their two suites / 27 cases passed. The other 84 suites
passed in the broad run. Real Edge 390px Knowledge editing, validation/draft
recovery and ChangeSet Review passed. No live external database validation claimed.

