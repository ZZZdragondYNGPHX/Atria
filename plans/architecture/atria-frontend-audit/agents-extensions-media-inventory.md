# Agents、Memory、Skills、Plugins、Media 与共享会话

“当前接通”仅为静态证据；所有真实模型、工具、媒体、协作运行和设备测试 **NOT_RUN**。源码简称见 [source-map](source-map.md)，状态/处置见 [index](index.md)。这里尤其区分“旧界面载体”和“仍有效的 Atria 原生能力”。

## Agents：现状与 V3 的边界

| ID | 当前界面与控件 | 真实消费链、状态和权限 | 处置 | 源码 |
| --- | --- | --- | --- | --- |
| O01 | Agents hub：Orchestration/Run/Memory/Diagnostics；默认 Run | workspace-host 动态 import **旧** workspace/panel.js，getCurrentRun/workspaceRunView 是当前数据；不能写成 V3 Host RunProjection 已上线 | 旧载体重组；保留四类用户任务 | [AGENTS](source-map.md#agents) workspace-host:196；panel:1–597 |
| O02 | Orchestration：search、preset 列表、New、mode picker、native preset restore、Single Agent template、Import | 当前 factory modes 是 spec/loop/agenda/director；single 模板内部转 spec；Scope/preset setting 保存不是 V3 Plan publish | **废弃旧 mode/preset/Workspace 合同，无迁移/兼容/改名模板化** | orchestration/page:497–623；host-presets:14、87 起 |
| O03 | Preset Inspector：name、budget/scheduler、entry/output owner、arbitration/partial、node kind/agent、raw JSON、Validate/Save | 当前是 Browser 旧 preset/planTemplate，能编辑不代表新 V3 Graph Draft 已实现；dirty guard/冲突保留草稿 | 旧配置与 writer 废弃；新功能依原 V3 合同 | orchestration/page:250–368 |
| O04 | Agent Inspector：name/instructions、model route、skills/tools/capabilities、add/delete agent、Save | 旧 preset 中 agent definition；删除同时处理 node；Native Route 引用和真实 Tool/Skill 服务不能随 UI 删除 | 废弃旧 carrier，保留原生 Agent 行为/Route/Skill/权限能力 | orchestration/page:370–485；agent-editing |
| O05 | preset 绑定：enabled、default/character/chat/session binding、clear、duplicate/export/delete | 旧 setting authority 和 scope；删除需确认、clear binding；现存 mode 专属流程不是新 PlanBinding | 旧 binding/mode 废弃；原生 Session/Project/World 本体保留 | orchestration/page:624–774；host-presets |
| O06 | Run：Timeline/Graph 切换、node chips、事件、指标、Stop Run、Inspect step、Clear selection | Browser run-state/store 投影；分页；runId/chatKey 限制；停止中禁再停；无当前 Run 空态 | 保留用户任务，重组为 V3 单 Host 投影；不复制旧 Run Panel | panel:112–281；run-state/store |
| O07 | Agent Diagnostics：health、context/token、step/tool/recall evidence、recovery、Export Trace、Import replay、Return live | trace replay 只读；Memory management 在 replay 禁用；私有节点详情按当前权限/来源处理 | 保留诊断/回放能力，清退旧 checkpoint 主合同 | workspace/diagnostics/page；panel:308–334 |
| O08 | V3 Plan Draft/Validate/Publish、Graph+Inspector、Node/Edge、Timeline/Approval/恢复 | 原 V3 D8/D9 合同；V3 分支已有 PlanRepository/Authoring endpoint、Attempt/Graph/Effect/Approval/Join 纯控制流；**没有据此证明新 UI 与完整 Model/Context/SourcePort 接通** | **设计/部分；必须保留功能，实施受 E0** | [V3 源码](source-map.md#v3)；[正式 Plan](../../refactor/atria-native-orchestration-v3/index.md) |
| O09 | V3显式有界回边/条件/visits、依赖与transition evidence（目标UI） | 最新共享合同要求loopBack显式标记，去回边后DAG、回边闭合forward path；deadline Join要允许partial；TransitionController用durable producer bindings/receipts与原source/grant/budget hook准入 | **设计/局部控制流；保留，不能换commandId绕generic beginAttempt重做限制；不等于调度器/模型已接通** | V3 transition-controller、run-repository:164起、native-orchestration-contracts；interface-contracts §D3 transition补充 |

## Memory：不能随旧 Workspace 误删

| ID | 页面／操作 | 处理、数据与权限 | 状态／恢复 | 处置／源码 |
| --- | --- | --- | --- | --- |
| M01 | Overview、Knowledge、Sources、Maintenance 四视图；Refresh | 通过 `getCapabilityApi('memory-graph').getWorkspacePorts(context)` 读取 snapshot/inspect，非静态 UI 演示 | capability 不可用/disabled/failed 分开；snapshot.assertCurrent；读取过期丢弃 | 接通／保留，重组宿主；[MEMORY](source-map.md#memory) memory/page:5–200 |
| M02 | Memory enabled、Recall、Source writes、Auto extraction、Auto compression；统计与最近 recall | 原 memory service 的 controls 和 source status；不在 Prompt 层造第二 Memory writer | toggle 操作异步反馈；来源不可写不代表查询也不可用；scope 切换重载 | 接通／保留；memory/page:Overview；native-routing-ui |
| M03 | Knowledge：search、entity type、history、图/列表、entity/relation/fact Inspector | inspect graph 的实体/关系/事实/待消歧；Cytoscape tap 和列表按钮可选择 | 图显示有实体/关系上限，不应等同全部不存在；大数据性能、手机触控 NOT_RUN | 接通／保留；memory/page:300–407（ENTITY_LIMIT=250、RELATION_LIMIT=600） |
| M04 | Sources：provider snapshots、episodes、manual corrections、source text/details | 原 source provenance；显示来源/认识状态，选中记录链到 evidence | 最近列表有 slice 上限；“未显示”不等于删除；私有/撤销数据须按原受众 | 接通／保留；memory/page:408–447 |
| M05 | Maintenance：History build/rollback、Manual compression、Rebuild vectors、Export、Import、schema/高级设置、Reset current chat memory | 原 Memory tools；Import file；Native retrieval/route 配置仍在 Runtime | operation pending set 防重入；失败原图不应伪造更新；Reset 属危险操作；部分 Native source 上操作可用性需实际验证 | 接通/条件／保留有效维护；memory/page:448–546；memory/main |
| M06 | Memory OS graph Inspector：type/relation/status/local center/hops、Fit、Refresh、Diagnostics、source locate、Legacy node graph、History extraction | graph-inspector 复用同服务；Locate 现有实现定位旧 `#chat .mes`，不保证 Native window 当前装载 | 定位失败明示来源不在 loaded UI；旧 DOM 定位应改原生 timeline；“Legacy node graph”入口不能自动定义全部 Memory 为废弃 | 部分／重组；graph-inspector:57–244 |
| M07 | 人工纠错：New entity/relation、rename/alias/remove alias、merge/split、replace/reject relation、reject fact/inference、resolve pending/conflict、reason/time fields、Save | `applyManualCorrection` 写原 Memory correction stream；snapshot/currentness 和结构校验 | 不改故事正文/World Truth；并发/stale 拒绝；模型推测与用户纠错来源分离；需可解释撤销语义 | 接通／保留；graph-inspector:80–151、208；manual-corrections |
| M08 | History extraction：range/mode/from/to、Start、progress、Cancel、Rollback latest | history builder/extract transaction，输入 floors 和 source captured scope | 取消中与已写入不同；回滚仅对应 extraction transaction；不能当作整个 Session Undo | 接通/条件／保留原生适用路径；history-build-ui:1–61 |

## Goals、Experience、Eval 与 Evolution

| ID | 控件／字段 | 权威与操作语义 | 当前缺口／状态 | 处置／源码 |
| --- | --- | --- | --- | --- |
| E01 | Persistent goals：Refresh、criteria/progress/blockers/budget、Check saved evidence、Pause/Resume/Cancel、Inspect | 原 `/goals/context/evaluate/wake/control/inspect`；readOnly 禁控制，terminal 不继续 | 本 panel **没有新建 Goal 表单**；不能从后端能力推断按钮；scope 变化需新 source 证据 | 接通／保留；[EVOLUTION](source-map.md#evolution) agent-goals-panel:1–96 |
| E02 | Link Task、Continue linked Task、请求/保留 token/不确定成本与 prior unresolved execution | Project Task continuation 保留预算并止于 Review；RP goal 由 saved evidence/user/author event 推进 | 不是系统定时后台自主唤醒；unknown execution 不自动重发 | 接通/条件／保留；agent-goals-panel:60–91 |
| E03 | Feedback：signal/note、保存显式反馈、Collect saved result、Correct、Withdraw/Delete、diagnosis 详情/撤回/删除 | 原 Experience sourceKind/sourceId/scope/sequence；explicit preference 与 hypothesis 区分 | source stale、collection 未确认、unknown 需显式展示；不会凭文案成为 World Truth | 接通／保留；agent-evolution-panel:13–90 |
| E04 | retention days、Purge expired、Delete scope feedback/reports、account budget request/token/interval Save | 原持久来源和运行预算；删除不再声称旧来源可审计 | 真实 consumer 才能清；不是本任务 API 测试额外 Gate | 接通／保留；agent-evolution-panel:85–96 |
| E05 | Load targets、target/route/policy、价格来源/币种/input/output price、Declare/enable、Evaluate、Pause/Disable | 原 Evolution target/policy/catalog；review 与 local automatic 有不同准入 | **旧 Workspace/Director target 仍存在**；`requirePilotSources` 直接 `source_unready`；不能把可见表单说成文学/误拒优化已可运行 | 部分/BLOCKED／保留有效原生链，旧 target 废弃；panel:97–125；原 E0-05/06 |
| E06 | Job/candidate/source/diff/report；A/B paired review、preference、各维 delta、Save review、review checkbox、Publish | exact diff/report hash、source independence 与 server gate；发布仍由原 target authority | 不能用文学分数抵消权限硬错误；按钮存在≠独立来源通过；V3 plan-prompt/PlanRevision/Binding CAS 完整链 BLOCKED | 部分／保留受审发布；panel:126–153；原 [D7](../../refactor/atria-native-prompt-preset-deepening/quality-evolution.md) |
| E07 | Publication/current/historical binding、observed/awaiting run、Pause and restore previous version、retired receipts | 原 publication journal、rollback；候选发布不重写活动 Run | rollback 不是抹去已发生 effect/World；引用仍在时保留历史 | 接通/部分／保留；panel:154–165 |

## Extensions：Skills、外部插件、本地脚本和内置工具

| ID | 控件／路径 | 操作、scope、保存 | 限制／失败／恢复 | 状态／处置／源码 |
| --- | --- | --- | --- | --- |
| X01 | Extensions → Skills/Plugins；Plugins → External/Local/Built-in/Official | 一个 manager；child mount sequence/dispose 防旧加载覆盖新 tab | tab 切换先 dirty guard；子 load 失败保留返回/重试；当前内部 tab 未全面独立深链 | 接通／整合；[EXTENSIONS](source-map.md#extensions) extensions-workspace:24–95 |
| X02 | Skills：Installed/Bundled、scope filter、search/folder；Create、Refresh、Import bundled/file/URL | `context.skills.*` 原 API；global/project/package，以及代码中仍有旧 preset/orch-preset/character scopes | package 原件只读；旧 scope 不能直接冒充未来 V3 native scope；导入冲突 replace/skip 需显式选择 | 接通／保留原生管理，旧 scopes 按零兼容清退；[SKILLS](source-map.md#skills) skill-manager-panel:39–220、293–735 |
| X03 | Skill item：View、Edit、Move、Rename、Delete；scope picker/冲突提示 | 移动改变解析 scope，不重写所有名称引用；重命名碰撞 server 拒绝 | 删除确认；已安装 package 只允许 View；部分批量导入成功应如实显示 | 接通／保留；skill-manager-panel:637–880 |
| X04 | Skill editor：file tree、source、Save、New file path、rename/delete file、create skill flow | list/read/writeFile(expectedSha256)；name/description/scope；onChange 刷 manager；嵌套目录随合法 file path | 外部修改冲突不强写；切文件保留 drafts，关闭先审未保存稿；只读/binary/格式约束按原 editor | 接通／保留；`public/scripts/skills/skill-editor.js`；manager:24、637–660 |
| X05 | Skill organization：Search、folder filter、Create/Rename/Delete folder、move folder、Narrative/Studio/Agents off/on-demand/always、Save | 原 settings revision/CAS；删除 folder 移到 Unfiled，不删 Skill | invocation mode 是调度策略，不是授予 Tool 权限；scope 原件仍受限 | 接通／保留；native/skill-organization:1–112 |
| X06 | External plugin：HTTPS repository URL、Install、Edit、Update、Delete、files disclosure | extensions client/store；安装/更新后待启用；Edit 选择 enabled/global/preset/work targets | 信任的 JS **在页面执行**，不等同 Work sandbox；scope 过滤不授予 Host Secret/World 权限；外部仓库运行结果 UNKNOWN | 接通/条件／保留；extensions-workspace:103–130、131–192 |
| X07 | Local script：New、Import JS、name/code、enabled、Global/Presets/Works checkbox、Save/Cancel | 当前导入 `.js` ≤4 MiB；revision 保存；未启用不运行 | dirty guard/409 留草稿；保存成功 refresh 失败不重写；user code 的任意 UI 不在 Git 清单中 | 接通／保留；extensions-workspace:93–104、131–192 |
| X08 | Built-in：Regex/Search Tools 启停、规则管理；Work plugins/permissions 详情 | capability-host 明确加载已知内置；Regex 作用于 account/Native preset/Game 等不同 scope；Work grant 经 package/service | regex 不应悄改 World/权限；旧 ST regex/depth 注入合同不保留；Search Tools 是工具调用，非全局 Command search | 接通/条件／整合；capability-host:18–86；utility-workspaces；regex-scopes/regex-authoring |
| X09 | Official illustration：启用、配置、状态 | 官方插件单独配置；play/Work scope 条件激活，经 SDK 监听生命周期 | 默认关闭；不是所有 Session 常驻 image 按钮；本地 JS import(url) 不证明第三方安全/可用 | 接通/条件／保留；extensions-workspace:80–87；extensions-host/runtime；illustration contract |
| X10 | Native Regex：New、Import/Export、select、Enable/Disable selected、Edit/Delete、Move up/down | account/preset/Game 各自 writer；复用 regex editor，Native edit 不改变 active scope | delete 确认；顺序影响处理；匹配/替换/规则细项按现有 editor/合同；旧 ST depth/order 注入不能作为新产品接口复活 | 接通／保留原生变换，清退旧合同；native/regex-authoring:1–61；extensions/regex/index:2456 |
| X11 | Search Tools：main-model web access、provider（DDG/SearXNG/Brave）、safe search、instance URL/API key 状态、max results/excerpt chars；运行 Stop/status | settings UI 真正绑定 provider 与 tool registry；搜索/visit 结果是来源数据；Native lifecycle 监听刷新分支状态 | Advanced pre-request research、旧 API/Agent preset、WI position/depth/role/order、stage prompts/reset 是当前旧配置消费者，需清退/原生重接；不能一并删除有效 web search/visit | 接通混合／保留原生工具，重组旧配置；extensions/search-tools/settings-ui:76–200、583–735；main:2839–2900 |
| X12 | Manage stored search entries：select/all、single/bulk Delete、Reset all、详情/count/empty | 当前 chat/session scope 中的 managed entries；修改通过原 persistence 和 source anchors | bulk/reset 有确认，single delete 当前 handler 未显式确认，作为交互问题记录；没有 active chat 给提示；不是正式 World Truth editor | 接通/条件／保留有来源管理，旧 lorebook 注入链清退；search-tools/settings-ui:406–582 |

## Media：图像、遮罩和语音

| ID | 页面／控件 | 操作和数据来源 | 权限、异步、保存／取消语义 | 状态／处置／源码 |
| --- | --- | --- | --- | --- |
| V01 | 插图工具：Reading/Illustration mode、Select text/Annotate selection、Annotations/history、Gallery/Media Studio、Image candidates、Settings | 段落 canonical selection → annotation；鼠标/键盘选择、手机长按；SDK onDispose 释放 UI | 只有 writable source 可改；退出面板不自动取消 Host 任务；没有 selection 禁 Annotate | 接通/条件／保留；[MEDIA](source-map.md#media) official-illustration:95–171 |
| V02 | Annotation editor：annotation selector、quote、character picker/add/remove、outfit/scene、composition、直接 prompt、preset、Save | annotation draft、character/preset snapshot；updateAnnotation expectedHead | 409 保留草稿；deleted/read-only 禁写；修改 drawing character 不变更 story Actor Truth | 接通／保留；official-illustration:172–230 |
| V03 | Compose from sections、Apply latest chars/preset、Generate prompt、Cancel prompt、prompt history／Use version、request preview | prompt task 独立运行并生成版本；Use version 先进入 editor，需保存才应用 | 不强覆盖完整 prompt；保存与生成、付费 image 分开；task inventory 失败不能宣称无活动任务 | 接通／保留；official-illustration:220–292 |
| V04 | Generate image、target/style override、prepare/approval、Cancel image、image history、Use/Hide displayed version、Delete annotation | image prepare → exact target/request → approval → submit/status；delete annotation 保留 image history | cost unknown/free/estimated 分开；cancel requested 不等于未收费/已回滚；选择 display version 不改剧情 | 接通／保留；official-illustration:238–319；visual-approval-ui |
| V05 | Illustration settings：character name/aliases/fixed appearance/outfit/storyActorId/enabled、add/delete、global/work scope、own preset、target/style/prompt Route、template/default/reset/save | 原 settings；Work override 与 global 明示；角色选择与原生 Actor 分离 | 恢复模板是草稿变化需 Save；required fields 和来源不可用有错误；budget/target 配置分属 Runtime visual services | 接通／保留；illustration-settings-ui:1–146 |
| V06 | Image target/style config：edit/add、Connection、model/version、native params、Comfy API workflow file/JSON、semantic bindings、output node、Save；style/negative/quality；budget/currency | visual/resources 和 visual/budget expectedRevision；节点参数绑定 prompt/seed/size/base/mask/identity/style 等语义 | workflow 文件 ≤2 MiB、node/input/output 校验；保存能力不是实测能力；provider 限制/费用未知必须显示 | 接通／保留；visual-configuration-ui:1–94 |
| V07 | Image candidates：saved passage/score/reason/details、Analyze with model、Review and generate | 原 **Visual Director** 的 rule scan→可选模型 analyze→prepare/approve/submit | 此 Visual Director 是有效视觉领域能力，**不是应废弃的旧 Agent Director mode**；模型分析不默认自动运行 | 接通/条件／保留；visual-director-ui:1–29 |
| V08 | Gallery：分页、Refresh、Use version、Compare original、Hide、Open Media Studio、reference purpose/character/stable identity、Confirm reference | exact imageVersion/head/metadataRevision；reference 绑定 branch 和外发允许范围 | Hide 非删除；promote reference 不成为 World fact；离开 Media draft 先同步/guard | 接通／保留；visual-gallery-ui:1–55 |
| V09 | Media Studio：regenerate/img2img/inpaint/upscale、target/style/prompt、reference selection、preserve outside mask、Save draft/separate draft、Preview edit task | mask draft 存 checkpoint/commands；prepare/freeze mask→有版本 edit task；lineage history | 保存中不得 submit；409 需保留草稿/另存；upscale 可能改变细节要明示；任务独立于阅读 | 接通／保留；media-studio-ui:1–90 |
| V10 | Mask Canvas：brush/erase/rect/pan、radius、Undo/Redo/Clear/Fit、坐标表单+Add rectangle、pointer/pinch/wheel | 原 mask command model/灰度 pixels；Ctrl/Meta+Z/Shift+Z；坐标表单是路径手势的键盘替代 | pointercancel/多指、画布缩放和原图像素映射需真机验证；clear 是可撤销命令，不删除原图 | 接通／保留；mask-canvas:18–87 |
| V11 | Visual approval：cost limit/currency、unknown-cost consent、asset/mask transfer、omission/degradation consent、Approve/Cancel | targetFingerprint/requestHash，精确 asset refs；原 Host 审批 | 不预选同意；版本/target 变化重新 prepare；仅针对该任务；模型 prompt 不授予 approval | 接通／保留；visual-approval-ui:1–26 |
| V12 | 条件朗读：Read aloud、voice、Stop、audio controls | 作品声明 public narration；speech describe/voices/start/status，精确 item/Actor/Session/revision | 第一次可先选声线再生成；source 变动 abort/reset；失败退回文本；不是全局实时语音聊天 | 接通/条件／保留；speech-controls:1–74；play-product speech mount |

## Shared session

| ID | 控件／业务 | 真实行为、状态与权限 | 处置／源码 |
| --- | --- | --- | --- |
| H01 | Enable sharing、owner/session ID、Connect/Disconnect、Refresh participants | 当前 live Session 启用；client heartbeat + projection；ID 改动立即断旧连接 | 接通/条件／保留；[SHARED](source-map.md#shared) shared-session-ui:21–138 |
| H02 | member handle、seat、role、Apply membership、Choose Persona | Host 以 expectedAccessRevisionId 改成员；observer 不可提交/选 Persona；shared Persona 当前只改 seat display，description disabled | 接通／保留；shared-session-ui membership/persona handlers |
| H03 | shared input、submit once、Host commit/cancel Turn、状态/projection | fixed declared seats，全部参与者提交，Host 决定正式提交；重连取真实 projection | 接通/部分／保留；shared-session-ui renderTurnControls；shared-client |
| H04 | Shared rule selector、按argsSchema的text/number/boolean/JSON参数、Submit；Host Open/Commit/Cancel shared turn | 仅declared seat允许的rule；roll argument不手输；collecting/current且未提交的roster成员才能submit；Host全部收齐且未stale才commit，scope epoch active才open | 接通/条件／保留；shared-session-ui:35–82 |

当前是 ID/seat/role 交互，不是已实现的邀请链接、跨设备云同步或任意共同编辑。若外部 AI 提出这些能力，应单列为新提案。
