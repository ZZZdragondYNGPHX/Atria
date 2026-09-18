# Atria naming policy

- Product / UI / package identity: `Atria`.
- New Atria-owned code namespaces: prefer concise `atri_*` names, e.g. `atri_memory`, `atri_agent`, `atri_workspace`.
- SillyTavern upstream names remain unchanged unless Atria intentionally overrides the behavior.
- Legacy Luker persisted keys, protocol fields and compatibility-sensitive identifiers may remain until a dedicated migration provides backward compatibility.
- New code must not introduce new Luker-branded product identifiers.
