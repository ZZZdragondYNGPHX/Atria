# Atria 资源占用与安全清理中心 — Record

- Task ID: `atria-storage-center`
- Primary Workspace: `main` 产品源码；本次文档保存在 `docs`。
- Status: Active；
- Plan: [唯一入口](../../plans/refactor/atria-storage-center/index.md)。
- 当前阶段: Stage 2 — 统计与配额（Stage 1 基础契约已建立）。

## Summary

完成当前存储管理的相关调用链审计，并经过多轮讨论冻结资源占用与安全清理中心方案。本对话只形成 Plan 与审计记录，没有修改产品源码、产品测试或用户数据，也没有创建产品工作分支。

后续实施继续更新本 Record；不以规划完成声称产品重构完成。

## Stage 0 — 代码审计与方案交付

- Date: 2026-10-15。
- Start / Audited product HEAD: `2686aa40a00c8bfccdc47c55d2b236b4878b022a`（`main`）。
- 本任务产品提交: 无；未修改产品文件。
- 最终交付现场的产品 `main` HEAD: `60aca695726893e298b7d485f300c6efef3b79fd`，由其他并行任务推进；本 Record 的审计与产品测试依据仍为上述 Audited HEAD，不将新 HEAD 标成已审计或已测试。
- 文档写入前 HEAD: `559ddbb8a60ff2da9cc91587a9a014c5673f14b3`（`docs`）。
- Status: Complete（本阶段代码审计与方案交付）；产品实施未开始。

### 审计范围

- 前端入口、模板、REST provider/mutator、浏览器 provider/mutator、统计显示、选择和恢复点 UI。
- `storage/inspector`、通用管理服务、用户接口、配额中间件、四种 Engine 与 Native repositories。
- 原生会话、存档、项目、Persona、世界知识、Agent、Runtime、Visual 资源、共享 Blob、引用及 GC。
- 账户备份、精确依赖闭包、导入与恢复、引擎迁移及相关测试资产。

### 关键事实

源码位置均相对上述产品基线。

| 发现 | 证据与含义 |
| --- | --- |
| 旧分类仍决定管理内容 | `public/scripts/user.js` → `storage-management.js` → `storage-inspector.js`；服务端 `src/storage/inspector.js:28` 固定十类旧目录 |
| 原生目录漏统计 | `inspector.js:302`、`:377` 只累加显式 includes；`atria-native/` 与 `projects/` 未纳入，Native blob 随 `assets/` 进入“其他” |
| 数据库口径不足 | SQLite 文件及 WAL 整体进入“其他”；MySQL/Postgres 的结构化内容无法通过用户目录扫描统计 |
| 配额仍按旧写入口 | `src/users.js:40` 前缀缺少 Native 与管理写入；`:1156` 用用户目录大小加请求 Content-Length，不等于统一资源数据量 |
| 通用解析权限边界不足 | `src/storage/management.js:114` 的部分路径映射过宽，`:184` 的身份保护部分依赖调用者提供的 kind |
| 原生权威已经存在 | `src/storage/index.js` 组装原生 repositories；Session、Persona、ResourceGraph、AssetStore 已有事务、引用、运行和 GC 保护 |
| 原生角色不等于旧角色卡 | Actor 属于作品/项目；Persona 是独立身份；记忆与任务结果主要归会话状态，MCP 短期内存 artifact 不等于持久任务结果 |
| 恢复能力不能混称 | 文件恢复点仅复制原路径；会话导入依赖精确作品且保留 ID；Bundle 导入可能重写 ID；项目发布包不含完整 `.git`；Ironman 终结不可回滚 |
| 浏览器存在已确认缺口 | 聚合估算与分项混算、IndexedDB 前 200 条截断、inline key 编辑可能新增、同名新增覆盖、读取失败呈现为空、创建错误反馈不足 |
| 界面失效链需要补齐 | 当前通用写入/删除/恢复主要刷新 inspector，未形成完整业务状态同步；|

### 隔离夹具复现

只使用新建的临时目录，结束后清理，没有读取或操作真实业务数据。

- 五份合成文件：旧聊天 11 B、Native resource 101 B、项目 211 B、Native blob 307 B、旧角色图片 7 B。
- 真实目录合计 637 B；现有 inspector 返回 325 B，差额 312 B 为原生资源和项目文件。
- 同一合成角色文件使用 `character-card` kind 得到不可删除，省略 kind 则得到可删除。
- 主设置分组构造的路径可以解析到合成 `projects` 目录并返回可删除能力。

上述结果证明基线问题；不代表截图中的 35.4 MiB 已经被本轮重新测量，也不能据此推断真实数据已经损坏。

### 设计交付

方案区分已确认产品规则与待依据实际源码落定的工程接口、计量算法和索引选择；不把建议类名或路由当作已经存在的能力。

## Stage 1 — 基础契约与完整盘点

- Date: 2026-10-15。
- Start HEAD: `60aca695726893e298b7d485f300c6efef3b79fd`，实际干净 `main`；未回退审计后合入的边缘导航等变更。
- 工作分支：`refactor/atria-storage-center`；隔离任务工作树。既有任务工作树与 docs 中其他任务未跟踪资料保留。
- 新增 `src/storage/resource-catalog.js`：九类、未知数据兜底、全部 44 Native kinds 映射、versioned resourceType 分类、统一规范 UTF-8 JSON 内容字节、稳定身份/指纹、30 天保留期和默认拒绝的能力契约。
- 计量选择：结构化内容使用既有 Native canonical serializer；不计 Engine envelope、数据库页、索引、WAL。真实文件按文件字节计量，独立备份副本仍计量。
- 当前源码确认 FS Engine 已有账户串行事务及 `FsNativeJournal`，将复用其提交/恢复权威；管理持久状态拟复用既有 maintenance 资源和 Engine 事务，不增加业务内容库。

## Stage 2 — 统计与配额

- Status: Completed；以下保存实施时点，最终证据与交付状态见 Final state。
- 契约产品提交：`ad8941577`。其后实现仍在本任务分支持续开发，未集成 main。
- 增加 SQL 账户内容只读枚举，覆盖全部 Native 行、未知 kind 与 legacy 表；FS 覆盖 Native、完整项目 Git、Blob、备份及未知文件。数据库/WAL 独立计物理量；失败范围保持 partial/null。
- Engine 写入准入和统计复用 canonical UTF-8 内容量；账户串行提交、替换净增量、失败回滚及超额后减少占用已取得针对性证据。素材与项目文件已接入文件增量门禁；所有写入口及完整流程仍在补齐，不能据此宣布 A06/A07 全部完成。
- 覆盖全部 44 kinds、项目 Git、共享本体单计、备份/unknown 对账、并发配额竞争、等量替换、失败后原值与读取失败表达。
- Docker daemon 初始不可用，启动本地 Docker Desktop 后已建立本任务独立 Postgres 容器；Postgres 真实测试已执行。MySQL 镜像仍在拉取，尚无本轮 MySQL 通过证据。
- 与 accounting 同进程实际合计 17 条通过。

## Stage 3 — 生命周期与执行基础

- Status: Completed；以下保存实施时点，最终证据与交付状态见 Final state。
- 原生恢复记录复用 maintenance kind / Engine 事务；Native closure 转换复用 FsNativeJournal/SQL 提交。新增 GC 持久保留根、恢复依赖保护和被回收身份的写入门禁。
- 项目文件采用 preparing/retained/restoring/purging 持久状态及目录移动；未完成文件状态支持协调修复，保留 Blob 责任不会由 UI 内存决定。
- 真实 SessionCore 会话及手动存档原 ID 往返、作品依赖保留、重复恢复回执、配额拒绝保留原件、损坏恢复源拒绝、完整项目源码/Git 往返、独立 Agent evidence 不随项目删除、旧文件写入拒绝。
- 高级工具修复正在同步实施；现有 service 测试 6 条通过。主设置路径白名单、真实角色身份保护、链接边界与旧文件恢复冲突保护已有实现，额外攻击/失败路径仍须补验。

### 实施 checkpoint — `dfd8cea85`

- 持久化当前统计、回收协议、批量任务及面板实现；这不是整体完成或 main 集成标记。
- 后续 accounting 增加高精度内容用例，共 16 条通过；recovery 已扩展至 24 条通过；center 批量状态 12 条通过；catalog 4 条通过。结果按各实际执行时点保存，不将之后所有代码变动自动标为已覆盖。
- recovery 新证据包括恢复记录提交失败时原件不丢、Blob 保留根防止既有 GC 误回收、备份文件移动后中断可从 preparing 修复；
- 项目 Git 配额实现经过两项实际修复：异步返回前 finally 提前清理 staging；Windows 对只读句柄 fsync 返回 EPERM。已分别改为等待提交完成后清理，以及复用 durable-file 写入刷新 staged 文件。受影响四后端项目用例复测通过。
- 新增本地启动/周期管理协调；查看统计保持只读。导入的历史任务与未完成文件操作标为 paused-review，不能自动重放旧执行意图。
- 原生业务默认会话、作品、世界知识、Persona 与项目删除入口正在接入同一回收权威；补充账户范围跨标签失效广播及原生 Session 投影丢弃入口，避免通过关闭动作回写旧状态。

## Stage 4 — 面板与业务同步

- Status: Completed；五区独立宽面板、服务器九类与浏览器设备范围、分类搜索/排序/分页、固定预览/任务/恢复已接入真实接口；最终证据见 Final state。
- origin estimate 不与分项相加。
- 实际 Playwright：`tests/e2e/storage-center/center.e2e.js` 3 条通过，隔离临时账户数据、真实服务器与 Chromium。世界资源移入回收站并恢复同 ID 到业务读取接口、250 条 IndexedDB 与主键/新增保护、浏览器固定删除、390px 移动导航/键盘/错误反馈均实际执行。
- 已实际查看桌面总览与移动截图；发现并修复移动关闭按钮文本截断，统一二进制单位为 B/KiB/MiB/GiB。后续界面改动仍需相关复测；

## Stage 5 — 功能闭环与交付

- Status: Completed；

### 配额与领域闭环 checkpoint — `49660e97b`

- 已将当时实际 `main` 的主题/设置工作区提交 `5eb3bc765` 正常合入任务分支，保留全部同期变更。尚未反向集成 `main`。
- 文件最终发布接入附件、图片、头像、背景、旧角色 PNG/sidecar、设置备份；账户配额继续以 canonical 内容与真实文件字节为依据，不用请求长度判断。
- MySQL/Postgres 账户锁跨 Engine 实例串行准入，租用同一连接，单连接池不死锁。
- 实际 accounting 28 条报告通过，其中 FS/SQLite 的独立共享数据库场景为不适用提前返回；真实跨 Engine 并发证据为 MySQL/Postgres 两项。其余涵盖四后端完整盘点、净增长、并发、精度、文件发布与路径读取失败。
- Runtime profile 删除复用 NativeModelPromptPersistence，版本化 Library 删除复用 VersionedJsonResourceHandler，扩展复用 ExtensionsStore。默认业务入口接入同一回收流程。恢复的扩展保持禁用；原有 Prompt preset 所属资源继续受领域保护。
- 新测试发现 MySQL/Postgres Native reader 丢弃 null tombstone 的版本元数据，已修复为保留记录元数据；铁人状态只读查询的等值终结记录写回允许通过门禁，不能借此改回活动状态。
- 铁人场景仅本地领域操作，未调用模型。
- 真实回收站记录、独占保留 Blob、已回收备份文件与 running 管理任务已加入现有 Native backup 往返样本。FS→FS、FS→SQLite、SQLite→FS、SQLite→SQLite 与两组保护场景合计 8 项通过。导入任务实际为 paused-review。
- 修复 SQL 测试夹具将所有文件目录置于账户根同级的问题，统一到真实 USER_DIRECTORY_TEMPLATE；路径保护不为适配夹具而放松。
- 高级工具仍可查看主设置，但禁止泛型编辑/删除；相关 service 8 项通过。当前任务 68 个 JS 文件使用本地规则进行 scoped ESLint，0 errors；新代码后续仍需相关复测。

### 全写入口与恢复闭包 checkpoint — `aa1bcc976`

- 补齐 Engine 内嵌事务组合、素材及 Package 元数据/Blob 原子准入、legacy chat 与结构化文件的规范内容净增量；素材失败只清除本次新引入且无提交引用的 Blob。
- 默认 Repository 的非 HTTP 删除消费者也接入同一回收权威；领域原删除仅在受控恢复发布内部调用。
- 视觉数据按真实 `source.sessionId` 归属会话；运行中 Job 阻止删除，已完成记录纳入闭包。
- 旧账户快照不能覆盖当前铁人终结权威。共用效果暂停转换保留 resource key，恢复插件保持禁用，历史外部任务不重发。
- Git 发布中断保留持久净增长预留；
- 本轮合并执行 `storage-management`、`native/run-policy-p2`、`native-backup-roundtrip`、`mysql-schema`：8 suites / 228 passed / 2 skipped。两个跳过项仅为 FS/SQLite 不适用的共享数据库 advisory lock；MySQL/Postgres 实际通过单连接池、跨 Engine 并发准入。
- 上述结果包括 accounting 34、recovery 52、center 20、service 8、catalog 4、run policy 85、backup 18、MySQL schema 7。未调用外部模型；run policy 仅使用本地合成 HTTP fixture。
- 对照 main 复现后，测试更新为保留归档和终结不可复活，替换失效 Proxy 注入、已移除 API 与错误冷启动后端选择，85 项实际完整通过，未回退现有产品规则。
- 保留既有 force-click 和明确不适用 test.skip 的 3 个 warning。

## Final state

### 最终功能闭环 — `f37d38453` / `6d1d95411`

- 五区面板接入当前设置工作区、业务页面和既有账户备份导出；跨标签通知及可见时刷新保留当前查询、固定任务与未保存草稿。后台进度不强制把用户从其他分区切回结果页。
- 后来新增的匹配资源不进入旧任务。
- 真实浏览器停止流程发现 read/commit 之间的停止标记竞争；修复为同一事务合并 sticky stop 标记、停止请求原子更新当前记录，避免覆盖已完成项。FS/SQLite 的精确竞争注入及真实面板流程通过。
- 超额账户保留有界 1 MiB 清理/清空操作日志通道；仍实际计入资源数据量。新预览不能无限绕过配额，必要时只回收旧终结清理记录的展示历史，活跃/中断意图、恢复来源及回执不动；取消预览持久标为停止。
- 补齐 Risu/CharX/BYAF 附属素材、表情包、缩略图和图片元数据的最终文件门禁；替换先安全发布再移除不同扩展名旧件。四后端附属素材/元数据准入 4 项通过；后续 FS/SQLite accounting 18 项通过。
- Runtime 私有 checkpoint 使用其真实执行绑定归入会话或项目闭包；原 ID 恢复及账户导入保留证据但使 opaque continuation 失效，不重放历史模型请求。比较恢复前领域规范化结果，不比较未规范化输入。
- 浏览器扩展批次实际 14 项通过（运行记录 `.last-run.json` 为 passed）：中心 7、旧浏览器移动/取消 2、服务器高级工具 5。重复覆盖不累加为新的独立能力。
- 浏览器补验包括 Cache 容器成员新增后的固定清单冲突、250 条 IndexedDB 完整枚举、inline keyPath/同名创建拒绝、读取失败 partial、QuotaExceededError、停止边界、页面中断历史与无未处理 rejection；真实跨标签创建/删除同步通过。
- 新增 Persona/知识/Package 往返两项亦通过。另有 Runtime checkpoint 10 项、FS/SQLite backup 12 项、WorkspaceHost/设置/ResourceGraph 20 项实际通过。该记录不把不同执行时点拼成一次未执行的整轮结果。
- 最终 scoped ESLint：97 个相关 JS，0 errors / 5 warnings（测试中的首次引导条件、明确不适用 skip、既有 force-click）；

### 集成与交付

- 产品交付 HEAD：`73557f8098d2353f23777a35e25042e94742bec9`，在干净的真实 `main` 上正常合并 `refactor/atria-storage-center`；合并前 main 为 `5eb3bc765`，未回退主题/设置等同期内容。
- `main` 已正常推送，`HEAD == origin/main`，工作树干净。
- 任务分支及隔离源码工作树已移除；其余活跃工作树及 docs 的无关未跟踪资料保留。
- 系统临时目录下的本任务浏览器夹具清理被自动审批审查拒绝（返回仅为 `blocked by policy`），该命令未执行；不绕过审查，保留这些临时目录。Docker 临时容器的环境限制见上节。
- docs 的远端并行提交通过正常合并保留；本任务仅更新同一 Record 和 Plan 状态。未合并 docs 到 main，未改写历史，未创建交接文档。
- 未将最终四后端整轮复测或受阻的环境清理写成已完成。

### UI 方向复审与独立 HTML 草稿 — 2026-10-15

- 用户对现有布局和前端不满意，明确要求先交付 HTML 草稿，满意后再改正式前端。本轮只制作设计预览；原产品交付状态保留，未对正式前端做后续修改，也没有将草稿视为已获视觉批准。
- 产品 `main` 为 `73557f809`，原隔离任务工作树已移除。docs 在并行任务推进后当前基线为 `ab5461eb1`；保留无关未跟踪 `plans/feat/agent-experience-evolution/`、`plans/architecture/atria-frontend-audit/`，只写本任务预览和本 Record。
- 独立设计预览：[HTML 草稿](../../previews/atria-storage-center/index.html)、[设计与审查说明](../../previews/atria-storage-center/review.html)。内嵌原字体及 OFL 许可，无新增前端依赖；所有示例操作只改变当前页面内存，没有服务连接或真实资源写入。总览为视觉示例快照，不宣称在模拟操作后重新汇总真实数据；
- 按用户指定读取 frontend-design、emil-design-eng、microinteractions、find-animation-opportunities、animate、apple-design、motion、animation-performance、review-animations、web-design-guidelines 的 SKILL.md，以及适用参考。Motion MCP 当前未连接；未触发性能修复流程或声称 MotionScore。
- 视觉调整为紧凑五区导航、集中用量和安全清理摘要、九类对齐列表、资源详情抽屉、整页固定清单预览；手机为底部五区导航及底部抽屉。保留服务器与当前浏览器独立范围、未知不作零、30 天回收保留、原 ID 恢复、保护项跳过、停止保留完成项、重新预览剩余项等冻结语义。
- 补验初始回收示例恢复：通过本地 HTTP 打开草稿，恢复 `sessions-archived-3`，返回会话列表可见同一名称，详情仍显示该原 ID；通过。
- 原生 dialog 的 Shift+Tab 首控件边界补充显式焦点循环；手机取消桌面滚动条槽；刷新改为局部忙碌反馈，避免重建当前输入；拖动停住超过 80ms 后清除过期速度，避免松手误关闭，补验通过。自动化中一次 locator 命中隐藏 dialog 的提示，已限缩到 main；未将该定位失败归为产品错误。
- 完成后明确调用 review-animations 和 web-design-guidelines 审查，读取本轮最新 Web Interface Guidelines；问题、Before/After/Why、逐页动效机会及拒绝项、microinteractions 诊断与长期使用限制进入审查附页。动效审查结论 Approve 只针对草稿，不替代用户视觉批准。
- 320/390/768px 均为桌面 Chromium 模拟视口，指针拖动不等于手机实机触控；
- 当前交付组完成：向用户提供可交互 HTML 草稿，等待其明确确认视觉方向后才实施正式前端。无需交接文件，不回退已合入同期变更。

### 已确认 UI 实装 — 开始于 `73557f809`，2026-10-15

- 用户明确接受本版 HTML 草稿并授权实装。fetch 后两者相同且 main 干净。以该真实 main 创建 `refactor/storage-center-ui`，隔离源码位于 `tasks/storage-center-ui/source`；保留其余工作树及 docs 的两份无关未跟踪方案。
- 复用既有 StorageCenterPanel、BrowserResourceCenter、业务打开、账户导出、统计和任务 API；仅改呈现与交互。详情抽屉作为本面板的原生 dialog 呈现辅助，CSS/WAAPI 不引入新依赖或第二套存储权威。
- 当前已接入集中摘要、九类列表、资源批量选择、清理建议复选框、回收记录、整页预览、任务列表、永久删除最终确认和手机导航结构；沿用现有 tokens、图标和 Atria 控件。已补充中文文案。

#### Skill 审查与实现取舍

- 沿用草稿阶段已读取的全部指定 Skills 与必要参考。实装完成后明确调用 `review-animations` 与 `web-design-guidelines`，重新读取 [最新 Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。Motion 仍仅作为当前 API/方法指导，没有新增 Motion 依赖或宣称使用未连接的 MCP。
- `find-animation-opportunities` 的逐页结论落实为：总览数值与分类图、导航、筛选/排序和任务结果列表即时更新；资源选择栏仅首次出现时短距离进入；资源/恢复详情沿同一路径开合；任务刷新仅在实际等待时显示忙碌。拒绝计数动画、列表 stagger、无限骨架闪动、手势删除和自定义惯性滚动。
- `animate` / `apple-design` / `motion`：优先 CSS/WAAPI/原生 dialog；普通抽屉进入 220ms、退出 160ms；仅指针按压有微缩反馈，键盘路径即时。手势用单指捕获、8px 阈值、直接跟手、速度投影与临界阻尼；500ms 只作为带释放速度的手势收敛窗口。支持呈现值接管、回弹中断和取消；停止超过 80ms 后不沿用旧速度。减少动态效果及现有产品偏好会取消位移动画，保留状态文字和原生滚动。

| Before | After | Why |
| --- | --- | --- |
| `storage-center.css:60` 摘要按钮沿用共享固定高度，裁切文案 | 本面板按钮按内容撑开、摘要有足够最小高度；窄屏自动换行 | 复用控件同时保留完整信息，320/390/768px 补验通过。 |
| `storage-management.js:128` 刷新替换输入及完成后导航保留旧状态 | 原 search/IME 节点、选择和焦点保留，真实完成后更新当前分区 | 高频编辑不中断，后台进度不强制跳转。 |
| `storage-management.js:281` / `:372` 详情占用完整列表页面 | 同一详情/恢复权威以原生抽屉呈现，预览继续使用整页 | 提供清楚的空间层级和返回路径，焦点/Escape 补验通过。 |
| 回收来源读取失败可能显示 0 | 摘要显示不可用；部分统计不画完整占比 | 未知不作零，保留冻结核算语义。 |

- `review-animations`：无阻断项，结论 **Approve**。普通时长/曲线符合既有 tokens，手势物理收敛例外有明确理由；只动画 transform/opacity，没有装饰性功能数字运动；可中断和减少动态效果有实际浏览器证据。未观察到明确卡顿，因此没有触发 `animation-performance` 性能修复；未声称低端设备、GPU trace 或帧率达标。
- 未发现阻断项。面板沿用现有工作区内控制方式，不额外建立页面路由。无 axe 或完整 WCAG 认证声明。
- 风险确认与生命周期说明持续保留，未新增第二套偏好持久层。

#### UI 集成与清理

- main 合并前仍为干净 `73557f809`，fetch 后与 origin/main 一致。正常合并 `refactor/storage-center-ui` 得到 `695acf3bc`，无冲突；main 已正常推送，`HEAD == origin/main`，工作树干净。
- 只 unlink junction，确认共享 `D:/Dev/Atria/node_modules` 与 `D:/Dev/Atria/tests/node_modules` 仍存在。随后正常移除任务工作树及已合并短期分支；其余活跃工作树不动。没有产生新的 Docker、外部服务或后台测试遗留。
- docs 同时存在其他任务的三份已修改方案及两份未跟踪方案，本次只暂存和提交本任务 Record、Plan 入口和界面模块。草稿预览保留作为已确认设计证据，不混入产品主线；不创建交接文档。
- 产品当前使用真实服务；原删除、恢复、配额及兼容规则继续由既有权威负责。
