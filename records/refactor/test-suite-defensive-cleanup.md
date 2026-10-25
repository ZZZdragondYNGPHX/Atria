# Test Suite & Defensive Code Cleanup — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: test-suite-defensive-cleanup
- Primary Workspace: `refactor/test-suite-defensive-cleanup`
- Status: Complete
- Plan: [清理方案](../../plans/refactor/test-suite-defensive-cleanup.md)

## Stage 1 — 远端基线与清理清单

- Start HEAD: `695acf3bcad1d42e331459189532a76056278bec`（fetch 后 origin/main 与 main 一致）
- End/Tested HEAD: 审计基线同上
- Status: 清单完成；开始实施
- 没有运行产品测试或构建。

### Baseline

- [机器可读汇总](test-suite-defensive-cleanup/baseline-summary.json)
- tests 共 1,552 文件、277,859 行（包含 JSON、锁文件、文档与辅助文件）；`.test/.spec.{js,mjs,ts}` 1,072 文件、189,750 行，另有 `.e2e.js` 和独立 smoke。统计为物理行数，不称可执行 SLOC。
- 测试 Mock 模块调用 439 处。去空行/注释后连续 8 行跨文件完全相同的 distinct blocks 3,354 个，涉及 456 个文件；这是文本重复指标，不当作等价测试比例，也不自动删除。
- 审计集合 1,616 文件：初始保留 1,306、删除 289（51,148 行）、重写 17、合并 4。实施中的细化与实际结果在后续阶段记录。
- `.github/workflows` 不存在，实际 workflow 数为 0；不虚构 CI 节省时长。

### Evidence and decisions

- `public/scripts/atria-shell/native-play-host.js` 将旧 sheld 标记为隐藏、inert，实际用户入口为 Native Play Product。旧 E2E 依然点击 `#send_textarea/#send_but`、Character drawer、已退役扩展，不能代表当前产品可用性。保留 Native Session/Shell/Entry 和存储、安全、同步；旧 Persona 中账号隔离/OAuth 项单独保留。
- 旧 frontend/skills-ui Playwright 项目从个人 data/config 克隆并依赖 live 模型，默认不执行；删除失效集及集成项目入口，不以 skip/fixme 替代。
- 两份 task-messages 测试各自复制生产函数，甚至模拟 Map lookup 证明历史结果；合并为真实生产函数测试。
- 字段读取对已序列化 JSON 又逐字段 stringify，构造 circular/BigInt 的假设异常，外加两个薄包装与重复分发测试；改为直接共享读取实现，保留输入协议与敏感字段边界。
- 全局递归 Proxy、jQuery 链、identity DOMPurify 可能掩盖真实缺失/安全错误；

### Limitations

保留项不代表已全量执行。现有其它任务工作树未改动；旧 HANDOFF 属其它活跃任务，不读取或覆盖。

## Stage 1 implementation — 旧 UI 与阶段门禁退役

- Start HEAD: `695acf3bc`
- Status: Complete
- 实际差异：297 文件，+53 / -51,382 行；删除清单的 289 个文件。测试包改名 Atria，删除独立 lodash 固定旧版本声明与 `--forceExit`。
- Jest `--listTests --runInBand` 成功；Playwright `--list` 成功发现 102 文件、300 测试。
- 发现并修复：Playwright Native fixture 在测试发现期导入 server 模块，未设置 config 时真实退出 1。配置现显式使用 committed default config，成功重新发现；未复制开发者 config 掩盖问题。

## Stage 3 — 开发分支同步与最终集成

- Status: Complete
- 用户随后明确归档并删除 skill-routing，不再同步该分支。原工作树无未提交/未跟踪/忽略内容，原 HEAD `b0005b68dc113e068501047f478e54c0b3a13bf7` 已保存并推送 tag `archive/atria-project-skill-routing-2026-10-16`，删除本地/远端 `feat/atria-project-skill-routing` 和原工作树；清理未交付的本任务 sync-skills 工作树/分支。
- 另两个开发分支先在隔离的 refactor 同步工作树应用本次语义提交，不合并 main。这些覆盖实际预算/权限/并发/CAS/未知提交/当前模型生产者，不因故障路径多而删除。
- 编排起点 `0dcb97267a267ac05242bbb8a8bcbc7aad4ee104`：保留 turn producer proof 与 lane provenance、SQL host topology/lifecycle，采用显式数据库 URL。7 suites / 253 passed、5 skipped（未配置外部 DB），包含真实 Authority turn producer、generation send、turn finalization、Project producer、retrieval 和 migration。
- 视觉起点 `00edac0a3ed93c70b676d6691ad042126eee6c5e`：首次有效组 4 passed / 2 failed；失败暴露资源类型未注册、Preview 过期保护缺失与 FS migration 原型比较问题。不弱化有效回归。最终 Project recovery 33 用例通过；backup/transient source 2 suites / 14 passed、4 skipped（未配置外部 DB）。另修复 FS transient 仅扫描顶层而漏掉 Session 子目录，完整备份资源仍逐条比对，不排除丢失资源以让测试通过。视觉实际 generation/authority/durability 与共享消息契约先前 4 suites / 47 passed；最后 bus 2 suites / 11 passed。
- 同步冲突自动处理脚本曾误截断文件，第一次执行语法错误未运行相关套件；错误修正于未推送的同步提交，不把失败计为通过。
- 新增失效静态相对导入 0；基线原有缺失未作为新缺陷伪报。没有 workflows，CI 运行时间未测量。

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
- 已推送 origin/main。视觉目标 HEAD `ae587be0c64487ba922528bdd0146444bcf5e92e`，已在原分支 fast-forward 并推送远端。

### Delivery

- Main / Tested tree: `c57fada6edeea255b29d857ba2585c1dbc9c098b` 集成提交（源码树与 `9d224819f56fdcb041d1e1551161cde9bb989d7b` 相同）；具体完整 main HEAD 见 final-summary。
- 编排同步 / Tested HEAD: `57544ae9ddb14121237dd2c308bf63c5bab7cbe0`。期间新提交 `bf7127f43` 在隔离同步工作树合入；其新增 Session output context/receipt 和最后 bus 契约实际 4 suites / 37 tests passed。
- 视觉同步 / Tested HEAD: `ae587be0c64487ba922528bdd0146444bcf5e92e`。共享 cleanup、视觉真实 generation/authority/durability、Project recovery、备份/迁移和 bus 必要范围均有上述执行证据。
- main 与两个开发分支均已推送远端。删除本任务 3 个完成的 refactor 分支/工作树及远端旧 primary 存储分支；删除临时 sync-skills 分支/工作树。保留两个活跃开发工作树和它们的修改，不改变其它 workspace/HANDOFF。
- 用户指定的 skill-routing 已归档 tag `archive/atria-project-skill-routing-2026-10-16` 后删除本地/远端分支及工作树。归档保留未并入主线的原始提交，不丢失实现历史。
- 单一 Plan/Record 已更新；临时日志、fixture/截图产物、审计脚本、任务清单缓存和本任务目录已清理。
- 没有执行独立审查/审查子代理，也未把额外审查设为交付条件。不声称完整套件、外部数据库或客户端矩阵通过。
