# S23：文本/结构化模型预测消费者

状态：2026-10-12 实施中。依赖 [S22](s22-hypothetical-preview.md)、[architecture §8](architecture.md#8-counterfactual-与-metacognition)、原 Task/Host/RunControl 与 G06。实际结果归同一 [Record](../../../records/refactor/agent-intelligence-runtime.md)。

首批有限范围是 Native Session、单个作品声明行动、文本 observation 与结构化 prediction。PredictionService 是原 Host 的消费者，不新增 provider executor、authority 或 World state。由服务器从 exact Session/Package snapshot 捕获 player display view、Actor/source/scope 与声明 action；不能以 caller 自报 observation 或模型填写锚点代替权限。

调用作品已有 interactive advisory Task（无 applyCommand、无 semantic outcome/正式 app binding），沿原 Resolver、Prompt/Generation closure、结构化输出能力、TaskScheduler、provider send admission、RunControl 费用运行。Host 内部只读预测 lane 编译服务器捕获的 observation/action，关闭 Memory/Knowledge recall、Skill tools 和自动 publication；不能用 preview 绕过正常收费。原 task.context=['input'] 本身不能证明 recall 隔离。

返回临时 `kind:hypothetical / mode:model_prediction` artifact，含 prediction、assumptions、uncertainty、有界支持 refs 和服务器捕获的 source/route/execution provenance。模型不能授予 mode、来源权限、provider 身份、base revision 或 publication proof。support refs 只能指向本次 observation item IDs；confidence 是未校准表达，不当概率。暂不持久化为 Task result，以免只读预测自身改变 Session revision；有真实复用需求时再沿原 artifact 生命周期深化。

发出前、返回后及消费前重验 revision/branch/package/scope/source bytes；晚到/取消/不支持能力/预算不足/无效 output 显式失败，已发生成本保持。预测不改变 Clock/World/Memory/Timeline/outbox/Task results，不触发真实工具副作用；真正行动仍重新进入原 authority。预测质量不等于正式 outcome 或决策收益，比较和 prediction-error 关联属于 S24。

最小验证：真实原 Host/存储检查授权投影、预算、费用、支持 refs、取消、stale 与只读性；再经当前连接实际 provider 一次 observation/action→typed prediction，核对使用与不发布。自由文本幻觉、权限边界和预测质量分别判断，不用 mock 替代真实 provider 出口。
