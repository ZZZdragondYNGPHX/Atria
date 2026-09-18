# Atria Termux 工具箱 v0.3.0

本版本对 Termux 工具箱进行结构级重构，目标是消除重复入口、统一状态管理并提高重装/升级安全性。

## 主要变化

- 主菜单收敛为：运行管理、安装/修复、版本管理、数据管理、设置/诊断、工具箱设置、实例切换。
- 保活启动只保留在“运行管理”，Android 页面只负责后台/电池设置与诊断，避免重复入口。
- Wake Lock 改为工具箱统一管理，并使用主实例/分身实例保活标记避免误释放。
- 前台启动不再 `exec node`，Ctrl+C 后返回工具箱。
- 版本更新默认使用 fast-forward，不强制覆盖本地提交。
- 数据分离支持“重装程序但复用已有共享数据”，不会因共享目录已有数据而误判冲突。
- 主/分身实例使用独立数据、备份、日志、PID 与保活状态；分身端口冲突时自动选择空闲端口。
- 增加环境诊断、一键修复、npm 依赖重建。
- 工具箱自更新增加 Bash 语法检查，更新失败时保留旧版本。
- 继续保持程序位于 Termux 私有目录、用户数据和备份位于 Android 共享存储。

## 数据布局

主实例：

- 程序：`$HOME/Atria`
- 数据：`/storage/emulated/0/Atria/data`
- 备份：`/storage/emulated/0/Atria/backups`

分身实例：

- 程序：`$HOME/Atria-2`
- 数据：`/storage/emulated/0/Atria-2/data`
- 备份：`/storage/emulated/0/Atria-2/backups`

## 保活模型

“保活启动”统一执行：后台启动 Atria → 请求 Termux Wake Lock → 首次引导 Android 电池后台设置。

Wake Lock 是 Termux 自带 `termux-tools` 能力，不依赖 Termux:API App。工具箱只记录自身的管理状态，不把状态标记冒充为 Android 内核实时 Wake Lock 状态。
