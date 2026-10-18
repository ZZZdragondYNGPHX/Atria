# P3 World Simulation Contract

This is the retained --fixture simulation profile. The default P5 opening uses the same Core scheduler with its own bounded rent/Anchor obligations; see OPENING.md.

This fixture uses the formally integrated Core `world-simulation@1` capability and retains required `authority-transaction@1`. No scheduler is shipped in Package tools or frontend.

## Authority and schedule

All times use the existing canonical `world` minute clock. Static jobs are evaluated against explicit Lifecycle field grants. Core executes due deterministic/conditional jobs by due time, priority and stable job ID, inside the same private candidate and shared authority budget. Safe publication runs before the final Session CAS.

The authored calendar has two initial daily transitions plus recurring daily accounting through the existing 30-day schema horizon:

| Tick | Authoritative changes |
| --- | --- |
| 1440 | Rent arrears +10; first institutional processing; permitted Cold railway moves survey → charter, otherwise blocked. |
| 2880 | Rent arrears +10; hearing becomes missed and registry permission is lost; scheduled clinic treatment clears recorded severity; railway moves to construction or remains blocked; Warm press publishes; Hot registry becomes eligible to deliberate. |
| 4320–43200 (daily) | Rent arrears +10 and processed-day/next-tick counters advance. Preserve railway, press, archive decision/filing and delegate. Do not repeat the hearing, clinic or deliberation occurrence. |

The clinic is a fixed authored treatment appointment, not a general natural-healing timer. The fixture has no payment/attendance gameplay verbs yet. `fixture_block_rail` is a declared Host test setup command, not a player action or model tool.

`agendas/foundation` holds the small fixture's explicit institutional phases. It is not an Outcome ledger: no turn-by-turn history or model reasoning is accumulated there. Institutional records, obligations and Conditions keep their own authorities. `SimulationAdvanced` and `InstitutionFiled` use the existing World Journal. The World state stores only small current counters/ticks, not a second journal.

## Projections and bounds

Seven unique private grants feed one rebuildable publication hook; ten declared App Commands replace P2's ten grants/twenty-one commands. Reused source grants include a union of only the already approved fields. No projection reads another projection. Known risk band, condition severity/text and relationship/trust are separate typed safe fields, not hidden Truth.

The two-day wait reaches the 16-read expanded ceiling; more content must be budgeted, not hidden behind another authority or a raised limit. Existing 24 App Commands / 32 effects, computed-value destination schemas, static targets, Ready, UTF-8 and total expanded-work limits remain active. After the registry decision has been accepted, recurring-day two-day batches use 16 reads / 14 App Commands / 17 effects; the original eventful two-day batch remains 16 / 16 / 20. Single advances remain at most 2880 minutes and maxSteps remains 3. Day 31 exceeds the existing day/processedDay schema horizon of 30 and fails atomically, including rollback of earlier valid work in the same request. This is bounded recurring accounting, not an unlimited campaign calendar. No read, effect, UTF-8 or stored-state ceiling was raised.

## Evidence distinctions

 The imported save belongs to the new PackageVersion; this does not migrate a save pinned to 0.4.0-p4. It does not demonstrate an OS-crash journal or recovery of an uncommitted cross-process selection. Existing P2 selection/RNG tests retain those narrower meanings.

P4 begins world/content foundation only after P3 closure. The fixture is not the launch setting, full game, final user interface or P9 release.
