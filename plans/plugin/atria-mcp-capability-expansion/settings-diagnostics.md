# Atria MCP Capability Expansion — Settings / Connections / Diagnostics

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 16. Settings + Connections + Diagnostics semantic model

Settings, Runtime Connections and Diagnostics remain separate authorities rather than being collapsed into a generic settings/API dump.

### 16.1 Settings read surface

MCP should provide broad read access to the current user's non-secret settings through semantic, scoped tools such as:

- settings catalog;
- path/scoped settings get;
- settings search.

Avoid a primary `settings_dump` surface that returns the entire settings document by default.

Generation Runtime Connections/Models/Routes remain outside generic settings reads when a dedicated Native authority already owns them.

### 16.2 Settings mutation uses precise patches

MCP should prefer bounded RFC 6902-style settings patch operations rather than whole-document replacement.

A settings mutation should:

- read the targeted current value;
- include conflict/test guards where practical;
- patch only the intended fields;
- fail closed on stale state/conflict.

Ordinary settings patch is MUTATE.

Whole-settings snapshot restore, if ever exposed, is a higher-impact/destructive operation and should not be conflated with normal patching.

### 16.3 Runtime Connection / Model / Route observation

MCP may broadly read non-secret Native generation configuration, including:

- ConnectionProfiles;
- ModelProfiles;
- RuntimeRoutes;
- GenerationProfile / PromptProgram exact references;
- readiness/relationship information;
- Secret references/labels.

ConnectionProfile identity may expose `secretRef` but never the referenced Secret value.

### 16.4 Secret boundary

MCP may list opaque Secret references/labels needed to understand configuration readiness.

MCP must not expose tools that return Secret values, API keys, tokens, passwords or credential payloads.

Do not expose a model-visible `secret_create(value)` tool that requires raw credentials to pass through model context.

Credential entry should remain a user-facing Atria secure UI concern or another mechanism in which the model never receives the credential value.

### 16.5 Connection probe

Connection/provider probing is a first-class diagnostic operation.

The server may consume the referenced Secret internally while MCP receives only non-secret discovery/status/error results.

Probe is READ-class with external-effect metadata such as network activity and, where relevant, possible provider cost.

### 16.6 Runtime configuration mutation

Creating/updating ConnectionProfiles, ModelProfiles and RuntimeRoutes is MUTATE.

Deleting these resources is DESTRUCTIVE.

Existing Atria reference/conflict validation remains authoritative; MCP must not provide force deletion when a profile is still referenced.


### 16.7 Diagnostics read surface

Diagnostics is a first-class MCP domain.

Current product authority already includes:

- overview/modules/ownership metadata;
- bounded log query and log clearing under product authorization;
- incidents list/detail/export/create-from-recent;
- startup sessions/detail/compare;
- per-process `serverBootId` embedded in startup diagnostic sessions;
- runtime provenance records for extensions/server plugins/external services;
- Atria-owned health/diagnostic evidence.

Browser diagnostics remain separate:

- `atri_browser_diagnostics` describes the MCP-owned browser/page;
- product Diagnostics actions describe Atria-owned diagnostic authority.

MCP should commonly correlate both.

The current diagnostics module/service provenance registry must not be mistaken for checkout/runtime exact-source provenance. Exact Source ↔ Runtime verification still requires the current runtime identity addition defined in section 10.


### 16.8 Diagnostic snapshot

A high-level read-only `atri_diagnose_snapshot`-style tool is desirable.

It should compose existing authorities without gaining new privileges, summarizing:

- runtime/source identity and match;
- browser freshness/errors/failed requests;
- recent product diagnostics/incidents/startup state;
- provenance;
- active Session/Project/PackageVersion/revision identity where available.

This provides a fast first diagnostic pass before deeper source/API/domain investigation.

### 16.9 Diagnostic mutation/destruction

Creating an Incident from recent evidence is MUTATE because it creates a persistent diagnostic artifact.

Clearing Atria-owned backend diagnostic logs is DESTRUCTIVE and must preserve the existing product/Admin authorization boundary.

Clearing only MCP-owned ephemeral browser-diagnostic buffers may remain INTERACT/low-risk because it does not destroy Atria's product-owned evidence.

### 16.10 Native generic API boundary remains narrow

The generic `atri_api_*` foundation should remain constrained to the discovered/allowed Native API boundary rather than being broadened to unrestricted `/api/**`.

Legacy/general API areas such as Settings, Chats, Characters and other user-state routes should receive dedicated semantic authorities when needed.

Capability expansion happens by adding controlled authorities, not by removing the generic API boundary.
