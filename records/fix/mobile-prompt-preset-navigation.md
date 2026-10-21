# 手机端提示词预设无法进入详情

- Task ID: `mobile-prompt-preset-navigation`
- Date: 2026-10-20
- Primary Workspace: 产品源码；实施分支 `fix/mobile-prompt-preset-navigation`
- Start HEAD: `c83f18bb`
- Implementation HEAD: `469e4bb6`
- Integrated main HEAD: `f9a8a838`（保留同期 MCP 任务已集成内容）
- 状态：实现、验证、本地集成完成。

## 原因与修复

1. compact CSS 只识别资源 heading / revision editor；实际预设详情 `.atri-prompt-preset` 已渲染但保持隐藏。将现有详情识别选择器扩展到预设，无新增导航状态。
2. 触摸产生的 hover 在合成 click 前显示导出/删除按钮并挤动标题。浏览器事件证据为 touchstart / touchend 落在标题，随后 mousedown / click 落到 Export preset。触屏操作按钮现在始终显示并保留 44px 高度，允许换行；鼠标仍按 hover 显示。
3. 复用预设详情容器及返回操作，使加载、加载失败、已保存但刷新失败的反馈在手机端可见；沿用序列令牌，返回后的旧成功/失败结果不重新影响当前界面。
4. 保留 Open preset 原生按钮的键盘入口，focus 后显示按钮。

## 实际验证

- 完整本地应用使用独立测试数据启动；webpack 编译成功。
- 修复前 390×844 浏览器：详情节点存在，详情不可见，列表仍可见，复现隐藏错误。
- 修复后 320×740 / 390×844：列表 → 详情 → 程序 / 模块 / Regex → 返回，全部通过。
- Chromium 触摸模拟（`hasTouch` / `isMobile`）：320px、390px 点击标题进入详情；390px 返回再打开未产生误导出；同时验证 reduced-motion。仅属浏览器模拟，无实体手机证据。
- 320px 列表行宽 288px，左右边界 16px / 304px，无行内横向溢出；检查手机列表、详情及桌面截图。
- 1440×1000 桌面仍显示列表与详情双栏；键盘 focus + Enter 可打开预设。
- 控制请求延迟 / HTTP 503：加载及错误可见，能返回再打开；返回后的延迟成功响应不覆盖列表。
- 实际保存 stage 修改，模拟保存后的刷新失败：已保存提示、错误、重试按钮可见；恢复请求并重试后读取到已持久化的 stage 值。
- `node --check public/scripts/native/prompt-presets.js`、定向 ESLint、CSS Tree 解析、`git diff --check` 通过。
- 使用现有 `auditProductSource` 定向检查修改的预设文件：0 findings。
- 全局 `check-native-product-localization.mjs` 未通过：18 项现存缺失翻译；原有 main 执行结果完全相同，涉及其它文件，本次未引入新增项。
- microinteractions 清单在本次单步打开/返回范围内定性评分 10/10（8 项通过；无需长期提示演化）。原失败点为触发后布局不稳定、结果不可见、反馈不可见，分别由稳定触屏控件、详情识别和共同反馈容器修复。此评分不代表实测响应时间或实体设备性能。

测试数据、截图和浏览器实验仅本地保存，不进入产品提交。未修改其它任务文档或未提交内容。
