# 验证与证据边界

用户 2026-10-04 最新 AGENTS.md 指令替代此前提供的 AGENTS.md 指令：每阶段及任务完成时，只在本地执行最小相关验证。不主动启动、等待或依赖远端 CI/GitHub Actions，远端 refs 核对仅是发布确认。没有运行的测试、浏览器、AI服务、数据库、Android或真机不得记为通过。Plan列出目标不等于已验证。

## Phase 0 文档与参考

核对远端基线与分支来源；参考HTML／TXT复制前后SHA-256一致；Plan本地链接与阶段必读模块存在；来源路径在实现树存在；文档diff空白检查；提交及push后精确远端HEAD、工作树状态与唯一HANDOFF。

原样HTML可能保留生成器的行尾空格／CRLF；不为文档准备改写用户案例。只对新增自有Markdown执行空白检查，参考原文件采用逐字节／hash一致验证。

不运行游戏、全仓库构建或历史长期压力检查，不给阶段0创建CI／测试基础设施。远端发布只核对实际 refs，不把 CI 当验收。

## Phase 1 证据

本阶段仅源码契约核对与文档验证，不执行产品实现、发布或真实删档。核对精确main/package/docs/任务refs、package祖先关系与各工作树状态。直接源码证据与反例见runtime-contracts的实际映射表；以原语而非旧resolver函数名认定能力。

必须核对：默认build compiler链与fixture不同；单事务authority resolver；candidate先叙述后原子提交；跨进程pin尚缺；dynamic record表达式与simulation静态目标限制；Task收件箱同次确定性反应；history turns不能直接代替有效轮数；保存闭包含祖先与Reply Retry会回退；SessionRepo.delete范围、FS commit-last与共享转移阻挡；Native Host composer/overlay语义。每个Core缺口要有当前调用路径及后续风险验证门槛。

审阅设计：问答确认无AI、角色/资源/开篇单源；机构及非法路径不依赖固定案件；动态提案只在模板许可内发布；所有静态分支及实际展开工作都计预算；有限轮次与真实发送额度/失败/stale不重置；铁人封住service/repository/HTTP/bridge/import/export/旧branch全部回退口；终局中断先挡续玩再清理，保护其它局。A/B/C和Package/暂缓归属不可混淆。

验证文档内部相对链接、路由模块和引用代码/测试路径存在；新Markdown空白检查；保持唯一Record且Phase 0正文不改写，唯一live HANDOFF更新到Phase 2；只允许本Plan六个修改模块、同Record/HANDOFF的diff，decisions及frontend冻结内容不改。push后核对精确docs HEAD及实施refs未变。

后续测试入口/环境已经按源码定位于implementation-staging。本环境初次核对没有Node，也没有Core/tests node_modules，故Phase 1不声称任何Node/Jest/Package/模型/浏览器检查通过。无需为设计阶段安装整套运行环境；执行Phase 2时准备与其风险测试有关的实际环境。

## Core与状态风险

使用已有相关测试先验证局部契约。需要覆盖的实际行为：未授权请求／动态事实不能发布；RNG和幂等键不能被重试重置；模型叙述与已提交事实一致；生成失败／未知提交可恢复；演化轮次／预算不会被只读动作与刷新增加。

铁人重点：死亡确认与删除边界；重复终局请求；写入／清理中断恢复；常规保存／自动保存／衍生可恢复档不能使该局续玩；无关局、旧发布与用户数据不变。只使用明确的隔离测试数据，不以真实个人存档做删档演示。

## 游戏闭环

通过已有Package工具适配后的局部检查及实际运行证明：

- 至少两种非固定调查起点，问答组合无额外模型请求，资源／关系与开篇一致。
- 自由文字的交流、日常／谋生、旅行及超凡实践具有可解释结果，旧动作目录不成为唯一玩家输入白名单。
- 机构路线的完整规则、锚点与代价；非法探索的失败／反噬及因果追查，不凭全知处罚。
- 核心成长可在短经历体现，无强制长生或世代经营。
- 世界重要度／预算、动态ID与旧事实连续，无每轮全NPC调用。
- 普通模式恢复旧状态，铁人确认死亡后不可续该局；失败与断线不会误删。
- 无家族／无组织普通角色也可体验，不必做案件完成度。

当前候选定位包括已有 tools/content-check.mjs、tools/frontend-model-check.mjs、tools/frontend-browser-check.mjs 与 tools/package.mjs 的相关 validate入口；Phase 1须核对哪些仍适用并调整正确目标，不能为迁就新方向继续强制验证旧固定开局期望。

## UI与最终集成

真实Native环境核对语义、状态、请求与页面，先检查390／1440的主流和抽屉，再按影响补375／768／1024、横屏、200%字与软键盘。键盘／焦点、reduced-motion及长文回读不跳动有实际记录。

模型预算以实际调用记录计数，不能把预写mock当成模型／world演化证明。短期可玩闭环、制度／非法路线和模式安全性是首要门槛；旧1000回合／200年压力不会自动转成本任务必选验收。只有新改动风险或明确要求才扩大验证。

最终保存精确testedCore/PackageHEAD、命令、输出摘要、已知限制与必要可携证据。旧存档迁移、生产模型质量、真机／屏幕阅读器等只在实际完成时声称。


## Phase 2 已执行证据

`run-contract-p2.test.js` 校验 opt-in capability、closed schema、bootstrap / death 的声明链接和 ledger 边界；`run-policy-p2.test.js` 在 FS/SQLite 上校验开始单 CAS / 0 发送 / 幂等、非法输入和迟到校验、独立 Node 进程 pin/抽样/额度、route retry/fallback/未知发送、普通死亡与恢复、Core/repository/HTTP/固定 Host/编译 Native bridge 的铁人限制、当前 resume 与 spent-ledger portability、stale/伪造死亡、死亡/保存/导出并发、其它局保护、部分清理/完成标记恢复及 Task 取消。FS 另有死亡 HEAD 提交后墓碑写入失败的 commit-last 故障注入。

`generation-budget-p2.test.js` 使用真实 adapter→回环合成 HTTP provider，校验实际后台队列重试的两次发送、跨 HEAD / 重开 / restore 不返还、未到窗口与 stale 输入不发送、preview/preflight 零发送、受控提案一次发布及跨窗口 period 上限。period 上限用较小的声明值触发实测边界，实际 Package 初值仍为 runtime-contracts 的 2/4/10/20。上述新增 70 项与既有 320 项共同组成最终 23 套件 / 390 项通过；准确命令和 tested HEAD 在唯一 Record。

ESLint 对全部 23 个变更 JavaScript 文件无错误/警告，git diff --check 通过。执行环境 Node v22.23.3，运行包的官方 SHA-256 已核验；Core/tests 锁定依赖通过 npm ci 安装，SQLite 原生依赖已构建。无真实个人档案、旧发布或用户数据被用于删档测试。

未执行 MySQL/PostgreSQL、远端 CI、生产模型、游戏/Package新 profile、浏览器、Android、屏幕阅读器或新版本发布。编译 Native bridge / 路由测试证明 Core 接口语义，真实产品前端与游戏闭环仍按后续阶段验收。
