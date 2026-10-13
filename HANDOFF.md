# agent-intelligence-runtime — 用户要求暂停的续接快照

更新：2026-10-13。用户因账户额度将尽明确要求不再派发子代理，等现有任务结束后暂停并准备交接。现有任务均已收尾；没有待执行模型请求或共享quota锁。不要自行恢复本聊天工作，下一聊天由用户发起续接。

## 实际 Git 与入口

- 产品：`D:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`，分支 `feat/agent-compute-runtime`，HEAD `f4815c7277adc02d36860f45dcf12f43f64453e2`，已push/ls-remote一致，工作区干净。
- 文档：`D:/Dev/Atria-worktrees/docs`，分支 `docs`，本快照随当前文档提交保存。无关未跟踪 `plans/feat/agent-experience-evolution/` 必须保留，不暂存、不清理。
- main：`D:/Dev/Atria`，`3ee1332ef113d4c57c65d9577222ba88d5171101`，干净；本次按用户暂停要求尚未集成。
- 先看实际Git，再读 [Plan index](plans/architecture/agent-intelligence-runtime/index.md) 当前状态及 [Record](records/refactor/agent-intelligence-runtime.md) 最后“2026-10-13 续接 S31–S34 与真实出口补齐”一节。执行规则只归 [Governance](README.md)。不用重读整段历史。

## 已完成与证据

- `40ce8f8d3`：S31真实本地A2A、S32 A2UI→原compiler/bridge交互、S33元数据/离线CLI、S34原Prompt optimizer轨迹准入；本组287 distinct本地检查及Edge1280/390实际交互通过。A2A/MCP远端回显Secret漏洞已拒绝并保留失败费用。
- `c5447144a`：真实S34暴露的isolated Studio Skill-work路由修复，沿原Task预算；evaluator source pin含新直接依赖。后续隔离6/身份2/私有helper2检查通过，总计297 distinct。S34初轮失败费用保留，修后双域实际提炼/隔离评价均tie，awaiting_review、eligible=false、未发布；累计23请求/89950tokens。
- S23：原Host真实typed预测1请求/1272tokens，公开refs及不发布通过。
- S24：双域两种合法方案原authority/Review/Git receipt均达目标；比较方案各少一处改动，增加本地成本。基线是预先声明宽改动，不能称独立Agent或普遍预测收益。
- `a5c42f537` S25：3请求/5343tokens；两臂5项底线通过，slow额外1请求/1571tokens/约7.6秒，无质量收益，默认fast保持。
- S27：3请求/6703tokens，声明表达组7维模型观察通过；旧路径角色话语/安抚两项未通过。仅单个合成配对，无人工偏好或统计收益。
- `f4815c727` S26：8请求/12751tokens，真实rerank/Embedding可用。紧预算留额保住必要正文；充分预算两臂5维通过但reserve多186tokens，未证明成本改善。37localJobs中12unknown保留；Embedding为768维，只证明能力可用。
- 同一提交 S21连续场景：6个正式Turn，3FS→原Save/portable→3SQLite，原history/cognition/费用精确保持，replay零重发；加整体观察共7请求/47484tokens，六段×7维与恢复连续性通过。作者推进的light模糊记忆场景，不是500真实回合或自主认知收益。
- 本次实际模型请求合计45次，provider报告163503tokens，含失败；币价/上游retry未知。详项和限制见Record，不新建逐次账本或重跑补原始资料。

## 下一步（用户明确恢复后）

1. 核对真实Git及本快照，确认本次干净且无新用户修改。已通过且未变的tests/API不要重跑。
2. 所选有限消费者和必要实际出口已补齐，剩余为最终范围/Record核对、按Governance本地集成并核对main、push同步与清理当前已完成临时分支/worktree。main是feature祖先，可在最新Git仍满足时fast-forward；有变化再针对性验证。不要删除其它task工作区。
3. 不将所选有限交付扩写成完整泛化M4/M7收益或自动晋升通过；S34 tie、生产human/price gate、未选远程OAuth/Apps/stream/训练/推理优化能力保持如实边界。若新变化发现实际缺陷，沿原authority修复，不为自设样本数追分。
4. 完成后把必要事实归同一Record，删除本HANDOFF；不要再创建阶段交接副本。

## 私有配置与清理限制

原 `git config atria.private.directory` 指向 `D:/Dev/Atria-private/Document`。保留当前五份连接配置（包括新增 `api-retrieval.json`，字段endpoint/apiKey/rerankModel/embeddingModel）及极小 `m1-api-quota.json`。真实密钥仅在该Git外目录，不能从聊天复制到源码、日志或Record。用户提供的rerank/Embedding已实测；不需要再次请求配置。换设备时新配置也需随原私有资料迁移；本次没有新建私有打包副本。

所有新live脚本用原private-test-run共享2000/日、20RPM与临时清理，配置文件白名单已支持retrieval；不可并行争用锁或重置累计状态。真实临时正文已清理。

此前永久删除5个公开测试临时目录被自动审批以 `blocked by policy` 拒绝。2026-10-13 用户随后明确要求移入回收站；已核验Temp内精确路径、真实目录且非reparse，通过Windows SendToRecycleBin成功移入回收站，并确认5个原路径均不存在：`atria-s31-mcp-sdk`、`atria-s32-evidence-ngsH1M`、`atria-s32-evidence-O570Pw`、`atria-s32-evidence-pjK4lN`、`atria-s26-local-Yx7jQ4`。未清空回收站；任务仍按用户要求暂停。

## 新聊天续接提示词

继续 `agent-intelligence-runtime`。先核对实际Git并读取 `D:/Dev/Atria-worktrees/docs/HANDOFF.md`，再按其中Plan/Record入口推进剩余集成与收尾；保护无关Experience草稿，不重复已通过测试或模型请求，不把有限证据宣称普遍收益。此前因额度暂停；恢复后持续推进到当前已选交付完成。
