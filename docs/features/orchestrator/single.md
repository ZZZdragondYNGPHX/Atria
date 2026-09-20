# Quick guidance and legacy Single

Single remains available in the execution selector's Compatibility group. It synthesizes one Spec node from the existing global system and user prompts; it does not have a character-scoped preset library.

Use **New quick guidance workflow** for a new one-node Spec preset. New templates disable exploration tools and offer two compact prompt fields. More complex workflows use the full Spec editor and iteration studio.

To preserve an existing setup, select Single and choose **Copy to a fixed workflow**. Review the prompts, choose a name and destination, and optionally enable the copy after saving. The action always creates a separate entry, even if the name already exists. Legacy prompts and the previous preset are retained. Switching modes alone does not synchronize Single and Spec prompts.

Copies preserve inherited tools and model routing; new templates disable exploration. Injection settings remain shared. Preset-scoped Skills are resolved under the new preset name, so check any name-specific bindings.

The four main modes are Research (Loop), Fixed workflow (Spec), Dynamic delegation (Agenda) and Direct writing (Director). The first three produce guidance for the reply model; Director edits and commits the reply itself. Tools are shared capabilities: Spec workers and Agenda agents can use them too. One node does not guarantee one network request.

The panel distinguishes the effective source from the scope being edited. Loop and Agenda budget exhaustion remain visible even when partial guidance is available. Old snapshots remain readable, but result reuse requires a matching execution fingerprint.
