# What is Atria

Atria is a deeply refactored roleplay chat platform based on [SillyTavern](https://github.com/SillyTavern/SillyTavern). It retains SillyTavern's mature character card ecosystem and data format compatibility while introducing extensive innovations in data transfer architecture, extensibility, and built-in tooling to deliver a more efficient and powerful roleplay experience.

Atria is fully compatible with SillyTavern data — character cards, world info, and presets can be used directly with zero migration cost. If you decide to stop using Atria, you can downgrade back to SillyTavern at any time without data loss.

## Why Atria

SillyTavern is an excellent roleplay frontend with an active community and a rich character card ecosystem. Building on that foundation, Atria introduces systematic improvements in the following areas:

### More Efficient Data Transfer

Most save operations in SillyTavern use full-payload transfers — every message edit, settings toggle, or world info change sends the complete data to the backend. For cloud-deployed users, this means significant bandwidth consumption.

Atria introduces an incremental sync mechanism that uniformly uses patch endpoints compliant with the [RFC 6902](https://datatracker.ietf.org/doc/html/rfc6902) standard. Toggling a plugin setting that previously transferred 3 MB of data now takes less than 200 bytes. Save operations also support debounced triggering and conflict detection, fundamentally preventing data corruption caused by concurrent writes.

### Stronger Extensibility

Atria provides richer infrastructure for plugin developers: character/preset state APIs, managed regex providers, unified extension injection settings, a function call runtime, and more. Plugins can conveniently reuse the user's existing API and chat completion presets without redundant configuration.

### Built-in Professional Tooling

Atria ships with several professional tools designed for roleplay scenarios — Memory Graph, multi-agent orchestration, character card editing assistant, search plugins, and more — all ready to use out of the box without installing third-party extensions.

## Core Features Overview

### Memory Graph

A character memory system based on knowledge graph structures. It organizes events, characters, locations, storylines, and other information from roleplay sessions into a graph structure, enabling intelligent memory recall through either LLM-driven multi-hop exploration or semantic vector retrieval with optional rerank. The recall model finds the most relevant memory nodes for the current storyline and injects them into the creative context.

→ [Memory Graph Documentation](/features/memory-graph)

### Orchestrator

Before the creative LLM generates a response, multiple agents are automatically run for plot analysis and orchestration. Three execution modes are available: Spec Workflow (predefined stages and nodes), Single Agent mode, and Agenda Planner (dynamic scheduling). Orchestration configurations can be bound to character cards and imported/exported along with them.

→ [Orchestrator Documentation](/features/orchestrator/)

### Character Card Editing Assistant (CEA)

An AI-assisted editor for SillyTavern-compatible character cards and World Info, with natural-language edits, diff review and iteration history. Native game/project authoring now lives in Build → Atria Studio.



### Native Build / Atria Studio / Project Agent

Build is Atria's product authoring entry point. Atria Studio provides the project resource tree, structured editors, UI Builder, Source, Preview, Simulation, Build, Problems, Changes and Git History. Project Agent plans, validates and previews through the same Authoring Operation / Workspace / ChangeSet boundary and stops at explicit human Review.


### Search Tools

Provides web search capabilities for AI, supporting search engine backends like DuckDuckGo, SearXNG, and Brave Search. Two operating modes are available: as a callable tool for the creative LLM, or as a pre-request agent that automatically searches before generation and writes results into world info.

→ [Search Tools Documentation](/features/search-tools)

### Preset Decoupling

In SillyTavern, API presets and chat completion presets are switched together. Atria decouples them — switching API connections no longer changes the chat completion preset, allowing you to freely mix and match different LLM backends with different prompt presets.

### Incremental Sync

Saving world info, chat logs, user settings, and other content uniformly uses patch endpoints compliant with the RFC 6902 standard, dramatically reducing data transfer volume. Combined with debounced triggering and conflict detection (409 responses), it ensures data consistency in multi-device scenarios.

### Function Call Runtime

A unified function call / tool call runtime supporting two modes:

- **Native tool calls**: Compatible with native tool call formats from OpenAI, Claude, Gemini, and other APIs
- **Plain-text function calls**: Implements tool calls through a text protocol, suitable for models that don't support native tool calls

### Prompt Groups & Preset Groups

The preset manager and prompt manager support collapsible grouping systems for convenient organization and management of large numbers of presets and prompt entries.

### Card-Bound Presets and Personas

Character cards can bind dedicated chat completion presets and user personas. Bound presets and personas are independent of the global list, won't pollute the user's global configuration, automatically disappear when the character card chat is closed, and can be imported/exported with the character card. Card creators no longer need to ask users to manually import dedicated presets.

### Request Inspector

A per-user generation request diagnostic tool that can trace request details for all backends (including image generation and vector embedding / rerank calls), making debugging and troubleshooting easy.

### Authentication and Quotas

Supports GitHub / Discord OAuth login. Administrators can configure storage quotas for each user. Discord login can additionally require users to be members of a specific server or hold specific roles.

::: tip More Features
Atria includes many other improvements: Undo Toast system, Chat Persona Lock, dynamic model lists, World Info activation chain tracing, preset-associated world info, extensive mobile / Android optimizations, startup performance improvements, and more. These features are covered in detail on their respective pages.
:::

## Compatibility

Atria maintains full data format compatibility with SillyTavern:

| Data Type | Compatibility |
|---------|--------|
| Character Cards (PNG/JSON) | ✅ Fully compatible, bidirectional import/export |
| World Info / Lorebook | ✅ Fully compatible |
| Chat Logs | ✅ Fully compatible |
| Chat Completion Presets | ✅ Fully compatible |
| Third-party Extensions | ✅ Compatible, with isomorphic-git fallback support |
| User Settings | ✅ Fully compatible |

::: info Bidirectional Migration
You can migrate from SillyTavern to Atria at any time, and vice versa. Data generated by Atria-exclusive features (such as Memory Graph, orchestration configs, etc.) is stored in separate state files and won't affect SillyTavern's core data structures. However, it's still recommended to back up your data before migrating.
:::

## Next Steps

Ready to get started?

→ [Getting Started](/guide/getting-started) — Install and deploy Atria
