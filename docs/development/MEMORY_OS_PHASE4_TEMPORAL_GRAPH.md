# Memory OS Phase 4 — Temporal Graph

依据原方案第 6、8、9 节及 Phase 4，在 `feat/memory-os` 接续 `f9da66c85c8d1473842b908a23bde4d30e5b4736`。本轮 fetch 后本地 `custom-release` 为 `38a8a2dc055dbda1406e71d43838c07de7e6c559`，远端为 `112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`，均已包含在功能分支内，没有再次同步。未创建分支、合回主线或准备上游 PR。

用户在本阶段明确：这是个人试验田，可以不兼容旧数据。因此不新增旧数据迁移或兼容层；保留现有私人功能，测试缺口不阻止后续阶段。

## 真实存储与执行路径

- `temporal-graph.js` 实现实体解析、合并映射、时序关系和冲突投影；`temporal-extraction.js` 提供现有抽取工具的 graphOperations schema 和提示。
- 继续使用 chat-state `memory_graph__provenance`，增加 `entities / relations / entityPending / predicates`，没有额外数据库或服务。
- 原 `luker_memory_facts` 工具现在要求 `operations` 和 `graphOperations` 两个数组，可以都为空。同一次请求中的新实体通过批次 ref 引用，新 Fact 通过 factIndex 引用；持久化 ID 仍由程序分配 UUID。
- Fact 与 Temporal Graph 在同一个账本事务中验证并保存，任一操作无效则整批不落盘；沿用来源票据、显式 target、队列、状态 updater 内的校验。与旧图节点 FloorState 仍不是跨账本事务。
- 公开 session 增加 `applyMemoryBatch({facts, graph})`、`listTemporalGraph(options)`、`resolveEntity(name, type)`；顶层 API 也提供 listTemporalGraph。完整图 UI 属于 Phase 7，本阶段提供可调用的校正操作。

## Entity / Alias / Resolution

类型为 Character、Location、Organization、Item、Event、Quest、Concept。名称与 ID 分离；names 保留有来源的 canonical/alias 历史，读取时只采用当前有效的名称证据。

解析依次检查同类型的 canonical 精确匹配、alias 精确匹配、NFKC/空白/大小写规范匹配。唯一命中复用 ID；同名或别名冲突进入 pending，不自动新建另一个实体。上下文候选必须在当前 scope 中、同类型、唯一、置信度至少 0.9 且有理由才复用，否则保留待处理记录。此置信度是模型声明，不代表已完成真实模型准确率标定。

提供 alias、rename、merge_entity、split_entity、resolve_pending 操作。合并保留来源实体和历史，在读取时映射到目标；原关系端点不被重写。通过原实体 ID 在合并期间新增的关系也保留原 ID，撤销合并后恢复。已解析为目标 ID 的名称引用不能凭空恢复未记录的另一身份。拆分是撤销显式 merge 操作，不是自动语义拆分算法；错误别名/上下文解析仍需后续 UI 配合人工校正。

重命名保留旧名可查；合并后的来源名称会出现在目标别名投影中，撤销后消失。拒绝自合并、跨类型合并及形成循环的合并。merge 的来源失效后不静默重认身份，而将相关实体标 disputed，关系排除。split 保留撤销理由和证据，作为明确校正记录。

## Relation / Temporal Validity / Conflict

关系包含独立 ID、scope、原始 source/target entity ID、predicate、label、策略、Fact 支持、Episode 引文、可选时间及状态。读取返回有效映射后的端点和 originalSourceEntityId/originalTargetEntityId。拒绝未知/失效端点、非活跃 Fact、虚构引文，以及 similarity/related 等不能表达本阶段语义的泛关联 predicate。置信度来自当前有效 Fact 支持；依赖覆盖 Episode、Fact、Entity 到 Relation。

| 策略 | 当前行为 |
| --- | --- |
| persistent | 保持有证据的长期关系，不以新增边自动替换旧边。 |
| multi_active | 可同时存在多个目标；visited、member_of 默认使用此策略。 |
| replace_current | 按同 predicate 的排他端分组处理冲突。located_in 按 source 分组，owns/holds 按 target 分组。 |

每个 predicate 的策略与排他端在 scope 内固定，后续请求不能静默更换。相同原始端点、predicate 和时间区间的重复关系强化支持，不无限追加。

时间使用可选的 validFrom/validUntil 标签与 timeOrder/untilOrder 数值顺序。程序不按抽取抵达顺序推断剧情先后，也不把任意字符串或章节名做字典序比较。明确更晚的关系替代旧关系，保留 supersededBy 和结束边界；更早但后抽取的关系只进入历史。未给出可比较顺序或同一时刻的冲突为 disputed；推断不能替代有效的显式关系，也不能通过 resolve_conflict 绕过这一限制。

本阶段 validUntil/untilOrder 表示已关闭的历史区间，不承诺未来计划到期调度。`listTemporalGraph({at: number})` 按可比较顺序检查左闭右开区间，返回证据有效的历史/当前关系，并保留其原生命周期 status；未知边界不会假装命中。`includeInactive: true` 用于检查全部历史。完整查询意图与当前/历史问题路由属于 Phase 5。

resolve_conflict 指定赢家、同一排他槽的输家、理由与当前证据，保留败选边。替代来源失效时，旧关系进入 disputed，不自动复活。实体合并揭示的新排他冲突同样退出活动图。不会声称自动解决所有叙事矛盾；跨 predicate 的语义冲突仍需 Fact supersede 或显式操作表达。

## 检查

实际执行：

- 在 `tests` 运行 `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`，最终 153 套件、1875 项通过。
- 调整原始端点、证据强度及工具契约后，针对性测试通过；其中四个相关套件共 46 项通过。
- `node tests/frontend/memory-os-source.smoke.mjs http://127.0.0.1:18742 msedge` 最终 13 项通过。
- 10 个新增/修改 JS/MJS 文件执行语法检查通过；最终改动模块重检通过；`git diff --check` 通过。
- 新模块及相关 source/API/测试 lint 无诊断；main.js 仍为已有 202 项错误，没有新增数量，不声明全仓 lint 清洁。

核心单测覆盖精确/别名/规范解析、候选门槛、pending、重命名、合并/撤销、原始端点留存、冲突、排他方向、历史区间与乱序抽取、推断限制、批次拒绝、来源删除及序列化。生产抽取集成测试运行真实工具 schema 校验，仅模拟模型响应，验证同响应 Fact/Entity/Relation 原子保存及错误端点导致整批拒绝。

浏览器测试在隔离 dataRoot 的真实 Luker 2.7.0、Edge 153.0.4234.32、1280×900 上执行，扩展 smoke 至 13 项：包含公开 API 写入实体和 has_color 语义关系、UI 编辑来源、刷新重新选中聊天后仍失效。未替换服务端 state API，没有使用日常聊天数据。未配置 Stable Diffusion 服务仍有独立请求错误；无 pageerror 不等于控制台完全无错误。

未覆盖：真实模型的消歧/关系语义准确率，Android、跨标签页并发、大规模图性能，以及完整 UI 生命周期矩阵。当前算法包含按图遍历和成对冲突检查，未做长聊天规模性能承诺。用户已授权这些缺口继续保留记录，由代理尽量补测，不要求用户先手测。

下一阶段：Phase 5 Hybrid Retrieval，将 Facts、Temporal Graph、Episode 与既有向量/关键字路径接入统一查询、融合排序及上下文预算；本阶段尚未把新图混入旧提示注入。

修改文件：新增 temporal-graph.js、temporal-extraction.js、temporal-graph.test.js、本阶段记录；更新 main.js、api.js、fact-extraction.js、source-lifecycle.js、source-provenance.js、fact-extraction-pipeline.test.js、memory-os-source.smoke.mjs、原方案链接及 AI_HANDOFF.md，共 13 个文件。
