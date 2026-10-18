# D2：作者表达与模型适配

J2 + F2 + R3：作者在原 Program/Module 中完整表达创作或任务要求，经原 Compiler 与 Provider Adapter 形成请求。

## 作者能控制什么

- 完整编写指令、正反例、语言、人物表达、叙述视角、节奏与描写密度；可从空白或模板开始。
- 通过 Stage/Module/Anchor 组合内容，查看继承后的有效正文；`literal` 保留原文，`template` 使用原变量插值。
- 文学风格、角色台词与 Agent 的任务／材料／输出要求分别组织；合法成年虚构表达不附加泛化说教或统一降调。
- 使用原 Runtime 配置选择模型、采样、输出长度、prefill、reasoning 和缓存选项；按 Adapter 实际支持的参数呈现。

## 一份作者资源，多种模型请求

作者指令只写一份。Adapter 负责协议格式与参数映射，Effective/Wire 展示结果。模型定向内容可以由作者显式编写模块或版本差异；不在发送前另调模型改写作者稿。

模板提供通用骨架、RP/Narrative、Creative Writing 与 Agent Task；复用原 Library 修订。模板更新只影响以后新建的资源。

## 同一份草稿

结构化字段、完整资源 JSON 与 Module 正文是同一 Draft 的视图。字段修改仅触及相应字段；正文保持换行和内容。无法解析的 JSON 保留原文缓冲及错误位置，修正后继续同步。未被现有 schema 支持的字段不能只在前端留下后声称已保存；正式支持时同步原 schema、编译和导出。

## 预览与响应

作者按需查看 Authored、Effective、Provider Wire 及差异。预览只编译；用户点击试读才发送。Provider 协议拒绝、网络／参数错误、模型自然语言回避与文风不符分别显示；自然语言“抱歉”不自动归为协议拒绝。

用户可以自行选择 Route；内容拒绝不静默跨供应商重发。可选反馈与候选功能见[质量模块](quality-evolution.md)。
