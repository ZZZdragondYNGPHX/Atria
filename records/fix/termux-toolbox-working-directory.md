# Termux 工具箱卸载后重装的工作目录修复

## 2026-10-19 — v0.3.10

- Task ID：`fix/termux-toolbox-working-directory`；Primary Workspace：`tasks/termux-toolbox-working-directory/source`。
- 原始基线 `main@c3844c939`；实现后基于测试清退 `main@727003268` 变基，最终源码提交及本地集成 main 为 `f4574f3e8`。
- 用户从“当前：未安装”选择安装时，npm 抛 `ENOENT: process.cwd / uv_cwd`，Git clone 同样报当前目录不存在。此错误发生于安装流程，区别于此前已修复的 Native Host FUSE 检查。

### 根因与实现

- 原工具箱的安装依赖、启动等操作会 `cd "$ATRIA_DIR"` 并将目录保留给菜单。卸载/重装直接删除该程序目录后，工具箱仍处在已被删除的 inode 中，随后 npm / Git 无法读取 cwd。
- 沿用原轻量启动器与已校验压缩运行时的覆盖机制，版本升级 v0.3.10。启动器首先进入 HOME；生成的完整运行时也在 shebang 后保留同一 cwd 恢复，保证工具箱保存到本地再启动时有效。
- 包装原 `install_atria`，在原重装删除和环境初始化前离开程序目录；保留数据卸载、彻底卸载也在删除前进入 HOME。切换目录失败则返回，拒绝继续删除。
- 保留原确认、路径所有权检查、共享 data / backups / exports 处理、默认/自定义缓存区分、main 分支与 Origin 策略；压缩运行时、npm 依赖及产品数据均未改动。

### 实际验证

- 本地 Linux Bash / Node v24.21.0，3 suites **34 passed**。
- 执行：`cd tests && npm run test:unit -- --runInBand --runTestsByPath termux/toolbox-working-directory.test.js termux/toolbox-uninstall.test.js termux/toolbox-update-guard.test.js`。
- 12 项本地新增回归：主/分身卸载后在同一 Bash 会话调用真实 npm 并向本地 Git 源重装；程序子目录、已有仓库重装、继承已删除 cwd、启动器及实际生成的保存运行时恢复；主/分身彻底卸载后的 cwd；三条删除/安装入口在 cd 失败时不删除。
- 用本地临时仓库执行真实 clone/fetch，无远端安装、外部 Provider 或付费调用；删除目标约束在临时 fixture 内。共享数据标记保持、完整卸载模式与自定义缓存保护分别验证。
- `bash -n`、生成运行时语法及 `git diff --check` 通过；没有 UI 变更，不需浏览器。尚无 Termux v0.3.10 真机重装结果，不以本地模拟声称设备完成恢复。
- 所有测试文件及配置只在本地；新回归保留主源码本地 `tests/termux/toolbox-working-directory.test.js`。最终产品提交仅修改 `scripts/termux/atria_toolbox.sh`，不把测试带回远端。

### 交付

- main / docs 同步后清理本任务工作树及短期分支，保留其他活跃任务。
- 当前会话先退出工具箱并 `cd ~` 即可离开已删除目录；通过 main 的原工具箱 URL 启动 v0.3.10，再从原菜单安装。Atria 的实际共享用户数据位置保持不变。
