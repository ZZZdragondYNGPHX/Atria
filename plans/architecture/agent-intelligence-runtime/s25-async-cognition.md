# S25：普通规则路径与异步认知

状态：2026-10-13 普通路径工程出口及有限真实对照完成，工程source `e2adac4bb`。同输入/配置的RP路线决策中，两臂5项事实/文本底线均通过；slow额外1请求/1571tokens/5localJobs/约7615ms，未观察质量收益，默认fast保持。原后台Task→声明writer→公开投影→正式Turn receipt实际执行；该单例不代表Project slow或完整语义收益。依赖原 S13、G05/G06 与 [compute-policy](compute-policy.md)，本模块不启用依赖 S24 的预测策略。真实结果归同一 [Record](../../../records/refactor/agent-intelligence-runtime.md)。

slow path 首批限定作品已显式声明的普通 background Task及原 lifecycle outbox intent；不建立新的timer、scheduler、psychology writer或全局默认自主演化。

当前只允许Simulation/appraisal进入该budget lane的限制需改为接受作者已声明的exact普通intent。模型结果仍沿原typed Task/Session writer/CAS，不获得新权限。

重启恢复只读取原 durable pending intent与显式有效slotBindings，不偷偷选当前default route。若原invocation已有charged/unknown attempt但没有可信完成receipt，自动pump保留待处理状态，不能把重启当作再次发送许可；已经发生的费用不退。未知恢复由原Task控制/显式重新调度处理，不重建费用ledger或新无限retry循环。Simulation/appraisal既有retry与gate不由普通lane扩大。

取消后worker未结束仍占原permit。已有HTTP start/poll是脱离页面等待能力，本身不宣称durable scheduler或应用关闭唤醒。Project沿原GoalContinuation/Task durable wake与unknown拒自动pump，不另写Agent loop或绕过Review。

工程行为、延迟、难例质量与实际slow收益分开；后者需同配置同质量底线实际对照，未取得外部证据保持pending。
