# SillyTavern 遗留分发数据清理

- Task ID: `refactor/remove-legacy-bundled-data`
- Primary Workspace: 产品源码
- Status: Complete
- Date: 2026-10-25
- Start HEAD: `7f4e92849bafb3cd90a4e19adb685e62afaa2aa5`
- Implementation HEAD: `95d3f5ffc8105c5a8bc6dc6e1a723c85527cdfca`，已快进集成 main。

## 完成内容

- 删除 231 个旧资源文件、约 16.8 MB 原始内容：Eldoria、Seraphina 角色及表情、23 张背景、旧模型/上下文/指令/系统提示/推理/移动布局预设、五套主题、ComfyUI 示例、旧头像/羽毛笔/表情占位图、未使用旧 SVG 标志与音效。
- content index 从旧资源全集收敛为 7 个有效条目：Atria 初始设置、雾灯旅舍发行包、自定义 CSS 入口与四个服务器错误页。错误页重写为 Atria 系统资源；Native 游戏、Runtime Skills 和现有产品图标保留。
- 初始设置只保留账号入口、原生主题与 Atria capability 默认结构，不复制 Provider 参数、样例标签或旧角色绑定。参数加载复用各模块已有默认值；去掉 NovelAI 自动选择已删除预设的代码。
- 主题接口不再每次读取旧主题文件；内置主题仅保留 Folio、Nocturne、Serene Canvas。删除旧主题与搜索词，已有用户主题仍可保留、转换和导出；失效的内置主题选择使用既有默认主题解析。
- 新的轻量头像、笔记图标与提示音替代旧占位素材；默认背景直接为 CSS `none`，不再请求透明占位图片。相关前后端引用同步更新。

## 实际检查

- 对修改的 JavaScript 执行定向 ESLint；初次发现删除代码留下的一行空白，修正后该文件复查通过。提交差异空白检查通过。
- 7 个分发索引目标文件均存在；原生主题默认值、已移除主题的回退及用户自有主题保留的定向检查通过。
- 隔离临时数据目录完成首次启动：Atria 设置、系统资源与雾灯发行包成功安装；没有播种旧角色、世界书或预设。
- 真实浏览器加载空白账号，设置接口、主题列表与新头像返回 200，旧预设/世界书列表为空。首次发现默认背景残留请求 404；修改为空背景后重载，控制台零错误。
- 没有调用真实模型、运行全量测试或重新构建发行包。测试数据和工具不提交。

## 边界

- 清理当前 main 的旧分发数据，不重写产品历史；旧版本仍可能包含历史资源。
- 不删除现有用户数据，也不覆盖其它活跃工作树。第三方 Provider 图标、字体、tokenizer 等仍在使用的协议/界面依赖不是示例数据；服务器配置、Atria 游戏和 Runtime Skills 不因此删除。
- 执行与验证规则只引用 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)，本记录不构成额外验收清单。
