# Live HANDOFF — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Updated: 2026-10-09
- Checkpoint: **F2本轮准备核对以source_unready停止；F2独立来源/实际语义校准尚未完成，F3未开始。** 用户限定本轮仅新来源、独立隔离、校准和有限范围，不启动双域试点。M1 pending，不集成，不进入S11/G。
- Product: `feat/agent-intelligence-runtime@57520d43dd577c13d1eee6df50d3edb4a3379a1e`，本机已fast-forward到远端F1，无本轮源码修改；唯一最新paid source仍`a61b249ef71f108d279ec7bd883fb5eeae97a463`。
- Stable main: `ed1fd90521a63363e29856601abbf5e908c99d10`，未合并。
- Docs: 本轮从origin/docs `74e687f7c` 的隔离docs worktree更新同一Plan/Record并push到docs；执行前以actual Git核对。原本机feat/agent-intelligence-plan工作树仍保留五份纯CRLF dirty字节，不用其旧HEAD恢复实时状态。
- Read: actual Git / private账目 → 本HANDOFF → [index](plans/architecture/agent-intelligence-runtime/index.md) → [反馈/评价§10](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md#10-f2-来源准备校准控制与本轮停止状态) / [acceptance§10.1](plans/architecture/agent-intelligence-runtime/m1-acceptance.md#101-f2准备核对的实际范围与停止状态) → [同一Record最新F2节](records/refactor/agent-intelligence-runtime.md)。需要追溯时只读acceptance§9、S10、S05及F1物理契约；不读写reference。

## F2本轮实际产物与边界

私有原Document保存六份新development synthetic工作负载规格及逐input/control/spec hashes：RP档案馆玩家选择、水库交接修订/时间未知、剧场当前variant/私有信息；Project入口World/primary关联修改、具体缺失binding引用diagnostic修复、human revision冲突。没有新真实模型execution ref或baseline失败。promotion每域三个root仅为metadata预留，origin=not_acquired/sourceHash=null/independence=not_established，不能计独立来源或盲性，未读取其内容/答案。

两个原profile全部六critical dimensions保持，draft rubric与positive/negative/unknown controls显式engineering_control。原parser36两顺序scripted grade映射、36遗漏维度拒绝、6新spec原validator拒绝、2pilot原compare发送前source_unready；不是实际judge校准或human审美。原12legacy catalogue不改，不用旧v1/v2追分。

原Studio/ProjectAgent隔离FS三条依赖/修复/冲突工具路径实际通过（4/7/4tool calls；review/review/conflict），source/无关字段/human revision保持，model changeSets0，不automatic commit。工具calls不等于model rounds，未证明模型六round可完成性或baseline headroom。临时副本已清理，精确source/Task/validation/tool证据留私有。

重要缺口：当前每pair全部六维critical，而单独authoring/repair/conflict不各自曝光其它操作；缺证据须unknown，不能零/tie/事后N/A。RP也须确认逐维exposure。后续F2先预注册原六round内的全维度证据来源/窗口，或如实evaluator/source_unready停止；不降profile门槛，不交Prompt writer掩盖。

尚缺：独立promotion实际来源；原new fixed catalogue/adapter消费；真实baseline headroom/六round可完成性；全部critical实际证据；双judge语义校准；actual request/snapshot pins。因此本轮allowedActualSends=0、提炼0、paired trial0、publication0，F3完全未开始。任何未来付费probe仍须在acceptance另记exact pins/有限范围与现有窗口处理；旧416send估算/6of24余量不授权本轮发送。

私有来源包SHA `b7a46ff1b0550f3ee074f45a3819b037777fc4efdc1ff1df0c84e57f3be2a8f9`；draft rubric `4ec9760ce4b4906d6928558c8d2e2d410a077018714562c1c54442a380bcc8b8`；Project路径 `ed82408c425e4dc7d40a497adea9d40c1bd89a3d45391f29abda8823f54c3476`；final readiness `34e42c7b74714af224e9216940ae42dcb8a96e3aeedcc659c1fc9614f61da481`。实际配置hash仅留私有；规格hash不是已发送快照。

## 保持状态与验证

本轮零模型请求，仍761requests/2939582tokens，492reported/17unknown74948，pending0/lock0；quota761，九窗口七旧stop及6/24旧claim保持。五累计状态匹配旧audit，五无关dirty文档字节保护；不清stop、不新增epoch、不复用旧许可。private目录restricted Windows ACL保持；没有私有Experience/Task产品迁移。

本轮只运行Node24.18.0原parser/source gate工程断言及隔离FS原Project工具路径、文档最小检查；不是新的Jest suites/独立质量胜。F1历史5suites/101tests及共享pane fixture仅保留上一轮证据，本轮没有full/build/CI/UI/Android/外部DB。脚本两次fixture错误与一只读SyntaxError的修正见同一Record。

接手提示词：**先fetch/actual Git核对远端docs，勿用本机保留dirty的旧docs HEAD；沿private761/2939582账目与全部旧窗口。读取HANDOFF→index→feedback§10/acceptance§10.1→Record最新F2。F1 product57520d43d、paid source仍a61b249ef，main ed1fd905未合并、M1 pending；本轮F2准备以source_unready停止，独立来源/headroom/全critical证据/actual judge校准未完成，F3未开始。先补齐F2来源家族隔离、原fixed catalogue/adapter和原六round内逐维证据，缺证据保留unknown，不降门槛/旧v1追分/伪人工。任何付费probe之前在acceptance另固定actual request/config/source/范围与原Step窗口处理，不复用6of24旧余量或清stop。每包保存同一Record/HANDOFF后停止，不直接双域试点、不进入S11/G，用户无需手测。**
