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
