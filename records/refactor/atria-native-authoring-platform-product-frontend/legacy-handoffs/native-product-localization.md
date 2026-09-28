# Native product localization

NUX-044 preserves the integrated Atria visual system and existing locale authority.
The Shell formatter resolves stable keys before substituting values. Native Runtime,
Library, Studio, Play, Agents, Skills, Regex and Search Tools use their existing
translation catalogs; both zh-CN and zh-TW cover the audited product copy.

## Copy and data boundary

Localize action labels, instructions, loading/empty states, validation prose,
readiness summaries and recovery messages. Format dynamic copy with a stable
English template and positional values. Preserve authored resource/preset/Skill
names, provider/model identifiers, exact references, paths, source text and error
codes. Search commands declare literal titles/descriptions where they contain
user data; route details and authoring pickers also preserve names verbatim.

## Regression guard

Run `npm run check:native-localization`. The AST-based guard checks current Native
and Shell controllers, Agents workspace, Memory, Skills and retained Global Plugin
sources plus Regex templates. It detects missing Chinese keys, mismatched
placeholders, recognized raw UI/accessibility strings and pre-concatenated
translation calls. It reads capability catalogs without executing their modules.
The guard deliberately permits technical literals and dynamic user data; it is a
practical regression check, not a proof that every possible runtime string is UI.

The Jest coverage includes injected untranslated copy, literal-name preservation,
formatted dynamic content and Chinese command discovery. Real Edge scenarios cover
zh-CN at 390px and zh-TW at 1440px, loading/failure/retry, Runtime readiness, Library
names and search results, and Work/Global Plugins. Model IDs and resources named
`Save` / `Play` must remain unchanged.
