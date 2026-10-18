# 历史盘点附件与适用范围

当前功能范围见 [index](index.md)。以下方法、数量与附件说明保留原静态盘点背景，不是本次执行结果，也不是待执行的扫描／测试清单。

## 实际执行的方法

1. `git status`、`git fetch origin`、分支 HEAD、`git log`、跨分支差异；保护 docs 既有未跟踪资料及 V3 并发工作树。V3出现并发merge后改用固定Git archive；
2. 阅读原 Prompt Plan 的 index、decisions、E0、D8、相关 D4/D5/D6/D7 合同及唯一 Record；其他历史前端 Plan 只用于定位旧权威，不把历史视觉批准恢复为本次新视觉批准。
3. 对 `git ls-files` 中全部 tracked `public/**/*.js/mjs/html/css`（含顶层 init/lib facade/style.css 与 vendored lib）、脚本/共享 manifest JSON、Android 主源码、Electron JS 的 JS/HTML/CSS/KT/JAVA/XML 文本做全文件解析或规则扫描。使用本地 TypeScript parser 遍历 JS AST，记录静态 import/re-export、动态 import、函数归属、控件工厂、事件和服务调用；另扫描所有 `public/**/*.html` 的表单/按钮等标签。
4. 从 `public/index.html → public/script.js → atria-shell/index.js`，以及 `capability-host.js → native experience / orchestrator / memory` 的实际挂载和 loader 出发，人工追踪产品域入口。
5. 对前后端与测试扫描 E0 标识符/精确字符串消费者；对 `src/endpoints/**/*.js` 的 Router 注册做索引；测试只阅读/索引，没有执行。索引包含旧代码和测试样本，不能把它们直接计入当前可见产品。
6. 阅读核心 CSS 的结构、断点、focus、safe-area、scroll、motion、touch 规则；未把第三方指南中的审美偏好或“超过某数量必须虚拟化”机械升级为 Atria 产品合同。

## 原始证据附件

所有 TSV 的首行是字段名，路径为仓库相对路径，行号为 1-based。source/registration 是定长**摘录**；完整逻辑须结合源码索引与固定提交读取。未写入机器路径、凭证、用户数据库、日志、截图或测试缓存。

| 附件 | 行数（不含表头） | 能证明什么／不能证明什么 |
| --- | ---: | --- |
| [function-matrix.tsv](evidence/function-matrix.tsv) | 189 | 四份功能正文的派生表格导出；columns/row 为 JSON 数组以保留不同表头，不另建状态权威 |
| [source-files.tsv](evidence/source-files.tsv) | 1,065 |不是人工逐文件完成标记|
| [control-sites.tsv](evidence/control-sites.tsv) | 2,390 | JS 控件/表单/折叠/媒体工厂调用位置、owner 和摘录；含重复模板、helper、旧代码与非控件同名调用候选，不是独立按钮数 |
| [html-controls.tsv](evidence/html-controls.tsv) | 1,221 | 静态 HTML 的 button/input/select/textarea/link/summary/dialog/form/media/canvas 标签；包含隐藏旧 DOM，运行时可见性须看挂载条件 |
| [event-handlers.tsv](evidence/event-handlers.tsv) | 3,206 | addEventListener、jQuery on/bind、onclick 等注册候选；事件总线订阅也在其中，非全是用户点击 |
| [import-edges.tsv](evidence/import-edges.tsv) | 5,960 | main 前端/HTML 与服务器静态边；不包括任意执行时 URL、Worker/eval/插件外部目录的完整闭包 |
| [service-consumers.tsv](evidence/service-consumers.tsv) | 1,164 | 前端对 client/sdk/runtime/service/host/navigation 等调用点；是候选索引，非完整跨过程数据流证明 |
| [server-endpoints.tsv](evidence/server-endpoints.tsv) | 1,908 | main/V3 HTTP 注册表达式与数组/循环入口；包含中间件，不能把一行当一个已可用 API |
| [e0-symbol-consumers.tsv](evidence/e0-symbol-consumers.tsv) | 1,630 | main/V3 的目标标识符/精确字符串位置及函数上下文；不证明同义字段、反射和第三方消费者已穷尽 |
| [css-interaction-rules.tsv](evidence/css-interaction-rules.tsv) | 1,945 | 主 CSS 的断点、滚动、焦点、触控、motion 等规则位置；不是计算样式或流畅性结果 |
| [test-catalog.tsv](evidence/test-catalog.tsv) | 1,527 | main测试树JS路径（含helper/fixture）、字面 import、case标题与 `NOT_RUN`；表驱动/动态 case 不一定有字面标题 |
| [v3-test-catalog.tsv](evidence/v3-test-catalog.tsv) | 15 | 固定最新V3的native-orchestration测试case目录，执行均NOT_RUN；与main的测试目录分开|

source-files 的 `literalReachable` 从 script/shell/experience 根沿可解析 literal 边计算，覆盖根会使它比实际启动路径宽；`false` 不等于 dead code，`true` 不等于当前用户能看到。绝不据此自动删除代码。

883 个 JS/MJS 文件 AST parse diagnostics 为 0。

## 动态导入、模板及未知入口

| 入口 | 真实消费者／处理方式 | 仍未知 |
| --- | --- | --- |
| workspace-host 的 literal import | Studio、旧 Agents、Diagnostics 按域延迟加载；Library/Runtime adapter 内再按 section 挂载 | 路由切换和取消竞态的真实 UI 表现 NOT_RUN |
| `capability-host.js:62–86` | 显式注册 regex、search-tools、game-runtime、orchestrator、memory-graph；不是扫描磁盘即可把任意扩展当内置 ||
| `native/extension-runtime.js:5` 的 `import(url)` | 经过 extensions host/client 的启用、目标 scope 与受控 SDK，再从实际 URL 加载 | 用户安装的第三方插件源码不在固定 Git 树；其 UI/网络/可用性 UNKNOWN |
| tokenizer/worker 的绝对 literal 与 ranks 模板 | `/lib/tokenizers/*` 由构建/服务资产提供；encodingName 参与 ranks 路径 | 不可把本地 Git 缺少生成 bundle 写成产品必然损坏；worker 执行 NOT_RUN |
| Android bootstrap 的 `import(serverEntryUrl)` | 启动包装层解析实际服务入口；不是一个产品页面 | 打包运行时安装路径、原生库和设备行为 NOT_RUN |
| renderTemplate、Work frontend resource graph | 模板名／manifest／Source Graph 决定 UI；审计 HTML 标签与 Host Bridge，不仅靠 ES import 图 | 任意用户作品自定义节点/菜单/控件无法从空用户数据推定；必须保留作者扩展能力 |
| `public/lib/pdf.min.mjs` 的环境分支/worker | vendored PDF loader 中 Node 内建模块名和 this.workerSrc 不属于产品页面；依赖 facade 的 generated bundles 也单独记录 unresolved | 构建产物、worker 启动与设备特性 NOT_RUN，不据 literal 缺文件判损坏 |
| Sandbox/Worker/MCP/A2A | 属于能力受控边界与外部服务；不是本次可穷尽的浏览器页面枚举 | 配置对应真实服务、权限、审批和恢复的动态结果 UNKNOWN |
