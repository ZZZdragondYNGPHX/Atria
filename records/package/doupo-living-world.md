# 斗破苍穹开放沙盒世界 — Record

- Task ID: `package/doupo-living-world`
- Primary Workspace: `package`；本轮实际修改仅在 `docs`。
- Status: 讨论中；用户要求换设备交接，尚未正式制作。
- Plan: [方案入口](../../plans/package/doupo-living-world/index.md)

## 当前结果

完成首轮源码与外部资料调查、连续多轮产品讨论，以及 Draft v0.6 的确认项整理。当前 Bundle 有 9 个 Markdown 文件；最新跨模块决定集中在 decisions.md。尚未汇总成供整体批准的最终制作稿，也未获得正式开工指令。

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

## 最终状态

游戏项目尚未完成。当前交付为已同步的调研与讨论方案，以及用户明确请求的换设备交接快照。
