# 全产品操作链

页面范围见[实施输入](claude-code-frontend-prompt.md)。四份旧清单的 ID 仅用于定位相关能力。

## 玩家与资源

| 流程 | 操作顺序 | 完成后的去向 |
| --- | --- | --- |
| F01 登录 | 进入本机账户或按服务器配置登录 | 上次阅读／引导 |
| F02 安装作品 | Library → 选择 .atria → 查看作品与版本 → 安装 | Work 详情，可启动或查看资源 |
| F03 开始／继续 | Work → 版本／入口 → 创建 Session；或选已有 Session 继续 | Play；缺模型配置时跳 Runtime 并可返回 |
| F04 输入生成 | Persona／参数 → 输入 → Send → 生成／Stop → 正文结果 | 保留阅读与输入位置，显示实际用量 |
| F05 存读档 | History & Saves → 保存／导出；选择存档 → 载入；导入 .atriasave → 打开 | 对应 Session 和分支 |
| F06 历史分支 | 搜索／选择历史 → 预览 → 返回当前或切换分支 | 区分正在阅读的历史与当前故事 |
| F07 资源修订 | Library → World/Knowledge/Persona → 新修订 → 保存 | 详情、版本与 Used By；已有 exact 引用保持原版 |
| F08 采用资源 | Work/Session 设置或 Studio 引用 → 选修订 → Attach/Update/Fork/Detach | 原对象；显示本次采用的版本 |

## 作者与交付

| 流程 | 操作顺序 | 保存与结果 |
| --- | --- | --- |
| F09 人工编辑 | Studio → 20 个视图中的资源／Source → 编辑 → Changes → Apply | 原 Project 修订；本地未应用稿继续保留 |
| F10 Project Agent | Task → 规划／生成 → 查看提议与差异 → Apply/Commit 或继续修改 | 原 Task 与 Project 结果，可回对应 Source |
| F11 作品界面 | UI/Frontend → 字段／Source → 预览 → Changes/Apply | 作品表现预览与 Prompt 预览各有内容 |
| F12 作品交付 | 项目编辑 → 按需 Simulation／Preview → Build → 下载 | .atria 成品，再到 Library 安装 |
| F13 Runtime | Connection → Model → Generation/Program → Route → 选上下文预览 | 保存配置与实际生成分开反馈 |
| F22 独立作者 | Library → 空白／模板 → 共用编辑器 → 样例 Preview → 按需试读 → 保存／导出 | 不建游戏；试读响应与资源修订分别呈现 |
| F23 预设升级 | 旧上游／私人修改／新上游 → 三方差异 → 保存派生 → 选择消费者采用 | 各消费者显示原版与新选版本 |

Prompt 的正文／JSON、大纲、继承、三层 Diff 与分享语义归[D8](../../refactor/atria-native-prompt-preset-deepening/preset-studio-experience.md)。

## Agents 与扩展媒体

| 流程 | 操作顺序 | 结果 |
| --- | --- | --- |
| F14 Memory | Agents → Memory → 查询／来源／维护 → 原生来源定位 | 能跳到对应消息、资源或历史窗口 |
| F15 反馈候选 | 实际结果 → 主动反馈／评价 → 局部候选 → 差异 → 采用 | 无报告显示未评价；普通创作独立使用 |
| F16 Skills/扩展 | Extensions → 安装／导入 → 分类／编辑 → 选择作用范围 → 启用 | 原运行状态与调用结果 |
| F17 图像媒体 | 选文／素材 → 注释与 Prompt → 图像任务 → Gallery → Mask/编辑 | 原 Visual Job/Asset；独立作者图片另接非 Session 归属 |
| F18 共享会话 | Host 开启 → 成员／席位 → 参与输入 → Host 提交 → 刷新／重连 | 同一原 Session；角色与输入状态在原位置显示 |
| F19 账户备份 | Account → Snapshot/ZIP/LAN → 选择范围 → 执行 → 历史／恢复 | 相应备份与任务结果 |
| F20 存储 | Storage → 分类／对象 → 引用与范围 → 清理／恢复 → 进度／历史 | 列出成功、失败及剩余对象 |
| F21 V3 | Plan → 编辑 Graph/List/Inspector → 保存／发布 → 选择 Source Binding → 运行 | 原 Host Timeline/Graph、结果、费用、取消与继续 |

V3 接续现有页面及路由。Plan Fork/Derive、归档、删除补原服务，Node Program 独立选择同步后端。旧执行模式清退，保留有效 Memory、Goals、Experience 和视觉业务。

## 编辑与请求反馈

- 编辑的 draft、保存修订、Project Apply、Plan Publish、Binding 选择与运行分别呈现结果。普通 Library 保存不增加统一发布步骤。
- 加载和查询无匹配各有说明；失败定位到对象／字段，保留原稿与选择。保存成功后刷新失败只重读已保存对象。
- 重复点击沿原操作 busy 状态处理；切换对象后旧回包只归原对象，不能覆盖新稿。
- 冲突显示当前版本与草稿差异，可保留、复制或重新选择。相应消费者更新使用原版本语义。
- 取消、停止、撤销编辑、切换分支、载入存档与恢复数据按各自对象命名；已提交结果继续显示。

## 导航、键盘与手机

资源详情、Used By、Runtime 配置和错误定位保留返回上下文。Back/Escape 一次处理当前最上层并归还焦点；IME 输入不触发发送或全局快捷键。

全局 Dock 只切换主工作域，搜索/工具/账户在顶栏。Agent 长任务可从灵动岛摘要展开，再回到原 Task/Run/Review/错误位置；收起摘要或切页不自动取消任务。Play 的作品状态与 Composer 生成/Stop 保持独立；历史/上下文等入口按需打开默认关闭的 Inspector。Studio/Agents 面板收起或专注模式不丢编辑上下文，详细表现归[设计指导 §3.4–§3.6](design-proposal/atria-frontend-guidelines.md#34-磁吸导航-dock)。

文本原生 Undo、Prompt 草稿历史、PlanDraft 历史和 Mask 编辑使用各自模型。触屏有列表／表单及上下移动替代；完整长文可选择、滚动和编辑，Stop 与输入在软键盘上方可达。具体平台要求见[跨端操作](cross-platform.md)。
