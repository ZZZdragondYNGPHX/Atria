# 当前交接 — 斗破苍穹后端阶段实现

- Task ID：`package/doupo-living-world`；Primary Workspace：`package`。
- 日期：2026-10-21。用户要求推送并换设备；这是 v0.10 未完成实现 checkpoint，**不是后端完成交付**。
- Plan：[index](plans/package/doupo-living-world/index.md)；实际结果：[同一 Record](records/package/doupo-living-world.md)最新 BE 阶段。

## Git 与恢复

| 分支 | 本次源码/包 checkpoint |
| --- | --- |
| `package` | `b424c2a030a9774ad5b90cb438a5d9cd23fb50f7` |
| `feat/doupo-native-authority` | `6e44cf85969fff3038eec5a16957b0919ff17521` |
| `docs` | 本文件所在提交；用 `git log -1 --format=%H -- HANDOFF.md` 定位 |

恢复时 fetch 并核实上述分支，不以本快照回退新的远端提交。游戏包源在 `package:doupo-living-world/`，必要框架扩展在独立源码分支；源码仍未合入 main。main 当前干净且为 `f9a8a83827c8b3662c44e67e95c9ed84118baadd`；main 不合入 package。远端是否保存以实际 push 和 refs 检查为准。

新设备分别建立或恢复三个工作树，为源码工作树按其仓库说明安装依赖。构建入口是包目录的 `tools/build.mjs --core <源码工作树路径>`，必须指向本任务源码分支。包版本 `0.1.0-be.1`，Package ID `pkg_723cdd67122beffdac73f3dfe5c9f64e`，PackageVersion ID `pkgv_788177e6d50cb9680ed2089857ace7c9`。没有提交 `.atria` 发布件。

本机 docs 另有其它任务的未提交 HTML：`plans/architecture/atria-frontend-audit/design-proposal/atria-visual-direction.html`（67 行新增、35 行删除），未纳入本次提交，也不会随本任务推送迁移。FE 的独立分支 `feat/doupo-living-world-design-reference` 及其它源码任务均未动；不提交、推送或覆盖它们。

## 当前实现与验证边界

已有包作者源、构建器、闭合 schema、四类出身/十二场所/二十四名初始 NPC，以及生活、探索、成长、交锋、关系、家庭和人口规则。独立源码分支扩展原生有界 private collection grants、computation anchor/invariant 输入与真实 Subject 评价目标接纳，没有另建身份/存档服务。详见 [源码任务](plans/feat/doupo-native-authority.md)及 [源码 Record](records/feat/doupo-native-authority.md)。

[共用契约 C1 草稿](plans/package/doupo-living-world/frontend-contract.md)已对应实际字段与事务。尚无正式前端 binding、AUI/Canvas 或真实 Bridge 全链路接线；前端设计另行迭代，后端完成后由用户选择集成执行者。

- 最新包构建、隔离 Native 安装、24 个 Subject 绑定、创建/投影和十日推进通过；目标接纳与集合/invariant 的 14 项针对性本地样本通过。
- 较早家庭样本走到婚姻、出生及新生儿 Subject；恢复后测试辅助函数出错，完整恢复断言未完成。已修正本地辅助函数，整条流程尚未重跑。
- 长测曾触发 256 条 Lifecycle 回执上限；接入现有 History checkpoint 后仅完成十日 smoke，跨越旧失败点、跨年和规模验证仍未完成。128 KiB invariant 输入问题修补后也只有短样本证据。
- 原有回归分批有 185 项通过、补充 harness 后另 17 项通过；一个模拟 work count 的旧预期差异在未修改 main 上亦复现。最新扩展之后尚未最终全量回归，不能宣称全部通过。
- 本地 8000 服务未运行，MCP 实例身份不可验证；没有完整浏览器或真实模型通过结果。测试、fixture、临时容器和日志仅本地保留，新设备需重建，不能假定已随 Git 迁移。

## 继续顺序与生效约束

先核实 Git/保护其它任务 → 本 HANDOFF → [index](plans/package/doupo-living-world/index.md) → [decisions](plans/package/doupo-living-world/decisions.md) → [分工](plans/package/doupo-living-world/execution-split.md) → [backend-task](plans/package/doupo-living-world/backend-task.md) → [共用契约](plans/package/doupo-living-world/frontend-contract.md) → [research](plans/package/doupo-living-world/research.md) → [Record](records/package/doupo-living-world.md)。随后继续全部 BE 范围，优先：

1. 重建本地验证，完成家庭/完整世界恢复、迟到任务和分支隔离；不要将较早部分成功写为 V2 通过。
2. 解决现有 typed Bridge 动作经 NativeGenerationHost 生成旁白的问题：内部 continue 需要复用确定性权威提交，避免每个追赶片段调用模型；尚未实现。
3. 补历史人物查询与隐私边界；跨月/年/世代、人口/出生预留/并发/迁徙、信息增长和 V3/V4/V7 负载。96 人是未经负载验证的默认值。
4. 补复合动作部分成功、自动存档、旅行/战斗/取消、NPC 家庭和全部出身回归；继续规则修正与最终回归。
5. 全部本地工作之后再做真实模型 V6，完成源码任务集成、版本/验证结果与前端接线清单，然后交给用户选择集成者。

用户明确要求：**不再使用 GGchan；暂时不调用 API，留到最后**。不自动重用旧连接、旧额度。D01–D26 不重复询问，不从 doupo-open-world 导入历史确认；阶段不另设审批，不引入独立审查。正式前端制作不在本 BE 对话展开，不改 FE 的 `design-reference/`。测试与验证资产只留本地。

可复制续接提示：

> 继续 Atria `package/doupo-living-world` 后端。先核实 Git 并读取 docs:HANDOFF.md，按 BE 路由加载 Plan/同一 Record，从 v0.10 未完成 checkpoint 继续全部后端。源码分支为 feat/doupo-native-authority，尚未合入 main；main 不合入 package。保护 FE 与其它任务，不引入独立审查，不重复 D01–D26。GGchan 停用，API 留到本地工作最后。后端完成后交付实际接口、版本、验证结果与前端接线清单，由我选择集成者。
