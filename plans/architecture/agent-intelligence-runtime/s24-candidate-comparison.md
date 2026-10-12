# S24：有界候选比较与正式结果绑定

状态：2026-10-13 Native有限消费者实施中。依赖 [S22](s22-hypothetical-preview.md)、[S23](s23-model-prediction.md)、S19及 [architecture §8](architecture.md#8-counterfactual-与-metacognition)。S23真实provider、RP决策收益及Project高影响方案收益仍pending；本地工程不替代这些证据。

首批比较是服务器自己准备的有界声明action与 exact Player projection。用户显式指定已有公开item/data field的期望值；固定规则先匹配目标，再选公开delta最小的候选，无法满足则不选择。不以未校准confidence当客观成功概率，不推导未声明的价值标准或玩家动作。可选模型预测沿原PredictionService逐候选执行，不信任客户端上传prediction artifact的producer身份。

服务器在有限临时comparison生命周期绑定owner、candidate id、normalized action、artifact hash、base anchor及policy；`current=true`只说明源新鲜，不能证明客户端body曾由Host产生。所有候选仍是假设，不写World、Memory、Task结果、用户偏好或正式Experience outcome。选择只返回action proposal，真实操作需再次经原authority/Session CAS；预演不携带publication proof。

后续feedback只从当前SessionCore真实actionReceipts取得authorityId/inputHash/baseRevisionId/committedRevisionId/branch及实际事件引用，核对选中action与原base。不接受caller自报receipt/actual值。只比较当前仍获准Player字段与所选S22预测，未选未来不参与误差或Outcome标签。S23自由文本没有机械可测claims时，modelPredictionError保持not_measurable，不能用text judge冒充事实误差。该typed comparison observation只引用原receipt，不另建事实/偏好writer。

准备、比较、hash/packing与核验沿原Run localWork，有界候选/goal/item/bytes；模型发送继续同一bank，失败/取消/晚到费用保持。临时comparison不能声称跨restart durable恢复；丢失来源时保持unavailable，不从客户端字段重建producer证明。

Project需要独立消费者：复用原Workspace串行evaluate/review/commit，注意evaluateWorkspace实际临时应用并finally恢复文件及preview handle，不能称为纯内存隔离。源恢复失败、并发读取、Preview清理与真实changeSet receipt须验证后才交付该域；Native schema不能冒充Project授权。

最小本地验证包括真实installed Session、候选公开/私有隔离、typed目标/选择与abstain、费用/容量/stale、选中proposal再次正式receipt与公开字段误差、未选未来不污染、model artifact伪造拒绝。实际双域决策收益需同任务/配置/质量底线的真实对照，缺外部发送范围或资料时保持pending。
