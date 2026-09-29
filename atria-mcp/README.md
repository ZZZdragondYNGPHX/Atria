# Atria MCP 0.2.0 — Phase 3

独立 stdio 开发工具，位于 `plugin:atria-mcp/`。提供 repository/Git/开发产物观察、完整 READ semantic catalog、诊断快照、Native GET 与隔离浏览器证据。审批/Lease 和产品 mutation 尚未实现。

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
| `atri_interact` | INTERACT executor，未开放 |
| `atri_mutate` | MUTATE executor，未开放 |
| `atri_destructive` | DESTRUCTIVE executor，未开放 |

Phase 3 Registry 覆盖 Session/Chat、Build/Studio、Library、Work/Package、Memory、Agents、Settings、Connections/Models/Routes、Diagnostics 和 browser-owned game projections。用 `atri_capabilities` 按 domain/query 搜索，再取精确 action schema。所有 action 都只通过 `atri_read`；其它 risk executor 继续失败关闭。Policy Ceiling 固定 action-ID 快照，不给未来 action 自动授权。

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

`confirm` 字段、`--allow-writes`、`ATRIA_ALLOW_WRITES` 已删除，旧输入拒绝。通用 API 不接受 method/body，不允许 POST/PUT/PATCH/DELETE。真实产品写操作必须等待可信授权阶段；不能通过点击绕过。

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

本项目是 JavaScript；没有独立 lint/typecheck 脚本。`check` 做语法检查；tests 包含 runtime Zod/schema、MCP stdio surface 和实际浏览器 fixture。`test:atria` 创建独立临时 dataRoot，保留页面重启自有 server 并验证 stale/reload，通过独立测试 setup 创建 disposable Studio/Session/Preview 数据；这些准备操作不经过 MCP，MCP 只执行 READ。仅当上述 source-change opt-in 开启时短暂改动源码；检测到并发改动时拒绝覆盖。证据写入 ignored `.artifacts/`，清理临时 runtime。是否实际执行及结果以任务 Record 为准。

## Provenance 与固定 adapters

产品需提供 authenticated `GET /api/diagnostics/runtime-identity`，通过既有 diagnostics authority 返回 canonical `serverBootId`、process start、app version、full Git revision/branch 和一次性 startup source identity。MCP 仅对这个固定非 Native 路由进行内部 GET，不扩大 `atri_api` 的路径或写入权限。旧版产品、未登录、无 Git 或不完整 identity 返回 `UNVERIFIABLE`，不会阻断普通观察。

`atria-source-v1` 对 `src/`、`public/`、`default/`、`plugins/`、根 JS/MJS/CJS 与 package manifests 的 tracked 原始工作树字节取 SHA-256；排除已知 public 用户数据目录、`_cache` 与生成 core/optional bundles。协议输入为 `algorithm + NUL + full HEAD + NUL`，按路径排序追加 JSON `[path,index mode,content SHA-256 or "missing"]` 行。双次扫描不一致、非普通文件/symlink、读取超限或 Git 不可用均失败关闭；非 ignored 和 ignored 的 runtime-relevant untracked 文件均阻止 EXACT。单文件上限 32 MiB，总量 512 MiB。它是源码身份，不证明运行配置、外部安装插件、依赖或用户数据相同；不读取或执行 checkout 中的身份实现代码。

Source/Server 状态为 `EXACT`、`SOURCE_CHANGED_SINCE_RUNTIME_START`、`CONTENT_MATCH_DIFFERENT_WORKSPACE`、`DIFFERENT_REVISION`、`UNVERIFIABLE`。workspaceId 仅为真实目录摘要的辅助证据。原始字节意味着 CRLF/LF 差异也会改变指纹。

页面 open/reload 将主文档响应中的 `X-Atria-Server-Boot-Id` 与当前 authenticated identity 核对后捕获；后续 status 不改写它。Server restart 后 freshness 为 `STALE`，重新 open/reload 才能恢复 `CURRENT`。额外导航、缺失/不一致 header 或缺失 identity 为 `UNVERIFIABLE`。status 无需启动浏览器。截图附带文本 provenance；`SCOPE_CHANGED_DURING_CAPTURE` 不能用于 scoped 验证。Native GET 结果另附该响应的 boot ID 和时间，应核对其与 provenance.server 一致。

Experience 与 Preview 通过固定 Native Frontend/Studio 响应的被动观察独立记录，只投影身份字段；不调用任意 Host Bridge binding。Experience 保留 Session/Epoch/revision/descriptor digest；Studio 保留 Project/baseRevision/Workspace、规范化 response operations 摘要、Preview/PackageVersion、entryPoint 和已有 package hash。`uiLoaded` 只表示观察到同一 Preview/PackageVersion 的 UI 响应。所有这些是 **last observed**，不是当前作用域已完整验证的声明；缺失 epoch、evaluation 或 authoring identity 不会由 server/source match 补齐。后续 Phase 4 使用这些 identity 做 freshness 与 receipts 绑定。

固定 Browser Capability Bridge 仅桥接没有更强 server authority 的 Memory、Orchestrator 与 selected game-runtime projection；literal capability/method 调用、严格输入、输出过滤/上限、document/Session scope 变化检查。不能传 capability/method/JS/module/window 属性链。Memory 使用已加载 store 的只读 factory；未加载时明确不可用，不创建写 session。观察 recall 禁止持久化来源 reconciliation 与访问计数。Orchestrator 复用工作台运行投影，含 timeline/model/tool/recall/cost/diagnostics，缺失值不推断。

Build 仍是语义命名空间，Native Studio 是 owning authority；复用 Native Frontend v3 Source Graph、diagnostics、`frontend.patch`、evaluation、Preview、Experience Epoch。Frontend Host Bridge 不等同于 MCP Browser Capability Bridge。Committed Conversation/Timeline 不可变，GenerationProjection 是 ephemeral presentation。
