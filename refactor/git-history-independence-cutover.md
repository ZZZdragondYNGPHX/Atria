# Atria Git History Independence Cutover

## Goal

Detach the authoritative `main` history from the legacy `luker` ancestry while preserving `luker` and `vanilla` as long-lived reference branches.

## Baseline

- Repository: `ZZZdragondYNGPHX/Atria`
- Pre-cutover `main`: `5c52ab839e14d478ce41d976d5afab027578ac03`
- Legacy reference `luker`: `91ae97aed557be9439317a67d0ec516f7512fe2e`
- Independent docs root: `87de0a613dab0a6c2c2d32462780a7e19d9b0237`
- Safety branch: `refactor/git-history-independence-cutover`

## Problem

The current Atria `main` is a descendant of the imported Luker history. GitHub therefore treats historical Luker commits as part of the default branch ancestry and may surface their authors in repository contributor statistics.

## Cutover design

1. Preserve the current `main` on the temporary safety branch.
2. Leave `luker`, `vanilla`, and `docs` untouched.
3. Use the independent `docs` root only as a technical ancestry anchor; it has no common ancestor with `luker`.
4. Create an Atria baseline commit whose tree matches the Luker reference snapshot but whose parent is the independent docs root.
5. Replay the authoritative first-parent Atria mainline snapshots after the Luker baseline, preserving each resulting tree and commit message while dropping legacy/side-branch ancestry.
6. Verify that the reconstructed tip tree is byte-for-byte identical at the Git tree level to the pre-cutover `main` tree.
7. Force-move `main` only after structural verification.
8. Verify that the new `main` has no common ancestor with `luker` and that its tree matches the saved pre-cutover main.
9. Retarget the temporary safety branch to the new `main` after successful verification so the old Atria/Luker-connected history is no longer kept alive by that task branch.

## Expected impact

- Product files: unchanged.
- Runtime/data/config formats: unchanged.
- `luker` reference history: unchanged.
- `vanilla` reference history: unchanged.
- Main commit SHAs: rewritten from the cutover point onward.
- Open branches based on the old main would need rebasing/cherry-picking; the completed immersive branch has already been merged and removed before this cutover.
- GitHub contributor statistics may take time to refresh after the default-branch history rewrite.

## Validation

- Reconstructed final tree SHA equals pre-cutover `main` tree SHA.
- `main` vs `luker` reports no common ancestor.
- `main` branch points at the reconstructed tip.
- `luker`, `vanilla`, and `docs` HEADs remain unchanged by the cutover.
