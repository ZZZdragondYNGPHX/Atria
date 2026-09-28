# Native product UX — Group 8

Branch: `fix/native-product-ux-audit`.
Baseline: Group 7 `a1125deb9`.
Pushed HEAD: `42265308d4b08964c71ddfbcbbccf7730bda4a4a`.

Issue commits:
- NUX-041 `6cb86b33c`: exact Work Plugins and explicit two-item Global Plugins.
- NUX-042 `42265308d`: dependency-first physical retirement and Native-owned capabilities.

Ownership inventory: [retirement](native-extension-retirement.md).

### NUX-041

Plugins now separates Work Plugins from Global Plugins. Work inventory reads every
installed exact PackageVersion, shows readable plugin/Work names, dependencies and
installation-time permission consent, and navigates to the owning Work. Partial
version failures remain visible with retry. Raw IDs/contributions stay in Details.
Global Plugins is an explicit Regex/Search Tools allowlist and reuses their existing
persistence and own settings controls, with keyboard-operable drawers and placement
restoration. Orchestrator/Memory, third-party installation, the legacy manager and
unfiltered extension settings are absent from this product surface. Workspace command
copy now reflects Work/Global ownership. The physical retirement follows in NUX-042.

Validation: five focused/adjacent suites passed 30 cases, including Package plugin
capability/dependency guards. Three real Edge utility/navigation/settings scenarios
and an additional two-installed-version Work plugin scenario passed. 390px screenshots
were inspected. Changed JavaScript lint and diff checks passed. An initial browser
command was interrupted because its test-edit script used the wrong relative path;
the corrected final cases passed. Existing absent Stable Diffusion service startup
probes were non-fatal and will disappear with the planned physical retirement.



### NUX-042

Physically retired every extension product except Regex and Search Tools after
moving retained Orchestration/Memory to Agents, experience/UI runtime to Native,
and shared helpers to core. The explicit capability bootstrap replaces discovery,
installation/update, arbitrary extension loading and legacy profile authority.
Current Atria capability settings retain only supported data and persist under
`atri_capabilities`; watchdog recovery cannot disable Agents or Work capabilities.
Memory and Hybrid retrieval now use exact Native Retrieval references exclusively.
The vector HTTP boundary rejects raw legacy provider requests. Browser embedding
uses the bundled WebLLM SDK with supported-model selection in Runtime, serialized
model switching and cancellation/result guards. File uploads retain core filename
validation. Retired UI, source, providers, routes, default Quick Reply seeds,
installation backup categories, tests and feature documentation were removed.
See the dependency inventory for module owners and preserved contracts.

Validation: the full related Native/Shell/Agents/Memory/Experience/Skills/Regex/Search
regression passed 354 suites, 3532 tests (72 optional database cases skipped).
Six boundary/cache/browser-provider suites passed 47 tests; seven adjacent startup,
retained-editor and FS/SQLite restore suites passed 29 tests (22 optional/unselected
cases skipped). Content seeding and retirement guards passed 11 tests (8 external-DB
cases skipped). A3/A4/A5/A6/A9/P4 residual scripts passed after updating their
module paths and obsolete Secret/Plugin expectations to the current product contracts.
Full JavaScript lint, changed backend lint, frontend cache build and
diff checks passed. Six real Edge cross-domain scenarios passed. The strengthened
Plugins case verified all five capabilities ready and retired install/SD/Quick Reply
routes returning 404. A separate real Edge case loaded the bundled browser model
catalog; its 390px rendered result was inspected. Actual GPU inference was not run.

An exploratory whole-repository run, before obsolete-fixture corrections, returned
723 passed / 34 failed / 6 skipped suites. Retired-only tests were removed and affected
retained fixtures were corrected and rechecked above. That exploratory run also
encountered absent MySQL/PostgreSQL services and unchanged Windows-sensitive tests
(SQLite open-file replacement, system Git same-stat detection, Termux shell tests,
Android-path staging simulation). It is not recorded as an all-green repository run.
The final related Group regression is the 354-suite run above. No Android/Docker
build, physical-device evidence, paid provider request or real GPU inference is claimed.

Next: Group 9, NUX-043.
