# Extensions / Skills / AI Authoring Foundation — Content and Integration

Completed implementation: 2026-09-27. Feature HEAD `93991c7ccea30ce7499935bbb91592ae137086dd` (pushed).

Integration on 2026-09-27: at the user's subsequent request, local and remote `main` fast-forwarded from `4dab353ac639d42eae885c79e18245267abd6820` to `93991c7ccea30ce7499935bbb91592ae137086dd`, retaining all 16 feature commits. The already-merged remote `feat/component-form-composer-submit` was also removed. Long-lived branches remain. Incoming UI HEAD `cf6315abebdcb621b142e975d3ca0c3f61278a74` and every earlier P0–P9/Foundation commit remain ancestors of `main`.

## Delivered content

Five new global bundled Skills under `default/skills/global/`:

| Skill | Intended use |
| --- | --- |
| `atri-native-work-authoring` | Native Project/Package planning, modes, ownership, exact dependencies, plan/propose/Review workflow |
| `atri-native-ui-authoring` | UI v2, local state/preferences, typed actions, Opening, message/presentation and preview boundaries |
| `atri-native-runtime-authoring` | Turn/Task, lifecycle/workflow/time, Activity fact-before-Narrator, Scene/assets/Host cleanup |
| `atri-native-world-authoring` | Information exposure, Truth/Belief, exact Add-on/Community, Player, Shared ACL/seats and independent Realm |

Each has focused Chinese instructions and one progressive reference. They are component/source/fixture documents, not self-contained importable Package archives. Current catalog IDs point to maintained compiler contracts; no copied schema or invented permission surface. Instructions distinguish API-reference character pagination from Skill-file line pagination, actual tool availability from requested authority, and Review from Commit.

Defaults are `metadata.atria-paths: studio,agents`: on-demand in those paths, off in narrative unless the user explicitly configures otherwise. Skills do not grant tools or bypass scope/deny. Existing accounts use Extensions → Skills → Browse bundled / import; this work did not mutate any real account or auto-overwrite user Skills.

## Boundaries retained / remaining evidence

P5 fact-before-Narrator, P6 explicit context/display exposure and deny, P7 immutable exact content and independent Player, P8 canonical Session/ACL/Realm Sagas, and P9 production preview/recorded Scenario/anchored repair remain covered. No Android build/device run, Docker, paid inference, real-user data write, multi-device soak, actual speech/media/gamepad hardware evidence or CI run. MySQL/PostgreSQL container harnesses remained disabled. Six selected browser flows are integrated feature evidence, not a claim that every repository E2E specification ran.

 Prior detailed records remain `extensions-skills-invocation-completed.md`, `extensions-runtime-completed.md`, `extensions-ui-completed.md`. No new feature stage is inferred.
