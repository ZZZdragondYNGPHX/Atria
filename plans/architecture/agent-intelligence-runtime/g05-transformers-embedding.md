# G05：原 Transformers 本地 Embedding 消费者

为 G06/HM2 的真实语义检查接原已存在的 `source: transformers` 服务端路径。复用原 `getTransformersVector` pipeline 串行队列、Native Retrieval middleware、原 Run/Task compute port 与原 index publication，不新增 provider/预算/模型发送 authority。

每个实际 text 推理为一个 `embedding_local` job/item，UTF-8 文本 bytes 工作前准入，包含该次需要的 pipeline 初始化/模型载入和实际 inference。排队后重验 scope/取消；模型载入结束、推理结束、settle 后继续重验。已发生工作保留 actual process CPU/wall/outcome；线程/库不可中断时等待返回后拒绝发布。观察是进程 CPU，可能包含其他工作，不是 CPU 时长硬 cap、模型权重下载 bytes 或货币收益。

旧无 localWork 限额入口不造 ledger；继承的原限额不因 Route 删除而清零。其它 scoped provider（包括 browser WebLLM）仍维持原 unavailable，不把全本地推理都标为已计量。

最小出口：FS/SQLite Native Session 与 Project Task 实际 middleware/index 消费原 bank；耗尽/bytes/stale/取消在 pipeline 读取前拒绝，失败/载入中或推理中变更保留成本，不发布 stale index；保留原无预算 helper 和 singleton 模型切换顺序。随后单独以现有支持的真实 Transformers 模型验证有限中文 H0 语义，不用 deterministic fixtures 宣布算法改善或提升真实 provider verified。

source `24dcb551faec74d5265348a5f3e79e80fd1183f4` 已交付此有限入口。9 新增 / 3 受影响既有 distinct 本地检查通过，覆盖 FS/SQLite、Session/Project、额度先于加载、加载中 HEAD 变化与排队/推理取消；原失败与最小复验见 Record。真实既有 ONNX 模型 `Xenova/paraphrase-multilingual-MiniLM-L12-v2` 通过原 middleware/索引，原 H0-ZH-08 的三条选中合法来源中 `s08-020` 排首位，384 维；插入及两次查询保留五实际推理 job、三索引 job，外部生成零、原 gateway quota hash 不变。首插入包含模型加载/下载，不能与暖查询比较成优化收益。此样本不证明完整合法 corpus/Hybrid 消费、rerank、净成本或整体 G06/HM2；后续沿同一入口补受影响的真实消费者。
