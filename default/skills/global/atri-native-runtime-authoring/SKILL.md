---
name: atri-native-runtime-authoring
description: 编写 Atria Native 的回合、Model Task、剧情 Workflow、世界推进、Activity 和 Scene，让规则、模型生成与故事呈现各司其职。
metadata:
  author: Atria Team
  version: 1.1.0
  atria-paths: studio,agents
---

# Native 运行时与剧情编排

从玩家想经历的事情开始：什么由玩家发起，什么由世界规则决定，哪里需要模型，哪些内容只是呈现。沿用作品已有的 Domain、Command、Task 和时钟，把新的情节接进去。

- 回合与模型任务：读 catalog `messages`、`tasks`；编写 Prompt 或 Generation Profile 时补读 `prompt-resources`。
- 事件、等待、分支与人物介入：读 `lifecycle`、`story-workflows`；涉及人物知道什么时再读 `information`。
- 世界持续推进、开局与生涯：从 `capabilities` 中确认 `simulationRuntime`、`storyStart`、`runPolicy` 等声明与依赖，沿用作品已有的权威事务。
- Activity、场景和媒体：读 `presentation`。

具体选择见 [运行时设计](references/runtime.md)。catalog 通过 `atri_agent_api_catalog` 查找、`atri_agent_api_read` 读取；长页按 `nextOffset` 续读到所需定义。字段以当前契约为准。

Source 描述作品需要什么；连接、模型配置、凭据和执行调度交给 Host。故事的语言可以灵活，已经发生的支付、移动或结算则以实际提交结果为依据。
