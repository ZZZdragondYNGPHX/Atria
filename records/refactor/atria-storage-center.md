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

## Final state

产品任务尚未完成。最终实现、适用验收、集成及同步状态由正式实施阶段依据实际结果填写。
