# D9 E1 — 当前后端 Gate 与阶段核销

## 当前核销（2026-10-18 独立复核与 P6 checkpoint）

本轮从源码 `94d677c6d` 恢复；历史 `01ef2053b` 的 `PASS / READY_FOR_P5` 仅说明当时有限端口/消费者的交接证据，**不能作为原始 D1–D8 / P1–P4 全量完成证明**。本轮依用户明确要求作独立只读复核，原冻结合同未降低或重写。实际修改、失败、分次验证及最终源码 pin 见[同一 Record](../../../records/refactor/atria-native-orchestration-v3.md)。

**原始 P3/P4 = IN_PROGRESS；已验证的有限 Profile / Port 不变量保留各自证据；P5 六项后端问题已修复并完成相关回归；P6 = IN_PROGRESS（旧执行链已在工作分支移除，测试/文档/完整替代仍在核对）；最终产品 Gate = NOT_READY。**

用户最新要求进一步削减验证、甚至无需验证：Source db0a432fe已删除hash内深拷贝/JSON重验/V8编码缓存，并以直接字段比较替代81个内部hash-equal，停止扩展诊断和回归矩阵；仅语法/静态检查通过，未运行新消费者。此执行方式不回标原失败，也不把未取得的消费者结果记为PASS。

当前实现补充（Source **7eef4c971**）：三域已接未执行任务取消/blocked、冻结Fanout scope Judge→Agent、child纯结构Planner安全Review后继及RP子委派owned Actor Context/逐接收方reference-only返回。P6旧mock/测试入口和30份三语教学已清退或迁移。仅静态检查，新增消费者 **NOT_RUN**，未把旧timeout清零；原核心/领域限制与阶段Gate保持，领域嵌套委派仍在实现。

| 原冻结要求 | 真实实现 | 当前结论与剩余项 |
| --- | --- | --- |
| D2 唯一 Host、Source、Run/Effect/Receipt | 复用原存储/领域权威、CAS/epoch、银行、unknown 收据；非 Browser writer | 已有实现与必要专项证据，不能推导任意业务图均支持 |
| D3 Graph/Planner/Judge/Review | GraphPatch/失效/重做核心存在；RP 已新增非入口/多个及零 Planner 的 Agent DAG、多节点 Review/Judge；Project 多 Planner/多目标 Review、实际 Fanout/Join 与三候选 Judge→Review→正式工具已有实际消费证据；Session 实际独立 Judge 与跨 Audience Planner 任务传播已补；RP unequal branch Fanout→Join→Review/Judge 已有 SQLite 证据，FS 八 Model 末版完整正例亦已在原 Host60s 内闭环（整例含cold 61.383s） | **受限支持**；RP多非entry Planner显式自回环已有FS/SQLite分项实证，非self回边到Agent/较早Planner已有SQLite分项实证；Session多个Review/多target已接原影响闭包并有SQLite消费者证据；RP与Session跨纯Model Review/Judge的回路已有SQLite分项证据，原round上限与预算拒绝保留；Project跨纯Model Review回路亦有SQLite十send正例与原round上限拒绝；RP/Session主Review对原纯priority/finalize Planner后继重做已有九send及原bank8拒绝的两域独立实证；RP/Session main纯Model addNode/addEdge结构Patch重算两case同轮PASS78.664s（旧Patch/九paid/新Attempt及cold完整保留）；Project主Review跨纯Planner安全闭包重做十一send亦PASS58.746s（旧Patch/费用保留、三原formal/humanReview、冷DB/新Executor与诚实重hash拒绝）；replan/其它跨控制循环/redo仍未完整，通用生产图不能核销PASS。新组和失败核销逐次见Record |
| D3 Delegate/Join | 原 Scheduler/子预算/Source pins/return、五种 Join/partial/late/fail_fast 已有真实 RP 消费者；Session 与 Project 纯 Agent 子 DAG 的 Handoff 与显式 Delegate 已有 FS/SQLite 实际消费、冷读与费用证据；RP 同 Task 子 Planner/有界 self 回环→唯一 Agent→TaskLocalOutput 已有 SQLite 正例与四项风险证据；Session 子 Planner/self→Actor Agent 与RP frozen Planner→Agent scope各有SQLite首个实际闭环；Project 原 Task/工具/人工 Review 保留 | **受限支持，非通用 G2 PASS**。Session主已发布Planner→Agent→Review安全重做后原Host显式Delegate→唯一Narrator八send消费者PASS64.757s（全费用/typed current refs/fullcold），不称已有authoring mode selector；Session/Project child Planner/Agent DAG、动态 owned-pin Agent、self/nonself、Review/Judge 已有 SQLite 分次真实消费、全费用及 cold 证据；Project Review 十send/原三正式工具、Judge九send、nonself十send均有正例，原预算/轮次反例保留。三域 child 纯Agent Fanout/Join 正例分别为 RP四HTTP真实Chat39.750s、Session五HTTP93.844s、Project八HTTP/三formal118.539s；RP已知两settled消费前撤Source5.999s与一settled一unknown6.242s分别通过，Session/Project原paidSource及unknown亦各有证据。RP零Planner三Agent真实Chat16.553s；RP child Review/Judge完整成本预发布57steps/11edges正式Chat60.927s（含cold后验）通过，原50steps反例59.785s及独立57steps/10edges反例58.570s均精确deadline前拒绝，原Host60/child50steps/10edges不变，四paid风险另组通过。旧metadata-only出口证据已更正；所有历史timeout、fixture错误及早Source failfast导致mixed unknown的FAIL保留在Record，不回标PASS。Session/Project child frozen scope Planner已接，四新case已有首轮事实：Session原child3拒绝PASS1.912s；Session六send正例原98.223/97.990s provider timeout经同次typedproof复用后PASS108.967s（原Route/Host不变）；Project九send经原scope consumer精确Planner kind补漏后PASS142.655s（原三formal/cold/fees）；Projectchild3原wrapper精确原因/费用与合法closeHandle冷连接、新Scheduler、Hostactive/完整compute前后不变均PASS6.437s，两个helper旧FAIL保留。未增原Route/Host/额度，仅/tmp修实际缺口，不能核销通用支持；原main frozen-scope Planner代表末版Session FS/SQLite/MySQL/PG及Project FS/MySQL/PG均各有真实PASS，完整228逐path SHA前后不变；仅这些精确代表，不核销其它控制图。RP child scope Planner原五HTTP/held4正例经同次完整facts及continuation初始冗余Return去重后PASS61.819s（整例含后验，原Host60/父子50steps/10edges保持）；原held3同图零send/零fee/零Output/held保留及重试银行全文不变另PASS2.250s，全部旧FAIL与独占诊断计数保留。两次完整228依赖指纹466e9e…8b1相同；完整历史reader与诚实重hash拒绝已证明，本case未称完整Host重启；scope动态拓扑/嵌套及跨已完成控制组合仍未实现或未核销，有限Profile不等于通用完成。FS/SQL各自证据按Record分账，最终228依赖宽矩阵待收口。 |
| D4 / D7 角色独立 Audience 的 RP 协作 | 已接原 Session Information/Actor 精确 Context pin、独立 capture/编译/原 Hybrid 与逐接收方 Result 传播；不继承 Narrator-wide history/Skill，无传播证明只返回引用。FS/SQLite角色完整12项与SQL八项及跨Audience Planner/Skill分次证据见Record | **受限支持，有真实独立角色协作证据**；本批原SQLite两角色DAG/Fanout及paid Source撤权末版必要复验已3PASS15.852s（同当前228指纹，余11filter），其它图仍按各自证据，不能由后台 appraisal、same-audience DAG或冻结宽矩阵替代；原合同完整Gate未核销 |
| D7 条件 Game/Project 协作 | Game Actor DAG、Planner/实际 GraphPatch、多个Review/多目标闭包、多组 Fanout/Join、同 Actor 纯子 DAG Delegate/Handoff 已接原 Session/Model/银行/单 Output；Project 纯 Agent/多 Planner/多目标 Review DAG、Fanout/Join 与 Judge→Review→原工具→人工 Review 已有实际消费证据 | **原合同仍未完整实现**。Game/Project主图Agent DAG、Planner、Review/Judge、有界self/nonself回路、纯Model结构Patch后Review重做、纯Agent子图和child frozen-scope Planner已有各自真实消费者证据；Session主安全Review后显式Delegate→唯一Narrator八send亦已通过，Project主跨纯Planner因果Review重做十一send及原三正式工具/humanReview已通过。Session/Project child纯Agent Fanout正例与paid Source/unknown各自有证；child scope Planner四新正负例已分次通过（详见Record），不混称一轮全绿或跨图转移。main frozen-scope Planner末版Session四Engine、Project FS/MySQL/PG精确代表已全部通过，228完整SHA前后相同。**当前待验证**：8fe8267fa已补Session/Project child Review安全纯Planner因果后继与原cold证明，RP同类child原输入格式/失效后消费证明亦已补；首Session最小消费者实际FAIL generation_provider_timeout138.337s，指纹b114…180前后相同；日志未给实际HTTP/费用，定点原worker取证准备中。Session held6精确负例已PASS24.371s；RP新正例原Host60取消FAIL63.259s，实际HTTP/费用仍待取证；RP held6负例PASS12.865s；Project新正例Review adopt阶段generation_execution_failed FAIL24.409s，210bc3743已补原control current同Saga纯Planner重验，原正例另FAIL父级provider_timeout126.081s（实际HTTP/费用未取证，不称修复完成）；Session同call证明去重与Project对应路径仅准备、RP一次stage取证待回。bfa73a5ca新Session正例仍provider_timeout FAIL116.626s，其余七组NOT_RUN；现已按用户最新要求直接精简内部hash/重复拷贝与比较，不扩验证矩阵，未重跑不称超时已解。余新消费者/相邻项仍NOT_RUN，不能按静态或旧宽绿核销。一般嵌套、scope其它控制及跨已完成控制组合仍未实现或未获证，不能以有限Profile称通用G2 PASS；也不发明任意控制节点笛卡尔积作为新要求。 |
| D3/D6 可验证边界恢复 | ready 无 claim Commit 重新准入、cold Result 新授权消费、unknown 查询/reconcile | 有限恢复符合冻结要求；不额外要求所有内存阶段自动恢复 |
| D7 正式 Project 写入 | V3 有限已分类可信 Commit；原完整 Studio 人工审阅/Commit 领域路径保留 | **受限支持**；不得误删原领域能力或伪称所有 V3 修改类型已支持 |
| D5/D7 Evolution/Skill | Native Plan 与原 Project 目标、真实 RP scoped Skill Context/预算/漂移拒绝及真实 Host 消费→原 Output 成功 activation 观察已接；历史评测已迁真实 Native 请求/Plan/恢复 | 原独立质量/价格不足拒晋升；eligible 自动晋升仍 NOT_RUN；末版Source069a4bd32/228完整依赖同226577…bb429下，原agent-intelligence完整43套/633项PASS456.640s、activation/RP Skill独立2套11项PASS22.762s；原FS/SQLite retrieval完整24项PASS257.015s，八组完整指纹/逐文件核验均同069；后续8fe child补丁相关验证另账，不能跨字节称全宽绿；各组按同一Record分账 |

执行分工保留[实施方案 §2](implementation-plan.md#2-执行分工与两次交接)。用户已从安全 checkpoint 明确要求继续；唯一 HANDOFF 保留该中断快照，恢复后的进度归同一 Record 与真实 Git，不把历史停止记录恢复为新限制。未合 main、未结束任务分支。

## P3 — 已验证端口子集（非原始阶段全量完成）

以下保留历史有限闭环证据；原始能力未完成项以上表为准，不能被本表的局部PASS覆盖。依据：D4/C2、D5/F2、D6/S2 及接口合同 §8.2；范围与停止条件归[实施方案 §6](implementation-plan.md#6-p3-收敛边界与结束条件)。每行核销须同时具备生产入口、原权威与银行、真实 receipt/Result 关联、对应源码版本验证；adapter 或注入式测试本身不构成生产支持。

| 闭环 / 原权威 | 当前生产能力与证据入口 | 剩余必需行为 / 当前 Gate |
| --- | --- | --- |
| Source / 原 Session、Project、RP authority | 三域 Source、原银行、原 Context/Hybrid、显式父子 Message Source pins、发送/消费撤权复验及恢复准入已接；[接口 §18](interface-contracts.md#18-工程收敛后的端口合同)，分次四Engine证据见 Record | PASS；Source授权/共享并发与SQL Context实际目录/Secret/index接线均有证据，父私密 Memory 不继承 |
| Model / 原 GenerationHost、RouteResolver、原银行 | RP、Session Narrator/Resolver、Project retry/fallback与逐候选owned pin、稳定send ordinal、unknown保留；Reuse/continuity由原能力承载；同Root真并发、明确HTTP拒绝与已解析未消费响应事实均已接 | 三域及新terminal分次四Engine通过；费用closed独立、缺usage仍unknown，transport/timeout/parse/伪造或混合未知链不造明确失败；末版共享验证已通过 |
| Delegate / 原 Scheduler、Source、Context、原银行 | brief-only 和显式双边owned Source、typed Result/Output、reservation关闭、durable return、父接收方重验已接 | 显式Source/Result生产闭环已验证；不强制子检索，不声称全部业务角色组合或任意父流程冷恢复 |
| Tool / 原 Skill、MCP、A2A、Secret/Egress authority | 真实原Session/Skill Source → published Plan/pin → 私有producer → Effect/ToolPort → 原receipt/bank → typed Result；HTTP prepare/dispatch/observe/consume与cold新接收授权已挂载 | FS/SQLite及MySQL/PG实际消费者/HTTP证据已取得；A2A受理保持unknown，无假远端完成；末版相邻验证已通过 |
| 审批 / 原账户、Review Origin、原领域 writer | Review Origin、再认证、一次批准及有限 Project metadata Commit 已接（接口 §17.138） | 保留批准绑定、重放拒绝与原 Port Gate；实际 Browser 和跨端隔离验证归 P5/最终验收，不能因此把后端已实现描述为未实现 |
| 恢复 / Host Ledger + 原 Source/银行/receipt | 原Project Commit ready无claim可同Effect重新准入、当前epoch及新Origin批准；cold Tool Result重新接收授权；dispatching/unknown只观察/reconcile | 有限恢复与原银行/收据四Engine分次通过；不以“完整release”或全部业务流程自动续跑扩展P3 |

## 阶段分账

| 阶段 | 当前能力与尚需核销的边界 |
| --- | --- |
| P1/P2 后端 | Host/Plan/Run/Graph/Effect/审批基础及GraphPatch/Planner/Judge/Review/有界重做、Delegate/Handoff已由真实消费者使用；五种Join与fail_fast同机制接通。末版Join/Fanout SQL36项整轮通过，FS/SQLite36项分次通过；共享控制/输出和原Planner/Judge/Review相邻验证完成。支持范围按原有限profile/owned pins与接口§18，不推导任意嵌套/跨领域图或串行Evolution worker支持Fanout。 |
| P4 / W06–W07 | RP/Session正式输出、后台Task/Actor appraisal、Project多轮/工具/Review、有限正式Commit、Plan Prompt/原自动evaluation已实现。同一已付费Model Task→Review→fresh批准→Commit→真实Package/Session消费已取得四Engine分次证据，原银行/预算不重置。Join early-close/partial/late全集费用、Session已知失败与unknown的原Attempt/Root终结已完成；零Result/World越权、cold不重发有证据。原Eval质量/价格不足必须拒晋升，不另建质量authority；完整业务语义不能塞回P3内核。 |
| P5 / W08 | 已完成并回交（`94d677c6d`）：Agents › Plans（Library、Graph/List/Inspector、Validate/Publish/冲突/未知、固定依赖、Binding）与 Agents › Runs（来源 Run 列表、RP 审阅启动、Timeline/Graph、费用/额度/诊断、取消/恢复/核对、Project commit 写入）、隔离 Review 文档与可信批准；真实 Host（模拟 Provider）桌面与模拟手机视口取证见 Record。本轮六项后端问题均已修复并有相关回归，含原 Task reviewHash 接口与真实准备可信提交 UI。真机、Linux/Termux、真实读屏/输入法、真实 Provider 与大图性能 NOT_RUN。 |
| P6 / W09 | IN_PROGRESS：旧四执行根、Browser capability/主要模式入口、旧设置与 orch-preset scope已清退；共享编译helper、Memory、原数据/unknown收据保留。原manifest逐路径发现的四旧renderer/两Director旧命令Skill、专属旧tests/CSS及三语教程残留已精确应用清退，三份有效UI脚本已迁Native入口；原151路径0present、增强相对/绝对引用guard PASS。共享资产/领域断言保留。必要原7suite53项已PASS2.698s（同当前228指纹）；原两E2E首1440 case因旧Settings分类导航遗漏FAIL，其余12及smoke NOT_RUN；bfa73a5ca复验已越过Settings，随后因旧hub断言FAIL（0PASS/1FAIL/12NOT_RUN）；现仅迁移到实际Native入口和四分区，依用户最新要求未再跑。069原43/633、activation11、retrieval24末版宽组已通过，后续新child相关补丁验证仍待收口，不能跨字节拼全宽绿；P6完整运行核销未完成。 |
| 最终验证 / P7 → P8 | installed Host+Browser、Windows/Linux/Termux、声明支持的 Engine、必要外部服务/性能/人工质量按原验收取得证据；不是全部倒挂为 P3 端口 Gate。尚未取得的证据保留 NOT_RUN/BLOCKED，完成整体核对后才处理集成收尾。 |

## 历史交接与当前剩余项

`01ef2053b` 的首次后端交接及 `94d677c6d` 的 P5 交接保留为历史事实；先前“明确剩余消费者闭环已完成”的概括已被上表限定，不能据此取消原始 D4/D7 能力。P5 修复不是原始全产品 Gate 通过。

本轮组装后 Linux scratch Host+Chromium 与桌面/模拟手机取得相应证据；Windows/Termux 真机、真实输入法/读屏、SQL 末版组装、必要性能/质量等未取证项仍 NOT_RUN。旧协议测试的迁移、宽矩阵失败与中断按 Record 如实记载，不通过删掉有效断言或把失败全归基线来核销。

## 验证口径

共享 Port 不变量集中覆盖；不同业务权限/正式 writer 边界保留真实消费者验证。撤权、CAS、并发预约、取消、ACK-loss、unknown、冷恢复和费用保留不可裁减。各 Engine 按其持久化和一致性差异取得证据，不把 FS/SQLite 当作 SQL 通过。

最终核销冻结源码字节并运行与改动相符的闭环矩阵；修改、失败或未解决风险才触发相关重跑。测试数量、任务组数、文档长度和所有假设性组合均不构成 Gate。真实 Provider 未报 usage/价格或 continuation 状态时如实 unknown/miss/reset；不得伪报零费用或实际 cache 命中。测试 API 配置与限流只引用 Governance §13.1，不新增硬上限。
