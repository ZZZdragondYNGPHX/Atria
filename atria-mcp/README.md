# Atria MCP 0.2.0 — Phase 1

独立 stdio 开发工具，位于 `plugin:atria-mcp/`。读取 Atria checkout、Git 和开发产物，并提供 Native GET 与隔离浏览器观察。当前只完成 **MCP Kernel / Repository Observation**；产品语义动作、审批/Lease、Runtime Provenance 和 Browser Capability Bridge 尚未实现。

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
| `atri_status` | checkout HEAD、浏览器、Policy Ceiling、阶段与可用性 |
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
| `atri_browser_interact` | Phase 1 仅 scroll；其它动作拒绝 |
| `atri_browser_diagnostics` | MCP 自有 ephemeral browser buffer |
| `atri_browser_close` | 关闭自有浏览器 |
| `atri_read` | READ semantic executor |
| `atri_interact` | INTERACT executor，未开放 |
| `atri_mutate` | MUTATE executor，未开放 |
| `atri_destructive` | DESTRUCTIVE executor，未开放 |

Phase 1 Registry 无产品 action。Kernel 测试覆盖 descriptor schema、精确 risk 匹配、Policy Ceiling 的固定 action-ID 快照和有界 ephemeral Receipt Store；这不代表审批/Lease 或真实产品 mutation 已实现。MCP 进程关闭后 receipts 消失，不写产品持久化。

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

`confirm` 字段、`--allow-writes`、`ATRIA_ALLOW_WRITES` 已删除，旧输入拒绝。通用 API 不接受 method/body，不允许 POST/PUT/PATCH/DELETE。真实产品操作必须等待后续 semantic adapters 与可信授权阶段；不能通过点击绕过。

## 验证与证据

```powershell
npm run check
# 未安装 bundled Chromium 时可选本机浏览器
$env:ATRIA_TEST_BROWSER_CHANNEL = 'msedge'
npm test
npm run test:integration
# 可选：独立 fresh dataRoot 产品观察 smoke
$env:ATRIA_REPO = '<product-checkout>'
npm run test:atria
```

本项目是 JavaScript；没有独立 lint/typecheck 脚本。`check` 做语法检查；tests 包含 runtime Zod/schema、MCP stdio surface 和实际浏览器 fixture。`test:atria` 创建独立临时 dataRoot，仅做观察（不会关闭 onboarding/创建 Studio 项目），输出 bounded `.artifacts/` 证据并清理临时 runtime。是否实际执行、结果如何，以任务 Record 为准。

`atri_status.runtimeSourceMatch` 当前固定 `UNVERIFIABLE`，不能把截图标成当前源码验证。Phase 2 将按当时 main 复核 direct runtime identity/startup fingerprint/full revision binding，复用 canonical `serverBootId`，不增加 `runtimeBootId`。

Build 仍是语义命名空间，Native Studio 是 owning authority；复用 Native Frontend v3 Source Graph、diagnostics、`frontend.patch`、evaluation、Preview、Experience Epoch。Frontend Host Bridge 不等同于 MCP Browser Capability Bridge。Committed Conversation/Timeline 不可变，GenerationProjection 是 ephemeral presentation。
