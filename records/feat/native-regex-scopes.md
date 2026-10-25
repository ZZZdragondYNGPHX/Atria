# Native Regex 三层作用域恢复

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

日期：2026-09-25。仓库：`ZZZdragondYNGPHX/Atria`。
任务分支：`feat/native-regex-scopes`。
基线：`6cf383abad35456316ab60ec4925830c6f4053fb`。
实现提交：`c053779e3e16f1953f8c1c4aa65d2d7a38183279`（已推送任务分支）。
最终 main：`df03dedbd46243bdf71e61861b494c7a30a20bd1`（已推送）。
状态：完成。任务分支已在本地和远端删除。

## 正式产品方案

Regex 恢复三个独立归属的作用域，固定执行顺序为 **Global → Preset → Game**。后一级继续处理前一级结果。各层规则仍使用同一 Regex 引擎的 placement、lane、depth、enabled、替换、宏处理及耗时诊断；注册的第三方运行时 provider 在三层之后执行。不存在第二个替换引擎。

| 作用域 | 所有者及持久化真源 | 自动启用及切换 | 导入导出 |
| --- | --- | --- | --- |
| Global | 账号 `capabilitySettings.regex`；现有 `regex_presets` 仅为账号规则启停组合 | 不受 Preset / Game 切换影响；仍尊重每条规则启停和 Regex 功能开关 | 复用现有规则 JSON 导入导出 |
| Preset | Prompt Preset 主 Program 的现有 Library root 内 `preset.regexScripts`，与 membership / taxonomy 同归属 | 沿当前主 narrator Runtime Route 的 `promptProgramRef` 解析拥有者；修改 Route 的预设选择后刷新。无独立 active-preset 设置 | `atria.prompt-preset` 同时携带 Program、Modules、Generation Profile、taxonomy 与 `regexScripts`；导入一次完整安装 |
| Game | Package archive 的 `processors.regex`；已存在 Session 的显式编辑快照进入现有 revisioned `atri_game_regex` state | 当前 Session 的有效 manifest 自动投影规则；关闭或切换 Session 不泄露上一游戏规则 | Package 导入导出携带真实 archive 内规则；portable save 携带有效 Session 快照 |

Preset 的 Prompt / Generation 引用继续保持 exact revision 语义；Regex 跟随其拥有者的当前 Preset metadata。这一选择保证编辑 Preset Regex 会立即作用于仍绑定该预设的 Route，而不会偷偷移动 Prompt 的 pinned revision。无预设的旧 exact Route 不启用 Preset Regex；主路由缺失时该层为空，主路由歧义返回明确错误。

只刷新同一游戏显式 Regex 编辑 ancestry 上的现有 Session，不把普通 Package 升级变为隐式 Session 升级。更新不会改变 World、Knowledge、Timeline、游戏进度或原 Package identity。Session 历史 revision 使用历史规则；新 Session 读取当前 Package。Session 导出保留当时的有效规则，可在只安装原始 Package 的目标环境恢复。

## 身份、重复导入及删除

- Regex ID 只在所属资源内唯一。同 ID 的 Global / Preset / Game 规则均独立执行，编辑器选择和运行诊断使用作用域及 owner identity，不跨层覆盖或暂停。
- 一个归属内含重复 ID 的资源导入或保存会被拒绝。单独导入规则沿用既有逻辑分配新 UUID；重复导入完整 Preset 保留内部规则 ID，但分配新的 Preset / Program / Module / Generation identities，因此互不影响。
- 不引入旧 ST 或前身产品字段 fallback。
- 编辑器记录打开时的 owner 和规则内容；作用域已切换或数据变化时拒绝把旧编辑结果写入新归属。
- 删除 Preset 要求 expectedRevision，清除其 Regex 与 `presetOwner` 绑定，将所有原所属 roots 归档；保留 immutable Prompt 历史供既有 pinned 消费者读取。不会复制或删除 Global 规则。
- 删除 Game 规则直接发布空/剩余 `processors.regex`。删除整个 Game 继续遵循现有 Package 对 Session 引用的保护；没有引用时 Package roots、versions 和 package state 一并移除，无账号 Regex 残留。

## UI 与实现边界

Regex 面板显示“全局 / 预设 / 游戏”三个明确区域及执行顺序。预设与游戏区域显示当前拥有者，未绑定预设或没有可写 Session 时禁用编辑。历史 Session 的 Game 规则只读。插件规则仍为独立只读区。账号规则组合标为 Global rule groups，避免与 Prompt Preset 混淆。

规则编辑、试运行、导入导出、排序、批量启停复用现有 Regex 功能。Prompt Preset 详情增加自己的 Regex 区域，可在不激活预设的情况下编辑其规则；仍不显示其他预设的资源。其整包导入导出和删除在预设列表完成。简体、繁体中文标签及窄屏布局已补齐。

`capability-host.js` 仅保留 Global 规则及账号组合，不保存 Preset/Game 规则。`regex-scopes.js` 是资源适配和临时投影；`registerNativeRegexScope` 仅连接读写归属，执行继续由既有引擎完成。现有 `registerManagedRegexProvider` 等第三方能力保留。没有恢复 Character / Character Card、旧 Prompt Manager、Tavern Helper DOM 或其他 legacy 功能。
