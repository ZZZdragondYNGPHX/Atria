# Package frontend 与 Native AUI

Package / .aui 任务读取此文件，再以目标游戏的 README、frontend/DESIGN.md 和当前 Runtime 契约确定实际实现。

## 渲染与源码

- Package frontend 沿用 Native AUI renderer 与既有呈现控制器；.aui 是受当前 compiler / renderer 契约约束的源文件。
- 核对合法节点、绑定、事件、NodeRefs、作用域和资源预算，不按普通 HTML 或任意 DOM 脚本编写 .aui。
- 修改源资产并使用已有编译入口，不绕过 renderer 或直接修改生成物来假造源码已生效。
- 导航、focus、重复节点和事件冒泡以目标 renderer 支持范围为准；通用 DOM 建议须先验证能否落地。

## Bridge、Host services 与 authority

- 通过现有 bridge、类型化 action / transaction bindings 和获准的 Host services 交互。
- 复用 Host Composer、Retry、Save/Restore 与已有状态服务；不创建平行持久化、RNG、gameplay evaluator 或 frontend scheduler。
- UI 只能读取已声明的安全 projections / 公共 views；隐藏 Canon 与私有游戏状态不能因界面需求直接暴露。
- Native authority 决定操作合法性；UI 筛选、禁用按钮或模型建议不能替代权限与状态验证。
- UI 草稿、选择和 review 是呈现状态，不是已提交的游戏状态；**UI 不允许创建新的 authority**。
- mount / reload / recovery 不自动提交写操作；字段、导航、revision / epoch 变化时按契约使旧 review 失效。
- 新操作使用当前 bridge handle；unknown commit 按现有协议保留原 input / revision / key，阻止冲突写并等待 reconciliation，不把 reload 当 replay。
- 若现有 Host 契约不能支持需求，报告缺口并单独路由产品变更，不在 Package UI 偷建替代 API 或权威状态。

## 设计与验证

- 使用目标游戏当前 DESIGN / Plan；历史页面结构、旧版本预算和其他游戏风格不是默认约束。
- 从该游戏 README 选择内容、frontend model、编译或 Native frontend 验证入口，核对 Core 版本和浏览器依赖。
- 在实际 Package 安装 / Ready / renderer 链路验证；独立 HTML mock 只证明 mock 的行为。
- 用 playwright-cli 检查交互、键盘、focus 和视口；console / network / Runtime 故障需要时用 DevTools MCP 定位。
- 全局 Playwright CLI 不自动替代项目的 Core Playwright / browser bundle。
- authority、隐藏信息边界、幂等性和 Save/Restore 需要对应 Runtime / 集成检查，不能由截图推断。
- UI 验证不代表完成内容 soak、真实 hosted-model、真机或 screen-reader 验收；交付明确实际证据与局限。
