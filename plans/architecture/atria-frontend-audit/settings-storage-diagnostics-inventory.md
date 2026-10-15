# Settings、账户、备份、存储、诊断和公告

基线与证据等级见 [index](index.md)。以下为当前 main 的实际入口及 handler 静态核对；服务、权限、恢复和三端运行仍 **NOT_RUN**。旧版独立盘点不是本清单的事实来源。

## Settings 与现有主题能力

盘点“当前支持主题/自定义 CSS”不表示批准任何新视觉系统。正式重构的颜色、字体、材质、造型和动效由外部设计资料与用户后续讨论决定。

| ID | 页面／控件 | 数据与操作 | 状态、权限与恢复 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| T01 | Settings 六类、搜索、结果定位、Back、related links | Appearance & themes、Reading & input、General & language、Notifications & sound、Accessibility & performance、Privacy & media；child route 含 category/search/setting | 中文/英文 alias 搜索，恢复各页滚动；定位展开 details/focus；无匹配解释；不是旧四类设置页 | 接通／保留并可重组 | [SETTINGS](source-map.md#settings) settings-workspace:6–142 |
| T02 | Appearance mode light/dark/system、day/night gallery、preview、Use theme、Cancel preview | 原 theme service 的 selection/preview；浏览与应用分离 | 离页取消 preview；busy/migrationPending 禁冲突；缺 theme 显示 fallback 并提示修复；preview 不算已保存 | 接通／保留能力 | theme-controls:15–63、128 起；theme-service |
| T03 | theme name、colors/accent、建议恢复、contrast note | 编辑内置 theme 形成 custom copy；用户 custom choice 仍保留 | 颜色对比检查只提供说明；失败有持久化错误；本研究不选具体颜色 | 接通／保留能力 | theme-controls:64–80、157 起 |
| T04 | Enable theme CSS、textarea、Export/Import、Save/Cancel import、Delete custom、original file/snapshot export、Retry upgrade | JSON schema/原主题文件；import 不自动 apply，删除引用 slot 回 default | 自定义 CSS 故障可 `Ctrl+Alt+Shift+R` 或 `atriaNoThemeCss=1` 临时抑制，不抹原文；**旧主题迁移桥接现状不等于未来继续 ST 兼容** | 接通；保留原生自定义/恢复，旧兼容逻辑待清退 | theme-controls:80–127；appearance；theme-model |
| T05 | Interface size slider、Send on Enter selector | 原 preference writer；slider release 保存；auto/Control-Enter/plain Enter 模式 | saving/error/Retry save；IME 不发送；缩放影响全界面，不只是故事文字 | 接通／保留 | preference-controls:reading:6–10、persist |
| T06 | Language en/zh-cn；Confirm before leaving smart/always/off | locale 保存浏览器并 reload；离页策略用原 powerUserSettings | 不能把 language browser-local 写成所有设备同步；save 失败留值可 retry | 接通／保留 | preference-controls:general；settings-workspace |
| T07 | Reduce motion、Reduce blur | 原 reduced_motion/fast_ui_mode；系统 prefers-reduced-motion 有环境传播 | 现有实现是能力，不规定将来动画样式；各子 UI 是否完全遵守需运行验证 | 接通／保留 | preference-controls:accessibility；appearance/environment |
| T08 | Notifications & sound | 当前只显示 Native completion alerts **说明**和 Open Diagnostics；旧通知/声音/keepalive 偏好未接 Native Session lifecycle | 不得把说明页画成已工作的完成通知/声音开关 | 部分／重组；是否新增需产品讨论 | settings-workspace:60–66 |
| T09 | Privacy & media | 当前说明 Work/Session external media permission，Open Library | 不是账户级“一键允许所有 Native 外部媒体”；旧聊天媒体设置不发 Native grant | 部分／重组 | settings-workspace:67–73 |
| T10 | 相关入口：Account & backups、Extensions、Diagnostics、Resource usage & safe cleanup、Learning | 跳原 utility/StorageCenter/learning | 入口可整合，但不能删低频数据恢复能力 | 接通／整合 | settings-workspace:75–80 |

## Account、登录和身份

| ID | 控件／任务 | 当前处理 | 权限／失败／恢复 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| U01 | Account：avatar change/remove、display name、handle/role、created/password 状态 | utility mount openUserProfile，原 user controller | accounts-disabled 有 local account 提示；头像/名字不等于 Persona；失败 Retry | 接通／保留 | [ACCOUNT](source-map.md#account) user.js；utility-workspaces:217–249；userProfile.html |
| U02 | Change password、Sign out | `data-require-accounts` 控制显示；`.userLogoutButton` handler 调原 logout，重新进入登录并设 noauto | **当前有可见 Sign out，旧盘点“仅隐藏按钮”已失效**；本轮没有真实退出/改密码 | 接通/条件／保留 | userProfile.html:31–32；user.js `.userLogoutButton`、logout |
| U03 | Settings snapshots：list/refresh、create、view contents、restore | 原 settings snapshot endpoints；snapshot 内容不是全部业务数据 | Restore 单独确认；失败不能称已恢复；与 ZIP/Native Save/Storage Recycle 三者区分 | 接通／保留 | user.js:254–430；templates/snapshotsView.html |
| U04 | Backup & sync、Storage management、Reset settings、Reset everything | 原 user/backup/storage controller；danger zone 独立展开 | destructive confirmation，不能拿 reset 修普通配置问题；无管理权限不得显示/执行越权动作 | 接通／保留 | userProfile.html Data/recovery/Danger Zone；user.js |
| U05 | Admin | 旧管理员面板已移除；后端 admin endpoints 不能证明有新 Admin 页面 | 新增管理 UI 若需要应单独确认产品范围 | 未提供当前页面／不复活旧入口 | user.js:77 附近；模板与路由注册 |

## Backup & sync 与 LAN

| ID | 页面／控件 | 实际处理、数据与写入 | 状态与恢复边界 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| B01 | Automatic backups：chat/settings enabled、per-entity/total/size、Save retention、Cleanup now、Restore defaults、Refresh/Search backup history | 自动清理**保留策略**和既有 backup history；不是定时自动创建完整 ZIP | 旧 chat/character/group 相关保留项属于 ST 清退范围；原生 settings snapshot/备份能力保留；风险不靠名字判断 | 接通混合／保留原生、废弃旧兼容项 | [ACCOUNT](source-map.md#account) backup-sync-center；backupSyncCenter.html automatic |
| B02 | Archives：scope checkboxes、Select all/recommended/none、Create & download | Native includes Works/Sessions/Library/Runtime/project sources/required blobs；Secrets 单独选；旧数据类别仍在当前模板 | Secret 是敏感备份选择而非自动外发；正式重构不复刻旧 ST 类别作为兼容义务；保留原生 export/recovery | 接通／保留并重组 | backupSyncCenter.html archive；backup-sync-center |
| B03 | Choose ZIP、merge/overwrite/full、Preflight report、Start restore | probe/preflight → category/conflict/engine/credential need → confirm → restore stream | 没有 preflight 不写；恢复 source/CAS/Engine guard 仍在原服务；未知结果需查回执，不能仅重新发请求 | 接通／保留 | backup-sync-center:418–588；restore stream:145–304 |
| B04 | Cancel and roll back、progress、recovery points refresh/list/restore、restore previous state | NDJSON 进度与 terminal receipt；恢复前存 recovery point；读/写/验证/rollback 不同阶段 | 网络关闭无 completion receipt 明示未知；Cancel 请求后等真实回滚；恢复点再恢复也先保存当前状态 | 接通／保留 | backup-sync-center:145–304、695–755；templates archive |
| B05 | Device sync → LAN Sync：device/server、scope、preview/conflict、connect/sync、progress/cancel/recovery | provider registry → lan-sync 的连接/清单/选择与冲突流程 | 本轮只静态索引与入口复核，**完整 LAN 配对/双端传输/恢复 UNKNOWN/NOT_RUN**；不是已提供公网云同步 | 部分证据／保留有效 LAN 能力 | backup-sync-center:1047；`public/scripts/lan-sync.js`；backup-sync/providers |
| B06 | Cloud sync provider 列表／说明 | provider registry 的 cloud 项为占位/未配置可用链 | 不画成已连接或可备份的云服务；真新增 provider 是产品提案 | 设计/占位／重组说明 | backup-sync/providers.js；backupSyncCenter.html cloud |
| B07 | LAN pairing：peer label、数据 categories、Generate/Copy/New link、Accept link/base URL/peer ID/label/categories、basic auth username/password、Accept | `/api/sync/v1/categories/availability/pair/start/pair/accept`；链接填充表单，用户确认 scope 与连接 | 配对失败/需要认证/冲突是独立状态；clipboard 失败给手动复制；配对不是共享故事邀请；实际双端 NOT_RUN | 接通/静态／保留 | lan-sync:52–140、523–624、638–780 |
| B08 | LAN peer list：Sync now、Undo last sync、Forget、Clear stored credentials；每文件 ours/theirs resolution、Apply/Cancel | peer endpoints；Undo 明示只回退 THIS device；Forget 删除本机 registry/shadow repo，不影响另一端；credentials 只在已存在时可清 | sync conflict 没解决不显示完成；取消 resolution 不等于回滚已完成 sync；实际传输/恢复 NOT_RUN | 接通/静态／保留有效原生数据同步；旧 ST 数据类别清退 | lan-sync:227–377、430–505、625–630 |

## Storage Center：新 main 已合并的真实功能

| ID | 页面／控件 | 行为和数据来源 | 权限／失败／恢复 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| C01 | Scope：Server account/Current browser按钮组；Overview/Cleanup/Backups & recycle bin/Operation history/Advanced；Refresh/Close | 新main的Resource Center外层dialog/section navigation；server resource-center与BrowserProvider分开；只换表现不换authority | 状态/measure失败不给假0；scope变化清selection/safeSelection；关闭停止browser job，server job用持久任务管理 | 接通／保留 | [STORAGE](source-map.md#storage) storage-management:10–156 |
| C02 | 分类卡：Sessions & saves、Works & projects、Worlds & knowledge、Media & attachments、Personal identities、Agent material、Settings/integrations、Recovery/cache、offline/preferences | 原 catalog 的 bytes/count/status/target；受保护条目跳业务 editor | “Advanced/legacy/unidentified”不等于可安全删除；Native recovery roots/reference closure 有所有者 | 接通／保留 | storage-management:overview/list；resource-catalog |
| C03 | list search/sort/paging、select managed targets/all/clear、名称或Details、Open business workspace、Account backup/export | 50项分页、selection map与多选操作栏；只选有managed target的条目；输入保留IME composition | 不能把raw文件夹整树当Native resource；reference/running/recovery/identity blockers在drawer检查；late detail不覆盖另一scope | 接通／保留 | storage-management:229–319 |
| C04 | Preview recycle move/permanent deletion、safe cleanup选择/preview、review task、Execute/Cancel | server trash；browser purge；clean只对verified且用户选中的suggestions；preview绑定固定对象证据 | stale/repreview重新审；拒绝受引用/运行/保留依赖；过期preview结果自动stop；永久删除/clean另需C10确认 | 接通／保留 | storage-management:320–354、389–480；browser-resource-center |
| C05 | 回收站View & restore/details、restore original identity、purge、interrupted recovery repair、Review local Git publication | drawer审查原identity和完整依赖，原服务检integrity/occupancy/closure | identity冲突不覆盖；exact依赖缺失先修；local Git review不运行模型、不等于自动push | 接通／保留 | storage-management:355–388；src/native recovery-service/project-history-publication |
| C06 | Operation history/View operation、固定对象/处理量/预估释放统计、progress、Stop after current object、Review remaining again、Refresh | server task/receipt与browser任务；固定审查后不扩大对象；处理数据量不等于实际释放空间，完成后重测 | **已完成对象保持有效，非整批rollback**；partial/interrupted/paused-review/blocked/unknown分开；browser任务须保持页面 | 接通／保留 | storage-management:410–525 |
| C07 | Advanced inspector：breadcrumb、drill、Refresh/Retry、View/Edit/Create/Delete raw record | RestProvider/BrowserProvider + mutator；local/session storage、IDB、CacheStorage、quota | 原生受保护数据不能旁路 business writer；能力缺失、quota、private mode 有区别；Raw 不是给所有用户的默认编辑器 | 接通/条件／重组入口 | storage-inspector:1–633；browser-storage-inspector:1–867 |
| C08 | 资源变化后的业务 UI 刷新/失效 | storage-change-events → product/session/runtime/search 等 consumer | 删除/恢复不能让旧页继续编辑已删除实体；失效事件不是 Source/Grant 完整授权复验的替代 | 接通/部分／保留 | native/storage-change-events；product-client；session-runtime；workspace-host |
| C09 | Resource detail/recovery drawer：Close、Escape、header拖动关闭、移动端纵向Sheet、键盘Tab边界、focus return | `StorageCenterDrawer`只负责表现；detail请求有generation/scope守卫；键盘或reduce-motion走即时反馈 | pointercancel、resize、减动切换与重复开闭有收束；后台refresh在drawer/输入中延期，不销毁IME；真机触控未测 | 接通／保留交互与替代操作，造型不冻结 | storage-center-drawer:1–159；storage-management:128–148、281–319 |
| C10 | 永久删除/clean的二次确认：不可恢复说明、已审列表复选、Permanently delete/Back to preview | confirmPermanent默认negative，显式checkbox并检查仍是同一active task才执行 | 未勾不提交；返回preview保留审查；不扩大scope，不把trash与不可逆清理画成同义按钮 | 接通／保留 | storage-management:462–480 |

## Diagnostics 与公告

| ID | 页面／控件 | 行为、数据、权限 | 状态／恢复与处置 | 源码 |
| --- | --- | --- | --- | --- |
| D01 | Global Diagnostics：Guided、Startup、Expert、My problem just happened、Refresh | logging workspace；incident/create-from-recent 使用最近安全证据、actions、correlation；不是自动上传全部私人内容 | 接通／保留；空/读取失败/部分证据区分 | [DIAGNOSTICS](source-map.md#diagnostics) logging/workspace:109–201、339 起 |
| D02 | Guided：module health、incident list/detail、mobile Back、Copy summary/full context | 原 incident export，所有权/阶段/相关 ID 和日志；clipboard 失败需明确 | 接通／保留；full 不是泄露 Secret/私有上下文的授权 | logging/workspace:202–292、397–410 |
| D03 | Startup analysis：启动报告、模块证据、诊断/重试入口 | 延迟加载 startup analysis module；实际启动证据不是静态健康绿灯 | 接通/条件／保留；没有报告就明示未捕获 | logging/workspace loadStartupAnalysisModule/mount |
| D04 | Expert：frontend/backend、module、level、search、auto refresh、clear current source、raw detail/virtual list | accounts disabled 或 admin 才能看 server logs；clear 再确认、仅清 capture logs，incident 保留 | 接通／保留；不凭 UI hidden 取代 server 权限；virtualized 不等于已测长列表性能 | logging/workspace:293–321、539–632；workspace-host:canViewServerLogs |
| D05 | Announcement：critical modal、warning banner、info badge/inbox、row expand、mark read/dismiss | server 公告 + per-account read state，动态 DOM/委托事件 | 接通／保留；不能把公告优先级当系统权限；fetch 失败可诊断 | announcements:120–342 |

本表中的主题迁移、旧聊天备份、raw storage 等“现状存在”与“正式重构保留”分别记录。原生数据恢复、用户自定义、账户隔离与诊断价值必须保留；旧 ST 数据/接口/Workspace 的兼容层不进入新的实现目标。
