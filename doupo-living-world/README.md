# 斗破苍穹·众生行 — 原生游戏界面与世界规则

Task ID：`package/doupo-living-world`。当前版本 `0.1.0-combat.2`：在 combat.1 的统一玩家／NPC回合战斗、独立功法成长、六主修／三辅助／十八斗技、六种魔兽和QC28–QC30基础上，整合“墨框纸卷”前端重构。场景常驻，相处／交易／交锋／光阴流转采用情境界面，己身／人间／江湖录／山河四卷承载资料与操作。战斗使用实际位置、身体、物资与共同世界时间；战后伤势、看守、现场遗产和当事人的所知继续保留。当前接口为C6，使用新局；准确验证范围见同一Record。

前版 `0.1.0-atlas.2` 在fe.2/C4上扩充到六地区、三十二场所、四十八名作者NPC及四名池生成开局居民；新增十名原著角色、十四名原创居民与八种地域职业模板。区域、场所、路线和作者人物已纳入统一池。原有身体/伤势、活动补给、维修、NPC成长/冲突、关系消息和因果查询继续沿用。正式前端入口见[实施说明](frontend/IMPLEMENTATION.md)；`design-reference/` 由另一个对话维护。设定依据与原创边界见 [SOURCES](source/content/SOURCES.md)，本轮方案为 `docs:plans/package/doupo-living-world/world-atlas-art.md`，实际证据归同一 Record。

```sh
node tools/build.mjs --core /path/to/Atria --out releases/doupo-living-world-0.1.0-combat.2.atria
```

需要 Atria `main@3a0437bdf1da5e318b3939b1ab366035bc9cc6f9`：支持隐藏续行输入合并、独立 invariant 小模块、按需复制包字节和有限并行持久化；沿用独立媒体库预算、按使用回收的本地图像缓存与二进制作品导入；保留既有 Native Authority/Subject/Information/Bridge 扩展，并支持有界计算输出组合、显式 invariant 读取预算和计算输入组合预算。单值、总读取、CPU、堆和 effects 限额继续生效。归档使用随机盐/nonce，重建核对明文与版本；`--out` 独占创建，不覆盖历史版本。

载入顺序：安装并授予 generation → 创建 Session → `experience.ready` → 依次执行公开 `BINDINGS`（当前 `bind0` 至 `bind5`）→ `act` 创建角色。Subject 由 Native 初始化绑定，前端不得推算身份。本轮内容采用新局；没有将新增地点、人物自动注入旧存档。

容器内 `integration/bridge.json` 是需经过 Native frontend compiler 编译的作者声明；`integration/screen.schema.json` 为公开 screen 的闭合 schema。只读 `dw_public`，禁止向前端发送人物 Domain 或 NPC 个人 view。

| Binding | 输入 | 行为 |
| --- | --- | --- |
| screen | {} | 数组中 main.value.screen 为 JSON 字符串；同条 intent 为有界公开摘要 |
| act / choice / plan | 对应 transaction schema | 普通 / 重大 / 1–4步复合动作，通过生成宿主 |
| bind0 至 bind5 | {} | 新局身份绑定，不调用模型；按构建导出的BINDINGS执行 |
| continue / cancel | {} | 推进或停止后续活动；已锁定交锋决定不能撤销 |
| battleStep | {} | 隐藏的已锁定交锋步骤；不推进世界钟、不调用模型 |
| acknowledge | {target:人物key} | 接纳 NPC 已完成回应，不调用模型 |
| browse / clues | {qty:从0起的页码} | 人物平时12条／战中4条，线索摘要8条一页，不推进时间 |
| known-people | {qty:从0起的页码} | 仅查询已知旧档案；browse返回当前附近人物 |
| focus | {target:人物key或空串} | 零耗时选中/取消当前可感知对象，不自动接近 |
| recall | {target:消息id} | 本人已知记录全文，不推进时间 |
| condition / profile | {} | 更新人物详情；读取 screen 的结构化字段，不解析 result.text 为详情 JSON |
| event | {target:事件id,page:从0起的页码} | 本人已知事件详情；只更新公开回执，不改变物质状态或推进时间 |

所有规则输入字段必填：`{kind,target,item,qty,x,y,detail,text,steps}`；未用字符串为空、数字为0、steps为[]。`travel/train/wait/rest/marry/conceive/attack/technique/work` 使用 doupo.choice，世界事项的continue使用隐藏doupo.continue；operation.kind=combat且phase为collecting/resolving/cleanup时改用battleStep，其余单步使用doupo.act；复合使用 doupo.plan、kind=plan，steps最多四项 `{kind,target,item,qty,x,y,detail}`。创建例：`{kind:"create",target:"apprentice",item:"female",qty:0,x:0,y:0,detail:"transmigrator",text:"云禾",steps:[]}`。交易 detail 为当前 quote 整数文本。

新操作：`treat` 的 target 为本人或近处病人，detail 为伤处id，需要能接诊的医者、两份药草、十二金币；`equip` 的 target 为自有器物id，detail=remove 时卸下；`repair` 需要工匠、一份药草和六金币，原器物在维修期间不可生效；`message` 使用本人已知地址寄信，text为正文；`release` 只能释放自己实际控制且在身边的人。普通药物不修复缺肢或未处置骨折。

screen.sex与placeName提供主角性别和权威地点名；意图摘要quotes使用unitPrice与actionDetail分别表示价格和交易detail令牌。screen 的 condition/gear/control/social/goals 为玩家本人数据；people 仅提供当前实际可见或旧观察，含 signs/activity/carrying/observedAt，不含他人私有伤处、物品、目标或图谱。last_known 是旧记录，不能用作实时定位。messages 是已知信件摘要；events 是最近16个已知事件入口。event 的 result.text 是带 details/page/pages 的 JSON；未知与私有事件统一拒绝。更早的合法事件可按已保存 id 重读，不因目录滚动删除事实记录。

operation.kind 非空时 continue 并重读，appraise 不耗时；耗时单位分钟。Bridge 使用真实 epoch/revision/idempotencyKey，成功后重读 screen；恢复后重开 Bridge、清除旧目标。玩法拒绝见 result.code/text，结构/CAS/权限拒绝由 Native 报错。talk 等待已有回应时不覆盖原请求，cancel 可结束等候；已说出的话不撤销，取消生成或读档后拒绝迟到结果。

NPC 使用真实 Subject 的个人 view，规划由规则根据自身人格、目标、动机与可见线索执行，模型负责有界回应/意向。模型不写物品、伤亡或婚约。宿主路线：role.intent_resolver → doupo.resolve，narrative → doupo.narrate，npc → doupo.npc，需要工具调用与结构化 JSON。连接/凭证仅保存在仓库外；GGchan 停用。本轮真实服务结果见 Record，不能将模拟传输当模型质量证明。

当前六地区三十二场所、48名作者NPC与4名池生成初始居民，人口上限96（含出生预留）。早期三地版本的60日分批、420日纯规则、96名NPC早期宿主样本是历史证据，不能当作扩充版本的长期性能结论；本轮验证以Record新增段为准。它们不证明96人跨月完整宿主性能或无限历史。

边界：伤处8、器物4、当前个人图谱16、目标/动机各6、热信件16、热冲突4；个人信息grant128、关系grant256、家庭48、约定64、Domain4096条/1MiB、History4096项/2MiB。重要因果保留有界稀疏前后变化及来源，常规生活不为每次进食创建独立事实记录。容量超限拒绝；未承诺无限世代。遗产保留在原尸身，需现场查验／取用或由合法继承人实际到场领取；回合交锋已经接入。多尺度聚合与96人长期宿主成本仍需深化，本版包含正式AUI/Controller与图像场景交互；静态Q版不含行走动画，浏览器验证口径见实施说明。测试、fixture、日志、缓存和机器配置不提交。

统一内容入口为`source/pools/index.js`，数据集中于`source/pools/`；通用资格筛选、权重及重复控制在`source/rules/pools.js`。开局、迁入和出生保存实际抽取结果，存档恢复不重新抽取。新增池必须注册并通过构建校验，不能在事件或界面中维护另一套随机表。`integration/pools.json`供作者校验；玩家只读取合法公开投影。

本轮新增黑岩城六处、石漠城五处、塔戈尔沙漠外缘三处场所，乌坦城与青山镇各增加三处设施。到访和调查路标可发现相邻公开道路，山中隐藏地点仍由线索揭示。70行差异化商铺库存、4处生态和4个药材加工组织沿用既有预算；NPC根据实际库存寻找补给，沙漠采药人往返绿洲与诊舍。所有路程、库存、驻留和参数为游戏原创配置。

atlas.1 补齐十名新增原著人物的肖像/Q版、二十处场景、三幅地区总览与大陆全图，共44张。现有三十二场所均有图片；人物池共30组60张。世界目录六大分区、37个条目，六地区开放、31个条目未解锁；锁定条目不提供交互，后端拒绝伪造请求。飞行购票、公会品阶认证、竞价拍卖、高阶战斗与异火秘境没有因加入相关地点而自动实现。

地图使用独立`markers`（最多12项）及`chibiAsset`，主角使用自身`appearance`；人物列表每页12项，翻页不改变地图标记。旧档案不是实时位置。`media/pools/`包含18位重要角色与12种普通NPC的配对图片，见该目录README及来源清单；时期缺图明确返回未就绪。

功法池含基础纳气、六主修、三辅助、十八普通斗技、丹方及境界／兽类专属能力；焚诀仍为储备；`arts`只显示本人已学/持有秘籍。`practice`的item为已学条目ID，`learn`的item为秘籍物品ID，效果由规则结算。界面创建后自动通过`continue`完成零耗时的`initialize/appraise/refresh`流程。

主界面以场景和四卷入口组织体验；己身包含行囊与法门，江湖录包含委托、活动与见闻。歇息菜单提供存档/恢复和宿主操作，暂停的交锋队列可以保存。地图重要人物使用独立markers，普通人物主要在列表，选择不自动接近。Native安装图片采用前端交付字节，原图provenance与交付hash分开记录。

当前 atlas.2 交付 quality90、107张前端图片约41.65MiB，旧 atlas.1 兼容版保留。请使用所需版本 Atria 创建新局；详细资源预算与运行限制见产品 `docs/development/native-media-capacity.md`。

任务玩法位于江湖录的「委托」和「此地活动」。新局可选药铺学徒，在苏晚禾的相处界面询问近况；QC07首炉可能失败，材料真实消耗，可采购后明确自备重试。任务不是必做主线，可读公告、观察现场、整理实际送达邀约或直接探索。拍卖在乌坦拍卖场，分阶段考核在黑岩公会；任务试炼现包含双方同意的三轮徒手演武；其它固定活动仍依各自条款。所有费用、库存、伤势、人物意愿和到场条件都由规则核验。

本版真实浏览器覆盖自然新局QC07、公开悬赏、存档恢复、正常旅行及拍卖交割；规则测试覆盖27种子、四类活动与125期合作容量，Native验证保存、并发幂等及迟到隔离。合法状态夹具不能代表全部自然地域长旅程；本版未调用真实模型服务，不能沿用旧版服务验证声称新增自然语言流程已验。精确证据及限制见同一Record。任务/活动使用新局，不声明atlas.2旧存档迁移。

quests.2 完成自然任务补正、真实服务与前端续验，并优化已确认长行动：自动串行续行、当前时点事件反馈和随时停止，正常运行采用轻量包缓存及HEAD检查。25场自然新局覆盖QC01–QC27各至少一个结清分支；真实模型、暂停/恢复、连续三日与具体速度只以同一Record的实际证据为准。需要新局；不修改D33完整战斗或功法方案。

## 长期推进轻量化

world.1 预读已授权的到期居民，以有界小批次串行结算同刻及连续被动片段；不跳过NPC、补给、期限、死亡、所知或因果。做工、等候、休息的内部续行可复用输入锚，每次仍重新结算并保存；普通玩家行动不合并。身体与认知同变时使用一次既有publish，索引复用统一人物/地点/路线目录。人物、认知、输出和Native总预算均未提高，战斗与功法规则不在本轮改动范围。

自然新局三日真实Native推进19950ms、119提交，只新增两条输入，保存/恢复及重复请求通过；同seed纯规则30日4256→1756提交，世界事实与逻辑序列一致。96人跨月真实Native为容量夹具，30日2327提交、636068ms；96人年度规则75330→30446提交，事实一致，但不是年度Native耗时。夹具只预置充足起始钱粮，不延后居民、市场、消息、冲突、迁入或死亡调度。原六地区和96人口上限未扩大。

真实浏览器三日自动推进、停止反馈与正式恢复通过；恢复后旧续行不重放。本版没有新增整包摘要验收或反复hash输出。96人月测的本机Native历史及元数据约1.46GiB，长期持久化仍会增长；区域/依赖唤醒、更大人口和完整多年宿主成本仍属W5未闭合范围，不能据此宣称全世界闭关多年已经秒过。精确样本、失败修正与边界见同一Record。

world.2 在以上规则上合并有界物理提交，保留每个逻辑Revision、回执和预算；扩展原有差分状态并无损压缩Native文件，减少重复候选、读取与摘要计算。当前HEAD直接由持久根证明，查询特定旧修订找到可达证据后停止；完整GC遍历不变。实现权威见 main:docs/development/native-transactions.md。

96人同起点跨月仍2327逻辑事务，推进306657ms，Native目录55597208字节（约53MiB）；对比world.1的636068ms和1571589147字节。96人全年Native已完成30446逻辑事务、75330规则子步，推进6025324ms（约100分钟）。年度目录约800MiB，含随后诊断；这些是充足起始资源的容量夹具，不是普通新局或多年性能承诺。最终年度末态七域恢复通过，关系证据按既有规则重绑新Branch；尚未解决完整多年成本、扩大规模或所有复杂角色负载。浏览器三日、停止与恢复证据及精确版本边界归同一Record。

## 战斗与功法操作

选择在场人物后进入「交锋」，可发起敌对接触或请求徒手切磋。每轮基础移动最多两步，加一个主要行动；完整已学斗技库独立于快捷栏，特殊招式先蓄势。调息、服药、救援、撤离、投降和停战分别占用主要行动。同伴可接受、调整或拒绝短令；锁定后继续结算，暂停只停止后续推进。

「人物 → 功法修行」区分持有秘籍、学会、主修、辅助与独立掌握程度。换修真实耗时耗资，完成前仍使用旧底盘，不回满斗气。「交锋 → 现场遗留」提供可见尸身分页、实际接近、查验、金币／库存／原器物实例取用。看守需要真实近身，离场、失能或开始不兼容活动会解除。

投降可附带当前真实持有的金币条件，待对方实际接受后才交割；停战请求由接收方在自己的决策步骤回应。两者均不保证获准或永久和解。QC28要求受援者实际抵达出口，QC29要求原接触停止且当事人存活，QC30要求约定演武完成；单纯发起接触或提前投降不能领取演武成果。
