# Studio、Prompt、Model 与 Runtime 功能清单

基线与状态词见 [index](index.md)；全部“接通”均为源码静态结论，实际执行 NOT_RUN。每行中列举的字段、按钮和菜单都需要在外部设计的功能映射中有去处。源码简称指向 [固定源码索引](source-map.md)。

## Studio 项目与通用编辑链

| ID | 页面／控件 | 触发、处理、数据与写入 | 条件／状态／恢复 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| S01 | 项目列表：Project name、Create、Search、Open、Delete Project | Product/Studio client；创建原生 project/source 后进入 Studio；删除进入独立 review |删除 exact revision 过期需重新加载审查，不误删新版本| 接通／保留 | [STUDIO](source-map.md#studio) studio-workspace:217–274；project-lifecycle:1–52 |
| S02 | Resource tree：Filter、资源节点、Source file、动态 Plugin resource；Compact Project/Editor/Preview/AI/More | STUDIO_VIEWS 20 项 + registry descriptors；选择 view 不执行模型 |缺 support data 标部分失败，可 Retry loading| 接通／重组 | studio-workspace:39–67、282–369、1267–1351 |
| S03 ||Inspector/AI 只是面板开关| 不能把按钮可点击等同项目通过；执行结果进入原 activity| 接通／整合 | studio-workspace:811–890、1547–1560 |
| S04 | 所有编辑：Review Changes → Changes → Apply ChangeSet；Cancel | Stage Authoring Operations，inspectWorkspace 生成 review，再 executeWorkspace；原 source/Project revision 唯一 writer | applying/inspecting 防重入；409 保留冲突草稿；已提交但 refresh 失败显示 receipt，不能再 Apply| 接通／保留 | studio-workspace:730–810、1440–1505；studio-authoring |
| S05 | Activity：Problems、Output、History、Changes；Show/Hide、Reload Latest、Copy draft |历史行加载精确 diff| 大输出/截断需说明；history 不等于 Undo| 接通／保留 | studio-workspace:1352–1524 |
| S06 | Inspector：选 resource/graph node、exact refs、dependencies、关闭 | resource graph/registry；从原资源定位来源 | support 某部分读取失败不显示“无依赖”；不另存第二份 Project/World | 接通／整合 | studio-workspace:891–969 |
| S07 | Overview：Project display name、Package name/version、Review | patchProjectSource → ChangeSet；非输入即保存 | 版本/结构错误先修；Review 之后仍需 Apply | 接通／保留 | studio-workspace:970–995 |
| S08 | Experience：text/component/hybrid/full、Frontend source index、Runtime features JSON | assertFrontendExperience(authoring)；写 package experience | 改的是作品布局所有权，不能据 mode 推导新权限；错误留草稿 | 接通／保留 | studio-workspace:996–1032；native-frontend-contract |
| S09 | Actors：字段／Collection Source、actor selector、身份/角色配置、增删和 Review | structured actor editor + collection JSON，经 patchStudioActors |Actor Cognition 与作者描述不混同| 接通／保留 | studio-workspace:380–420；studio-actors-editor:1–135 |
| S10 | EntryPoints：字段／Collection Source、入口 selector、首场景/启动配置、增删 Review | structured editor，exact entryPointId；作品可有多个入口 | 空/重复入口有诊断；选择用于 Preview/Build，不擅自改变已安装 Session | 接通／保留 | studio-workspace:421–465；studio-entrypoints-editor:1–132 |
| S11 | Worlds／Knowledge：资源 selector、字段／Collection Source、typed/条目编辑、Review | 复用原 World/Knowledge editors；Project 作为正式保存 scope | immutable Library/package 原件不直接写；同名不是同身份；重复 ID/丢失选择可回 Collection Source | 接通／保留 | studio-workspace:466–514；studio-worlds/knowledge-editor |
| S12 | Library references：exact revision selector、Attach、Fork、Update、Review detach、Used By、Editor/References tabs | 查询 ResourceGraph 的正反向依赖；resource operation 经 Stage/Review/Apply | detach/update 先检消费者；Fork 有新身份；不可一键改所有 latest；只读来源可跳原页 | 接通／保留 | studio-workspace:1095–1159 |
| S13 | Game Logic、Memory、Agents、Plugins、Package Metadata | 当前部分是 JSON/typed source 编辑器：processors、memory、orchestration、runtime.plugins、localization/permissions | 是真实编辑功能，但不是各自完整可视化设计器；Agents 视图不是 Project Agent；旧 orchestration 字段需 V3 硬切 | 接通/部分／保留有效源能力、重组；旧编排合同废弃 | studio-workspace:1297–1336；renderPackageJson/renderNestedRuntimeJson |
| S14 | Skills declarations：Available Skills、Add selected/ID、Remove、Fields/Source、Review | project/global inventory → package.skills；| 声明不等于已安装/有执行权限；管理安装在 Extensions；Review 后 Apply | 接通／保留 | [SOURCE](source-map.md#source) skill-declarations-editor:1–90 |
| S15 | Plugin resource（动态） | registry descriptor + exact resources 的只读 inspection | 当前不是所有插件都提供专用 editor；不得把 JSON inspection 写成完整表单 | 接通/条件／保留 | studio-workspace:1337–1351 |

## Project Agent

| ID | 控件／操作 | 处理与原权威 | 状态与权限边界 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| A01 | Task chooser、Intent textarea、Create Task、New Task | Project Task intent/plan/workspace/operations/changeSet；辅助 conversation |创建失败保留 intent；Task 不是随便一段聊天记录| 接通／保留 | [PROJECTAI](source-map.md#projectai) studio-agent:394–519、633 |
| A02 | Prepare only、Continue、计划步骤、会话/执行结果 | 原 Native task/compute/skill 工具链；运行可 cancel/takeover | planning/planned/working/evaluating/repair/review/blocked/conflict/completed 等来源状态必须区分 | 接通／保留 | studio-agent:210–333、520–591、650–718 |
| A03 | Inspect changes、Review & Commit／High-impact review、Human Takeover | 显式人类 review → commitAgentTask；takeOverAgentTask 中止当前工作并转人编辑 | AI 不能 commit；已提交但后续刷新失败不可重新 commit；high-impact 显示真实 changeSet 风险；权限仍在 Host | 接通／保留 | studio-agent:593–632 |
| A04 | Task 内 Goals、Experience/Eval/Evolution | 复用原 scope/source；见 [能力清单](agents-extensions-media-inventory.md) | 当前质量来源 `source_unready` 和旧 Evolution targets 未关闭；不能承诺自动优化通过 | 部分／保留，受 E0 Gate | studio-agent 的 goals/evolution mount；EVOLUTION |

## Prompt Presets 与资源编辑

| ID | 页面／控件组 | 操作、数据和保存语义 | 权限／异常／恢复 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| Q01 | Preset 列表：New、Import file/selected、Open、Export、Delete | 原 native preset，聚合 Program/Modules/Generation/Regex；保存 expectedRevision |删除确认并保留 pinned Prompt 历史；不要把 ST preset 兼容写成未来要求| 接通／保留原生 preset | [PROMPT](source-map.md#prompt) prompt-presets:281–336 |
| Q02 | Preset detail：Program、Modules、Generation、Preset Regex；Back、菜单 | 同一个 preset identity 下管理资源；内部 navigation 与 list position | 多个入口不是多个 Store；dirty 取消返回保留编辑；关闭菜单支持 focus/resize/scroll | 接通／整合 | prompt-presets:115–158、187–280 |
| Q03 | Module category：创建/改名/parent、移动 module、类别过滤、删除类别/module、影响确认 | expectedRevision 保存 preset；按 refs 展示受影响对象 | 不能环形 parent；删除显示引用影响，不静默改其他 Program；冲突重载 | 接通／保留 | prompt-presets:14–29、159–186、236–280 |
| Q04 | Module：display name、exact revision、semantic target、stages、body、priority、条件/参数/provenance | simple/advanced 编辑同草稿；保存新 exact revision 或 Stage Project op | 当前只是现有资源字段/JSON 双模式；不等于 D8 新全文无损双视图已实现；任意 target 不授予权限 | 接通／保留并按 D8 深化 | prompt-authoring:167–242；prompt-semantics |
| Q05 | Program：stages、Stage ID、Module picker/Add/Remove、Move up、Add/Remove stage、Response Directive、parent/derive/conditions/parameters | exact ModuleRefs，顺序是语义；继承/overlay 归原 Compiler |切换 advanced 失败保留草稿；不复制第二 DSL| 接通／保留 | prompt-authoring:243–289；prompt-semantics:1–143 |
| Q06 | Generation：output tokens、temperature、topP、streaming、stop JSON、tool choice/name | 默认值、缺省与显式设置区分；read() 保留未编辑缺省字段 |不支持 adapter 的组合 Preview 应拒绝；named tool 才显示 name| 接通／保留 | prompt-authoring:64–112 |
| Q07 | Generation：thinking mode/effort/level/budget；cache key/retention/mode/ttl | Provider-specific controls 保存原 profile，执行由 adapter lowering | 不能宣称所有模型支持/命中 cache；真实 reasoning 不向 UI 泄漏；不用视觉统一掩盖 unsupported | 接通／保留 | prompt-authoring:80–109 |
| Q08 | Save revision、Review/save、Back、Simple/Advanced、错误反馈 | Library 写 exact revision；Project 经 ChangeSet；committed event 清 dirty | pending 防重入，失败留字段；保存成功不代表 Route 已改用它 | 接通／保留 | prompt-authoring:185–321 |
| Q09 | 通用资源库：filter、origin/visibility、New/New revision、Archive/Restore、Delete、Used By、Open preset/Studio、Fork/Derive | Library / Project / installed Work 的 exact resource scope | package 原件只读；被引用资源不能删除；fork/derive closure 顺序保存；| 接通／重组入口 | prompt-authoring:324–422；forkPromptClosure:113–166 |
| Q10 | Studio Prompt Authoring：resource kind、New/Edit project resource、Attach exact、Fork/Derive、Used By | 与 Q09 同原资源；Project ops 进 Review | 推荐值与正式引用/绑定区别清楚；包原件不写 | 接通／整合 | prompt-authoring:423–539 |
| Q11 | Runtime Design：role、required capabilities、recommended Prompt/Generation、requirements JSON、Inspect exact closure | 作者声明用途与推荐资源，Review runtime requirements | 不把推荐当玩家 Route/Secret 配置；构建 closure 和运行 slot resolution 分开 | 接通／保留 | prompt-authoring:434–483 |
| Q12 | D8 全文无损双编辑、Authored/Effective/Wire 三层 Diff、未发布 Prompt Draft Preview | 原 [D8 合同](../../refactor/atria-native-prompt-preset-deepening/preset-studio-experience.md) 的新增功能要求 | 当前可信端口与 Source/Node/Route 绑定 **BLOCKED**；不可 Browser 拼接 wire 或调用 execute 假预览 | 设计／保留；不得画成已接通 | 原 [E0](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md) E0-01/02/04 |

## Runtime：连接、模型、Route、检索与诊断

| ID | 控件与页面 | 处理和数据 | 权限、异常、恢复 | 状态／处置 | 源码 |
| --- | --- | --- | --- | --- | --- |
| R01 | 五个 section、列表搜索、New/Edit、source JSON、Save/Back、Duplicate/Delete | 原 configuration；connections/models/routes 各 identity；Retrieval 是 immutable revision |表单 busy；Delete 查询引用阻碍；不是新建模型即拥有可用 Route| 接通／保留 | [RUNTIME](source-map.md#runtime) runtime-workspace:128–229、550–611 |
| R02 | Readiness checklist／修复跳转 | Connection → 条件 Secret → Model → Program → Generation → Route；| **Secret 非所有 adapter 必选**，当前源码已条件化；旧版“Secret 永远第一步”失效 | 接通／保留 | runtime-readiness:1–29；runtime-workspace |
| R03 | Connection：name、adapter、transport、endpoint、兼容选项、Secret selector、Create/Store/Cancel/Refresh Secrets、Test | connectionRequiresSecret；API key 存原 Secret vault，仅引用；probe 返回模型发现或错误 |测试不授权 Secret destination；Secret 保存成功仍需保存 connection；无独立完整 rotate/delete Secret UI| 接通/部分／保留 | runtime-workspace:230–359；runtime-client remediation |
| R04 | Credential destination：Review、exact destination evidence、allow-local checkbox、Allow、Cancel | inspect saved connection → exact fingerprints → authorize；原 CredentialTargetAuthority | 草稿更改使 review 失效；409 重新审；单纯 inspect/save/test 不授权、不发送 Secret；不显示 key 原文 | 接通／保留 | credential-target-review:1–81 |
| R05 | 图像连接：NovelAI 官方/compatible、capability JSON、official forwarding、gateway options | 按 adapter 显示字段；声明 responseFormat、model/capabilities；Comfy/WebUI 等供 visual target | relay 是否转换协议未知时不能默认官方等价；能力声明不是 probe 实测 | 接通/条件／保留 | runtime-workspace:235–258；shared novelai contract |
| R06 | Model：Connection、remote ID、Fetch models、发现 selector、Use metadata、context/output limits、tokenizer、capability overrides | list probe 与模型身份/limit provenance 分开；可手输 model ID | 切连接/ID 清旧发现，version 拒绝 late response；unsupported 与 unknown/显式 override 不等同 | 接通／保留 | runtime-workspace:360–439 |
| R07 | Route：role、Model、Connection、Preset、exact Program/Generation、Manage models/presets | 保存 RuntimeRoute，选 preset 只填 exact refs；原资源未来新版不自动替换 | 主 Route 缺失/歧义须修；当前 UI roles 为明确列表，不能把 roleLabels 的每个 key 都当可选项 | 接通／保留 | runtime-workspace:440–465；roles:25；RouteResolver |
| R08 | fallback selector、Add/Remove、Move up；timeout/retry/attempt 与 requirements | 同 role 的 fallback refs；role 改动剔除不相容草稿并反馈 | 不同 Program 的实际 fallback 仍可被 `generation_semantic_authority_changed` 拦截；UI 保存不代表 fallback 可用 | 接通/部分／保留，E0-01 BLOCKED | runtime-workspace:466–504；GenerationService:46–49 |
| R09 | shared request/token limits、local budget、required work reserve、optional work lanes | assertComputeBudget；原 Host/Run/Task 准入与费用观察 | 预算是产品运行约束，不复制为本任务测试审批；UNKNOWN economics 不显示精确费用；不可 Browser 发放额度 | 接通／保留 | runtime-workspace:505–528；native-compute-budget |
| R10 | MCP connection/tool/resource/auth；A2A connection/skills/auth | Route executionPolicy，连接与服务授权仍在原端口 | “已配置”不等于允许所有工具；不直接在表单执行外部 mutation | 接通/条件／保留 | runtime-workspace:529–549 |
| R11 | Retrieval：filter、New/Create revision、embed/rerank、provider/model/endpoint、Secret、browser model picker | NativeRetrievalProfile；按 provider 显示 dimensions/task/late chunking/keep/auth mode/region/project | WebGPU 不可用有替代 provider；Secret 独立保存；声明 revision 不等于索引重建成功；保存失败原稿在 | 接通／保留 | [RETRIEVAL](source-map.md#retrieval) retrieval-workspace:1–166 |
| R12 | Runtime Diagnostics：evidence、Route、Prompt choices、Session 或 exact Project/revision、Refresh Projects、message、Compile preview | `/preview` 走原 Host/Compiler/provider render，不发送生成；来源选一个 | 缺上下文、revision 冲突、能力未知、token 超限应定位修复；不能预览任意未发布 Prompt 草稿 | 接通/部分／保留 | runtime-workspace:612–717；native-generation endpoint:940 |
| R13 | External services：Public content、Service、Saved remote task、Load/Run/Reconnect/Cancel | live Session/revision → protocols/describe → MCP/A2A start/status；A2A 可 reconnect | 历史只读/stale 拒绝；cancel 是请求，不保证远端副作用撤销；结果要 current artifact | 接通/条件／保留 | protocol-controls:1–79；runtime-workspace Diagnostics mount |
| R14 | 错误修复跳转、Return to model setup | runtime-client error→workspace-host repair；保留原操作上下文 | 不把权限/凭证故障统一“重试”；不假装刷新等于已提交修复 | 接通／整合 | runtime-client；workspace-host runtimeRepair |

详细物理 Gate 只在 [原 E0 台账](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md) 维护。
