# Shared state and operation contracts

## Responsibility

本模块负责 UI 生命周期，复用现有对象与操作 authority。拟新增草稿往返、来源级重试或恢复能力时先核对现有控制器；缺失能力作为工作包实现，不能仅靠样例状态变量宣称完成。

## State matrix

| 状态 | 呈现与可操作项 | authority / 接线要求 | 验收观察 |
| --- | --- | --- | --- |
| loading | 保留标题、范围和导航；说明加载对象 | 订阅当前 scope，dispose 后不更新页面 | 延迟响应不会污染新对象 |
| empty | 区分未创建、无搜索结果、上下文不适用 | 从真实结果和 capabilities 判断 | CTA 去准确的创建/返回位置 |
| partial failure | 好结果保留；失败来源说明/重试 | 来源级结果、错误和完成状态 | 单来源失败不清空集合 |
| read-only / disabled | 原因与范围可辨认 | 历史、生成、权限、缺依赖各自判断 | 程序操作同样拒绝越权 |
| dirty draft | 明确未保存；离开时保留/丢弃/取消 | 对象 ID + owner + 基准 revision 隔离 | A 对象草稿不落到 B |
| reviewing | 展示对象、确切基准、差异、影响和取消 | 复用原 Review/ChangeSet/preflight | 取消不写入，不丢草稿 |
| submitting | 阻止重复提交，保留操作上下文 | 服务侧 receipt/idempotency 或既有操作保证 | 双击不会产生两个实体/提交 |
| committed | 呈现已保存修订/结果 | 服务返回真实成功，不依赖列表刷新 | 刷新失败不重放成功写入 |
| save failed | 就近错误；草稿/选择保留，可重试 | 区分验证、权限、网络、存储原因 | 重试仍基于同一确切对象 |
| conflict / stale | 展示最新变化；重新载入/重新审阅 | CAS/base revision/preflight 二次检查 | 不静默覆盖，不自动 latest |
| cancelling | 说明正在停止对应任务 | 区分文本、Prompt、图片、共享等任务 ID | 旧 cancel 不停止后来任务 |
| archived / missing ref | 保留出处，明确修复 | 实际引用闭包、确切版本和快照 | 可读历史不因来源归档丢失 |
| deleted / scope lost | 保留安全草稿，给返回/重新获取 | 重验 owner、对象与页面当前 scope | 失效结果不能继续写入 |

## Draft and revision discipline

草稿绑定拥有者、实体类型/ID、基准修订和编辑表面。离开列表、跨域定位、关闭面板都使用同一离开判定；AI 长任务与人类编辑草稿分别持有。重开页面不能悄悄套入另一对象的草稿。

保存失败保留草稿；保存成功但刷新失败显示真实成功，并单独重试读取。冲突可导出/保留草稿，再加载最新重新比较。首轮可以复用现有 editor draft 生命周期，但须证明它覆盖新的导航出口；不为了统一 UI 引入第二套资源写入路径。

A1 的外壳离开检查接到现有 navigation authority，覆盖跨域、子路由和 browser Back：原生确认框取消时保留当前控制器/表面/字段，确认时丢弃并导航。World/Knowledge 的实际模型草稿与 Studio 的待审阅状态提供 dirty 标记，普通字段仅观察值差异；Library/Runtime 写入成功回执清除观察，不依赖后续列表刷新。这不是新增跨路由草稿持久化。控制器内部换页与更细的冲突/恢复操作仍由 A2/A3 原路径负责。

A2 在 Library revision / Prompt editor 与 preset 内部 Back 复用相同 dirty 判定；取消保留原字段和 Source，保存失败保留草稿。revision 与 preset 已保存后的读取失败显示真实回执并仅重试读取。安装/导入的结果页保留 write receipt，打开失败不能再提交；文件/候选 response 只更新原流程。Native 未被接受的输入在失败时恢复到原 Session/基准 revision；已提交输入和新 Session 不接收旧草稿。Stop 在实际生成期间保持可用，防重复提交不覆盖它。历史面板按 facade 实时 capability 禁用动作并在 handler 重验；切换 Session 关闭旧 drawer。

A3 将相同离开判定接入 Studio 内部视图/集合/引用定位、Source reload、Runtime Back/复制/compact 独立编辑层、Agents preset/Task、扩展切换与插图关闭配置。观察器只观察原草稿，不持久化；重绘后移除旧字段观察，模型标记保留未选文件的真实草稿。资源编辑器/Fields/Source/引用页签共用原编辑表面。

Studio/Runtime/检索/扩展成功写入后清除 dirty、保留只读回执并单独重试读取；Agent Commit 在 Task 成功后同步项目，列表失败不能再次 Commit。项目辅助来源失败不阻止已有项目编辑，重试不重建当前草稿。Preview/Simulation/Build 的迟到响应按编辑表面与基准 revision 重验。

Runtime 缺项修复暂存原控制器与 DOM，返回同一启动回调并重验绑定；原标题/选择、PackageVersionId 保留，即使修复期间安装新版也不替换旧版本。它是临时 UI 返回状态，不是新的启动/资源 authority。Agents 固定当前 Session；Session/branch/revision 变化仍由原 lifecycle 清理运行状态与重挂控制器。Memory reset 在确认后、停止任务后及删除前重验目标，迟到确认拒绝写入新 Session。

## Review authority

- Library/Runtime 管理走各自原生编辑与 revision 操作。
- Studio 人工使用原 Inspect/Review/Apply ChangeSet 路径。
- Project Agent 提案保持独立 Review/Commit/Takeover 与 task/base revision；不能套用人工 Apply 按钮绕过 agent authority。
- Prompt choices 是玩家 Runtime Route 的运行时参数覆盖，不能创建作者资源新修订。
- 安装/导入按预检时确切来源、权限和依赖确认；发生变化需重新预检。

这些入口可以共用对话框骨架，但确认处理器不能合并成无类型的“保存所有东西”。

## Scope and destructive operations

审阅展示目标与影响对象，给明确取消；删除作品/会话/资源、重置当前会话记忆、清理当前诊断来源各自有不同范围。成功跳转必须使用结果真实 identity。没有权限的动作不因隐藏按钮而获得权限。

确切资源引用以 owner/scope/id/revision（或当前类型原生等价字段）解析；缺失、不可访问、版本不符分别解释。Fork 创建独立资源，Attach 固定引用，Update 显式选新修订，Detach 审阅引用闭包；不能依名称或“最新”猜测。

## Keyboard and async lifecycle

复用 Environment 和现有焦点/弹层 ownership。Esc 优先退出最上层瞬态表面，Back 按导航栈；返回焦点到触发入口。切换对象后，旧响应只能更新其缓存或被忽略，不能更新新页面选择。

IME composing 不触发发送。输入策略的统一范围见 [P01](decisions.md)。忙碌状态结束时恢复本次禁用控件，并再次判断当前 capability；不把旧按钮状态覆盖到新会话。辅助反馈需可被读屏感知，错误与焦点不只用颜色表达。
