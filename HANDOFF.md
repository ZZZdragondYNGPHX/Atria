# 斗破苍穹开放沙盒世界 — 换设备交接

本快照由用户明确要求“更新好后推送并发我交接提示词，我要换设备继续”而建立。交接生命周期遵循 [Governance §7](README.md#7-handoff)。

## Task

- Repository: `https://github.com/ZZZdragondYNGPHX/Atria.git`
- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；本轮实际文档工作空间/分支为 `docs`。
- Current HEAD（交接快照基准）: `docs@8cd471afc216b98c02dd100e7635ea554f9a32d6`。
- 本交接文件在上述方案提交之后追加；交接载体提交可通过 `git log -1 --format=%H -- HANDOFF.md` 核实，实际最新 Git 状态优先。
- Source research baseline: `main@f9a8a83827c8b3662c44e67e95c9ed84118baadd`；恢复时核对当前实际 main，不为匹配旧文档回退源码。
- Package state: 本任务尚未创建游戏资产、发布包或专属源码工作分支，没有本任务游戏成品 HEAD。
- Current stage: D4 制作基线，Draft v0.6；最新选择已记录，完整制作方案尚待汇总，未获正式开工授权。
- Plan entrypoint: [plans/package/doupo-living-world/index.md](plans/package/doupo-living-world/index.md)
- Stage-required modules: index → [decisions](plans/package/doupo-living-world/decisions.md) → [content-and-runtime](plans/package/doupo-living-world/content-and-runtime.md)；需要规则、UI 或技术依据时，再读对应模块，不一次加载所有文件。
- Record: [records/package/doupo-living-world.md](records/package/doupo-living-world.md)

## 已完成

- 多轮讨论形成 D01–D22，最新选择已经写入 v0.6；权威决定只在 decisions.md，不把候选默认值当作已批准内容。
- 建立 9 文件的模块化 Plan Bundle，整理当前 Atria 源码能力、技术边界与外部资料依据。
- 用户允许 Wiki/百科用于机制设定调研；已补充境界、功法、斗技、炼药、丹药、异火、组织和地域结构。
- 源码侧核实了世界推进、个人视角、权威结算、关系评价、原生前端与 Session 恢复的相关机制。没有运行真实游戏负载、真实模型生成或完整浏览器验证。
- 本轮方案与 Record 已在交接快照基准提交中保存；本交接文件随下一提交一起推送。

## 已确认的产品方向摘要

以下为便于恢复的摘要，详细决定与边界以 decisions.md 为准：

1. 基于 Atria 的开放沙盒 RPG，参考《觅长生》，设定以小说为准，可使用 Wiki/百科整理机制。
2. 有世界地图与 2D 俯视地点场景，点击地面或对象移动，选择 NPC 自动接近；自由文字贯穿功能。
3. 小说开篇附近开局，自创角色、多种出身可选；本土人或保留原著记忆的穿越者创建时可选。
4. 历史可以自由改写，关键人物命运、机缘归属和势力结局均可改变，不强行复原原著结果。
5. 时间随有意义的行动推进；思考、输入和退出游戏期间暂停。
6. NPC 自主生活与长期时代演化优先，允许离屏自然死亡、势力覆灭与机缘被夺。
7. 同一主角长期成长并见证世代变化，不采用死亡后切换后代/弟子的游玩方向。
8. 采用深度规则，成长路线自由组合；战术回合或分段交锋，按钮与自由文字都能操作。
9. 自由手动与自动存档，死亡后可读档恢复完整世界，包括人物关系、记忆、任务和历史。
10. 优先贯通 NPC 关系日常与探索争夺；亲密关系、婚姻与家庭也纳入长期玩法。
11. 首批做乌坦城生活、青山镇与魔兽山脉部分探索，后续逐步扩展。
12. 电脑为主要目标，模型交互质量优先，可接受等待更丰富深入的表现。
13. 实际影响开发的 Atria 缺陷可以修补；优先复用现有状态、持久层、身份与权威机制。

## 尚未完成与下一步

1. 汇总一版可整体检查的制作稿：首批玩法与场景、出身默认方案、日常/关系/亲密/婚姻家庭、探索与竞争、成长与战斗衔接、UI 与美术默认方向、数据职责和实施顺序。
2. 将技术调查转成验证安排，优先动态人物关系、完整世界恢复、长时推进、信息扫描与长期状态增长。具体源代码证据在 research.md。
3. 人口/场景/数据规模和性能目标需通过实际负载确定，当前没有测得上限；不能把 job 模板或扫描预算误写成 NPC 人数上限。
4. 具体模型/连接、实际生成等待与调用配置尚未落实，未自行设置日调用额度或 RPM 硬上限。未将任何私有连接、凭证或开发机硬件信息提交。
5. 完整制作稿尚未汇总，也未获得正式开工指令。用户最初明确要求讨论确定后正式开工；本次推送与交接不替代该确认。

## 已定位的关键技术边界

- `src/native/appraisal-authority.js:86-87` 的关系评价目标接纳要求 manifest Actor；动态 Subject 与后续世代人物需验证并按实际需要扩展既有身份/评价权威。
- 当前 Simulation 声明与单次工作预算、Information 扫描上限和状态 clone 影响大世界表达，需以实际负载决定聚合、索引或局部修补。
- Session 历史恢复具有基础能力，但跨 Session/外部记忆、后台迟到结果与恢复后个人认知的隔离尚未验证；完整恢复是已确认目标。
- 可选内建寿元不是现成斗气境界寿元表，优先研究用现有 Domain/Clock/computation 表达游戏规则。

## Git 与其它本地改动

- 本次只提交本任务的 Plan Bundle、Record 与 HANDOFF，不夹带其它任务的 dirty changes。
- 交接前的 docs 工作树另有 world-evolution-consistency、foglight-inn 等任务改动和旧 doupo-open-world 草案的未提交删除；它们未由本次推送备份。
- 因旧草案的本机删除未被纳入本任务提交，远端仍可能保留旧路径。不要把它当作本任务入口或从其中导入历史“已确认”要求；当前入口是 doupo-living-world。
- 新设备先核对 Git、fetch 最新 docs，以 `git show` 或合适的 docs 工作树读取。保护已有改动，不直接覆盖 dirty checkout，不 merge main 到 docs/package。

## 验证事实

- 当前方案与 Record 已完成文件链接、标题锚点、Git whitespace 检查，以及机器绝对路径/明显凭证模式检查；交接文件提交前补查其链接。
- 源码工作树未改动；没有游戏构建、压测、真实 Provider 生成或浏览器工作流测试可报告。
- Atria 工具未建立源码到运行实例的可验证身份链，不能声称已做源码对应的运行验证。

## 新设备续接提示词

继续 Atria《斗破苍穹》开放沙盒项目，Task ID `package/doupo-living-world`。先核实实际 Git 状态并 fetch 最新 docs，再读取 `docs:HANDOFF.md`、`plans/package/doupo-living-world/index.md`，按 D4 路由只读当前所需模块和 Record。Draft v0.6 已记录本轮全部选择；请先更新方案，汇总完整制作稿，再继续整体讨论。不要重复询问已确认方向，不把交接当作正式开工授权，不从 doupo-open-world 旧草案导入历史确认，不夹带其它任务改动。实际影响目标的框架问题可纳入方案；在用户确认正式启动前，不制作游戏或修改产品源码。
