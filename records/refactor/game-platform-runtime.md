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

## 后续集成与规模验证

- `f564f8f1`：跨 PackageInstaller 实例共享受控包缓存；可变字节被暴露或 Map 修改后不复用声明身份。运行时描述符深冻结复用。音视频通过会话限定且要求精确内容哈希的 HTTP Range 接口读取；脚本版本不变时复用沙箱快照，时钟独立更新。Canvas 同尺寸绘制避免重新分配 backing。
- 本地现有 `doupo-living-world-0.1.0-combat.2.atria`（106,778,956 字节）成功安装约 1,909 ms；新加载器重复打开只读取一次 Blob；验证修改 caller Buffer 不污染缓存。真实 Session 创建、重载、experience.ready 和 `doupo.event` 权威事务提交成功（冷进程事务约 488–546 ms，无前后同场景基线，不能宣称此数值改善）。
- HTTP 验证 HEAD/304 零流字节，1 KiB Range 流读取 1 KiB，416 拒绝且四次租约关闭。QuickJS 实际 VM 验证快照省略、时钟更新、异步 settle 使用最新快照；这是 VM/HTTP 测试，尚非真实浏览器播放/seek。
- 世界容量独立于 UI/消息：生命周期声明支持更大记录集合；计算 schema 允许大型数组；宿主 `native.authority` 配置单值/累计/读取字节、扫描/规则/步骤预算。默认单值 16 MiB，扫描 1M；保留权限、类型、累计预算、CAS。
- 5k/50k/100k 简单实体的真实 Lifecycle 校验分别约 4.4/13.6/27.3 ms，单条命令分别约 2.4/12.5/24.7 ms。首次命令包含索引和保留字节统计，仍随集合增长；尚未宣称局部更新已完全 O(1)。100k 数值通过世界数据类型校验，普通消息 schema/值仍拒绝扩大后的输入。
- Reducer 读取原始值，消除 sourceWorld 深克隆；Lifecycle 内部按修改路径复制并缓存编译 reducer。无过期策略且未超容量时跳过逐记录保留扫描。集合 ID 筛选使用索引，字段筛选仍按实际扫描计数；State delta 避免递归每层再完整比较。
- FS 与 SQLite 实测增量回放、旧版本未变、删除字段/数组缩短、过滤+时间排序+limit、精确 key 均通过。测试发现并修正 FS 精确查询误把 filter.limit 当 key，以及类型缓存的 primitive 分支。PostgreSQL/MySQL 尚无运行服务验证。
- 产品受影响文件 ESLint 与 diff whitespace 检查通过。尚待：流式大包导入/大单资源、长历史读取、模拟依赖调度、进一步候选复制与发布成本、取消的真实调用方、浏览器验证和最终主线交付；整体仍在实施。

## 大包与浏览器实测

- 上传从 Express 整包 Buffer 改为有界流写临时文件。预检只读取小头部，安装和冷打开直接流式解密；ZIP 大条目边解压边校验 CRC/SHA256 并写 backing。Blob 直接从已接纳文件流持久化。小元数据仍有独立大小限制，图片与音视频预算分离。
- 新增使用相同容器 v2/inventory 权威的文件构建入口；流式包上限 16 GiB、总展开 64 GiB、单音视频/条目 2 GiB。旧 Buffer 构建/读取路径保留 512 MiB 容器、32 MiB 条目限制，不把其容量谎报成流式能力。Studio/MCP 旧 Buffer 构建与导出链仍有各自边界，不能据此宣称全部编辑/导出入口已经支持大包。
- 现有真实游戏包内追加合成媒体测试（不是可播放视频）：32 MiB / 256 MiB / 1 GiB 均成功构建、安装、冷打开、验证图谱和末尾 1 KiB Range；禁止整包 readBlob 后仍通过。1 GiB 资源形成 1,180,505,767 字节包：构建 4,464 ms、安装 7,602 ms、冷打开 5,589 ms。256 MiB 场景峰值 RSS 444 MiB，1 GiB 场景 450 MiB（进程起始约 134 MiB，包含旧游戏声明与资源），未随媒体尺寸线性放大。
- 范围流测试发现共享 FD 被 destroy 关闭问题，改为由 payload 所有者关闭句柄、范围消费者通过显式位置读取；重测 256 MiB / 1 GiB、提前停止一个范围后再次读取均通过。HTTP 实际 Router 验证流式 body、options 解析、响应后关闭、上传限额和破坏 GCM 的拒绝。
- Chrome 156 / Windows 真实浏览器：600 秒 PCM WAV（115,200,044 字节）加载元数据并 seek 至 550 秒。网络先 bytes=0- 传约 917,504 字节，再 bytes=105578496-115200043 传约 720,896 字节，均关闭。前端 loadBytes 只加载 index，没有下载媒体 Blob。
- 实际生产构建的 QuickJS Worker + supervisor：102 次调用、仅 2 次快照，约 133,187 字节；初始单快照消息 60,177 字节，最终状态 hp=20，无诊断。Canvas 同尺寸第二帧尺寸 setter 调用 0 次；像素 [0,255,0,255] 验证透明度/变换已重置。
- 浏览器使用隔离测试页和真实运行时模块，没有改造 UI 外观；不是完整游戏 FPS 或低端实机证据。此次前端验证应用 animation-performance 技能的实际浏览器/主线程诊断要求。
