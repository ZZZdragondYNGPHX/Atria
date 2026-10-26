# 综合游戏平台底层运行时改造记录

- Task ID: `refactor/game-platform-runtime`
- Plan: [index](../../plans/refactor/game-platform-runtime/index.md)
- Start HEAD: `519642ad`
- 状态：实施中；用户要求完整计划后连续实施，不在阶段边界交接。

## P0

已核对源码工作树干净、与主线起点一致。主源码目录与长期 docs 存在无关未提交改动，均未改动；本任务使用既有产品工作树和独立 docs 工作树。已建立完整分模块计划。

审查实测基线见 [measurement](../../plans/refactor/game-platform-runtime/measurement.md)。后续各阶段补充实际结果，不能把计划描述当作已交付能力。

## P1 — 进行中

- `8a15a3dd`：文件描述符 stamp 准入缓存；热 Blob 交付不重读全文件，替换/修改后重验；Blob Buffer 读取异步化。图片 normalize 与 mask 编码使用最多 4 个工作线程，迁移全部已找到的 mask 调用方。
- 32 MiB 合成文件：首次校验 17.80 ms / 32 MiB，第二次 0.059 ms / 0 字节。原地修改后校验拒绝；PNG 输出字节一致、mask 正常、损坏图像拒绝。图像相关测试期间宿主 5 ms 定时器最大额外延迟 11.63 ms（原单图 normalize 实测阻塞约 64 ms）；总耗时混合了后续 mask/错误测试，未当作单图耗时。
- ESLint 首轮发现 brace-style 与 BigInt 环境声明问题，已修正，受影响文件重测通过。
- 剩余：媒体客户端流式消费、大包全 Buffer 边界、真实 HTTP/浏览器路径。

## P2/P3/P4 — 进行中

- observe 复用第一次快照；记录 ID 索引与写入者失效；包准入身份复用编译声明；同一 Authority 私有候选在模拟步骤内复用，完整世界校验移至模拟协调边界。
- 分片计算接入 Transaction 的 `computation.partitioned`，partition/compute/reduce 全部在进程沙箱，结果按索引汇总；池支持 AbortSignal、程序亲和调度；JSON 节点/字节预算与 UI 区分。
- 合成单逻辑任务共 3.2 亿次整数运算：串行 965.25 ms，4 分片 298.71 ms，3.23 倍，输出完全一致。100k 数值输入可执行；更严格重新准入仍拒绝超过其预算的值；运行取消与后续池恢复通过。
- 100k 实体集合，热 1,000 次单 ID 读取 1.50 ms，每次访问计数 1；私有候选复用且原始基底未改变。
- 文件存储行动计算移出账号事务，保留 Session 锁及每次 publish 的 CAS/耐久提交。SQL 条件下推与时间排序 limit、FS 完整 key 直接读取已实现，待相关存储测试。
- 首次分片测试发现未注册临时 Map 的 identity 空值访问，已修正并重跑上述测试通过。尚不把微基准等同于完整游戏调用链性能。
