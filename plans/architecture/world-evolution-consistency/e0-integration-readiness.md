# ARCH-DWE-01 · 跨任务接口归属

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md)。当前 **Draft / Paused**，先等待用户指定的编排、提示词与整体前端工作完成；不等待无关分支或自动恢复。

| 接口 | 谁负责 | 世界重构如何接入 |
| --- | --- | --- |
| 正式事实与 Receipt | 原 Native Domain/SessionCore/Repo | 增加最小 Subject admission、必要事实来源与原发布协调 |
| Plan/Run/Effect/预算 | 原 V3 Host | NPC/Task 提案走原执行通道，效果回原 Domain；不把 Run Ledger 当世界数据库 |
| Source/Audience/Grant | 原 Information 与 V3 ContextPort | 动态 Perspective 接入同一授权，世界结果作为合法来源 |
| Prompt Program/IR/Provider | 提示词企划的原 Compiler/Host | 提供 current/historical/claim/belief 元数据；不复建排序或编译器 |
| Save/Branch/History/Retention | 原 Session/Save/Domain History | 把主体与必要事实引用加入原闭包与历史读取 |
| 图像／语音 | 原 Visual/Speech/Asset | 提供可见参与者与表达引用；Job/Asset 仍归媒体领域 |
| Shell/Library/Studio/Play | 全产品统一前端与原领域 UI | 复用完成后的组件／导航，扩展世界正文、绑定、预览、档案／历史 |

恢复后在实际整合后的代码上处理这些具体接线；旧 main/V3/Prompt/Visual SHA 只用于读懂 Record，不能当当前 API。若某原接口已经改变，就同步对应使用者，不复制旧实现、不为两个时点造长期适配层。

字段命名、合法引用复用、普通代码冲突属于实现工作。只有实际超出功能范围或改变已确认语义才另提取舍。
