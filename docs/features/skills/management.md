# Skill management

Open **Extensions → Skills** to install, edit, move and remove Skills.

::: tip Where to find it
Open **Extensions → Skills** to install, edit, move and remove Skills.
:::

## Subpanel overview

The skill manager has three tabs along the top:

- **Installed** — what you have under `data/<user>/skills/<scope>/`. Filter by scope (Global / Project / Package / Preset / Character) or show **All**.
- **Browse bundled** — the Skills shipped under `default/skills/global/`, with each row showing whether your local copy matches, differs, or is missing.
- **Import** — entry points for installing from a file, from a URL, or by extracting from a character card / preset.

![Skill manager subpanel, Installed tab](/screenshots/skills/manager-installed-tab.png)

## Tab 1 — Installed

Each row shows:

- `name` — the skill's frontmatter `name`. Click to open the inline editor.
- `description` — one-line summary from the frontmatter.
- `scope` — chip (`global` / `project/<id>` / `package/<id>/<version>` / `preset/<name>` / `character/<file>`).
- `size` — file count + total bytes.

Row actions (right side):

| Action | What it does |
|---|---|
| **View** | Read-only Markdown render of `SKILL.md`. |
| **Edit** | Opens the inline editor (see [Inline editor](#inline-editor) below). |
| **Move to…** | Atomic move to another scope. Recheck the selection and exact pins after moving. |
| **Rename** | Atomic rename within the current scope. The directory and frontmatter `name` update together; update consumers that still use the old name. |
| **Delete** | Removes the Skill directory. Check consumers and pins before reuse. |

### Bulk select

Toggle **Multi-select** at the top to get a checkbox per row. With ≥1 row checked, the toolbar gains a **Pack selected into preset…** action — see [Embed export](#embed-export-into-presets-and-cards) below.

## Tab 2 — Browse bundled

The bundled tab compares your local copy of each shipped skill against what ships in `default/skills/global/`. Each row shows one of three states:

| Badge | Meaning |
|---|---|
| **installed (matches)** | Local copy is byte-identical to the bundled version. |
| **installed (your version differs)** | A local copy exists but its hash doesn't match the bundled one — you (or an iter-studio session) edited it. |
| **not installed** | No local copy. Click **Install** to materialize it into `global`. |

![Browse bundled, mixed states](/screenshots/skills/manager-bundled-tab.png)

The **Import all bundled** button at the top of the tab is the convenience equivalent of clicking **Install** on every "not installed" or "differs" row — it **overwrites** the bundled Skills with the shipped versions.

::: warning Overwrite is destructive
Import all bundled doesn't merge — it overwrites. If you've edited `event-summary-rules-zh` locally, importing the bundled version replaces your edits. The button label spells out how many same-named skills will be overwritten before you click.
:::

## Tab 3 — Import

Four entry points:

### Import from file

Upload a `.zip` of a single skill directory. The server validates the archive, previews any conflicts (per skill: `new` / `same` / `different`), and waits for your decision on each conflict before committing.

### Import from URL

Paste an `https://...` URL pointing to a raw `SKILL.md`. The server fetches it and installs as a single-file skill (no sub-files). For multi-file skills, use **Import from file** with a zip.

::: info Only HTTPS, only raw SKILL.md
The URL importer is intentionally narrow — it fetches one Markdown file. Anything more complex (multi-file, binary) needs the zip path. This keeps the import surface small and predictable.
:::

### Import bundled

The same action as **Import all bundled** in the Browse bundled tab. Listed here for discoverability.

### Extract from character card / preset

When you import a character card (PNG) or preset (JSON) that has an `embedded_skills_source` field, Atria shows a preview dialog automatically:

![Embed import preview](/screenshots/skills/embed-import-preview.png)

The dialog lists every embedded skill with its conflict state. For each conflict, you choose **Skip** (keep your local version) or **Replace** (use the bundled version from the embed). Same-content (`same`) entries are silently no-op. New entries (`new`) install directly.

The embed payload is removed from the character card / preset on disk after extraction — the skills now live in `skills/character/<file>/` or `skills/preset/<preset>/`. This avoids a "stale embed" trap where the inline payload diverges from the materialized files.

## Inline editor

Clicking **Edit** on a skill row opens an in-popup editor:

![Inline skill editor](/screenshots/skills/skill-editor.png)

- Left pane: file tree (SKILL.md + any sub-files). Click to switch.
- Right pane: Markdown editor with YAML-aware frontmatter highlighting.
- Top bar: file path, dirty indicator, **Save** (writes through `.staging/` and atomic-commits), **Add file** (creates a new sub-file at a path you specify).

Writes go through the same `.staging/` discipline as install: the new content is validated (path safety, size limits, frontmatter parse), and only on full validation does the staging file atomically replace the original. Failed writes leave the original untouched.

`SKILL.md` is special — you can edit it but you can't delete it from the editor (it's the required entry point). The skill itself can be deleted from the row action.

## Embed export — into presets and cards

Skills are most useful when they ship with the artifact that depends on them. A character card that needs a specific voice rule, a preset tuned for a particular sub-agent — both can carry the skills inline.

### Packing into a preset


The packer writes the skills into the preset's `extensions.atria.embedded_skills_source` field. On the next preset save the embed rides with the JSON. Other Atria users who import that preset see the embed extraction dialog described above.

### Packing into a character card

In the character editor, the **Bundled skills** section behaves the same way: select skills, pack, and they're written into `data.extensions.atria.embedded_skills_source`. On PNG export the embed serializes into the card's metadata, so distributing the card distributes the skills.

::: tip Threshold for inline vs zip
Small text-only skills use `inline-files-v1` format (Markdown content embedded directly). Larger or binary skills auto-upgrade to `archive-base64-v1` (zip + base64 + sha256). The packer picks per skill; you don't choose.
:::

## Scope migration

You can move a skill from `global` → `preset` → `character` (or back) at any time via the **Move to…** row action. The migration is an atomic filesystem rename — no copy, no temp state.

Scope determines which content the current consumer selects. Moving a Skill can change precedence or make it unavailable in that context; check selection and refresh exact pins after a move.

Typical migrations:

- **`global` → `character`** — You authored a writing rule, used it across cards, then realized one card has a specialized variant. Move it to that card's scope and let the more general version stay in `global`. Now both coexist; the card-scope one wins when its card is loaded.
- **`preset` → `global`** — A skill you packaged with one preset turned out to be useful everywhere. Promote it.
- **`character` → `global`** — A card-specific skill that ended up generalizing. Promote it.

## Stale references

After moving, renaming or deleting a Skill, check its invocation settings and any consumers that declared it. Native consumers pin exact versions; a changed or missing pin must be resolved before reuse. The retired profile visible-list and silent-dispatch behavior do not apply.

## Related

- [Skills overview](/features/skills/) — what a skill is, available scopes
- [Authoring skills](/features/skills/authoring) — write your own
- [Orchestrator integration](/features/native-orchestration) — current Native execution boundaries
- [Skills extension API](/development/extension-api/skills) — programmatic management from extensions
