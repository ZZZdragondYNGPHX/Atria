# Remove separate credential destination approval

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `credential-destination-approval-removal`
- Date: 2026-10-19 (America/Los_Angeles)
- Primary Workspace: product `main`
- Start HEAD: `5db03d71`
- Implementation HEAD: `aaeccd8e`
- Dynamic world cherry-pick: `e556c830`
- Status: complete

## Result

The user explicitly requested removal of Credential destination authorization and its redundant confirmation workflow. Connections now use the configured endpoint and exact stored Secret reference directly for testing, model discovery and generation.

Removed the connection editor section and its module, inspection/authorization endpoints, `CredentialTargetAuthority`, and permit requirements from model probing, controlled-turn preflight, generation Secret resolution and MCP/A2A ToolPort execution/consumption. Removed obsolete remediation messages and translations.

Retained the existing URL/network checks, HTTPS restriction for public services, exact Secret-reference binding, MCP/A2A endpoint fingerprints, and request/source/budget/tool authority checks. The old permit resource kind, storage classification and recovery ownership mapping remain solely so existing stored records can still be exported or recycled; no request reads them and no authorization writer remains.

## Validation

- Targeted ESLint and `git diff --check` passed; locale JSON parsed successfully.
- Inline tests verified Secret resolution without permits, rejection of mismatched Secret references before key lookup, public HTTP/private-network/embedded-credential rejection, loopback support, model discovery with generation options and preserved bearer/redirect handling.
- Generation Host, ToolPort and native tool orchestration modules loaded with normal config initialization. Controlled-turn configuration/preflight succeeded without permit storage while stale branch detection remained active.
- The actual `D:/Atria` clone was updated and its server restarted. A new built-in browser tab showed no authorization section. Testing the existing provider with a modified, unsaved output-budget option succeeded with “Provider model list is reachable. No generation was sent.” This candidate differed from the old permit target, verifying that separate authorization no longer gates requests. Restored the draft to the saved value afterward; no connection was saved and no generation was sent.
- Local screenshot: `D:/Dev/Atria-worktrees/previews/credential-authorization-removed.png` (not committed).

## Delivery

Committed, integrated and pushed `main`, updated `D:/Dev/Atria` and actual `D:/Atria`, and cherry-picked/pushed only this change to `feat/dynamic-world`. Preserved the parallel task's unrelated in-progress world/knowledge edits. Notified “正式开始动态世界任务” (`01a15768-5215-7ae1-a707-7b7806bcfc13`) of the changed behavior, dependencies retained, commit and validation.
