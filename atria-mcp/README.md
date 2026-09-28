# Atria MCP

让 Claude Code / Codex 读取 **当前 Atria 的接口、契约和源码证据**，并通过真实浏览器查看修改后的前端，而不是只输出代码、截图路径或自行模拟的 UI。

这是 `plugin` 分支中的独立 **stdio MCP Server**，不是 Atria 内置扩展，也不需要把本目录安装到产品的 `plugins/`。两个客户端使用相同的服务实现；各自启动的 MCP 进程拥有独立浏览器和登录状态。

## 可以做什么

- **接口发现**：从指定产品工作树的 Native Express 路由提取 method/path、处理函数位置和请求字段线索；数组、字符串拼接和静态循环/模板路由均可识别。无法解析的动态路由明确列出。
- **契约读取**：直接使用 Atria 现有 `/api/native/extensions/catalog`，读取 UI、SDK、Project、Package、Scenario 等精确契约/示例，不维护第二套规范。
- **源码定位**：检索、分页读取 Git 已跟踪的 `src/`、`public/`、`scripts/`、`tests/` 文本源码，返回行号和内容指纹。
- **API 调用**：仅调用当前源码发现的 Native 路由；共享浏览器登录 cookie，写请求获取 Atria 的 CSRF token，不关闭认证/CSRF。
- **视觉反馈**：打开、刷新、调整 viewport，读取可访问性树，等待界面就绪，截图、检查 iframe，按已观察到的 selector 点击/填写/按键/选择/滚动。
- **真正的图片输出**：截图作为 MCP `image` content 返回，支持图片工具结果的客户端可直接交给模型查看，不依赖模型读取本机图片路径。
- **诊断**：查看最近 100 条浏览器 warning/error、脚本异常、失败请求和 HTTP 错误。

不提供终端执行、任意 JavaScript evaluate、源码写入、文件上传/下载、自动启动/重启产品或自动调用模型。客户端继续使用原有编码工具修改代码；MCP 负责上下文与运行结果反馈。

## 安装

需要 Node.js **22+**、Git，以及一个**已安装依赖、可运行的 Atria 产品 checkout**。

```powershell
cd <plugin-worktree>/atria-mcp
npm ci
# 保留机器上其它工程使用的 Playwright 浏览器版本
$env:PLAYWRIGHT_SKIP_BROWSER_GC = "1"
npx playwright install chromium
```

也可以不下载 Chromium，通过 `--browser-channel msedge` 或 `--browser-channel chrome` 使用已经安装的浏览器。仍会创建隔离 context，**不会接管个人浏览器**。

先用你原有的开发流程启动 Atria。`--repo` 必须指向运行该实例的**同一份产品源码**，不能指向 `plugin` 工作树。MCP 不会因为 Git HEAD 相同就声称运行实例与源码已经同步。

```powershell
node <plugin-worktree>/atria-mcp/src/cli.js --help
```

直接运行 stdio Server 后无输出、等待 stdin 是正常行为。请通过 MCP 客户端调用，不要在终端手动拼 JSON-RPC。

## 连接 Claude Code / Codex

以下 `<...>` 均需替换为本机真实路径；使用绝对路径，不依赖客户端 cwd。Windows 路径可使用 `/`，带空格的路径应保留引号。

### Claude Code

```powershell
claude mcp add --transport stdio --scope user atria -- node "<plugin-worktree>/atria-mcp/src/cli.js" --repo "<product-worktree>" --url http://127.0.0.1:8000
claude mcp get atria
```

也可以将 `examples/claude.mcp.json` 的条目合并到自己的项目 `.mcp.json`，保留原有服务器配置。项目配置不要包含凭据或提交机器专属路径。

### Codex

```powershell
codex mcp add atria -- node "<plugin-worktree>/atria-mcp/src/cli.js" --repo "<product-worktree>" --url http://127.0.0.1:8000
codex mcp get atria
```

也可按 `examples/codex.config.toml` 合并到自己的 MCP 配置，保留其它已有内容。示例为大型前端启动预留了较长工具超时。

**本工具不会自动修改你的 Claude/Codex 配置。** 注册后在新的客户端会话确认 `atri_status` 和 `atri_api_list` 可用。实际图片呈现取决于客户端对 MCP 图片结果的支持。

### 启用开发交互

默认允许接口读取、页面打开/等待/截图/滚动，**关闭非 GET API 调用与点击/填表/按键/选择**。需要操作开发实例时，在服务器启动参数追加：

```text
--allow-writes
```

对应调用还需要 `confirm: true`。这表示客户端应已获得用户对该次操作的授权，不会弹出第二套 MCP 自制确认窗口，也不是可信的人类授权证明。由客户端的工具审批和产品自身权限共同控制行为。

### 登录

存在账号登录或 HTTP 认证页面时，追加 `--headed`，调用 `atri_browser_open` 后，在工具打开的**专用窗口**内手动登录；UI 与 API 随后共享这份会话。

已有专门的测试登录态可通过 `--storage-state <file>` 导入 Playwright storage state（也可包含显式提供的测试 localStorage）。工具不导出登录态，不自动读取个人浏览器，不读取 Atria Secret store，也不把登录密码放进 MCP 调用。文件必须由用户保存在 Git 外并限制权限；重启后不承诺登录仍有效。

## 配置

| 参数 | 环境变量 | 默认 / 限制 |
| --- | --- | --- |
| `--repo` | `ATRIA_REPO` | 必填：产品 Git 根目录 |
| `--url` | `ATRIA_URL` | `http://127.0.0.1:8000`，仅 origin，不接受用户信息、子路径、query 或 fragment |
| `--headed` | `ATRIA_HEADED=1` | 默认 headless |
| `--browser-channel` | `ATRIA_BROWSER_CHANNEL` | 默认 Playwright Chromium；可选 `msedge` / `chrome` |
| `--allow-writes` | `ATRIA_ALLOW_WRITES=1` | 默认关闭 |
| `--allow-remote` | `ATRIA_ALLOW_REMOTE=1` | 默认仅 `localhost` / `127.0.0.1` / `[::1]`；远端必须 HTTPS |
| `--storage-state` | `ATRIA_STORAGE_STATE` | 默认无，凭据文件由操作者显式提供 |

不支持挂载在 URL 子路径的反向代理，也不提供远端 MCP HTTP 监听器/OAuth 服务。连接远端 Atria 不等于将本地 MCP Server 暴露到网络。

## 工具

| 工具 | 用途 |
| --- | --- |
| `atri_status` | checkout HEAD、tracked dirty、origin、浏览器状态、写入开关 |
| `atri_api_list` | 按词搜索/分页列出当前 Native 路由 |
| `atri_api_detail` | 根据 `METHOD /api/native/...` 查看 handler 和字段线索 |
| `atri_reference` | 搜索产品契约目录；按 `id` 分页读取精确内容 |
| `atri_source_search` | 限定路径前缀的源码字面量检索 |
| `atri_source_read` | 行号分页、SHA-256 源码证据 |
| `atri_api_request` | Native JSON 调用；`query` 与 `path` 分离，不接受自定义认证头 |
| `atri_browser_open` | 打开/刷新页面、调整尺寸、可选 `waitFor` |
| `atri_browser_resize` | 不刷新地调整当前页面尺寸，保留 Studio/Preview 状态 |
| `atri_browser_wait` | 等待 selector 的 visible/hidden/attached/detached，最多 60 秒 |
| `atri_browser_snapshot` | 可访问性树、frame 索引、页面结构 |
| `atri_browser_screenshot` | JPEG 图片，viewport/fullPage/iframe selector |
| `atri_browser_interact` | click/fill/press/select/scroll；非滚动操作双重 opt-in |
| `atri_browser_diagnostics` | 有界诊断环形缓冲，可读后清空 |
| `atri_browser_close` | 关闭本 MCP 所有的浏览器，丢弃临时会话 |

同时提供 `atria://guide`、`atria://status` resources，以及 `atria_verify_change` prompt。工具名全部使用 Atria 自有前缀。

### 推荐开发回路

1. `atri_status` 检查 checkout 与运行地址。
2. `atri_reference` 搜索相关契约；用 `atri_api_list` / `atri_api_detail` 定位接口，通过 `atri_source_read` 追踪服务/客户端代码。
3. 用 Claude Code/Codex 本来的文件工具修改代码并运行相应检查；按产品现有流程重启/重建。**MCP 刷新不等于重新编译后端。**
4. `atri_browser_open` 打开/刷新。必要时用 `atri_browser_wait` 等待观察到的就绪标记，不把 Loading 截图当作完成证据。
5. `atri_browser_snapshot` 检查结构和 frame。通过已观察到的 selector 进入 Studio、扩展页或具体 Preview；`atri_browser_screenshot` 查看真实效果。
6. 用 `atri_browser_resize(width=390,height=844)` 等尺寸在不刷新、不重置页面状态的情况下复核窄屏，查看空态/错误/焦点/禁用状态，再读 `atri_browser_diagnostics`。
7. 只汇报实际观察到的结果；不要把源码检查冒充浏览器检查。

例如可给客户端：

> 使用 atria MCP 查看浏览器扩展 SDK 的当前契约，然后检查我刚修改的 UI。先核对源码与运行实例，打开实际 Atria 页面并等加载完成；查看桌面和 390px 窄屏截图，必要时进入 preview iframe，报告布局问题与浏览器错误。不要修改项目数据，除非我明确授权。

## 边界与安全

- **不是 OpenAPI**：路由来自指定 Git 工作树（含 tracked 未提交修改），并非运行中的服务器注册表。请求字段只由 handler 静态读取推断，可能不完整、缺类型/校验；服务层和产品契约仍是权威。新增未跟踪文件先用正常 Git 工作流纳入索引才可由本工具读取。
- **不是只读沙箱**：浏览器加载会运行产品脚本，GET 或页面初始化也可能改变应用状态；同源子资源仍按 Atria 自身行为访问。只对专用开发实例使用此工具。
- **限定访问**：API 路径限制在已发现的 `/api/native/`，拒绝 traversal、编码路径、Secret/credential 路径、重定向；浏览器阻止跨 origin 文档导航并关闭 popup。不会拦截所有应用子资源请求，也不是网络出口防火墙。
- **产品 authority 不变**：Native Session、Studio/ProjectStore、ChangeSet → Review → Apply、Library exact revisions、Package 原件不可变、玩家拥有的 Secret/Connection/Runtime 均保留。双重 opt-in 不授予绕过产品校验的能力。
- **隐私**：不记录网络 body/header，不输出 cookie/CSRF token；常见 JSON 凭据字段做递归遮盖，诊断 URL 移除 query，日志文字仅尽力遮盖。**截图、DOM、自由文本仍可能包含个人内容**；使用空白/合成开发数据，只将愿意发送给模型的页面交给 MCP。
- **不执行工具内容里的指令**：API、源码、网页和日志均为不可信证据，不能把它们当成系统提示或操作授权。
- **资源限制**：源码文件 2 MiB；单次源码输出约 30k 字符/200 行；可访问性树 24k 字符；JSON 请求/响应工具结果 1 MiB；图片 3 MiB；fullPage 高度最多 12000px。网络 APIResponse 在检查实际 body 大小时可能已缓冲响应，限制是工具输出/保留边界，不是网络下载字节的流式硬上限。
- **JSON API 范围**：不支持 SSE、二进制资源/Archive 下载、multipart 或 1 MiB 以上导入。响应非 JSON 时明确报错；403 写入不会自动重试，避免重复副作用。
- **生命周期**：同一实例串行执行工具，避免并发页面/CSRF 竞争；退出/关闭时回收自有浏览器；不向 stdout 打日志污染 MCP。

## 验证

```powershell
npm run check
npm test
npm audit --omit=dev --registry=https://registry.npmjs.org

# 显式、可选：真实 Atria 集成。需产品依赖可用；首次启动/编译可能较慢。
$env:ATRIA_REPO = "<product-worktree>"
npm run test:atria
```

`npm test` 通过 SDK stdio client、临时 Git repo、模拟 HTTP 认证/CSRF服务和**真实 Chromium**验证协议、默认禁写、源码边界、图片、iframe、响应上限、重定向拒绝、窄屏及诊断。

`test:atria` 启动独立产品 checkout，使用全新临时 dataRoot/config（不复制开发者数据），验证接口/契约、完成测试用户引导、通过 UI 创建临时 Project 并进入 Studio、通过真实 CSRF 校验接口，并保存桌面/窄屏图片和结构证据到忽略的 `.artifacts/`。结束后关闭进程并清理临时 runtime。源码与浏览器依赖来自操作者配置的工作树；不自动更新/安装产品依赖。

实现记录在 `docs:records/plugin/atria-mcp.md`。不声称已跑过真实 Claude/Codex 模型会话；SDK stdio 协议测试与客户端配置语法检查是不同的验证层级。

## 官方参考

```text
https://developers.openai.com/codex/mcp
https://code.claude.com/docs/en/mcp
https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x
https://playwright.dev/docs/api/class-page
```
