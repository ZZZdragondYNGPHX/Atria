# Atria MCP 当前主线适配

- Task ID：`plugin/atria-mcp-main-adaptation`
- Primary Workspace：`plugin`
- Plan：[index](../../plans/plugin/atria-mcp-main-adaptation/index.md)
- 状态：已完成。工具 0.4.0，必要产品接缝已集成 main；本机推荐验收与远端存储交付完成。

## Stage 1：当前合同与 V3 编排基础

- Start HEAD：`plugin@764d9c24f361beaf14fb2b59882497f403143749`、`main@c83f18bba110bacd528d13b1cd2bbda42b65236e`。
- Git 核对：产品 main 与 plugin 均干净；docs 的其他任务修改保持原状；产品改动使用 `feat/atria-mcp-main-adaptation` 独立工作树。
- 已实现（尚未交付）：替换退役 browser Orchestrator；Native V3 Plan / Binding / Run / Tool / RP 固定入口；独立 Host fence、原 command outcome 查询；formal commit 纯预检、等待原生 Review 的 A 续接；Journal 关联与等待时释放调度锁。
- 已有验证：规划期 38 个 JavaScript 文件直接语法检查通过；旧 `npm run check` 因缺失 `test/` 失败，实施期修复验证入口后重新检查。
- 尚未完成：实现、当前基线动态联调、客户端证据、交付与集成。

## Stage 2–4：领域实现进行中

- Runtime：移除退役 credential-target permit 依赖，增加原子 API Preset、draft preview、受限 authoring trial 的稳定 operation 观察与取消链、candidate discard、依赖与归档/删除映射。
- Session / Cognition：Chronicle 时态事实与两类 cursor；起始世界视角；认知目录与 disclosure/inspection；hypothetical；声明 App Command 目录/preflight。纯读使用原 observe 和新增 RunControl.observe，不调用会保存状态的 status。学习目标改接当前 plan-prompt / plan-strategy；补 Goal 和 advisory consumers。
- Storage：新增 Center 全工作流，preview 明确持久化，trash/restore/purge/clean/repair/history 精确分开；修正删除回执的恢复语义。Archive 增加与实际导入共享的目标可导入性检查及临时 staging cancel。
- Media / Skills / Extensions：作者 raw txt2img、作者画廊分页、exact authoring image / thumbnail Binary；移除 orch-preset；bundled/embed 固定包装及 scope/hash/CAS；扩展 settings 与 official illustration 配置。
- 针对验证：`npm run check` 已恢复正常；测试脚本移到忽略的本地测试目录后，当前 35 个交付 JavaScript 文件语法通过。当前 19 项本地针对测试通过，覆盖 V3 / retention、审批分页、丢失 dispatch ACK、Plan 学习约束和 Media Binary 边界。测试文件仅本地。
- 真实隔离产品 smoke 已运行并诊断失败：旧验证未等待 Shell 完成导致 epoch 竞争；Memory 父节点删除会级联删除子节点；原回执把被拒绝的删除列入 deleted。已调整本地验证时序及修复结果回执，后续验证推进至 Session Surface 在 reload 后短暂卸载的时序问题，完整 smoke 尚未通过。
- 尚无真人审批、付费 Provider 或其他设备证据；尚未声称当前真实 V3 Review、双 Backend 和各域闭环验收完成。
- 下一 checkpoint：完成固定包装与实际合同自查，建立当前基线隔离产品/本地 Provider 闭环，解决观察到的失败并重测；随后更新版本、Guide、示例、覆盖矩阵，完成产品集成与工具交付。

## Stage 5：隔离联调与集成准备

- 产品 28 个受影响 JavaScript 文件的语法、定向 ESLint 和 `git diff --check` 已通过。MCP 版本、Guide、示例同步为 0.4.0；Registry 当前 473 actions、18 顶层工具。目录数量不是能力通过率。
- FS 与 SQLite 各自使用新 dataRoot、真实 HTTP / Store / Git / Blob，通过 Native Plan 创建、纯验证、精确发布、原 Command outcome、formal_commit 业务完成。独立 Review Origin 的临时密码账户实际浏览器 approve / reject / expire 均验证，无拒绝后提交。
- A 续接验证等待期 mutation lane 已释放；原生批准后一次 dispatch；本地单元验证 drift / expiry / cancel / restart / unknown 不得派发或重发。Review URL 只出现在活跃 operation 的瞬时 notice，不写 Journal。
- 两个 Backend 均通过 Storage trash → restore 同 identity → trash → purge；Archive 原容器往返，已有目标冲突与 staging cancel；bundled Skill 导入、embed pack / preflight / extract。
- 两个 Backend 均通过确定性本地 Provider 的原子 API Preset：共享 Model 的 Route 分离、另一 Route 保持、旧 CAS 拒绝且无部分保存；draft preview 零发送；authoring trial 单次请求、原 operation 观察、重复请求不重发、模拟丢失已接收 ACK 后沿原 operation 确认。
- 两个 Backend 均通过确定性 WebUI image Provider 的作者 raw txt2img、原 job 观察、完整 image / thumbnail Binary 和 gallery 归档/取消归档。
- Cognition 的 FS 与 SQLite 均实测通过玩家披露与精确作者 inspection 分离、非授权 Actor Context view 拒绝、旧 anchor / 作者 Source 漂移失效；通过原声明 App Command 获取 Memory，Host 写入 received，acquired 正文改写、received 伪造及保护角色降级拒绝、withdraw 合法。Memory 随 Archive 原格式往返，Timeline / Variants 保持；hypothetical transaction / clock 两类私有候选不改真实 HEAD，非法 view / 超限拒绝，来源变更后 current 为 false。
- Chronicle 的两类时态查询通过：tick 0 返回旧事实，tick 2 返回新事实且 recordedTick=2、validFrom=1；真实 offset 分页和旧 cursor 拒绝通过。Goal 原生 preflight/create/context 与 quality profiles 通过；Plan evolution 的精确 Binding、旧 target/越权字段拒绝和限制只能收紧由原合同针对测试验证。
- 隔离真实产品 smoke 通过 Studio source/evaluation/apply、Preview、Session / Save / Branch、Memory Graph 和 desktop / 390px 窄屏；产品重启旧浏览器证明 STALE，reload 后 CURRENT。Surface 验证含临时测试挂载，不冒称全部 Shell 导航或真实移动设备。
- 本机实际 Codex app-server 通过 MCP 启动、18 tools/schema、status、discovery、READ、JPEG；Claude Code 2.1.305 通过实际 `mcp get` 连接健康检查，其工具调用和真人批准未验。客户端临时目录独立，未改用户配置。

### 本轮发现与修复

- 原 V3 immutable approval decision 没有顶层 runId，Storage retention 却要求所有 record 都有，导致一次合法审批后无关资源 preview 失败。沿原 decision key → ApprovalRequest → Run 验证归属与 hash，未补造字段或跳过孤立记录；合法、损坏、孤立三类测试通过。
- 原 Run metadata 只投影 pendingApprovalRefs，reject 后原记录消失，MCP 读到 missing。现在保留原 ApprovalRequest 的最终状态，排除认证 decision 正文；真实拒绝重测通过。
- Author trial 观察键缺 `role.` 前缀，已与原调度 key 对齐，并保留已接收结果与重复请求不发送语义。
- 作者 image Target 属于 Generation versioned resources，修正误用 Studio Library 的 guard；图像测试 Connection 必须使用原 `transport.http`。
- 回收的 Session 仍是 Package recovery root，旧 smoke 误期待 Work 可删除；测试改为断言原 `native_resource_retained_for_recovery`，未削弱保留策略。Session / Project / Work / Extension 回执明确 trash，永久 purge 仍是独立动作。
- 产品 `78b49086` 已本地快进集成 main；工具 `46ebc3b4` 已本地提交，最终 main 联调进行中。所有测试实现、临时数据、截图与客户端配置保持本地；真人审批、付费 Provider 和其他设备仍无证据。
- 打包预检发现 npm 没有沿父目录 Git ignore 排除本地 test，已增加交付文件白名单。修正后 `npm pack --dry-run --json` 为 39 项，只有 src、scripts/check.js、examples、README 与 package.json，没有本地测试或测试产物。

### main 集成后核对

- main 在最终联调期间由另一个任务推进到 `f9a8a838`，包含本任务产品提交 `78b49086`。新增范围只有 Prompt Preset 移动端导航与 CSS；核对后没有本任务后端合同变更，完整保留。旧实例的源 revision 与 live main 不同，原审批续接 / provenance 校验按设计拒绝，没有弱化或重发；随后以最新 main 重启受影响验证。
- 集成 main 的 SQLite 全领域链和扩展认知闭环通过；FS 的作者 trial 延迟取消、原 operation 保留及重复请求不重发单独通过。最新 `main@f9a8a838` 的 FS 全领域链重测通过，stdio/浏览器/Studio/Session/Graph smoke 重测通过，源码证明 EXACT、工作树干净，重启 STALE / reload CURRENT 通过。
- Registry 当前 473 项（READ 214、INTERACT 51、MUTATE 173、DESTRUCTIVE 35），逐项 schema/authority/guard 和默认 READ-only Policy 检查通过；472 项可用，Host Plugin 运维为原生不支持而显式不可用。此检查不表示每个 action 都运行过。
- 工具最终实现为 `eb7b11eb`：审批失败补充区分 guard/provenance/operation 漂移的诊断，仅保存 hash，不改变审批判定。产品与工具提交均不包含测试代码/配置/资产。

## 交付

- 产品提交：`78b49086372ed831f38ad1a90e1d98111156a866`，已集成并包含于本地与远端 `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`；保留另一任务随后合入的移动端 Preset 修复。
- 工具提交：`46ebc3b4`（完整适配）与 `eb7b11eb889467f5774b8df09b1fdc0b78f3bb13`（审批漂移诊断），已同步 `origin/plugin`。版本、Guide、示例与交付文件清单一致。
- 方案 bundle、覆盖矩阵与本 Record 随 docs 交付；其它任务 dirty changes 保持原状。产品临时工作树、已合并短期分支及空任务目录已清理；只移除临时依赖 junction，main 的依赖目录保留。本地测试保留在工具忽略目录，不上传。
- 正常使用需重启产品与 MCP 以加载新代码；本任务没有修改用户的实际运行数据或客户端配置。
- 扩展证据未验：实际用户 MCP/Review 交互体验、真实付费 Provider、真实移动设备和其它 OS、不可用远程客户端/数据库。现有自动化临时账户、本地 Provider、模拟视口与连接健康证据未冒称这些结果。
