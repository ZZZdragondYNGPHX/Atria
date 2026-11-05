# Work API purposes

A work defines purposes; the player supplies API presets. API preset names and default tool roles do not constrain work purpose names.

Task purposes live in `runtime.experienceContract.taskRuntime.slots`. Each slot has an `id`, optional `displayName` and `description`, and `requiredCapabilities`. Tasks reference its stable `bindingSlotId`. Different tasks can share a slot; different works bind independently.

Native turn purposes declared in `runtime.modelPrompt.roles` also support `displayName` and `description`. The role identifier (for example `role.intent_resolver`) selects a built-in host operation. It is not a connection name. Use Task slots for new author-defined operations; changing a display name does not create a new host operation.

At launch Atria displays required task and native turn purposes together. The player can assign one preset to all compatible purposes or separate presets. Bindings use the existing package-scoped `atri_task_bindings`; no global route is created or renamed. Required capabilities are checked against the selected preset. The preset supplies model and generation settings; an authored exact prompt supplies the work's semantics.

Studio **Runtime Design** edits role names/descriptions and the existing Task slots' names, descriptions and capabilities. Changes use the normal project ChangeSet and build flow. Connections and Secrets remain player-owned and are never included in a work.
