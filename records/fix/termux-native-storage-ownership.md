# Termux Native storage ownership 启动兼容

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

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

## 后续设备诊断 — Atria 目录为 F2FS

- 用户成功执行 `node -p 'require("node:fs").statfsSync(".", { bigint: true })'`，返回 `type: 4076150800n`，即 F2FS `0xf2f52010`；这是 Atria 当前目录的观测值，并非启动数据根目录的已确认观测。
- 该正值在原允许集合内，单独这项输出不能证实此前的编号表示兼容问题是这台设备启动失败的原因。需要继续核对实际 `dataRoot`、普通数字读取结果、运行的源码提交及更新后日志；不声称设备已恢复启动。
- 已请用户回传默认 `./data` 的普通数字 `statfsSync` 类型和 `git rev-parse --short HEAD`。源码核对确认检查目标为 `globalThis.DATA_ROOT`；默认 `./data` 可由 CLI `--dataRoot` 或 config.yaml 的 `dataRoot` 覆盖。

## 2026-10-19 — 确认工具箱共享目录冲突并修复

**设备证据与根因**

- 用户随后确认 `./data` 的 Number 类型也是 `4076150800`，当时源码为 `da8c2c19`。更新首轮修复后仍失败，新日志明确类型为 `0x65735546`（FUSE）。因此首轮编号归一化并未修复这台设备的实际故障。
- `config.yaml`：`dataRoot: /storage/emulated/0/Atria/data`；`readlink -f data`：`/data/data/com.termux/files/home/Atria/data`。手动诊断的私有目录与实际启动的共享目录不同。
- 用户实测 `process.platform` 为 `android`，挂载记录为：

```text
11710 6287 0:134 / /storage/emulated rw,nosuid,nodev,noexec,noatime master:54 - fuse /dev/fuse rw,lazytime,user_id=0,group_id=0,allow_other
```

- 解压并只读核对原工具箱运行时：`prepare_start` → `ensure_data_separation` 每次启动确保指向共享 data；原 `TOOLBOX_REFACTOR_V0.3.0.md` 明确支持该布局。后端拒绝所有 FUSE 与现有工具箱约定冲突，单改 config 会被工具箱改回，不能作为有效修复。

**实现、验证和交付**

- 沿同一 Task ID / Record 恢复 `fix/termux-native-storage-ownership` 工作树，基线 `d3857e866`；修复提交及本地集成 main 为 `c3844c939`。
- 原 `NativeHostOwner` 增加 Android 系统共享存储识别：仅限 `android`、canonical `/storage/emulated/<user>/...`、kernel mountinfo 中实际最内层挂载为 `/storage/emulated` 或 `/storage/emulated/<user>`，类型 `fuse`、来源 `/dev/fuse`。解析 optional mount fields 和转义挂载路径；嵌套的其它挂载不会被父级系统挂载放行。
- 不全局放行 FUSE；desktop Linux、任意 FUSE 路径、SSHFS/远程来源及未知挂载继续拒绝。身份文件 fsync、目录 fsync、原 TCP 独占 guard、Engine/Host 生命周期保持原协议。拒绝信息另带 canonical root，方便直接辨认实际数据位置。
- 更新原 `src/storage/README.md` 说明该 Android 特例。保留现有共享数据及 config，不迁移、复制或清空设备数据。
- 原生证据：[Android MediaProvider FuseDaemon](https://android.googlesource.com/platform/packages/providers/MediaProvider/+/refs/heads/master/jni/FuseDaemon.cpp) 的 `pf_fsync` / `pf_fsyncdir` 将同步转发至底层 file / directory fd；[Termux Node 构建](https://github.com/termux/termux-packages/blob/master/packages/nodejs/build.sh) 指定 Android target。参考实现不等于这台设备的物理断电认证，原同步调用失败仍拒绝操作。
- 本地 Linux / Node v24.21.0：同一 4 suites **76 passed、1 skipped**；新增 20 项 Android 挂载/保护用例（与前轮 18 项编号用例并存），其中包含用户回传的原始挂载行。Android 平台和挂载元数据模拟，身份文件、文件/目录同步与 TCP guard 使用真实本地 OS 资源。
- 覆盖 primary / Android 多用户 / user bind mount、含空格路径、无关子挂载不误拒绝；desktop / 非共享路径 / removable / prefix 假匹配 / SSHFS / nested FUSE / mountinfo 缺失、错误或不可读均拒绝；文件或目录 fsync 失败仍拒绝。
- 验证命令沿用前轮 4 个测试文件；ESLint、`git diff --check` 通过。回归文件按现有 tests 排除策略保留在 main 本地工作区，没有 force-add；其它任务原 1470 项暂存测试移除的 raw diff 哈希保持不变，docs 未提交视觉参考也保持不变。
- 同步 main / docs 并清理本任务临时工作树与分支。设备实际更新后再次启动的结果仍需用户回传，不能用本地模拟声称真机已恢复。用户更新 main 后用原工具箱入口重启即可，无需改配置或迁移数据。
