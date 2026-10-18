# G05：原 Transformers 本地 Embedding 消费者

复用原 `getTransformersVector` pipeline 串行队列、Native Retrieval middleware、原 Run/Task compute port 与原 index publication，不新增 provider/预算/模型发送 authority。

每个实际单条调用/原本地 text 批次为一个 `embedding_local` job，每条文本仍计一个 item，全部 UTF-8 文本 bytes 工作前准入，包含该批次需要的 pipeline 初始化/模型载入和逐条实际 inference。服务端 Transformers 原插入批次不再拆成只适用于远端请求的十条小批次。批次中途失败不发布部分结果，全部准入 items/bytes 与已发生工作保留 actual process CPU/wall/outcome；线程/库不可中断时等待返回后拒绝发布。观察是进程 CPU，可能包含其他工作，不是 CPU 时长硬 cap、模型权重下载 bytes 或货币收益。

旧无 localWork 限额入口不造 ledger；继承的原限额不因 Route 删除而清零。其它 scoped provider（包括 browser WebLLM）仍维持原 unavailable，不把全本地推理都标为已计量。

最小出口：FS/SQLite Native Session 与 Project Task 实际 middleware/index 消费原 bank；耗尽/bytes/stale/取消在 pipeline 读取前拒绝，失败/载入中或推理中变更保留成本，不发布 stale index；保留原无预算 helper 和 singleton 模型切换顺序。

source `24dcb551faec74d5265348a5f3e79e80fd1183f4` 已交付此有限入口。真实既有 ONNX 模型 `Xenova/paraphrase-multilingual-MiniLM-L12-v2` 通过原 middleware/索引，原 H0-ZH-08 的三条选中合法来源中 `s08-020` 排首位，384 维；首插入包含模型加载/下载，不能与暖查询比较成优化收益。此样本不证明完整合法 corpus/Hybrid 消费、rerank、净成本或整体 G06/HM2；后续沿同一入口补受影响的真实消费者。
