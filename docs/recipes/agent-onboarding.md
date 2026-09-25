# Configure Native Agents

1. Open Runtime and create a Connection using a stored Secret where required. Add a Model, Generation and Prompt resource, then create a Runtime Route with those exact revisions.
2. Open Agents → Orchestration. Select Spec, Loop, Agenda or Director and assign the required roles to the configured Runtime Routes. Save the orchestration configuration.
3. For semantic Memory retrieval, create an embedding resource in Runtime → Retrieval. Add rerank only when needed, then select its exact revision in Agents → Memory.
4. Open a Native Session and run the configured workflow. Inspect Run and Diagnostics for failures and return to the named Runtime resource to correct configuration.

Player Secrets and Runtime configuration remain local to the player. Installed Work content is immutable; project changes use Studio → ChangeSet → Review → Apply.

Regex and Search Tools are the two optional Global Plugins. Orchestration and Memory belong to Agents and do not require extension installation.
