# 调研证据与待验证问题

## 证据范围

历史首轮源码基线为 `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`；原有行号和调查时的待验证结论保留其时间范围。2026-10-22 已核对远端 `main@a9a914c66141daaf7ab9ae26119a506444d73698` 与 package `914c624c9`（规则交付提交 `38007d02d`）。be.2 实际验证以 [Record](../../../records/package/doupo-living-world.md) 的 BE2–BE6 为准；v0.13含完整调用链阅读和纯规则内存试算，v0.16仅复核相关源码及方案依赖，没有新增运行测试、真实宿主、模型或浏览器证据。

当前人物与调度缺口见 [v0.13 代码现状](#v013-代码现状与边界)，外部依据见 [世界自主性研究](#v013-世界自主性的一手研究) 和 [连续因果与社会认知](#v014-连续因果与社会认知)。旧文中的 manifest 目标限制和确定性 Bridge 缺口已由后续框架提交解决；新方案不因复用这些能力而被视为已实现，也不以声明上限推断容量。

NPC修炼、NPC互战和物品损耗的最新源码核对见 [v0.15能力边界](#v015-npc修炼战斗与物品损耗的代码边界)；完整玩家战斗按D33留待后续独立大修改。

身体/伤势、可见详情与构建声明的对应缺口见 [v0.16承载核对](#v016-状态后果与可见表现的承载核对)，全方案实施对应归 [implementation-readiness.md](implementation-readiness.md)。

2026-10-20 续接核实：最新 `origin/docs@5e215cbef` 包含指定 `5e215cbe`；fetch 后 `origin/main` 与上述源码基线一致。按用户追加要求，本机 main 已快进到同一提交且干净，其它工作树改动保留。本轮仅重读相关源码，没有新增游戏运行证据。

## 设定资料口径 — 第五轮补充

用户已明确允许 Wiki 与百科用于游戏机制设定调研，决定见 [D16](decisions.md#d16--wiki-与百科用于机制调研)。使用其汇总境界、功法、斗技、炼药、异火、势力与地理等结构化资料，并保留具体页面来源。小说优先规则仍生效；对版本、术语或数值冲突进行针对性核对，不因资料属于 Wiki/百科而排除。

Wiki/百科中的既有设定、游戏为可玩性设计的公式与规则、实际游玩生成的历史分别记录。后续调查从机制结构与资格条件开始，不将未知倍率、寿元或伤害公式擅自归为小说规定。

## Atria 可复用能力 — 首轮历史基线

| 能力 | 主要证据与用途 |
| --- | --- |
| 固定 Package 版本和内容身份 | `src/native/session-core.js:167,190`；将设定、规则、资源和前端作为可识别版本交付 |
| 权威事务与 computation | `src/native/authority-transaction.js:238,259,294`；validator、计算、seeded resolution、typed effects 与 invariant 支持结算后再表达 |
| 世界时钟和追赶 | `src/native/simulation-authority.js:31-86`；按 tick、priority、job id 处理，先确定性追赶，再接纳相关后台思考 |
| NPC 个人所知 | `public/shared/native-subject-contract.js:14-22`、`public/shared/native-information-runtime.js:75-82`；Subject 动态绑定视图，支持个人信念和参与者信息隔离 |
| 长期记忆与证据检索 | `src/native/memory-authority.js:115`；记忆检索不应取代库存、境界、位置等权威状态 |
| 原生前端 | `src/native/authoring-examples/frontend-v3/README.md`；支持 `.aui`、Controller、Canvas、媒体和类型化 Host Bridge |
| Session 原子发布与分支 | `src/native/repositories/session-repo.js:579-670`、`src/native/session-core.js:989`；revision/CAS、幂等收据、不可变状态与存档恢复分支 |
| 本地场景验证 | `src/native/studio-scenario.js:13,21,106`；支持 clock/task/turn/checkpoint/restore/assert，但 recorded/mock 模型不能证明真实生成质量 |

World、Knowledge、Information、Cognition、Memory 与事务具有不同职责。静态小说设定、当前事实、人物所知与生成表达不能混为一份任意可改写文本。

## 自由文字与参数化行动

第三轮补查确认：resolver 从已暴露的事务目录选择一个事务并填写 schema 参数。可以候选建模为少量通用动作，以人物、招式和物品 ID 及具体参数区分行为，无需给每一句话或每一招单独声明事务。validator、computation、seeded resolution 与 typed effects 决定实际后果，叙事再表达结果。

依据：`src/native/authority-turn.js:25,29,36,47`、`public/scripts/native/experience/logic/transactions.js:145,163,191`、`src/native/authority-transaction.js:247,259,269`。

当前一次解析选择一个已声明事务；组合行动需要设计组合参数或拆成步骤。自由文字不能直接创建新规则、命令或任意状态修改。社交话术、临场战术和谈价如何影响结果，仍需包内设计可结算的规则；含糊意图的澄清也需明确。此结论不预设战斗节奏，不构成任意自然语言动作均可执行的承诺。

## 2D 空间呈现 — 第四轮补查

现有 Canvas、`.aui`、Controller 与类型化 Host Bridge 可以作为俯视场景、横向/剖面场景或插画加对象交互的实现基础。地块、分层背景、人物与路径可由 Canvas 表现，功能界面与对象选择由 `.aui` 和 Controller 配合；这不是已完成的游戏移动或战斗系统。

依据：`public/scripts/native/frontend/canvas.js:3`、`public/shared/native-frontend-script.js:43`、`public/scripts/native/frontend/bridge.js:65`。

场所、坐标、路径、出入口、遮挡、交互距离和行动耗时仍须游戏包设计。点击、按钮和文字进入相同的类型化行动与结算路径，实际位置和时间以权威结果为准；浏览器动画仅表现已确定的移动或结果。现有 Canvas 单边 2048px、每批 2048 条绘制命令的约束已可读，密集场景、命中检测、缩放、移动取消和重复输入尚未做原型或性能验证。

## 存档恢复边界 — 第五轮补查

原生恢复读取存档的精确 Revision，以历史 Timeline、states、Knowledge 绑定为基础发布新 Branch，并保留原分支。World、Clock、Domain、任务和个人记忆若由对应 Session 状态持有，则具有快照恢复基础；认知证据还需分支重绑定，不能简单当作逐字节倒退。

依据：`src/native/session-core.js:990,412,420,512,763`、`src/native/cognition-authority.js:10`、`src/native/memory-authority.js:150,280`。

NativeMemoryAuthority 的图与来源记录也进入 Session.states，但跨 Session 的长期 MemoryGraph、外部存储或 Continuity/Realm 账本不因此自动回滚。第五轮当时尚未贯通家庭与迟到任务；be.2 的后续恢复样本见 Record。新增目标、组织项目、货运和在途消息仍需纳入恢复边界，不能因旧样本已通过就推定新结构自动通过。

## NPC 关系与动态人物 — 第六轮补查

关系可以由个人所知与事件评价驱动，双方不必拥有相同评价。现有默认维度为 trust、affinity、respect、tension；评价记录带人物、对象、维度、来源和旧状态证据。恩情、失约、救援、隐瞒或背叛等具体事件、承诺及它们如何影响同行、援助、消息和竞争，需要游戏包定义，不能把现有记录结构当作完整社会生活系统。

依据：`public/shared/native-appraisal-contract.js:33-39`、`src/native/appraisal-authority.js:71-103`、`src/native/cognition-authority.js:109`。

第六轮历史基线中，`src/native/appraisal-authority.js:86-87` 要求 target 出现在 `base.manifest.actors`，因此动态人物需要原型验证。该限制后来已在斗破接纳扩展中复现并修补，a9 主线复用 `hasPerspectiveIdentity` 接纳真实 Subject，保留未知身份拒绝和来源检查；实际结果见 Record。它不再是当前未修复阻碍。

关系维度按人物与目标独立存储，规模验证应同时考虑接触图和记录数量。建议按真实接触与已发生关系建立稀疏数据，而非给所有人物两两预建关系；具体保留与聚合策略须维持来源、个人视角和长期后果。

## 会影响本项目的边界

- `public/shared/native-simulation-contract.js:9,35-38`：最多 16 job 声明模板；一次 simulation preparation 最多 16 transaction occurrences；后台 deliberation 最多 1。不是 NPC 总数上限。
- `src/native/simulation-authority.js:40,44,59`：世界追赶会 clone states，逐 occurrence 筛选 job；有 pending simulation task 时不再接纳新项。大状态、长跳时和人物竞争需要实际测量。
- `public/shared/native-lifecycle-contract.js:88-92,273,279`：最多 32 scopes/32 domains，单 Domain retention 最多 4096 records/1 MiB logical bytes。保护中的 active/pinned/referenced 数据不能为腾空间随意删除。
- `public/shared/native-information-contract.js:9`、`public/shared/native-information-runtime.js:217-224`：Information application sources 所引用记录累计受 4096 扫描预算约束；同 Domain 被多 source 引用时当前循环重复计数。不是全 Session 人口总量上限，也不能仅以多 Domain 绕过。
- `public/shared/native-information-runtime.js:63-78`：投影先累计源 records，再按人物身份过滤；长期个人知识增长需要关注扫描成本。
- `public/shared/native-subject-contract.js:14-32`：最多 16 个视图定义包含个人视图模板，Subject definitions 上限 4096。均不是已测人物性能承诺。
- `src/native/package-computation.js:31-78`、`public/shared/native-frontend-script.js:3-5`：computation 使用受限 QuickJS、同步 JSON 输出，单 stage 当前为 40ms CPU、8 MiB heap、128 KiB message；不能把它当作任意长时后台进程。
- `public/shared/native-lifetime-contract.js:37-42`、`src/native/lifetime-authority.js:181-199,268,294`：可选内建 lifetimes 使用统一年龄与有限长生 route。可省略该 policy，尝试用现有 Domain/Clock/Simulation/computation 表达斗气境界和寿元；需做贯通验证，不能直接认定必须修改产品。

这些是约束或风险，尚未复现本项目专属缺陷。

## 小说资料入口 — 第三轮补充

- [起点中文原作作品页](https://www.qidian.com/book/1209977/)及[目录页](https://www.qidian.com/book/1209977/catalog/)是中文设定核对的优先入口。本次工具未提取到可读内容；旧版入口返回 403，移动入口读取失败。它们只说明本次访问结果，不能推断普通用户无法访问，也不能声称已读取中文目录或免费正文。
- [WebNovel 官方英文译本介绍](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205)、[章节目录](https://www.webnovel.com/book/8093990805004205/catalog)与[第一章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/the-fallen-genius_21770745583562580)本次可直接读取。可用于后续定位开篇人物、地区和事件的章节证据；中文专名与精确措辞仍优先对照中文原作。
- 目录可读不等于全部章节免费，本轮未测试付费边界。后续以章节定位核实相对时间，不从简介、评论、平台问答或同人作品补齐缺失年龄、绝对年份或设定。

当前只核实可用入口，尚未建立完整小说设定库或核实各候选开局的状态表。

### 开篇已有状态的初步证据 — 第四轮

本轮进一步读取官方译本前三章。下列为对应章节的初步事实，中文专名暂用，仍待中文原作对照；它们不冻结玩家开局地点、出身或与原著人物的绑定。

| 可核实的已有状态 | 直接章节来源 |
| --- | --- |
| 第一章在 Wutan City 的家族测试中，Xiao Yan 当次为 Dou Zhi Qi 第三段 | [第一章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/the-fallen-genius_21770745583562580) |
| Xiao Xuner 当次为第九段，并继续支持受到冷遇的 Xiao Yan；只确定当时关系 | [第一章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/the-fallen-genius_21770745583562580) |
| Xiao Zhan 是 Xiao Yan 的父亲与家族族长；家族中还有参与权力与决策的长老 | [第二章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/dou-qi-continent_21770727598387027)、[第三章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/guest_21727141209755650) |
| 家族考核与成年礼会影响成员继续修炼或被分配至家族产业事务的机会 | [第二章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/dou-qi-continent_21770727598387027) |
| Xiao Yan 持有亡母留下的古旧黑戒；该阶段不能仅凭戒指异象确定完整机制 | [第二章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/dou-qi-continent_21770727598387027) |

官方译本相邻章节对 Xiao Zhan 境界的称谓存在待核对处，本轮不固化其境界数值。绝对年份、精确开局切点、全体人物状态、地区地理与后续事件机制仍未完成核实。

### 开篇成长原则的直接证据 — 第五轮

[官方译本第二章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/dou-qi-continent_21770727598387027)将境界、功法与斗技分开讨论，并描述功法品阶和传承渠道对实力的影响。它支持将三者分别建模，但未给出可直接照搬的通用伤害、修炼速度或跨境界胜率公式。

## Wiki 与百科机制结构 — 第五轮首批资料

以下是本轮从具体页面提取的资料结构。Wiki 中按小说官方译本整理的条目与中文小说百科均可使用；页面涵盖的时期需要保留。初始世界取开篇附近的状态，后续由已确认的开放沙盒方向演化。

| 机制或世界结构 | 本轮可用资料摘要 | 页面来源 |
| --- | --- | --- |
| 境界与突破 | 斗之气至斗帝的境界序列、境界内进度和特殊过渡分开；凝聚气旋、液化斗气、形成斗晶可作为不同突破状态 | [Cultivation](https://battle-through-the-heavens.fandom.com/wiki/Cultivation) |
| 功法 | 功法品阶与人物境界独立；属性、斗气容量与质量、吸收运转和换修条件可分别整理 | [Qi Methods](https://battle-through-the-heavens.fandom.com/wiki/Qi_Methods) |
| 斗技 | 攻击、防御、身法、飞行具有不同用途；得到秘籍、达到条件和真正掌握须分开 | [Dou Techniques](https://battle-through-the-heavens.fandom.com/wiki/Dou_Techniques) |
| 炼药资格与投入 | 火属性夹带木属性、灵魂感知条件，以及材料、火种与操控能力形成炼药条件；火焰可有不同来源 | [炼药师](https://bkso.baidu.com/item/%E7%82%BC%E8%8D%AF%E5%B8%88/10823622)、[Alchemist](https://battle-through-the-heavens.fandom.com/wiki/Alchemist) |
| 丹药使用条件 | 丹药有对应效果、适用境界和服用限制；斗灵丹、青冥寿丹等条目可用于后续建立有条件的成长或寿元规则 | [炼药师及丹药列表](https://bkso.baidu.com/item/%E7%82%BC%E8%8D%AF%E5%B8%88/10823622) |
| 异火 | 异火种类、排名、特殊能力、成长状态、持有与炼化条件应分开；异火榜记载 23 种不自动决定每种的实例数量 | [异火](https://bkso.baidu.com/item/%E5%BC%82%E7%81%AB/7448143)、[Heavenly Flames](https://battle-through-the-heavens.fandom.com/wiki/Heavenly_Flames) |
| 特殊成长传承 | 焚诀随吞噬异火演化，提供特殊路线；获取传承、满足条件与成功炼化为不同过程 | [Flame Mantra](https://battle-through-the-heavens.fandom.com/wiki/Flame_Mantra) |
| 地理与组织 | 乌坦城、加玛帝国、西北地域和斗气大陆具有地理层级；皇室、宗门、家族、商业与职业组织并存 | [Jia Ma Empire](https://battle-through-the-heavens.fandom.com/wiki/Jia_Ma_Empire) |
| 商业与资源渠道 | 米特尔拍卖体系联系丹药出售、材料采购与家族关系，可支撑人物资源取得的渠道建模 | [Ya Fei](https://battle-through-the-heavens.fandom.com/wiki/Ya_Fei) |
| 学院与地区资源 | 迦南学院位于黑角域，具有跨区域招生、内外院与传承准入，以及与特殊资源相关的修炼环境 | [Jia Nan Academy](https://battle-through-the-heavens.fandom.com/wiki/Jia_Nan_Academy) |

### 建模推断与具体待核对项

- 由以上资料推导的游戏结构可包括修炼进度、功法运行条件、技法熟练程度、师承与组织准入、配方与库存、火种、灵魂条件、丹药服用历史、资源持有与传承转移。具体状态与公式由游戏方案设计，不把推导倍率写成小说原定数值。
- 人物和组织条目可能同时列出开篇、后期与终局状态；资料整理记录时期或适用条件，不能把后期修为、死亡、势力解散或后来成立的组织无条件写入开局。
- 功法换修概括的例外、斗技各阶细分、学院入学门槛和各境界寿元，在具体采用时针对条目核实；本轮不补齐尚未确定的寿元表与成功率。
- 本轮 Fandom 页面通过检索工具可取得正文或较完整摘录，部分页面直接打开受限；中文百科的炼药师与异火页面可直接读取。记录的是实际取得的资料范围，尚未遍历完整设定库。

### 首批地域的资料依据 — 第六轮

以下是已读 Wiki 页面的具体线索，用于提出范围候选，不代表地域或场所数量已获批准：

| 地点 | 可用于内容设计的事实摘要 | 来源 |
| --- | --- | --- |
| 乌坦城 | 开篇属于加玛帝国，萧、加列、奥巴三族存在商业竞争，坊市与米特尔拍卖分号可承载日常活动和资源消息 | [Wu Tan City](https://battle-through-the-heavens.fandom.com/wiki/Wu_Tan_City) |
| 青山镇 | 与魔兽山脉邻近，佣兵活动、结伴与相关商铺可连接生活消息和入山探索 | [Qingshan Town](https://battle-through-the-heavens.fandom.com/wiki/Qingshan_Town) |
| 魔兽山脉 | 存在魔兽与稀有药材，外围与深处可体现风险差异 | [Magic Beast Mountain Range](https://battle-through-the-heavens.fandom.com/wiki/Magic_Beast_Mountain_Range) |

开发推导可以为乌坦城生活场所、青山镇佣兵据点与山脉一处外围探索地的串联。已取得青山镇与山脉邻近的依据；乌坦城至青山镇的确切路线、距离与耗时本轮不补造。条目混列的后期覆灭、新组织或特定人物后来状态，仍需按开篇时点整理。

## 《觅长生》的一手启发

- [官方商店](https://store.steampowered.com/app/1189490/?l=schinese)：修炼的时间成本、寿元与突破、构筑、炼制和交易，启发成长与资源系统联动。
- [2021 年 NPC 更新官方公告](https://store.steampowered.com/news/posts/?appids=1189490&enddate=1620816900)：人物自主采集、交易、修炼等活动，以及使用玩家出售的装备，启发持久物品和跨系统后果。
- [2022 年宗门更新官方公告](https://store.steampowered.com/news/posts/?appids=1189490&enddate=1651821009&feed=steam_community_announcements)：俸禄、任务义务、声望和职位形成循环，启发家族与势力身份。
- 历史公告记载过闭关时长调整与 NPC 结算问题，启发长时追赶需要验证；不把历史限制或故障描述成现版本事实。
- 官方介绍不足以证明完整供需经济、公开 NPC 调度算法或无限人口模拟。续作开发中的机制不归入一代现有能力。

## 生成式人物研究

[Generative Agents 论文](https://arxiv.org/abs/2304.03442)与[作者实现](https://github.com/joonspk-research/generative_agents)提供记忆、反思、规划和信息传播的参考。论文实验为小型社会与较短时间窗口，不能据此承诺大陆级长期世界的质量或当前模型成本。

本项目可借鉴其相关记忆检索、计划与事件反应方式，但具体日常结算、经济守恒和历史持续性需要由游戏规则与现有 Atria 权威承载。它们是设计候选，不是论文证明的本项目实现。

## 后续验证清单

1. 自主 NPC 的端到端闭环：个人所知 → 合法计划/意图 → 资源与位置约束 → 规则结算 → 个人经历与新状态。
2. 长时追赶：逐步与较大步长推进中的资源、生死、事件先后、到期事务和可恢复性；明确需要何种随机等价性。
3. 容量与成本：目标记录规模下的投影扫描、状态 clone、catch-up 延迟、存储增长、模型调用与叙事等待。先确定目标设备和体验目标，再测量，不预设调用额度。
4. 历史改写：关键人物死亡、机缘被夺、势力解体后的后续行为不复原原著结果。
5. 叙事与秘密：规则状态安全不等于自由文字绝不胡编或泄密；结构化结果与实际模型表现分别验证。
6. 时代持续性：新人物和新组织有来源，遗物、传承、职位和关系具有连续身份；人口精度变化不重置已发生事实。
7. 动态人物关系：静态 Actor 与后续 Subject 的目标接纳、来源授权、双方不同所知、关系对实际行动的影响与读档一致性。

验证结果决定是否有实际产品缺陷、局部优化需求或应调整内容组织。不得预先承诺无限 NPC、全量逐 tick 思考、固定工期或未经测量的性能上限。

## D4 验证安排与修补边界

历史 D4 验证样本为 V1–V7；v0.13 新增 V8–V10，均集中在 [制作稿](production-plan.md#框架验证与必要修补)，负载与性能候选见 [运行模块](content-and-runtime.md#制作负载与性能目标)。本节前两项记录 D4 当时的证据，不覆盖已完成的 be.2 验证。

- 动态关系（D4历史）：当时 manifest Actor 目标检查仍存在；后来已沿 Information 的人物身份路径补齐，当前依据见下文。
- 世界恢复（D4历史）：当时仅阅读 SavePoint/restore；后来 be.2 已有家庭出生/恢复与迟到任务样本，新目标和活动结构仍须扩展验证。
- 长时推进：job 模板与单次 steps 是工作预算，游戏应尽量用复用模板及有界事件推进；长跳时在多批提交之间仍需保持因果、可恢复与进度反馈。若预算确实阻断必要事件吞吐，再据测量调整既有能力，而非先增加声明上限。
- 长期状态：Information 按 source 计入记录数并在遍历时校验；稀疏关系、必要事件摘要与合理保留有助于规模，但不能通过删活跃证据、婚姻/亲属或换 Domain 掩盖预算问题。索引、投影、clone 与保留策略是否需改，以 V4 的真实增长数据判断。
- 运行身份：P0 要核实正在连接的实例、源码构建和 Package 版本；本轮没有建立该运行身份链，没有调用真实 Provider 或使用 Atria 工具报告游戏验证。

验证实现与专用样本只在本地保留；提交 Record 保存环境中立的结果、实际版本与限制，不提交临时请求/响应、凭证或专用测试资产。普通实现选择不产生新审批，修补范围遵循 D06 与用户正式启动边界。

v0.8 补充：用户确认的 NPC 人口上限是游戏世界规则，现有 Subject definitions、Information 扫描与 Simulation 工作预算属于不同技术约束，不能直接把其中任一数字当作人口上限。V7 需验证新增/死亡/迁徙的计数语义、并发接纳、事件平衡的长期效果，以及人口受限后历史和关系记录仍持续增长的负载；本轮未执行这些运行样本。

## v0.13 代码现状与边界

以下行号相对 package `914c624c9`，是完整 NPC 调用链调查的结果；文档/README 的能力措辞不能代替代码执行路径。

| 主题 | 源码证据 | 当前含义 |
| --- | --- | --- |
| 人物与人格 | `source/rules/state.js:12–19`、`source/content/catalog.js:37–61` | 背景初始存入 plan，随后可被通用活动覆写；没有结构化人格/价值/持续目标记录 |
| 生活与成长 | `source/rules/engine.js:67–131` | 按经过日数结算收入、进食、经验、恢复；有实际照护、交往、家庭与迁居分支，主要是固定条件规则 |
| 月度与事件 | `engine.js:129–188,286–299` | 每人错峰滚动30日，旅行到达/死亡等提前；一次最多处理一位到期居民，continue清理，非统一月度批处理 |
| 旅行与竞争 | `engine.js:94–100,127–130,313–318` | NPC采药24h/迁居3日为专用规则，未走玩家ROUTES；采到药后的“准备返镇”无返程活动；hasClue由角色类型判断 |
| 生活补给 | `engine.js:67–78,118–123` | 金币结算餐食不补库存干粮；无自主买粮分支，却有出行/成家的干粮条件，存在自然闭环断点 |
| 模型回应 | `tools/build.mjs:34,53,60–70`、`engine.js:194–215` | person.reply仅为收到chat的人物生成choice/text；acknowledge主要记录对话/少量亲近，follow/help不自动创建真实活动 |
| 玩家多步计划 | `engine.js:403–415` | w.plan是玩家至多四步操作队列；planRelations是关系读取键准备，均非NPC长期规划器 |
| 可见与保存 | `source/rules/projection.js:3–15`、build的Native Domain/History声明 | 同地状态和本人旧观察分开；新目标/组织/货运/在途信息仍需新增权威数据并验证完整恢复 |

纯规则内存试算：初始人物、占位actor和全量关系输入下，3日经历39次compute/continue，观察到两人到药谷、薄尧得赤叶和苏晚禾实际照护。另一300日样本仅给玩家充足金币以隔离玩家生存干扰，418次计算后29名NPC、无新家庭；部分人物关系达标但干粮为0，竞争者仍留药谷。这些是断点的局部证据，不验证真实Subject授权、宿主开销、模型质量或所有开局。

框架已核实为 a9，而非本机旧 main：

- a9 直接继承 6e44 接纳扩展；相对 f9 主线为两提交、11文件。动态 Subject 评价、有界集合/ID筛选、computed引用、真实anchor与invariant输入缩减已集成。[固定提交](https://github.com/ZZZdragondYNGPHX/Atria/commit/a9a914c66141daaf7ab9ae26119a506444d73698)
- `src/native/frontend/host-bridge.js:169–179`、`src/native/session-core.js:711–741` 直接提交安装包声明的确定性动作，复用CAS/幂等/分支/保存，不运行resolver/narrator；普通act仍经生成宿主。package的continue/cancel等已使用该声明。
- `src/native/simulation-authority.js:43–93` 是游戏世界时钟调度；先处理到期确定性job，再有限接纳模型任务。任务队列的并发scheduler不是月度生活规则。
- hot/warm/cold主要影响模型任务接纳，不自动提供NPC近中远完整模拟层次。privateReads仍先按原记录数计费并遍历，再筛选，返回有界不等于扫描成本已消失。

be.2既有50年纯规则、96人QuickJS分页、真实宿主家庭/恢复、Bridge与模型样本各有不同边界，统一保留在Record。本轮不重用这些数字证明新世界循环通过，不将源码已集成等同于当前运行实例身份已确认。

## v0.13 世界自主性的一手研究

以下是设计依据；最后一列是本项目推导，尚未实现，也不把他作规模当作本项目容量。

| 方法或案例 | 核实的一手资料 | 对本项目的候选应用与边界 |
| --- | --- | --- |
| Utility与行动惯性 | [Graham原作者章节](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf)讨论性格/处境改变效用，以及相近评分造成摇摆、承诺与冷却的处理 | 人格影响真实取舍，保留长期目标与当前承诺；评分不能单独替代行动链 |
| GOAP与执行 | [Orkin GDC原论文镜像](https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf)以条件/效果/代价规划，明确移动等效果需要执行时间，失败知识支持重规划 | 有限近期计划连接真实活动，受阻后改策；不承诺每人每步全量搜索 |
| 离散事件与区间计算 | [Graham事件模拟章节](https://www.gameaipro.com/GameAIProOnlineEdition2021/GameAIProOnlineEdition2021_Chapter02_Efficient_Event_Based_Simulations.pdf)区分时间切片与减少总工作；[SimPy官方](https://simpy.readthedocs.io/en/latest/topical_guides/time_and_scheduling.html)解释按时刻和稳定事件ID排序 | 月内事件先后结算，稳定活动按阈值唤醒；不因月底批量执行省略中途因果 |
| 生成式人物与裁定分工 | [Generative Agents](https://arxiv.org/abs/2304.03442)研究记忆、反思和规划；[Concordia官方](https://github.com/google-deepmind/concordia)以agent提出行动、环境侧判断效果 | 模型用于有限主观判断和表达，物品/位置/生死由既有规则裁定；小型实验不能证明大陆长期规模 |
| 真实位置与旅行 | [CK3官方旅行开发日志](https://store.steampowered.com/news/posts/?appids=1158310&enddate=1679405424&feed=steam_community_announcements)明确AI也赴活动旅行，速度、安全、地区危险影响旅程 | 出行占用时间和交互，路线变化可使计划失效；该日志不能证明所有日常均被完整模拟 |
| 地理、文明与历史 | [Bay12官方DF Talk 4](https://www.bay12games.com/media/df_talk_4_transcript.html)描述地理/生物群系影响文明落点和历史，并提醒回填未发生往事会造成不一致 | 地区条件先约束生计与组织，展示和回忆引用已有历史；历史访谈中未来构想不算现行功能 |
| 生态和资源循环的失败教训 | [UO原首席设计师澄清](https://www.raphkoster.com/games/snippets/did-players-destroy-the-uo-ecology/)与[资源系统原文](https://www.raphkoster.com/2006/06/04/uos-resource-system-part-2/)指出搜索/寻路成本及封闭资源池被制品囤积锁死的问题 | 再生、有限存量、外部来源和加工分开；地区生态可聚合，不能把玩家仓库当全世界再生的唯一资源银行 |
| 组织按当前处境经营 | [Stellaris官方开发日志227](https://store.steampowered.com/news/posts/?appids=281990&enddate=1635418905&feed=steam_community_announcements)说明阶段模板不足，改用依条件启停的子计划，并处理基础收入赤字连锁 | 受损组织先恢复生活/维护与供给，再扩张；不据此声称该作所有货物都实体运输 |
| 叙事导演边界 | [RimWorld官网](https://rimworldgame.com/)明确导演为玩家调度事件牌和节奏 | 可借鉴展示与节奏，但本项目事件须有条件和来源；不能把随机袭击倒写成此前已经筹划执行的组织历史 |

由这些材料推导：先用首批三地的一条完整供需/旅行/社会循环启动世界；事件区分自然过程、主体行动及明确建模的外部冲击；叙事只解释与传播实际结果。健康运行可以长期平稳，后续灾变或争斗必须有成因，不用新闻数量衡量世界自主性。

## v0.14 连续因果与社会认知

本轮进一步核对be.2的 `engine.js:20–27,33–43`：个人事件按人物/对象/种类生成ID，同类新消息覆盖该键的旧文字；评价有方向、维度和引用来源，但不能因此推断已经保存完整的长期动机链。`state.js` 的亲属字段、`projection.js:3–15` 的同地观察/本人旧档案，也不等于每个角色都拥有可使用的第三方社会网络认知。

当前模型view和规则尚缺通用相遇感知、身份/物品的有限识别、NPC主动追踪/抢劫/控制/逃脱、主观归因生成持续目标，以及旅行中机会性替换/恢复活动。新增样本需要明确扩展这些能力并核实schema/预算/来源，不能用现有一次对话或玩家attack分支声称已经支持整条链。

以下三篇一手论文提供局部设计依据，不证明本项目的长链能够自然发生或长期高效运行：

| 来源 | 已核实内容 | 可借鉴与不能直接沿用的部分 |
| --- | --- | --- |
| [Evans、Short：Versu，2014](https://cs.uky.edu/~sgware/reading/papers/evans2014versu.pdf) | 角色能对他人行动作主观解释；评价有方向、多维且保存理由，情绪带对象和触发事件，反应可继续引发反应 | 借鉴事件到解释/情绪/行动的联系；论文决策重短期广度、不看长期后果，社会实践状态共享且不表达嵌套信念，不能直接当作完整有限认知与长期规划 |
| [McCoy等：Comme il Faut，AIIDE 2011](https://mtreanor.com/publications/CiF-AIIDE2011.pdf) | 将性格、关系、状态、社会网络和社会事实历史用于意愿形成、接受/拒绝、效果及规则级联，规则可引用第三人 | 借鉴社会行动对后续关系与第三者合作的影响；其共享社会事实库不等于每人已获知，不自动解决旅行、物资或长期世界 |
| [Riedl、Young：Narrative Planning，JAIR 2010](https://faculty.cc.gatech.edu/~riedl/pubs/jair.pdf) | 区分作者目标与角色目标，以承诺框架连接动机与行动；讨论搜索开销及原版假定意图最终成功的局限 | 借鉴每段行动应有先前动机和来源；它从作者视角构造结局，不能当作本项目为达成固定故事而调度全世界的总控 |

项目推导：世界事件、各人获得的观察、主观解释、持续动机和当前计划分别表达；重要未解决事项保留可回溯依据，普通重复生活可摘要。关系图谱记录内容与来源，认知规则决定是否采信、如何用于行动；不由图数据库或单次生成自动赋予智能。月内相遇及消息可唤醒有关计划，长期目标与旧活动允许暂缓、失败或恢复，不每帧重做整段故事规划。

验证先检查动作和信息边界，再用合理起点检验可贯通/可中断的自主链条，最后观察自然运行的发生条件。固定结果的脚本重演、全知读取亲属、事后补写幕后或为反派保命，都不能算连续自主因果通过。本轮没有新增运行测试、模型调用或性能结论。

## v0.15 NPC修炼、战斗与物品损耗的代码边界

包源仍为914c624c9（规则交付38007d02d）。本轮核对全部规则入口、人物/物品schema、初始内容及相关调用，不新增运行测试。

| 能力 | 代码证据 | 准确结论 |
| --- | --- | --- |
| NPC自动积累修为 | `source/rules/engine.js:80–92` | role非child每日获得xp，cultivator为4、其它为1；这不是严格成年条件，未成年但role=cultivator也会积累。xp达rank×30、rank<19且injury<20时，每次结算升一级；qi直接重置100 |
| NPC自主修炼/学习 | `engine.js:94–104,348–359`、`source/rules/state.js:12–23` | NPC主要是通用计划文案与被动积累；learn/breakthrough/refine分支操作玩家p。初始NPC可有basic/refining/formula技能，但不等于已自主选择功法、学习、闭关、准备突破或炼药 |
| NPC/NPC战斗 | `engine.js:380–398`及scheduleNpc全部分支 | 无独立NPC互战入口或后台双方交锋过程；现有战斗修改player和enemy，不能用于证明NPC之间已能战斗 |
| 已有玩家交锋 | `engine.js:383,392–396` | 玩家招式检查palm/qi并支付斗气，NPC反击主要用rank差和玩家guard计算；未按NPC自己的功法、装备或道具选择策略 |
| 装备与器物实例 | `tools/schema.mjs:5–9`、`source/content/catalog.js:26–31` | inventory只有item/qty，skills只有id/level，目录无已实现武器/防具效果与穿戴；无独立器物实例、耐久、充能和维修字段/流程 |
| 物品数量消耗 | `engine.js:67–78,100,108,357–363` | 干粮、药草和疗伤散等会实际减数量；玩家服药有间隔。数量消耗/使用间隔不等于装备磨损或道具耐久 |

用户补充的功法、装备和道具参战及分类消耗/损耗属于新增要求，详细方案归 [npc-progression-conflict.md](npc-progression-conflict.md)。后台NPC选择受本人所知限制，规则按双方真实能力和状态结算；不由模型叙述或单个rank分数直接决定胜者。具体公式、可用物品类型、耐久适用范围和维修参数尚未冻结，不宣称小说为所有物品规定统一耐久。

本轮范围明确区分：先做NPC自主修炼与NPC/NPC后台冲突，后续再独立制作完整玩家战斗。既有简单玩家分支不删除、不升级完成措辞；公共角色/能力/物品/结果语义可供未来复用，当前实现不强制未来玩家战斗照搬后台公式。V13与受影响长链/恢复样本均为后续验证设计。

## v0.16 状态、后果与可见表现的承载核对

2026-10-22再次核对package `914c624c950dec06c181960d32b2d7f337c31abf`（规则交付 `38007d02d`）、远端Atria main `a9a914c66141daaf7ab9ae26119a506444d73698`。本轮是代码与方案对应检查，没有执行新游戏测试或技术可行性原型。

| 核对点 | 实际源码证据 | 对实施的约束 |
| --- | --- | --- |
| 人物身体 | `source/rules/state.js:14–17`、`tools/schema.mjs:6–9` | hp/qi/injury为总量，没有部位、具体伤病、完整性/缺失、治疗过程或受控事实；不能持久表达骨折、缺肢及其不同后果 |
| 已有恢复旁路 | `source/rules/engine.js:67–92,217–224,348–363` | NPC日调度、照护、服药和成长使用总伤势/直接恢复数值；新增身体后需同步改造，不能保留回血/减injury就忽略所有伤病的路径 |
| 玩家与NPC所见 | `source/rules/projection.js:3,12`、`tools/schema.mjs:21–22` | 玩家screen含injury，NPC观察没有；正式伤势详情和部位投影均无。缺口同时在状态、规则与可见反馈，不只欠一张伤势页面 |
| 长期经历来源 | `engine.js:20–27` | 个人记录ID由actor/target/kind生成，同键会更新旧内容；不是每次事件独立留存的完整因果档案，不能直接承载持续仇怨的全部来源 |
| 闭合声明链 | `tools/build.mjs:21–31,60–86`、`tools/schema.mjs` | state、Domain命令/schema、读取授权、模型view、computation输出/effects、公开投影、Bridge及动态人物默认值须一起接通；改JS一处不能证明安装和宿主接纳成立 |
| 有界输出与负载 | `tools/build.mjs:54–77` | 当前单次输出最多8人物/8信息/4评价；people读取最多256、personal128，screen32768字符、意图观察16384字节，历史4096项/2MiB。多种单位与限额分开核实；不能把全体身体/物品/图谱嵌进每次screen或靠提高全局限制替代结构验证 |

推导：Atria已有身份、权威状态、事务、时钟、确定性计算和信息投影，尚非现成的身体、装备或NPC规划引擎。新增游戏领域主要在本地游戏源码中实现；只有实际代表性切片证明通用框架能力阻断时，才进入独立源码任务补充。当前调查足以定位缺口，不足以承诺某个新结构已经通过编译/安装、权限、完整恢复和规模验证。

方案据此把W0改为先贯通少量状态、作用、读口与恢复，W1接活动及合法伤势/治疗/受控结果，后续长链只能调用已支持效果。伤势细则归 [character-condition.md](character-condition.md)，其他领域的状态/后果/详情对应归 [implementation-readiness.md](implementation-readiness.md)，FE责任归 [共用契约](frontend-contract.md)。不得用前端示意、模型能描述或旧be.2长跑记录替代新增功能证据。

## 2026-10-23 任务机制研究摘要（首轮资料承接）

本节主要承接首轮网络调查，供 [任务机制讨论稿](quest-system.md) 与 [任务内容讨论稿](quest-content.md) 引用；仅保存外部依据、适用边界和本项目推演，不复制两份模块的详细规则。本轮没有执行新的模型、性能或玩法验证，也不以上文旧版本测试记录证明任务机制已可用。阅读范围限于下列相关问答、更新条目、制作文档、作者案例和论文段落；没有完整复现他作系统。

| 来源与证据范围 | 支持的判断 | 局限与面向斗破的推演 |
| --- | --- | --- |
| [Bruce Nesmith 原始访谈：Skyrim Radiant Story](https://rpgamer.com/2022/03/bruce-nesmith-interview/)；相关 Radiant 问答 | 系统捕获事件，结合人物关系、地点和物件数据为任务选角；作者也回顾过程序任务的荒唐、乏味结果及后续限制 | 不是任意拼装就能获得好任务的证明。**斗破推演：** 日常委托可选择符合身份、关系、地域和能力的人物，但仍需内容适配与人工限制，不能只换姓名、地点和数量 |
| [Warframe Update 40 官方更新说明](https://www.warframe.com/en/patch-notes/pc/40-0-0)；开放区域 Bounty 重复条目 | 连续重复同一 Bounty 时，各阶段重新选择 encounter，增加重复游玩变化 | 官方条目支持阶段遭遇重选，不证明完全不重复或任务都具有长期因果。**斗破推演：** 同类采运、巡查等日常可改变途中遭遇与处理条件；体验变化仍须由实际行动差异检验 |
| [Guild Wars 2：Dynamic Events 官方说明](https://www.guildwars2.com/en-gb/the-game/dynamic-events/)；胜负、地区变化与后续事件段落 | 事件改变周边状态，成功后可以推进优势，失败后可以重新组织；事件链承接结果 | 不能将可循环事件称为永久历史改变。**斗破推演：** 药田失守可转为救援、短缺与夺回；守住可转为运送、追查与交易，失败仍保留可玩的后续 |
| [Tynan Sylvester：RimWorld Update 1.1.2610](https://ludeon.com/blog/2020/04/update-1-1-2609-improves-quest-generation-and-more/)；任务生成说明与相关调整项 | 生成任务需适配难度、外交与规模；实际调整包括威胁持续时间、次数、强度菜单、奖励和选择权重 | 这是生成条件与质量控制的经验，不能提供斗破的难度、报酬数值。**斗破推演：** 内容池的丰富度须同时考虑阶段适配、变化维度与最近体验，词槽组合数不能直接视作玩法数量 |
| [Wildermyth：Comic Editor Reference](https://wildermyth.com/wiki/Comic_Editor_Reference)；官方域名制作文档的 Story Roles、性格与关系选角段落 | 故事角色按人物特征、性格、关系等匹配；必需角色不存在时故事不发生 | 资料支持有条件的故事选角，不证明可以自动生成完整长篇剧情。**斗破推演：** 手写故事模块可复用于合适人物，固定人物专属内容则保留其角色语义，避免任何 NPC 都能套用同一经历 |
| [KCD2 任务作者 Mila Brousil 的案例说明](https://www.milabrousil.com/kcd2-quest)；Materia Prima 与 Magnum Opus 案例 | Materia Prima 尽量复用潜行、犯罪、巡逻和干扰等系统以减少专用脚本；Magnum Opus 的既有承诺、隐瞒与人物生死影响过程，不能只以主要结局数衡量分支 | 作者案例不能替代本项目交互能力检查。**斗破推演：** 任务内容应使用现有采集、交易、旅行、关系等真实机制；同一目标的不同方法与前情可形成有意义的变化 |
| [Bannerlord 官方 Dev Blog 18/04/19](https://www.taleworlds.com/en/Games/Bannerlord/Blog/106)；开发者对 Issues 的说明 | 城镇问题可影响士气、食物或繁荣，任务成为解决问题的入口，连接角色扮演和战略系统 | 开发日志不能证明 Atria 已具备同等经济或任务承载。**斗破推演：** 断供、商路受阻和组织需求可成为任务来源；如果实际世界没有该问题，任务文案不能倒写出其已发生 |
| [Shadows of Doubt DevBlog 10：Gameplay Loop](https://colepowered.com/shadows-of-doubt-devblog-10-gameplay-loop/)；2018 年早期原型的行为、证据与发现兜底段落 | 任务线索可来自人物实际行动、物证和目击；作者为无人发现案件的问题加入声音、痕迹等兜底 | 属于早期制作迭代，不能把所有计划当成正式版功能，也不证明全量仿真成本可接受。**斗破推演：** 失窃与调查类任务先有可核对事实，再呈现线索；同时考虑玩家如何合理获知机会 |
| [Mike Booth：The AI Systems of Left 4 Dead](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)；首轮已读第 73 页及第 77–91 页的选择、压力与节奏段落 | 内容选择可减少连续重复；Director 在压力高低间调整事件频率，节奏控制与改变难度有所区分 | 合作射击的压力模型不能直接搬到开放沙盒。**斗破推演：** 参考其分散重复、保留平静窗口的思路，不让任务提示与危机密度成为世界自主运转的衡量标准 |
| [Doran、Parberry：A Prototype Quest Generator Based on a Structural Analysis of Quests from Four MMORPGs](https://ianparberry.com/pubs/pcg2011.pdf)；首轮已读任务样本、结构与生成相关段落 | 研究从约 750 个任务分析动机、目标和行为结构，以前后置条件约束组合 | 结构分析和生成原型不证明任务有趣，也不证明玩家已体验到足够差异。**斗破推演：** 可用于检查任务是否有合理动机与可执行路径，趣味、人物可信度和重复感仍须在后续实际样本中检验 |

这些来源共同支持有条件的内容组合、人物适配、真实结果承接与变化控制；它们不证明特定池容量、规则与模型的混合比例、长期运行成本或任务品质。上述斗破例子均为设计推演，不属于原著设定事实，也不表示当前包已实现。任务生命周期、规则与模型职责等以任务机制模块为唯一正文，内容结构与扩充依据以任务内容模块为唯一正文。

## 2026-10-23 固定活动设定核实：拍卖与炼药师考核

本轮为 [固定活动讨论稿](quest-activities.md) 补充最低必要设定依据，不扩展通用游戏机制调研。Wuxiaworld 的 [作品页](https://www.wuxiaworld.com/novel/battle-through-the-heavens) 明列授权来源 Yuewen；以下分别记录可读正文、受限预览和二手百科的实际证据范围。本轮只有资料核对与方案准备，没有新增游戏、模型、性能或浏览器运行验证。

| 资料与可读范围 | 支持的最低事实 | 不据此确定的内容 |
| --- | --- | --- |
| [授权译本第 21 章：Second Tier Alchemist Gu Ni](https://www.wuxiaworld.com/novel/battle-through-the-heavens/btth-chapter-21)；本次可读正文 | 米特尔拍卖场为乌坦城的拍卖机构、米特尔家族分支；存在鉴宝室，谷尼参与药液鉴定，鉴定后可安排委拍 | 单次场景不规定全部拍品的通用受理条件、固定鉴定耗时、库存生成或每场排期；Gu Ni 对应谷尼，不与项目人物谷茗混用 |
| [授权译本第 22 章：Hurricane Chant](https://www.wuxiaworld.com/novel/battle-through-the-heavens/btth-chapter-22)；本次可读正文 | 雅妃为乌坦城拍卖场首席拍卖师；场景包含拍品介绍、现场叫价、竞争者取舍和落锤成交 | 不把该场拍品、成交者、价格或出价次序预写成游戏必定重演的结果；统一最小加价、资金占用和特殊竞价规则仍属游戏设计 |
| [授权译本第 24 章：Everything For Later](https://www.wuxiaworld.com/novel/battle-through-the-heavens/btth-chapter-24)；本次可读正文 | 拍卖后另有手续与款项结算；雅妃会争取有价值的供应者，场景出现贵宾身份和差别待遇 | 不由这次交易推定所有角色自动有贵宾待遇，也不直接冻结游戏通用手续费、信用额度或收益数值 |
| [授权译本第 164 章：The Alchemist Association](https://www.wuxiaworld.com/novel/battle-through-the-heavens/btth-chapter-164) 与 [第 166 章：Passing the Test](https://www.wuxiaworld.com/novel/battle-through-the-heavens/btth-chapter-166)；本次均只可读 Teaser | 黑岩城有炼药师公会及等级徽章咨询场景；考场存在炼药实作，弗兰克与奥托在场观察 | 未读取受限正文；不从章节标题和预览补出完整登记手续、材料份数、次数、时限、题目、评分、费用或授证流程 |
| [小说向 Wiki：Fu Lan Ke](https://battle-through-the-heavens.fandom.com/wiki/Fu_Lan_Ke)；搜索返回的可见背景、弟子及考核段，直接打开受限 | 二手资料将弗兰克列为黑岩城炼药师公会会长、雪魅的师父，并描述其与奥托主持考核 | 只作人物身份和机构职责的补充线索，不冒充本次已读小说正文；不采用词条跨时期的品阶、年龄或后续人物状态 |
| [百度百科：琳菲](https://bkso.baidu.com/item/%E7%90%B3%E8%8F%B2/65361189?fromModule=lemma_inlink)；本次搜索可读身份背景及考核经历段 | 二手资料将琳菲列为奥托弟子，描述琳菲与雪魅在黑岩城共同参与炼药师考核 | 原著情节中的通过与后续成长不等于游戏开局已发生；本轮不据此追加奥托的副会长职务、二女的开局品阶或以后必定晋阶的结果 |

原著有关人物首次出场时的身份，不足以精确证明小说第一天的所有在场、资格或关系状态；开局采用范围与独立世界历史需在内容方案中明确。原著后续拍卖、考试、晋阶、迁居和关系结果不因被资料提及而自动成为游戏未来。

活动的可执行手续、公开递增竞价与资金处理，以及报名、实操、结果评定和认证的完整交互流程，均按 [固定活动讨论稿](quest-activities.md) 标注的游戏原创候选处理。上述资料不证明这些规则已在当前包实现，也不代替后续能力、库存、资金、所知与恢复验证。

## 2026-10-23 战斗机制与功法重构研究

本节承接本轮网络调查与当前工作树代码检查，为 [战斗机制讨论稿](combat-system.md) 和 [功法重构讨论稿](arts-reconstruction.md) 提供证据；详细玩法、数值、数据职责与待讨论项只在对应模块维护。
证据区分官方说明、授权译本正文、二手百科与公开模拟器实现；协作代理读取的范围同样明确记录，不将搜索摘要写成逐章全文核实。
本轮只调研并更新方案，不改游戏代码；以下代码结论取当前实际工作树，不由旧版本文档、包版本号或历史测试推定新战斗完成。

### 宝可梦结构与可借鉴边界

| 来源与实际读取范围 | 支持的事实 | 世代、用途与跨作品局限 |
| --- | --- | --- |
| [Pokemon官方视频游戏词汇表](https://www.pokemon.com/us/play-pokemon/about/video-game-glossary)；已读招式、PP、优先级、特性、携带物、状态与双打相关正文 | 招式有使用资源和目标；优先级先于同档速度；特性按条件触发；物品区分持续生效、主动使用和自动消耗；常规冒险与竞技恢复不同 | 页面含USUM时代例子及旧数值，只作结构定义；不照搬四招式上限、单携带物、十八属性、战后恢复或六项能力值 |
| [官方《剑/盾》双打速度控制](https://www.pokemon.com/us/features/battle-tactics-speed-control-in-double-battles-in-pokemon-sword-and-pokemon-shield)；已读New Speed Mechanics及协作案例正文 | 第VIII世代回合内速度变化立即影响尚未执行的行动；速度控制、保护同伴与协同触发可改变局势 | 不是所有世代一直如此；Dynamax等该作专有机制不转写成斗破规则；速度与行动优先级不能混为同一属性 |
| [官方VGC规则文件](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-vg-rules-formats-and-penalty-guidelines-en.pdf)；搜索可读2025版携带物、队伍与双打条款 | 常用双打格式从战斗队伍选择四名，两名同时上场；竞技赛可设置同种及同物品限制 | 未将该文件作为2026全部赛制权威；竞技队伍、等级拉平、公开名单和比赛终止规则不适合直接替代开放沙盒 |
| [Bulbapedia：Move](https://bulbapedia.bulbagarden.net/wiki/Move)；已读招式特征、学习与遗忘、标准字段正文 | 威力、命中、PP、优先级、类别、属性、范围及附加效果是不同维度；第IV世代起物理/特殊类别按招式区分 | 二手跨世代汇总；不能由火属性推出必定远程或特殊攻击，也不能由宝可梦学习限制推出修炼者必须遗忘旧斗技 |
| [Bulbapedia：Priority](https://bulbapedia.bulbagarden.net/wiki/Priority)；已读Mechanics、特殊顺序、特性和阻止先制的条目 | 同档速度与优先级分层；保护、先手攻击、延迟反击、协作改变次序形成不同战术作用 | 列表含多世代例外；项目需要自己冻结执行顺序，不把百科所有特例混成一套规则 |
| [Bulbapedia：Status condition](https://bulbapedia.bulbagarden.net/wiki/Status_condition)；已读持续/临时状态及烧伤、冰冻、麻痹相关正文 | 主系列区分非易失与易失状态，能力受限和持续损伤并非同一效果；不同世代的伤害、速度倍率会变化 | 大多数主系列的单一主要异常限制、切换消除效果和PLA的状态覆盖规则不同；持续伤处、毒素与临时破绽不能直接合并为一个槽 |
| [Bulbapedia：Escape](https://bulbapedia.bulbagarden.net/wiki/Escape)；已读撤离条件、限制与跨世代说明 | 野生遭遇可撤离失败并失去行动机会；逃跑、陷阱、特性和物品存在条件关系；训练家/玩家战斗另有规则 | 页面标注部分第IV世代之后公式待核或过时；只借鉴撤离有代价与限制，不搬精确公式或训练家战禁止逃跑 |
| [PLA官方玩法](https://legends.arceus.pokemon.com/en-us/gameplay/)；已读Time for a Pokemon Battle及Agile/Strong Style正文 | PLA允许连续行动；迅疾降低威力并提高行动速度，刚猛提高威力但降低行动速度 | 这是不同于传统回合的时间轴参考，不自动与当前宝可梦式回合基线叠加，也不作为免费连招或实时操作依据 |

这些材料支持先选择合法行动、再依明确顺序结算，以及资源成本、条件效果和协作形成战术差异；它们不提供斗破的人体、境界或距离公式。
多人协作可以参考双打的目标选择、掩护和辅助，但NPC是否协助、撤退或拒绝仍须接既有目标、关系、所知与能力条件，不能变成全员服从玩家的竞技队伍。
战斗界面展示的情报应延续项目现有个人视角；竞技公开名单不授权暴露NPC私有斗技、物品或动机。

### 公开实现与许可

| 已读取实现 | 支持的工程判断 | 不据此承诺的内容 |
| --- | --- | --- |
| [Showdown行动队列固定版本](https://github.com/smogon/pokemon-showdown/blob/b86dd3ae/sim/battle-queue.ts)；已读队列说明、排序、插入/取消与改变行动函数 | 选择与执行分开；行动按类别顺序、优先级及速度排序；队列变化有明确入口 | 它是宝可梦模拟器，不是Atria原生事务或世界时间实现；不能直接套用其对象、循环和容量 |
| [Showdown battle.ts](https://github.com/smogon/pokemon-showdown/blob/master/sim/battle.ts)及[事件流程说明](https://github.com/smogon/pokemon-showdown/blob/master/simulator-doc.txt)；已读事件系统说明与主要流程 | 通用结算、效果事件、状态和各类数据分离；命中前、伤害时、行动后及回合尾有可辨识时点 | 说明和当前源码不一定完全同步；不采用其全部历史兼容分支，也不把任意脚本钩子当成本项目已支持能力 |
| [招式数据](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts)与[道具数据](https://github.com/smogon/pokemon-showdown/blob/master/data/items.ts)；已读文件开头及After You、Air Slash、触发物品等具体条目 | 招式不仅有名称/伤害，还含目标、标签、概率效果与队列作用；物品持续效果和实际消耗分别处理 | master链接会变化，本轮没有下载或复现全模拟器；不能声称全部数据都已核验，更不能据此复制名称、素材或完整机制 |
| [Showdown LICENSE](https://github.com/smogon/pokemon-showdown/blob/master/LICENSE)；已读MIT许可全文 | 实质复用软件需保留相应版权与许可声明 | 软件许可不自动授予宝可梦名称、图像及其它IP权利；本项目目前只参考组织方式，没有增加该依赖 |

可复用的是职责分层和有界执行思路，而非第二个脱离Atria权威状态的独立战斗世界。
新领域是否需要通用产品修补，须由后续实际schema、读取/输出预算、事务与恢复验证证明，不能仅凭他作源码存在就承诺可安装。

### 小说设定与非致命后果参考

| 来源与实际读取范围 | 支持的最低事实 | 原著倍率、时期及跨IP局限 |
| --- | --- | --- |
| [Webnovel授权译本第2章：Dou Qi Continent](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/dou-qi-continent_21770727598387027)；本轮协作实读正文 | Qi Method与Dou Technique分开；功法分天/地/玄/黄，各低/中/高；自身境界是战力首要因素，一星斗者即使天阶功法也难胜斗师；配套功法/斗技有额外优势；成为真正斗者后才能修炼功法 | 不给出通用伤害、容量、恢复、相性或跨境界倍率；“难胜”不等于绝对无敌；章节的局部魂力常识不能外推为后期灵魂体系全部规则 |
| [Wiki：Qi Method](https://battle-through-the-heavens.fandom.com/wiki/Qi_Method)；协作实读百科正文；相关第68/235章仅读teaser | 二手资料整理功法对斗气容量、质量、吸纳炼化及运转的作用，以及换功法相关线索 | 百科不是本次逐章核实的小说正文；受限章节未完整读取；具体倍率、替换损失、战中恢复与高阶条件仍待条目级核对 |
| [Wiki：Dou Techniques](https://battle-through-the-heavens.fandom.com/wiki/Dou_Techniques)与[Cultivation](https://battle-through-the-heavens.fandom.com/wiki/Cultivation)；协作实读百科正文，本代理另查搜索可读相关段落 | 可作为斗技分阶、境界能力解锁、武器/护体/飞行等能力的索引，辅助建立需要核实的内容清单 | 多时期综合且含翻译歧义，不把索引说明、价格或破坏力修辞当统一数值，也不把高阶能力自动开放给当前低境界玩法 |
| [Wiki：Flame Mantra](https://battle-through-the-heavens.fandom.com/wiki/Flame_Mantra)与[Heavenly Flame](https://battle-through-the-heavens.fandom.com/wiki/Heavenly_Flame)；协作实读百科正文 | 焚诀与异火取得/融合/成长联系特殊，不能当作普通随机功法的仅换名版本 | 脚注存在错配，未声称逐章核实；异火资格、反噬、成长和取得未实现前保留储备，不把原著机缘归属预写为游戏未来 |
| [Kenshi官方作品说明](https://lofigames.com/about-kenshi/)；本轮协作实读正文，本代理另查官网相关可见说明 | 无等级缩放、世界非主角中心；伤势可影响移动，昏迷、失血、救援及逃离囚禁进入持续世界 | 只参考失败后仍可继续游玩的后果结构；不复制即时战斗、肢体数值、机械义肢或该作奴役设定 |
| [Kenshi Medical System Update 0.61.0](https://lofigames.com/medical-system-update-0-61-0/)；协作实读2014年开发日志正文 | 设计讨论区分死亡、失肢、昏迷、自救和伤后延迟死亡，说明败退/倒地与死亡可以分离 | 旧开发日志只支持设计动机，不证明当前版精确流程或概率；不采用其阈值、治疗速度及死亡公式 |

小说证据支持功法、斗技与境界分别表达，不能直接证明某组游戏参数“原著正确”。
Kenshi仅补充非致命失败与持续后果的比较依据，不决定本项目切磋、拘束、救援或伤亡细则。
属性相性、身法距离、临时状态及所有数值落点均为游戏设计；后续原著条目补充仍遵循小说优先、百科索引和未实现内容不参与有效抽样的既有边界。

### 当前工作树的最小代码事实

以下路径均相对游戏目录 `doupo-living-world/`；它们是读取事实，不是本轮新增实现或验收结论。

| 读取位置 | 当前事实 | 对新机制的约束 |
| --- | --- | --- |
| `source/pools/arts.js`、`source/rules/progression.js` | 同一arts池含cultivation/combat/formula；10个ready、1个reserve。study只选一个修炼功法和一个当前斗技；修炼主要使用xpRate/qiRate，斗技主要使用qiCost/power/arms | 已有统一内容入口可复用，但不能把四个数值条目当成完整多招式战斗；不另建隐蔽随机表 |
| `source/rules/state.js`、`tools/schema.mjs` | 默认人物hp/qi各100；study有两个当前条目和小数carry；world/screen战斗为enemy/round/guard；skills容量16 | schema允许的最大值不等于真实容量成长；尚无多人参战、行动队列、距离/临时效果和多斗技选择结构 |
| `source/rules/engine.js`的玩家交锋分支 | 玩家先造成基于rank及当前斗技的伤害，存活敌人再按rank差反击；投降转移四分之一金币；撤退以简化条件判断并改到固定坐标；一段推进5分钟 | 不是宝可梦式双方选择后排序；不能由已有按钮推定先制、装备参战、追击路线或多人博弈已完成 |
| `source/rules/life.js:settleConflict`、`source/rules/equipment.js` | NPC后台冲突已有实际斗技/耗气、装备作用与磨损、药物、伤处、撤离/认输/有限拘束及观察传播；双方仍按固定遍历顺序执行 | 可复用物质与后果权威，但后台固定顺序及公式不是新的统一战斗内核；玩家交锋与后台冲突不能继续各自宣称同一语义 |
| `source/rules/condition.js`、`source/rules/projection.js` | 伤处/缺失影响能力；capabilities当前直接读取arts及study.combat；公开arts仅投影本人已学或持有秘籍 | 重构须同步能力限制、合法执行和投影；不能只增加战斗数据表而留下旧当前斗技判定或泄露他人私有能力 |
| `frontend/panels.js`、`frontend/main.js`、`tools/build.mjs` | 正式界面仍是施展当前斗技与简单攻防入口；attack/technique走choice；构建器消费闭合schema、内容/池校验与原生接口声明 | 功法重构需要接口、投影、模型意图及界面一起对应；模型描述、静态页面或版本标识不能替代原生执行证据 |

### 本轮验证边界

- 首轮root实际执行只读 `validatePools` 与 `validateContent`，均通过；本轮不重复已通过且未受代码变更影响的检查。
- 该检查读取结果为6地区、32场所、66路、48名作者NPC、13池、10个ready加1个reserve功法/斗技/丹方条目、15项物品；不是新战斗内容覆盖数。
- 检查只证明当时内容/池声明满足其校验器；不证明行动排序、功法重构、多人距离、结果恢复或NPC战术已经可用。
- 未执行新构建、安装、Native战斗事务、真实模型、浏览器战斗流程、性能或战斗测试；没有新增相关通过结论。
- 工作树含既有未提交改动；`package.json`的quests.2与README的quests.1是标识/文档差异，不是新增战斗完成或旧档迁移证据。
- 正式实施和验收待方案确定后在新对话进行；本节不写Record、HANDOFF或实施完成声明。

### 首批战斗内容的代码证据补充（2026-10-23）

本次仅按首批内容选取问题重读当前 `package` 工作树的池注册、人物/地理、能力、旅行/成长入口与包内SOURCES；没有新增构建、测试或广泛网络调查。以下是方案输入，不记录新的内容数量确认，不将拟议遭遇或条目写成已存在玩法。

| 当前实际证据（路径相对 `doupo-living-world/`） | 可用于内容讨论的事实 | 未知与不能推出的结论 |
| --- | --- | --- |
| `source/content/SOURCES.md`、`source/rules/engine.js`成长分支、`source/rules/life.js`突破分支 | SOURCES定义rank 1–9为斗之气、10–19为首批斗者进阶，20以上仅用于已有强者游戏数值；玩家与NPC的现有突破均只在rank小于19时增加一级 | engine拒绝文案又称“可玩到斗师阶段”，与SOURCES口径不一致；未见完整境界/星级转换权威。首批范围不能由一句文案扩为完整斗师，更不能由rank数值反推飞行、护体或空间能力已实现 |
| `source/pools/cast.js`、`source/pools/people.js`、`source/rules/state.js` | 作者人物池含48名角色；职业模板仍是人的身份、生计与基础属性，非完整战斗流派。萧战rank 25、弗兰克32、奥托31等为当前配置，作者注明精确年龄、rank和驻留是游戏参数 | 高rank原著NPC不等于其小说全能力已落地；不能依据原著身份给他们补成已学高阶斗技、必然参战或完整境界。NPC何时在场仍由实际活动决定 |
| `source/pools/arts.js`、`source/rules/progression.js` | 当前ready共5个修炼功法、4个斗技、1个丹方，均标黄阶；焚诀为reserve。斗技差异主要是耗气、威力和手臂要求，功法主要是修炼效率与耗气率；现有条目名为游戏内容 | 点脉指名称不证明已能封脉，轻风息法名称不证明已实现战斗身法；没有阶内低/中/高字段，也没有相应范围、先制、蓄力或控制效果。新增条目与原著名字仍需逐项来源和可执行能力匹配 |
| `source/content/catalog.js`的GEAR、`source/pools/items.js`、`source/rules/equipment.js` | 已有blade/armor/ward三个装备规格及实际磨损/充能作用；物品池15项由5个补给/材料/药物/札记和10份ready能力抄本组成 | 不等于15种战斗道具或已实现锻造/魔核/魔兽材料；装备实例与普通物品数量分开，首批内容不能凭胜利凭空生成其库存外战利品 |
| `source/pools/index.js`、`source/pools/cast.js`及source中的主体/战斗入口 | 当前13个注册池没有魔兽/生物池，现有初始主体与后台交锋使用人物；魔兽山脉与兽域文本分别出现在地理/世界目录中 | 地名、图像和目录标签不证明魔兽是可持续参战主体；没有本轮已核实的魔兽种类、品阶、行为或战后材料。拟议魔兽行为类型只能先作原创候选，不挂未经核实的原著专名 |
| `source/pools/geography.js`、`source/rules/engine.js`的travel及到达结算 | 六地区有现成场所/道路；场所配置20×14布局和blocks。旅途按route risk直接造成伤处并记录travel_risk，没有先创建某只魔兽再执行其攻击 | 旅行遇险不是可选择目标的魔兽遭遇；现有blocks也不证明已具备战斗射线、群体范围或掩护结算。路线风险不能直接冒充首批魔兽战斗通过 |
| `source/pools/quests.js`、`source/content/SOURCES.md` | QC28护人而非清场、QC29让争斗停下来、QC30在约定规则内证明自己仍标dependency，依赖D33；地点、机构与人物来源清单将原著身份和原创参数分开 | 三个储备标题不是已可玩战斗任务；SOURCES中早期拍卖/考核未开放描述可能滞后于其它现有任务实现，不能用整份旧措辞替代当前代码或Record事实 |

本轮主代理随后局部网络检索以下百科条目，实际工具返回的正文摘录用于最低内容索引；没有完整读取条目、逐章核实小说或验证游戏能力，也不把预期检索内容充作已读证据。

| 实际返回的来源摘录 | 支持的首批内容索引 | 不据此冻结的内容 |
| --- | --- | --- |
| [Wiki：Cultivation](https://battle-through-the-heavens.fandom.com/wiki/Cultivation)；搜索返回斗师/大斗师相关段落 | 斗师斗气由气态向液态变化及斗气纱衣；大斗师斗晶与斗气铠甲，可作为境界能力切片的二手索引 | 不给出容量、减伤或跨境界倍率；不由人物个例推定普遍全身铠甲星级阈值，也不证明当前代码已解锁这些能力 |
| [Wiki：Da Dou Shi](https://battle-through-the-heavens.fandom.com/wiki/Da_Dou_Shi)；搜索返回armor、External Emission及武器相关段落 | 大斗师护体铠甲、斗气外放和覆盖武器可作为后续条目核实的方向 | 不据此让所有攻击无条件远程、覆武器必定同一增幅或低阶角色提前获得完整高阶能力；实际资格、作用方式和代价仍候选 |
| [Wiki：Magical Beasts](https://battle-through-the-heavens.fandom.com/wiki/Magical_Beasts)；搜索返回阶级对应及特殊攻击说明 | 一/二/三阶分别索引斗者/斗师/大斗师；不分人的星级，特殊攻击可能使同阶魔兽更强 | 人兽对应不是1:1能力数值或固定胜率；不推出每只必有可掉落魔核、统一材料数量或具体物种能力，未核实的原著species名仍待逐条查证 |

本轮不采用萧炎个人全甲例子作为通用星级门槛；检索中的战耗补充表述也不改变D70默认回合恢复边界，例外仍须有真实能力条目、资格及代价。上述来源只支持首批候选切片，不替代完整原著能力核对。

首批可据已有人的身份、地方关系与可达场所准备内容，但可执行战斗风格须由新功法/斗技能力逐项支持，不能只给现有NPC贴标签。高阶原著能力、特定魔兽专名与完整境界映射仍有证据缺口。
原著基础沿本节已读第2章及明确范围的百科证据；上述新增检索仍只作索引，不用来认证新增倍率、低阶斗技的具体效果或某个原著魔兽的完整能力。
首批人物、功法、斗技、道具及遭遇数量与投放选择仍由 [战斗内容讨论](combat-system.md) 和 [能力条目讨论](arts-reconstruction.md) 提出并讨论；本补充没有冻结这些数量，也没有新增自然流程、战斗或性能通过结论。
