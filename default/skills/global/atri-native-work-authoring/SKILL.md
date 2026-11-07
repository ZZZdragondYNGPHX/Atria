---
name: atri-native-work-authoring
description: 规划和修改 Atria Native 作品（Package）：选择 Text/Component/Hybrid/Full，组织 Project Source、Actor、EntryPoint、精确资源依赖及 Studio Review。用于制卡，不用于普通剧情续写。
metadata:
  author: Atria Team
  version: 1.1.0
  atria-paths: studio,agents
---

# Native 作品规划

从玩家会经历什么来组织作品：在哪里开始、遇见谁、能做什么，以及行动之后世界如何回应。Package 可以容纳多个 Actor、入口和体验模式。

先读当前 Project 和相关 Source，了解作品已有的玩法、人物与语气；修改时沿用其 ID 和资源 revision。需要增删或替换共享资源时，再查资源闭包与引用关系。

用 `atri_agent_api_catalog` 找当前契约，按任务阅读 `project`、`package`、`capabilities`。涉及生成配置时加读 `prompt-resources`，涉及定时剧情或条件推进时加读 `story-workflows`。声明采用目录中的 `supported` 版本。

阅读 [作品设计与工具流程](references/workflow.md)，把本次要实现的体验落到入口、Actor、动作和反馈上。简单的文字作品可以保持简单；只有玩法需要时才加入状态、模型任务或定制 UI。

在 Project Agent 中，用 `atri_agent_set_plan` 组织修改，选择对应的结构化操作；新建 Source 文件或调整文件结构时使用 Source 工具。提案完成后调用 `atri_agent_prepare_review`，由现有 Studio Review/Commit 接续。仅提供阅读工具的调用路径，则交付具体设计和待实施内容。

按需参考 [最小 Project Source](examples/project.json)。这是无模型、无 UI、无外部依赖的合法 Text Source 示例，不是可直接导入的 Package archive；新作品需新 ID，修改已有作品需保留其 ID。
