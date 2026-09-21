# R7 Shell 中文本地化修复

## 状态

- Repository: `ZZZdragondYNGPHX/Atria`
- Baseline: `main@1f199764baf7ef87743d52d865d0eb02ae72702d`
- Temporary branch: `fix/r7-shell-zh-localization`
- Final task HEAD: `af3eb380e26bc52f74ebede9855d4b05d2debd77`
- PR: **#80 — fix: localize R7 Shell surfaces**
- Validation: **Atria PR Checks #758**, run `35608606942`, success
- Squash merge / resulting main: `5df59a5c7789219bf96c6574f100209a264db454`

## Result

R7 Shell 的展示层已经统一接入 Atria 现有 i18n，而不是把英文常量硬改成中文。

覆盖范围：

- 主导航：游玩 / 书库 / 工作室 / 智能体 / 运行时；
- 全局工具：命令 / 诊断 / 插件 / 设置 / 账户；
- Library / Runtime 子页；
- Command Palette / Command Sheet；
- Context / 状态提示；
- Plugins / Settings / Account 自有文案；
- 简体中文与繁体中文。

为了避免与旧全局词条冲突，Shell 使用 `atria.shell.*` 命名空间。例如旧全局 `Play` 可继续表示媒体“播放”，Atria Shell 的 `atria.shell.domain.play` 则明确翻译为“游玩”。

内部 route id、workspace id、存储 schema、插件 API、Runtime authority 均未修改。
