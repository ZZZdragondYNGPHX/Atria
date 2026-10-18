# Native product localization

NUX-044 preserves the integrated Atria visual system and existing locale authority.
The Shell formatter resolves stable keys before substituting values. Native Runtime,
Library, Studio, Play, Agents, Skills, Regex and Search Tools use their existing
translation catalogs; both zh-CN and zh-TW cover the audited product copy.

## Copy and data boundary

 Format dynamic copy with a stable
English template and positional values. Preserve authored resource/preset/Skill
names, provider/model identifiers, exact references, paths, source text and error
codes. Search commands declare literal titles/descriptions where they contain
user data; route details and authoring pickers also preserve names verbatim.
