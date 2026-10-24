# 设定与原创边界

开局采用小说开篇的本轮家族测试之后、来客会面之前。这里固定的是切点，后续人物与机缘结果由本局规则决定，不重演原著轨道。

2026-10-21 重新读取官方英文译本前三章：

- [第一章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/the-fallen-genius_21770745583562580)：乌坦城萧家测试，萧炎三段、萧薰儿九段。
- [第二章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/dou-qi-continent_21770727598387027)：境界、功法、斗技分别影响实力；功法分天地玄黄及阶内品级；古戒已由萧炎持有。
- [第三章](https://www.webnovel.com/book/battle-through-the-heavens_8093990805004205/guest_21727141209755650)：萧战为族长与父亲，族中长老参与事务；来客会面为相邻事件。未把后续事件结果写为必然。

原有开篇角色为萧炎、萧战、萧薰儿。本轮新增角色与来源见下节。精确年龄、年号、全部修为及开篇当天行程仍有未知；未核实的数值与驻留为游戏参数，并非小说定值。原著角色初期不开放成人关系互动。

原有三地为乌坦城、青山镇与魔兽山脉部分区域，本轮增加黑岩城、石漠城和塔戈尔沙漠外缘。城内具体铺面、房间、药谷、支洞、绿洲、同行路线与旅行耗时均为原创游戏布局；不声称小说精确地理如此。赤叶药材竞争、支洞札记、四类社会出身与非原著 NPC 都是原创内容；札记不是未经核实的原著独特传承或异火。

内部 rank 的唯一映射在 `source/rules/realm.js`：1–9斗之气、10–18斗者、19–27斗师、28–36大斗师，每境界九段／星；主成长实装到大斗师九星。37起斗灵、46起斗王，继续映射至斗尊，供在场人物调用必要境界能力；不表示玩家高阶成长与所有原著招式已经开放。炼药的火中带木与灵魂条件沿用机制调查；伤害、经验、寿元、成年标准、婚育周期、经济与人口数值全部是原创规则。

个人原著记忆只由选择穿越身份的主角持有，不自动成为世界真相，也不进入 NPC 的个人投影。原著未来可能失效；本局历史不因内容刷新而复原。

SHA-256 实现来自 Atria `public/shared/content-sha256.js`（AGPL-3.0），包内替换了受限 guest 的 UTF-8 编码入口。

## 2026-10-23 Wiki / 百科扩充

本轮优先检索小说 Wiki 与百科。Fandom 详情抓取部分被拒绝，采用搜索工具实际返回的条目正文节选，并用中文百科交叉核对；不声称完整读取受限页面。排除同人小说的“小说百科”、电视剧改编亲属设定、动画分集新增情节。机器可读来源为 [sources.js](sources.js)，随发行包交付 `integration/sources.json` 与本文。池条目的 `source` 是其名称/身份依据，不代表全部参数来自小说。

| Source ID | 来源与采用范围 |
| --- | --- |
| jiama | [加玛帝国／百度百科](https://wapbaike.baidu.com/item/加玛帝国/6926230)：地域背景；不采用不明出处的精确方位 |
| blackrock | [Black Rock City／小说 Wiki](https://battle-through-the-heavens.fandom.com/wiki/Black_Rock_City)：黑岩城、公会、飞行运输设施；本版只开放候场地面活动 |
| qingshan | [Qingshan Town／小说 Wiki](https://battle-through-the-heavens.fandom.com/wiki/Qingshan_Town)：邻近魔兽山脉及佣兵活动 |
| yafei | [Ya Fei／小说 Wiki](https://battle-through-the-heavens.fandom.com/wiki/Ya_Fei)：雅妃的乌坦城拍卖师身份 |
| xiao-brothers / xiao-li | [萧鼎／百度百科](https://bkso.baidu.com/item/萧鼎/16392157)、[萧厉／百度百科](https://bkso.baidu.com/item/萧厉/10555076)：兄弟亲属及石漠城漠铁佣兵团；不同百科出走年份不一致，不冻结年数 |
| linfei / xuemei | [琳菲／百度百科](https://bkso.baidu.com/item/琳菲/65361189)、[雪魅／搜狗百科](https://baike.sogou.com/v194539767.htm)：分别师从奥托与弗兰克；不预写考核成功 |
| alchemists | [炼药师／百度百科](https://bkso.baidu.com/item/炼药师/10823622)：弗兰克的公会会长身份；无高品丹药结算或认证功能 |
| little-fairy | [小医仙／搜狗百科](https://baike.sogou.com/m/fullLemma?lid=23132026)：医者及万药斋联系；加入时间不明，开篇在此是沙盒假定 |
| xiao-mei / xiao-ning | [萧媚／搜狗百科](https://baike.sogou.com/v34894437.htm)、[Xiao Ning／小说 Wiki](https://battle-through-the-heavens.fandom.com/wiki/Xiao_Ning)：萧家同辈角色；未核实的年龄和开篇实力不称原著定值 |
| original | 杜衡、谷茗、容青穗、铁承、孟雨笙、温柏、裴青禾、雷朔、韩素灯、祝铁生、宋轻羽、石闻舟、安绫、沙青芦及其生计/来往均为原创；原有原创居民继续保留 |

新增十名原著角色为雅妃、萧媚、萧宁、小医仙、弗兰克、奥托、琳菲、雪魅、萧鼎、萧厉。所有新增角色的年龄、rank、携金、基础技能与开篇精确位置都是沙盒配置；小医仙没有炼药师技能，不以医学能力偷换炼药天赋。不存在未发生的相识、异火到手、毒经修成、药师考核或必然团灭。原著身份不等于其能力体系已完整实现。

新增地点的公开说明可以被玩家在当地调查得到；不向 NPC 导入原著未来，不公开私人目标。六地区、三十二场所、四十八作者 NPC、四名池生成开局居民；八种新增地域职业模板与原有二十种成人模板共用一次抽样入口，另有一个出生模板。普通居民有合适配对图；atlas.1 已补齐十名新增原著人物的开篇专属配对图。

飞行购票、药师认证、竞价拍卖、制造新装备、蛇人核心领地及异火秘境仍未实现。这里的治疗、维修、交易、采集、基础炼药沿用已有可执行规则，NPC 可能外出，设施标签不保证服务者永远在场。

## 2026-10-23 世界地图与美术

[Locations／小说 Wiki](https://battle-through-the-heavens.fandom.com/wiki/Locations) 的可读检索正文用于西北诸国、中州五域与宗门地名；[Black-Corner Region](https://battle-through-the-heavens.fandom.com/wiki/Black-Corner_Region) 用于黑角域、黑域大平原及迦南学院；[Northern Dragon Island](https://battle-through-the-heavens.fandom.com/wiki/Northern_Dragon_Island) 用于兽域、虚空与古龙岛的空间类别。对应来源 ID 为 atlas-locations、atlas-blackcorner、atlas-dragon。详情页部分受限，未声称完整读取。

世界地图是作品目录：六大分区、37 个条目，目前六地区开放、31 个条目未解锁。大陆轮廓、绘制位置、尺度、远疆概括和族界聚合均为原创示意，不是小说精确地图；独立空间绘在图边只为索引，不代表普通岛屿。远疆和未详述空间标记 original。它们不加入可行走地点、道路、人口、库存或角色知识；不导入未来剧情。扩充在 source/pools/atlas.js 的同一状态源推进。

人物沿用现有国风手绘风格，图像为游戏改编设计，不能据此认定小说的精确容貌/服饰。小医仙采用开篇黑发医者形象；没有使用后期银发图代替开篇。十名角色各有肖像与透明 Q 版，新增二十处场景、三幅地区总览和一幅大陆全图。提示词、参考图哈希、无损源图与透明度验证保存在 media/pools/manifest.json 和 frontend/assets/atlas-sources.json；后者随包提供 integration/atlas-media.json。交付副本压缩记录见 frontend/media-delivery.json。

## 2026-10-24 战斗与功法来源

本轮重新取得小说Wiki Cultivation、Ao Tuo、Fu Lan Ke 可读正文，分别核对境界与纱衣／铠甲／凝物／化翼分层、奥托斗灵／四品炼药师、弗兰克斗王／四品炼药师。两位药师未核实精确星级，以各境界一星作为原创沙盒配置；不把药师品阶当战斗境界，不预写后期历史。萧战使用开篇五星大斗师映射rank32；年龄、驻留及非明确星级仍为游戏配置。对应可访问地址与采用范围见 sources.js。

六门主修、三门辅助、十八普通斗技的名称、价格、资格、成长／消耗／命中和效果参数均为原创本地法门；目录唯一位于 source/pools/arts.js，并由同一池派生秘籍物品与商铺供给。焚诀保留储备状态，不借名称开放吞噬异火或无限进化。六种一至三阶魔兽均为原创改编物种，身体、策略、生境与天生能力在 source/pools/creatures.js；不宣称为小说已有物种。兽类不进入人类婚育、职业或秘籍学习。
