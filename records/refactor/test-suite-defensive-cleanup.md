# Test Suite & Defensive Code Cleanup — Record

- Task ID: test-suite-defensive-cleanup
- Primary Workspace: `refactor/test-suite-defensive-cleanup`
- Status: Complete
- Plan: [清理方案](../../plans/refactor/test-suite-defensive-cleanup.md)

## Stage 1 — 远端基线与清理清单

- Start HEAD: `695acf3bcad1d42e331459189532a76056278bec`（fetch 后 origin/main 与 main 一致）
- End/Tested HEAD: 审计基线同上
- Status: 清单完成；开始实施
- Local validation: Git refs/worktree/dirty 核对；全量读取 tests/scripts/.github 并统计、解析生产导入、Mock、断言与跨文件重复块。没有运行产品测试或构建。

### Baseline

- [逐文件分类、行数、测试块、Mock、断言、重复块、直接生产导入和理由](test-suite-defensive-cleanup/baseline.tsv)
- [机器可读汇总](test-suite-defensive-cleanup/baseline-summary.json)
- tests 共 1,552 文件、277,859 行（包含 JSON、锁文件、文档与辅助文件）；`.test/.spec.{js,mjs,ts}` 1,072 文件、189,750 行，另有 `.e2e.js` 和独立 smoke。统计为物理行数，不称可执行 SLOC。
- 测试 Mock 模块调用 439 处。去空行/注释后连续 8 行跨文件完全相同的 distinct blocks 3,354 个，涉及 456 个文件；这是文本重复指标，不当作等价测试比例，也不自动删除。
- 审计集合 1,616 文件：初始保留 1,306、删除 289（51,148 行）、重写 17、合并 4。实施中的细化与实际结果在后续阶段记录。
- `.github/workflows` 不存在，实际 workflow 数为 0；不虚构 CI 节省时长。

### Evidence and decisions

- `public/scripts/atria-shell/native-play-host.js` 将旧 sheld 标记为隐藏、inert，实际用户入口为 Native Play Product。旧 E2E 依然点击 `#send_textarea/#send_but`、Character drawer、已退役扩展，不能代表当前产品可用性。保留 Native Session/Shell/Entry 和存储、安全、同步；旧 Persona 中账号隔离/OAuth 项单独保留。
- 旧 frontend/skills-ui Playwright 项目从个人 data/config 克隆并依赖 live 模型，默认不执行；sample 仍断言 SillyTavern 标题。删除失效集及集成项目入口，不以 skip/fixme 替代。
- 历史阶段 scripts 反复读取源码正则，并互相读取检查器自身；不承担运行时权限或数据校验。删除这类门禁，保留真实 Native 后端/HTTP/浏览器行为测试和当前产品 localization/plugin 检查。
- 两份 task-messages 测试各自复制生产函数，甚至模拟 Map lookup 证明历史结果；合并为真实生产函数测试。
- 字段读取对已序列化 JSON 又逐字段 stringify，构造 circular/BigInt 的假设异常，外加两个薄包装与重复分发测试；改为直接共享读取实现，保留输入协议与敏感字段边界。
- 全局递归 Proxy、jQuery 链、identity DOMPurify 可能掩盖真实缺失/安全错误；本轮简化时以真实契约验证。

### Limitations

全量静态扫描与重点人工核对不是逐行人工评审；保留项不代表已全量执行。现有其它任务工作树未改动；旧 HANDOFF 属其它活跃任务，不读取或覆盖。

### Next checkpoint

按清单删除失效集，完成当前 Native/存储/安全入口引用核对，再推进共享实现与环境简化。

## Stage 1 implementation — 旧 UI 与阶段门禁退役

- Start HEAD: `695acf3bc`
- End/Tested HEAD: `refactor(tests): retire obsolete UI suites and phase guards` 提交（本阶段同树）
- Status: Complete
- 实际差异：297 文件，+53 / -51,382 行；删除清单的 289 个文件。移除个人 seed 的 integration 项目、旧标题 sample、历史源码正则 scripts，更新实际验证入口与过期 CI 文档；测试包改名 Atria，删除独立 lodash 固定旧版本声明与 `--forceExit`。
- Local validation: `git diff --check` 通过；Jest `--listTests --runInBand` 成功；Playwright `--list` 成功发现 102 文件、300 测试。这只是发现验证，不声称测试通过。
- 发现并修复：Playwright Native fixture 在测试发现期导入 server 模块，未设置 config 时真实退出 1。配置现显式使用 committed default config，成功重新发现；未复制开发者 config 掩盖问题。
- Next checkpoint: 简化真实生产读取/消息更新实现、孤立 iter-studio 模块、Jest 与 E2E 环境，运行直接相关行为验证。

## Stage 2 — 生产边界与测试环境简化

- Start HEAD: `f436302a5`；期间外部治理任务追加指令同步提交，未覆盖其修改。
- End HEAD: `7eb7565e3912cf11b45ec685e17f0a1d0f4c0ca7`；末尾引用/兼容 API 清理 `9d224819f`。
- Status: Complete
- 用户追加范围：清理同步到三个当前开发分支；已只读核对它们的 HEAD、dirty 状态与新增文件。最终同步后记录各分支提交和验证。
- 删除没有生产消费者的 Orchestrator iter-studio 会话/显示/沙箱/读取模块，移动仍被 Memory Schema Studio 使用的 edit payload 至共享 iteration-library；删除两份测试中的镜像实现，直接执行生产消息更新函数，保留全批审批、拒绝、冲突、回滚、跨消息隔离与只读结果。
- 读取字段去掉重复 stringify、未使用 enum 读取与虚构 circular/BigInt 截断信封；保留长文本原样读取、工具入参校验和 own-property 访问边界。
- Jest 不再注入万能 Atria/jQuery Proxy，默认配置固定为提交版本，测试后清理隔离数据。必要测试显式使用有限 host fixture；注册测试使用真实工具注册模块。移除 forceExit 与 test-only registry alias。
- E2E 服务器不再克隆、关键词清洗个人 data/config；从空目录按真实初始化流程启动，结构化 YAML 覆盖。删除固定端口范围；启动/清理失败正常报错。按真实导入与调用关系裁剪 helper，删除 5 个没有消费者的 UI helper 模块。
- DOMPurify 不再 identity sanitize。renderer 测试在 jsdom 使用真实 sanitizer；发现 fflate 浏览器 ESM 在 Jest29 环境解析错误，测试 bundle 明确使用同一包的 Node export。3 个 renderer 用例通过，包含真实 XSS 清理断言。
- 数据库测试不再默认连接个人开发机固定端口；显式 URL 才加入矩阵，已配置不可用时仍失败。新增明确的 test:db 入口，无配置直接失败，不声称未运行的 MySQL/Postgres 通过。
- 补齐 5 个 `.test.mjs` 的 Node runner 入口：`test:contracts` 实际 8/8 通过。

### Failure evidence and repairs

- 首次将 @jest/globals 放入共享 setup 导致 Jest29 Mock 相对路径解析基址错误；移除该 import，使用已初始化的全局 hook 后重新验证。
- 203 文件定向组原有 182 文件通过、21 文件失败；显式补齐相关 host 上下文后，原失败组 17 文件/252 用例通过，后续其余修复的定向组继续通过。未将失败测试删除作为修复。
- 更大范围共享环境检查：558 文件中 541 通过、17 失败，6,087 用例通过、83 失败、2 skipped。失败包括默认外部数据库不可用、过期边界 Mock 缺导出及缺少明确的 Atria context；逐项修复并复测中。删除期间已在执行的 MockServer 自测也计入该次失败，不能把本次结果写成全绿。
- Native UI 测试实际捕获过期夹具：`.first()` 选中了新增内置作品，触发正确 Runtime 配置门禁；改为明确选择本测试 Package。又修正已变动的 toolbar/Extensions 名称与隐藏 ABI 的可访问性断言；没有移除产品任务绑定门禁。
- Memory Context 真实新增了 applicability/displayGrant 信封与 hard-reserve 失败契约，旧字符串相等/预算不足成功断言过期；测试现在验证信封内完整源内容与明确的 overflow 拒绝。相应行为测试通过。

### Runtime, persistence and security repairs

- Native 旧 forkBranch/retryReply 接口已从当前生产实现删除。有效状态、历史、权限、认知与成本回归改用真实 Save → Restore；不恢复兼容接口。同 HEAD Restore 也生成新 Branch；恢复认知证据保留作者数据和引用、验证新 Branch/revision 锚点。
- FS Native journal 当前提供原子事务，删除 Run Control/Runtime checkpoint 的重复人工补偿，失败断言改为没有部分发布。故障注入通过继承 transaction 后重写方法，避免 Journal Proxy 忽略直接赋值而假造测试成功。可移植导入失败不留下成本记录，最后定向 2/2 通过。
- Project 重启恢复 Review 后，主动重新 Review 曾被 draft-only 门禁错误拒绝。改为允许显式重新准备、清除旧 commitIntent，仍拒绝 committing 期间修改和过期 Preview 提交。保留任务隔离、未知提交结果、CAS、真实文件与 Git 收据测试。
- 删除 Generation Host 已被 AuthorityTransaction 替代的 free-text resolver 分支；保留当前权威选择、签名 replay、预算、权限及取消路径。
- 实际修复 provider 夹具的 Anthropic/Gemini 终止事件、capture 执行绑定与 Native Studio role；修复后台任务夹具异常未释放 gate 而污染后续测试的问题。
- 最后全仓搜索确认 `hasPendingSiblingsFor` 没有调用方，删除仅为历史测试保留的 API；2 文件 11 用例通过。清理指向已删除 Studio/E2E 的注释与数据库固定端口说明。

### Actual local validation

以下为各次直接相关执行的实际结果，有重复路径，不合计为独立用例总数：

| 范围 | 最终结果 |
| --- | --- |
| Memory Graph、iteration library、schema iteration | 104 suites / 1,033 tests passed |
| 工具真实注册边界 | 6 suites / 49 tests passed |
| provider capture、Project recovery、authoring/experience actions | 4 suites / 110 tests passed |
| authority/history/information/FS durability/capability retirement 修复组 | 5 suites / 70 tests passed |
| Save、消息投影、actor/activity/turn、Agent sources 等有效契约 | 先前综合组 8 文件 / 354 passed；余下 4 文件失败随后包含于上一行的修复组，不把原综合组称为通过 |
| Generation/DB/恢复边界定向组 | 10 文件 / 233 passed、2 skipped；其中 evolution 冲突断言后续定向 2 passed |
| Retrieval、desire、continuation、background、cognition | 最终综合组 4 文件通过、288 passed、1 skipped、1 failed；最后 cognition FS 原子导入断言修复并另行 2 passed |
| Runtime checkpoint consumer | 该文件通过，仍覆盖实时预算、权限/当前性和不透明 checkpoint |
| Node `.test.mjs` contracts | 8/8 passed |
| 当前 Native Product 浏览器 UI | 1 passed，真实本地服务与 Chromium |
| Basic auth / CSRF E2E | 4 passed，真实本地服务 |
| proposal bus 最后清理 | 2 suites / 11 tests passed |
| 最终 Playwright discovery | 102 files / 300 tests 被发现；不是执行通过 |

Native/storage 扩展组发现多处陈旧接口和 gate 泄漏，曾终止两次本任务的长时执行，保存失败事实后分组修复；未宣称完整套件通过。共享环境广泛执行的失败数字保留在前段，不用最终定向结果改写为原运行全绿。

未运行完整 `npm test`、全量构建、全部 E2E、Android/客户端设备矩阵及 MySQL/Postgres 实库测试。Docker 与测试数据库凭证不可用；未配置的外部 DB 仅排除/显式跳过，不是通过。全部模型 HTTP 测试使用本地合成 fixture，无外部模型 API 调用。

## Stage 3 — 开发分支同步与最终集成

- Status: Complete
- 用户随后明确归档并删除 skill-routing，不再同步该分支。原工作树无未提交/未跟踪/忽略内容，原 HEAD `b0005b68dc113e068501047f478e54c0b3a13bf7` 已保存并推送 tag `archive/atria-project-skill-routing-2026-10-16`，删除本地/远端 `feat/atria-project-skill-routing` 和原工作树；清理未交付的本任务 sync-skills 工作树/分支。
- 另两个开发分支先在隔离的 refactor 同步工作树应用本次语义提交，不合并 main。保留其新增测试与实现；新增分支测试/工具的逐文件静态清单见 [编排](test-suite-defensive-cleanup/development-orchestration.tsv)、[视觉](test-suite-defensive-cleanup/development-visual.tsv)。这些覆盖实际预算/权限/并发/CAS/未知提交/当前模型生产者，不因故障路径多而删除。
- 编排起点 `0dcb97267a267ac05242bbb8a8bcbc7aad4ee104`：保留 turn producer proof 与 lane provenance、SQL host topology/lifecycle，采用显式数据库 URL。7 suites / 253 passed、5 skipped（未配置外部 DB），包含真实 Authority turn producer、generation send、turn finalization、Project producer、retrieval 和 migration。
- 视觉起点 `00edac0a3ed93c70b676d6691ad042126eee6c5e`：首次有效组 4 passed / 2 failed；失败暴露资源类型未注册、Preview 过期保护缺失与 FS migration 原型比较问题。修复真实注册、提交前和副作用边界上的 Preview 复验、canonical JSON 对比；不弱化有效回归。最终 Project recovery 33 用例通过；backup/transient source 2 suites / 14 passed、4 skipped（未配置外部 DB）。另修复 FS transient 仅扫描顶层而漏掉 Session 子目录，完整备份资源仍逐条比对，不排除丢失资源以让测试通过。视觉实际 generation/authority/durability 与共享消息契约先前 4 suites / 47 passed；最后 bus 2 suites / 11 passed。
- 同步冲突自动处理脚本曾误截断文件，第一次执行语法错误未运行相关套件；恢复完整原始文件后重新解决冲突、逐文件语法检查并重新执行。错误修正于未推送的同步提交，不把失败计为通过。
- [最终逐文件处理清单](test-suite-defensive-cleanup/final.tsv)、[最终汇总](test-suite-defensive-cleanup/final-summary.json)、[失效导入核对](test-suite-defensive-cleanup/reference-audit.json)。新增失效静态相对导入 0；基线原有缺失未作为新缺陷伪报。没有 workflows，CI 运行时间未测量。

### Final size and references

| 指标 | 基线 `695acf3bc` | 最终主清理 |
| --- | ---: | ---: |
| tests 全树文件 | 1,552 | 1,280 |
| tests 全树物理行（含锁文件等） | 277,859 | 222,497 |
| `.test/.spec.{js,mjs,ts}` 文件 | 1,072 | 992 |
| 同类测试文件物理行 | 189,750 | 174,065 |
| module Mock 调用 | 439 | 424 |
| 跨文件相同连续 8 行 distinct blocks | 3,354 | 2,031 |
| 含上述重复块的文件 | 456 | 257 |
| Actions workflows | 0 | 0 |

- tests 净减 272 文件、55,362 物理行（约 19.9%）；重复块降低约 39.4%，属于文本指标，不表示删掉了同等比例业务行为。
- 最终分类（原始清单并集新增）：保留 1,205、重写 104、删除 303、合并 4、新增 5；生产代码删除另计。保留 1,280 个 tests 树资源、992 个 test/spec 文件以及 300 个可发现 E2E，不以全部移除为目标。
- 与当前主线集成前 `5618cd8fa` 相比，本次实际集成 430 文件，+701 / -59,898，净减 59,197 行；删除 314、新增 6。与最初远端基线的差异另外包含并行治理任务的删除，不能全部算成本任务贡献。
- 删除 30 个历史阶段脚本；当前 localization/plugin 等真实工具保留。没有实际 workflow 可缩减，不宣称 CI 耗时已测量。
- 本地主线集成 `c57fada6e`，tree 与已测主清理分支 `9d224819f` 完全一致，`git diff --check` 通过；已推送 origin/main。视觉目标 HEAD `ae587be0c64487ba922528bdd0146444bcf5e92e`，已在原分支 fast-forward 并推送远端。

### Delivery

- Main / Tested tree: `c57fada6edeea255b29d857ba2585c1dbc9c098b` 集成提交（源码树与 `9d224819f56fdcb041d1e1551161cde9bb989d7b` 相同）；具体完整 main HEAD 见 final-summary。
- 编排同步 / Tested HEAD: `57544ae9ddb14121237dd2c308bf63c5bab7cbe0`。期间新提交 `bf7127f43` 在隔离同步工作树合入；其新增 Session output context/receipt 和最后 bus 契约实际 4 suites / 37 tests passed。原开发分支 fast-forward 前确认 incoming 文件与 dirty 集合没有交集，之后逐文件 SHA-256 核对 8 个未提交/新增/删除路径保持原内容。并行工作继续保留，不把这些 dirty changes 计为已提交或已验证。
- 视觉同步 / Tested HEAD: `ae587be0c64487ba922528bdd0146444bcf5e92e`。共享 cleanup、视觉真实 generation/authority/durability、Project recovery、备份/迁移和 bus 必要范围均有上述执行证据。
- main 与两个开发分支均已推送远端。删除本任务 3 个完成的 refactor 分支/工作树及远端旧 primary 存储分支；删除临时 sync-skills 分支/工作树。保留两个活跃开发工作树和它们的修改，不改变其它 workspace/HANDOFF。
- 用户指定的 skill-routing 已归档 tag `archive/atria-project-skill-routing-2026-10-16` 后删除本地/远端分支及工作树。归档保留未并入主线的原始提交，不丢失实现历史。
- 单一 Plan/Record 已更新；临时日志、fixture/截图产物、审计脚本、任务清单缓存和本任务目录已清理。永久保留逐文件审计与汇总，未发布测试 raw 请求/响应或个人配置。
- 没有执行独立审查/审查子代理，也未把额外审查设为交付条件。当前实际验证限制见 Stage 2；不声称完整套件、外部数据库或客户端矩阵通过。
