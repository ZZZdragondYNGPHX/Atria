# 斗破苍穹·众生行 — Native 后端

Task ID：`package/doupo-living-world`。`0.1.0-be.2` 是后端验证构建。正式前端与美术留给集成阶段；`design-reference/` 由另一个对话维护。设定与原创规则的区别见 [设定来源](source/content/SOURCES.md)。实施证据归 `docs:records/package/doupo-living-world.md`，实际接口归 `docs:plans/package/doupo-living-world/frontend-contract.md` 的 C2。

```sh
node tools/build.mjs --core /path/to/Atria --out releases/doupo-living-world-0.1.0-be.2.atria
```

需要包含 `feat/doupo-native-authority` 扩展的 Atria：有界 collection grants、computed 数组引用、真实 anchor、invariantContext、Subject 评价和确定性 Bridge 动作。实际集成 HEAD 见 Record。构建直接调用 Native 容器构建器；随机盐和 nonce 使归档不逐字节相同，重建核对明文内容与 Package 版本。`--out` 独占创建，不覆盖历史归档。

载入顺序：安装并授予 generation → 创建 Session → `experience.ready` → `bind0/1/2` → `act` 创建角色。初始化取得真实 Subject，不在前端推算身份。规则复用 Native Session、Domain、Clock、Information、Task、History、SavePoint/Branch。

容器内 `integration/bridge.json` 是正式前端可引用的作者 Bridge 声明，须经 Native frontend compiler 编译；`integration/screen.schema.json` 是玩家 screen 的闭合 schema。

| Binding | 输入 | 行为 |
| --- | --- | --- |
| `screen` | `{}` | 只读 dw_public，数组中 main.value.screen 为 JSON 字符串 |
| `act` / `choice` / `plan` | 对应 transaction schema | 普通 / 重大 / 1–4 步复合行动，经过生成宿主 |
| `bind0` / `bind1` / `bind2` | `{}` | 新局初始化，不调用模型 |
| `continue` / `cancel` | `{}` | 结算或停止剩余活动，不调用模型 |
| `acknowledge` | `{target:人物key}` | 接纳已完成的 NPC 回应，不调用模型 |
| `browse` / `clues` | `{qty:从0起的页码}` | 已知人物12条/消息摘要8条一页，不推进时间 |
| `recall` | `{target:消息id}` | result.text 为本人已知消息全文，拒绝他人或未知记录，不推进时间 |

规则输入所有字段必填：`{kind,target,item,qty,x,y,detail,text,steps}`；未用字符串填空串、数字填0、steps填[]。`travel/train/wait/rest/marry/conceive/attack/technique/work` 使用 doupo.choice，其他单步使用 doupo.act。复合使用 doupo.plan、kind=plan，steps 每项 `{kind,target,item,qty,x,y,detail}`。创建示例：`{kind:"create",target:"apprentice",item:"female",qty:0,x:0,y:0,detail:"transmigrator",text:"云禾",steps:[]}`。交易 detail 使用当前 quotes.quote 的整数文本。

Bridge 成功返回 receipt，公开 payload 为{}，随后重读 screen。携带实际 epoch/revision/idempotencyKey；重试使用原 key，读档后重开 Bridge 并清理旧目标。结构/CAS/scope 错误由 Native 拒绝；玩法拒绝通常提交 result.code/text。

operation.kind 非空时调用 continue 并重读；appraise 是个人评价，不推进时间。耗时单位分钟。取消保留已走路径、已耗时和物资。复合 result.steps 保存各段结果，partial 表示后段失败或取消前已有成功部分。

talk 提交后由宿主执行 doupo.npc 后台任务；完成后以原人物 key 调用 acknowledge，立即展示 result.text，然后继续评价。完整回应可经 clues/recall 重读。任务取消不撤回已说出的话；读档拒绝旧生成结果。玩家只读 public screen；NPC 使用真实 Subject 个人 view。远方人物 last_known 是已知旧档案，deceased 是已获知死亡，均不提供秘密实时定位。

模型由宿主 Runtime Route 提供：role.intent_resolver 使用 doupo.resolve；narrative 槽使用 doupo.narrate；npc 槽使用 doupo.npc。需要工具调用和结构化 JSON 输出。endpoint、密钥和调用日志在仓库外，GGchan 停用。确定性执行模式由安装包声明，调用者不能临时选择。

首批内容为四出身、两类来源、男女创建、三地区十二场所、24名初始NPC；境界开放至斗师，炼药为基础疗伤散。人口默认96，出生预留计入上限；有地区迁居、NPC家庭、生计和机缘竞争。证据区分：50年纯规则模拟、96人真实脚本沙箱分页、真实 Native Session 家庭出生/恢复与并发 Bridge；不据此宣称96人完整宿主长期运行或无限历史容量。

容量边界：个人信息 grant 128条、关系 grant 256条、家庭48、约定64，Domain最多4096条，History4096项/2MiB；超限拒绝，不静默丢人物或历史。扩大世代容量需要追加设计与验证。正式 UI、Canvas/Controller、宿主任务等待呈现和真实浏览器验收留给集成。验证实现、请求响应、fixture、缓存和机器配置不提交。
