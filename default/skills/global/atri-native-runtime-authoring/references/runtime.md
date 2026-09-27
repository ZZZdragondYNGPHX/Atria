# 运行时设计检查

## Turn 和 Task（P2–P3）

读取 catalog `messages` 和 `tasks`。区分 Turn envelope、canonical message、选定 Variant 与展示 receipt。Task 的输入、结果策略、binding slot、Variant 必须匹配声明；不要把任意模型 JSON 当作通用 state patch。authority-first 与 narrative-outcome 按实际结果契约处理，不能靠 prompt 假装事务成功。

## Session App / Workflow / 时间（P4）

读取 `lifecycle`。Domain、Command、retention、scope、workflow 与逻辑时间属于版本化声明。App 写入走 typed Command 和 expected revision；不要创建第二套 Session state 或独立 scheduler。logical time、World time、真实墙钟与 Host 活跃 elapsed 不是同一个值。恢复只恢复声明和权威状态，不恢复旧 provider stream。

## Activity（P5）

读取 `presentation` 的 Activity 输入、outcome、settlement 和 Narrator 声明。设计 start/pause/resume/settle/cancel 的合法转换；结算通过一个已声明 App 或 World Command。先原子提交事实和 narrative handoff，再运行指定 Narrator Task/Variant。Observation 绑定真实 Revision/Branch；叙述只生成文字，不能再次结算或修正事实。

迟到结果需匹配 run/scope epoch。取消叙述不擦掉已提交 settlement。重试保留原 invocation/receipt，不新建一次结算。恢复后的 resume 显式进行；挂载时长不能充当权威时间。以 catalog 中的硬限制为准，不用无限 retained records。

## Scene / Host（P5）

Scene 是受限 Cue IR，经同一 UI renderer。AssetRef/Asset Pack 使用精确 hash/size/版本闭包，或合法 selected-Variant attachments。caption/speech 是文字，不解析为脚本。不要把远程 JS/HTML 嵌入 Package。

明确 required/optional Host 能力和降级：Ready preflight 不通过时不能假装可运行。fullscreen/speech 等遵循用户激活；媒体、计时器、焦点、订阅在 scope 失效/卸载时释放。自动测试不能证明扬声器、声线、摄像头、手柄或多设备实际可用；这些证据独立报告。
