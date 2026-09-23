# P2 execution boundary

`GenerationService.execute(request)` is a host-independent entry point. It does not
replace any first-party caller yet. Prompt compilation remains P3; callers supply
`preparePrompt({ request, resolved, contextPlan })` as a port returning P0 Prompt IR.
It is called again for every fallback route, with that route's exact Prompt resources.

## Composition

- `RouteResolver({ persistence, library, providers, getScopedResource?, getSessionRoute? })`
  reads the existing P1 NativeModelPromptPersistence and Library `getExact(handle, ref)`.
  Project/Package reads are supplied by their existing authority through
  `getScopedResource(handle, exactRef) -> { snapshot, origin }`. It must return the
  exact owner and revision. Session routes similarly come from the Session owner.
  These ports are reads, not new stores; absent ports fail closed.
- `providers` maps Connection `providerAdapter` IDs to all six P0 Provider Port methods.
  Capability sources combine conservatively: explicit unsupported wins; supported
  evidence beats unknown; all provenance survives. Missing evidence means unknown.
- `GenerationService({ resolver, contextProvider, preparePrompt, secretPort, providerFor?, now? })`
  returns deeply immutable `{ snapshot, response }`.
  `providerFor(adapterId)` allows a host to supply providers independently of a
  minimal P0 resolver; it defaults to the concrete RouteResolver's provider lookup.
- `execute({ handle, requestId, role, routeRef, requirements?,
  unknownCapabilityOverrides?, fallbackMode?, signal?, ...contextInput })` clones
  JSON request input before the first await. Context/Prompt ports consume that input
  and the deeply frozen resolved config. No request overrides are written back.

`fallbackMode` defaults to `disabled`. `automatic` opts into bounded complete-route
fallback; `confirm` returns `generation_fallback_confirmation_required` instead of
sending the next route. Resubmission is the host's explicit confirmation action.
Original requirements survive fallback, along with tools/output-contract identity.
The route's `maxFallbackAttempts` bounds attempts; route cycles cannot cause loops.
Retries (`maxRetries`) remain owned by the caller's Role Router; this service does
not silently retry or implement a second orchestration engine.

Explicit streaming, reasoning, and tool-choice controls require respectively
`generation.streaming`, `generation.reasoning`, and `generation.tools` evidence.
Prompt IR tools/output contracts require `generation.tools` and
`generation.structured-output` in effective requirements. Unknown capabilities
remain unknown in snapshots even when the explicit override permits their use.
The override adds user provenance; it cannot override unsupported evidence.

Provider `countTokens({ resolved, contextPlan, promptIr })` returns a nonnegative
integer. It must use an appropriate host tokenizer. Input plus reserved output is
checked against the newly resolved model on every attempt. `renderRequest` consumes
`{ resolved, snapshot }`; only `send(rendered, { secret, signal })` receives the
credential. `parseStream(raw, { signal })` consumes the response/stream and returns
an assembled value; `normalizeResponse(parsed)` returns the public response. P2
does not expose live token callbacks. Send and parsing are bounded by route timeout.
`resolveSecret(secretRef, { handle, signal })` receives the same authenticated owner
handle as persistence, so a shared service need not rely on a mutable active user.

Only a `ProviderFailure('transport' | 'provider' | 'timeout')` thrown by **send**
permits fallback. Adapters must classify known transient transport/provider failures;
they must not wrap every exception in ProviderFailure. All other errors, including
Secret Port, parser, config, capability, budget and cancellation errors, stop.
Error payloads/causes are never copied into public diagnostics. Known credential
echoes in config or normalized output are rejected. Endpoints containing URL auth,
query strings or fragments are rejected before dispatch.

The minimal adapter in `src/native/adapters/generation-provider.js` implements
OpenAI-compatible messages and raw-text rendering using injected send/tokenizer/
stream ports. It accepts only its documented controls (temperature, topP, maxTokens,
stop sequences, streaming enabled), and rejects unsupported controls instead of
silently ignoring them. It does not import a global ST sender: a future host adapter
may supply an audited explicit-config sender. Real provider cutover belongs to P4.

P0 snapshots retain their frozen ABI. Their existing diagnostics field includes
effective non-secret Connection/Model/Generation/resource configuration so mutable
player profiles do not make an accepted request unexplainable. Secret refs remain in
the private resolved config; secret values never become snapshot/config fields.
# P3 Request Context and Prompt Compiler

P3 adds an opt-in preparation port; first-party consumers remain unchanged until P4.
Construct `new PromptCompiler({ hostDefinitions })` and inject its bound
`preparePrompt` into `GenerationService`. `compile` additionally returns immutable
diagnostics and selected stage IDs for preview. Compilation has no persistence,
network, model execution, Secret lookup or state mutation path.

The compiler consumes the exact `resolved.resources` closure produced by P2. It
validates resource identities again, resolves a bounded single-parent chain and
flattens stable module slots. Child stages append to parent order; redeclaring a
stage must retain its targets, condition and consumes contract. Derive `add`
introduces a new stable slot, `disable` suppresses it, `replace` changes its exact
resource while retaining the slot ID, and `configure.config` contains typed module
parameter values only. Duplicate operations on one slot in a child fail closed.
Definition conflicts and exclusive targets fail with deterministic `prompt_*` codes.

Within each stage, semantic target order, descending priority and stable slot ID
determine ordering. Provider renderers place context before/after history/input;
Response Directive follows current input and prefill is last. Program
`exclusiveTargets` supplements the always-exclusive `response.prefill` target.

Variable syntax is `{{scope.name}}` with optional own-property JSON paths. Scopes:

- `host`: typed read-only host view declared by the host's compiler instance.
- `param`: Program definitions, values from `request.prompt.parameters`.
- `module`: Module definitions, values from derive configure and defaults.
- `local`: Program `locals` definitions, values from `request.prompt.locals`.
- `artifact`: Program `artifacts` definitions, each `{ type, stageId }` declaring
  the producer. A later stage explicitly lists names in `consumes`. Host-supplied
  `request.prompt.artifacts[name] = { stageId, value }` must match that producer.

Local values are request scratch inputs, not persistent writes. Artifacts must be
explicit public workflow outputs, never implicit access to hidden model reasoning.
The compiler does not execute a stage or generate its artifact. A missing consumed
artifact fails closed. `request.prompt.stageIds` selects an orchestrator projection;
omitting it consumes all stages in Program order, using the same resources. The
host remains responsible for choosing projection responsibility and supplying outputs.

Types are string/number/boolean/json with required/default. Finite conditions use
`op/path/value` (eq, neq, gt/gte/lt/lte, exists, in, contains), `all`, `any`, or `not`.
Depth is bounded to 16; conjunctions/disjunctions to 64 entries; in to 256 entries;
contains to 4096 characters/elements. There is no expression/script execution.
New optional resource fields are omitted when absent, preserving the P0/P1 normalized
shape and existing resource hashes. Existing valid resources need no migration.

Context providers delegate host-owned fact selection. Task/Studio readers return
`{ source, items, budget, provenance }`; exact project/revision identity is required.
Native Session accepts an existing selected Context Plan. The host adapter at
`src/native/adapters/native-session-context.js` invokes the existing Native Context
Compiler rather than adding another Timeline/Knowledge scanner. It preserves selected
content and source refs, refuses stale revisions/unresolved reservations, and never
also adds the duplicate renderedWarmContext. Recent raw TurnGroups retain their
speaker-labelled text in user history messages; the adapter does not reconstruct
individual messages from canonical Timeline text. Current input comes from selected
context items, not a second `request.input` append.

Context selection estimates remain selection metadata. GenerationService calls the
Provider token counter once on the final IR per route attempt, covering instructions,
facts, history, input and protocol overhead. Provider implementations must count their
complete rendered payload; selection estimates must not be added a second time.
Native external prompt reserves leave room for directives within the final ceiling.

`renderPromptProtocol` provides OpenAI-compatible/raw-text fixtures, plus conservative
Anthropic/Gemini projections. The latter reject interleaved system directives they
cannot preserve instead of silently hoisting/reordering them. Tools/output contracts
are carried separately from instructions. P2 transport adapters remain deliberately
limited: unsupported tools/output/prefill and generation controls still fail closed.
P3 does not add production Anthropic/Gemini transports or first-party UI/call cutover.
