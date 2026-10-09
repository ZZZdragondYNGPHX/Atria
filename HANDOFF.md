# 换设备接续 — Agent Intelligence Runtime

- Task ID: `agent-intelligence-runtime`
- Primary Workspace: `main`；当前产品工作分支 `feat/agent-intelligence-runtime`，尚未集成 main。
- Current product / Tested HEAD: `f495267023ca4475d15ba1c61b66702624c4938e`（已推送）。
- Current stage: F2 主模型范围完成；用户于 2026-10-09 要求打包隐私数据、换设备继续 F3。F3 已获后续执行授权，本机未启动；M1 正式验收 pending。
- Plan: [index](plans/architecture/agent-intelligence-runtime/index.md)
- Required modules: [feedback §7/§8/§14](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md)、[acceptance §0/§1/§2/§11](plans/architecture/agent-intelligence-runtime/m1-acceptance.md)；涉及候选/发布时再读 [s10-evolution](plans/architecture/agent-intelligence-runtime/s10-evolution.md)。
- Record: [implementation history](records/refactor/agent-intelligence-runtime.md)，读取最新 F2 结果及换机节。
- Privacy restore: 用户本地换机包的 `README.md` / `restore.py`；共享文档不保存凭证和机器绝对路径。

## 已完成与证据边界

六个 development 来源、六个独立作者密封 promotion 来源、固定质量维度/配置及隔离已准备。20/20 主模型语义 controls 有效，六条真实基线原硬检查通过；RP archive 的 knowledge_boundary、三个 Project 的 status_accuracy 为主模型观察缺口，另外两个 RP 全 met。保留正确结果，不人为制造缺口。

最终范围 `m1-f2-config-source-v2-clauses-primary-20261009.json`，`judgeMode=primary_only`；所有 `sharedGaps=[]`，不是 F2 双模型通过或 M1 达标。Step 在短暂恢复后再次 nginx 404，备用 MiniMax 401，按用户授权暂缓。新设备应核对实际连接并补齐正式双模型评价所需证据；不得把旧协议响应凑成新协议通过，也不得将 F3 的执行授权写成验收通过。

最终 run `run-1791541743682-aa0a9d56`；独立 metadata `m1-f2-sealed-20261009-project-window12/metadata.json`，SHA256 `7c47b310b6639ed8cfc58adfdc810f101454ffa2463c977a6776a88f5cf5aa38`。详细 source/control/runner/configuration pins 唯一见 Record 和私有 final audit。密封正文/答案未被开发读取，换机只复制并校验原字节。

累计 1008 requests / 5,132,946 accounted tokens；715 reported + 41 unknown + 252 carry，unknown 上界 558,397 tokens；pending0、lock0。迁移保留账本、quota/rate、transport epochs/历史错误及完整 fixtures，不重置历史费用或 timestamps。API 测试规则唯一见 [Governance §13.1](README.md#131-api-测试执行规则)。

## 实际验证与待办

当前产品 HEAD 的 `f2-sources` 28/28、触及 JS ESLint/diff 检查通过；未变化的 retry consumer 已执行 `m1-retry` 15/15，相关 grader transport checks 有历史证据。未执行 full suite/build/CI/UI/Android/外部 DB；本次换机不新增模型请求。

新设备先验证换机包并运行恢复脚本，核对实际 Git 与私有 state，安装源码锁文件依赖，读取上述模块及最新 Record。原报告和配置保持 byte-for-byte；旧私有辅助脚本含原设备路径，不能直接运行，按换机 README 使用当前 worktree/Document 路径，原 native fixture 走已有 restore consumer。

随后按原 F3 一次双域试点推进提炼与 development；原 development 的两评委一致胜/其余 tie/重要维度非负及原 checks 准入不变，通过才进行独立 promotion、私有 review→实际消费→rollback。第二连接仍不可用时可以准备和调试原消费者，但单模型结果不能获得双模型 promotion 资格；真实工程失败应修复复测，不在失败边界结束任务。不降低 M1 门槛，不集成 main，不进入 S11/G。

## 接手提示词

继续 Atria 的 `agent-intelligence-runtime`，先核对 Git，再读 docs:HANDOFF.md → Plan index → feedback §7/§8/§14 和 acceptance §0/§1/§2/§11 → 同一 Record 最新节。产品分支 `feat/agent-intelligence-runtime`，冻结 HEAD `f495267023ca4475d15ba1c61b66702624c4938e`，F2 主模型范围已完成，20/20 controls、六条原基线及密封独立来源已保存；F3 已获用户换机后执行授权，本机未启动。先恢复并验证用户私有包、核对第二连接与当前正式准入条件，再持续完成一次双域 F3。原双模型验收与生产权限不变，不读密封答案指导开发，不重跑正确的冻结基线，不清账，不恢复旧额外测试配额；只遵守每日2000次与20RPM。不要在失败或阶段边界写新 handoff 代替继续工作。
