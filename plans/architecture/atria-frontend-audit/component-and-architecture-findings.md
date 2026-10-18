# 组件复用、功能架构问题与重构处置

这是功能和交互架构审计，不评价当前或未来配色、字体、圆角等审美。所有问题均有源码落点；功能 ID 见 [index 的分域清单](index.md)。

## 可复用能力与组件边界

| 组件／authority | 真实消费者 | 可复用的语义 | 不能照搬的东西 |
| --- | --- | --- | --- |
| Navigation Authority + WorkspaceHost | 五域、global utility、Library/Runtime 子页、repair return || 历史 mode aliases、隐藏 legacy UI 和旧 recovery fallback 不是未来兼容要求 |
| Shell primitives/components | state panel/button/icon、list/detail、Dock/Sheet、command | loading/empty/error/retry、keyboard/focus、移动 Sheet 的操作等价 | 当前 token/视觉不是这次新重构的定稿 |
| `native/library-ui.js` | Library、World/Knowledge、Persona、Extensions、部分 Settings | el/action/field/disclosure/feedback、confirmLibraryAction、referenceRemediation | 同名 wrapper 不等于相同保存、审批和删除后果 |
| source / typed value / World / Knowledge editors | Studio 与 Library revisions || 不另建平行 JSON Store；完整原文无损能力不能靠 stringify 假定 |
| ResourceGraph/reference rows/bundle controls | Library/Studio/StorageCenter/删除修复 | exact refs、Used By、scope、reverse blockers、closure | “把依赖全改 latest”、静默 cascade 或删除所有历史 |
| Product/Studio/Runtime/Skill clients | 各功能页 | auth/CSRF、错误码、receipt/currentness、CAS、resource changed 事件 | 新 UI 自建 write API、Browser 自发 grant、把 HTTP 成功当领域 commit |
| Native Session/ConversationWindow | Play、作品自定义 frontend、History/Shared | 正式 timeline/branch/revision、受控 composer、窗口读取、只读预览 | 旧 ST DOM/消息格式主权、旧 swipe/regen adapter |
| Host Bridge + presentation runtime | text/component/hybrid/full Work UI、Studio preview | 作者表现自由；受控 typed capability、生命周期、局部 state/environment ||
| Memory / Goals / Experience / Eval | 旧 Agents panel 与 Project Task 内的有效原生服务 | provenance、criteria、feedback/hypothesis、质量/发布/预算原权威 | 旧 Workspace/Director targets 和旧 orchestration engine writer |
| storage center / lifecycle / recovery | Account/Settings、Library/Session/Project、backup | 预览、身份/依赖保护、任务收据、分批/中断恢复 | raw storage edit 不能绕过 Native business authority |

这些是现有组件/authority 的复用机会。用户后续可以改变 UI 组件实现和外观；真正复用要求是业务与权限合同，不能把“保留组件”解释为保留零兼容已淘汰的系统。

## 有源码依据的功能架构问题

| ID | 发现、证据与影响 | 后续功能架构处理方向（研究建议） ||
| --- | --- | --- | --- |
| AR01 | `workspace-host.js:196` 仍挂旧 Agents panel；`orchestration/page.js:497–774` 创建旧 spec/loop/agenda/director presets 与绑定；Play `play-generation.js:79–96` 真正消费旧 mode | V3 原 Plan/Run/Effect/Receipt 硬切覆盖全部调用方，再删旧 mode/settings/adapter；新 UI 不包装旧模板续命 | 功能架构；确认清退对象，完整实现 BLOCKED |
| AR02 | `panel.js:365–383`、`studio-agent.js:644–645` 挂 Goals/Evolution；Memory 通过 capability ports 真实加载 | 将有效 Memory/Goal/Feedback 视为独立原生能力，迁离旧容器；不能按目录整树删除 | 功能架构；接通静态链，Runtime NOT_RUN |
| AR03 | `RouteResolver:92` 从 Route.promptProgramRef 取 Program；GenerationService:46–49 拒 fallback 换 Program；V3 dependencyPin 与 Agent pin 不代表新 Program 生效 | 原 E0-01 明确受信 Node selection、Route authority、fallback identity；UI 能解释为什么不相容 | 物理接口/功能架构；BLOCKED |
| AR04 | `context-providers.js:5,38–44` 已把 recent_raw/memory/narrative_spine 映射 user history，其他 context.fact 仍进 slots；Compiler:234 与 renderer messages system 路径仍需区分信任 | 不将“所有 Memory 都作为 system”当现状；审查 state/fact/authorial/host-only 的真实来源并落实 D5 typed lowering |静态风险，未复现漏洞；E0-02|
| AR05 | PromptPresets、generic resources、Studio tools、Route picker、Play choices 是多个入口，同资源身份/写入语义却不同 | 统一资源详情/引用/跳转组件，显式区分“改定义／改推荐／改 Route／会话选项”；保留原 authority | 功能信息架构；整合入口，能力不删 |
| AR06 | `prompt-authoring.js` simple/advanced 是现有 JSON/fields；`studio-frontend-editor` 有 Draft preview；Runtime `/preview` 只用受权 exact refs | 新 D8 raw/structured/Wire diff 与可信 Prompt Draft compile 单独实现，不能复用错误的“已有 Preview”完成标志 | 接口与编辑语义；BLOCKED |
| AR07 | Runtime、Studio、Library 在 commit 后刷新失败时各自处理；旧控件 wrapper（library-ui.action、Studio button、Skill bindAction、jQuery）busy/error/focus 不统一 | 统一非权威 mutation feedback 组件，但保留不同服务 receipt、CAS、cancel 和 rollback；确保不重复写 | 交互架构；不是颜色问题 |
| AR08 | Shell Dock、compact Sheet、Play inspector、旧 Agent inspector、Studio inspector、Popup/dialog、插件 panel 多套层级；Back handler 可委托 | 共用 transient/focus/back 合同，清楚每层是否阻挡路由和何时归还焦点；保留作品 UI 逃生路径 | 交互架构；真实穿透/焦点故障 NOT_RUN |
| AR09 | Library/Project/Package/scoped refs、World/Knowledge binding、Persona default、Session selection 多处使用 exact revision | 提高“当前／历史／原件／副本／引用版本／dirty”的可辨识性；点击 Used By 能回原 scope | 信息架构；版本正确性必须保留 |
| AR10 | 新 Settings 六类中 Notifications/Privacy 是说明+跳转；Runtime Secret 有选择/创建，却无完整独立 rotation/delete 管理页 | 不画虚假可用开关；若增加完整通知或 Secret manager，列为新产品提案讨论 | 功能真实性；部分实现 |
| AR11 | Account 当前模板 `userProfile.html` 已有 Sign out 和 user.js handler；旧资料仍称缺失 | 用当前 HEAD 修正审计，不把已修复问题重复列为待开发 |本轮未实际 logout|
| AR12 | `storage-management.js:13–15,218–286` 有 trash/restore/purge/clean/repair/history 和 partial/interrupted/paused-review；backup/branch/Mask 又各有恢复语义 | 用对象和后果命名操作；分别说明不可逆、可恢复、只停后续、仅本机 Undo；不设计万能“撤销” | 功能与交互架构 |
| AR13 | Memory graph `source locate` 使用 `#chat .mes`；Native Play 使用 ConversationWindow 和自己的 timeline | 改为原生 message/source locator，可加载目标窗口并授权；不能仅删按钮丢失回溯能力 | 真实消费者脱离旧 DOM；部分接通 |
| AR14 | Skills manager 支持 global/project/package，又留 preset/orch-preset/character；Search Tools 留旧 injection position/depth/role 与旧 Agent preset | 原生 Skill/搜索引用能力保留；旧 ST scope 和自动注入/旧编排配置按真实 consumers 清退，不能把 search_search/search_visit 一并删掉 | 功能架构，清退需消费者追踪 |
| AR15 | Visual Director 的 image candidates 与旧 Agent Director 同名；`visual-director-ui.js:6–29` 在官方插图链内真实使用 | 处置按调用链和领域 authority，保留有效视觉候选/分析/审批能力；不要全仓搜 director 就删除 | 必须保留原生能力 |
| AR16 | Workspace child 多数可深链，preset detail、Extension tab、部分 inspector 的选择只在 controller local state | 重新设计跨页定位/repair-return/分享路径；不能把任意 URL 参数当授权 | 导航架构；|
| AR17 | Play 有 bounded timeline，History/Storage/Gallery 有分页；某些 Work/Project/Prompt/Skill/Memory 数据先全载或全量过滤 | 保留已有限窗/分页机制；针对真实大资源/长文本测输入延迟、定位、滚动后再决定数据/组件策略 | 性能需求；**未观察到 jank，非实测缺陷** |
| AR18 | native extensions `import(url)` 执行可信 JS；Work UI 通过 sandbox/typed bridge；MCP/A2A 为另一 Host/网络边界 | 在安装/启用、target scopes、external data transfer、工具审批上分别表达信任；不以一张“权限”弹窗混淆 | 权限和交互架构 |
| AR19 | Shell 通用按钮导航缺少普通 link 的新标签语义；Search Tools 的 manage-key 是可点击 div；部分 legacy icon 未 aria-hidden | 最终控件按 link/action、键盘/ARIA/焦点协议统一；先核真实可见入口。参考 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) 的语义控件要求 | 静态无障碍问题/风险；可见性与读屏 NOT_RUN；`settings-ui.js:99`、logging/workspace:109 起 |
| AR20 | `source_unready` 是 quality.js 的真实固定出口，panel 却已提供 Eval/Publish；V3 authoring-service 明确拒 Source binding 未接 | UI 以实际 gate 呈现“来源未就绪/端口未接通”，不把表单完整度或已有 class 判为功能完成 | 状态真实性；BLOCKED |
| AR21 | Search Tools `settings-ui.js:542` 的单条 Delete 直接 mutation；bulk/reset 才走 confirmation；LAN actions/managed-entry actions 仍有 clickable div | 按实际恢复后果统一确认或可撤销机制，并补语义/键盘；不能直接删除搜索管理功能 | 交互与无障碍；静态发现，未运行复现 |

## 四类处置汇总（以分域 ID 为细目）

| 分类 | 必须覆盖的能力或明确对象 | 重要限制 |
| --- | --- | --- |
| **必须保留** | 原生 Work/Package/Session/Save/History/Persona；World/Knowledge/Memory；Studio 全资源视图、Source/Assets/Review/AI/Preview/Build；Native Prompt/Generation/Route/Model/Retrieval；Skills、有效搜索/Regex/插件；有效插图/Visual Director/Media/Speech/Shared；主题自定义/账户/备份/Storage/Diagnostics；D8/V3 已冻结目标 | 保留能力和权威，不要求复刻旧组件/DOM；设计中功能不能被 HTML 遗漏抹掉 |
| **可以整合** | 多处 Prompt/资源编辑入口、Used By/版本选择、模型修复入口、通用 feedback/busy/error/focus、Inspector/Dock/Sheet、Account/Settings 的同一 storage/backup 跳转 | 不合并不同 writer、不同 scope、不同 approval 或不同 rollback 后果 |
| **需要重组** | Agents 原生功能迁出旧 Workspace、作者/玩家/运营配置层级、exact refs 导航、低频维护/危险操作、原生来源定位、手机全文/图编辑、Extension scope 与 capability 说明、尚未接通项说明 | substantial 新产品能力需要用户讨论；不能在研究阶段自定新 IA 为正式批准 |
| **确认废弃** | 旧 ST preset prompt_order/depth/注入/API/数据迁移兼容；旧角色/群聊/消息 swipe/regen 等旧 UI 合同；旧 Workspace/Single/Spec/Loop/Agenda/Agent Director modes、旧 browser checkpoint/takeover 主合同、旧 prompt/strategy evolution targets、旧 compatibility shim/双读双写 | **不是按关键词/目录删除**。有效 Atria Actor、Memory、原生版本/Source、Visual Director、通用函数和正式 receipt 不能误删。当前仍依赖的底座须先由对应原生接口接替后在同一硬切中删净 |

“确认废弃”来自当前用户方向及原 D1–D8/V3 合同；本研究没有授权现在删除任何代码，也没有创建迁移兼容层。未识别 consumer 的 helper 暂为 UNKNOWN，不以“看起来旧”直接判废。

## 留给外部设计 AI 与后续讨论的视觉事项

配色、字体、主题气质、材质、图标风格、间距密度、组件造型、页面视觉组织和动效风格都保持开放。设计 AI 可提出多个方案，但要说明其如何承载清单中的复杂任务；最终由用户多轮确认。上表 AR01–AR21 的权限、来源、版本、写入、恢复、可发现性与交互等价问题不能靠审美样稿省略解决，也不应因视觉偏好被削成功能更少的产品。
