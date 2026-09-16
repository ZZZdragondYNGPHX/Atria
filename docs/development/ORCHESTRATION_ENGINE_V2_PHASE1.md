# Phase 1: durable policy controller

Extends the existing Runtime, not its stores, executor or ports. New starts can supply
`controlMode: 'policy'` and JSON `policyState`. Policy receives a deeply frozen detached
run snapshot, previous receipt and state, and returns `{intent, policyState}`. The Runtime
validates tool/handoff/concurrency admission, saves the receipt and updated policy state
before the following effect. Model, tool, handoff and join receipts return to policy.
Wait resumes policy with user input in scratch. Old starts/checkpoints retain model or
legacy semantics; lost legacy generators still fail closed.

Verification: Runtime Jest **12 suites / 116 tests passed**, including restoring every
saved policy/model/join/handoff boundary, tool argument persistence, unauthorized intent
rejection, non-JSON state rejection and cancellation before effect admission. Existing
110 Runtime checks remain passing. Log: ignored `.git/engine-phase1-tests.log`.
No user data migration, production mode switch, new dependencies or provider changes.
Browser coverage follows Engine integration; Android and real-model checks not executed.
