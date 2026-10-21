# 斗破苍穹开放沙盒世界 — Record

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；本轮实际修改仅在 `docs`。
- Status: D4 Draft v0.7 完整制作稿已汇总，等待整体讨论；尚未正式制作。
- Plan: [方案入口](../../plans/package/doupo-living-world/index.md)

## 当前结果

完成首轮源码与外部资料调查、连续多轮产品讨论、Draft v0.6 的确认项整理及本轮 v0.7 完整制作稿。当前 Bundle 有 10 个 Markdown 文件；既有跨模块决定仍为 D01–D22，具体制作默认值明确为拟定。尚未获得正式开工指令。

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

## 当前交付状态

游戏项目尚未完成。本轮交付为 Draft v0.7 完整拟定制作稿与本 Record，仍处于 D4 整体讨论。
