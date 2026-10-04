# Atria MCP Capability Expansion — Chat / Session

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 7. Chat / message capability direction

Chat/session operations are a first-class required use case for MCP-assisted debugging.

Candidate semantic tools:

- `atri_chat_list`;
- `atri_chat_read`;
- `atri_chat_send`;
- `atri_chat_edit`;
- `atri_chat_regenerate`;
- `atri_chat_delete`.

The exact set and semantics are not yet frozen.

These operations must go through Atria's Session/message authority rather than editing persisted chat files or databases directly.

For generation-triggering operations, useful result metadata should expose non-secret execution identity/status where the product can provide it, such as session/message/generation identifiers and status. Provider credentials and secrets remain redacted.

## 12. Chat / Session semantic model

Chat/Session tools must preserve Atria Native Session authority rather than emulate mutable legacy chat CRUD.

### 12.1 Immutable Timeline is preserved

Committed Native Timeline messages/revisions are append-only and immutable.

MCP must not introduce an in-place committed-message edit/delete path merely to imitate conventional chat APIs.

User-facing intents such as edit, retry, restart and cleanup should map to Native revision/branch semantics.

### 12.2 Read surface

The accepted read direction includes semantic tools such as:

- `atri_session_list`;
- `atri_session_get`;
- `atri_chat_read`;
- `atri_chat_history`;
- `atri_chat_branches`;
- `atri_generation_status`.

Chat reads should expose useful Native identity/provenance where available, including session/message/revision/branch/sequence identity, role/content, attachments, projection and bounded generation/runtime metadata.

### 12.3 Send

`atri_chat_send` is a first-class MUTATE operation.

It should:

- require the target Session and expected current revision identity;
- fail closed on revision conflict rather than silently rebase;
- use the existing Session/generation authority;
- expose generation/cost side-effect metadata;
- return resulting message/revision/branch identity and runtime provenance.

The 2026-10-04 compatibility fix commits a user Timeline message through the owning Session append authority before starting generation at the returned exact revision. Both steps share the reviewed payload, one approval and the expected server boot. A generation-start rejection or lost response after append retains the committed message/revision evidence and reports an indeterminate partial result; no automatic resubmission is permitted. An accepted asynchronous start must still be polled to establish completion.

### 12.4 Regenerate / retry

`atri_chat_regenerate` maps to Native retry semantics:

- find the coherent boundary before the current assistant reply;
- derive/fork the appropriate branch/revision;
- generate a new reply;
- preserve the original committed reply in history.

Regenerate is MUTATE with generation/cost side effects.

### 12.5 Re-enter instead of in-place edit

Committed user-message editing should be represented as `atri_chat_reenter`, not as an in-place `chat_edit`.

The semantic meaning is:

- derive from the coherent boundary before the target user turn;
- submit replacement user content on a new/derived branch;
- preserve the original branch/history.

### 12.6 Restart / branch operations

Accepted semantic direction includes:

- `atri_chat_restart_from`;
- `atri_chat_branch_switch`;
- `atri_chat_branch_fork`.

These are MUTATE operations because they change active Session state/branch selection while retaining immutable history.

Branch/history inspection remains READ.

### 12.7 Remove from active conversation

The user requirement to "delete/remove test messages" should be satisfied without physically mutating committed Timeline history.

A semantic operation such as `atri_chat_remove_from_active` should:

- derive or switch to a coherent branch/revision that excludes the target message and subsequent test content from the active Timeline;
- preserve the original historical branch/revisions;
- report where the removed active content remains recoverable.

This is normally MUTATE rather than DESTRUCTIVE because historical data is retained.

True physical deletion of an individual committed Native Timeline message is not part of the target MCP surface.

### 12.8 Session operations

Accepted Session-level semantic direction includes:

- READ: list/get/history/saves;
- MUTATE: rename, create save, restore save;
- DESTRUCTIVE: delete Session.

Restore/save operations preserve Native revision semantics and must not silently overwrite historical authority.

### 12.9 Generation cancellation

Generation initiated through MCP must have a corresponding cancellation/status surface.

The preferred direction is a shared generation authority such as:

- `atri_generation_status`;
- `atri_generation_stop`.

Cancellation is INTERACT-oriented: it stops in-flight work and should not fabricate a committed result.

### 12.10 Operation receipts

Important MUTATE/DESTRUCTIVE semantic tools should return a structured operation receipt where practical.

Useful fields include:

- operation identity/type;
- Session/project/domain identity;
- before/after revision and branch identity;
- objects/messages created by the MCP session;
- generation/operation identity;
- runtimeBootId / runtime provenance;
- whether and how the operation can be reversed or removed from the active state.

Receipts are the preferred basis for narrow cleanup leases such as "remove only test messages/Projects created by this MCP session", rather than heuristic ownership guesses.
