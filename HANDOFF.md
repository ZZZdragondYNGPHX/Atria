# Atria Agent Intelligence Runtime — 新对话交接

> 2026-10-12 用户明确要求在合适边界停下、提供交接词并新建对话继续。当前3个已启动调用已结束，只完成本地审计/交接和docs同步后停止。**整体任务未完成，S16正文Disclosure尚未验收，S17尚未实施。** 恢复按真实Git与最新Record继续；本暂停不变成下一对话停工限制。[Governance §7](README.md#7-handoff)。

## 实际工作空间与恢复顺序

- Task ID：`agent-intelligence-runtime`。Bash/Linux，cwd `/home/henry/Projects`，Asia/Singapore。
- source：`/home/henry/Projects/Atria-worktrees/tasks/agent-compute-runtime/source`，branch `feat/agent-compute-runtime`，HEAD/origin `634b2494b875b76160d63444f7a5e9265f766e5c`，干净。
- docs：`/home/henry/Projects/Atria-worktrees/docs`，branch `docs`；交接前 `1013f884f0490b0863a4655bb7c85269c3f83929`，包含本文的新commit另行push，以实时HEAD为准。这里的根 `HANDOFF.md` 就是 docs:HANDOFF.md，不去source内寻找不存在的docs目录。
- main：`/home/henry/Projects/Atria`，HEAD/origin `3ee1332ef113d4c57c65d9577222ba88d5171101`；未merge/deploy，保护其它工作树。
- 没有本任务运行中的付费调用/测试或子agent/Goal；本对话按用户要求交接后停止。Node v24，source/tests里的Jest及jest.config.json可用；root/tests node_modules为原main依赖的ignored symlink。

先核对两worktree status/HEAD，干净后拉取原分支（ff-only，冲突保护已有工作），再读本文 → [Plan index](plans/architecture/agent-intelligence-runtime/index.md) → [S16具体入口](plans/architecture/agent-intelligence-runtime/s16-belief-disclosure.md) → [Record](records/refactor/agent-intelligence-runtime.md)最后S15/S16三节。按实际需要补 [M3权限](plans/architecture/agent-intelligence-runtime/m3-cognition-design.md)、architecture §6、behavior-context §2.1、delivery §5/§8.2、compute-policy与原source。不要全仓扫描/重做已完成组。

## 已完成，不因交接重复

私有包 `/home/henry/Projects/hm1-20261010.rar` 已完整CRC/路径校验并解压至 `/home/henry/Projects/Atria-private/hm1-20261010`，118865458B，SHA256 `40d145e1aaad0cb775ea5f818556751701ba8ffb39f36555d60d0d675806829f`。17921旧manifest文件核对；唯一quota旧hash变化按连续账本与原HANDOFF1715记录解释并保留。远端原source/docs/main已拉取后读取原HANDOFF，恢复工作已执行；同设备新对话不再次解压覆盖当前新增私有材料。

M1/HM1已在main，不重跑。S11–S14有限Goal/证据/续跑/体验已push。G06所选支持技术矩阵在此设备完成，入口为 [G06验收矩阵](plans/architecture/agent-intelligence-runtime/g06-acceptance.md)，完整M8/HM2尚未集成main。Source-valid复用/Invocation同原32-job bank、实际来源、预算/失效/冷恢复、有限质量/时延与已知收益有记录；所有weather/hp/人物位置/事件否定失败、strict JSON失败及表达负差保留。style-v11最后同bank三正文9113、两匿名同primary观察5455，reuse/Invocation六维对base持平；不是独立质量/货币/cache保证。M8原reported161/direct402366保持。

用户已明确选择“采用原作者/作品授权”：私有认知检查/接管沿原作者/作品授权，普通玩家沿显式disclosure，不因操控Actor或Session owner默认取得全部private cognition读写。R5与M3入口设计已冻结，不重新问同一选择。

S15 source `1fb00fa5a` 已交付共享原Actor/profile不可变投影、旧Session ABI独立可编辑副本与精确公开identity/source、NativeContext原required lane/预算和Information-bound available Actor消费者；8新增/4原受影响本地PASS，实际Host、模型切换、新installed PackageVersion和Save/fork/restore保持身份。没有private profile dump/Narrator voice污染或新cognition writer。

S16 source7cba1df2e至634b2494b：原Information v1可选narration B默认separate/A限知/C作者原view；独立player display Disclosure、原Actor/Task audience/availability/Hybrid完整source grant不变。required cognition解释、来源/时态解释与Disclosure进入原预算/Source。13新增、8原受影响FS/SQLite/Context检查PASS，改动文件lint/diff PASS；旧Skill夹具补原版本pin，旧projection-only断言接受S15精确公开identity。四项误跑不可用MySQL/Postgres ECONNREFUSED保留、不冒称PASS，不启动额外DB/全仓。

## S16当前准确缺口与下一行动

9实际HTTP200全部原raw/usage/settled bank留私有：v1/direct5976，v2/direct5959，v3/direct6042，共17977。前六条补写无source动作/信纸/天气等。Information来源解释补齐后仍失败；v3只收紧本次作者叙事资源，三条无新增动作/物件外观/场景，林舟传闻与沈墨真相/NPC分域正确。

**但九条都转述了“阿岚收到未署名信”，该Exposure只在context memories中，没有player display grant。** display只授权hp/阿岚传闻；C另准旁白揭示沈墨真相，不连带授权private Exposure。此前审读只看真相/他者认知，误称完整Disclosure合规，最新Record已纠正，不改旧raw或把无关guard通过抵消此项。**S16未验收，先修这一实际传播缺口，再进入S17。** 不扩大display grant、补造World、后处理输出或删除失败制造PASS。

最小下一步：核对v3实际contextPlan中 `projection:policy:cognition` 的display items及全文，明确“context可知”与“display准揭示”的来源差集。沿原作者frame/Information consumer诊断修复，严格需求才沿原source隔离/有界分阶段生成；来源、Actor/Task工具与private cognition权限不放宽。先相关本地/零APIpreflight，再只复测受影响正文，原费用准入与失败保留。数据级隔离为确定性检查，宽context自由正文防泄漏仍是概率性audit，不作绝对保证。

S17仅只读查看原AgentGoalService/source-adapters/lifecycle接点，未写方案或代码。S17–S34按原已授权依赖继续；阶段提交不是默认停止点。

## 当前私有材料与费用

当前整个 `/home/henry/Projects/Atria-private/hm1-20261010` 必须保留；旧RAR没有本设备新增报告、raw、runner与audit，不能覆盖/替代此根。若下次换设备，需要迁移当前根，不上传Git。

- G06最终私有 `Document/g06-world-owner-bank08-live-v3.json`、`g06-world-owner-quality-live-v3.json`、`g06-continuation-audit-v5.json`，原全部不利版本/日志保持。
- S16根 `run-s16-cognition.mjs` 当前默认preflight-v4/live-v3，append-only已存在会拒绝；**不要自动执行历史脚本**。`Document/s16-cognition-live-v1/v2/v3.json`、raw request/response/normalized、preflight-v1/v2/v3/v4、local/affected/source-use/hybrid logs全部保持。根 `audit-s16-cognition.py` 与 `Document/s16-cognition-integrity-audit-v1.json/log` 零API通过，仅完整性/费用审计，不是语义PASS。
- 原 `Document/m1-api-quota.json` 当前1794 admissions，carry `{requests:332,at:1791460574562}`保持；只按原M1ApiQuota连续准入 **滚动每日2000、20RPM**。不清零、拆ledger或凭总历史1794推当日剩余/网关余额。S16新增9/direct17977单列。
- 自设备恢复累计79 admissions/77HTTP200/direct186756及2TLS unknown upper46348；原M8组161/direct402366、旧unknown2/upper17515/admission fetch0另列。格式失败/不利输出全部计费，unknown不是0。用户已确认“目前没有，保留unknown”，不再问价格。
- M1 ledger SHA256 `d83dc229a1af9c7f25b8125f4c3f7cf8227b8ba1f3fd2f2a9efbef43f8167d75`，HM1 `12c4cb4826f001826388762b998687a0b7b4ade884e1699220fd2104bbe9fdb5`。
- 原primary配置只从 `Document/api-primary.json` 私下读取；允许 `https://gcli.ggchan.dev/v1` / `gemini-3.8-flash`。不输出key、提交/上传private/raw/cache。

## 持续授权与停止

用户已授权继续全部剩余S/G、必要诊断/最小本地与实际复验、push原feature/docs。每阶段只本地最小相关验证，已经通过且无新变化不重跑；不整仓test/lint/build、不等待Actions/PR。不提高32-job schema、不拆/重置bank、不删除Source/Actor/Branch/freshness guard，不创建平行authority。真实Provider/cache/价格未证实保持unknown/unavailable。未得到本session授权merge/deploy main。

本对话按当前用户明确要求交接后停止；下一对话“继续”即恢复工作，无需重复阶段审批或M3权限问题。不主动创建子agent或Codex Goal；新对话由用户自行建立。
