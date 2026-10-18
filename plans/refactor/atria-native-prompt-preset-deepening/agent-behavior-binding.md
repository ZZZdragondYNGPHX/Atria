# D4：Node Program／Route 与继承

B2 + I2 + C2：复用原 Program、RouteResolver、PromptCompiler、GenerationService 与 V3 ModelPort。

## 独立选择 Program

Node 以 exact dependency pin 选择 Program，Route 继续提供模型、连接与 Generation 配置。未单独选择时采用 Route 自带 Program；单独选择后，它就是本 Node 的有效 Program。发布与界面同时显示 Route 默认和 Node 选择，避免两者含义不明。

Prompt 分支已有 `programSelection` 内部参数；V3 当前的 `agentPinId` 选择的是 model Route，不能只增加一个下拉框便宣称已接通。将 Program pin 接入以下原调用点：

1. 共享 Node schema、PlanDraft 与 Inspector；原 dependency reader 解析 Program 完整 exact closure。
2. `model-capability-authority.js` 与各域准备请求处解析有效 Program；所有 Route 候选按相同选择编译。
3. Session、Project、RP、background、delegated 路径及 ModelPort 将选择传给原 Host。请求身份、Context 和费用继续由这些原调用点处理。
4. `plan-prompt` 候选、PlanRevision 与 Binding 更新采用相同引用，避免更新了资源却仍发送 Route 旧 Program。

Prompt 的 `programSelection` 与 V3 的 `orchestrationSend` 组合进同一次 Host 调用、同一份请求结果与费用记录。具体字段在现有 schema 中落实，不加独立 Behavior Store。

## exact 增量继承

保留 `parentRef` 与 add/disable/replace/configure。父引用固定到修订；子级保存显式差异。

| 操作 | 位置含义 |
| --- | --- |
| add | 明确 Stage、target 与 before/after 条目或首尾位置 |
| disable | 保留条目身份与位置，Effective 标记未纳入 |
| replace | 替换引用或内容，保留被替换条目的身份与位置 |
| configure | 调整该条目的参数，保留位置 |
| 选择新父版 | 比较旧父版／新父版／私人差异，处理缺失条目后保存新修订 |

操作对象是 Program/Stage 内的编排条目，不单凭 Module ID。当前代码按 `moduleId` 搜索所有 Stage，且 add 对每个匹配 Stage 末尾追加；新实现需能准确指向一次出现及其插入位置。条目身份用于继承、编辑选择与 Diff，Module 本身继续复用。

Stage 的新增、排序、条件修改也在原 Program 中表达。若需求需要修改继承 Stage，沿同一差异机制补齐，不能只让 UI 拖动后在 Compiler 中恢复旧序。

## 当次编译

Plan 固定资源版本；当次请求使用原 Context、参数、工具与输出配置，经同一个 Compiler 和 Adapter 生成。Fallback 继续使用 Node 的有效 Program，并重新适配所选模型；费用与响应沿原 Generation/V3 结果返回。

编排与 Provider 的具体顺序见[编排模块](semantic-ir-lowering.md)，集成落点见[后端分工](backend-implementation.md)。
