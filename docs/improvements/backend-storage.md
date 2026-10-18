# Backend Real-Time Storage

Atria has redesigned the data persistence architecture, shifting the responsibility of saving data changes from the frontend to the backend, achieving real-time persistence and fundamentally eliminating the risk of data loss caused by browser crashes, network interruptions, or unexpected closures.

## Problem Background

In SillyTavern, data saving is triggered by the frontend: the frontend serializes the complete chat data and sends it to the backend for overwrite. This pattern has serious data safety risks:

- **Browser crashes** — If the browser crashes before the save request is sent, all unsaved modifications are lost
- **Network interruptions** — Save requests may fail due to network issues, and the frontend may not retry
- **Generation interruptions** — If the connection drops during AI generation, the generated content may not be saved
- **Race conditions** — Concurrent save requests may cause data overwrites

Atria thoroughly solves these problems through backend real-time storage.

## Real-Time Data Persistence

All data changes arriving at the backend through [Incremental Sync](/improvements/incremental-sync) endpoints are immediately written to disk. The backend does not use in-memory caching or delayed writes — after each append, patch, or metadata update operation completes, the data is safely persisted to the file system.

## Chat State File {#chat-state-file}

Each chat file has a corresponding state file stored in the same directory as the chat file. The state file records:

- **updated_at** — Timestamp of the last write

```d2
direction: right

DIR: "chats/<character>/"
CHAT: "{chat}.jsonl" {
  style.fill: "#e1f5ff"
}
STATE: "{chat}.atria-state.chat_sync.json" {
  style.fill: "#fff3e0"
}
NS1: "{chat}.atria-state.memory_graph__meta.json"
NS2: "{chat}.atria-state.atri_orchestrator__schema.json"

DIR -> CHAT
DIR -> STATE
DIR -> NS1
DIR -> NS2
```

- `{chat}.jsonl` — Chat main file
- `{chat}.atria-state.<namespace>.json` — Per-plugin namespace state (one independent state file per plugin)

If the state file doesn't exist (e.g., chats migrated from older versions), the system automatically falls back and creates the state file on the first write.

## Generation Acknowledge

In AI generation scenarios, Atria's Unified Generation Layer implements a Generation Acknowledge mechanism. When the backend completes a generation and persists the result, it confirms in the response that the generation result has been safely stored on the server side.

This means that even if the frontend crashes immediately after receiving the generation result, data won't be lost — because the backend has already completed persistence before returning the response.

::: tip Comparison with Traditional Approach
In SillyTavern, AI generation results first arrive at the frontend, which decides when to save. If the frontend crashes before saving, the generated content is lost. Atria's Generation Acknowledge moves the save timing to before the backend response, fundamentally eliminating this window of vulnerability.
:::

## Serialized Chat Writes {#serialized-chat-writes}

When multiple write operations are triggered close together (e.g., rapid message edits, or generation completion overlapping with manual edits), the flow is:

1. Frontend write tasks are queued in arrival order
2. Tasks are executed one by one against incremental endpoints

## Collaboration with Incremental Sync

Backend real-time storage works closely with [Incremental Sync](/improvements/incremental-sync):

- Incremental sync handles "what to transmit" — only transmitting changed data
- Backend real-time storage handles "how to store" — ensuring data is safely persisted

Together, they form the foundation of Atria's data safety infrastructure.

## Related Pages

- [Incremental Sync](/improvements/incremental-sync) — The frontend counterpart to backend real-time storage
- [Improvements Overview](/improvements/overview) — Overview of all technical improvements
