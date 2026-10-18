# D8：预设作者与全产品界面

W2 + R2 + P2 + I2 + M2：Library、Studio、Play 使用同一资源和编辑组件，沿现有 Shell 导航。

## 入口与日常操作

| 入口 | 使用方式 |
| --- | --- |
| Library 预设 | 从空白或模板创建；管理 Program/Module/Generation、分类与修订；样例预览、试读、分享和升级 |
| Library 专业资源 | 独立 Module/Program/Generation 的列表、详情、exact 深链、Used By 与版本；和预设共用编辑器 |
| Studio | 直接选择现成预设的固定版本；按需 Fork/Derive、编辑与采用，不要求每位游戏作者自写 Prompt |
| Play | 使用作品提供的预设选择与参数覆盖；查看当前有效值和相应正文，修改范围在控件旁说明 |
| Agents | 接续已有 V3 Plan/Graph/List/Inspector、Binding 与 Run 页面，节点中可选择 Program 并跳到原资源 |
| Library 视觉资源 | 编辑 Target/Rendering/风格模板；图像试生成和图片管理接原视觉 Job/Asset |

保留当前资源入口的深链；详情显示名称、来源、修订、原件／副本与继承关系。预设分类用于组织资源，不参与执行顺序。

## 同一草稿的编辑

结构化字段、完整资源 JSON 和 Module 正文共用一份 Draft。区分这些视图，不能把 JSON textarea 当作完成了专业正文编辑。

- Module 正文保留完整文本、换行、选区和滚动；`literal/template` 切换有明确含义。
- JSON 暂时不合法时保留缓冲、给出位置，修正后同步字段；切换视图不清空文本。
- 有效 schema 字段无损回写；新增字段由 schema、Compiler、保存和导出同时支持。服务拒绝的字段不能显示保存成功。
- Program 大纲展示 Stage 与同 target 的 Module/Anchor 显式顺序，支持拖拽、上下移动与键盘操作；继承、替换、禁用、配置和新增可辨。
- Contribution 是当次预览的材料展开；作者编辑消费位置与声明，实际纳入内容由 Context 生成。
- 共用 Undo/Redo、dirty 状态、错误定位与版本 Diff；输入和高频切换即时响应。

当前 `mountPromptEditor()` 只有局部变量 Draft 与 Simple/Advanced 切换；可在该组件内补编辑状态与历史，不从 PlanDraft 派生一个通用文档框架。已有 Source/CodeMirror 能力按适用内容复用。

## 三层预览与独立试读

| 视图 | 内容 |
| --- | --- |
| Authored | 两侧资源／Draft、原文、参数与显式编排 |
| Effective | 当次 Compiler 结果、继承展开、条件、位置与选入材料 |
| Provider Wire | Adapter 的消息、工具、输出结构、参数与 Token 计数方法 |

默认显示正文与当前版本，用户按需打开预览、Diff、来源和详情。两侧可选不同修订；共享编译环境的规则归[D5](semantic-ir-lowering.md)。

Library 作者可编辑样例输入、历史、角色／场景材料与参数，不创建假 Session/Project。沿原 Host 扩展样例 Context，支持尚未保存的新资源及新增依赖；现有 exact-base draft overlay 仅覆盖已存在资源，不足以代表这项功能。

预览标明 `sent:false`。用户点击试读后，选定 Route 与预算，经同一 Host/Compiler/Provider/Compute 发送并显示响应与用量。输出留在作者工作区，不自动改写作品或预设。模型试读、资源保存和消费者采用分别反馈。

## 模板、分享与升级

新建可选空白、通用骨架、RP/Narrative、Creative Writing、Agent Task。模板创建普通可编辑资源，保留模板出处；不自动开启额外 Agent 或付费试读。

分享沿原 preset/resource bundle 导出可编辑依赖；游戏 `.atria` 仍走 Build 冻结闭包。导出包含完整 exact 依赖，允许同一资源的不同修订；本地映射分别维护逻辑资源身份与修订身份，引用不能仅按 ID 重写。导入、Fork、Derive、Package freeze 和 Anchor/derive 目标同步映射。

升级比较旧上游、当前私人修改、新上游；作者逐项选择后保存新修订，再选择受影响的 Route/Plan/Project/Package/Session 消费者。每类消费者沿本领域的更新方式采用；运行中的对象保留原版本。普通资源保存不增加统一发布仪式，Project 的 Apply、Plan 的 Publish 与 Binding 各沿已有操作。

## 视觉与跨端

沿现有 `--atri-*` tokens、Shell、纸张、Dock、Sheet 与当前已确认设计。外部 HTML/指导提供参考；不同稿件的默认主题、token 命名与布局数值先映射到现有组件，不自动切换整套设计。对应范围见[前端输入](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)。

桌面可分栏，手机使用 List/Detail、Tab、Sheet 与完整正文编辑。图操作有列表／表单替代；触控、键盘、IME、Back/Escape、焦点、软键盘和 reduced-motion 沿共用组件处理。

独立视觉作者接原 ImagePromptIR 与非 Session Job/Asset；这项接线归视觉领域，文本作者功能可独立完成。
