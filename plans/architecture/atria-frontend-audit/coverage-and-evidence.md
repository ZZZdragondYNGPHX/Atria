# 覆盖、证据方法与未验证范围

基线和任务状态见 [index](index.md)。本轮是全产品**静态结构扫描 + 核心业务链人工复核**，不是对 355,257 行逐行人工签字，也不是完整动态消费者闭包。尤其不能将下面的数量称为已验收功能数。

## 实际执行的方法

1. `git status`、`git fetch origin`、分支 HEAD、`git log`、跨分支差异；保护 docs 既有未跟踪资料及 V3 并发工作树。V3出现并发merge后改用固定Git archive；最新main Storage UI（695acf3bc）与V3 transition（31bef9572）增量均已复核并重建相关证据，未解决或改动别人的 merge。
2. 阅读原 Prompt Plan 的 index、decisions、E0、D8、相关 D4/D5/D6/D7 合同及唯一 Record；核对 V3 Plan 入口与物理接口。其他历史前端 Plan 只用于定位旧权威，不把历史视觉批准恢复为本次新视觉批准。
3. 对 `git ls-files` 中全部 tracked `public/**/*.js/mjs/html/css`（含顶层 init/lib facade/style.css 与 vendored lib）、脚本/共享 manifest JSON、Android 主源码、Electron JS 的 JS/HTML/CSS/KT/JAVA/XML 文本做全文件解析或规则扫描。使用本地 TypeScript parser 遍历 JS AST，记录静态 import/re-export、动态 import、函数归属、控件工厂、事件和服务调用；另扫描所有 `public/**/*.html` 的表单/按钮等标签。
4. 从 `public/index.html → public/script.js → atria-shell/index.js`，以及 `capability-host.js → native experience / orchestrator / memory` 的实际挂载和 loader 出发，人工追踪产品域入口。复核 handler 内的 currentness、只读、busy、保存回执与失败分支，不仅依据路径名字分类。
5. 对前后端与测试扫描 E0 标识符/精确字符串消费者；对 `src/endpoints/**/*.js` 的 Router 注册做索引；测试只阅读/索引，没有执行。索引包含旧代码和测试样本，不能把它们直接计入当前可见产品。
6. 阅读核心 CSS 的结构、断点、focus、safe-area、scroll、motion、touch 规则；参考 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) 的交互/无障碍检查项。未把第三方指南中的审美偏好或“超过某数量必须虚拟化”机械升级为 Atria 产品合同。

## 原始证据附件

所有 TSV 的首行是字段名，路径为仓库相对路径，行号为 1-based。source/registration 是定长**摘录**；完整逻辑须结合源码索引与固定提交读取。未写入机器路径、凭证、用户数据库、日志、截图或测试缓存。

| 附件 | 行数（不含表头） | 能证明什么／不能证明什么 |
| --- | ---: | --- |
| [function-matrix.tsv](evidence/function-matrix.tsv) | 189 | 四份功能正文的派生表格导出；columns/row 为 JSON 数组以保留不同表头，不另建状态权威 |
| [source-files.tsv](evidence/source-files.tsv) | 1,065 | 文本文件、行数、SHA-256、粗粒度域和 literal import 可达标记；不是人工逐文件完成标记 |
| [control-sites.tsv](evidence/control-sites.tsv) | 2,390 | JS 控件/表单/折叠/媒体工厂调用位置、owner 和摘录；含重复模板、helper、旧代码与非控件同名调用候选，不是独立按钮数 |
| [html-controls.tsv](evidence/html-controls.tsv) | 1,221 | 静态 HTML 的 button/input/select/textarea/link/summary/dialog/form/media/canvas 标签；包含隐藏旧 DOM，运行时可见性须看挂载条件 |
| [event-handlers.tsv](evidence/event-handlers.tsv) | 3,206 | addEventListener、jQuery on/bind、onclick 等注册候选；事件总线订阅也在其中，非全是用户点击 |
| [import-edges.tsv](evidence/import-edges.tsv) | 5,960 | main 前端/HTML 与服务器静态边；不包括任意执行时 URL、Worker/eval/插件外部目录的完整闭包 |
| [service-consumers.tsv](evidence/service-consumers.tsv) | 1,164 | 前端对 client/sdk/runtime/service/host/navigation 等调用点；是候选索引，非完整跨过程数据流证明 |
| [server-endpoints.tsv](evidence/server-endpoints.tsv) | 1,908 | main/V3 HTTP 注册表达式与数组/循环入口；包含中间件，不能把一行当一个已可用 API |
| [e0-symbol-consumers.tsv](evidence/e0-symbol-consumers.tsv) | 1,630 | main/V3 的目标标识符/精确字符串位置及函数上下文；不证明同义字段、反射和第三方消费者已穷尽 |
| [css-interaction-rules.tsv](evidence/css-interaction-rules.tsv) | 1,945 | 主 CSS 的断点、滚动、焦点、触控、motion 等规则位置；不是计算样式或流畅性结果 |
| [test-catalog.tsv](evidence/test-catalog.tsv) | 1,527 | main测试树JS路径（含helper/fixture）、字面 import、case标题与 `NOT_RUN`；表驱动/动态 case 不一定有字面标题 |
| [v3-test-catalog.tsv](evidence/v3-test-catalog.tsv) | 15 | 固定最新V3的native-orchestration测试case目录，执行均NOT_RUN；与main的测试目录分开 |

source-files 的 `literalReachable` 从 script/shell/experience 根沿可解析 literal 边计算，覆盖根会使它比实际启动路径宽；`false` 不等于 dead code，`true` 不等于当前用户能看到。绝不据此自动删除代码。

main代表性测试与V3 Port hook的静态解释见 [test-evidence-map](test-evidence-map.md)。`test-catalog.tsv` 是main目录，不能把V3新增控制流测试当main已集成，也不能把mock/hook测试当真实Port生产接线。

本轮文档验证实际检查了本地相对链接/锚点、固定 Git 提交中的源码路径、表格列数、功能 ID、TSV 列结构和 1,065 份源码 SHA-256；883 个 JS/MJS 文件 AST parse diagnostics 为 0。这个语法/证据完整性检查不执行应用逻辑，不算产品测试或功能 PASS。

## 人工复核的业务链

| 链 | 本轮具体复核内容 | 证据边界 |
| --- | --- | --- |
| Shell | constants/index/workspace-host/library-runtime/navigation/app-shell/leave-guard/environment、搜索与 learning | 正常五域、全局 utility、深链、异步激活和 Back；非浏览器焦点实测 |
| Library/Play | library-workspaces、product-client、package permissions、resource setup、revision/knowledge/persona/history、play-product/play-controls/play-generation/session-runtime、generation-client | 真实前端/Host 调用；安装、存档、共享、生成没有实际执行 |
| Studio | studio-workspace/authoring/client/agent/frontend/source/asset、结构化 World/Knowledge/Actor/EntryPoint/Skill 编辑 | 20 个资源视图与 Review/Apply/Preview/Build 调用链；没有构建或 AI 提交 |
| Runtime/Prompt | runtime-workspace/readiness/client、credential-target-review、retrieval、prompt-presets/authoring/semantics/runtime-controls、协议控件 | 条件字段、exact refs、预览、Secret 授权链；Provider 和 API 未调用 |
| Agents/Memory | workspace panel/shell/orchestration page/host-presets、Memory page/graph-inspector/history-build/manual-corrections、Goals/Evolution | 旧 UI 真实消费者与有效原生子能力分开；完整旧 engine 内部及 151 文件清退仍归 V3 专项，不冒充全量人工复核 |
| 扩展/媒体 | capability-host、extensions-workspace/host/runtime/sdk、skills panel/organization/declarations、official-illustration/visual config/gallery/approval/media/mask/speech | 动态挂载与状态；外部代码、真实图像/语音/网络未执行 |
| 全局数据工具 | settings/preference/theme、Account 模板/user handler、backup-sync、storage center/browser inspector、logging workspace/announcements | 新旧入口状态差异与危险操作语义；无实际删除、恢复、登录操作 |
| 三端 | environment、Back resolver、native frontend platform、Android Back policy/MainActivity、Electron、Termux 文档/runner入口与 CSS | 仓库内静态适配；不是 Windows/CachyOS/Android 的产品验收 |
| E0 server | RouteResolver/GenerationService/Compiler/renderers/context/compiled-binding、generation endpoint、quality/evolution/candidates；V3 Plan/Attempt/Effect/Join/authoring/Host owner | 有物理路径与缺口证据；没有模型/权限攻击/故障恢复实证 |

## 动态导入、模板及未知入口

| 入口 | 真实消费者／处理方式 | 仍未知 |
| --- | --- | --- |
| workspace-host 的 literal import | Studio、旧 Agents、Diagnostics 按域延迟加载；Library/Runtime adapter 内再按 section 挂载 | 路由切换和取消竞态的真实 UI 表现 NOT_RUN |
| `capability-host.js:62–86` | 显式注册 regex、search-tools、game-runtime、orchestrator、memory-graph；不是扫描磁盘即可把任意扩展当内置 | runtime 加载状态与条件 UI 未运行验证 |
| `native/extension-runtime.js:5` 的 `import(url)` | 经过 extensions host/client 的启用、目标 scope 与受控 SDK，再从实际 URL 加载 | 用户安装的第三方插件源码不在固定 Git 树；其 UI/网络/可用性 UNKNOWN |
| tokenizer/worker 的绝对 literal 与 ranks 模板 | `/lib/tokenizers/*` 由构建/服务资产提供；encodingName 参与 ranks 路径 | 不可把本地 Git 缺少生成 bundle 写成产品必然损坏；worker 执行 NOT_RUN |
| Android bootstrap 的 `import(serverEntryUrl)` | 启动包装层解析实际服务入口；不是一个产品页面 | 打包运行时安装路径、原生库和设备行为 NOT_RUN |
| renderTemplate、Work frontend resource graph | 模板名／manifest／Source Graph 决定 UI；审计 HTML 标签与 Host Bridge，不仅靠 ES import 图 | 任意用户作品自定义节点/菜单/控件无法从空用户数据推定；必须保留作者扩展能力 |
| `public/lib/pdf.min.mjs` 的环境分支/worker | vendored PDF loader 中 Node 内建模块名和 this.workerSrc 不属于产品页面；依赖 facade 的 generated bundles 也单独记录 unresolved | 构建产物、worker 启动与设备特性 NOT_RUN，不据 literal 缺文件判损坏 |
| Sandbox/Worker/MCP/A2A | 属于能力受控边界与外部服务；不是本次可穷尽的浏览器页面枚举 | 配置对应真实服务、权限、审批和恢复的动态结果 UNKNOWN |

## 尚未验证及状态真实性

- **所有产品测试、浏览器工作流、屏幕阅读器、触屏、软键盘、Android Back 真机、CachyOS 和 Termux 性能：NOT_RUN**。不存在“全产品前端已通过审计”的结论。
- V3 Node/Route Prompt 仲裁、完整 Source-aware 失效、plan-prompt 发布和未发布 Prompt Draft Preview：见原 [E0 台账](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md)，**BLOCKED / UNKNOWN**，不由本研究另立接口权威。
- 现有原生 Memory 的多来源维护与普通 RP/Session 全路径对等、第三方扩展、用户自定义 Work UI、真实 MCP/A2A、真实图像与语音、跨 Storage Engine 的全业务恢复：静态入口存在；实际适用组合 **UNKNOWN / NOT_RUN**。
- 旧 ST 隐藏层、Slash Command、Macro、旧角色/群聊/附件/World Info/regex/search 等已做结构索引与挂载入口检查，**没有把全部历史链逐个运行**。当前正式 Native 页面没有挂载的旧命令不计为新产品已实现功能；其中仍有效的原生用途必须先查真实消费者再清退。
- 此目录完成的是可转交的研究资料；它不关闭 G1/G2，也不满足用户未来正式开发授权或视觉批准 Gate。
