# S07 — Skill 候选与版本固定

- Task ID: `agent-intelligence-runtime`；沿用产品任务分支，仅 S07。
- Status: **Complete — 原 repository 完整版本 / candidate / CAS、RP / Native / Studio exact consumers 与本地验证已交付**；依据 [M1 §7–9](m1-evolution.md#7-精确版本与真实读取) 与 [delivery S07](delivery.md)。

## Authority 与消费者

原 `src/skills/repository.js` 继续管理用户目录中的 Skill 文件。追加 `skills/.history/<encoded scope>/<name>/` 保存内容寻址的完整文件快照与有限 candidate metadata，不新增 StorageEngine kind 或独立有效配置 authority。原目录仍是下一次 preparation 的唯一选择；`installedHash` 的既有算法保持，version 使用同一完整文件 hash。历史随原 skills 目录备份 / sync；scope 和用户目录保持隔离。

真实运行准备先按现有 scope / visible / deny / invocation settings 解析，再以 expected installedHash 固定完整 Skill。always 的 SKILL.md、按需 read、支持文件 list / search 都携带同一 version；RP Director / Loop / Spec / Agenda 和子 Agent、Native narrative、Project Studio 共用契约。运行内编辑保留原快照，同一 RP run 的 Director / 子 Agent、Spec nodes 与 Agenda workers 共享已接受的完整版本；新 preparation 读取当前目录，不再沿用原五秒全局 inventory cache。读取 pin 缺失 / 损坏 / 删除不 fallback 到 latest。Project 显式 Continue 是新的 preparation，不声称复用旧 task 全生命周期的版本。

旧调用不传 version 时保留管理 / 编辑路径；新 production runtime 必须传 version。无历史的旧安装在首次 pin / 修改前惰性保存，不伪造历史时间或运行证据。旧 malformed / name-mismatch manifest 不归档为有效版本，但保留原 editor 修复入口；此前有效 pin 仍读取已保存的内容。外部文件编辑无法历史回填，pin 时必须与实际完整内容一致，否则 conflict。

## 候选、冲突与容量

候选只修改用户自有 Skill 的 SKILL.md 正文，保留 name / description / license / metadata 与所有其他文件；不改 scripts、工具、权限、Package 原版或 runtime 源码。candidate 保存 baseVersion、desired version、完整正文 diff 和确定性 identity，version immutable。候选准备 / 冲突检查 / 显式应用复用原 repository；没有模型 job、自动 publication、Evaluation eligibility 或新 UI。S06 ineligible candidate 不因保存版本而升级。

所有 repository 读取与写入口共享按用户 dataRoot 的单进程队列；candidate apply 在同一排序中重验完整 expected base，用户编辑任何文件均冲突。先保存旧 / desired 快照，再通过原文件 authority 切换候选正文；保存失败不触及生效文件，生效点后响应丢失可用 current version 检查；desired 仍为 current 时显式重复 apply 返回 alreadyApplied，不重写。candidate check 除 hash 外重验完整 frontmatter / 全部支持文件不变，阻止经 sync 导入的 hash-valid 扩权候选。不能把内容 hash 声称为防 ABA 的 revision counter；恢复同一完整内容视为同一 Skill version。多 Host writer / 外部文件 editor 不在队列支持范围内，自动模式未实施。

每 Skill 最多 64 snapshots / 64 MiB 快照原始字节、64 candidates（每份序列化 metadata ≤2 MiB；不把此副本字节计入 snapshot raw 上限）；既有 perFile / perSkill / fileCount / SKILL.md 上限继续适用。达到容量显式失败，不自动淘汰被 pin 的旧版本。快照 atomic staging / rename，读时重验 schema、身份、路径、文件 hash 和完整 hash；未知 schema / corruption 拒绝。新路径拒绝 symlink、重复 / 非 canonical 文件路径与内部 UUID staging 保留名；这些保留名只用于写入临时文件，不是 Skill 内容。

## 生命周期与验证

删除 Skill / scope 同时清历史及候选，旧 pin 被撤销。Skill name rename 改变 frontmatter identity，清旧历史并从新名称开始版本；move / scope rename 保留历史到新 scope，旧身份读取失败；copy 复制历史到新 scope，candidate 按原 scope 身份失效，需要重新准备。用户目录删除自然清全部资源；不引入 retention loop。Package 限制在 repository 与 HTTP 两层执行；原安装流程允许首次安装与内容相同的幂等安装，不允许不同内容原位替换。global read-only guard 也适用于原 Skill writes；已有快照可读取 / pin，缺快照不允许持久写，HTTP503；candidate conflict check 无持久写。

实际最小本地验证（13 suites / 247 distinct tests passed）：临时真实 FS 的 restart、旧版本 / supporting files / binary、并发 CAS、候选不可变与冲突、失败点、未知 schema / corruption / 容量、删除 / rename / copy、Package、HTTP owner routing、RP 与 Native / Studio 真实读取消费。相关命令与每套计数见 Record；23 个产品文件变更，触及 JS ESLint / diff 通过。未执行真实模型、全量测试、build、browser / UI、Android / 真机、外部 DB 或远程 CI。

本阶段产品 / tested HEAD `57f4e814af373b4659ba247f9891edd80652c356`；完成后更新同一 [Record](../../../records/refactor/agent-intelligence-runtime.md) 与 live HANDOFF，commit / push 后停止。下一 checkpoint S08；M1 未完整，不合并 main。

## 实际边界

- 历史和候选沿原 Skill 文件目录，不新增 SQL kinds / 迁移。真实 FS reopen 与原 sync snapshot / reconcile round-trip 已验证，embed / memory inventory 不包含历史；不声称 StorageEngine dump 内包含 Skill 文件，原 SQL 部署也继续使用原 Skill FS authority。
- 完整版本 hash 是内容身份，历史按 hash 列表，不提供伪造的时间顺序或 revision counter。正常 replace 的 directory rename 失败会恢复旧目录；进程恰好退出于目录交换窗口时旧 backup 保留，可能暂时 unavailable，未新增自动 crash replay。candidate 单文件 commit 原子切换，完整 PromotionIntent / 跨资源 publication recovery 归 S10。
- candidate 只关联原 Skill base / desired，不伪装成已关联 S05 feedback / diagnosis / Evaluation；这些 provenance / policy / deletion dependency 与自动 promotion consumer 由 S10 接入。手动 apply 沿原 authenticated edit 权限，不是评测晋升批准，不改变 S06 ineligible 状态。
- Project 同一次 Studio loop 保持 pin，显式 Continue 重准备；Native narrative 同一 generation 子轮保持 pin。删除 / identity 变更会让原 pin 读取失败；已装入请求的 always 文本不热改，后续读取不 fallback。
