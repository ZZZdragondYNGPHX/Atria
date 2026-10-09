# 换设备继续 M1 — 用户已暂停，M1 未完成

用户只需把 `Atria-Document-private-20261009.zip` 转移到另一设备，并告诉接手 AI：**“解压并读取 docs/HANDOFF.md，继续 M1。”** 以下恢复操作全部由接手 AI 完成。

- Task ID：`agent-intelligence-runtime`；Primary Workspace：`main`。
- 产品分支：`feat/agent-intelligence-runtime`，已推送 upstream，HEAD `88e5b34d30bc04d4011271f354c21b46627a6283`。当前代码均已提交；未合并 main。
- 文档分支：`docs`。
- Plan：[index](plans/architecture/agent-intelligence-runtime/index.md) → [feedback §16](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#16-f3-工程修复与-m1-持续推进) / [acceptance §1–§2](plans/architecture/agent-intelligence-runtime/m1-acceptance.md#1-验收语义)。
- Record：[同一实施记录](records/refactor/agent-intelligence-runtime.md)，先读末尾“用户明确暂停并再次换设备 — M1 未完成”。

## 当前结果与缺口

F2 双模型来源前置复核已完成。首次 F3 两域各一个候选、三个 development 场景已观察，两域一致 candidate 胜均为 0，未准入独立验收。新 F3 校准 run `run-1791552826778-8fccb497` 每域仅一个主模型控制通过，随后 HTTP530/524 中断，没有新候选。

代码已接入原 worker 的密封来源 paired observation、已付费校准恢复及 promotion/review/消费/回滚流程。最近相关本地单元检查 64 项通过；原 worker/mock 接线检查被用户中断，尚未完成。真实独立 promotion、审阅发布、下一请求消费和回滚均未执行，不能据此宣布 M1 完成。

暂停时账本累计 1124 requests / 6422466 accounted tokens，pending0/lock0；本任务进程已停止。原基线、失败、不利评分、未知费用及密封材料保留，详细事实以 Record 和私有结果为准。

## 接手 AI 的恢复与下一行动

1. 自动发现并解压私有包，定位 `Document/`；从 Atria 远端拉取产品 `feat/agent-intelligence-runtime` 和文档 `docs`，核对真实 Git 与本 checkpoint。保护设备已有 dirty changes，必要时自主建立独立工作树，不覆盖另一设备的新提交。
2. 恢复源码/tests锁文件对应的依赖，自动适配私有配置与辅助脚本的本机路径，保留原凭证、报告、密封字节、账本及已付费身份。隐私文件不进 Git，不要求用户手工进行 Git、配置或路径整理。
3. 读取上述 Plan / Record，审阅并完成未验证流程，先补原 worker 的本地接线检查，再核对现有模型连接。按已授权途径恢复连接并推进可独立工程工作；仅在确实缺用户专属凭证/权限时说明具体缺口。新实验固定当前源码与协议，只复用 exact 消息、配置和费用身份一致的已付费控制；不直接重跑旧 scope。
4. 沿原 development → 独立验收 → 私有审阅发布 → 下一请求消费 → 守卫回滚门槛持续完成 M1。保留不利结果，不对相同候选无变化追分；只做最小相关本地验证，不逐阶段要求用户确认。

接手提示词：解压 `Atria-Document-private-20261009.zip` 并读取 `docs/HANDOFF.md`，继续 M1。请自主拉取并核对产品/docs、恢复依赖和私有路径，再按指定 Plan / Record 完成未验证流程。产品 checkpoint 为 `88e5b34d30bc04d4011271f354c21b46627a6283`；M1 尚未完成，首次 F3 未过开发门槛，新校准被 530/524 中断，原 worker 接线及真实独立验收/发布/消费/回滚仍待完成。
