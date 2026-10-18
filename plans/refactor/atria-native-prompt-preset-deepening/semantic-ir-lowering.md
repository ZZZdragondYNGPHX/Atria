# D5：显式编排、Context 装配与 Provider 请求

S2 + L2 + D2 + K2 + T2 沿原 PromptCompiler、SemanticBlocks、ContextPlan 与 Adapter 实现。

## 单一顺序

- Program 的 Stage 数组决定展开顺序；同一 Stage、同一 target 内 ModuleRef 与 Anchor 共用有序条目。
- 移除 `priority`、`expressionRank` 与 Module ID 的隐式重排。`expression.layer` 保留为表达对象信息。
- 不同 target 继续具有 foundation、history 前后、input 前后、post-history、prefill 等位置含义。Stage 顺序是展开顺序，不承诺某个晚 Stage 的 foundation 会出现在前 Stage 的 history 之后。
- 同 target 内容按 Stage 展开顺序及条目顺序汇入该位置；跨 target 调整是修改条目 target，应明确显示新位置。最终消息位置由同一 SemanticBlocks 投影和 Adapter 产生。
- 原 `responseDirective`、固定 Host 说明、Persona 与自动 Context 也进入同一有效顺序说明，不能在作者大纲外再次偷偷追加重复正文。

Module/Anchor 的顺序、继承身份和 exact refs 一起保存在原 Program schema。编辑器、Compiler、预览、分享与 Package freeze 读取相同定义。

## Anchor 与 Contribution

Anchor 是 Program/Stage 内的 Context 接入位置，声明接收类别与必需性；沿既有 Context lanes 和 Persona consumer 使用。样例模板给出少量常用位置，不增加独立 Anchor 资源。

Context 已选择的条目派生请求级 Contribution，保留原 item/source refs、修订、片段、用途、认识状态及已有顺序。编译中：

1. 按显式消费声明匹配 Anchor；沿 Context 原有选择顺序装配，不增加另一套权重。
2. 同来源、片段、版本、用途在同一消费位置重复出现时只纳入一次；相同正文但不同来源仍保留区别。需要在两处有意复用时由消费声明表达。
3. 一个条目由 Anchor 消费后不再走旧自动追加路径；History、Input、Persona 同理。未显式定制的常规接入使用模板中可见的位置。
4. 可选材料未选中时显示未纳入原因；缺少必需材料时指出具体 Anchor 和来源，由作者修改消费声明或 Context 配置。

变量插值继续处理正文内替换，动态 Contribution 不反写静态 Program。继承与位置操作详见[D4](agent-behavior-binding.md)。

## SemanticBlocks 与 Provider

Prompt 分支已有 `semantic-blocks.js`，区分作者指令、Host 说明、材料、对话、工具结果、输入和 prefill。继续在原模块扩展，移除“尚无 Typed IR”的旧判断。

所有 Adapter 使用同一有效语义投影。保留已有 target 的含义；Provider 不支持某种中间指令、prefill 或输出格式时，显示具体不支持项，由作者选择配置。模板优先采用现有 Adapter 能表达的结构；不靠另调模型改稿或自动挪动内容来填平差异。

现有 IR 的多数组与 `semanticBlocks` 是派生关系。编排改造需明确唯一构造入口，避免一份正文分别维护两套顺序。render、Token 计数与实际发送消费同一次 lowering 结果。

## 编译解释与版本差异

按需展开 Stage/Module/Anchor 的位置、条件结果、Contribution 来源、未纳入原因及 Adapter 结果。普通编辑保持正文和少量状态，完整 Wire 与来源列表由用户打开。

base/candidate 各有自己的 exact refs 或 Draft；它们可以不同。共享同一次捕获的样例／Context、Route、模型配置与编译器环境，分别编译一次。环境变化单列，避免混入作者正文差异；不通过第三次完整基线编译或对整条链反复比较哈希来实现 Diff。

现有 `previewPromptDraft()` 把 Program ref 放进相等身份，且只接一份 request，需扩展为两侧选择加共享环境；不能仅移除比较便把两个时点的 Context 当成相同。

## Token 与缓存

原 Context lanes 选择材料，Adapter 按最终请求计数，并保留输出预留；显示计数方法与实际 usage。独立试读继续用原 Compute 记录费用。

缓存仅使用作者编排和合法 Adapter 结果自然形成的前缀；不为缓存重排条目、不增加第二缓存服务。支持的 cache 参数沿原 Generation/Connection 呈现，实际命中读取 Provider usage。
