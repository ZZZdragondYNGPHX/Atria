# Test Suite & Defensive Code Cleanup

> 执行规则入口：[Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- Task ID: test-suite-defensive-cleanup
- Primary Workspace: `refactor/test-suite-defensive-cleanup` 产品源码工作树
- Status: Implemented（实际结果与交付见同一 Record）

## Goal and boundaries

当前 Native Play 将旧 Chat composer 置为隐藏且 inert；测试不得通过恢复旧 UI 来维持历史通过状态。用户数据与生产故障处理不是本轮可随意删除的兼容层。

## Evidence and cleanup list

远端 `main` 基线 `695acf3bcad1d42e331459189532a76056278bec`。全量静态清单覆盖 tests、scripts、.github 的 1,616 个文件，详见 [Record](../../records/refactor/test-suite-defensive-cleanup.md) 及逐文件 baseline。

1. 删除旧 Chat/Character/扩展 UI E2E 与依赖个人 data/config 的浏览器集成集；保留 Native Session、Shell、Entry、存储/同步、安全 E2E 和 Native smoke。
4. 测试配置使用真实默认配置和隔离数据目录，消除个人数据清洗、递归万能 Proxy、强制退出与孤立资源；安全 sanitizer 必须使用真实实现。
5. 清理命令、依赖、引用和文档；远端不存在 Actions workflows，不新建或执行 Actions。

## Material design changes

用户追加明确要求：本次清理同步到 `refactor/atria-native-orchestration-v3`、`feat/native-visual-generation-deepening`、`feat/atria-project-skill-routing`。主清理仍沿用原分支与本 Record；

用户随后取消 skill-routing 同步并授权删除该已归档分支；保留原 HEAD 的归档标签，删除开发分支及工作树。开发分支同步范围收敛为 native-orchestration-v3 与 native-visual-generation-deepening。
