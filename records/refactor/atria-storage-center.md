# Atria 资源占用与安全清理中心 — Record

- Task ID: `atria-storage-center`
- Primary Workspace: `main` 产品源码；本次文档保存在 `docs`。
- Status: Active；已开始隔离实施，尚未完成产品验收或集成。
- Plan: [唯一入口](../../plans/refactor/atria-storage-center/index.md)。
- 当前阶段: Stage 2 — 统计与配额（Stage 1 基础契约已建立）。

## Summary

完成当前存储管理的相关调用链审计，并经过多轮讨论冻结资源占用与安全清理中心方案。本对话只形成 Plan 与审计记录，没有修改产品源码、产品测试或用户数据，也没有创建产品工作分支。

后续实施继续更新本 Record；不以规划完成声称产品重构完成。设计规则以 Plan 模块为准，本文件只保留实际事实、验证与限制。

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
| 界面失效链需要补齐 | 当前通用写入/删除/恢复主要刷新 inspector，未形成完整业务状态同步；旧状态回写风险需在实施中验证和修复 |

### 隔离夹具复现

只使用新建的临时目录，结束后清理，没有读取或操作真实业务数据。

- 五份合成文件：旧聊天 11 B、Native resource 101 B、项目 211 B、Native blob 307 B、旧角色图片 7 B。
- 真实目录合计 637 B；现有 inspector 返回 325 B，差额 312 B 为原生资源和项目文件。
- 同一合成角色文件使用 `character-card` kind 得到不可删除，省略 kind 则得到可删除。
- 主设置分组构造的路径可以解析到合成 `projects` 目录并返回可删除能力。只检查解析结果，没有执行该删除。

上述结果证明基线问题；不代表截图中的 35.4 MiB 已经被本轮重新测量，也不能据此推断真实数据已经损坏。

### 实际产品测试结果

本次代码审计期间执行，文档写入阶段未重新运行这些产品测试。

| 测试族 | 结果 |
| --- | --- |
| `tests/storage-inspector/*` 与 `tests/storage-management/service.test.js` | 8 套，88 条通过 |
| Native foundation / references / GC / round-trip | 分别 2 / 6 / 4 / 1 条通过 |
| storage health / session maintenance / FS commit-last | 分别 3 / 14 / 3 条通过 |
| 上述额外 Native 与 health 合计 | 7 套，33 条通过 |
| 总计通过 | 15 套，121 条 |
| `tests/storage/endpoints/native-backup-roundtrip.test.js` | 1 套，8 条失败；全部在备份前样本构造阶段 |

备份样本错误位于 `native-backup-roundtrip.test.js:54`：通过字段名截尾推导 ID kind，将 `scopeId` 推成不存在的 `scope`；当前 `contracts.js:1067` 要求 hash。失败发生在备份断言之前，不能声称该测试证明当前全部 Native kind 的备份闭包正确。本轮保持只读，没有修复样本。

测试启动曾遇到两项环境问题，已完成诊断并继续验证：

- 当前产品辅助工作树缺少 tests 自身 Jest 入口，改用现有本地测试运行时，无安装或产品文件变更。
- 初次混跑出现 `Export '__signal_exit_emitter__' is not defined in module`，Native 测试改用独立 Jest 进程和正确模块搜索路径后得到上述最终结果。

FS/SQLite 相关上述检查实际运行；MySQL/Postgres 在这次审计测试中显式禁用，未取得验证证据。未运行真实浏览器验收，未对重构后的实现进行验证，因为产品尚未实施。

### 设计交付

完整 Plan Bundle 保存目标与冻结边界、阶段阅读路由、服务权威、分类计量与配额、回收站恢复、页面及批量流程，以及 A01–A30 验收场景。

方案区分已确认产品规则与待依据实际源码落定的工程接口、计量算法和索引选择；不把建议类名或路由当作已经存在的能力。

### 文档交付检查

- 9 份任务文档与相关索引共 41 个相对文件链接检查通过；无缺失目标、机器绝对路径、替换字符或缺失末尾换行。
- A01–A30 验收标识连续且唯一；Native kinds 对照真实注册表为 44 项，唯一映射 44 项，无遗漏或重复。
- 交叉审阅补清项目直接所有权与独立 Agent 资料的边界，以及账户快照中旧管理任务先暂停核对的语义。
- Git whitespace 检查发现生成文档中的 CRLF 问题，统一本任务文档为 LF 后，限定任务路径的 staged diff 检查通过。
- 首次交付检查时产品 `main` 工作树无差异、HEAD 与审计基线一致；最终复核时工作树仍无差异，但其他并行任务已将 `main` 推进至本节列出的新 HEAD。本任务没有产品变更，正式实施需核对同期变化。
- 本任务文档提交范围仅含六个 Plan 模块、一份 Record 和两条索引入口，未包含其他活跃任务的未提交修改；远端 `docs` 的并行提交通过同分支正常合并保留，未改写历史。
- 本次交付只执行文档相关检查，没有重复产品测试。实际文档提交与远端存储状态以 Git 为准。

### 下一 checkpoint

新对话正式实施从 Plan Stage 1 开始：先核对真实 Git、占用中的任务分支及当前源码，再按入口路由读取相关模块，建立合适的语义工作分支，继续在本 Record 保存实际实施证据。

## Stage 1 — 基础契约与完整盘点

- Date: 2026-10-15。
- Start HEAD: `60aca695726893e298b7d485f300c6efef3b79fd`，实际干净 `main`；未回退审计后合入的边缘导航等变更。
- 工作分支：`refactor/atria-storage-center`；隔离任务工作树。既有任务工作树与 docs 中其他任务未跟踪资料保留。
- 新增 `src/storage/resource-catalog.js`：九类、未知数据兜底、全部 44 Native kinds 映射、versioned resourceType 分类、统一规范 UTF-8 JSON 内容字节、稳定身份/指纹、30 天保留期和默认拒绝的能力契约。
- 计量选择：结构化内容使用既有 Native canonical serializer；不计 Engine envelope、数据库页、索引、WAL。真实文件按文件字节计量，独立备份副本仍计量。
- 实际检查：`tests/storage-management/catalog.test.js`，1 suite / 4 tests 通过；核对当前完整 kind 注册表、Unicode 和键顺序计量、未知类型及归属兜底、scope 不冒充所有权。
- 当前源码确认 FS Engine 已有账户串行事务及 `FsNativeJournal`，将复用其提交/恢复权威；管理持久状态拟复用既有 maintenance 资源和 Engine 事务，不增加业务内容库。

### 实际接入盘点与后续验证范围

| 写入/读取来源 | 现有权威 | 实施接入与检查方向 |
| --- | --- | --- |
| 全部 Native/版本化内容、消息、状态、后台结果 | Engine transaction + repositories/common | 同一规范内容计量；提交时净增量与并发配额检查 |
| 项目源码、清单、隐藏文件及 Git | ProjectStore、Studio service | 全目录计量及闭包；普通 listFiles 跳过 Git，不能用于完整恢复 |
| 素材本体、引用与 GC | AssetStore | 哈希唯一计量、写入净增量、持久回收保留根与租约 |
| SQL legacy、文件 legacy/unknown | Engine legacy handlers、用户目录 | 避免 FS/SQL 双计，数据库物理文件单列；已测未知仍参与对账 |
| 删除与恢复 | Session/Persona/Library/Project 业务服务、ResourceGraph | 使用真实身份、版本、运行与引用检查；补齐完整原 ID 恢复 |
| 备份、迁移、导入 | users、storage/migration | 管理状态及保留闭包随既有引擎/用户目录迁移；历史操作暂停核对 |
| 浏览器记录 | browser-storage-inspector provider/mutator | 完整遍历、估算维度分离、inline key/新增冲突及读取失败 |

## Stage 2 — 统计与配额

- Status: In progress；基础契约测试通过不表示后续生命周期与界面已交付。
- 契约产品提交：`ad8941577`。其后实现仍在本任务分支持续开发，未集成 main。
- 增加 SQL 账户内容只读枚举，覆盖全部 Native 行、未知 kind 与 legacy 表；FS 覆盖 Native、完整项目 Git、Blob、备份及未知文件。数据库/WAL 独立计物理量；失败范围保持 partial/null。
- Engine 写入准入和统计复用 canonical UTF-8 内容量；账户串行提交、替换净增量、失败回滚及超额后减少占用已取得针对性证据。素材与项目文件已接入文件增量门禁；所有写入口及完整流程仍在补齐，不能据此宣布 A06/A07 全部完成。
- 实际验证：accounting 测试在 FS/SQLite/Postgres 上 9 条通过；覆盖全部 44 kinds、项目 Git、共享本体单计、备份/unknown 对账、并发配额竞争、等量替换、失败后原值与读取失败表达。
- Docker daemon 初始不可用，启动本地 Docker Desktop 后已建立本任务独立 Postgres 容器；Postgres 真实测试已执行。MySQL 镜像仍在拉取，尚无本轮 MySQL 通过证据。
- 修复先前备份样本的真实 key 类型（hash/token/ID），继续定位实际产品缺口：FS transient source 只重绑定顶层 Native 文件，漏掉 session 子目录；migration verify 使用跨 VM prototype 比较而非持久 JSON 内容。已修复为递归身份检查/重绑定和 canonical 内容比较。
- 实际验证：`native-backup-roundtrip.test.js` 8 条全部通过，覆盖 FS→FS、FS→SQLite、SQLite→FS、SQLite→SQLite、缺失 Blob 保留原对象、assets-only 保护 Native 闭包。与 accounting 同进程实际合计 17 条通过。

## Stage 3 — 生命周期与执行基础

- Status: In progress；尚未完成全部种类、运行保护、失败注入与批量验收。
- 原生恢复记录复用 maintenance kind / Engine 事务；Native closure 转换复用 FsNativeJournal/SQL 提交。新增 GC 持久保留根、恢复依赖保护和被回收身份的写入门禁。
- 项目文件采用 preparing/retained/restoring/purging 持久状态及目录移动；完整 Git 和文件哈希随闭包验证。未完成文件状态支持协调修复，保留 Blob 责任不会由 UI 内存决定。
- 实际验证：recovery 测试在 FS/SQLite/Postgres 上 9 条通过；真实 SessionCore 会话及手动存档原 ID 往返、作品依赖保留、重复恢复回执、配额拒绝保留原件、损坏恢复源拒绝、完整项目源码/Git 往返、独立 Agent evidence 不随项目删除、旧文件写入拒绝。
- 高级工具修复正在同步实施；现有 service 测试 6 条通过。主设置路径白名单、真实角色身份保护、链接边界与旧文件恢复冲突保护已有实现，额外攻击/失败路径仍须补验。

### 实施 checkpoint — `dfd8cea85`

- 持久化当前统计、回收协议、批量任务及面板实现；这不是整体完成或 main 集成标记。
- 四后端已有真实本地验证。后续 accounting 增加高精度内容用例，共 16 条通过；recovery 已扩展至 24 条通过；center 批量状态 12 条通过；catalog 4 条通过。结果按各实际执行时点保存，不将之后所有代码变动自动标为已覆盖。
- recovery 新证据包括恢复记录提交失败时原件不丢、Blob 保留根防止既有 GC 误回收、备份文件移动后中断可从 preparing 修复；项目用例已换为真实 Git 两个提交，并在四后端验证配额拒绝不改变 HEAD、足额后提交及回收恢复完整历史。
- 项目 Git 配额实现经过两项实际修复：异步返回前 finally 提前清理 staging；Windows 对只读句柄 fsync 返回 EPERM。已分别改为等待提交完成后清理，以及复用 durable-file 写入刷新 staged 文件。受影响四后端项目用例复测通过。
- 新增本地启动/周期管理协调；查看统计保持只读。导入的历史任务与未完成文件操作标为 paused-review，不能自动重放旧执行意图。
- 原生业务默认会话、作品、世界知识、Persona 与项目删除入口正在接入同一回收权威；补充账户范围跨标签失效广播及原生 Session 投影丢弃入口，避免通过关闭动作回写旧状态。

### 扩展验证发现与修复

- 扩展 Native 基线验证首次结果：45 条中 42 通过、3 失败。保留该失败事实，不将其视为阶段结束。
- MySQL GC 间歇失败追溯到 MySQL binary JSON 的高精度 double 输出改变。隔离探针 10,000 个时间数字样本中 912 个变化（例如 `1792037000000.0015` → `1792037000000.0017`），足以破坏 canonical 完整性与时间戳匹配。
- 增加 MySQL schema v3 迁移，将资源 JSON 内容列保存为 LONGTEXT；既有 JSON 函数和 chat generated integrity 继续工作。修复不声称能够重建旧数据库中已经丢失的数字精度。
- 相关复测：Native foundation 四后端 4 条通过；MySQL schema bootstrap/幂等/generated integrity 6 条通过；高精度 accounting 四后端通过。后续仍需覆盖 schema 升级和备份迁移的相关路径。
- Persona 两项失败属于失效的故障注入：直接给 FsNativeJournal 的 Proxy 赋方法不会拦截其原生提交方法。改为调用边界 Proxy 注入后，真正触发预期失败；Persona storage 4 条通过，没有删除失败断言或放松恢复要求。
- scoped ESLint 使用任务工作树中的本地 Atria plugin。共享 node_modules junction 中的 plugin 原本将 allowlist 解析至另一工作树，出现两项虚假路径告警；改用 ESLint plugins 注入当前本地规则后按原规则通过。未扩充 allowlist。

## Stage 4 — 面板与业务同步

- Status: In progress；五区独立宽面板、服务器九类与浏览器设备范围、分类搜索/排序/分页、固定预览/任务/恢复已接入真实接口。继续完善全种类及失败路径验收。
- 浏览器修复完整 IndexedDB 遍历、inline key 变更拒绝、同名新增拒绝、读取失败表达、缓存请求完整身份和事务提交检查；origin estimate 不与分项相加。
- 实际 Playwright：`tests/e2e/storage-center/center.e2e.js` 3 条通过，隔离临时账户数据、真实服务器与 Chromium。世界资源移入回收站并恢复同 ID 到业务读取接口、250 条 IndexedDB 与主键/新增保护、浏览器固定删除、390px 移动导航/键盘/错误反馈均实际执行。
- 已实际查看桌面总览与移动截图；发现并修复移动关闭按钮文本截断，统一二进制单位为 B/KiB/MiB/GiB。后续界面改动仍需相关复测；截图是临时验证产物，不提交。

## Stage 5 — 功能闭环与交付

- Status: In progress；尚未宣布 A01–A30 全部完成，未合并 main、未推送或清理工作分支。

### 配额与领域闭环 checkpoint — `49660e97b`

- 已将当时实际 `main` 的主题/设置工作区提交 `5eb3bc765` 正常合入任务分支，保留全部同期变更。尚未反向集成 `main`。
- 文件最终发布接入附件、图片、头像、背景、旧角色 PNG/sidecar、设置备份；账户配额继续以 canonical 内容与真实文件字节为依据，不用请求长度判断。
- Native 配额改为 FsNativeJournal / SQL 提交前校验完整事务净增长；新增写入在前、删除在后的等量事务检查。MySQL/Postgres 账户锁跨 Engine 实例串行准入，租用同一连接，单连接池不死锁。
- 实际 accounting 28 条报告通过，其中 FS/SQLite 的独立共享数据库场景为不适用提前返回；真实跨 Engine 并发证据为 MySQL/Postgres 两项。其余涵盖四后端完整盘点、净增长、并发、精度、文件发布与路径读取失败。
- Runtime profile 删除复用 NativeModelPromptPersistence，版本化 Library 删除复用 VersionedJsonResourceHandler，扩展复用 ExtensionsStore。默认业务入口接入同一回收流程。恢复的扩展保持禁用；原有 Prompt preset 所属资源继续受领域保护。
- 新测试发现 MySQL/Postgres Native reader 丢弃 null tombstone 的版本元数据，已修复为保留记录元数据；铁人状态只读查询的等值终结记录写回允许通过门禁，不能借此改回活动状态。
- 针对 Runtime、扩展和铁人模式新增 12 项四后端测试通过；同 ID 占用与恢复提交失败四后端检查在先前执行中通过。铁人场景仅本地领域操作，未调用模型。
- 真实回收站记录、独占保留 Blob、已回收备份文件与 running 管理任务已加入现有 Native backup 往返样本。FS→FS、FS→SQLite、SQLite→FS、SQLite→SQLite 与两组保护场景合计 8 项通过。修复备份转换遗漏 `native/recovery` 文件树，以及只校验活跃 Blob、漏校验回收保留 Blob 的缺口。导入任务实际为 paused-review。
- 修复 SQL 测试夹具将所有文件目录置于账户根同级的问题，统一到真实 USER_DIRECTORY_TEMPLATE；路径保护不为适配夹具而放松。
- 高级工具仍可查看主设置，但禁止泛型编辑/删除；相关 service 8 项通过。当前任务 68 个 JS 文件使用本地规则进行 scoped ESLint，0 errors；新代码后续仍需相关复测。
- 当前尚有面板业务导航/导出、补充安全候选与恢复暂停验证、迁移升级和集成浏览器检查，不能据此宣布全部验收完成。

## Final state

产品任务尚未完成。最终实现、适用验收、集成及同步状态由正式实施阶段依据实际结果填写。
