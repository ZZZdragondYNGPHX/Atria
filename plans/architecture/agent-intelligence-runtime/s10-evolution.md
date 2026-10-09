# S10 — 评测、局部发布与恢复

状态：**S10 工程交付完成；M1 实际模型改善与集成前置条件待验收**。依赖 S05–S09；仅本阶段，不进入 M2 / G。产品 / 本地验证 HEAD：`ed00f4f0cea53be360ed8dfa082bbd0afeec5398`。

## 冻结边界

- Experience 仍是反馈 / 诊断权威；版本仍由原 Skill、Workspace Preset、Native Prompt 和 Project Task 权威保存。Evolution 只保存有界 policy、预算、job、评测和发布 intent / receipt，不保存另一份有效配置。
- 新 scope 默认 review。自动授权固定 authenticated owner、原 EvidenceScope + subject、一个 target、原 declaration、allowed field 和完整 base fingerprint。Skill 自动仅 character / project 原局部目录；global / preset / Package 不自动修改。
- 每 owner 必须显式设置有限 request / token 总额；原 scheduler background / maintenance job。持久 reservation 在每次实际 provider send 前完成，含提炼、baseline、candidate、judge、重试；未知 / 取消保留上界，重启不清账。
- 单目标；每 scope 24 小时至多一轮，至多两个候选、一个发布。最小 promotion 集为同入口三个独立场景各三次 paired trial；development 不作为 promotion。
- 保守初始门槛：确定性 authority / guard 检查全部通过；九对人工偏好均不回归、至少六对偏好 candidate；重要行为维度无负差；存在独立评价观察且无分歧；token 与可核对费用不高于 baseline。这是准入条件，不是统计收益声明；S06 原报告仍 ineligible。
- 缺少价格、人工偏好、独立观察、精确配置、回滚版本或受支持的写入边界时保持 awaiting_review / ineligible。不得通过用户手动 apply、上传 JSON 分数或单一同模型 judge 绕过。
- 普通 RP Workspace 必须先补原 SettingsRepo 写排序 / CAS 和下一 run 刷新，才可自动切原局部 binding。Project repair 仅 pristine 原 Task 参数；已经执行的 Task 不热改，也不创建影子 Project-wide 默认配置。Native 共用 Route 不得以角色 / Project 局部授权修改其它主体。
- publication commit-last：保存 exact candidate / report / policy / source refs → durable intent（whole expected base、desired、previous、reservation）→ 原 target authority CAS → receipt → 原下一 run exact 消费证据。崩溃恢复比较 actual；desired 补 receipt，base 重验，第三种状态 conflict。
- pause / disable 阻止新 job / 发布并取消 pending；撤回先 pause，只在 actual whole binding 仍为 candidate 时恢复已校验 previous exact。source / feedback / diagnosis 纠正、撤回、删除及 retention 失效沿依赖阻止发布、清除派生内容并暂停；不撤销已提交 Project / World changeset。
- UI 在原 Workspace / Studio 提供差异、来源、报告、预算、状态、启用、pause、撤回；旧 run 固定已接受版本。新增资源走原 registry / dump / restore / deleteUser；仅本地最小相关验证。

## 验收

三类目标分别在两条入口证明反馈 → 候选 → 隔离比较 → 原 binding 生效 → 下一 run exact 消费；scripted authority 与实际模型收益分开。验证共享预算、取消 / 重启、commit 前后故障、用户修改冲突、来源失效、旧版本缺失、read-only、FS / SQLite 和 generic storage contract。实际未执行的模型、UI、外部数据库或构建不得计通过。


## 已交付契约与部署边界

### 原 authority 与支持矩阵

| 类型 | ordinary RP | Project |
| --- | --- | --- |
| Skill | 原 character Skill 的 SKILL.md body；完整 frontmatter / 支持文件固定 | 原 project Skill 的同一完整文件 authority |
| Prompt | 原用户 Workspace Preset 单一 Agent instructions，character exact binding | 原用户 Library Preset 的 system.style body；原 player role.studio Route 增加有界 projectPromptBindings，只覆盖指定 Project |
| 编排参数 | 原单 owner Director 的 budgets.maxSteps；目标 profile 最大 6 步 | 原尚未开始运行的 planning Task 的 maxRepairRounds；不创建 Project-wide 默认参数 |

RP 只支持非 group 的 rp_chat 和原 subject + `.png` 的 exact character binding，不自动支持 conversation override、Native Session、builtin / global / Package。Workspace 必须为原单 owner bounded Director，并使用指定原 Native Route。Skill 必须已在原 invocation 中 visible + always，且只有目标 Skill；不改 Skill 选择方式。其它目标不得叠加独立 Skill 环境；Prompt / strategy 已选版本与其它独立报告不能叠加。原 Project Prompt bindings 每 Route 最多 32 项，完整 Route CAS 保留其他 Project。已生效的同一物理 authority 必须先撤回才能授权另一轮，跨 RP chat 也不能把上轮派生版本当作新的独立 base。

SettingsRepo 的 save / patch / Host update 共用原 settings write queue；Host 比较完整 library、递增 agentWorkspaceRevision，旧 browser 草稿不能覆盖已发布 Workspace。原 RP 下一次 preparation 从 Host 刷新 library 后接受 profile，已接受 run 保留 clone。这里只支持单 Host writer，不承诺跨进程锁、任意 raw writer 或普通 browser 编辑的通用协作合并。

### 有限持久层与调度

新增 registry kinds `atri_agent_evolution_owner`（handle）和 `atri_agent_evolution`（handle + hash(scope, subject)），走原 FS / SQLite generic backup / restore / deleteUser；无另一个有效配置库。owner ledger 最多 2048 attempts / 1 MiB，显式总额 request 1–2048、tokens 1–10000000，admission 间隔 1000–60000 ms。scope journal 最多 8 jobs / 16 publications / 4 MiB，每轮实际提炼一个候选（契约上限两个）、最多一个 publication。

每个原 NativeTaskScheduler background job 最多一小时 / 120 sends / 1000000 记账 tokens，每个非 judge trial 最多 6 sends。每次 provider send 前先存 reservation，含提炼、baseline、candidate、judge 和 retry；实际 unknown / cancel / missing usage 保留 input + output 上界，超量实报设置 sticky breach，重配置和重启不清账。有限 journals 满时拒绝，不能删历史预算腾额度。重启标记 interrupted，不重发不确定模型工作。

### 隔离评测与晋升

production evaluator 使用固定 Node worker，清理环境、私有 fixture FS / Project / Studio Git / canary，执行原 Director / Studio、compiler / resolver；parent 独占 Secret 与原 provider，worker 只接严格 RPC。固定 loader 处理原 browser library import，不接受模型指定模块、不执行模型代码。S10原交付时Node24本地验证通过、Node20未实测；2026-10-07 M1自动验证已补Node20.20.2固定worker加载与核心三套48项本地通过证据，SQLite使用repository外同版本Node20依赖，详见同一Record。

同入口三个独立 promotion 场景各重复三次，两组共 18 trials、九次单次 blind judge；提炼仅见当前公共 feedback / diagnosis 与声明 base，不见 promotion 输入。report 固定 case / 场景、原全部配置、实际 request / snapshot / usage / ledger charge 和 evaluator source revision，导入 JSON / S06 report 不产生資格。九项 authenticated human preference / 行为维度独立记录；缺项、uncertain、负差、judge 分歧、未实际消费目标、隔离失败、unknown cost 或 budget breach 都不自动发布。至少六对 candidate 胜，其余只能 candidate / tie；重要行为维度均非负。paired trial token / 可核对费用不得高于 baseline。

owner 显式确认价格并绑定 Route / model / connection；缺价格仍能审阅但自动 ineligible。controller 提炼和 judge 的额外成本单独报告，全部实际 sends 计入 job / owner；paired trial 达标不等于包含学习成本的净收益，也不证明实际网关隐藏重试或稳定模型改善。

### 发布、撤回、失效与消费

完整 candidate / report / policy / source / configuration 校验后保存 durable intent；原 target queue 内再次接受 finalizing gate，再执行原 CAS，另写 receipt。接受 finalizing 后允许已授权的有限 CAS 完成；pause 阻止后续工作。重复请求复用 pending intent；一次 job 不追加第二个 publication。提交前后响应丢失 / restart 按 actual base、desired 或第三状态分别重验、补 receipt 或 conflict。

rollback 只在 original actual whole binding 仍匹配时恢复校验 previous；用户修改 binding、运行过的 Task、缺失原版本保留 conflict，不覆盖用户决定、不撤销 Project / World changeset。原下一 run 观察区分历史发布回执与当前有效 binding；Project snapshot 来自原 Host，RP typed completed trace / exact saved output 与版本事件仍标 client_observation。手改原 binding 暂停自动策略；新 correction / failed feedback 要求审阅。

Experience correction / withdrawal / diagnosis delete / source delete / retention 先 durable pause、失效 job 与 report、取消原 pending scheduler，再异步 rollback / 清理原未选候选和 history，避免队列锁反转。已被用户继续选择或缺失 authority 的内容保留显式 garbage / conflict；清理只留 hash receipt 与累计预算，不保留已删除派生正文。read-only inspect 不写入。

原 Workspace Run 与 Studio Task 挂载同一个有界面板：feedback / hypothesis 来源、预算、target declaration、默认 review / 显式 auto、候选 diff、盲测场景与人工偏好、成本 / 状态、精确 review / publish、pause / disable / rollback、删除 / retention / export。Studio 可 Prepare without running，默认仍沿原立即执行流程。无无限 polling。

## 本阶段实际验证与 M1 剩余验收

- 12 relevant suites / **233 distinct local tests**：新 S10 三套 48（最终 repository / service 41、consumer 6、HTTP 1）；既有相关九套 185。重复运行不累加。最后只复查 publication 故障恢复；完整命令与失败归因见同一 Record。
- FS / SQLite 的六类 target authority 闭环、durable budget / unknown / breach、取消 / 重启 / 请求重试、base / 用户修改 / 来源失效 / read-only、原 generic dump / restore / deleteUser。实际固定 worker 分别执行 RP Skill 与 Project Prompt 的原消费者 + compiler + fake provider；其余原 exact Workspace / Task 消费和原下一次 Project / Studio snapshot 分别验证。
- Chromium 390px 检查共享 production pane 在两个入口的 feedback、预算、默认 review、start、pause、删除与文字转义；这是 fixture API 的共享面板检查，不称完整应用 E2E。
- 44 个其它触及 JS / mjs ESLint 通过；settings.js 在屏蔽一个已存在 rule 后通过，该文件四项原 no-raw-fs-in-endpoint 错误与 HEAD 基线一致。product / staged diff、worker module check 通过。
- 原 SettingsRepo MySQL / Postgres 的 12 项首次尝试因外部本地数据库不可用失败，最后限定 FS / SQLite 12 passed、外部 12 skipped。没有启动外部 DB，也不计其通过。
- 无新真实模型请求；未读取或更新 S06 私有 config / ledger / artifacts，原 110 requests / 300464 记账 tokens 与 ineligible 结论保持。无 full test / build / Android / 真机 / CI。

S10 工程链路已交付，**M1 独立案例的真实质量 / 成本改善尚未满足退出门槛**。下一 checkpoint 只复核 M1 验收与集成前置条件；如需补真实比较，先冻结双入口的有限验证范围、人工观察与共享累计预算，恢复原 S06 ledger / rate checkpoint，不能以本轮 fake provider 代替。main 未合并，不进入 S11 / G。

### 2026-10-07 M1 自动验证补充

用户授权agent代劳验证；固定loader / worker及相关三套48项已在Node20.20.2通过。首次16项SQLite失败为共享Node24二进制ABI不匹配，在临时目录安装同版本Node20依赖后仅重跑这16项全部通过，未修改产品源码 / 共享依赖。其余32项已通过，不重复累计；fake provider与合成人工标签仍仅为工程证据。

按已有local Git keys核对发现原S06 ledger / limits / artifacts目录与lock / rate checkpoint缺失，用户答复“无迁移”；connection仍存在。未新建或重置账本，未发真实模型请求。历史累计无法实时核对，真实改善 / 独立human labels与两入口真实闭环仍待验收，M1不集成。后续先明确原累计账目恢复处理与可核对有限验证预算；只在本地执行最小相关验证，不进入S11 / G。

### 当前M1工程验收与生产gate

2026-10-07用户批准M1工程验收调整，见 [m1-acceptance](m1-acceptance.md)。本模块的九对独立human labels / price等准入仍是production automatic publication要求；工程评测采用独立模型observation并保持human未观测，不输入human字段，不改本模块生产授权。账本丢失不伪造旧entries，沿已批准保守结转与新有限额度执行。

### 原 evaluator 的领域契约补充（F1最小实现）

2026-10-09 U13确认先明确原反馈/评价契约，再各一个双域试点。新QualityProfile、case provenance/lineage、diagnosis路由与versioned consumer唯一归属 [m1-feedback-evaluation](m1-feedback-evaluation.md)，不建立第二evaluator/targets。原固定worker和secret边界、原局部writer、publication/消费/rollback和production human/price/owner gates保持；新profile不会自动使旧报告合格。F1最小registry、Report v2及原gate/worker消费者已实现并做本地验证，旧case明确historical_synthetic/not_established且不获新资格。F2来源/校准和F3真实试验未开始，实际结果见同一Record。
