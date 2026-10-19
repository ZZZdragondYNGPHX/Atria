# Termux Native storage ownership 启动兼容

## 2026-10-19 — 文件系统编号精确归一化

- Task ID：`fix/termux-native-storage-ownership`。
- Primary Workspace：`tasks/termux-native-storage-ownership/source`；源码基线 `main@da8c2c1910a0343ec5821ab751116d8a877a0a9d`；修复提交及本地 main `d3857e866`。
- 用户报告 Termux / Node v26.3.1 启动在 `NativeHostOwner.assertLocalRoot` 被拒绝，尚未进入 TCP 写者锁获取。日志没有实际文件系统编号；首次用户诊断命令因全角标点及缺字解析失败，已给出缩短后的只读命令，设备实际编号和修复后启动结果仍待回传。

### 原因与实现

- 原代码将 `statfsSync(root).type` 直接转成 Number，与正整数白名单比较。F2FS / Btrfs 的 magic 高位为 1，32 位有符号值或 64 位符号扩展值均会被误拒绝；先转 Number 再截断也会因 64 位整数精度丢失得到错误低位。
- 可复现示例：F2FS `0xf2f52010` 的 uint64 符号扩展值为 `18446744073490735120`；Number 后再 `>>> 0` 得到 `4076150784`，正确值为 `4076150800`。
- 仅修改原 `src/storage/native-host-owner.js`：使用 `statfsSync(root, { bigint: true })`，以 BigInt 掩码提取精确 32 位 magic，再对照原白名单；拒绝原因附带归一化后的十六进制类型供后续诊断。
- 保留原允许集合、身份文件、fsync、127.0.0.1 独占 guard 和生命周期；不按 Termux 路径跳过检查，不新增远程/FUSE 文件系统许可。
- 技术依据：[Node statfsSync bigint 选项](https://nodejs.org/api/fs.html#fsstatfssyncpath-options)、[libuv statfs 类型传递](https://github.com/libuv/libuv/blob/v1.x/src/unix/fs.c)、[Linux filesystem magic 定义](https://github.com/torvalds/linux/blob/master/include/uapi/linux/magic.h)。这些资料支持编号处理方法，不能证明用户设备的实际文件系统类型。

### 实际验证

- 本地 Linux / Node v24.21.0：4 suites，56 passed、1 skipped（Windows UNC 专属用例），无失败。
- 执行：`cd tests && npm run test:unit -- --runInBand --runTestsByPath native-orchestration/termux-filesystem.test.js native-orchestration/storage-foundation.test.js native-orchestration/host-lifecycle.test.js native-orchestration/storage-policy.test.js`。
- 新回归用例 18 项：F2FS/Btrfs 正值、有符号值和 uint64 符号扩展；原 ext/XFS/tmpfs/ZFS；NFS/CIFS/SMB2/FUSE/未知类型仍拒绝；目录 fsync 失败仍拒绝。允许类型同时实测第二 owner 排斥及释放后相同身份复用。
- 原有用例另含真实子进程被排斥、强杀后 OS 释放 guard、FS/SQLite 生命周期及事务围栏验证。
- ESLint `src/storage/native-host-owner.js`、`git diff --check` 通过。此为启动存储检查改动，没有 UI 改动，无浏览器验证需求。
- 回归文件按本地现有 tests 排除策略保留在 main 工作区 `tests/native-orchestration/termux-filesystem.test.js`，没有强制加入产品提交，也没有合入其它任务暂存的测试移除。
- 尚未执行 Android/Termux 真机或 Node v26.3.1 启动验证；本地模拟只证明已知编号表示兼容问题得到修复，不把设备故障原因记为已确证。

### 集成与维护

- 已将源码修复快进集成 main，沿独立 docs 分支记录；保护原有 main 暂存内容、docs 视觉参考未提交更新和其他活跃任务。
- 交付同步 main / docs 后清理本任务临时工作树与分支；不创建 HANDOFF。Termux 可通过现有工具箱更新 main，或在 main 工作区 `git pull --ff-only` 后使用原入口启动，无依赖及数据迁移。
