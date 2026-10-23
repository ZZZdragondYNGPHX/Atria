# 调研证据与待验证问题

## 证据范围

历史首轮源码基线为 `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`；原有行号和调查时的待验证结论保留其时间范围。2026-10-22 已核对远端 `main@a9a914c66141daaf7ab9ae26119a506444d73698` 与 package `914c624c9`（规则交付提交 `38007d02d`）。be.2 实际验证以 [Record](../../../records/package/doupo-living-world.md) 的 BE2–BE6 为准；本轮新增的是完整调用链阅读和纯规则内存试算，没有重跑真实宿主、模型或浏览器。

当前人物与调度缺口见 [v0.13 代码现状](#v013-代码现状与边界)，外部依据见 [世界自主性研究](#v013-世界自主性的一手研究) 和 [连续因果与社会认知](#v014-连续因果与社会认知)。旧文中的 manifest 目标限制和确定性 Bridge 缺口已由后续框架提交解决；新方案不因复用这些能力而被视为已实现，也不以声明上限推断容量。

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
