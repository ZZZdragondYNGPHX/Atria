# Defer optional startup imports

- Date: 2026-10-26
- Task: `perf/startup-defer-heavy-modules`
- Primary workspace: product source
- Start: `4fd0ca2de7c53834370ab8072e46c74e880d5f7b`
- Implementation: `8b28bcafe197444328b9e03c44fad71419ac1466` (integrated into `main`, pushed)

## Evidence and change

After the preceding Termux native-binding/cache repair, the user's latest trace showed 9,506 ms before `server-main.module-evaluated`, 21 ms for a verified frontend cache hit, and listening at 10,076 ms. The launcher separately reported about 15 seconds; the supplied trace does not explain that full discrepancy. Remaining measured server startup time was predominantly module loading.

Seven routers now use the existing `createLazyRouter`: tokenizers, NovelAI, vectors, chat completions, text completions, Native generation and orchestration. Authentication, CSRF, router paths and core bootstrap remain unchanged. The existing helper shares concurrent import work and forwards failures through Express.

TypeScript loads when JSON source editing is requested, Vectra when a physical vector index is used, and MySQL/PostgreSQL drivers when those engine constructors create a pool. Synchronous APIs remain synchronous; PostgreSQL's timestamp parser is still installed before its first pool/connection. No dependency, new loader abstraction, deferred storage recovery or frontend rebuild was introduced. First use of an optional feature pays its import cost once.

## Measurements and validation

Local Windows Node 24 profiling used the same isolated FS data, verified frontend cache and Node compile cache, through actual server startup and `/api/bootstrap`. Unique observed module URLs dropped from 2,445 to 1,788; their existing file sizes totaled 42.33 MiB before and 17.18 MiB after (source-file bytes, not RSS or download size). Module-evaluated timing changed from 2,845 ms to 2,219 ms and listening from 3,410 ms to 2,739 ms. These are single local comparison runs with diagnostic instrumentation, not Android timings or a fixed performance guarantee.

- Targeted ESLint and `git diff --check` passed.
- Real `/api/bootstrap` returned settings with the same FS/SQLite backend and frontend cache. Optional heavy packages were absent from the startup/bootstrap module inventory.
- First-use HTTP checks covered concurrent GPT-2 tokenization, Native generation catalog, orchestration plan listing, active generation jobs, missing NovelAI credentials, vector admission rejection and text-completion status against a local mock upstream. No external model/API call was made.
- Local dependency checks verified deferred loading, formatting-preserving JSON edits and duplicate-key rejection, vector insertion/query/deletion, SQL pool construction/closure without connecting, and PostgreSQL timestamp parsing. No live MySQL/PostgreSQL database was tested.
- Two initial HTTP fixtures were corrected to the existing contracts: orchestration listing requires an explicit nullable cursor; an unscoped vector request must return `native_retrieval_invalid` rather than success. Remaining checks then passed; no production contract was relaxed.
- Profiling code, fixtures and logs remain local. Mobile performance after this change still requires the user's device measurement.
