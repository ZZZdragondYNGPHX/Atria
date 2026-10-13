# Atria 性能与长期体验 — P4 冷热启动、资源加载与 Android/Termux 启动路径

- **Task ID**: `refactor/atria-performance-long-term-experience`
- **状态**：第十二轮分层启动方案 C **已经用户批准**；具体模块 DAG、启动预算及端侧实现仍需实测与工程设计，尚未修改产品代码。
- **权威前提**：[index.md](index.md)；P0 性能观测在 [measurement-and-evidence.md](measurement-and-evidence.md)，P1/Play 在 [client-interaction.md](client-interaction.md)，P2/S2 数据恢复在 [runtime-storage.md](runtime-storage.md)，P5 生命周期/缓存预算在 [stability-recovery.md](stability-recovery.md)。
- **只读源码基线**：`feat/agent-compute-runtime@f4815c7277adc02d36860f45dcf12f43f64453e2`；真正实施前先复核集成后的 `main`。尚未执行 APK/Termux 真机或浏览器基准。
- **边界**：不为旧 dev 数据兼容保留额外引导流程，不修改正在开发的产品代码；保护当前受支持格式的 S2 提交、RunControl/SavePoint 与授权规则。长期会话流畅度和数据安全权重高于单纯的开屏跑分。

## Responsibility

精确划分进程启动、HTTP Ready、WebView 主帧、Shell 可见、APP_READY、Native Session 已验证可读、正文可交互/可发送、S2 断电恢复可用等不同阶段。针对浏览器/Node、Android APK 内嵌 Node.js Mobile + WebView、Termux 本地 Node + 浏览器、外部端点 WebView 的差异建立测量与合理资源路径；不通过提前隐藏遮罩/降低合法状态校验伪造启动提速。

## 第十二轮源码审计：已实现优化与待证风险

| 编号 | 实际代码（固定源码快照） | 已确认事实与研究重点 |
| --- | --- | --- |
| S1 前端入口 | [`public/init.js` L106-L139](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/init.js#L106-L139) | `lib.js` 与 `script.js` 的模块图加载已并发启动并分别测时；优化不能把并行又改成串行，也不能以原始文件体积直接推导启动耗时 |
| S2 UI 里程碑 | [`public/script.js` L2020-L2048](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/script.js#L2020-L2048) 与 [L2084-L2165](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/public/script.js#L2084-L2165) | 已存在 loaderHidden、visible、`APP_READY` 多阶段以及 Select2/可选模块的延后预取；但 APP_READY 前仍顺序执行部分扩展、Tokenizer、模型选择和其它 Batch，是否为 **Native Play 第一条可发送消息**所必需需要逐调用方确认 |
| S3 Bootstrap 响应 | [`src/endpoints/bootstrap.js` L12-L45](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/endpoints/bootstrap.js#L12-L45) | 已用部分 Promise 并发获取 Characters/Groups/Version，但返回 settings + masked secrets + avatars + Characters/Groups；应从实际 Native 主屏消费者检查请求大小及是否在首屏/首玩热路径，不直接砍掉仍必需的内容 |
| S4 服务启动 | [`src/server-main.js` L736-L910](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/server-main.js#L736-L910) | 已为 user metadata/stats/settings/disk cache 做并行初始化，也有 `pre-setup.plugins`、`pre-setup.frontend-cache` 等 Phase。Node HTTP 启动之前等待部分插件加载与 Webpack cache，需先测耗时再决定插件可否安全延后 |
| S5 Bundle 完整性**潜在不一致** | [Android `AtriaRuntimeManager.kt` L34-L41](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/src/main/java/com/atria/app/AtriaRuntimeManager.kt#L34-L41) 只要求 3 项；[`webpack-serve.js` L6-L10](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/middleware/webpack-serve.js#L6-L10) 要求 5 项 | **合同不一致已由静态比对确认**：Kotlin 缺 `lib.webllm.bundle.js`、`atria-script.bundle.js` 的完整性要求。通常 Gradle 收集所有输出，所以并不能据此断言当前 APK 缺这两项；但不完整构建可能被 Kotlin 判为通过，服务端仍回退实时编译。实施应统一 build/server/runtime 的预构建 Bundle Manifest 与完整性/可用性验证，避免隐性冷启动回退 |
| S6 APK 资产展开 | [`AtriaRuntimeManager.kt` L199-L239](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/src/main/java/com/atria/app/AtriaRuntimeManager.kt#L199-L239)、[L455-L513](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/src/main/java/com/atria/app/AtriaRuntimeManager.kt#L455-L513)、[`build.gradle.kts` L1-L95](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/build.gradle.kts#L1-L95) | 首装/升级时，版本标记变化会删除并递归复制 Node 项目、依赖与预构建 Bundle；常规已命中版本标记的启动不会每次全量复制。需要独立测“更新首次启动”所占成本，且保证用户数据目录/当前 S2 核心记录不参与可删除的 Runtime 资产树 |
| S7 APK Server 与 WebView Ready | [`MainActivity.kt` L2172-L2275](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/src/main/java/com/atria/app/MainActivity.kt#L2172-L2275)、[L432-L436](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/src/main/java/com/atria/app/MainActivity.kt#L432-L436) | 当前在 Node `/api/ping` 成功后加载 WebView，而 `onPageFinished` 直接隐藏遮罩；前者只是服务可达，不保证 Native Session 可继续，后者不能保证 UI 已完整渲染/可输入。建议独立三态：ServerReachable、ShellInteractive、PlayReady，并防空白遮罩/错误页误判 |
| S8 APK 打包优化边界 | [`android-app/app/build.gradle.kts` L132-L170](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/android-app/app/build.gradle.kts#L132-L170) | 目前 release 关闭 R8 minify 与 resource shrinking，未见 Baseline Profile 构建插件。可候选研究 R8/Baseline/Startup Profile 的收益，但它们优化 Kotlin/ART/DEX，不会自动缩短 Node.js import、Webpack 或 WebView JS 执行；须由 Macrobenchmark 测 |
| S9 Termux 链路 | [`scripts/termux/atria.sh` L111-L169](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/scripts/termux/atria.sh#L111-L169)、[`setup.sh` L45-L57](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/scripts/termux/setup.sh#L45-L57) | 初始化/更新时已预构建 Webpack；启动时 200ms 检测 HTTP 并打开浏览器。脚本「HTTP Ready」与网页「首次可交互」仍不同；不必再建议缩短一个已不存在的 1 秒固定等待 |
| S10 已有日志与埋点 | [`src/startup-timing.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/src/startup-timing.js)、[`tests/client-startup-telemetry.test.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/client-startup-telemetry.test.js)、[`tests/startup-milestone-telemetry.test.js`](https://github.com/ZZZdragondYNGPHX/Atria/blob/f4815c7277adc02d36860f45dcf12f43f64453e2/tests/startup-milestone-telemetry.test.js) | 已有跨 Node/Client 的启动里程碑和日志；应在已有 startupSessionId / serverBootId 上补可追踪阶段，不另起一套重复遥测系统 |

**审计结论范围**：S5 的 Kotlin/JS 清单不一致属于明确代码差异，其导致的 APK 冷启动回退仍是**待复现的风险**。其它同步/等待阶段已知存在，但未测量任何 P95、设备表现，不能写成「已证实启动慢」。

## 第十二轮首先统一「快」的定义

| 阶段与场景 | 定义 | 不可拿来替代 |
| --- | --- | --- |
| T0 原生启动请求 / Node process spawn | APK 启动 Intent / Termux 命令请求，浏览器路径独立记录 NavigationStart | 不能把首页 HTML 请求当作手机点击启动的 T0 |
| T1 ServerReachable | Node 或远端 HTTP 端点已能响应指定健康接口 | 不是 Native 数据/插件/用户身份已经准备好 |
| T2 ShellInteractive | Atria 真实宿主 Shell 已绘制并能响应导航/基本设置；遮罩行为有明确状态 | 不等于能直接恢复当前游戏或发送消息 |
| T3 PlayReady / FirstActionReady | Session 最新受支持 S2 HEAD / 权限 / 必需资产通过验证、Native Play 正文/输入框可操作，提交路径可用 | 不可仅依赖 `onPageFinished`、`loaderHidden`、`APP_READY`、`/api/ping` |
| T4 OptionalReady | Studio、扩展、诊断、非当前游戏资料及昂贵索引在需用时完成 | 不为不相关功能阻塞 T2/T3 |

**测量样本族须分开**：首次安装/升级后的资产解压启动；已有完整 APK Runtime 的进程冷启；同进程 Activity 重建或 WebView 重载；热切换 Session；Termux 已运行服务仅打开浏览器 vs Node 全停后启动；独立 Node 服务/外部远端端点。不同场景不能混合计算一个「冷启动 P95」。

## 第十二轮架构比较（**已选择 C，保留历史候选**）

| 选项 | 主要方向 | 收益 | 缺点 |
| --- | --- | --- | --- |
| A — 全链路原样启动，局部提速 | 保持所有模块在启动时加载，逐个缩短耗时的函数 | 行为变化小、工程容易分割 | 不必要模块依旧在关键路径，复杂长会话恢复仍可能阻塞首玩 |
| B — 激进 UI 先绘制 | 尽快把 Shell/首屏显示出来，其它后台任务尽量延后 | 视觉启动可能更快 | 容易形成「看起来已就绪却不能玩」的假启动，还可能抢占首个游戏输入或触发竞态 |
| **C — 端到端测量驱动的分层启动（第十二轮已批准）** | 已有里程碑继续完善 T0–T4，把首玩所需的安全模块和 S2 状态保留在关键路径，其余资源按产品路由惰性激活；APK/Termux 校验预构建资源且区分首次解压/缓存命中 | 同时优化真实可用时间与资源成本，不以隐藏遮罩、降低校验或常驻后台换速度 | 需要真实消费者图、Native Player 首玩 readiness、APK/Termux 多环境样本，分层任务有正确性与诊断成本 |

### 方案 C 已选的方向（实现细节、阈值未冻结）

1. **梳理关键依赖 DAG**：按 T0→T1→T2→T3→T4 标记必要/可延后依赖。首玩前只加载 Native Shell/Play、用户身份/权限、当前 Project/Session manifest、最新已提交 S2 Revision、必要资产、已生效上下文/模型可调用准备条件；不提前完整初始化未进入的 Studio/编辑/诊断/所有旧模型路由和全量历史，涉及安全与事实完整性的检查必须保留。
2. **已有优化基础不能推倒**：复用 `init.js` 并行模块树、`script.js` 可见后预取、`server-main` 并行预设阶段、Server 端 Lazy Router、Webpack 内容寻址缓存和 Termux 安装时预构建。应让实际 Trace 决定拆分目标，避免散乱大量小 import 造成请求与解释器压力。
3. **优先关闭 APK 冷启动「隐性重新编译」风险**：同源生产 Bundle Manifest 在 Gradle 打包、Kotlin 展开和 Node Webpack 守卫中一致；若五项中有缺失，构建时失败或给出可靠诊断，不把环境不兼容/损坏伪装成缓存命中。新建纯开发期格式可直接硬切，但当前 S2 数据/RunControl 和 Secret 不能混入可删除 Runtime bundle 树。
4. **Android 首装更新单独优化**：测目录复制耗时、文件数/总字节、解压/CRC、copy bandwidth、打包对齐与真实闪存；评估版本化 staging 的原子发布、按必要文件拆分，正常热启避免扫描整棵资产树。保留数据盘与升级应用包安全分离，并验证部分解包失败后可以重新恢复，而不静默覆盖已确认游戏数据。
5. **WebView 进度不混用**：`onPageFinished` 只代表主帧完成加载，不能直接认定 Atria Native Play 可发送。建议通过本地可信 origin 的显式状态协议接收 `ShellInteractive` 与 `PlayReady`，结合 `postVisualStateCallback`/实际帧验证决定首屏覆盖层时机，具备失败/超时路径且不新增不安全跨域 JSBridge。若用户用远端自定义 Endpoint，其 readiness 与安全域应独立评估。
6. **Termux 多阶段反馈**：现有 `curl -I` 200ms 轮询已够细；保留服务器健康检查，网页另记录 T2/T3 并从首玩角度分析 CPU/网络、Node Bundle 缓存热度和浏览器实例复用。无需为了热启常驻无界内存/强行持有 WakeLock；按用户设置与设备耗电实际测取舍。
7. **性能不是「越晚加载越好」**：Lazy 造成首次打开 Play/Studio 卡顿时可以做有限预热；预热不抢占前台，也不能在用户正在生成时和 S2 I/O 争资源。遵循已冻结 P5 预算机制和生命周期 Owner/Epoch。
8. **可观测错误**：ServerReachable 但 Native Play 不可继续，应该明确报告初始化中/缺少依赖/无效数据/模型未配置，而不是永久 spinner；`APP_READY`、UI 流畅和可恢复性使用不同里程碑与错误状态。

## 验收与最小测试方案（待 P0 量化）

- 同一设备、同一 Project/Session、同一缓存冷/热状态；报告 T0→T1→T2→T3 的 P50/P95、各阶段 Trace span、APK 解包文件数/字节、Bundle 预建命中率、Webpack 回退原因、CPU 与 Node/WebView 内存峰值。
- 建议优先做高成本真实路径的**小范围专项验证**：Kotlin 与 JS Bundle Manifest 一致性单测或构建时核验、首玩 Native readiness 的联动测试、Termux server-only/browser-only 分段启动测量；改到哪一块验证哪一块，不要求每小改都跑全量 CI 或多日 Soak。
- 安卓真机区分冷/温/热与首装/升级。使用 Macrobenchmark 的 TTID/TTFD/自定义业务 `PlayReady` 时序，并报告具体机型、SDK 和 WebView 版本。Chromium 移动视口仅可验证 Web 组件，不能证明 Node.js Mobile/APK 真实启动。
- 可考虑 Baseline/Startup Profiles 与 R8，但只能作为 Kotlin/DEX 独立 A/B：它们不会替代 Node 模块编译、Webpack 预构建或 WebView JS 性能优化；必须根据 Android 实测决定，不能用第三方声称的提速百分比作为 Atria 成果。
- S2 与用户安全回归：启动失败不可虚报最新 HEAD 已恢复；用户操作权限与铁人终局只读归档在启动链路不降级；持久化数据不可在加快解包/清缓存时被擦除。

## 官方资料与依据

1. [Android: App startup time — cold/warm/hot](https://developer.android.com/topic/performance/issues/launch-time)；[Macrobenchmark StartupTimingMetric](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-metrics) — 区分 TTID/TTFD 与自定义业务就绪。
2. [Android: WebViewClient.onPageFinished](https://developer.android.com/reference/android/webkit/WebViewClient#onPageFinished(android.webkit.WebView,java.lang.String)) — 主帧完成不保证下一帧 DOM 可见，必要时使用 WebView `postVisualStateCallback`。
3. [Android: Baseline Profiles](https://developer.android.com/topic/performance/baselineprofiles/overview)、[Startup Profiles](https://developer.android.com/topic/performance/startupprofiles/overview) — ART/DEX 优化针对 Android 原生层，最终收益依架构。
4. [web.dev: Optimize resource loading](https://web.dev/learn/performance/optimize-resource-loading)；[Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/overview) — 关键渲染路径及脚本执行 Trace。
5. [Node.js CLI CPU profiling](https://nodejs.org/api/cli.html#--cpu-prof)、[Node perf_hooks](https://nodejs.org/api/perf_hooks.html) — 启动 CPU 剖析与分阶段观测。

## 第十二轮确认结果与后续实施问题

**已经选择 C**：以真实 PlayReady（当前支持格式的 S2 历史/权限/必要依赖被验证，能够继续并正常提交新操作）作为启动与玩家可用性的独立指标，区别于 HTTP 就绪、Shell 可见、`APP_READY`。保留安全依赖的同时优化关键路径；Android APK、Termux、浏览器分别测量冷热路径并以一致的完整 Bundle manifest 防止隐性编译回退。

**仍需 P0 与实施证据**：Android/Kotlin/Node 构建清单统一策略、实际应用启动 CPU/磁盘耗时和准确瓶颈、App/Android WebView 就绪消息协议、首玩模型资源加载时机、启动延迟目标及未使用功能按需激活清单。R8/Baseline Profile、APK Bundle 分片打包方案只是备选实验，非已批准强制新架构。

## Material design changes

- **2026-10-13 / 第十二轮**：用户批准 P5 内存生命周期 C 后建立本模块；结合前端/Node/Android/Termux 实际源码与官方资料提出 P4 A/B/C；确认 Kotlin 3 / Server 5 项预构建 Manifest 不一致、APK onPageFinished 隐藏遮罩的判定语义、Termux 已有 200ms 健康轮询；所有性能结果仍待实测，方案 C 已获批准，具体延迟和技术实现仍待 P0 实测。
- **2026-10-13 / 第十三轮开端**：用户批准第十二轮方案 C；冻结 T0–T4 分层启动及**真实 PlayReady**、安全关键路径、统一 Android 构建/Kotlin/Node 预构建产物清单、多平台冷热路径分开评估。S5 清单不一致仍只是已经确认的源码风险，未测得运行时回退；尚未改动产品代码。
