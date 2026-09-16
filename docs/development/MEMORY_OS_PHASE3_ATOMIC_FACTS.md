# Memory OS Phase 3 — Atomic Facts

沿用原方案第 5、7、12 节及 Phase 3，未另建路线。起点 `9b271648cb97547a2257ef3c4e139b04b1096a64`，继续 `feat/memory-os`。fetch 后本地 `custom-release` 为 `38a8a2dc055dbda1406e71d43838c07de7e6c559`，远端仍为 `112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`；均已被功能分支包含，无需同步。

## 实际架构与数据契约

- 新增 `atomic-facts.js` 纯数据算法和 `fact-extraction.js` 工具契约；生产抽取仍经 `main.js → context.generateTask`，使用原有 API/prompt preset、取消和语义重试路径，不增加模型请求服务。
- Fact 位于已有 `memory_graph__provenance` chat-state 账本的可选 `facts` 字段；旧 version 1 账本无该字段时视为无事实。未新增数据库、变更应用版本或迁移全部历史。账本与 Phase 2 共用显式 target、聊天队列和提交前来源校验。
- Fact 使用独立 UUID，包含 scopeId、text、type、confidence、importance、accessCount、可选有效时间、创建/更新时间、status、episodeIds。accessCount 初始为零；召回访问计数属于后续检索阶段。
- `supports` 保存独立证据组：稳定 ID、Episode IDs、原文 excerpt、confidence、createdAt。每组内部的所有来源必须有效；多个独立组可以相互强化，部分组失效时仍可保留其他有效支持。事实的 episodeIds 包含完整历史证据，confidence 仅取当前有效组的最大值，不因重复抽取累加。
- 每条创建/强化/替代断言必须引用本次来源票据的 Episode 原文子串。匹配引文只能证明来源存在，不能自动证明语义蕴含；分类与同义判断仍由模型决定，真实准确率未声明达标。
- `explicit / inferred / summary` 分开存储，置信度上限分别为 0.95 / 0.65 / 0.75。推断或摘要不能替代显式事实；强化不能更改事实类型。

## 抽取、演化与失效

开启默认关闭的 `memoryOsEnabled` 后，原抽取请求额外携带来源 Episode 和最多 100 条当前事实提示，提供 `luker_memory_facts`。模型必须在最终 done 前返回一次事实操作，空 operations 表示无新事实。即使没有活跃的旧节点类型，原子事实仍可抽取。关闭时沿用旧工具协议，不采集新 Fact。

四种操作：

| 操作 | 行为 |
| --- | --- |
| create | 同类型、同文本规范形式、同有效时间的当前事实去重；其余分配新 ID。精确去重不承担跨语言实体解析。 |
| reinforce | 为指定当前事实增加独立证据组；相同引文重复提交幂等，不提高置信度。 |
| merge | 显式指定同类型、同有效时间的两个当前事实和等价理由；保存来源记录及 mergedInto，将支持合并到目标。合并推理也依赖本次票据，源修订后不会静默恢复旧事实。 |
| supersede | 为有证据的新断言创建/复用事实，保留旧文本、支持、supersededBy 和理由。新来源后来失效时旧事实变 disputed，不自动恢复为当前真相。 |

依赖扩展为 `episode → fact`。来源 edit/swipe/delete 后，事实在读取与账本事务时重新计算 active/stale/superseded/disputed；默认查询仅返回 active。合并/替代属于基本演化操作，完整实体解析、时序冲突求解留在 Phase 4。

公开 Memory API session 增加 `getFactSources()`、`applyFacts(operations)`、`listFacts(options)`；顶层 API 增加 `listFacts(context, options)`。使用原会话票据写入，异步返回时源已改变则拒绝。读取返回独立副本，`includeInactive: true` 可检查证据历史。Agent 完整工具编排仍属于 Phase 6。

Fact 账本写入自身是批次原子操作：任一操作无效则整批不保存。它与旧图谱 FloorState 的提交不是跨账本事务；Fact 来源有效时，后续旧图节点提交失败不会回滚已保存的 Fact，重复抽取依靠去重保持幂等。尚未把 Fact 自动混入旧节点向量检索或提示注入；统一检索和预算归 Phase 5。

## 实际检查

实际执行：

- `tests` 下 `node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`：152 套件、1859 项全部通过。
- 最终重试提示与有效时间提示调整后，重跑 atomic-facts、fact-extraction-pipeline、source-lifecycle：3 套件、30 项通过。
- 全部 10 个新增/修改 JS/MJS 文件 `node --check` 通过，最终修改的两个文件另行重检；`git diff --check` 通过。
- 新模块、相关 source/API 模块和测试 lint 无诊断；`main.js` 保留原有 202 项错误，没有新增数量。不声明全仓 lint 清洁。
- `node tests/frontend/memory-os-source.smoke.mjs http://127.0.0.1:18742 msedge`：11 项检查通过。

新增单元测试覆盖证据、类型与置信度、幂等、独立/联合来源失效、merge/supersede、序列化、整批拒绝、来源修改和持久化边界。生产抽取函数集成测试仅模拟模型响应，运行真实工具 schema 验证及语义重试，覆盖请求包含事实工具、无旧类型抽取、虚构引文重试和迟到结果拒绝。

真实 Web smoke 扩展至 11 项：在临时 dataRoot 的 Luker 2.7.0 + Edge 153.0.4234.32 中，公开 API 创建显式/推断 Fact、检查置信度、经 UI 编辑来源并刷新重开聊天，确认 Fact 失效与持久化。使用本阶段工作区源代码，不用单元测试替代浏览器执行。未配置的 Stable Diffusion 服务仍有独立请求错误；未捕获 pageerror 不表示整个控制台无错误。

用户已授权继续逐阶段开发，不将缺少真实 LLM/Android 的测试变为用户操作前置条件。覆盖缺口：真实模型抽取准确率、Android、完整 swipe/regenerate/删楼/跨聊天请求 UI 矩阵、长聊天性能、跨标签页同时写同账本。记录保留，不报告为通过。下一阶段按原方案实现 Temporal Graph。

修改文件：两个新增算法/工具模块，`main.js`、`api.js`、`source-lifecycle.js`、`source-provenance.js`，两个新增单元/集成测试、现有 source-lifecycle 测试及 Web smoke，以及阶段记录、原方案链接、Phase 2 覆盖边界和交接文档。
