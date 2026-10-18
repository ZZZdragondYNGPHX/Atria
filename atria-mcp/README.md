# Atria MCP 0.3.0

独立 stdio 开发工具，位于 `plugin:atria-mcp/`。提供广泛观察与显式批准的产品操作。默认 READ；

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
| `--state-dir` | `ATRIA_MCP_STATE_DIR` | MCP 私有操作元数据，必须在源码和产品数据目录之外 |
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
| `atri_diagnose_snapshot` | 独立产品/本地/浏览器证据；缺失或无权限的类别明确标注 |
| `atri_browser_open` | 打开/刷新隔离页面 |
| `atri_browser_observe` | `snapshot` / `wait` / `resize` |
| `atri_browser_screenshot` | bounded JPEG MCP image |
| `atri_browser_interact` | 仅 scroll；其它动作拒绝 |
| `atri_browser_diagnostics` | MCP 自有 ephemeral browser buffer |
| `atri_browser_close` | 关闭自有浏览器 |
| `atri_read` | READ semantic executor |
| `atri_interact` | INTERACT executor，可信批准的 evaluation / Preview / simulation / generation stop |
| `atri_mutate` | MUTATE executor，可信批准的非破坏性语义操作 |

Registry 覆盖 Session/Chat、Build/Studio、Library、Work/Package、Memory、Agents、Settings、Connections/Models/Routes、Diagnostics 和 browser-owned game projections。用 `atri_capabilities` 按 domain/query 搜索，再取精确 action schema；executor risk 必须完全匹配。Policy Ceiling 固定 action-ID 快照，不给未来 action 自动授权。

## 可信授权与非破坏性操作

默认配置保持只读。要启用具体操作，将 `--policy /absolute/path/to/policy.json` 加入启动参数，例如：

```json
{"version":1,"actionIds":["build.frontend.evaluate","build.change.apply","build.preview.close"]}
```

客户端必须实际协商可信审批：2025-06-18 / 2025-11-25 使用 **form elicitation**，2026-07-28 使用 **MRTR**；请求经过官方 SDK 适配，并绑定单次 HMAC continuation。工具参数中的布尔值不算审批。不支持该通道时保持写入关闭，不依据客户端名称推断审批能力。仅客户端返回 `accept` 且用户勾选授权才 mint Lease。实际 Codex 0.162.1 的 app-server 连接协商为 2025-06-18；

Lease 绑定当前 MCP instance、精确 action、规范化输入、目标和 `serverBootId`，用户可选择 1–20 次，五分钟失效；默认为一次。调用方只可回传 opaque `leaseId`，不能写 grants、scope 或 expiry。没有跨 action/domain 的宽泛授权；重启清空 Lease/Receipt。产品需报告 `mutationGuards: 1`；

- Build：`build.change.prepare/inspect` 为 READ。`build.change.apply` 必须携带同实例有效 evaluation receipt；支持正式 `frontend.patch`、受限 source fallback 与 resource attach/fork/update。`build.preview.create/close` 和 `build.simulate` 使用现有 Studio authority；simulation 为隔离 recorded/mock runner。
- Session：`session.rename`、`session.save/quick`、`session.restore` 与 `chat.branch.switch/rename/archive` 复用原生存档和分支权威。Restore 从精确 SavePoint 创建新 Branch，原历史完整保留；分支元数据及 `session.save.policy.update` 同时钉住 HEAD 与原生 metadata fingerprint，防止同一 HEAD 上的并发覆盖。六个原 Native Router 不支持的 fork/retry、restart/remove-from-active、regenerate/reenter 动作已退役，不提供旧楼层物理改写旁路。
- `chat.send` 要求调用方预先生成稳定 `commitId` 和 `invocationId`。无法确认的输入保持 `unknown`。Generation 响应丢失保留已提交输入和 `generation.unknown`。返回 operationId 后通过 `generation.status/stop` 查询/停止；admitted 不代表生成完成，Stop 不回滚已提交消息，不自动重发收费请求。GenerationProjection 不属于 committed Timeline。
- `runtime.context.preview` 复用原生 Context Compiler。
- Archive：`session.archive.export/capture` → `inspect/preflight` → 独立批准 `import`，使用专用 `session-archive` Binary Asset purpose 和 `.atriasave` 原格式。读取开发文件仍受 RepositoryAccessPolicy 限制；普通工具结果只含元数据；Archive 不可当作 Package 安装。加密归档可做依赖预检，但 MCP 没有可信密码解锁 Port，必须使用原生 UI，不接受模型可见明文密码。
- Project Agent：`agent.project.generation.preflight/start/status/cancel` 复用 Goal Continuation 的同一 Studio runner 与 Native Generation Host；Task 原预算记录实际 usage，取消不代表退款；固定 route 必须禁用自动 retry/fallback。模型只产生提案并停在 Review，正式 Commit 仍需独立审批。
- Settings：仅明确列出的普通 UI scalar settings，现有值 test + replace，不开放根替换或 Agent/Memory/credentials 配置路径。
- 仅 opaque Secret refs，无凭据值。
- Library：World/Knowledge 新 immutable revision；Work start 要求 exact PackageVersion/EntryPoint。
- Memory：先 `memory.mutation.inspect` 获得 loaded graph fingerprint/target，再批准 create/edit/relation upsert/compact。无任意方法/JS/batch dispatch；缺少 loaded scope 拒绝执行。该证据属于 Memory source/branch，不证明 Frontend Epoch exactness。

源/runtime 不一致可被明确审阅，Receipt 保留独立身份而不冒充匹配。结果包含 ephemeral Receipt：`succeeded`、`rejected` 或 `indeterminate`。最后一种表示超时、输出或传输错误可能发生在写入之后，必须先观察产品，不能自动重试。支持 one-shot DESTRUCTIVE、独立 Package review/install、Project Agent Review/Commit 和受限 Agent delegation。通用浏览器 click/fill/press/select 仍拒绝，避免绕过语义风险。

例如 `atri_read(action="build.frontend.inspect", input={projectId,baseRevision})` 复用正式 Source Graph；`chat.read` 读取不可变 Timeline；`build.preview.get` 读取已有 Preview，绝不创建 Preview。`atri_diagnose_snapshot` 合并独立诊断读取，逐项保留 unavailable/HTTP permission status 和各自 boot/time；不是原子快照。

固定 HTTP adapters 可以调用经过审计的 POST 形状读取；Settings 使用不播种/迁移的 scoped authority；`settings.get` 必须指定非根 path，catalog/search 返回路径与类型。Generation configuration 使用独立 authority。Secret inventory 仅投影 `secretId`/`label`。

HTTP 输出先脱敏再分页；响应最大 1 MiB，过大应缩小范围。Studio source base64 先解码为 UTF-8 再过滤；二进制只给 metadata。Bundle inspection/preflight 只返回引用/依赖/冲突，不转储 archive 内容。

Memory vector search/recall 与 `runtime.connection.probe` 可能联网或收费，归 INTERACT，必须精确 Policy Ceiling 与可信审批。更换 Endpoint 不能继承旧许可。这些调用不会由诊断快照自动触发。

## 原生域工作流与可靠性

使用 `atri_capabilities` 查询当前精确 schema，不根据示例猜字段。新增域沿同一原生权威执行：

- Project Agent：外部 AI 可提交 typed plan/proposal 到原生 Task；显式内置模型 generation 使用已审 Route/预算、Native Scheduler 和 Compute 记录，至 Review 停止。删除提案的正式提交保持 DESTRUCTIVE。
- Runtime / Cognition：纯 Prompt Preview 与持久快照观察独立于 reconcile；Connection/Model/Route、Prompt Candidate、Goals/Evidence/Experience/Evolution 的精确写入分别审批。反馈不能自动当作发布许可，原生受控入口抑制未授权后台费用；自动策略配置与正式发布单独授权。
- Memory：无头 Native Graph 操作保留原 source ticket、branch/HEAD、graph fingerprint 与事务；不需要为写入制造浏览器会话。旧 browser bridge 仅在真正加载的作用域内使用。
- Media：Image/Director/Gallery/Mask/Speech 保留各自原生 preparation、job、预算、CAS、GC 与取消语义。图像、音频与 Mask raster 经固定用途 BinaryAssets 句柄，业务发送/Checkpoint 另审；观察不会自动恢复 Worker 或清理持久状态。
- URL 下载和安装分别审批。Extension Git/local source 先准备 inert 内容并审查，安装默认为 disabled，enable 另审；不开放任意 Host import/eval/shell。
- Resource / Archive：Resource Bundle 完整映射按页审查，独立 Review/Import；已审 Token 的不确定导入只能显式续接同一意图。已安装 Package 可导出原字节；Session Archive 复用 Native SaveSystem，支持专用密码 SecretRef 加密导入/导出，预检不解析密码。密码在现有产品 Secret UI 中保存到独立用途，MCP 不接收密码明文，也不能把该用途的 Secret 作为 Provider 凭据。
- Browser：`browser.ui.surfaces/interact` 只允许当前 compiled manifest 中无脚本/Bridge/持久副作用的本地 set/toggle。截图可指定注册 Surface target；MCP 证据页面阻止用户 Extension 代码与跨 Origin 子资源，避免第三方页面脚本伪造受控 Surface；产品的 Extension 启用状态仍由独立原生审批管理。

Control、Read、Mutation、Browser 分 lane，有界队列与按目标隔离；同一页面的导航、截图和交互串行。`operation.list/get/scheduler/cancel/reconcile` 提供实例内控制与拥有方查询；取消不等于远端撤销或回滚。含 source.delete 的直接 Workspace 正式提交必须使用 `build.change.apply.destructive` 并取得一次性 DESTRUCTIVE 审批。

超长 JSON 元数据按字符分页时，fragment 使用 `encoding: "hex-utf16le"` 与 `encodedText`；这样保留任意 Unicode 边界，避免外层重复脱敏改坏半截 JSON。正常结构化页仍直接返回；资产字节继续走独立 Binary Lane。Skills 大 payload 使用 `skill.payload.capture` 读取允许的开发 JSON 产物，再分别 preflight/install，支持原生 16 MiB 解码容量；本地 Extension 源码支持 4 MiB UTF-8 分块传输，准备阶段不执行代码。

已知结束记录保留七天后可回收；unknown 不自动删除或重放。Lease、审批 continuation 和图片原字节不写 Journal，重启不恢复授权。

SDK 依赖精确固定 2.3.1，支持两代 stdio 协议。可选 Tasks 扩展未宣告，使用上述 semantic operations；能力不足时写入关闭，不以客户端名称推断支持。

## 仓库与产物边界

- `atri_repo` 覆盖 repository-wide tracked 文件和 safe non-ignored untracked 开发文件。路径分类独立于 `.gitignore`；敏感、用户状态、依赖/cache、artifact 不能通过 repo 接口读取。
- `.env*`、凭据文件、Secret store、私钥/keystore、数据库、根运行配置以及已知用户目录硬拒绝；内容输出先过滤再截断。私钥内容拒绝，常见结构化/自由文本凭据脱敏，复杂敏感多行内容整体隐藏。自由文本检测不保证识别没有任何标识的随机秘密；只面向受控开发 checkout。
- traversal、绝对路径、Windows ADS、尾随点/空格及 symlink/junction 拒绝。Git 使用参数数组，固定只读子命令，禁用外部 diff/textconv；历史 blob 只读普通文件。
- 文本每文件最多 2 MiB；read 最多 200 行/30k 字符；search 每次最多 2,000 文件、32 MiB 和 100 命中。`nextOffset` 是文件游标，续查时同时将 `nextLine` 传入 `startLine`；artifact 扫描截断单独标记。
- artifact roots 固定为 `.artifacts`、`test-results`、`playwright-report`、`coverage`、`build`、`dist`、`tests/artifacts`、`tests/coverage`、`tests/.e2e-screenshots`、`android-app/app/build`。最多扫描 2,000 节点/6 层，返回 scan truncation；根下仍应用相同敏感/数据策略。其它 ignored 路径不开放。
- image 仅允许签名匹配的 PNG/JPEG/WebP，最多 2 MiB；图像可能含用户内容，应仅放开发证据。
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

# 未安装 bundled Chromium 时可选本机浏览器
# 可选：独立 fresh dataRoot 产品观察 smoke
$env:ATRIA_REPO = '<product-checkout>'
# 可选，要求干净的独立 checkout：临时追加 package.json 换行后恢复，启动后源码变化
# 可选：另一干净产品 checkout，不同 revision
