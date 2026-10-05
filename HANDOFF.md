# Atria Immersive Workspace — Live Handoff

## Task

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`（产品）；docs 为文档辅助空间。
- Current product branch: `refactor/atria-immersive-workspace`
- Product HEAD / tested content: `e35e900077b6c2963cd032cdccfc45c24ab90102`；已 commit/push，未合并 main。
- Current docs branch / HEAD: `docs`；本 A4a 持久化提交（读取真实 Git HEAD，不自引用 hash）。
- Current stage: A4a complete; A4b next；Persona 入口仍关闭。
- Plan entrypoint: [index](plans/refactor/atria-immersive-workspace/index.md)
- A4b required modules: personas、coverage 的 S20/关联行、validation。
- Record: [record](records/refactor/atria-immersive-workspace.md)，续接重点读 A4a。

## Completed

D1/P01–P06、A1–A3 保持。A4a 新增 Persona ID/四个 Native kinds 与 PersonaRepo；owner/exact immutable revision、root/default CAS、归档/Used By/delete/avatar、Native Product POST 家族与原 client 接线。FS/SQLite 实测。FS root 同步发布 `publishedRevisionIds`，未完成 revision 不成为历史/选择；这是发布闭包，不是新 authority。头像 PNG/JPEG/WebP/AVIF 先尺寸检查再实际解码，8MiB/4096²/像素/伪 MIME/损坏拒绝；本地已安装 WASM 初始化不 fetch 本地 URL，PNG 检查 CRC。

Session `atri_player_persona` protected namespace 捕获 default/explicit/none，不读全局 name1。solo select 持 Persona 锁到 HEAD 发布，匹配原 Continuity→Session 锁序，重验 HEAD/run/lifecycle/scheduler（含取消未 settle）。`_newEntry` 捕获 input display identity，普通/typed/begin 共用，客户端伪造拒绝，notes 不入任何 Session/message/request。旧 revision 不回填。non-transaction retry 按原 post-user fork，transaction retry 按原 pre-effect + 输入身份，ironman 禁用保持。

Context `player_persona` lane / `player_provided` 与 World 分离，Prompt stage `contextConsumers` 显式 opt-in；typed task 还需 context 声明，background/maintenance 不获得描述。预算/遗漏、exact ref/snapshotHash、consumer stages 进入真实 Effective Request Snapshot；本地受控 HTTP Provider 确认发送接受时旧快照，preview 不发送/解析 Secret/写会话。notes 未发送。

有身份的 Save v3 保留容器 v1，snapshot/session/resume 三 scope；旧 v1/v2 legacy 保持。state/hash/input evidence/avatar refs/attachments/bytes 闭包校验；独立跨账户恢复不自动入库/采用默认。AssetStore 引用/删除保护覆盖发布 Persona 全修订、存储快照与 migration target。

Shared 自己账户/席位授权、ACL/Session CAS/access/scope epoch 重验与 owner 头像复制；projection 仅 status/name/avatar，avatar HTTP 白名单不放开 owner 其他资产。authorization 存主体 hash 与 epoch，成员变更清理当前 seat，旧 Branch 不给后来主体旧身份。Host 仅固定 `status/openSelector` 合约，缺 picker 时 unavailable，无第四 Library 分类或 Host picker UI。

## Pending / next target

A4b：Persona 管理/选择/搜索与草稿/UI、迁移 preflight/apply/receipt 和逐项 replay、账户 native backup manifest/default 独立 adoption/restore，完整 Shared/Host 产品接线与开放门。先读 personas/coverage S20/validation 和 Record A4a 的限制；不能把当前服务 tests 当整套 V20。

当前 Shared 描述消费明确返回 `shared_scope_unsupported`，没有退回 owner solo/global；A4b 必须明示停用状态并关闭授权 consumer 的产品审阅/接线证据，再按实际支持范围决定开放。当前 persona-save-backup suite 只验证 Save/avatar，不是账户备份。migration kind/Used By 能识别真实 target，但迁移 API/validator/ledger 仍未实现；C20.5 prepared/revision/root/receipt 每断点回放归 A4b。

Host capability 白名单存在但 picker 没有实现；epoch/nonce/宿主恢复入口的真实 UI 证据归 A4b。Library 第四分类/Host picker 仍不能提前打开。S00–S20 全矩阵、真实设备/provider 与最终集成继续归 A5/B/F。

每阶段只做本地最小相关验证；实现/验证/commit/push 后更新同一 Record/live HANDOFF，给接手提示词并停止。不自动跨阶段，不提前合并 main。用户已授权普通问题自行处理。

## Key decisions / carry forward

D01–D20/P01–P06 不重开。Native AUTO(0)/DISABLED(-1) Enter 换行，Ctrl/Cmd+Enter 发送；ENABLED(1) 直接 Enter；Shift/Alt/IME/229 不发送，legacy AUTO 不改。未接受草稿只恢复同 Session/基准 revision；已提交输入不重发，Stop 在生成期间可用。

原资源/请求/Session/task authority 保持；无跨路由自动草稿持久化。资源 exact revision/contentHash 不自动 latest；Library/Save 旧依赖恢复保留新版默认，历史动作先 Preview exact。Native chatKey ABI 保留，Runtime repair 仍是临时原控制器返回记录，不能持久化成新 authority。S16 会话工具仍由原 SDK 清理，外壳层只在 Play 显示。

Persona source/notes 只在个人库；源归档/缺失不破坏历史 snapshot。Default/资源编辑不隐式推进 Session。FS withTransaction 无批量 rollback；migration 需 durable prepared → blob/ref/revision → root → receipt，账本 preallocated IDs/plan digest/default 独立 CAS；不能用普通 create() 重放代替迁移。保留旧 JSON 原字节/未知项/绑定 pending；旧整站迁移退役。

## Validation

A4a 最终 11 suites / 63 个不同 unit 用例有本地通过证据：新增 Persona 五 suites 22 tests，原 history 10 / Prompt freeze 9，加 22 个选中的 Save/Shared/run/typed frontend 回归。最后所有新 suites 21 tests，再针对引用 resolver 与新增 migration target case 复验 resources 7 + save/avatar 5；重叠不相加。

实际 FS/SQLite、双账户目录、真实头像四格式解码、Shared avatar HTTP 授权/拒绝、typed retry/begin/ironman Save v3、独立 Save restore，以及受控本地 HTTP Provider 的真正发送参数均有断言。触及生产 JS ESLint 与 diff whitespace 通过。MySQL/Postgres 本地未启（初始未过滤命令 ECONNREFUSED）；后续仅 FS/SQLite 的最小相关集合通过，不声称四引擎 parity。

未运行 Persona 浏览器/完整 E2E/全量 tests/构建/Android/真机/WebView/真实中文 IME/真实远端模型/远端 CI；没有显著 UI 修改。没有迁移、账户 backup 或真实 Host picker 验收。A3 历史 99 unit/10 Chromium 场景证据仍在 Record，不能转算成 A4 证据。

## Read first / preserve / do not repeat

核对真实 Git/远端 → 本 HANDOFF → index → A4b personas/coverage S20/validation → Record A4a。不要全扫 Plans/Records/Skills/reference；不要重做 D1/A1–A4a 或把 shared 描述停用宣称完整消费。

保留产品 AGENTS.md 与 docs README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md 原有 dirty changes；只提交任务文件。package/plugin/skills 未改，reference 未读。不要将 main merge 进独立长期工作空间。

## New-chat bootstrap prompt

继续 Atria 的 refactor/atria-immersive-workspace，执行 A4b。先核对真实 Git 状态，读 docs:HANDOFF.md → plans/refactor/atria-immersive-workspace/index.md → personas/coverage 的 S20 和关联行/validation，再读同一 Record A4a。产品分支 refactor/atria-immersive-workspace@e35e900077b6c2963cd032cdccfc45c24ab90102，A4a 已实现/本地验证/push，用户已授权普通问题自行处理。复用现有 PersonaRepo、Session CAS、Context evidence 与 Save v3，推进管理/选择/UI、迁移 ledger 逐项回放、账户 backup manifest/default adoption、Shared 授权消费和 Host picker/宿主恢复证据；当前 shared_scope_unsupported 必须明确，入口只在本阶段 V20 开放门满足后打开。每阶段只做本地最小相关验证；实现/验证/push 后更新同一 Record/HANDOFF，给接手提示词并停止。不提前合并 main。
