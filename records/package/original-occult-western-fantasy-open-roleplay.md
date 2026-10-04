# 西幻开放式文字扮演重构记录

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Status: Active; Phase 0 complete, Phase 1 pending
- Plan: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Implementation branch: refactor/original-occult-western-fantasy-open-roleplay

## 总览

用户否定旧游戏固定调查职业与卷宗核心，要求开放式文字扮演并重构前端。多轮讨论确定的方向已进入Plan；本次明确授权创建分支、企划并推送，供换设备继续。

本任务不是已完成长期世界扩展的续跑，也不是只套用HTML的新皮肤。旧发布与历史文档保留，未来按当前Plan重构。

## Phase 0 企划与跨设备交接

- Date: 2026-10-04
- Start Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- End / reference-tested Package HEAD: d7be6f1abff4d9d756f2dfa24c5492104e72aa75
- Core baseline: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Start docs HEAD: bf53ef028e0af55bf530cfed89abc0fd5dedb75d
- Status: Complete; stop before Phase 1

### 已完成

读取完整Governance与相关工作空间规则，确认远端main／package／docs基线，原工作树干净。根据用户明确建分支指令，从package创建上述任务分支；未修改main或稳定package。

用户HTML／TXT原样存入任务分支frontend/references/open-roleplay，并补来源／hash说明，提交为d7be6f1abff4d9d756f2dfa24c5492104e72aa75。该提交不改真实游戏前端、运行契约或旧发布。任务分支已推送并跟踪同名origin分支。

docs下建立8模块Plan Bundle，保存批准方向、体验、世界超凡、运行契约、视觉、分阶段路线和验证边界；建立本唯一Record及live HANDOFF。设计参考只在游戏资产分支，docs不承载产品HTML。

### 关键决定

产品方向详见Plan decisions，不在Record复制第二套详细规则。Primary Workspace是package；用户明确要求建工作分支，后续阶段沿用并最终集成package。Core支持只有Phase 1确认需要时建立main派生辅助分支，同一Task ID、同一Record。

当前阶段仅企划／参考归档。下一阶段做实际契约核对与实施设计，不直接开始代码。不复读所有历史Plan，不恢复旧固定调查／长生默认约束。

### 验证与证据

参考HTML SHA-256: fb3473625058536b82b797a3fd92bc4bb0875603f2b7a9d64e24e66b15681e33。
护栏TXT SHA-256: d3c198cecd4c83f27de027c81412580fadd1e10391ae1be7f5532418132f5119。
两份复制件与原件一致。新自有Markdown执行空白检查，Plan引用及阶段路由执行存在性检查；原始参考按字节一致验证，不为清除生成器空白改写用户文件。

已核对10份自有Markdown、13个相对链接、2份逐字节一致的参考资产、分支祖先关系以及Record／HANDOFF中的实施HEAD；git diff --cached --check通过。远端package任务分支已推送，docs发布状态以实际远端refs与HANDOFF为准。未运行产品／游戏测试、构建、CI、模型、浏览器、Android或真机验证；此前参考本地file预览被浏览器策略阻止，只有源码阅读。

### 已知限制

运行接口和schema缺口待Phase 1，不能将目标当作现有能力。HTML是预写回复与概念存档，不是运行证明。问答、背景素材、处罚、更新参数由执行者后续设计。普通／铁人以及新版本保存迁移还未实现。

### 下一checkpoint

Phase 1：核对自由文字意图、合法／非法超凡、动态内容、有限演化、死亡保存与Native前端真实契约，形成复用／缺口映射、最小可玩闭环与下一阶段验收。完成设计、验证事实、更新同一Record与HANDOFF、推送后停止。

## 最终状态

任务尚未实现或发布。仅Phase 0完成，保留任务分支与live HANDOFF供换设备继续；不得标记整体Complete或删除交接。
