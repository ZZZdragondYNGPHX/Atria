# Doupo Native authority — Record

- Task ID：`feat/doupo-native-authority`；Primary Workspace：独立产品源码。
- Plan：[接纳扩展](../../plans/feat/doupo-native-authority.md)。
- Start HEAD：`f9a8a83827c8b3662c44e67e95c9ed84118baadd`。
- Status：用户要求换设备；阶段源码已提交，本次推送远端，仍未集成 main。远端状态以实际 refs 为准。
- Checkpoint HEAD：`6e44cf85969fff3038eec5a16957b0919ff17521`。

2026-10-21：为 [斗破 package 后端](../package/doupo-living-world.md) 建立 `feat/doupo-native-authority`。原始声明实际拒绝 collection 字段；同一真实 Subject 目标在原 appraisal 接纳函数中返回 `appraisal_target_denied`，修补后接纳，未知目标仍拒绝。二十四人长时样本触发 invariant 的 computation input declaration byte limit；声明仅传需要的 invariantContext 后十日样本通过，没有提高执行预算。

目前改动复用 bound-expressions、privateReads、computation、Simulation grant 校验及 appraisal target 识别。新增的读取是私有且有界的；没有第二套人口、身份、关系或保存服务。原有模型交付证明与 Cognition 来源校验继续生效。

本地已通过集合隔离等 10 个针对性样本；原有核心回归首轮 185 项通过，模拟候选有 1 项旧 work count 预期失败，在未修改 main 上也复现同样的 9/8 差异。补齐本地 harness 后，computation Session 与 appraisal 回归另 17 项通过。最终完整统计与源码 HEAD 在完成前补齐；未将测试或日志提交到任何分支。

换设备前补充：新增 invariantReads 只允许缩减原 read grant 的字段，不增授权；14 个针对性本地样本通过。此前原有回归不是最终全量结论，最新扩展仍需完整回归。当前源码 syntax/whitespace 检查通过，实际游戏安装及十日推进通过；长时完整恢复与人口规模仍由 package 主 Record 继续验证。用户已要求 GGchan 停用、API 留到所有本地工作之后；本次只保存 checkpoint，不合并 main，不删除任务分支。
