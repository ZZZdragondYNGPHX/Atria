# ARCH-DWE-01 · 最小类型与直接使用者改造

[唯一入口](index.md) · [实现分工](e0-preflight-execution.md)。W18-B 的最小差异／原生硬切方向保持；当前 **Draft / Paused**。下列是目标语义，具体字段复用原类型决定，不批量创建新资源。

## 类型分工

| 类型 | 表达什么 | 实现边界 |
| --- | --- | --- |
| Subject | Session 内持续世界主体，带 origin/scope | 稳定于共同分支祖先；改名／死亡／模板变化不换身份；新 Session 独立实例 |
| Participant | 某正式事件／对话中的说话者、行动方、观察者或交易方 | 引用 Subject 与实际事件；Narrator 引述不自动算 NPC 自主发言 |
| ActorProfile/Expression | 作者可复用的外观／声音／口吻模板 | 可选，不授予私人记忆、世界身份或执行权 |
| Perspective | 当前受权的主体／请求者视角、来源、用途及修订范围 | 原 Host/Information 授权；存在一个 Subject 不等于其可读 Narrator 来源 |
| Domain Fact | 所属领域的持续事实及变化来源／有效期 | 原 State/Event/History/Receipt；普通文学词语不全量结构化 |
| HCM Entity/LocalRef | 来源中的实体假设，或原 Lifetime/Goal 等领域标识 | 证据型映射；不因名字相同就等于 Subject，不覆盖原领域 ID |
| EffectiveRead | 指定合法修订、可用领域时间与受众的只读世界结果 | current/historical/law/claim/belief 分开，不成为可写事实库 |

## 同步改造的直接调用方

| 原使用者 | 实现变化 |
| --- | --- |
| `identity.js`／`contracts.js`／SessionCore | 只补真正缺失的身份／参与者字段与受控接纳；保留作者模板 ID 的原义 |
| Timeline／Frontend Host／session-projection／Play | 实际参与者、表达模板、玩家可见名称分开；更新消息 schema 与投影使用者 |
| Information/Cognition/ToM/HCM/Goal/Lifetime | 受权动态 Perspective、领域 LocalRef 与主体映射；每个消费者只读自己的来源 |
| World reducer／Authority／Task/Simulation | Subject 接纳、持续效果与原 Domain Receipt 对齐；不同提交不冒充原子 |
| History/Save/Branch/GC | 引用原主体／来源，支持合法历史与有效时间；无 Clock 不强制 Tick |
| Knowledge/Context/V3 ContextPort | 正式有效事实先于来源召回；旧文献可历史／claim 使用，不无条件当 current |
| PromptCompiler/SemanticBlocks | 消费原授权结果；不因为 target/Anchor/Role 变动改变事实或读权 |
| Speech/Visual/Illustration | 表象／模板与真实 Subject 分开，沿可见来源绑定；不由图片外观猜真身 |
| Library/Studio/Package | 自由文本与关键实体／规则／事实绑定、起点预览和固定资源闭包 |
| 旧 WorldInfo/Orchestrator 调用 | 随对应原生功能替换／删除，保留有效业务；不全局替换 `actorId`、不建立万能 SubjectAdapter |

这些改动按对应 WP 在实际使用者处完成。需要保留的当前外部合同按原语义处理，不为未发布旧格式建立兼容双写。
