---
name: atri-native-world-authoring
description: 设计 Atria Native 信息暴露与角色视角、精确 Add-on、Player Continuity、Shared 固定席位和 Realm；防止跨权限泄露及跨账本错误回滚。
metadata:
  author: Atria Team
  version: 1.0.0
  atria-paths: studio,agents
---

# Native 信息、内容与独立账本

先找数据的权威归属，再设计读取权限和交互；不要从“已存储”推断“可让模型读取”。

- 信息/视角：catalog `information`；识别 Truth、Belief、narrative、Actor availability、context/display exposure 与 Rollup provenance。
- 扩展内容/跨作品持续性：catalog `content`、`continuity`；保留精确 Base/Add-on/Community 证明与独立 Player 图。
- 多人/共享世界：catalog `shared`，按需结合 `lifecycle` 和 `information`；只有授权的固定 seat、scope、projection 和 Host 提交。
- 在修改前读 [边界与回归矩阵](references/boundaries.md)，把本次跨越的权威、授权和 Saga 阶段写入提案。只调用当前实际暴露的 typed API。

通过 Studio Review 交付声明和测试。拒绝以 raw state patch、任意 ledger rewrite、私有 DOM 复用或新的分布式 lobby 代替未实现的能力。
