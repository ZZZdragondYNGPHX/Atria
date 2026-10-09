# 恢复快照 — 已续接，M1 继续推进

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`；产品工作分支 `feat/agent-intelligence-runtime`，尚未集成 main。
- Product / local Tested HEAD: `cebd14154b371f59a7b44dbac9726e2f9db18a4c`（已推送）。
- Current stage: F2 双模型来源前置复核完成；F3 每域一次提炼与三 development 场景已完成，两域未获 promotion 资格，M1 正式验收 pending。
- Plan: [index](plans/architecture/agent-intelligence-runtime/index.md)
- Required modules: [feedback §2/§6/§8/§15](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md)、[acceptance §1/§2/§12](plans/architecture/agent-intelligence-runtime/m1-acceptance.md)。
- Record: [同一实施记录](records/refactor/agent-intelligence-runtime.md)，读取最新“新设备恢复与 F3 私有调查入口”及其实际结果。
- Private state: 已恢复的私有根目录 `Document/` 与七个 workspaces；不使用旧 Windows 辅助脚本、不覆盖原凭证/报告/密封字节。

## 当前结果

F2 两域40/40有效比较/source controls、六来源各两模型观察完整。RP档案有共同 knowledge_boundary gap，水库两模型六维met，剧场知识判断分歧保留；Project三来源共同 status_accuracy gap。原六正确基线逐字段复用，没有重新付费生成。独立 promotion metadata 与密封正文保持；开发未读取密封答案。

F3 run `run-1791549607555-d38e4ef9`。每域只提炼一个候选，随后三个 development 场景执行与原硬检查通过，保存十二次盲评，十一份契约有效、一份因解释超过512字符而无效。两域一致 candidate 胜均0：RP主模型三tie，第二模型两baseline/一candidate；Project主模型一baseline/两tie，第二模型一tie/一baseline/一invalid。重要维度有负差和分歧，`promotionReady=false`、`accepted=false`；`f3Completed=true`仅表示本次观察周期完成。

未执行独立 promotion、私有 review publication、下一 run 消费或 rollback；两候选只在隔离 fixture，原生产 gate/human/price/owner 权限不变。不集成 main、不进入 S11/G，不修改不利评分或重复同候选追分。

## 工程与验证

测试侧新增原 `--f3` 私有调查入口，沿原 evaluator/targets/worker/费用端口；旧代理纠正用 withdraw 撤回，不伪造用户反馈/生产 diagnosis 方向。私有 policy 的目标/Route/price/fingerprint 固定，原生产 configure/start 仍拒绝缺有效反馈。完整双臂证据用可逐字段还原的共享引用去重，保持原 context/output 限制。超时清理修复为等待完整 funded send/retry 链结算后才复制/清理 fixture、释放共享 lock。

最新最小本地 checks：F3 17/17、retry18/18，触及 JS ESLint/syntax/diff；免费资金/校准/target pins、双臂完整 context sizing和实际六candidate试验/两模型报告核对通过。F2既有28项与前期验证见Record，不把重复执行累加。没有 full suite/build/CI/UI/Android/外部 DB 验证。

最后累计1113 requests /6235309 accounted tokens：816reported+45unknown+252carry，unknown650054按原上界结算；pending0/lock0。348个distinct prefunded packets与共享账目一致，本次F3新增47请求/436781记账tokens（含一次524 retry）。保留404/超时、原不完整和无效响应、原账目/epochs/timestamps；迟到旧retry无完整持久usage，按原上界unknown结算并另存审计，不清账。详细source/config/report/candidate/hash pins唯一见Record和私有final audit。API规则见[Governance §13.1](README.md#131-api-测试执行规则)。

## 下一行动与接手提示词

用户已明确要求继续 M1；本页保存换机恢复快照，实际最新状态以 Git 和同一 Record 的“M1 继续”节为准。一次实验退出不再作为整体停工点。继续基于不利证据修复有明确根因的工程与提炼输入问题。原二评委阈值、固定场景/维度、独立来源隔离和 M1 完整退出门槛保持；不在已评分候选或 promotion 材料上刷分。

接手提示词：继续 Atria `agent-intelligence-runtime`，先核对 Git，再读 docs:HANDOFF.md → Plan index → feedback §2/§6/§8/§15、acceptance §1/§2/§12 → 同一 Record 最新 F3 节。产品分支 `feat/agent-intelligence-runtime`，HEAD `cebd14154b371f59a7b44dbac9726e2f9db18a4c`。私有包已恢复，F2 双模型前置范围完成；F3 每域一次候选/三development完成，但两域一致胜均0且有负差/分歧/无效评价，未准入promotion，M1 pending。按最新 Record 持续推进 M1，先依据原不利证据核对归因和干预设计，保留六基线、候选/全部评分/费用与密封来源，不重跑正确结果、不改分、不清账；只做当前触及面最小本地验证，不集成main、不进入S11/G。
