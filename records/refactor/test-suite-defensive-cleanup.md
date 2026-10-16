# Test Suite & Defensive Code Cleanup — Record

- Task ID: test-suite-defensive-cleanup
- Primary Workspace: `refactor/test-suite-defensive-cleanup`
- Status: Active
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

## Stage 2 — 生产边界与测试环境简化（进行中）

- Start HEAD: `f436302a5`；期间外部治理任务追加指令同步提交，未覆盖其修改。
- Status: Active
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

### Next checkpoint

完成共享配置影响范围的必要验证与余下实际失败修复，持久化实现；随后同步开发分支并处理各自差异，更新最终清单与统计。
