# Atria product E2E

Specs cover the current Native Session, Play, Library, Studio, Runtime, Shell,
authentication, storage and synchronization behavior. Each spec starts its own
server through `_lib/server.js`; fixtures own their test data. No personal data,
provider secrets or running development server are required for default fixtures.

From `tests/`:

```sh
npm run test:e2e -- --list
npm run test:e2e -- native-session/02-product-ui.e2e.js --workers=1
npm run test:e2e -- storage-center/ --workers=1
```

Select only the relevant specs. MySQL/Postgres scenarios need Docker;
explicit real-data/live-provider scenarios document their additional inputs.
Skipped external scenarios are not passing evidence.

The retired Chat/Character/extension UI corpus and developer-seeded integration
projects were removed. The old composer is a hidden internal ABI; current UI
tests use Native product controls. A known defect must remain a failing test
until fixed; do not mark it expected-to-fail to manufacture a green result.
