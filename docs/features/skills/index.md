# Skills

Skills provide reusable procedural guidance. Installing a Skill does not grant tools, Source access or execution authority to a Native Plan.

## Anatomy of a skill

A skill is a directory:

```
director-anti-cliche-zh/
├── SKILL.md          # required — frontmatter + body
├── references/       # optional — supporting checklists, longer references
├── examples/         # optional — worked examples
└── assets/           # optional — binary attachments
```

`SKILL.md` is the only required file. It carries Anthropic-standard YAML frontmatter:

- `name` and `description` are required.
- `license` and `metadata.*` are optional and follow the Anthropic standard. Atria does not introduce private namespaces.
- The body is the contract — when an agent reads this skill, the body is what they consume. Write it directively; put your "when to use," "how to use," and "tools you should prefer" guidance into the body.

For the full authoring playbook, see [Authoring skills](/features/skills/authoring).

## Scopes

Skills use `global`, `project`, `package`, `preset` and `character` scopes. Project paths use `project/<projectId>`; Package paths use `package/<packageId>/<packageVersionId>`; preset paths use `preset/<name>` without an API segment. Only scopes belonging to the current context participate in selection.

Native Project/Package selection uses global → project → exact Package version precedence. The retained chat selection uses global → selected preset → character precedence. These are distinct contexts; moving or renaming a Skill can change which content is selected. Recheck consumers after editing.

Preset and character Skills can still travel in `embedded_skills_source` when exporting their original artifacts. Importing that content does not import an executable Native Plan.

## Invocation and execution

Use **Extensions → Skills** to manage installed content and invocation settings. Skills can be off, always included, or available on demand where the consuming runtime supports that path. Native RP captures exact installed versions of selected always-included guidance for the Narrator. It does not inherit that guidance into independent Actors.

A Skill is not a Source grant or a capability. The Host-admitted Plan, current resource pins, role context and output contract remain authoritative. A catalog entry or a tool name in Skill text does not establish that the current runtime exposes that tool. See [Native Plans and Runs](/features/native-orchestration).

## Bundled guidance

The bundled tab shows the writing and method Skills currently shipped in `default/skills/global/`. Names such as `director-character-voice-zh` identify reusable guidance; they do not enable the retired Director execution protocol. Installing bundled content does not attach it to every Agent.

See [Skill management](/features/skills/management) for installation and editing, and [Authoring skills](/features/skills/authoring) for file format and examples.
