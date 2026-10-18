# Studio Authoring 与 Runtime Diagnostics

领域契约的语义由其权威模块定义，Studio 不建立另一套规则或状态 Authority。

## 作者能力

优先复用已经完成的 Studio / Native Frontend、资源修订、Source Draft 和现有组件。脚本编程可以补充复杂行为，基础条件、绑定、依赖、输入输出和授权保持可被平台识别。

创作、预览与正式运行使用对应资源和契约，并明确当前版本。不能让预览成功掩盖正式运行缺少固定绑定或授权。

## 运行解释

作者应能回答：

- 本次使用了哪些规则、资源和状态，读了什么？
- 为什么知识或模块被选中、舍弃，预算怎样分配？
- 模型实际收到什么，结构化产物来自哪次任务，允许怎样消费？
- 哪个处理或脚本改变了候选内容，在哪里失败？
- 哪个领域条件或平台边界导致拒绝，最后是否发生正式提交？

复用现有有效请求快照、PromptIR、Context 选择、脚本预算/错误和 Authority Receipt。扩展跨领域关联，避免为了诊断维护平行事实库。

## 权限与诊断范围

诊断沿用获准资源、读用途和可见结果边界。UI、脚本日志或调试视图不能通过额外读取默认扩大权限；私有领域信息与模型上下文的消费边界保持明确。

原始输出、差异、执行输入的保存范围与保留策略由技术设计确定。诊断至少能定位固定资源与处理阶段，不预设无限保存所有私有输入。

## 阶段落点

S1 为契约设计确定必要证据；S2 起每个 Runtime 增量提供对应诊断，S5 完成主要作者工作流；作者工具不等到所有底层完成才补入。

## 起读代码

`public/scripts/native/runtime-workspace.js` 的有效请求和 Diagnostics；相应原生资源/Source Draft 与预览入口；受限 Script VM 的错误定位和预算；各 Runtime 已有选择证据、结果身份和 Receipt。只沿当前阶段功能继续读取。

## CP1 已接入的证据

正式 record 保留 production 与消费的 base/application Revision。

ContextPlan 和有效请求快照的 nativeSelection 保存匹配 view 的 derivation 资源、产物引用、Knowledge 纳入/拒绝、pending lifecycle 与 targetKey；预览使用同一编译器和预算。证据不默认保存私有 reads / computed，也不建立新的诊断事实库。当前可经既有 Source / 有效请求诊断查看原生数据；

## CP2 作者与运行诊断接点

Runtime Design 新增 Package Runtime 契约编辑和保存修订的 Processing preview；新文案提供 English / zh-cn；

Runtime Diagnostics 的 Package Runtime evidence 复用当前精确 Session snapshot：Revision / PackageVersion、固定 Processor、Task invocation / production anchor / lifecycleCause、Workflow / outbox 的 cause 与 Scope epoch、Lifecycle Receipts、Action Receipts 和 Turn Processing provenance。没有新增诊断事实库或私有读取。

生成/预览 Processing failure 的 HTTP 错误携带安全 resourceId（Processor ID）和 field（stage），不输出脚本异常文本、执行输入或结果；客户端提供诊断入口。呈现失败明确显示原消息且继续提供控制项。S6 的新 Package 集成场景、main 集成和清理已完成；
