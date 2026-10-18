# Atria 全产品前端：功能清单与实现输入

本目录提供既有功能、操作链、组件归属、跨端要求与外部设计参考。当前要做的功能和后端依赖归[提示词／前端企划](../../refactor/atria-native-prompt-preset-deepening/index.md)，直接实施范围见[统一前端交接](claude-code-frontend-prompt.md)。实际进展归[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)。

## 范围与读取

覆盖 Library、Play、Studio、Agents/Memory/Goals/Experience/Eval、World/Knowledge、Prompt、Runtime、扩展、媒体／语音、账户、存储、共享会话与诊断。189 个旧功能组是保留清单，另加已确认的独立作者／模板／发行升级和 V3 Plan/Run，不只实现 HTML 画出的部分。

| 材料 | 实现用途 |
| --- | --- |
| [页面与 Library/Play](surface-inventory.md) | 导航、作品、会话、World/Knowledge、Persona、历史与存档 |
| [Studio/Prompt/Runtime](authoring-runtime-inventory.md) | 全部项目资源视图、Source/作品界面/Assets/交付、Project Agent、预设与模型配置 |
| [Agents/扩展/媒体](agents-extensions-media-inventory.md) | 原生 Memory/Goals/反馈、编排替代、Skills/Plugins、图像与语音 |
| [设置/账户/存储](settings-storage-diagnostics-inventory.md) | 偏好、身份、备份、资源清理、恢复与诊断 |
| [完整操作链](interaction-flows.md) | 跨页面动作与返回、保存／取消／冲突／未知结果的具体表现 |
| [组件归属](component-and-architecture-findings.md) | 共用组件与有效能力迁离旧容器 |
| [跨端操作](cross-platform.md) | 桌面与 Termux 手机完整操作及平台差异 |
| [统一前端交接](claude-code-frontend-prompt.md) | 当前功能实施与后端接线 |
| [HTML](design-proposal/atria-visual-direction.html)／[功能表现](design-proposal/atria-function-presentation.md)／[设计指导](design-proposal/atria-frontend-guidelines.md) | 视觉／交互参考；新增提案只按实际批准范围使用 |
| [源码位置](source-map.md)／[盘点附件](coverage-and-evidence.md) | 需要定位旧实现时查阅，不是待执行的审计／测试队列 |

## 使用旧清单

清单基于 2026-10-15 的 main `695acf3bc`、V3 `31bef9572` 静态盘点；后续能力按当前原服务实现，不以旧“BLOCKED/未接通”限制新功能，也不把旧“接通”当当前运行结论。不要为了更新清单重跑全仓扫描或测试。

- **保留**保留用户能力与原领域 owner，不要求复制旧布局。
- **整合／重组**调整入口和组件，保持不同保存／执行语义。
- **旧／待清退**随原生替代一起移除旧 ST/Workspace/Director 等合同；Memory/Goals/Experience/Visual Director 等有效功能继续实现。
- **部分／未知**只说明具体依赖缺项；明确缺失操作，其他功能继续完成。

产品内的预览、源格式反馈、连接检测、Simulation、Build、Review/发布和可选 Eval 各是原业务操作；保留它们的界面不表示本次运行这些操作，亦不新增工程验证项目。不要因旧段落标题含“测试”而整段删除 Source 编辑、Assets、构建下载等有效功能。
