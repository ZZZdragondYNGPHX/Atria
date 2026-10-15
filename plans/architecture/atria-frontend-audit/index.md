# Atria 全产品前端功能与交互审计 · 研究与外部设计输入

> **2026-10-16 增量**：外部 [HTML](design-proposal/atria-visual-direction.html)、[全功能界面表现](design-proposal/atria-function-presentation.md)、[前端指导](design-proposal/atria-frontend-guidelines.md) 已提供，189 个审计功能组各映射一次。用户授权正式开始并指定 Claude Code 负责前端。后端真实增量见原 [E0 §8](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md#8-2026-10-16-后端实施增量与真实剩余-gate)，[交接提示词](claude-code-frontend-prompt.md) 是对接输入，不是新的状态或审美权威。以下源码盘点保留原固定 SHA，不能把它当最新运行验收。

> 2026-10-15；**研究资料，不是新的产品合同、最终视觉企划或实施授权**。任务进度仍只记入 [Prompt 深化唯一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)，E0 仍只归 [原审计台账](../../refactor/atria-native-prompt-preset-deepening/e0-audit.md)。D1–D8 功能语义保持冻结，D9/E0 **NOT_CLOSED**。

本资料面向整个 Atria：玩家安装作品、运行故事与存读档，作者编辑和构建项目，以及 Agents、Memory、World/Knowledge、Prompt、Runtime、扩展、媒体、账户、存储和诊断。它说明当前源码如何连接功能、哪些能力仍须保留、哪些旧入口应清退，以及设计 AI 必须覆盖什么；不规定配色、字体、主题、造型或美术风格。

## 基线与证据边界

| 对象 | 本轮固定证据 |
| --- | --- |
| 正式产品 `main` | `695acf3bcad1d42e331459189532a76056278bec`，本地干净工作树；包含 Storage Center 合并 |
| `docs` | 开始 `0a758827eaed96713ab9efed25ef1a0fdf31674c`；过程中已保留并发 `ab5461eb1`、`5e2117393`、`d2a3d21d9`、`d346f895b`、`ca43a0a84` 的文档与其他任务预览更新；最终提交以 Git 历史为准 |
| 独立 V3 分支 | `31bef95723885c1547a9c3686200cbaf122799a8`；使用该提交的只读 Git archive，避免把另一任务曾在进行 merge 的工作树混入证据；已含 main@735 Storage Center 合并，尚未合入 main@695 的UI增量；另已补审V3显式transition/loop |
| 前端静态扫描 | 1,065 个文本源码/模板/CSS/Android/Electron 文件，355,257 行；正文整理 189 个业务功能／控件组，另有前后端引用、端点和测试索引，详见 [覆盖说明](coverage-and-evidence.md) |
| 运行证据 | 本轮没有启动产品、执行产品测试/构建、调用 Provider、操作真实账户或进行三端实测；全部运行验收 **NOT_RUN** |

“源码已接通”仅表示读到了入口、挂载、handler、client/service 的静态链；不等于实际服务、权限、设备或质量通过。自动扫描的语法位置也不等于可见控件数量。未取得证据的地方明确为 **UNKNOWN / BLOCKED / NOT_RUN**，不能从文件存在推导能力完成。

## 阅读与导出

| 材料 | 用途 |
| --- | --- |
| [页面树与全局／Library／Play 清单](surface-inventory.md) | 当前导航、作品与会话、World/Knowledge、Persona、历史和存读档 |
| [Studio／Prompt／Runtime 清单](authoring-runtime-inventory.md) | 创作资源、所有项目视图、AI 审查、模型连接、精确资源和编译预览 |
| [Agents／Memory／扩展／媒体清单](agents-extensions-media-inventory.md) | 旧编排与有效原生能力分离、Skills/Plugins、视觉生成与语音 |
| [Settings／账户／存储／诊断清单](settings-storage-diagnostics-inventory.md) | 偏好、认证、备份、资源中心、诊断与公告 |
| [完整操作链与状态说明](interaction-flows.md) | 跨页面业务依赖、权限、加载/失败/取消/审批/恢复与快捷键 |
| [组件复用和功能架构问题](component-and-architecture-findings.md) | 有源码依据的重复入口、状态割裂、旧底座清退与保留界线 |
| [跨端功能与验证矩阵](cross-platform.md) | Windows、CachyOS Linux、Android Termux、APK 差异及未验证需求 |
| [外部设计 AI 委托说明](external-design-ai-brief.md) | 可直接转交的产品语境、三项交付要求及功能映射规则 |
| [覆盖、方法和未知项](coverage-and-evidence.md) | 审计置信度、动态入口、测试证据边界与导出清单 |
| [相关测试消费者](test-evidence-map.md) | main 代表性测试与15份V3控制流测试索引；全部 NOT_RUN，不冒充动态功能验证 |
| [源码索引](source-map.md) / [逐位置证据](evidence/) | 固定提交的源码链接、控件创建点、事件、调用方、导入、端点、CSS、测试 |

外发时至少一起提供上述 Markdown；`evidence/*.tsv` 可用表格软件打开或按域过滤。它们是研究附件，既不是第二 Record，也不是新的设计或删除权威。源码链接固定在审计提交，后续实现必须重新核对当时真实 HEAD。

需要表格导出时使用 [function-matrix.tsv](evidence/function-matrix.tsv)：189 个功能组来自四份正文表格，保留原列名和原行内容，是派生导出，修改应回正文，不在导出表另立权威。

## 全文状态和处置词典

| 词 | 含义 |
| --- | --- |
| **接通** | 入口与处理链静态可达；运行未验收 |
| **部分** | 有真实链路，但某个入口、来源、权限、消费者或发布步骤未接齐 |
| **设计** | 已有正式功能合同，尚无本轮可证明的完整产品链 |
| **旧／待清退** | 当前仍运行，正式重构确认不保留旧合同；不表示已删除 |
| **UNKNOWN** | 无充分证据作实现或废弃判断 |
| **保留** | 必须保留用户能力及原领域权威；不要求复制旧布局 |
| **整合** | 可合并入口/控件，能力和不同写入语义都保留 |
| **重组** | 需要重新组织发现路径、上下文或状态；不是删除授权 |
| **废弃** | 仅限已明确淘汰的 ST／旧 Workspace／Director 等合同、模式和兼容链 |

“状态”与“处置”互相独立：一个当前可用的旧 mode 可以确认废弃；一个尚未实现的 D8 能力仍必须保留在未来完整功能要求中。HTML 未展示、旧控件隐藏、测试文件存在均不能作为删功能或宣称通过的依据。
