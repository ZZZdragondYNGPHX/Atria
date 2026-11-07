# Argon request experiment

An OpenAI-compatible Connection may set `options.argonTest` to
`{ "mode": "light" | "strong" | "baseline", "modelId"?: "exact alias" }`.
Omission/baseline sends the original body. The Services compatibility editor owns
this setting; no browser request interceptor or script is required to apply it.

Only `role.narrator` routes with a remote model containing `argon` (case insensitive),
or exactly matching the optional alias, participate. Tool-bearing requests,
structured outputs, explicit caches, assistant prefill and tool messages remain
unchanged. Light adds prefixes to the first eligible instruction and newest user
text; strong also visits further instruction messages. Caps include newlines:
400/1200 JavaScript characters respectively, not tokens.

The existing PromptIR request ID deterministically seeds the prefixes. The same
renderer runs for counting, preview and wire generation, so the existing context
budget and compiled request binding include the experiment. Authored resources and
PromptIR remain unchanged. New requests get new prefixes; rerendering one request
does not. Sampling controls, model ID, schema, tools, credentials, parsing and
Native fallback policy are untouched. To forbid Atria's own fallback, set the API
preset's maximum fallback attempts to zero through its existing editor.

This changes input text. It neither authenticates the remote model nor guarantees
that a gateway honors a particular route. Compare prose with the baseline using
the same prompt, source branch and sampling settings.
