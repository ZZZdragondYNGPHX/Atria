# 斗破苍穹开放沙盒世界 — Record

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；BE 在 package 实施，必要原生接纳补充使用独立源码任务。
- Status: v0.10 BE 阶段实现已保存；按用户要求推送换设备，完整后端尚未完成。
- Plan: [方案入口](../../plans/package/doupo-living-world/index.md)

## 当前结果

已从 v0.9 准备进入 BE 实施。package 现有可构建、可安装的原生后端源，独立源码分支保存必要的接纳扩展。四类出身、十二场所、二十四名初始 NPC，以及生活/成长/关系/家庭等规则已有阶段代码；只有下文实测项目可算通过。完整恢复、跨年负载、人口并发、真实模型和正式 Bridge 接线仍未完成。用户要求推送换设备；正式前端仍由另一对话设计，后端完成后才由用户选择集成者。

## 阶段 D1–D4 — 调研、讨论与交接整理

- Source baseline: `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`。
- Docs start HEAD: `65a49a5af9b41c18d4a2976bb592613903f7f3fe`。
- 当前文档引入提交以 `git log -1 --format=%H -- plans/package/doupo-living-world/index.md` 为准。
- Status: 最新选择已写入 v0.6；按用户明确请求整理交接并推送本任务文档。

### 已完成

- 已核实当前 main 干净，并按任务需要读取游戏权威事务、World Clock、Simulation、Subject、Information、Memory、Frontend 和存档恢复的相关源码。
- 已整理《觅长生》官方资料、生成式人物研究、小说官方译本部分免费章节、用户允许的 Wiki/百科机制与地域条目；具体证据及访问范围见 Plan 的 research.md。
- 已确认首批地域、NPC 生活与探索优先级、亲密关系/婚姻家庭、深度成长、完整世界读档、空间移动、角色身份与电脑质量优先等方向，统一见 decisions.md。
- 已建立按需阅读的 Plan 路由，保留建议与已确认决定的区别；没有从历史草案导入用户确认。
- 仅更新本任务方案与交接所需文档。其它任务已有 dirty changes（包括旧 doupo-open-world 草案的本机删除）未纳入本任务提交。

### 重要技术发现

- 已有原生权威事务、短时 computation、世界追赶、个人视角和版本化 Session；可以复用，但不等于游戏已实现。
- Simulation 的模板/步骤预算、Information 扫描和长期状态规模需结合目标负载验证，尚无真实性能上限结论。
- 现有关系评价路径要求目标在 manifest Actor 列表中，动态 Subject 的关系目标需优先验证并视实际需要扩展既有权威。
- 完整世界读档是已确认目标；后台任务、个人记忆、外部或跨 Session 记忆的隔离与恢复一致性尚待验证。
- 内建可选寿元机制不能直接等同斗气境界寿元；优先研究复用 Domain/Clock/computation 的游戏规则表达。

### 实际验证

- 多次核对相关 Git 状态与源码基线。
- 对当前 Bundle 执行本地文件链接与标题锚点检查，检查结果无缺失；交接提交前对最终变更再次检查。
- 未修改 Atria 产品源码，未创建游戏资产或 `.atria` 成品。
- 未运行游戏负载压测、构建、真实模型质量测试或完整浏览器验证；未发起本项目真实 Provider 生成调用。
- Atria 工具的源码与运行实例身份链仍不可验证，不能把源码阅读当作运行验证。

### 下一 checkpoint

恢复实际 Git 状态 → 读取用户请求的 HANDOFF → Plan index → 当前 D4 模块 → 本 Record。汇总完整制作稿，提出首批内容、日常/关系/家庭、探索争夺、规则数据、框架验证与必要修补、UI/美术默认方向及实施顺序。

用户最初要求讨论确定后正式开工。当前应继续完成整体方案并进行启动确认；不要重复询问已经明确的方向，不要直接制作游戏或修改产品。

## 阶段 D4 — 续接与完整制作稿 v0.7

- Date: 2026-10-20。
- Docs start HEAD: `5e215cbefb8585f5aada7a15b8e8ca71afeccd69`。
- Source baseline: `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`。
- 文档提交可由 `git log -1 --format=%H -- plans/package/doupo-living-world/production-plan.md` 定位。
- Status: 本轮方案整理完成，供整体讨论；未获正式制作授权。

### Git 恢复与追加要求

- fetch 最新 origin/docs，确认指定 `5e215cbe` 是其祖先（当前远端即该完整提交）；先读远端 HANDOFF 与 Plan index，按 D4 加载 decisions、content-and-runtime、Record，再为完整制作稿加载关联领域模块。
- docs 从 `91a6b89a4` 安全快进到上述起点，保留其它任务已有 HTML 未提交改动；没有读入旧 doupo-open-world 草案的确认。
- 发现本机 main 落后后 fetch origin/main，确认最新远端与原源码基线一致。用户追加要求同步并舍弃未保存内容，经范围澄清仅针对 main；同步前 main 干净，已从 `f4574f3e8` 快进到 `f9a8a8382`，同步后也干净，无需丢弃内容。其它工作树与任务改动保留。
- 本任务换设备快照已消费，恢复事实归入本 Record；移除已不需要的本任务 HANDOFF，不刷新为新交接。

### 文档完成内容

- 新增 production-plan.md，汇总首批范围、非强制贯通体验、数据职责、V1–V6 验证与必要框架修补条件、P0–P5 实施顺序及本轮讨论点。
- 展开四类原创出身、约 12 个场所单元、24–36 名持续具名人物（其中 8–12 名重点人物）的候选编制；这些数值不是批准项或性能容量。
- 展开自主日常、双向关系与义务、亲密/婚姻/共同生活、子女成长与代际、家庭变故与传承；首批要求真正可玩，不降为未来标签。
- 展开线索、采集、有限资源和一次性机缘的竞争、成长战斗衔接、行动时间、中断与消息传播、完整世界保存恢复。
- 提出场景为主的桌面布局、国风手绘 2D 视觉方向、候选 token 与资产生产顺序；没有制作美术成品或可运行 UI。
- D01–D22 的决定正文未改变，只修正 D01 影响段对 D22 电脑主要目标的过时表述；未把新增建议登记为用户确认。
- 更新 index、experience 与模块路由，清理“尚待汇总”等当前状态；历史 v0.6 交接事实保留在前一阶段。

### 调查与验证边界

- 再次核实最新源码中的 appraisal manifest Actor 目标限制、Information 的动态身份校验和 Session SavePoint/restore 基础；只有源码证据，未复现本任务运行缺陷。
- 使用本地 frontend-design 与 ui-ux-pro-max 辅助 UI 方案；设计系统检索未得到适配此类游戏界面的整套方案，没有采用偏宣传网站/电竞的模板，使用本项目拟定方向；焦点与反馈指导按桌面场景选用。
- 本轮仅文档编辑和用户要求的 main 同步；未创建游戏资产、源码任务分支、构建、浏览器实例、真实模型生成或负载实测。验证安排不等于通过结论。
- 本地检查覆盖 10 个 Plan 文件与本 Record 的 82 处相对文件/标题链接，全部有效；本任务 Git whitespace 检查通过，未发现机器绝对路径或明显凭证模式。没有为文档变更新增测试实现。

### 下一 checkpoint

围绕 v0.7 的具体编制、出身、家庭深度、原著/原创人物比例、UI 美术与扩展顺序进行整体讨论，先更新用户提出的调整。已确认 D01–D22 不重复询问；正式启动仍须用户明确确认，不把同步 main 或本稿完成视为制作授权。

## 阶段 D4 — 动态 NPC 与人口平衡 v0.8

- Date: 2026-10-20。
- Docs start HEAD: `4ef50e1b4`。
- Status: 新增方向已持久化，仍为方案讨论，无正式制作授权。
- 用户认可先做深首批生活与长期后果再扩大陆域；补充动态生成 NPC、面向世界扩展设置上限、通过各种事件平衡人口。分别记录为 D23、D24，不把认可扩大为已批准全部具体数值或正式启动。
- 世界模块集中展开拟定计数口径、人物来源、全局与地区人口分配、事件调节、名额接纳与预留、历史保留和完整读档；首轮作者编制、活动预算、存活人口与档案增长分开计量。
- 内容模块更新首轮编制说明及接近上限、并发生成、人口事件和恢复后的负载样本；制作稿增加 V7，并接入 P1 的早期权威验证与 P3 的长期家庭/世代验证；research 保留技术预算与游戏上限的区别。
- 上限数值、计数口径、事件清单、阈值与频率均未冻结；未把 24–36 人编制或 Subject 声明预算当作世界人口上限。
- 本轮只更新本任务 Plan/Record，保留其它任务已有 HTML 改动；没有新源码、美术、游戏资产或运行验证。
- 执行代理完成相关文档自查：11 个 Markdown 文件的 88 处本地文件/标题链接有效，本任务 whitespace 检查通过；未增加独立审查流程或测试实现。
- 下一 checkpoint：围绕 v0.8 人口机制与其余具体内容继续整体讨论，先更新新确认，再在用户明确启动后制作；不重复询问 D01–D24。

## 阶段 Implementation 准备 — 前后端拆分 v0.9

- Date: 2026-10-20。
- Docs start HEAD: `4365619ec`；开始时本分支比 origin/docs 领先两个本地提交。
- Source baseline: `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`；开始时 main 和 package 工作树均干净。
- Status: 正式开工已确认，用户随后要求先拆分前后端并移交新对话；本阶段交付文档准备，无产品代码。

### 授权与分工

- D25 记录正式制作启动；D26 记录本轮先拆分、后端/前端设计在新对话并行、后端完成后由用户选择前端集成执行者。清理生效入口“尚未获开工授权”的过时表述，历史阶段事实保留。
- 新增 execution-split.md：BE 负责首批规则、内容、模型、投影与必要框架修补；FE 负责离线原型及设计；后续集成者负责原生表现、美术与整包验收。约定文件所有权、隔离工作树和同一 Plan/Record，避免两个对话同时修改相同权威或 Git 索引。
- 新增 backend-task.md：BE0–BE6 覆盖运行基线、身份/完整恢复/人口接纳、三地生活探索、成长经济交锋、家庭世代、真实模型、长期负载和交付。最小骨架只是阶段成果，不能以它代替全部后端完成。
- 新增 frontend-ai-brief.md：提炼游戏体验、默认视觉、F01–F12 页面与状态、技术边界、三项设计产物、必要自查与可复制新对话提示。该文件由实际文档编写分工代理完成，没有引入独立审查代理或交付 gate。
- 新增 frontend-contract.md：C0 只约定能力、玩家可见数据、动作和等待/恢复语义；尚未宣称 API 或字段已实现。BE 后续补齐真实 schema/绑定/来源与验证结果，前端不自造世界写入或存档权威。

### 参考材料与实际检查

- 读取用户指定的 atria-frontend-audit 入口、外部设计委托、实施输入、功能表现和设计指导。借鉴“交互 HTML＋完整功能表现＋设计指导”以及覆盖映射和真实接线分离的方法，没有搬入全平台 189 项功能、Dock/活动灵动岛或 Atrium 风格。
- 为确认接口表达，再读当前 main 的原生前端作者示例：表现状态不写世界，Bridge Action 提交返回 receipt，公开成功 payload 是 `{}`，状态从投影读取。仅为文档契约提供源码依据，未算运行验证。
- 开始与结束均核对 Git；保留其它任务 HTML 的未提交改动，本任务只提交 Plan/Record 和当前请求所需接续快照。没有创建游戏资产、修改产品源码、调用真实模型、构建或浏览器验证。
- 两份委托已包含新对话启动提示；按本次新对话安排创建 HANDOFF，将两路入口与真实状态集中保存，不覆盖其它任务的交接。
- 必要自查覆盖 14 个 Plan 文件、Record 和 HANDOFF 的 151 处相对文件/标题链接，全部有效；本任务 whitespace 检查通过，未发现机器绝对路径或明显凭证模式。其它任务 HTML 的 diff 仍为 67 行新增、35 行删除，没有纳入本次提交。

### 下一 checkpoint

- 后端新对话：核实实际 Git → 本任务 HANDOFF → index/decisions/execution-split/backend-task/frontend-contract/research/Record → 从 BE0/BE1 连续实施全部后端范围。
- 前端设计新对话：index/frontend-ai-brief/execution-split/frontend-contract/presentation，按需读取 decisions 和内容模块；在隔离工作区或外部环境交付三项设计资料，勿同时改 Plan/Record/共用契约。
- 后端完成后交付实际接口、版本与验证结果，再由用户选择前端集成者；开工许可不再重复请求，阶段不另加审批。

## v0.9 交付状态（历史）

游戏项目尚未完成。当前交付为 v0.9 制作基线、前后端分工、C0 共用语义、两份可独立使用的任务委托及新对话接续资料；尚无本任务游戏源码、设计 HTML 或 `.atria` 构建。

## 阶段 BE0/BE1 — 运行基线与原生接纳（实施中）

- Date: 2026-10-21。
- 起点：package `2dd7fb3ed`，docs `0f83dda33`，main `f9a8a83827c8b3662c44e67e95c9ed84118baadd`；main/package 干净。docs 的其它任务 HTML 改动保留。
- 已消费本任务 HANDOFF，按 BE 路由读取 D01–D26、分工、领域模块与原有 Record；没有读取 doupo-open-world 历史确认。
- 当前本地没有 8000 端口运行实例；MCP 源码/实例关联为 UNVERIFIABLE，未拿它证明运行。验证改用隔离的 Native SessionCore/PackageInstaller 与临时 FsEngine，验证源码固定为本任务源码工作树。
- 新建独立源码任务 `feat/doupo-native-authority`，起点为上述 main；main 没有合入 package。原基线上有界集合 read grant 的声明被拒绝：`Transaction read grant: unknown field collection`。正在补充原 privateReads 的有界字段投影、同 scope 和预算计费；不建立平行人物或存档服务。
- 作者源已经开始建立于 `package:doupo-living-world/source/`，包含四类出身、十二场所、二十四名初始 NPC 的候选实施编制；构建版本暂为 `0.1.0-be.1`。这些是实施默认值，不新增用户冻结决定。
- 开局切点采用本轮家族测试当日晚间、来客会面之前；重新读取官方译本第 1–3 章，核实测试结果、父子/族长关系与古戒已持有。精确距离、绝对年份、未核实的年龄/境界不写为小说定值；原创场景、人物与规则在资产内标明。
- 已生成第一份可构造的 Native 容器；正式安装、规则、动态关系、完整恢复、真实模型及长期负载仍在验证，尚不能称 BE 完成。测试实现与临时运行数据仅本地保留。
- 后续：安装与身份初始化 → V1/V2/V7 → BE2–BE4 全规则修正 → V6 真实模型 → V3/V4 长期负载 → 共用契约与集成交付；不增加阶段审批或独立审查。

## 阶段 BE — 换设备 checkpoint v0.10

- Date: 2026-10-21；用户明确要求保存、推送远端并换设备接续。此处为中断 checkpoint，**不是 BE 完成**。
- Package HEAD：`b424c2a030a9774ad5b90cb438a5d9cd23fb50f7`，分支 `package`。版本 `0.1.0-be.1`，Package ID `pkg_723cdd67122beffdac73f3dfe5c9f64e`，PackageVersion ID `pkgv_788177e6d50cb9680ed2089857ace7c9`。
- Source HEAD：`6e44cf85969fff3038eec5a16957b0919ff17521`，分支 `feat/doupo-native-authority`；[独立源码任务](../../plans/feat/doupo-native-authority.md)及其 [Record](../feat/doupo-native-authority.md)。仍未合入 main；main 保持起点且干净。
- docs 本轮起点 `0f83dda338b292b48f6c90c6fe659a31aa0e4666`；本 checkpoint 文档提交以 `git log -1 --format=%H -- HANDOFF.md` 定位，远端事实以实际 push/refs 核验为准。

### 已保存实现

- 包源、声明构建器与闭合 schema；角色创建、地图/地点/网格路径、原生身份绑定、有限库存与报价、探索竞争、修炼与炼药、分段交锋、个人经历和非对称评价、真实需求/约定、婚姻共同物资、预留出生、动态 Subject、迁入与 NPC 生活/家庭规则。详见 C1 契约草稿，不把代码存在等同全部验收通过。
- 有界 private collection grants、按原记录哈希校验旧评价、computed 数组元素引用、真实 computation anchor、可缩减的 invariantContext/invariantReads、Subject 关系 target 接纳。没有增加原执行预算，没有建立平行身份/存档/关系存储。
- 接入既有 Native History checkpoint，以复用归档重放隔离并避免把长期回执无限塞在活动状态；没有为测试结果更换 Domain 或删除活跃关系。最新长时回归仍待重跑。
- 正式前端、Canvas 与美术未制作；没有改动 `design-reference/`。`releases/` 只有目录说明，没有上传 `.atria` 验证件或发布件。

### 实际验证及其边界

- 当前提交前再次构建成功，临时容器 47,724 bytes；加密容器带随机盐/nonce，不以归档逐字节相同判断可复现。没有将临时容器作为发布件提交。
- 当前包源在隔离 FsEngine 中通过安装、新局 24 个 Subject 绑定、创建角色、个人投影和十日推进（17 次后续片段）；该 smoke 的承诺参数已因新增真实 needs 规则而被正确拒绝，它不再作为正向履约样本。规则验证旁白是固定本地文本，不是模型质量证据。
- 较早的实际家庭样本已通过购买/失效报价、正向承诺履行、照护、婚约/婚姻、家庭分配、怀孕预留、出生与新生儿真实 Subject/个人 view；到读回旧存档后，测试辅助函数在访问不存在的未来孩子时发生 `undefined.state`，所以**完整恢复断言没有跑完**。辅助函数已本地修正，尚未完成整条重跑；不能写成 V2 通过。
- 原 appraisal 接纳函数对同一真实非 manifest Subject 返回 `appraisal_target_denied`；修改后接纳，未知 Subject 仍拒绝。这个对比验证目标接纳边界，不是一次真实模型交付。
- 新增集合/哈希/筛选计费/scope/越权 invariant 等本地样本 **14 项通过**；原有核心回归分批通过 185 项，另补齐本地 harness 后 computation Session/appraisal 的 17 项通过。它们不是最终完整回归：模拟候选仍有一项旧 work count 的 8/9 预期差异，未修改 main 上也复现；最新 invariantReads 补充后尚未全量重跑此前套件。测试实现、日志与临时数据未提交。
- 早期长测曾在 Lifecycle 256 条回执上限失败；已接入现有 History checkpoint，最新版本只完成十日 smoke，仍须跨越原失败点及跨年重跑。另已观察到 invariant 复制大状态造成 128 KiB 消息超限，缩减上下文后短样本通过；更大人口尚未测定。
- API 连接尝试均在有效模型响应前失败（socket/transport 错误），没有真实模型判断、工具选择、Token 使用或质量通过结果。用户随后明确停用 GGchan，并要求暂不调用 API、留到最后；这两条指令继续生效。本地没有仍在运行的模型调用或本任务测试进程。

### 接续优先事项

1. 从远端三条分支恢复本 checkpoint，核实 Git 并保护其它工作；本地测试资产不会随设备迁移，按 Record 重建必要样本。先重跑当前包安装与家庭/完整世界恢复，补迟到任务和分支来源隔离。
2. 在现有 Bridge 真实接线中，typed transaction 走 NativeGenerationHost 并生成旁白；不能让每个内部 continue 都调用模型。先调查、复用或必要补齐现有确定性权威提交路径，再进行 API 验收；这项尚未实现。
3. 完成历史人物可见查询：当前 computation 只读 alive 人物，死者记录仍在 Native Domain/Revision，但玩家历史查询入口尚未补齐；同时验证远方死亡、家庭状态和私有评价不泄露。
4. 跨月/跨年/世代、来源增长、现有人口/预留计数、并发接纳、全局与地区阈值、原住民死亡和迁徙等 V3/V4/V7。96 人上限是未经负载确认的实施默认值，不能按模板声明上限推断容量。
5. 补齐复合动作部分成功、自动存档边界、旅行/战斗风险、取消、结果保留、NPC 关系家庭与全部出身的回归；必要时修正规则，不能以“已有代码”宣称 BE2–BE4 完成。
6. 本地工作与必要修补完成后再做 V6。**不再使用 GGchan，也不自动使用旧连接/旧额度**；按当时可用且明确的配置验证真实意图、个人判断和叙事。最后完成源码任务集成、包版本/构建与前端接线清单，再由用户选择集成者。

当前共用契约已补 C1 实际字段/事务草稿；不是正式前端 binding 或最终冻结协议。阶段不增加审批，不引入独立审查，不重新询问 D01–D26，不从 doupo-open-world 导入确认。

### 其它任务保护

docs 的 `plans/architecture/atria-frontend-audit/design-proposal/atria-visual-direction.html` 仍是原有未提交改动（67 行新增、35 行删除），没有纳入本任务提交。另已存在 FE 的隔离工作树/分支 `feat/doupo-living-world-design-reference`，本对话不编辑、提交或推送它；不触碰其它源码任务。
