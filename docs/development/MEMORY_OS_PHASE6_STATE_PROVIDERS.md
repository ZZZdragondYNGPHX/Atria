# Memory OS Phase 6 — 可选状态源与 Orchestrator

2026-09-16，按修订后的原方案实施。继续 `feat/memory-os`，阶段起点 `072a90f1377af2a1bf67909db964ac0791419269`。

## 基线与边界

- 本地 `custom-release`：`38a8a2dc055dbda1406e71d43838c07de7e6c559`。
- fetch 后 `origin/custom-release`：`112baa3b5f2ad1109a0b143bcffa3d39ec8dc470`。
- 无新基线提交需要同步；feature 已包含本地 custom-release。未创建分支、推送、合并或准备上游 PR。
- 普通文字卡完整保留 Phase 1–5 路径；没有状态脚本时不安装、不启动任何框架。MVU / LoreState 原有更新、校验、快照及原始数据仍由各自框架拥有。

## 回源确认

源码只下载到临时研究目录，没有写入其他项目或把外部源码提交进 Luker：

- [MagVarUpdate global API](https://github.com/MagicalAstrogy/MagVarUpdate/blob/4a3645f19705e9e73bb4df3a8e731d5ff994ce80/src/function/global/index.ts)：宿主窗口上的 `Mvu.getMvuData({type:'message',message_id:floor})` 读取消息变量；`isDuringExtraAnalysis()` 可识别额外更新忙碌状态。`VARIABLE_UPDATE_ENDED` 允许修改待提交对象，不能视为持久化完成。
- [Tavern Helper 事件实现](https://github.com/N0VI028/JS-Slash-Runner/blob/00f714a07315540baf738dad9cd3bb17585a56b4/src/function/event.ts) 和 [变量实现](https://github.com/N0VI028/JS-Slash-Runner/blob/00f714a07315540baf738dad9cd3bb17585a56b4/src/function/variables.ts)：事件包装回调注册到宿主 eventSource；消息变量按 `message.variables[swipe_id]` 读取 / 替换。此源码用于核对调用链，不宣称用户安装了这个版本。
- [LoreState 只读桥接](https://github.com/ZZZdragondYNGPHX/LoreState/blob/97273a5476b81744b83e111cf5517fdbe92724e1/prototype/ejs-bridge.js) 与 [runtime](https://github.com/ZZZdragondYNGPHX/LoreState/blob/97273a5476b81744b83e111cf5517fdbe92724e1/prototype/runtime.js)：同步 `prompt_template_prepare` 读取，返回 detached/frozen API；runtime 自行处理 chat、生成边界、busy 与回放错误。当前维护的是 Tavern Helper 脚本，不使用旧原生扩展。
- Luker `public/lib/eventemitter.js` 的 `emitAndWait` 是同步派发。经 Helper 包装后，当前 LoreState prepare 回调仍同步执行。因此适配器可以用新建的 scoped request 读取并同步复核，**不需要执行 EJS 模板**。这是本次验证所得的桥接路径，不是把一个 iframe 名称直接假设为宿主 API。

## 实际改动

1. `state-providers.js`：可选读取适配器，返回 absent / initializing / ready / error。MVU 只读当前 assistant 楼层的变量表，用户消息使用最近 assistant；schema / stat_data 缺失不冒充空值。LoreState 使用公共事件总线和只读 prepare，传递 chatId / generationType；不使用内部 runtime slot、DOM、私有存储或动态远程 import。每次来源检查重新读取，卸载后不沿用上次快照。
2. 字段从实际状态路径展开，不硬编码角色名字或作者栏目；保留 0、false、null，跳过危险键及 `$` 内部字段。当前读取边界为 256 个叶子、12 层路径、单值 2000 字符；这是有界投影，未宣称全量大状态覆盖。
3. `provider-provenance.js`：在原 `memory_graph__provenance` 增加 `providerSources` / `providerSnapshots`。快照引用 Provider 身份、契约、原字段路径、楼层和正文前缀证据，并为投影登记依赖。快照是派生证据，不提供外部状态写回接口。同 revision 去重；下一楼层变化保留历史版本；同楼层修正、来源编辑、删除、Provider 消失使旧版本 stale。不会伪造原文 Episode 或把状态变化提交成一段聊天引用。
4. MVU 正文编辑但变量表未提交：若旧证据不再匹配且变量内容未变，先记 initializing。观察到宿主替换消息变量表后可确认等值提交；跨重载没有提交见证时保守等待实际变量 revision 变化，避免给旧表重新贴上新正文的来源。
5. `source-lifecycle.js`：事务、updater、持久化返回、检索快照和最终注入 guard 都比较 Provider 读数。正文未变而状态 / schema / 映射变化，也会拒绝晚到结果。聊天切换仍复用原 scope guard。
6. `hybrid-retrieval.js`：Provider 当前字段、冲突和允许记忆的历史字段接入同一个 BM25 / vector / fusion / composer。引用使用独立 `providerSources`，不混作 Episode ID。状态不会被自动翻译成语义关系或重复提取为剧情事件；只有显式映射的 entityId + predicate 用于屏蔽过时的同字段关系及其支持 Fact。普通正文 Fact 仍保留自己的证据，不被变量回写覆盖。
7. `state-prompt.js`：正文注入预算预留既有 LoreState `lorestate_world_v3` 提示及显式指定的其他状态 prompt ID。只对能确认作用域和值的 LoreState XML 字段 / MVU 完整 JSON 做去重；未知模板保留。不会削减原更新规则。已有状态提示本身超预算时，不再追加记忆，trace 返回 `existing_state_exceeds_memory_budget`。这不代表能控制任意第三方世界书 / 模板的全部 token。
8. `hybrid-runtime.js` 使用角色有效配置并复核既有状态提示；正文与 Agent 都调用原 `recallMemory`。Agent 默认不假设正文的外部状态提示已经注入自身请求。
9. `orchestrator-tools.js` 增加 read 工具 `memory_recall`，沿用统一扩展注册机制，四种编排模式均可授权调用；返回预算内共享上下文和来源。既有工具保留。默认 Director memory_scout 新配置优先使用它，旧保存预设不强制迁移。工具不读取、写入或把 agent scratch 提升为事实，失败不保存模型推断。同步更新工具名集合及旧权限转换测试，保持 override narrowing。

## 配置

使用现有 memory_graph 设置及角色 advanced override，不新增独立配置服务；Phase 7 再提供图形编辑入口：

- `memoryOsStateMappings`：数组，每项 `providerId`（mvu / lorestate）、`path`（字符串数组），可选 `key`（跨 Provider 同义字段标识）、`label`、`entityId` / `predicate`（已存在的语义关系映射）、`remember`。
- `memoryOsStateOwners`：key → providerId。未指定而同义字段不同值时呈现冲突；没有固定 LoreState > MVU 顺序。没有语义映射的字段保留各自命名空间，不猜测不同路径是否同义。
- `remember: true` 允许该字段的旧版本进入历史检索；其他字段只提供当前投影，避免每次数字波动都进入长期召回。旧快照留作证据审计，未自动创建全量 Atomic Fact。
- `memoryOsStatePromptIds`：可选全局 prompt ID 数组，供已知的作者状态注入预留预算。无法识别的世界书注入不假称已去重。
- `memoryOsTokenBudget`：默认 2400。加入 advanced 配置的规范化；其他功能开关及私人修复保持原路径。

## 执行的验证

- 最终相关回归：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --silent --verbose=false memory-graph orchestrator floor-state`（tests 工作目录），**155 suites / 1900 tests 通过**。
- Provider 与权限 / 工厂预设定向回归：4 suites / 40 tests 通过。新增状态测试覆盖无 Provider、MVU / LoreState、busy / error、任意字段、冲突 / 权属、去重、历史、编辑未提交、持久化竞态、聊天切换、卸载及 token 等待期间失效。
- 真实隔离 Luker 服务 + Edge 153.0.4234.32：`node tests/frontend/memory-os-source.smoke.mjs http://127.0.0.1:18742 msedge <研究副本/prototype/ejs-bridge.js>`，**22 项通过**。实际执行未修改的 LoreState EJS bridge 源码与宿主 eventSource，状态读数为受控 fixture；MVU getter 使用与源码一致的消息表 fixture。验证共存 / 冲突 / 权属、只读、来源不变时失效及 dispose。复跑曾因临时实例保存了旧 owner 设置而失败，测试已显式重置 owner，复跑通过。
- 首次完整回归发现旧权限测试硬编码 15 个 memory 工具，随新工具更新为 16 后通过。
- 新模块及主要修改的独立模块 / 测试 / 浏览器脚本 ESLint 通过。main.js 仍有 202 个既有错误；orchestrator/persistence.js 有 3 个既有错误；custom-tools-legacy-migration.test.js 有 1 个既有 unused import。未宣称全仓 lint 通过。
- 修改 JS/MJS 语法检查、完整 diff 检查及 `git diff --check`；隔离服务器前端库编译成功。

## 验证范围与下一阶段

本阶段已实现可选适配和共享上下文路径，未安装或执行完整 MVU / LoreState 更新模型，也未做 Android 真机或长期大状态测试。浏览器桥接测试不等于完整外部框架验收。未验证版本不猜 API；不支持的能力返回缺席 / 不可用，而非加载外部脚本。用户已允许这些缺口记录后继续，不要求用户补测。

当前状态转历史以已观察的楼层 / 来源变化为证据；不是完整外部数据库的自动同步。字段自动语义识别、任意模板去重、未观察到的历史变量修订及大图性能不在本次宣称范围。

下一阶段按原方案 Phase 7：Global / Local Graph、Inspector、Filters、Pending review 与手动修正。展示 Provider 状态、字段权属和来源，并清楚区分可编辑的 Memory OS 数据与只读外部状态；不要在图形界面绕过来源框架写变量。
