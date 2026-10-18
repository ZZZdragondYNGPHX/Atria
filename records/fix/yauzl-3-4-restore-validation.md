# yauzl 3.4 restore-path

## Task

Investigate and address the primary ZIP extractor repeatedly stalling on Android restore entries while the independent `adm-zip` fallback decoded the same entries immediately.

## Branch and PR

- Baseline: `main@c51d8b779a741f0cf87758b5f8565be581f17556`
- PR: #19
- Squash merge / resulting `main`: `aebd6ada8760fea3b07b65ba0f05b5b278b3f471`

## Field evidence

Real Android restore logs established that:

- the 150 MiB archive staged successfully from Android shared storage into Termux internal temporary storage;
- preflight and recovery-point creation completed normally;
- multiple entries produced zero bytes indefinitely through the primary yauzl path;
- the same entries decoded immediately and to the exact declared byte length through `adm-zip`;
- affected entries included both JSON and PNG data, so the problem was not worldbook parsing, Unicode filenames, or one content type.

This isolated the failure to the primary ZIP-entry stream path.

## Dependency finding

Atria declared `yauzl ^3.2.1` but `package-lock.json` resolved it to `3.3.0`.

Upstream history is directly relevant:

- yauzl 3.3.1 fixed bugs around interrupted/destroyed read streams and async iteration;
- 3.3.2 included further I/O/error-handling cleanup;
- 3.4.0 is the current release and adds modern Promise/iterator APIs while retaining the compatible callback API Atria currently uses.

The working hypothesis is therefore a yauzl 3.3.0 stream-lifecycle edge interacting with the runtime/entry shape, not corrupt archive data.

## Implementation

- Updated `package.json` to `yauzl ^3.4.0`.
- Updated `package-lock.json` to resolved `yauzl 3.4.0`.
- Removed yauzl's obsolete nested `buffer-crc32` lock entry because 3.4.0 no longer depends on it.
- Kept all existing recovery protections:
  - Android internal staging;
  - per-entry watchdog;
  - adaptive 15s → 1s fallback probing;
  - bounded `adm-zip` fallback;
  - manual interrupt and rollback.

## Limitations / interpretation

The passing Linux CI round-trip confirms that:

- Atria's archiver ZIPs are structurally compatible with yauzl 3.4.0;
- the upgraded primary extraction path handles representative large Unicode JSON and binary entries.

It does not by itself prove the Android/Termux field-only stall is fully eliminated. The watchdog/fallback/rollback layers intentionally remain in place.

## Data/config impact

No archive format, backup schema, restore schema, worldbook format, storage schema, or user configuration migration was introduced.
