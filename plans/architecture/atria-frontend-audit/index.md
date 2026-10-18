# Atria 全产品前端：功能与实现输入

当前实施范围归[提示词／前端方案](../../refactor/atria-native-prompt-preset-deepening/index.md)，页面与接线归[实施输入](claude-code-frontend-prompt.md)，代码结论归[源码剖析](../../refactor/atria-native-prompt-preset-deepening/baseline.md)。实际结果记[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

## 当前读取路线

| 材料 | 用途 |
| --- | --- |
| [实施输入](claude-code-frontend-prompt.md) | 全产品页面、现有 API、新作者功能与视觉输入关系 |
| [操作链](interaction-flows.md) | 日常任务、保存、采用与返回 |
| [组件归属](component-and-architecture-findings.md) | 当前 Shell、编辑器与原服务复用 |
| [跨端操作](cross-platform.md) | 桌面／手机的完整操作方式 |
| [HTML](design-proposal/atria-visual-direction.html)／[功能表现](design-proposal/atria-function-presentation.md)／[设计指导](design-proposal/atria-frontend-guidelines.md) | 外部视觉与交互参考，采用范围见实施输入 |

## 旧功能定位资料

以下四份清单基于 2026-10-15 的源码盘点，用 ID 与路径定位 189 组旧功能。界面改造保留有效能力；旧状态、行号和执行性要求不沿用，新增作者功能与 V3 按当前实施输入完成。

- [Shell/Library/Play](surface-inventory.md)
- [Studio/Prompt/Runtime](authoring-runtime-inventory.md)
- [Agents/扩展/媒体](agents-extensions-media-inventory.md)
- [设置/账户/存储](settings-storage-diagnostics-inventory.md)

[固定源码索引](source-map.md)与[旧附件](coverage-and-evidence.md)保留原盘点出处，当前代码链见新源码剖析。旧 ST/Workspace 等执行模式由原生替代；Memory、Goals、Experience、Skills 和 Visual Director 等有效业务继续保留。
