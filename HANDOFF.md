# Agent Intelligence Runtime — 换设备交接

2026-10-13 用户明确要求换设备，停止后续实施并保存当前快照。Task `agent-intelligence-runtime`；本聊天及三个子代理已停写，无受控测试进程/请求或待执行审批。新设备只接续一个主执行者，不重新唤醒旧主。

## 实际版本与恢复入口

- source：`feat/agent-compute-runtime`，HEAD/origin `dc2b2c2b9b986618ec580b263c03bd29835dcaff`，已push/ls-remote核对，干净。这是明确的 **S31/S33未验证WIP保存提交**，不是验收完成。
- S30已验证交付：`e93672e3cd861b8a8d353fbe609b2d2af3078720`；43新增/2原Scheduler检查PASS，真实SDK经FS/SQLite/HTTP。WIP随后抽取shared helper修改MCP，当前HEAD的14项MCP消费者尚未复验。
- docs交接前HEAD `8672f9f6564fd4e466b1af1def5551c781e1a28e`；本HANDOFF与Record提交/push后以实际Git为准。无关未跟踪 `plans/feat/agent-experience-evolution/` 保留、不stage。
- main `3ee1332ef113d4c57c65d9577222ba88d5171101` 干净、未改、未merge/deploy。
- 当前本机source `D:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`，docs `D:/Dev/Atria-worktrees/docs`；新机路径按实际checkout决定，不提交机器配置。
- 恢复次序：真实Git/status → 本文 → [index](plans/architecture/agent-intelligence-runtime/index.md) → [同一Record最新S30/换设备节](records/refactor/agent-intelligence-runtime.md)。只加载当前 [S30](plans/architecture/agent-intelligence-runtime/s30-local-mcp.md)、[S31](plans/architecture/agent-intelligence-runtime/s31-local-a2a.md)、[S33](plans/architecture/agent-intelligence-runtime/s33-learning-export.md)及必要代码，不扫全历史。

## WIP缺口与下一行动

S31：固定A2A v1.0.0 proto/1.0 wire、literal loopback JSONRPC adapter已落地；30项非loopback PASS，真实loopback1项默认运行FAIL `a2a_transport_unknown`，尚未定位/正常权限复验，不当通过。原A2aService与SessionPublicWork、12项真实loopback消费者测试已写，静态通过但实际12未跑；原MCP委托helper后14项受影响未跑。**仍缺shared localWork `a2a_protocol` kind与Scheduler `native_a2a_`安全error投影、strict a2a policy针对性测试及认证HTTP入口**。先读实际代码补消费者缺口，再以最小相关测试诊断所有真实失败。远端complete不得完成本地Goal；process重启持久远端身份仍unsupported。

S33：原ExperienceService `exportLearning(handle,{scope,subject,expectedSequence,purpose:'offline-analysis'})`、learning-trajectory与测试已落地；missingReasons、有界文件读取/fatal UTF8、Project状态、缺receipt/CAS/split限制修复已保存。root最后3归属文件及S31 contracts ESLint PASS，cached diff-check PASS；**S33实际测试未执行**，两次Jest启动sandbox tmpdir EPERM，审批等待被中断。尚需补review边界cases、真实验证、认证 `/experience/export-learning`入口及离线CLI（当前只有真实文件分析函数，不冒称CLI已交付）。不增加正文/素材外发、训练或晋升。

原Jest存在：从source cwd执行 `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand --runTestsByPath <exact test>`。node:test adapter用 `node --test --test-name-pattern='<exact pattern>' <file>`。独立SDK精确1.30.1通过 `ATRIA_MCP_SDK_ROOT`接入；新机需在临时目录重新准备（禁scripts，不改产品lock/config），旧机cache不打包。scope仅公开合成loopback，不运行连接用户数据的plugin/stdio。新机权限错误按正常环境诊断，别把默认拒绝当整个任务结束。

## 私有资料与权限

私有迁移包只含当前 `Atria-private/README.md`、`Document`的四个API配置和原 `m1-api-quota.json`；不含旧备份/raw上下文/逐次账本/cache。包含凭据，只本地恢复，不提交Git或上传公开渠道。解压到新机私有目录后，任务source本地Git `atria.private.directory`设置为**已经包含Document的绝对路径**，勿再拼Document。最小滚动quota原样转移，不重复导入carry148、不清零；必要获准调用沿原private-test-run，2000/day、20RPM，过期自动清理。

新素材producer/judge/诊断外发继续暂停；一般继续指令或历史README不能当发送许可。不播放音频，不merge/deploy/改安全设置/新增付费。允许沿已授权feature/docs推送任务结果；M4实际provider/双域quality-cost、M5模型语义/风格/长期收益/音质及完整M6/M7均保持pending。S32/S34尚未实施，不重做M1/HM1/S27–S29。
