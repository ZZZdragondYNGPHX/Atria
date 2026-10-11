# Atria Agent Intelligence Runtime — 换设备恢复快照

> 2026-10-11 用户明确要求找安全时机停下、换设备继续；按 [Governance §7](README.md#7-handoff) 保存。当前停止，不再开启新组；用户明确继续后以实际 Git 状态恢复，快照不创建额外审批或长期执行限制。

## Task

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`
- Current stage: HM1 已完成并合入 main；继续接受的 M8 G01–G06 / HM2 H3–H4，完整验收未完成。停在 Session Task 有界公开摘要/adaptive reset 已验证并推送的 checkpoint。
- Repository / origin: `https://github.com/ZZZdragondYNGPHX/Atria.git`
- Source branch: `feat/agent-compute-runtime`，HEAD `3cebec8f7e143d58d54d7dddd9d46fcef88694f5`，本地/远端一致、工作树干净。
- Docs branch: `docs`，交接前已推送 Record HEAD `96ccf204ba4914c8fa96e8551e3646e28e920b3c`；本 HANDOFF 将随 docs 新提交推送。包含它的最终 HEAD 以 `git rev-parse HEAD` / `git ls-remote origin refs/heads/docs` 核对，不将交接前 HEAD 当最新。
- Main HEAD: `3ee1332ef113d4c57c65d9577222ba88d5171101`，本地/远端一致、工作树干净；本轮不合并、不部署。
- Current paths: source `D:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`；docs `D:/Dev/Atria-worktrees/docs`；main `D:/Dev/Atria`。新设备可换绝对路径，以分支/HEAD和现有 authority 为准。
- Plan entrypoint: [index.md](plans/architecture/agent-intelligence-runtime/index.md)
- Stage-required Plan modules: [G01 当前有限清单](plans/architecture/agent-intelligence-runtime/g01-substrate.md#当前有限剩余清单2026-10-11)、[compute-policy §3/§4](plans/architecture/agent-intelligence-runtime/compute-policy.md)、[model-routing §7/§8](plans/architecture/agent-intelligence-runtime/model-routing.md)、[delivery §8/§8.2](plans/architecture/agent-intelligence-runtime/delivery.md)。只读当前需要部分。
- Record: [agent-intelligence-runtime.md](records/refactor/agent-intelligence-runtime.md)，最新摘要恢复组含原始失败、修复、费用及证据边界。

## Completed

- M1 / HM1 H0–H2 已完成并入 main，不重跑 ZIP baseline 或 M1。原 ZIP 校验/解压、原生 source/Information/Context、三路径实际消费及其失败/账本沿原 Record 保留。
- 原 Run/Task 预算、Native 私有 envelope/CPP、配置 ABA 失效、按需 Skill read、原单文件 index 的 insert/query/vector/list/delete/purge、在途/retired 成本等有限 checkpoint 已交付，详见 G01 当前清单，不重复所有历史组。
- `fafdb8608` 原 foreground 声明 Narrator Session Task 公共工具 history / 独立 Node 冷恢复；`804b088ae` 真实 FS/SQLite fork、历史 restore、same-HEAD restore 的独立 scope 与费用保持。
- `3cebec8f7` Responses 原 Session Task 一次有界摘要：实际两工具 HTTP 后第三 count 超窗，exact adaptive 才原预算准入 reset；保留公开 sourceMessages/hash、原配置版本指纹及旧非秘密 CPP IDs。摘要进 user data lane，epoch1 首次无旧 opaque/native 工具块，HTTP 前声明 reset reason/loss。原正式 Task 结果 CAS / model/localWork bank 不重建。
- 原 6 总工具轮 / 54 总消息 / 64KiB history / 131072 Run 上限跨 epoch 保持。严格 task / quota 拒绝、config/pin/HEAD/CPP 失效、取消、FS 补偿与 SQLite 回滚、发布后冷 epoch 已有有限结果。

## Pending

- M8 / HM2 未验收。真实 G06 正文 quality 仍 FAIL；实际 semantic Embedding/rerank、gateway cache/价格/可靠收益证据尚缺。不得用本地 fixture 升级真实 verified 或收益。
- 已启用本地工作仍有缺口：原 Context build/Prompt compile、初始 Skill inventory/pin/always-load、已启用 reuse/corpus validation；其它已选 Session Task 实际消费者按支持矩阵继续。
- Provider native safe-copy/compaction 未有 exact verified 证据，本组不发送这些字段。FS 补偿只证明锁内同进程捕获异常恢复，不证明 CPP delete→Run publication 间突然退出的跨文件原子性；冷测试只在发布完成后受控 exit。
- 下一 Context/Skill 组仅做了只读定位，未冻结新合同、未编辑产品、未启动其测试。停止时 source 工作树干净。
- docs 无关未跟踪 `plans/feat/agent-experience-evolution/` 保留，不 add、清理、搬移或覆盖。

## Key decisions

- 复用既有 StorageEngine、RunControl、Project Task、RouteResolver、GenerationService 与原 provider port；无新预算/发送器/许可 authority，不把公开摘要当事实确认、工具许可或世界状态。
- SQLite 本组是真实事务回滚；FS 本组在原 Runtime→Run 锁内对有界资源删除/发布失败作补偿，Host 随后的失败 cleanup 是另一个时点。原费用/unknown/charged 不退款。
- 未启用 classifier、learned router、prewarm、local KV/LoRA 不自动扩为本轮必做。H5 仍依赖 M2/M3/G06，不新建 Goal/Memory writer。
- 外部调用已获准同任务合成 H0-ZH-08 到原 `gcli.ggchan.dev` / `gemini-3.8-flash`。硬上限只有每日 2000 次、20 RPM，延续原统一 ledger；助手旧 2 次/no retry/输出或总 token 上限不作为用户限制。实际 Provider 技术限制与产品原预算照常执行。当前为用户换设备停止，暂无新发送；恢复后先修复真实语义缺陷再作有意义复验。
- 已授权本任务代码/合成测试/文档 push 到同一 origin 的 `feat/agent-compute-runtime` 和 `docs`，不重复申请。私有材料、原始日志/账本、凭据不上传 GitHub；main 合并/部署不属于本次停止收口。

## Local validation

- 最新组：`g04-session-task-summary-after-v7.log` 20 新 distinct PASS；`g04-session-task-summary-regression-v1.log` 71 受影响既有 distinct PASS，三个 suite 的实际子集。`g04-session-task-summary-lint-v5.log` ESLint、`git diff --check` PASS。未运行 MySQL/Postgres；本轮新外部 HTTP 0。
- 20 新检查中 summary edit / 跨 epoch 总轮数两项是声明 validator，未完整执行 Host；其余按 Record 的实际消费者/冷拒绝分类，不能都标完整生成。
- 实际正向 3 个 loopback HTTP / 60 direct fixture tokens / 15 settled local jobs；发布后 cold epoch 16 jobs，保留 1 charged reset。不等于 gateway 账单或实际价格。
- 失败证据不删除：factory count-before-render、reset 缺 requestId、fixture Runtime 锁重入 hang、FS 无 SQL rollback、immutable history 工作副本、摘要发布后配置修改错误重启；均见 Record/私有日志。`after-v3` 在停止其测试进程后留下 11 FAIL/5 PASS/超时的运行日志，不写成通过。
- 真实 M8 累计 38 / direct 72982、unknown 2 / 17515 upper、admission fetch0；G06 质量 FAIL。最后实际 pair 的两份历史否定正文与费用保留，不重发未改变的付费输入。

## Private evidence and device migration

- GitHub **不含**私有基线和累计结果。旧设备私有根 `D:/Dev/Atria-private/hm1-20261010`，原日志/脚本/报告/账本在 `Document/`；新设备需通过用户自己的本地安全迁移保留它，不能只重新解压旧 ZIP 来替代新增账本/失败证据。
- 本地无凭据迁移包已完成：`C:/Users/5insi/Documents/Codex/2026-10-10/task/Atria-private-evidence-no-credentials-20261011.zip`，56452855 bytes，SHA-256 `be8088c5745122bea18743200fdd36419d62ccf0cec692aa7c24688c70b68568`。旁边 `.zip.sha256` 与 `ATRIA-MIGRATION-MANIFEST-20261011.json`，包内有 `MIGRATION-README.txt` / manifest。监督已校验 ZIP CRC 与逐文件 SHA-256；无凭据包仅本机保存，无上传。含18585文件/237339656原始bytes，排除37项凭据配置/含已知credential内容/secret资源/sealed或可重建scratch/browser；不是完整机器备份，原件未删除。新设备先校验，再解包到新的空私有目录；按照 README 映射路径，任何历史脚本都不能因解包而自动启动付费调用。
- 原 ZIP `C:/Users/5insi/Downloads/Atria-Document-private-H0-20261010.zip`：55288312 bytes，SHA-256 `1551535563aac211046df34ca743072e7a060c8b60a4ef04b434d7b44afee30e`。
- 原 ZIP 含真实 API 凭据，不能作为上述无凭据包直接共享/上传；新设备的连接 Secret 另沿用户私有配置恢复，不因此授予新设备权限。原 ZIP 也没有本轮新增结果和账本，不能替代当前迁移包。
- 必须延续 `Document/m1-api-quota.json`（153422 bytes，SHA-256 `af6f88fd0ae899f7697a30b2187633a27441b3bb47cbffbfb8372fa56799c680`）、`hm1-model-ledger.json`（33189 bytes，`12c4cb4826f001826388762b998687a0b7b4ade884e1699220fd2104bbe9fdb5`）、`m1-ledger.json` / `.rate.json`、原 raw baseline / request / response / reports 和复验日志。恢复时先读原发送计数实现，不另建空 ledger、默认全额或重置历史。
- 2026-10-11 05:24:53 UTC 只读 snapshot：原 quota 总 admissions1659，滚动24h554、最近60s0；carry332已过24h，最后 admission2026-10-10 20:06:47 UTC。这是本地历史计数，不是新设备实时 gateway 余额，恢复发送前由原实现重新算窗口。
- 旧 runtime：Node `D:/Dev/Node/node.exe` 24.18；Python 3.12。source 使用其现有 dependency lockfiles/node_modules；新设备按原工程恢复依赖。私有脚本旧绝对路径可适配新 checkout，不能修改原冻结 raw 文件来伪造新 pins；凭据在用户私有配置中恢复，不写 HANDOFF/公开包/Git，不推测新设备授权或 Secret。

## Next target

用户继续后：先核对三个真实 Git HEAD、source clean / docs 无关 draft，再读本 HANDOFF→Plan index→G01 当前清单→Record 最新组。先补一个有限 G05 原 Context build/Prompt compile 工作准入合同，再复用 Host 既有原 Run/Task `localWork` charge/settle 端口，确保任务/后台 anchor、accepted fallback policy、取消/stale/失败成本与无 localWork 旧路径兼容。初始 Skill/reuse 如未在此组纳入仍明确 pending，不假称全部 CPU 被硬封顶。只做新组最小实际消费和受影响回归，再持续下一依赖。

只读定位：Host `src/native/adapters/generation-host.js` 的 `execute` 在 `providerFor` 前调用 `prepareNarrativeSkills`，原包装 `localWork` 目前只涵盖 count/render/按需 read/task_history；`contextProvider.buildRequestContextPlan` 与 `compiler.preparePrompt` 尚未工作前准入。`public/shared/native-compute-budget.js` 的现有 kind 列表没有 context/initial Skill 种类。不要借修改预算上限让旧 fixtures 绿；新增真实计量应如实调整合成 fixture 的成本断言及明确边界。

## Read first

- 实际 Git / source `AGENTS.md`、docs `README.md` §7/§8/§12/§13.1。
- 上述 index、G01 当前清单、Record 最新两个有限组；不要扫描整个历史 Bundle。
- 当组才读取 Host、`skill-invocation.js`、`model-prompt-runtime/prompt-compiler.js`、`adapters/native-session-context.js`、`public/shared/native-compute-budget.js` 与相关既有测试；私有额度实现按发送需要读取。

## Do not repeat

- 不重跑 M1、HM1 H0–H2 或已交付有限组，不为换设备重复所有测试/付费输入。
- 不删除 raw FAIL/unknown/费用或重置 quota，不把历史累计视为终身上限，不恢复助手旧固定次数/token限制。
- 不上传 private/凭据、不改独立密封材料、不 add 无关 docs draft，不合并 main/部署，不创建新线程/子 agent/Goal。
- 停止后不后台测试/请求/修改。用户明确继续前保持 idle；恢复后正常按 Governance 推进，阶段/失败不自动停工。

## New-chat bootstrap prompt

继续 `ZZZdragondYNGPHX/Atria` 的 `agent-intelligence-runtime`：先核对实际 Git，再读最新 `docs:HANDOFF.md`、Plan `plans/architecture/agent-intelligence-runtime/index.md`、G01 当前有限清单与 Record 最新摘要恢复组。source `feat/agent-compute-runtime` 应在 `3cebec8f7e143d58d54d7dddd9d46fcef88694f5`；main 已完成 HM1 在 `3ee1332ef113d4c57c65d9577222ba88d5171101`，M1/HM1 不重跑。M8/HM2 未验收，G06真实质量仍 FAIL。最近摘要/adaptive reset 20 新/71 旧实际检查通过、已push，FS只同进程补偿、cold仅发布完成后退出。下一有限 G05 Context build/Prompt compile 准入尚未实施；沿原 Run/Task预算推进并保护无关 docs draft。私有 `hm1-20261010/Document` 与原 quota/raw证据需已安全迁移，缺 ledger 时不能用空账本发送。外部仅原合成 H0-ZH-08 / 原gcli模型目的，每日2000/20RPM由原统一计数执行；无助手固定次数/token审批，不重发未实质修复的失败输入。继续直至正式目标完成，最小相关验证，按已授权推送 feat/agent-compute-runtime/docs；不上传私有材料、不自行merge/deploy。
