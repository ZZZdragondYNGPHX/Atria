# S11：持续目标主体、契约与持久状态

## 范围与依赖

M1 已在 main 完成。用户已确认继续全部剩余 S/G；本组沿现有实现分支，先冻结 M2 的事件驱动范围，不依赖未验收 M8。G06 pending 不因此消除，M3 仍等待 G06。

本组实现产品 Persistent Goal 数据及明确用户控制，不创建 Codex Goal 工具。User / Project execution goal 与 Actor desire 分域；Todo、Task completed、commitment 和模型自述均不自动产生 Goal 或执行权限。程序关闭期间 wall-clock wake 暂不支持；S13 仅已有 Host 存活、用户/正式生命周期事件和 durable intent。

## 唯一权威与存储

- 原 authenticated handle 决定 owner，原 Evidence scope 管理 rp_chat / rp_session / project 身份。Native Actor desire 只允许精确 Session/Actor/PackageVersion/Branch，用户明确创建，S17 再接事件认知 writer。
- 沿 StorageEngine 注册一个 `atri_agent_goal` kind，key 为 handle + goalId；序号、integrity CAS、readonly、FS同资源串行和SQL事务复用原 repository helpers。目标不混入 World / Memory / Actor truth，不增加 profile、sender 或 fact registry。
- Goal 固定 intent、subject、scope/anchor、criteria/invariants、声明预算、evidence refs、progress/blockers和lifecycle。仅 references / bounded predicate，不复制原始聊天、私有正文、opaque或凭据。
- criteria/invariants只引用原 Evidence selector；固定 field path 和 equality predicate，实际判断由S12的原source adapter读取当前权威。run complete / Task status / remote complete 本身不等于成功；Project criterion还须正式receipt且所要结果可核对。
- 本组不调度、不付费、不新造预算bank。声明computeBudget复用原严格契约，S13执行仍须绑定原Run/Task charge；pause/resume不重置任何账本。Actor desire没有用户执行权限或自动budget。

## 有限 S11 出口

服务端用户创建、列举/读取、pause/resume/cancel的可调用消费者；不提供客户端“mark completed”或任意整doc写入。actor / user主体不可互换。复用原Scope authority核验存在与精确锚点，记录明确来源。

FS/SQLite真实持久与新service读取、CAS竞争/owner隔离/readonly/未知version/无效scope、dump/restore保留目标；模型完成或Todo字段不能经创建/控制端口标成功。只跑本组有关契约/持久/HTTP checks，不重跑已交付M1/HM1。S12继续criteria完成/冲突/撤回/fork/restore，S13续跑，S14两入口UI与跨run闭环；不得以S11 repository存在宣称整个M2完成。

## 实施时的有界规则

每Goal不超过32 criteria /32 invariants /32 evidence refs，文档64KiB；intent仅用户明确提供的有界描述。约束是产品输入/存储边界，不是助手API次数/token限制。服务器入口拒绝owner、成功标志、生成权限、隐藏状态及未声明字段。删除或取消不撤销已存在的正式产物与原费用。

## 当前结果

S11 有限持久/控制出口已交付：14新增/2相关既有distinct本地检查PASS。两域及Actor desire的真实scope、FS/SQLite新Node读取、CAS/readonly/双owner/来源变更拒绝、认证HTTP、不允许成功标志，以及FS实物文件复制/SQLite实际dump-restore均有证据。FS是备份文件语义，不调用no-op dumpUser、不冒称ZIP端到端；SQLite是实际engine dump/restore。主体、scope、criteria/invariants、intent与声明budget在后续保存时固定，pause/resume不扩额度。详细producer/日志/失败唯一见Record。

S12验证、S13durable continuation/原Run-Task预算绑定、S14 UI/双入口跨run完成均尚未交付；本组不调度模型、不授予Actor执行权限。G06/M8/HM2仍按原pending出口继续，M3的G06依赖不取消。
