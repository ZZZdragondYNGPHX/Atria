# Android / Termux startup: deferred extension module prewarm

Date: 2026-09-20

## Baseline

Real-device startup log from `main@8fd9fb53af028c6453338ae845827df91898122c`:

- `server-main.module-evaluated`: +3828ms
- `pre-setup.total`: 419ms
- warm frontend cache: 3ms
- `server.listening`: +4313ms
- client `visibleTotalMs`: 964.6ms
- client `batch2TasksMs`: 4013.2ms
- client `b2BootstrapExtensionsMs`: 3902ms
- client `extActivateMs`: 3831.3ms
- client `firstLoadTotalMs`: 6194.4ms

The extension activation phase was the dominant post-visible component. Existing loading-order comments document real listener-order compatibility between third-party extensions, so changing extension evaluation order was rejected.

## Implementation

PR #69: `perf: prewarm deferred extension activation`

Merged main:

- `9e96c82d01e6291ee469b2834061fd6778a5d235`

Changes:

1. High-order built-in system extension entry modules (`loading_order >= 100`) receive `modulepreload` hints after manifest discovery and before activation.
2. Module prewarm does not evaluate modules; actual activation continues to obey the existing loading-order groups.
3. Third-party extensions are not prewarmed by this path.
4. Per-extension activation duration is recorded under bounded startup diagnostics.
5. Backend startup logs now include:
   - `extPrewarmMs`
   - `extSlow`, the eight slowest extension activation entries.

This preserves loading-order semantics while allowing fetch / parse work for the large deferred Atria extension graphs to overlap earlier extension groups.

## Validation

PR #69 Atria PR Checks #675:

- Unit Tests: passed
- Lint: passed
- Atria Migration Guard: passed

No Android APK/JVM or Docker build was run; those remain opt-in for this browser/Node startup optimization.

## Next measurement

Collect a fresh complete startup log from `main@9e96c82d01e6291ee469b2834061fd6778a5d235`.

The most important new fields are:

- `extPrewarmMs`
- `extActivateMs`
- `extSlow`
- `b2BootstrapExtensionsMs`
- `batch2TasksMs`
- `firstLoadTotalMs`

Use `extSlow` to decide whether the next optimization belongs inside a specific Atria extension or inside the generic extension loader. Do not change loading-order execution semantics without new evidence.
