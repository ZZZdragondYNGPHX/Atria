# S07 — Skill 候选与版本固定

- Task ID: `agent-intelligence-runtime`；沿用产品任务分支，仅 S07。
- 依据 [M1 §7–9](m1-evolution.md#7-精确版本与真实读取) 与 [delivery S07](delivery.md)。

## Authority 与消费者

原 `src/skills/repository.js` 继续管理用户目录中的 Skill 文件。追加 `skills/.history/<encoded scope>/<name>/` 保存内容寻址的完整文件快照与有限 candidate metadata，不新增 StorageEngine kind 或独立有效配置 authority。原目录仍是下一次 preparation 的唯一选择；历史随原 skills 目录备份 / sync；scope 和用户目录保持隔离。

always 的 SKILL.md、按需 read、支持文件 list / search 都携带同一 version；RP Director / Loop / Spec / Agenda 和子 Agent、Native narrative、Project Studio 共用契约。运行内编辑保留原快照，同一 RP run 的 Director / 子 Agent、Spec nodes 与 Agenda workers 共享已接受的完整版本；新 preparation 读取当前目录，不再沿用原五秒全局 inventory cache。读取 pin 缺失 / 损坏 / 删除不 fallback 到 latest。Project 显式 Continue 是新的 preparation，不声称复用旧 task 全生命周期的版本。

旧调用不传 version 时保留管理 / 编辑路径；新 production runtime 必须传 version。无历史的旧安装在首次 pin / 修改前惰性保存，不伪造历史时间或运行证据。旧 malformed / name-mismatch manifest 不归档为有效版本，但保留原 editor 修复入口；此前有效 pin 仍读取已保存的内容。外部文件编辑无法历史回填，pin 时必须与实际完整内容一致，否则 conflict。

## 候选、冲突与容量

候选只修改用户自有 Skill 的 SKILL.md 正文，保留 name / description / license / metadata 与所有其他文件；不改 scripts、工具、权限、Package 原版或 runtime 源码。candidate 保存 baseVersion、desired version、完整正文 diff 和确定性 identity，version immutable。没有模型 job、自动 publication、Evaluation eligibility 或新 UI。S06 ineligible candidate 不因保存版本而升级。

所有 repository 读取与写入口共享按用户 dataRoot 的单进程队列；先保存旧 / desired 快照，再通过原文件 authority 切换候选正文；desired 仍为 current 时显式重复 apply 返回 alreadyApplied，不重写。恢复同一完整内容视为同一 Skill version。多 Host writer / 外部文件 editor 不在队列支持范围内，自动模式未实施。

每 Skill 最多 64 snapshots / 64 MiB 快照原始字节、64 candidates（每份序列化 metadata ≤2 MiB；不把此副本字节计入 snapshot raw 上限）；既有 perFile / perSkill / fileCount / SKILL.md 上限继续适用。达到容量显式失败，不自动淘汰被 pin 的旧版本。未知 schema / corruption 拒绝。新路径拒绝 symlink、重复 / 非 canonical 文件路径与内部 UUID staging 保留名；这些保留名只用于写入临时文件，不是 Skill 内容。

## 实际边界

- 历史和候选沿原 Skill 文件目录，不新增 SQL kinds / 迁移。不声称 StorageEngine dump 内包含 Skill 文件，原 SQL 部署也继续使用原 Skill FS authority。
- 正常 replace 的 directory rename 失败会恢复旧目录；进程恰好退出于目录交换窗口时旧 backup 保留，可能暂时 unavailable，未新增自动 crash replay。candidate 单文件 commit 原子切换，完整 PromotionIntent / 跨资源 publication recovery 归 S10。
- candidate 只关联原 Skill base / desired，不伪装成已关联 S05 feedback / diagnosis / Evaluation；这些 provenance / policy / deletion dependency 与自动 promotion consumer 由 S10 接入。手动 apply 沿原 authenticated edit 权限，不是评测晋升批准，不改变 S06 ineligible 状态。
- Project 同一次 Studio loop 保持 pin，显式 Continue 重准备；Native narrative 同一 generation 子轮保持 pin。删除 / identity 变更会让原 pin 读取失败；已装入请求的 always 文本不热改，后续读取不 fallback。
