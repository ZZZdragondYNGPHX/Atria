# 源码剖析：前端、Prompt 与 V3 的实际关系

2026-10-18 本地读取：`main@6b6ddde4d`、Prompt `760327891`、V3 `532805fbb`。V3 存在并行未提交工作，本次仅作只读对照；下面区分已提交实现与方案目标。覆盖相关领域的入口、关键实现与直接调用点，并非整个仓库逐文件逐行阅读，也不据静态代码宣称运行表现。

## 1. 产品页面与状态归属

| 入口 | 代码中的实际组织 | 对方案的含义 |
| --- | --- | --- |
| Shell | `atria-shell/app-shell.js`、`navigation-authority.js`、`workspace-host.js` 持有五域、工具页、返回与挂载；`edge-dock.js`、`paper-transition.js` 已存在 | 接续原 Shell 与 tokens；不重搭导航和整套页面容器 |
| Library/Runtime | `library-runtime-workspaces.js` 已挂作品、World/Knowledge、Preset、Persona、Route/Model/Connection/Retrieval；独立 Program/Module 深链仍挂 `mountPromptLibrary` | 预设与专业资源两入口汇入共用详情／编辑器，不因只有四个 tab 误判独立作者不存在 |
| Studio | `studio-workspace.js` 列出 20 个视图，分别挂 Source、Frontend、Assets、角色、入口、World/Knowledge、Prompt、Agent、Preview、Simulation 与 Build | 全产品改造保留这些操作；作品界面预览与 Prompt 预览属于不同内容 |
| Play | `play-generation.js` 调原 generation/operation，接 Session 快照与正文提交；已有 projection epoch、stream 与 finalizing | 新界面复用原生成与正文链，不用 Run 图代替故事阅读 |
| V3 Agents | `workspace-host.js` 已挂 `orchestration/agents-v3.js`，后者挂 Plan/Run 页面；Memory 单独挂 `agents/memory/workspace.js` | 旧 Agents panel 尚在是过期判断；Graph/List/Inspector 与 Timeline 已可接续 |
| 编辑与保存 | Library revision、Preset PUT、Studio ChangeSet/Apply、Plan Draft/Publish、Binding 各有自己的操作 | 可以共用字段／详情／反馈组件，保存时仍发原领域命令，不新增统一发布步骤 |
| 网络客户端 | `runtime-client.js`、`studio-client.js`、`product-client.js` 与 `orchestration/client.js` 分别服务各域；Runtime 会通知配置观察者 | 接线复用原客户端；保存成功后刷新失败应保留已取得的保存结果 |

## 2. Prompt 的实际数据链

```text
Library / Preset / Project / Package exact refs
  → RouteResolver: Route + Model + Connection + Generation + Program closure
  → 原 Context 选择结果 → context-providers: RequestContextPlan
  → flattenPromptProgram → PromptCompiler
  → 字符串位置数组 + 派生 SemanticBlocks
  → 原 Provider Adapter: 计数 / render / send
  → Generation 结果 → V3 ModelPort / 原业务消费者
```

`RouteResolver.resolve()` 对 parent/module 递归读取 exact closure。Prompt 分支新增内部 `programSelection`，以选择的 Program 替换 Route 默认；`GenerationService` 将选择继续用于 fallback。V3 ModelPort 当前走原 `NativeGenerationHost.execute(...options)`，各域准备仍以 Route 自带 Program 构造内容；两分支组合是后续工作，单独存在两个参数不代表 Node 已有独立选择。

`PromptCompiler` 先按 Stage 展开模块，再汇入 directives、contextSlots、history、input、responseDirectives、prefill。`semanticBlocks()` 按这些位置构建消息序列。因此 Stage 顺序不是跨所有 target 的任意消息顺序。新方案必须继续说明 target 的含义，不能只写“拖拽顺序就是最终 Wire 顺序”。

## 3. 方案需要修正的具体问题

| Before | After | Why |
| --- | --- | --- |
| 只写删除 priority，未覆盖 Compiler 的 `expressionRank` | 同 target 的 Module/Anchor 采用显式条目顺序，layer 只保留表达对象 | `PromptCompiler.compile()` 实际按 target → layer → priority → ID；UI 仅用 shared comparator，当前展示与编译可能不同 |
| Stage 排序被概括成所有最终消息排序 | 明确 Stage 展开与 target 投影；Effective 展示最终位置 | `semanticBlocks()` 会把全部 directives 放到 history 前，再按固定位置汇入其他内容 |
| derive 用 Module ID 定位，add 只说“插入点” | 以 Stage/编排条目定位一次出现；规定新增与替换的位置 | `flattenPromptProgram()` 的 add 对所有匹配 Stage 末尾追加，disable/replace/configure 按 moduleId 搜索全部 Stage；schema 无位置字段 |
| 新 Anchor 被写成加一棵树即可 | 在原 Program schema、flatten、Compiler、UI、freeze、分享中同时加入 | `assertProgramStage()` 目前只接受 moduleRefs 等原字段，Anchor 尚不存在 |
| Contribution 只描述匹配来源 | 明确沿 Context 原序、按来源／片段／版本／用途去重，并替换对应自动追加路径 | `context-providers.js` 已映射 plan.included；Compiler 又按 context kind 自动装配，不处理消费归属会重复上下文 |
| Typed IR 仍写“尚未实现” | 接续 Prompt 已有 `semantic-blocks.js` 及 Adapter 使用 | Prompt 分支已有类型化投影；V3 单独尚无该文件，需整合而非另建 IR |
| “三层 Preview”被当作完整跨版本比较 | 两侧 refs/Draft 各自选择，共享一次环境，分别编译 | `previewPromptDraft()` 只有一份 request，identity 包含 Program ref，比较要求相等；跨根修订不能直接表达 |
| Preview 反复编译基线 | 捕获共享环境后 base/candidate 各编译一次 | 当前流程 before → after → rechecked，会完整编译基线两次；不能把这种重复工作扩成前端常驻机制 |
| exact-base overlay 被当作任意草稿预览 | 在原预览流程补新身份、新依赖的读取 | `prepareDraftOverrides()` 要求现有 exact ref、同 ID/修订和 base fingerprint，Resolver 先读取原资源；全新资源没有这个基底 |
| Library 编辑被误认为已支持无游戏试读 | 增加作者样例 source、Host 分支、Compute 与工作区结果 | Host 当前要求 Session/Project；Prompt source kinds 是 session/studio/task，V3 多了 rp_chat，均无作者样例用途 |
| 承诺“未知字段都能无损保存” | 留原文缓冲；新正式字段同步原 schema/保存/编译/导出 | `assertPromptModule/Program` 使用固定字段；前端留下字段不等于后端保存了字段 |
| Simple/Advanced 被当作完整正文与共享历史 | 区分完整 JSON 和 body，沿 mountPromptEditor 增加状态／历史 | 当前 Advanced 是 JSON textarea，Draft 是组件局部变量，没有统一 Undo/Redo；已有 literal/template 支持在后端 |
| 分享依赖只说按本地身份映射 | exact ref 为修订索引，逻辑 ID 和修订分别映射 | `PromptPresetStore.save()` 按资源 ID 建 byId 并拒重复；同 ID 多修订闭包不能导入。现有 Fork 为保持 ID tie-break 还刻意排序新 ID，新序列实施后应删掉这一耦合 |
| 新编排只同步 Compiler/UI | 同步 `presets.js`、resources、Fork、Package freeze、Candidate 和引用图 | `package-freeze.js` 自行重建 stages.moduleRefs；导入/Fork 重写 parent/module/derive refs，不认识未来 Anchor/条目引用 |
| Plan Library 被列为已具备全部生命周期 | 保留已实现列表／创建／保存／发布／Binding，其他补原服务 | 路由没有 Plan Fork/Derive、归档、删除；不能凭页面名字推定有 API |
| 旧 V3 快照说 Run/Binding/Approval 接口未挂载 | 复用当前 namespace 的客户端与路由 | `native-orchestration.js` 已注册 plans、bindings、runs、tools、approvals/launch；Run UI 也已存在 |
| 全前端容易重建另一套设计系统 | 使用现有 --atri-* 与已确认稿，外部数值和主题作为参考 | 源码已有 Serene Shell；外部指导另提 Nocturne/Folio 和 --surface-*，两份不能同时作为默认实现 |
| 固定说明与作者模板重复累加 | Effective 展示全部实际说明，相同职责仅组装一次 | Compiler 已有 world/memory/project/task/narrative 长说明，renderer 还为 expression 增加前缀；继续加模板时应检查实际内容归属 |

## 4. Provider、Context 与质量功能

- 三类实际 Adapter 通过 `renderPromptMessages()` 使用语义序列；`renderPromptProtocol()` 是另一通用格式入口，不能把其中的限制直接外推成所有实际 Adapter 的能力。
- 原 Context Compiler 已有 lanes/required/atomicGroup/预算选择，`context-providers.js` 再转成请求项。Prompt 只装配结果；Persona、History、Input 和事实应各消费一次。
- Compiler 固定 world/memory/narrative 文本影响真实输出，属于提示词内容。方案已要求可见、按需与去重；本次未改变产品内文本。
- Prompt 分支扩展质量维度；V3 的 `quality.js` 仍有 `requirePilotSources()` 的具体 `source_unready` 出口。界面显示实际支持项，缺来源仅影响相应可选评价操作。
- Preset/Route Candidate 与 `plan-prompt` 是两条既有采用链。V3 的 `plan-repository.js` 已引用 PromptCandidateStore，后续独立 Node Program 要同步这条链。

## 5. 分支组合事实

对已提交 V3 `532805fbb` 与 Prompt `760327891` 执行 `git merge-tree --write-tree --name-only --no-messages`：有 9 个内容冲突，未修改分支或工作树。

产品内容冲突在：

- `src/endpoints/native-generation.js`
- `src/native/adapters/generation-host.js`
- `src/native/agent-intelligence/evolution-evaluator.js`
- `src/native/model-prompt-runtime/README.md`
- `src/native/model-prompt-runtime/execution-utils.js`
- `src/native/model-prompt-runtime/generation-service.js`

其余 3 个为两个分支的既有用例文件。以上仅说明文本合并结果，不证明无冲突文件已语义组合；Claude 的未提交工作不在该计算中。整合应以其完成收尾后的源码为准。

## 6. 结论

原生资源、原 Compiler/Context/Provider、Library/Studio 共用编辑器与 V3 接续方向合适。需要修改的是顺序与条目身份、草稿与样例用途、分享的多修订映射、已有页面复用和视觉输入优先关系。对应修改已进入各功能模块；日常编辑、模板、发行、预览和全产品页面均保持交付范围。
