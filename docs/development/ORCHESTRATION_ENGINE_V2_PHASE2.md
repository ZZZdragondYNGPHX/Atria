# Phase 2: headless orchestration kernel

The Engine modules validate JSON Plans and graph identities, reject implicit unbounded cycles,
diagnose unreachable nodes, intersect capabilities into Runtime tool allowlists, validate atomic
Planner proposals, order ready nodes and retain ResultEnvelopes. A pure policy controller delegates
through Runtime fanout/join and keeps task graphs, attempts, result references and budgets in the
parent checkpoint. Output guards separate guidance from reply ownership.

The adapter uses existing AgentRuntime, ParallelExecutor, checkpoint factory and event observer.
It does not call providers or create memory/storage services. Production mode coordinators are
not switched by this commit. Advanced arbitration primitives are present but still require bounded
host invocations and mode integration before the full feature can be declared complete.

Executed checks: Runtime + Engine **13 suites / 128 tests passed** in Jest. Cases include dependency
ordering, result IDs, forbidden reply tools, graph failures, dynamic task dependency cycles,
atomic rejection, majority/reference validation and changed-plan resume refusal. JSON validation
accepts plain objects from another realm (including IndexedDB/structuredClone), while rejecting
functions and class instances. Browser/mode equivalence validation remains subsequent work.
