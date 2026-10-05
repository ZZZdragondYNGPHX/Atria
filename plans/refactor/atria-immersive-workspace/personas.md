# Native Personas — capability, migration and release gate

## Responsibility and scope

用户设定是账户拥有的个人游玩身份；在 Library 管理、在 Play 当前会话选择。账户显示名称/头像、作者 Actor 和共享席位是不同对象。姓名、头像、可选描述与管理备注保留；备注只用于管理，不发送模型。

来源：旧 `public/scripts/personas.js`、`public/index.html`、`public/script.js`，以及 [SillyTavern Personas 文档](https://docs.sillytavern.app/usage/core-concepts/personas/)。旧备份不含头像二进制和聊天绑定，因此不能宣称仅凭该 JSON 恢复完整身份资产。

本模块不是旧管理抽屉重显示，也不恢复整套 SillyTavern 产品迁移。它新增 Native 资源、会话/请求 evidence、数据转换与完整恢复。具体 API 字段/版本须在 D1 契约核对后锁定；以下为拟定语义，不表示类型/endpoint 已存在。

## Native authority design

| 对象 | 拟定语义与拥有者 | 实现复用点 / D1 要核定的契约 |
| --- | --- | --- |
| Persona | authenticated account 内稳定 `personaId`；名字不作主键 | `src/native/contracts.js`、identity、既有 Storage；resource kind / validator / CRUD ports |
| Persona revision | 不可变姓名、头像 Asset ref、描述、管理备注及结构版本 | existing repository immutable/CAS discipline；分离管理备注与请求投影 |
| Default selection | 账户内确切 persona revision 或显式 none | 同既有用户资源存储整合；并发更新检测；不可用默认的就近修复 |
| Session selection | 当前 Session revision/branch 下确切 ref + 可解释快照 | `session-core.js`、`session-snapshot.js`、session repo；namespace/操作/CAS/state hash |
| Message identity | 被接受输入记录当时身份显示快照和来源 | Timeline metadata/projection/fingerprint；不追随后来重命名 |
| Request identity evidence | 当前接受上下文中的身份证据 + selected/omitted explanation | `adapters/generation-host.js`、`model-prompt-runtime/context-providers.js`、Effective Request Snapshot |
| Migration receipt | 账户内 source digest、legacy key→native ID/revision、完成/待处理项 | 既有 Storage 事务/receipt；稳定 schema、重放与恢复 |
| Avatar asset | formal Asset ref/content hash；账户隔离与引用闭包 | `repositories/asset-store.js`、asset delivery、backup；增加 persona/session/save 引用解析 |

服务以认证 owner 为准，不信任浏览器提交账户标识。客户端可展示 revision 与草稿，但不能提交自造 `prompt.host` 或越过原生 context authority。完整 API、错误码、大小/图片限制与兼容版本在 A4a 前必须得到验证器与测试契约；不以 UI 草案里的假字段名直接充当 wire contract。

## Session lifecycle

1. 创建会话时，用户显式选择优先，否则读取当时可用的账户默认；事务中捕获 exact ref/snapshot。none、归档、缺失或无权限应明确呈现，不能用另一身份静默顶替。
2. 编辑 Persona 创建新修订；现有会话保持其原修订。更新到新修订必须由当前会话显式选择并审阅差异。
3. 切换只作用于当前可写上下文的后续输入/生成，保留输入草稿，不影响其他 Session 或历史。生成/停止中、历史预览、无写权限时禁用，并由服务侧重验。
4. 身份切换为原生会话状态操作，使用当前 revision 的 CAS。切换与发送并发时，仅一次被接受的上下文决定输入身份；另一次返回冲突，不能出现显示甲、请求乙。
5. 分叉继承分叉点的身份状态；新分支后续可独立切换。保存/恢复携带准确快照和资源/资产闭包，不依赖当前账户默认。
6. 同一已接受请求的重试原则上固定原身份证据；重新输入/重开通过现有原生生命周期产生新上下文。具体 retry 类型与 fork/rollback 的差异属于 D1 必核项，不允许绕过不可变 Timeline。
7. 旧会话按既有已提交 display metadata 保留历史。可由可证明的旧来源建立未来身份选择，来源不明确时要求显式选择；不回填虚构 personaId 到旧请求。

来源归档或删除不得破坏历史显示；离线快照用于可读恢复，真实缺失状态仍需标明。缺头像可以占位但保留原 asset ref/原因，不能偷偷替换快照。

## Prompt / Context integration

描述是玩家提供的资料，不是作品世界事实或作者 Actor 定义。复用既有 Context Plan → Prompt IR → 编译/预算 → Effective Request Snapshot，定义有类型的 persona context contribution，不拼接到全局 system prompt。

是否使用描述取决于具体作品/任务/路线声明的适用 context 和程序消费位置。未消费、禁用、无权限、预算省略都要可解释。身份显示可生效而描述未进入请求；UI 不用“已应用”掩盖该差别。

记录 exact persona ref、快照摘要、context 来源、消费阶段、token/budget 结果及遗漏原因；预览不发送、不解析 Secret、不写会话。实际请求证据来自服务端接受的上下文，而不是客户端预览截图。管理备注不进入任何请求投影。

任务过滤沿用既有角色/Task authority：与当前玩家身份无关的 Studio、后台维护或记忆工作不能默认获得全文个人描述。作品要求与玩家资料冲突时保持来源区别，作品 canonical facts/Actor 权限不被用户文本覆盖；不能默默把文本注入多个角色。

旧 `{{user}}` 仅在清楚的 legacy 描述转换中按捕获的 persona 姓名处理，需展示转换差异；`{{char}}` 多 Actor 时不猜测单一角色。未知宏原文保留、提示待处理，不作为模板代码执行。Native 作者资源继续使用现有 typed Prompt 契约。

## Management and deletion

列表支持搜索、排序、分页、新建、复制、详情编辑/新修订、归档/恢复、默认管理、使用引用。图片上传/裁剪结果通过正式 Asset 管理，取消不留下有效引用；具体允许类型和尺寸使用现有校验器。

归档保留 revision 与所有快照，阻止作为新选择候选；当前快照照常可读。永久删除需先显示真实 Used By（默认、Session、branch/save、request evidence、迁移 receipt/备份相关资源），只允许按约定保留策略处理无引用资源，不能级联重署名历史。首轮不提供“把旧历史全部同步成当前身份”。

## Legacy conversion matrix

| 旧能力/数据 | 新处置 | 验收重点 |
| --- | --- | --- |
| `personas` avatar filename key | 稳定 ID，文件名只存 legacy provenance；图片转 Asset | 重命名/重复文件不改变资源身份 |
| `persona_descriptions` name/description/title | core 内容转修订；title 为管理备注 | 原文字节可恢复，备注不发送 |
| `default_persona` / 全局当前设定 | 默认采用单独审阅，默认不替换现有；当前选择转显式 Session scope | 改默认不改变旧 Session |
| chat lock / temp / auto-lock | 先保留原 scope 证据；可证明来源才映射会话选择 | 不跨会话重署名；无“一条临时输入”假能力 |
| character/group/dedicated bindings，多候选 | 待处理来源；人工确认 Native 目标后显式映射 | 旧 avatar/群组 ID 不当 packageId/entryPointId |
| PromptManager / AN top/bottom / depth/role / NONE | 支持 typed context 才映射；未支持暂不注入 | 迁移完成 ≠ 描述已经进入请求 |
| Persona Lorebook | 保留原引用；明确映射到 Knowledge 和实际 scope | 不变成全局世界事实，缺闭包有修复 |
| `{{user}}` / `{{char}}` / 未知宏 | 显式转换审阅/待处理，保留原文 | 不猜多 Actor，不丢未知配置 |
| Actor 导入身份 | 仅选择允许的显示资料/描述字段 | 不导入角色 authority/工具权限 |
| persona-sync history | 退役为非支持的历史批量改写，原数据可导出 | 已提交 fingerprint 不变 |
| old JSON backup | 预检、转换副本、结果/待处理；缺图和聊天绑定明确说明 | 不宣称完整恢复 |
| 使用统计 / 删除 | 由真实引用计算；删除按原生闭包 | 不用 UI 访问次数替代真实引用 |

## Migration transaction and rollback

读取旧本地数据或用户选择的旧 JSON，先验证结构/版本/大小和所有条目；预检只读。审阅显示新建副本、同名/ID 冲突、默认选择、图片/绑定/注入待处理和转换 diff。名称碰撞创建副本，不覆盖原项。

按账户 + source digest + legacy key 建 ledger：重复执行返回已完成映射，未完成项可重试；有内容变化形成新的受审阅来源，不盲目覆写之前转换。账本记录原始数据、头像映射、警告和目标 exact revision。批次与单项原子边界、失败补偿与恢复流程在 D1 以实际存储引擎核定。

转换先创建资源/资产，验证闭包后才发布可选结果，最后可显式采用默认。取消预检不写数据；部分失败保留已完成 receipt 和可解释未完成项。保留旧数据以支持回退/重新审阅；回退不能删掉转换后已被会话使用的快照或重放历史。

首轮不自动将旧绑定跨作品推广。无法迁移的高级设置保存在来源详情并能导出/再处理；不假装具备其 Native 行为。

## Backup / restore and shared/custom UI

新完整备份需 versioned manifest，含 Persona 全修订、avatar assets/hash、默认（单独范围选择）与迁移证据；选入的会话/存档必须带身份快照与闭包。预检验证 hash、重复 ID、账户目标、缺资产与确切引用；恢复策略显式审阅，不按名字自动合并。继续复用现有账户备份和原生 save 容器，不创建并行备份服务。

共享中身份是席位主体授权的输入资料，不等于账户档案。观察者不能替玩家选择；Host 能否替席位选择由现有权限判断，首轮默认只允许席位授权主体操作。描述的可见性/传递范围必须与现有任务和共享投影契约匹配；无支持时拒绝或解释停用，不能回退为一个共享全局 persona。

作品自有 UI 通过 Host capability 打开身份选择；失效/崩溃时仍有宿主入口。游戏不获得个人库任意读写能力。

## D1 required contract audit

- Resource kind/identity/schema、revision hash/CAS、归档与删除引用解析、Storage 引擎 parity。
- Session state namespace / lifecycle / save format 版本与旧 save 兼容；旧 metadata 到未来选择的可证明范围。
- Prompt context 类型/消费位置/角色过滤/预算 provenance；不可伪造的服务端捕获。
- Shared seat principal/capability、Host Bridge 的 scope、个人描述可见边界。
- Ledger 单项/批次原子性、图片引用补偿、可重试恢复、备份 manifest 和冲突策略。

该 audit 需产出可验证的契约与测试清单；不要求用户替实现者选择 API 名称。

## Release gate

A4a 完成后才能接 A4b；入口开放需 V20 的账户隔离、revision/CAS、默认/会话/历史、Prompt 证据与过滤、branch/save/旧格式、共享/自有 UI、迁移幂等/失败恢复、图片/备份闭包全部通过。没有模型实发证据时只承诺编译与受控测试所证明的范围。任何兼容能力尚缺时明确保持入口未开放，保留旧数据，不以关闭 warning 代替验收。
