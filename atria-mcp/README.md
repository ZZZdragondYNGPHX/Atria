# Atria MCP 0.2.0 — Phase 5

独立 stdio 开发工具，位于 `plugin:atria-mcp/`。提供广泛观察与显式批准的产品操作。默认 READ；写入由精确 Policy Ceiling、可信客户端审批、短期 Lease、双重 guards 和 Receipt 共同约束。

## 启动与客户端

需要 Node.js 22+、Git。运行 `npm ci`；浏览器可用 `npx playwright install chromium` 安装，或通过 `--browser-channel msedge` / `chrome` 使用本机浏览器。

```text
node /absolute/path/to/plugin-worktree/atria-mcp/src/cli.js --repo /absolute/path/to/product-worktree --url http://127.0.0.1:8000
```

`--repo` 必须是 Atria 产品 Git 根目录。MCP 不启动产品，不写源码，不执行 shell/任意 JS。客户端配置见 `examples/claude.mcp.json` 与 `examples/codex.config.toml`；替换示例路径，保留其它配置，不提交个人配置或凭据。

| 参数 | 环境变量 | 含义 |
| --- | --- | --- |
| `--repo` | `ATRIA_REPO` | 产品 checkout，必填 |
| `--url` | `ATRIA_URL` | origin，默认 `http://127.0.0.1:8000` |
| `--headed` | `ATRIA_HEADED=1` | 隔离窗口，用户可手动登录 |
| `--browser-channel` | `ATRIA_BROWSER_CHANNEL` | 可选 `msedge` / `chrome` |
| `--allow-remote` | `ATRIA_ALLOW_REMOTE=1` | 显式允许远端 HTTPS origin |
| `--storage-state` | `ATRIA_STORAGE_STATE` | 显式测试登录态；工具不导出凭据 |
| `--data-root` | — | 额外排除的运行时数据目录，绝对路径 |
| `--policy` | — | 启动时读取精确 action ID JSON；只定义资格，不代表用户批准 |

默认排除 `data/` 等用户状态目录，读取根 `config.yaml` / `config.yml` 中的YAML `dataRoot` 标量（解析异常则拒绝观察）仅用于增加排除项，绝不输出配置正文。每次观察重新读取并保留此前排除项；historical show/diff/blame 也考虑相关 revision 的配置。若 runtime 使用自定义配置位置/CLI dataRoot，操作者必须用 `--data-root` 显式指定。MCP 无法仅凭任意目录名推断全部外部运行时存储位置。

## 固定 18 tools

| Tool | 操作 |
| --- | --- |
| `atri_status` | checkout/server/browser provenance、独立 scoped evidence、Policy Ceiling 与阶段 |
| `atri_capabilities` | Registry 搜索/domain/risk 过滤、精确 action schema |
| `atri_reference` | 产品 Native authoring catalog |
| `atri_repo` | `tree` / `read` / `search` |
| `atri_git` | `status` / `diff` / `log` / `show` / `blame` |
| `atri_artifact` | `list` / `read` / `search` / `image` / `inspect` |
| `atri_api` | `list` / `detail` / `read`；只允许发现的 Native GET |
| `atri_diagnose_snapshot` | 本地/浏览器证据；尚未实现的产品类别明确 unavailable |
| `atri_browser_open` | 打开/刷新隔离页面 |
| `atri_browser_observe` | `snapshot` / `wait` / `resize` |
| `atri_browser_screenshot` | bounded JPEG MCP image |
| `atri_browser_interact` | 仅 scroll；其它动作拒绝 |
| `atri_browser_diagnostics` | MCP 自有 ephemeral browser buffer |
| `atri_browser_close` | 关闭自有浏览器 |
| `atri_read` | READ semantic executor |
| `atri_interact` | INTERACT executor，可信批准的 evaluation / Preview / simulation / generation stop |
| `atri_mutate` | MUTATE executor，可信批准的非破坏性语义操作 |
| `atri_destructive` | DESTRUCTIVE executor，one-shot 审批与精确删除 guards |

Registry 覆盖 Session/Chat、Build/Studio、Library、Work/Package、Memory、Agents、Settings、Connections/Models/Routes、Diagnostics 和 browser-owned game projections。用 `atri_capabilities` 按 domain/query 搜索，再取精确 action schema；executor risk 必须完全匹配。Policy Ceiling 固定 action-ID 快照，不给未来 action 自动授权。

## 可信授权与非破坏性操作

默认配置保持只读。要启用具体操作，将 `--policy /absolute/path/to/policy.json` 加入启动参数，例如：

```json
{"version":1,"actionIds":["build.frontend.evaluate","build.change.apply","build.preview.close"]}
```

客户端必须支持 MCP **form elicitation**，并将服务器审批表单作为可信用户交互；工具参数中的布尔值不算审批。不支持该通道时保持写入关闭，不依据客户端名称推断审批能力。表单展示准确输入、目标、authority、风险、成本/网络效果、guards 与独立 provenance。仅客户端返回 `accept` 且用户勾选授权才 mint Lease。

Lease 绑定当前 MCP instance、精确 action、规范化输入、目标和 `serverBootId`，用户可选择 1–20 次，五分钟失效；默认为一次。调用方只可回传 opaque `leaseId`，不能写 grants、scope 或 expiry。没有跨 action/domain 的宽泛授权；重启清空 Lease/Receipt。产品需报告 `mutationGuards: 1`；不支持最终请求 boot guard 的旧产品只能观察。

- Build：`build.change.prepare/inspect` 为 READ。提交固定 Workspace（origin=`plugin/atria-mcp`），经批准调用 `build.frontend.evaluate` 或 `build.change.evaluate`，临时应用、验证、生成正式 Preview，再恢复源。`build.change.apply` 必须携带同实例有效 evaluation receipt；重新核对 baseRevision、规范化 operations、change fingerprints 与 Preview exact version。支持正式 `frontend.patch`、受限 source fallback 与 resource attach/fork/update。`build.preview.create/close` 和 `build.simulate` 使用现有 Studio authority；simulation 为隔离 recorded/mock runner。
- Session：rename、save/restore、branch fork/switch、restart/remove-from-active 均保留历史。后两者要求明确选择将保留内容的 coherent `revisionId`。`chat.retry.prepare` 只派生 retry boundary；`chat.regenerate/reenter` 派生 branch 后启动生成，失败时 branch 仍可能已改变。`chat.send` 使用 Native turn scheduler，返回 operationId 后通过 `generation.status/stop` 查询/停止；GenerationProjection 不是 committed Timeline。
- Settings：仅明确列出的普通 UI scalar settings，现有值 test + replace，不开放根替换或 Agent/Memory/credentials 配置路径。
- Runtime：`runtime.parameters.update` 复用正式参数 guards；`connection/model/route.update` 使用 Native 配置 authority 与锁内 SHA-256 canonical JSON expected fingerprint，新增对象使用 `SHA256("null")`。仅 opaque Secret refs，无凭据值。
- Library：World/Knowledge 新 immutable revision；旧版本保留，产品核对 baseRevisionId。Work start 要求 exact PackageVersion/EntryPoint。
- Memory：先 `memory.mutation.inspect` 获得 loaded graph fingerprint/target，再批准 create/edit/relation upsert/compact。固定 bridge 调用现有 source-guarded write session，克隆草稿、队列内检查图状态。无任意方法/JS/batch dispatch；缺少 loaded scope 拒绝执行。该证据属于 Memory source/branch，不证明 Frontend Epoch exactness。

每次执行在审批前后检查 authority。源/runtime 不一致可被明确审阅，Receipt 保留独立身份而不冒充匹配。结果包含 ephemeral Receipt：`succeeded`、`rejected` 或 `indeterminate`。最后一种表示超时、输出或传输错误可能发生在写入之后，必须先观察产品，不能自动重试。大响应只返回 hash/metadata，详情通过 READ 获取。Phase 5 开放 one-shot DESTRUCTIVE、Package review/install 和受限 Agent delegation。通用浏览器 click/fill/press/select 仍拒绝，避免绕过语义风险。

例如 `atri_read(action="build.frontend.inspect", input={projectId,baseRevision})` 复用正式 Source Graph；`chat.read` 读取不可变 Timeline；`build.preview.get` 读取已有 Preview，绝不创建 Preview。`atri_diagnose_snapshot` 合并独立诊断读取，逐项保留 unavailable/HTTP permission status 和各自 boot/time；不是原子快照。

固定 HTTP adapters 可以调用经过审计的 POST 形状读取；保留产品 CSRF/auth/admin/ownership/revision 校验，不重试写入，不开放任意路径。Settings 使用不播种/迁移的 scoped authority；`settings.get` 必须指定非根 path，catalog/search 返回路径与类型。Generation configuration 使用独立 authority。Secret inventory 仅投影 `secretId`/`label`。

HTTP 输出先脱敏再分页；`outputOffset`/`outputLimit` 与 contentHash 可用于检查分次响应是否变化，JSON 片段明确标记，不冒充完整结构。响应最大 1 MiB，过大应缩小范围。Studio source base64 先解码为 UTF-8 再过滤；二进制只给 metadata。Bundle inspection/preflight 只返回引用/依赖/冲突，不转储 archive 内容。

Memory vector search/recall 与 connection probe 是 READ，但描述符明确标出 provider network/`mayIncurCost`。probe 只能选择现有 ConnectionProfile ID，不接受凭据或任意 endpoint。这些调用不会由诊断快照自动触发。

## 仓库与产物边界

- `atri_repo` 覆盖 repository-wide tracked 文件和 safe non-ignored untracked 开发文件。路径分类独立于 `.gitignore`；敏感、用户状态、依赖/cache、artifact 不能通过 repo 接口读取。
- `.env*`、凭据文件、Secret store、私钥/keystore、数据库、根运行配置以及已知用户目录硬拒绝；内容输出先过滤再截断。私钥内容拒绝，常见结构化/自由文本凭据脱敏，复杂敏感多行内容整体隐藏。自由文本检测不保证识别没有任何标识的随机秘密；只面向受控开发 checkout。
- traversal、绝对路径、Windows ADS、尾随点/空格及 symlink/junction 拒绝。Git 使用参数数组，固定只读子命令，禁用外部 diff/textconv；历史 blob 只读普通文件。
- 文本每文件最多 2 MiB；read 最多 200 行/30k 字符；search 每次最多 2,000 文件、32 MiB 和 100 命中。`nextOffset` 是文件游标，续查时同时将 `nextLine` 传入 `startLine`；artifact 扫描截断单独标记。
- artifact roots 固定为 `.artifacts`、`test-results`、`playwright-report`、`coverage`、`build`、`dist`、`tests/artifacts`、`tests/coverage`、`tests/.e2e-screenshots`、`android-app/app/build`。最多扫描 2,000 节点/6 层，返回 scan truncation；根下仍应用相同敏感/数据策略。其它 ignored 路径不开放。
- image 仅允许签名匹配的 PNG/JPEG/WebP，最多 2 MiB；图像可能含用户内容，应仅放开发证据。`inspect` 返回最多 64 MiB 文件的大小/hash/扩展名，不解包、不执行、不声称产品验证通过。
- Git diff 支持工作树、`staged: true`、`base` 对 `ref`；不包含 untracked 正文（用 repo read）。show/blame 必须指定精确安全路径。Git 证据有 timeout/output/file-count 上限，不提供任意 Git args 或写操作。

```json
{"operation":"read","path":"package.json"}
{"operation":"search","query":"Studio","pathPrefix":"src/"}
{"operation":"diff","base":"HEAD~1","ref":"HEAD"}
{"operation":"image","path":"tests/artifacts/desktop.png"}
```

## Breaking migration

旧 `atri_source_read/search` → `atri_repo`；`atri_api_list/detail/request` → `atri_api`；`atri_browser_snapshot/wait/resize` → `atri_browser_observe`。没有 callable legacy aliases。

`confirm` 字段、`--allow-writes`、`ATRIA_ALLOW_WRITES` 已删除，旧输入拒绝。通用 API 不接受 method/body，不允许 POST/PUT/PATCH/DELETE。真实产品写操作只能经过语义执行器与可信授权；不能通过点击绕过。

## 验证与证据

```powershell
npm run check
# 未安装 bundled Chromium 时可选本机浏览器
$env:ATRIA_TEST_BROWSER_CHANNEL = 'msedge'
npm test
npm run test:integration
# 可选：独立 fresh dataRoot 产品观察 smoke
$env:ATRIA_REPO = '<product-checkout>'
# 可选，要求干净的独立 checkout：临时追加 package.json 换行后恢复，检验启动后源码变化
$env:ATRIA_VERIFY_SOURCE_CHANGE = '1'
# 可选：另一干净产品 checkout，验证不同 revision
$env:ATRIA_COMPARE_REPO = '<other-product-checkout>'
npm run test:atria
```

本项目是 JavaScript；没有独立 lint/typecheck 脚本。`check` 做语法检查；tests 包含 runtime Zod/schema、MCP stdio surface 和实际浏览器 fixture。`test:atria` 创建独立临时 dataRoot，通过独立 setup 准备 fixture，然后运行 READ 与批准的 Studio/Session/Work 操作。审批由 deterministic test client 经真实 MCP elicitation 应答，不是人类审批 UX 证据；不会调用付费 provider。验证重启 stale/reload；source-change opt-in 才短暂改动源码。证据写入 ignored `.artifacts/`，清理临时 runtime。是否实际执行及结果以任务 Record 为准。

## Provenance 与固定 adapters

产品需提供 authenticated `GET /api/diagnostics/runtime-identity`，通过既有 diagnostics authority 返回 canonical `serverBootId`、process start、app version、full Git revision/branch 和一次性 startup source identity。MCP 仅对这个固定非 Native 路由进行内部 GET，不扩大 `atri_api` 的路径或写入权限。旧版产品、未登录、无 Git 或不完整 identity 返回 `UNVERIFIABLE`，不会阻断普通观察。

`atria-source-v1` 对 `src/`、`public/`、`default/`、`plugins/`、根 JS/MJS/CJS 与 package manifests 的 tracked 原始工作树字节取 SHA-256；排除已知 public 用户数据目录、`_cache` 与生成 core/optional bundles。协议输入为 `algorithm + NUL + full HEAD + NUL`，按路径排序追加 JSON `[path,index mode,content SHA-256 or "missing"]` 行。双次扫描不一致、非普通文件/symlink、读取超限或 Git 不可用均失败关闭；非 ignored 和 ignored 的 runtime-relevant untracked 文件均阻止 EXACT。单文件上限 32 MiB，总量 512 MiB。它是源码身份，不证明运行配置、外部安装插件、依赖或用户数据相同；不读取或执行 checkout 中的身份实现代码。

Source/Server 状态为 `EXACT`、`SOURCE_CHANGED_SINCE_RUNTIME_START`、`CONTENT_MATCH_DIFFERENT_WORKSPACE`、`DIFFERENT_REVISION`、`UNVERIFIABLE`。workspaceId 仅为真实目录摘要的辅助证据。原始字节意味着 CRLF/LF 差异也会改变指纹。

页面 open/reload 将主文档响应中的 `X-Atria-Server-Boot-Id` 与当前 authenticated identity 核对后捕获；后续 status 不改写它。Server restart 后 freshness 为 `STALE`，重新 open/reload 才能恢复 `CURRENT`。额外导航、缺失/不一致 header 或缺失 identity 为 `UNVERIFIABLE`。status 无需启动浏览器。截图附带文本 provenance；`SCOPE_CHANGED_DURING_CAPTURE` 不能用于 scoped 验证。Native GET 结果另附该响应的 boot ID 和时间，应核对其与 provenance.server 一致。

Experience 与 Preview 通过固定 Native Frontend/Studio 响应的被动观察独立记录，只投影身份字段；不调用任意 Host Bridge binding。Experience 保留 Session/Epoch/revision/descriptor digest；Studio 保留 Project/baseRevision/Workspace、规范化 response operations 摘要、Preview/PackageVersion、entryPoint 和已有 package hash。`uiLoaded` 只表示观察到同一 Preview/PackageVersion 的 UI 响应。所有这些是 **last observed**，不是当前作用域已完整验证的声明；缺失 epoch、evaluation 或 authoring identity 不会由 server/source match 补齐。授权执行器使用这些 identity 做 freshness 与 receipts 绑定。

固定 Browser Capability Bridge 仅桥接没有更强 server authority 的 Memory、Orchestrator 与 selected game-runtime projection；literal capability/method 调用、严格输入、输出过滤/上限、document/Session scope 变化检查。不能传 capability/method/JS/module/window 属性链。Memory 使用已加载 store 的只读 factory；未加载时明确不可用，不创建写 session。观察 recall 禁止持久化来源 reconciliation 与访问计数。Orchestrator 复用工作台运行投影，含 timeline/model/tool/recall/cost/diagnostics，缺失值不推断。

Build 仍是语义命名空间，Native Studio 是 owning authority；复用 Native Frontend v3 Source Graph、diagnostics、`frontend.patch`、evaluation、Preview、Experience Epoch。Frontend Host Bridge 不等同于 MCP Browser Capability Bridge。Committed Conversation/Timeline 不可变，GenerationProjection 是 ephemeral presentation。

## Phase 5 高风险操作

- `session.delete` / `build.project.delete` 要求精确 revision；`work.delete` 先展示并检查依赖 Sessions，产品事务仍会拒绝引用或版本冲突。`library.revision.delete` 使用正式 delete-safety，不能删除当前/被引用的 revision。无 force 或单独 PackageVersion 物理删除接口。
- `memory.node.delete` / `memory.relation.delete` 通过现有 guarded Memory session；必须匹配已加载作用域与 graph hash。
- 所有 DESTRUCTIVE 审批严格一次使用。`.owned` Session/Project cleanup 还要求同一 MCP 实例、同一 serverBootId、成功创建回执、精确对象 ID 和原始创建 revision。修改过的对象必须重新使用普通 one-shot 删除流程，不按名称推断所有权。旧 Phase 4 缺少创建 revision 的回执不能用于此窄范围清理。
- Package 流程：`package.artifact.capture` 从已有安全 artifact roots 获取 `.atria`，或 `build.package.create` 经 Studio 生成 → `package.artifact.inspect` → `package.install.preflight` → `package.install.review` → `package.install`。review 与 install 都走可信审批，绑定同一 archive hash、版本、权限、preflight 和当前 baseVersion；漂移必须重新 review。archive bytes 仅保留在内部，最多 4 个/每个 16 MiB，15 分钟过期；Studio build 响应仍受普通 transport 1 MiB 限制。
- `agent.delegation.inspect` 读取选定 preset/node；`agent.run.start` 仅在用户明确要求内部 Agent 工作流时使用。当前模式 `delegated-node` 运行一个显式选定节点，复用 AgentRuntime 和既有 durable checkpoint store，不隐式执行完整 preset 图。最多 8 个精确 Memory create/edit/relation-upsert/compact 操作，每个一次，preset 工具与产品 capability、MCP ceiling 和用户批准 envelope 取交集。拒绝 deletion、web、任意工具、参数替换及嵌套 Agent。
- Agent 有 1–8 steps、256–16000 context budget、1–60 秒 deadline，MCP request cancellation 会停止 Runtime；没有金额预算承诺。model/tool/Memory evidence、每次 provider usage、可用时的 cost，以及 parent/child receipt + run/step/effect attribution 一并返回。未知 token/cost 明确为 null，不估作零；无自动 Memory recall。费用仍以 provider 实际计费为准。
- Lease、回执、artifact handles 随 MCP 实例结束失效；Agent durable checkpoint 归原 Orchestrator 所有。无法确认的中间效果保留 indeterminate 回执且不自动重试。

Phase 5 的 deterministic provider/浏览器 fixture 不是付费模型或实际客户端人工审批 UX 证据。真实产品与 fixture 验证范围以同一任务 Record 为准；产品 feature 尚未合入 main。
