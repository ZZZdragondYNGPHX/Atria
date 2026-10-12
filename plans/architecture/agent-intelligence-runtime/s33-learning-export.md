# S33：本地元数据学习轨迹与离线消费者

首批范围沿 S03–S06/S10 已交付的 Evidence、Experience、原 owner/source authority。显式请求只导出当前可取得的公开元数据用于本地离线分析，不扩展正文、私有 reasoning、Secret 或外部发送；不建立持久数据副本或训练 ledger。旧 Experience export 保持兼容。

版本化轨迹区分 observation/action/outcome/receipt/preference/reward。仅原 explicit、origin=user 的有效反馈可以标作人工偏好；technical、assessment、diagnosis 保留派生来源，不转为人工真值或自动数值 reward。无法从原 authority 取得的字段明确 missing/null；技术完成不等于用户偏好或模型质量通过。

每次导出重新核实 owner、scope、原 sequence、source current 和 feedback 状态，删除、撤回、纠正、过期或源变化会影响下一次导出。已下载的外部副本无法由产品自动撤销。读取有界，读取期间源或 sequence 变化拒绝旧结果，不将 caller 自报正文/owner/标签当 authority。

真实离线 consumer 读取导出的 JSON，严格校验版本、标签来源与缺失，统计覆盖，并按同源 family 分组切分，避免同一来源跨 development 与独立验收。仅分析，不调用模型、不训练、不自动晋升。S34 的真实后端、独立评价与可撤回产物仍另需实际证据；该离线出口不能代替训练验收。

针对性验证覆盖认证、双域原持久消费者、删除/撤回/过期/源变化、并发 freshness、缺失和派生标签、同源切分，以及离线文件实际读取。工程结果归同一 Record。
