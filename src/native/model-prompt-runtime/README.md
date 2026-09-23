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
