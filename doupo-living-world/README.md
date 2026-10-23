# 斗破苍穹·众生行 — Native 后端

Task ID：`package/doupo-living-world`。`0.1.0-be.3` 是世界自主运转深化后的后端验证构建，包含身体/伤势、真实活动与补给、器物损耗和维修、NPC成长/后台冲突、个人图谱/消息及因果事件查询。正式前端与美术由后续集成负责；`design-reference/` 由另一个对话维护。设定来源见 [SOURCES](source/content/SOURCES.md)。当前实际接口为 `docs:plans/package/doupo-living-world/frontend-contract.md` 的 C3，实施证据归同一 Record。

```sh
node tools/build.mjs --core /path/to/Atria --out releases/doupo-living-world-0.1.0-be.3.atria
```

需要 Atria `main@4470cffb9f688d7e889eb94b42b1cb85966318c1`：保留既有 Native Authority/Subject/Information/Bridge 扩展，并支持有界计算输出组合、显式 invariant 读取预算和计算输入组合预算。单值、总读取、CPU、堆和 effects 限额继续生效。归档使用随机盐/nonce，重建核对明文与版本；`--out` 独占创建，不覆盖历史版本。

载入顺序：安装并授予 generation → 创建 Session → `experience.ready` → `bind0/1/2` → `act` 创建角色。Subject 由 Native 初始化绑定，前端不得推算身份。本版 Domain 结构较 be.2 发生变化，使用新局，不声明旧存档迁移。

容器内 `integration/bridge.json` 是需经过 Native frontend compiler 编译的作者声明；`integration/screen.schema.json` 为公开 screen 的闭合 schema。只读 `dw_public`，禁止向前端发送人物 Domain 或 NPC 个人 view。

| Binding | 输入 | 行为 |
| --- | --- | --- |
| screen | {} | 数组中 main.value.screen 为 JSON 字符串；同条 intent 为有界公开摘要 |
| act / choice / plan | 对应 transaction schema | 普通 / 重大 / 1–4步复合动作，通过生成宿主 |
| bind0 / bind1 / bind2 | {} | 新局身份绑定，不调用模型 |
| continue / cancel | {} | 推进或停止活动；保留已发生的时间、物资和后果 |
| acknowledge | {target:人物key} | 接纳 NPC 已完成回应，不调用模型 |
| browse / clues | {qty:从0起的页码} | 人物12条、线索摘要8条一页，不推进时间 |
| recall | {target:消息id} | 本人已知记录全文，不推进时间 |
| condition / profile | {} | 更新人物详情；读取 screen 的结构化字段，不解析 result.text 为详情 JSON |
| event | {target:事件id,page:从0起的页码} | 本人已知事件详情；只更新公开回执，不改变物质状态或推进时间 |

所有规则输入字段必填：`{kind,target,item,qty,x,y,detail,text,steps}`；未用字符串为空、数字为0、steps为[]。`travel/train/wait/rest/marry/conceive/attack/technique/work` 使用 doupo.choice，其余单步使用 doupo.act；复合使用 doupo.plan、kind=plan，steps最多四项 `{kind,target,item,qty,x,y,detail}`。创建例：`{kind:"create",target:"apprentice",item:"female",qty:0,x:0,y:0,detail:"transmigrator",text:"云禾",steps:[]}`。交易 detail 为当前 quote 整数文本。

新操作：`treat` 的 target 为本人或近处病人，detail 为伤处id，需要能接诊的医者、两份药草、十二金币；`equip` 的 target 为自有器物id，detail=remove 时卸下；`repair` 需要工匠、一份药草和六金币，原器物在维修期间不可生效；`message` 使用本人已知地址寄信，text为正文；`release` 只能释放自己实际控制且在身边的人。普通药物不修复缺肢或未处置骨折。

screen 的 condition/gear/control/social/goals 为玩家本人数据；people 仅提供当前实际可见或旧观察，含 signs/activity/carrying/observedAt，不含他人私有伤处、物品、目标或图谱。last_known 是旧记录，不能用作实时定位。messages 是已知信件摘要；events 是最近16个已知事件入口。event 的 result.text 是带 details/page/pages 的 JSON；未知与私有事件统一拒绝。更早的合法事件可按已保存 id 重读，不因目录滚动删除事实记录。

operation.kind 非空时 continue 并重读，appraise 不耗时；耗时单位分钟。Bridge 使用真实 epoch/revision/idempotencyKey，成功后重读 screen；恢复后重开 Bridge、清除旧目标。玩法拒绝见 result.code/text，结构/CAS/权限拒绝由 Native 报错。talk 等待已有回应时不覆盖原请求，cancel 可结束等候；已说出的话不撤销，取消生成或读档后拒绝迟到结果。

NPC 使用真实 Subject 的个人 view，规划由规则根据自身人格、目标、动机与可见线索执行，模型负责有界回应/意向。模型不写物品、伤亡或婚约。宿主路线：role.intent_resolver → doupo.resolve，narrative → doupo.narrate，npc → doupo.npc，需要工具调用与结构化 JSON。连接/凭证仅保存在仓库外；GGchan 停用。本轮真实服务结果见 Record，不能将模拟传输当模型质量证明。

首批三地区十二场所、24名初始NPC，人口上限96（含出生预留）。本轮证据包括60日不同分批的人物结果一致、420日纯规则演化、真实 Native 的治疗/冲突/维修/控制/事件查询与完整恢复，以及96名NPC成熟数据的早期推进和74人同场分页。它们不证明96人跨月完整宿主性能、无限历史、全部候选社会策略或最终界面已完成。

边界：伤处8、器物4、当前个人图谱16、目标/动机各6、热信件16、热冲突4；个人信息grant128、关系grant256、家庭48、约定64、Domain4096条/1MiB、History4096项/2MiB。重要因果保留有界稀疏前后变化及来源，常规生活不为每次进食创建独立事实记录。容量超限拒绝；未承诺无限世代。继承仍为简化直接转移；完整玩家战斗按D33后续实施。多尺度聚合与96人长期宿主成本仍需深化，正式UI/Canvas/Controller、浏览器与美术不在本归档内。测试、fixture、日志、缓存和机器配置不提交。
