# P8 frontend — Eastbank field register

## P8-A: reviewed direction
The interface is a civil verifier's working register, not a quest dashboard or an occult power menu. The memorable device is a double-file spine: a marine cover and offset paper index, recalling incompatible but authenticated records. Keep the reading surface quiet; no glow, fake parchment, invented seals, progress scores or decorative charts.

Palette: cover #173F49, paper #F7FAF8, ground #DFE8E4, ink #243D43, brass #735826, caution #853F45. Muted text #52666A; testimony #64445D. Color always accompanies a written semantic label.

Typography: Georgia / Noto Serif / serif for titles and narrative; Segoe UI / system-ui / sans-serif for controls and provenance. Offline system stacks, no font or image network dependency. 16px base, 1.6 reading leading, 68ch prose. Align left; numeric steps only for the actual six-step creation sequence.

Desktop: cover/navigation at left; one large folio; reading and action panes split only where width supports them. Mobile: four text navigation choices, one column, disclosure sections and normal document scrolling. No gesture-only operation. No horizontally scrolling form or miniaturized graph.

    cover | narrative / current matter | declared next action
          | known evidence register   | provenance / relations
          | Case network + Hearing    | independent arrangements
          | Identity / Seed / Claim  | Prices and commitments

Review: rejected the first generic blue/orange Minimalism dashboard suggestion and the narrowed search's Hero/Testimonials marketing result from ui-ux-pro-max. Neither was a verified fit; neither is persisted as authority. The register direction is original to this Package. Accessible contrast, 44px targets, safe areas and progressive disclosure are fallback UX constraints, not database-verified visual recommendations.

## P8-B: implementation contract
Use the Native v3 AUI renderer, bounded presentation controller, existing Composer Host services, typed transaction bindings and advisory Model Tasks. Existing safe projection domains back the Information Views/Graphs and are the only game read bindings. There is no arbitrary resource/authority access, new projection, transaction, gameplay, RNG or eligibility evaluator. Presentation filters only hide unacquired/empty rows; Native authority always validates actions.

Four sections: Field notes (central conversation and six-step creation); Evidence (distinct evidence/testimony/finding/hypothesis, provenance and selected graph relations); Cases (known mandates, dispositions, patterns and six independent Hearing terms); Identity (background, Seed versus formal Claim, Anchor, Prices, time and institutional duties). A contextual method selector exposes the full approved action surface without requiring hidden text syntax. Public catalog vocabulary is bounded and is never presented as owned Claims or discovered evidence.

Action fields preserve explicit labels and typed enums. Risk/consent are reviewed before commit. No write on mount/recovery. New operations use the Native bridge's current handle; in-process retry retains its original invocation key and input. An unknown commit blocks further writes until the original operation is reconciled; reloading is not replay. No cross-process pending journal or old-version save migration is claimed.

P8-C and P8-D evidence is recorded in runtime/FRONTEND.md and the sole Package Record, not inferred from this design document.

## P8-C interaction review

| Before | After | Why |
| --- | --- | --- |
| Late field events clear consent | Review tied to current field signature | Never submit changed fields under an old review |
| Feedback only in header | Inline status, disabled conflicting writes | Visible acknowledgement and uncertainty |
| Navigation resets method drafts | Bounded process-local field drafts, renewed Price consent | Preserve work without introducing authority or a pending-request journal |
| Uniform press transition | No keyboard movement; short pointer-only press; reduced motion off | Frequent investigation stays immediate |

No route, list, graph or automatic reveal animation. No timers dismiss errors. Native details and normal scrolling replace gesture-only drawers.
