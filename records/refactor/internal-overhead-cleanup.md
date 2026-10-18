# 内部开销与文档约束清理

- Task ID: `refactor/internal-overhead-cleanup`
- Primary Workspace: `main`
- Status: Complete
- Date: 2026-10-18

## Changes

- 清理治理、方案、旧记录、交接及工程写作指引中的额外门槛和防守条款，并移除专用模块及其路由。
- 公共数据克隆与序列化移除前置全树遍历，减少重复复制。
- 持久记录直接读取，移除重复摘要计算；本地材料加载直接读取文件。
- 演进模块使用显式版本编号，移除运行时源码目录扫描。
- 编排控制器减少授权轮次，删除整图重复遍历与记录反复重读，对应旧用例同步裁剪。

## Commits

- main: `fb4f8577f`。
- `refactor/atria-native-orchestration-v3`: `c2451035d`。
- `feat/native-visual-generation-deepening`: `8be8fc110`。
- package: `2192091d8`。
- plugin: `d3a752d77`。

## Final state

公共产品改动已集成 main；编排与视觉开发继续沿用各自任务分支。
