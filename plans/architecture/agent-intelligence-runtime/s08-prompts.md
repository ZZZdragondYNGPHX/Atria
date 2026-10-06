# S08 — Prompt 正文候选与精确 binding

- Task ID: `agent-intelligence-runtime`；沿用产品分支，仅 S08。
- Status: Complete；依据 [M1 §7–9](m1-evolution.md) / [delivery S08](delivery.md)。

## 有限 authority 与候选范围

复用 Native Library immutable Prompt revisions、PromptPresetStore 与 player Runtime Route。Preset 根保存有限声明 / candidate metadata，正文和 Program 依赖继续使用原 versioned resource kinds，不新增有效配置读取器、StorageEngine kind、后台 job 或自动发布。

默认无可演化模块。显式声明绑定 Preset current revision 与 exact module refs，只允许所选模块的完整 `body` 文本；不改变 identity、target、stage、condition、parameters、priority、provenance、其他模块、Generation、Regex、工具 / 权限、Connection 或必要 guard。一个候选只修改一个已声明模块，正文各 ≤64 KiB；每 Preset 最多 16 candidates、序列化 candidate metadata 总计 ≤2 MiB，达到容量拒绝、不自动淘汰。

候选冻结完整 Preset / declarations fingerprint、单一原 Route fingerprint、base / desired exact refs 与完整 before / after diff。只重建目标模块和 Program ancestry 的 immutable revisions；静态正文插值沿原 parser 重验声明 / forbidden paths，请求时继续由原 compiler 验实际值；其他模块与 Generation 保持原 exact refs。保存 candidate 不修改 Preset current refs 或 Route。check / apply 重建预期闭包并逐资源核验，不只信任 metadata hash。缺 revision、未知 schema、identity / dependency / body / declaration 漂移拒绝，不 fallback 到 latest。

## 有效 binding 与生命周期

显式 manual apply 沿原 authenticated edit 权限，在原单 Host runtime write queue 内检查完整 Preset 和声明仍有效、Route 仍等于冻结 base，然后只原子切换该 Route 的 `promptProgramRef`。desired Route 已完整匹配时重复 apply 返回 alreadyApplied；用户改了其他 Route 字段仍 conflict。当前已准备 request snapshot 不热改，下一 preparation 沿原 resolver / compiler / GenerationService 消费 exact candidate。Native RP narrative 与 Project task 使用同一 authority；ordinary legacy RP Preset 不静默转换。

Package 原版保留，只允许先沿现有 Preset import 创建 Library 用户副本，再显式声明 / 选择 binding。Native Preset 编辑或删除清声明 / candidates，阻止旧 candidate 启用；按原兼容规则保留 historical definitions 给已 pin 的消费者。声明撤销清 candidate metadata，历史 immutable revisions 仍是用户原资源，后续显式 Route 编辑可选择它们；声明撤销不自动回滚 Route。用户删除 / dump / restore 沿原 kinds，read-only 可 inspect / check，不可 declare / prepare / apply。

## 普通 RP 原 Workspace Preset authority

普通 RP 保持 `agentWorkspace` settings library、原 graph compiler 和角色 / 会话 binding，不迁到 Native generation。新增可选 `promptVersions` v1 保存 ≤64 个声明、≤16 个完整 immutable candidates（整个 metadata / definitions ≤2 MiB），不改变旧 settings schemaVersion 或建立平行选配置服务。

用户副本默认无声明；显式声明绑定完整 normalized Preset 与 selected Agent IDs。单 candidate 仅改一个 Agent 的 `instructions`，正文 ≤64 KiB 且非空；graph / capability / tools / host settings / model route / guard 不变。保留完整 base / desired、before / after diff、declaration UUID 和完整 base bindings；candidateId 是使用既有 `sha256` library 对 canonical candidate payload 的内容身份。读时重建单字段期望定义并复核 hash，body 和 identity 漂移拒绝。

显式 apply 只切既有 character / conversation binding 的 optional `promptVersionId`；禁止 default / global 和 `builtin-*`。冻结整个 binding table，任何用户编辑冲突；重复 desired table 可 reconcile。下一 `resolveWorkspaceProfile` 使用 candidate exact definition，profile / Plan metadata 携带 version，同 run 仍用原 clone。所有四种 mode 沿现有 host transport。原 save 保留旧 immutable candidate snapshots；base / declarations 变化阻止 pending activation，已选旧版本仍可读。显式 bind 清 pin；删除 Preset 清本 identity 的 metadata 和 pins，replacement 不继承旧 pin；未知 / missing version 不 fallback。

原 orchestrator capability API 新增 `inspectPromptVersions` / `checkPromptCandidate` / `updatePromptVersions`，更新复用原 settings save。该路径继承原单 browser client、debounced persistence；完整 snapshot compare 是同一客户端的冲突检查，不声称跨 tab / Host 原子 CAS、持久 publication intent 或物理 fsync。S10 自动 publication 必须先解决所选 target 的受支持写入部署边界。

## 验收与停止

最小本地验证 **7 suites / 68 distinct tests passed**：native candidate 19、Workspace candidate 14、原 Prompt Preset 5、runtime persistence 7、Workspace Preset 4、Native orchestration prompts 9、Workspace authoring help 10。最终新增继承闭包仅定向 native 19；hash library 接线后定向 Workspace 三套 27 passed，jsdom help 使用 Node package export conditions 后单套 10 passed。重复不累加。

真实临时 FS / SQLite restart、并发 whole Route CAS、metadata failure / committed response loss、unknown / missing / corrupted revisions、继承闭包 / guard、HTTP authenticated owner / read-only、Package envelope import 副本；原 SQLite dump / user close+directory removal / restore；Workspace 原 SettingsRepo FS / SQLite reload。真实 Director stub 跨轮消费 pinned instructions；真实 Project GenerationHost / scheduler / compiler / provider stub 与 narrator / studio GenerationService snapshot 消费 candidate。未重放完整 Native Session production turn，不冒充模型行为收益。

触及 JS ESLint / diff 通过，无真实模型、全量测试、build、browser / UI、Android / 真机、external DB 或 CI。调用方法见产品 model-prompt-runtime README；实际 HEAD / 失败修复及证据见同一 Record。

手动 apply 不产生 Evaluation eligibility；S06 candidate 仍 ineligible。S10 才接 feedback / diagnosis / source-deletion dependency、预算、Review / promotion / rollback / durable job intent；本阶段不创建模型调用。

完成实现 / 最小验证 → commit / push → 同一 [Record](../../../records/refactor/agent-intelligence-runtime.md) / live HANDOFF → 停止。下一 checkpoint 仅 S09；M1 未完整，不合并 main。

产品 / tested HEAD `9b5cb5740e2af7cab8b83b9675576ea01c4f4527` 已 commit / push；main 保持未合并。
