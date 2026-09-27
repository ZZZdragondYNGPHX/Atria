# UI 权威与交互边界

读取 catalog `ui-document` / `ui-actions` 的完整相关定义，尤其 OPS、节点字段、statePath、单权威动作校验。支持的名字不代表可随意添加参数。附件 examples/ui.json 是独立 UI Document，不是整个 Project。

- localState 用于 mount/session 局部 UI；preferences 用于 player/device 偏好。字段显式声明类型、default 与允许的 scope。游戏资源、关系、任务结果不写到 ui/prefs 代替权威状态。
- selectors/表达式使用受限语言和允许根；不注入 JS、HTML、任意 CSS 或外部可变代码。文字和模型正文不变成可执行节点。
- command.dispatch 引用已声明 Command；composer 操作走现有 Host Composer；activity、continuity、realm、shared 动作按各自 typed contract。simulate 不是提交结果。
- 顺序 action 的失败处理、receipt 与补偿遵循现有实现。不要在网络超时后生成新 invocationId 重复扣款，也不要用补偿直接回写任意字段。
- Opening 是受控阶段/向导，设计前进、返回、必填错误和一次提交。消息投影区分事实、叙述、诊断；不要用隐藏文本把未暴露信息送进模型。
- 作者 Preview 中 Native conversation/composer 槽是隔离占位；Scene 需要有效 scoped Session。不得将私人 Play DOM 挪入 Preview 或 Shared。
- 静态 v1 可经既有迁移提案转 v2；动态绑定、动作、响应式或 appearance 不能假定无损迁移。保留原文档，给出需要作者判断的具体位置。

示例接入：在现有 Project 的 `package.runtime.experience` 设置 mode: component、componentModelVersion: 2、component: ui.json；合并而非抹除其他 runtime 声明。示例只用 local-ui-state 与 action 的局部操作。先读取 capabilities 的实际版本，再补齐声明。Full/Hybrid 需要按其 surface 规则重新设计，不能机械复制 chat.footer。
