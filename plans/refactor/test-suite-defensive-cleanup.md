# Test Suite & Defensive Code Cleanup

- Task ID: test-suite-defensive-cleanup
- Primary Workspace: `refactor/test-suite-defensive-cleanup` 产品源码工作树
- Status: Approved（用户已授权形成清单后直接实施）

## Goal and boundaries

删除不能证明当前产品行为的测试与防御性实现，降低启动、执行及维护成本。当前 Native Play 将旧 Chat composer 置为隐藏且 inert；测试不得通过恢复旧 UI 来维持历史通过状态。保留存储数据完整性、权限、网络安全、Native Runtime、Agent 编排、当前产品端到端契约；用户数据与生产故障处理不是本轮可随意删除的兼容层。

## Evidence and cleanup list

远端 `main` 基线 `695acf3bcad1d42e331459189532a76056278bec`。全量静态清单覆盖 tests、scripts、.github 的 1,616 个文件，详见 [Record](../../records/refactor/test-suite-defensive-cleanup.md) 及逐文件 baseline。静态计数不能证明行为等价，删除项另核对生产入口和替代测试。

1. 删除旧 Chat/Character/扩展 UI E2E 与依赖个人 data/config 的浏览器集成集；保留 Native Session、Shell、Entry、存储/同步、安全 E2E 和 Native smoke。不能仅因名称含旧阶段号删除运行时行为测试。
2. 删除历史阶段源码正则门禁、纯导入拼写/已删文件不存在断言；混合文件只删除无价值部分，保留实际调用生产代码的测试。
3. 合并读取字段包装层与镜像实现测试：直接测试共享生产实现，保留长文本、权限白名单、缺失字段、真实编排消息状态回归。
4. 测试配置使用真实默认配置和隔离数据目录，消除个人数据清洗、递归万能 Proxy、强制退出与孤立资源；安全 sanitizer 必须使用真实实现。
5. 清理命令、依赖、引用和文档；远端不存在 Actions workflows，不新建或执行 Actions。

## Stages and validation

1. 基线审计/分类与旧套件清理：持久化逐文件清单；验证保留测试发现和删除路径引用。
2. 生产实现与测试辅助简化：按模块运行直接相关本地行为测试，修复实际发现的问题；不通过删除有效断言掩盖故障。
3. 配置/文档/最终核对：验证 runner 命令、保留的关键 Native E2E、源码差异及资源引用；不默认全量 build/lint 或设备矩阵。未运行项明确记录。

阶段持续推进，同一分支、同一 Record。交付遵循 Governance §14；其它活跃任务与 HANDOFF 保持原状。
