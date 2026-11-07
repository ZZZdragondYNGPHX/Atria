---
name: atri-native-world-authoring
description: 设计 Atria Native 的世界信息、人物认知与叙述视角，以及 Add-on、跨作品 Player Continuity、Shared 席位和 Realm。
metadata:
  author: Atria Team
  version: 1.1.0
  atria-paths: studio,agents
---

# Native 世界、人物与持续内容

先想清楚作品里发生了什么、人物如何理解、玩家从哪里得知，再把它们接到现有数据和视图。人物可以误解、隐瞒、改主意；这些差异应成为故事的一部分。

- 世界信息与人物视角：读 catalog `information`，选择事实、信念、记忆、欲望、意图、情绪、关系和他人心智等语义，以及各自的 context/display 视图。
- 人物自主活动与剧情：结合 `tasks`、`lifecycle`、`story-workflows`；个人 projection 承载人物所知，规则决定行动结果。
- 扩展内容：读 `content`，把 Add-on 的贡献接到精确 Base 版本。
- 跨作品积累：读 `continuity`，使用独立 Player 数据与转移流程。
- 多人或共享世界：读 `shared`，按需结合 `information`、`lifecycle`，声明固定席位、可见视图与 Realm。

具体设计见 [世界信息与持续性](references/boundaries.md)。通过 `atri_agent_api_catalog` / `atri_agent_api_read` 获取当前定义，只读本次涉及的部分；新增玩法尽量复用作品已有的角色、领域和关系。
