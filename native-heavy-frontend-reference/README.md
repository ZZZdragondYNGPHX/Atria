# Native Heavy-Frontend Reference Package

本目录是 **Native Heavy-Frontend Reference Package** 的长期资产目录。

Phase 3 仓库规范化迁移从：

`migration-source/native-heavy-frontend-reference@b3b6c4f01729325a789c92a15cc6946e1a97603a`

提取并原样保留了原 `packages/native-heavy-frontend-reference/` 下的 19 个 Package 专属文件，包括：

- `PLAN.md`、`PLATFORM_GAPS.md`、`PLAYTEST.md`；
- Project Source；
- Preview fixtures；
- recorded Scenarios；
- Phase 1–6 validators。

这里不包含 Atria 产品源码。需要对产品运行时做兼容验证时，应使用独立的 `main` 产品环境，而不是把 `main` 合入 `package`。

## Releases

正式 `.atria` 成品放在 `releases/`，按版本长期保留。

迁移审计未发现可归档的历史 `.atria` 文件，因此本次只建立 release 机制，不虚构历史成品。

## Frontend refactor — 2026-09-28

The Package now presents the Sanctuary as a story-first Native experience. It remains Hybrid UI v2; there is no separate HTML/CSS application to install.

| Before | After | Why |
| --- | --- | --- |
| Equal-width story/context columns | Full-width Native story and adjacent composer; context in a disclosure | Keep reading and writing primary |
| Unmarked section buttons | Explicit current-section state and labeled compact selects | Make location clear without relying on color |
| Mixed Phone collection with hidden foreign-channel rows | Separate Messages / Social / Mail display projections | Correct empty states and prevent cross-channel pagination starvation |
| Raw clock minutes | Readable 24-hour time, including overnight schedule dates | Make plans understandable |
| Implementation terminology in primary copy | Player-facing guidance, prerequisites and draft counters | Explain what to do next |

UI definitions live in `project/ui/main.json`. Native commands, draft state, exact identities, logic, Task routing, scenarios and installed-package ownership are unchanged. The unreleased source version remains `0.6.0-phase6`; this is not a new `.atria` release.

### Verification against an independent product checkout

The historical phase validators import product modules with `../../src`, `../../public` and `../../tests`. Mount **only this game directory** at `packages/native-heavy-frontend-reference` inside a current-main validation checkout using a symlink (Windows: directory junction). Do not merge product source into `package`.

From the product checkout, run:

```sh
node --preserve-symlinks --preserve-symlinks-main packages/native-heavy-frontend-reference/verify-frontend.mjs
```

The same invocation works for `verify-phase1.mjs` through `verify-phase6.mjs`. Product dependencies must be installed in that checkout. The symlink flags preserve the validator's intended product-module resolution. Remove the temporary mount after verification; do not commit it.

Permanent design and implementation record: `docs:plans/package/native-heavy-frontend-refactor.md` and `docs:records/package/native-heavy-frontend-refactor.md`. See `PLATFORM_GAPS.md` for the remaining Native styling/semantics boundary.
