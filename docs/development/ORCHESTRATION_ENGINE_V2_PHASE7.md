# Phase 7 — Bounded result arbitration

The Engine supports pass-through, merge, best-effort, strict majority consensus, Judge and synthesis. Candidate pools use only the latest attempt per input node; arbitration records stable result references and provenance. Judge must choose an admitted ID and supply a reason. Synthesis must cite nonempty, unique admitted references. Structural consensus does not depend on object key insertion order. Failed/cancelled results are excluded; partial results require explicit admission.

Advanced nodes use a single native child Runtime request through the existing tool-calling/host generation chain. The decision schema grants no executable tool authority. No default legacy preset acquires a Judge. Policy state records the arbitration call budget and input set. Zero call budgets and input byte limits stop admission before invoking the model. This byte cap is a separate payload bound, not a claim of exact provider token accounting.

Validation: **14 Runtime suites / 139 tests passed**. Added Judge/synthesis execution and provenance, stale result rejection, zero-call/input-size admission, structural consensus, duplicate synthesis references. Existing Runtime cancellation, stale effect and durable recovery tests were included. Actual provider response compliance remains a real-model coverage gap.
