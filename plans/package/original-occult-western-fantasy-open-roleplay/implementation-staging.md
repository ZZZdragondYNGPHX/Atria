# 实施阶段与停止边界

全任务共用 index指定的 Task ID、Primary Workspace、任务分支及唯一 Record。阶段结束更新真实 HEAD、实际验证、Record和 live HANDOFF并停止；用户明确继续才进入下一正式阶段。不能因开发环境仍可用就自动跨阶段。

## Phase 0 企划与换设备交接

产出：完整 Plan Bundle；原样参考 HTML／TXT与来源说明；package派生任务分支；初始 Record；唯一 HANDOFF；相关 refs推送。只做文档与参考资产，不改产品或发布 .atria。该阶段已完成。

## Phase 1 契约核对与实施设计

按 index路由核对当前事实，选择最小可玩纵向闭环，给出输入 → 意图 → 权威判定 → 叙述 → 保存的实际映射。逐项标记现有支持、Package即可改、需要Core及暂缓；明确普通／铁人终局、动态内容安全性和AI预算。

已完成的设计产出为runtime-contracts的源码映射和A/B/C缺口、player-experience的五题组合与起点、world-supernatural的机构/非法路径，以及下列检查和完成定义。只有真实缺口才计划Core变更，避免万能动作引擎或全城市模拟。技术无法按原提案实现时解决普通工程方案；只有涉及冻结产品方向变化才请求用户判断。本阶段不实现产品，完成设计记录后停止。

## Phase 2 Core最小支持

只实现Phase 1确认的Core缺口，独立main派生辅助分支。复用权威与持久化，验证请求重复、失败和终局相关风险。记录同一Record。

若无Core缺口，记录“无代码适用”而不是虚构支持或跑无关全仓库检查。本阶段完成后停止；Core如何集成由实际改动与治理确定，未经验证不合并main。

## Phase 3 Package体验与内容

问答组合背景、多个非调查开局、可自由表达的实际路径，第一批成熟机构超凡机制和可玩的非法探索路线，有限演化、动态内容与模式规则接入。旧调查可作为情境内容重新评估，不保留它的默认主导地位。

以短期闭环优先，不强加年限／千回合门槛。明确schema、版本身份、编译产物与历史资产保护；不覆盖旧releases。完成目标与对应验证后停止。

## Phase 4 真实前端重构

按用户视觉护栏重构入口、问答、叙事流、草稿建议与辅助抽屉，接入已确定真实运行状态与保存服务。重构允许调整模板、CSS和展示控制器，不只换色，不创建平行聊天authority。

浏览器验证正式流程与响应式。不能以静态HTML或合成模型演示冒充运行证据。完成后停止。

## Phase 5 集成、版本化与收尾

验证Core／Package匹配、普通与铁人终局、自由动作与超凡后果、恢复连续性、预算与相关UI，修复实际失败。仅在这些目标有足够证据后创建新版本资产；版本号和发布方式根据原项目契约决定。

产品辅助分支验证并按治理集成main；游戏任务分支完成集成package，保留旧发布，验证最终refs。完成后更新永久Record、移除live HANDOFF并清理短期分支。不能把package任务分支合并main。

## 共同提交与证据

每阶段尽量形成清楚可审阅的提交。docs记录可引用实现／测试HEAD；实现分支不反向存当前docs提交，避免循环。按用户 2026-10-04 最新 AGENTS.md 指令：每阶段及任务完成时，只在本地执行最小相关验证。该指令替代此前提供的 AGENTS.md 指令；不启动/等待/依赖远端 CI，推送后 refs 核对是发布确认。

新设备恢复不重新开展已完成方向讨论，不重复保存参考，不先运行全部历史soak，不恢复旧Plan中已被本任务替代的默认产品方向。

## Phase 1定案：实施文件与检查路由

路径中的Package相对游戏根，Core相对main根。以下为后续要做的工作/测试，当前未执行，不能据此声称通过。Phase 1只检查源码路径、事实与文档。

| checkpoint | 修改范围与具体产出 | 相关既有验证入口及完成门槛 |
| --- | --- | --- |
| Phase 2 A | Core `session-core.js`、`authority-turn.js`、`authority-transaction.js` 的开始准备/提交；固定Native Host catalogue/bridge及实际HTTP服务增加开始动作；声明schema与能力gate | `tests/native/session-core.contract.test.js`、`authority-candidate-c2.test.js`、`authority-turn-c3.test.js`、`frontend-bridge.test.js`、`session-runtime-http.test.js`：0 provider发送、相同开始输入幂等、矛盾/伪造输入拒绝、CAS失败不留半角色、旧Package无声明保持原行为 |
| Phase 2 B | Core `adapters/generation-host.js`、`authority-turn.js`、`model-prompt-runtime/persistence.js`/发送边界与Session repository既有持久化服务，固定选择与provider attempt ledger；generation-service的retry/fallback共用opt-in限额 | `authority-turn-c3.test.js`、`authority-integration-c4.test.js`、`model-prompt-runtime-persistence.test.js`、`simulation-task.test.js`、`simulation-session.test.js`：进程重开同输入保选择/RNG、旧回执不重复发布、重试/fallback/unknown均扣额、stale/取消后不接旧结果 |
| Phase 2 C | Core Session/SavePoint repository、`session-core.js`、`save-system.js`/`save-container.js`及容器contract；mode/run根记录、死亡墓碑、head续玩闭包、所有入口的回退与终局限制、固定Host模式状态 | `save-system.test.js`、`session-durability.test.js`、`session-history-p2.test.js`、`frontend-bridge.test.js`、`session-runtime-http.test.js`：普通恢复；铁人直接service/repo/HTTP/bridge回退拒绝；保存/导出/死亡并发；提交/墓碑/清理各中断点恢复；旧容器不得复活；其它局与旧Package不变 |
| Phase 3 | Package `tools/package.mjs` 新默认角色扮演编译入口及对应build-time compiler、data定义与runtime声明；保留fixture/旧开局显式路径，接Core A/B/C能力与新版本identity | `tools/content-check.mjs`/`content-schema.mjs`区分新内容与历史断言；适配`opening-check.mjs`、`typed-smoke.mjs`、`turn-smoke.mjs`及`package.mjs validate --core <tested-core>`到新profile。两起点、生活原语、两机构完整路径/一个非法路径、真实后果、动态槽稳定、安全投影、有效轮数和预算成立 |
| Phase 4 | Package `frontend/Inquiry.aui`、CSS/controller/model、`tools/frontend-compile.mjs`按新主流重构（可改名），真实Host接口接入；参考文件保持原样 | 适配`frontend-model-check.mjs`纯展示函数、`frontend-check.mjs`真实Native集成、`frontend-browser-check.mjs`实浏览器。390/1440阅读流与抽屉、按键/焦点/草稿建议、零AI问答、真实保存/终局恢复、长文回读稳定；按影响扩充验证宽度 |
| Phase 5 | Core/Package精确tested HEAD组合、模式/失败/内容集成及新.atria；版本固化后才集成和清理分支 | 局部契约与实际闭环证据通过后才运行新profile release-check/build；旧.atria排他保护；合并正确工作空间并核对最终refs，结束唯一HANDOFF |

Core测试在main的 `tests/package.json` / Jest配置中运行，例：`npm --prefix tests run test:unit:serial -- --runTestsByPath native/authority-turn-c3.test.js native/save-system.test.js`，根据实施触及面选择列表；需要主产品依赖与tests依赖，不凭文件存在说环境已可执行。Package检查从游戏目录运行，以明确 `--core` 的独立Core工作树加载产品模块；`content-check.mjs`能独立运行，frontend-model/browser-check是导出函数，由集成harness调用，不能把它们当直接CLI执行便声称测过。

现有 `package.mjs validate` 默认进完整旧开局/长期链，并不等价新目标的局部检查；Phase 3须新增明确新profile入口并保留历史选择，避免为新游戏通过而删除旧断言，也避免默认跑所有century/regional soak。浏览器harness现用tests的Playwright及默认msedge频道，需要实际浏览器安装；其selectAction、accept-check、6-step和旧导航断言要随新流程调整。

Phase 2是正式单阶段：A/B/C全部实现并通过对应风险检查，更新同一Record/HANDOFF、提交推送后停止；不提前写游戏/前端。只有实际通过适当兼容验证才按治理集成辅助Core main，记录精确集成HEAD；若保持待集成分支，HANDOFF写清原因和可复现实验HEAD，不伪称main已支持。Phase 3使用明确testedCore，不混用未集成环境。辅助分支不新增Record或HANDOFF。


## Phase 2 完成与 Phase 3 入口

A/B/C 已在 `refactor/open-roleplay-core` 实施，精确 tested HEAD 见唯一 Record / HANDOFF。实际新增检查为 `tests/native/run-contract-p2.test.js`、`run-policy-p2.test.js`、`generation-budget-p2.test.js`；配合上表相关的旧 authority、simulation、Session、保存、HTTP、Native bridge 和存储检查，23 个套件 / 390 项通过，所有变更 JavaScript 的 ESLint 与 diff 空白检查通过。验证使用隔离 FS / SQLite 和回环合成 HTTP provider，包含真实 Node 子进程重开；未启动 MySQL/PostgreSQL 服务，未运行远端 CI、生产模型或浏览器/设备。

辅助 Core 保持独立待集成，main 仍为原审计基线；本阶段按分阶段交付保留辅助分支，主线集成留在后续阶段；额外数据库检查按实际风险在本地决定，不默认追加 CI 或更广验证。Phase 3 使用 HANDOFF 的精确 tested Core checkout，先核对 refs，按玩家体验/世界超凡与已实施 A/B/C 编写游戏默认 compiler、声明和内容，并执行该阶段的编译与局部闭环。Phase 2 本轮到此停止，不做 Phase 3/4 或新版本发布。


## Phase 3 完成与 Phase 4 入口

默认 Open Lives 内容 profile 已在 `2aa07d7adfdfd51552d82545d3457dd003fe6675` 完成；精确 Core 仍为 `5f9e8feb0c7166b45e30c330104a7444beb7692e`，主线未集成。新 schema、五题单次开始、生活/机构/个人路径、八个动态身份与两个有界 job、模式/预算声明和局部验证工具均已落入目标游戏。默认生成的 Native shell 用于内容编译验收；实际问答、故事阅读流、草稿建议、抽屉和保存/终局显示留 Phase 4。旧发布和参考 hash 保留，未创建 3.0.0 `.atria`。

本地检查为 `content-check.mjs`、默认 profile 的 `package.mjs validate --core <tested-Core>` 及显式 `--fixture`；九组真实 FS/Native/回环 HTTP 内容闭环通过，旧 fixture 既有条件/typed bridge/有限模拟回归通过，未跑历史 century/regional soak、远端 CI 或页面。静态槽推广聚合设计和实际绑定入口见 runtime-contracts Phase 3 / 游戏 `runtime/ROLEPLAY.md`，精确报告在唯一 Record。

下一次只执行 Phase 4。先读 HANDOFF → index → frontend/player-experience/已实施 runtime-contracts → verification UI 部分；按已归档 HTML/TXT 与冻结视觉护栏接入新默认 compiler/profile，不把 placeholder 或旧 Inquiry 页面当新 UI。继续原游戏任务分支/唯一 Record/HANDOFF，完成 Phase 4 最小相关本地验证后提交推送并停止，不提前推进 Phase 5。

## Phase 4 完成与 Phase 5 入口

实际 Native 问卷、单列故事、草稿建议、右缘资料/保存抽屉、普通/铁人终局显示完成，默认 compiler 已替换 neutral shell。真实接入中的两个必要 Host 读口缺口在原 Core 辅助分支修复：有界 recent-message read 与清理后受限终局图重开。精确游戏/Core HEAD、本地浏览器九组检查与相关 Core 三套件/64 项证据见唯一 Record/HANDOFF；前期记录保留。旧发布/参考未改，无新 `.atria`。

下一次用户明确继续时仅执行 P5：先读 HANDOFF → index → staging/verification，按实际风险补对应接口与前端模块。核对待集成 refs 与 protected dirty，在独立 Core 工作树完成必要兼容检查和辅助分支集成；游戏任务资产按治理集成 package，验证精确最终组合后创建全新版本输出，保留旧版本。只做本地最小相关验证，不启动/等待远端 CI，不把 main merge 到 package/docs。尚未执行这些集成、生产模型或发行检查；P4 到此停止。


## Phase 5 完成

Core 辅助分支已快进集成 main；游戏任务分支已快进集成 package，新 3.0.0 发布保留在游戏 releases，旧两个版本和参考字节不变。最终 saved archive 的九组内容闭环、九组真实 Native UI、本地 Core 契约/预算和新旧发行安装检查已通过。发布工具新增新 profile 的 release-only，保留排他构建及历史选择。精确 HEAD、命令、原始报告、发送数和未测边界见唯一 Record Phase 5。

两个短期任务分支及 live HANDOFF 已清理；整体完成，不存在下一正式阶段。只做本地最小相关验证和推送后 refs 确认，未执行远端 CI、生产模型、设备或旧长期 soak。
