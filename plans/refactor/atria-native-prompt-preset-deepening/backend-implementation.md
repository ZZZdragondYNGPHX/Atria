# 后端实施与前端交接边界

> 2026-10-16 用户已授权 D2–D8 原 Prompt/Behavior 后端；既有分支 `refactor/atria-native-prompt-preset-deepening` 已有局部实现与有限验证，前端原由 Claude Code 负责。2026-10-18 用户明确要求九轮增量企划**自主收口**、后续在 Codex 正式实施；本文件是原工程接口与新增合同的唯一交接补充，不在当前对话中改源码或合分支。最新固定 HEAD/19 个共改文件及工程 Gate 以 [E0 §9](e0-audit.md#9-2026-10-18-企划收口与-codex-交接审查) 为准，不冻结外部视觉草稿的样式/提案。

## 权威与依赖

原 PromptCompiler、RouteResolver、GenerationService、Context/Information/Memory、Experience/Eval、PromptCandidateStore、Storage 仍为唯一领域实现。V3 在自己的活跃任务分支开发，不能把测试注入 hook 当生产接线，也不另造 Plan/Run/Effect/Binding authority。

本次开工授权更新此前 docs-only / NOT_AUTHORIZED 限制。E0 **实现验收**仍未通过；允许推进冻结语义下的后端实现，不把开工写成全量 E0 PASS。实际结果归同一 Record 与 E0。

## 物理合同决定

| 合同 | 实施落点 | 边界 |
| --- | --- | --- |
| C1 独立 Program | 原 Resolver/GenerationService 的可信调用参数，与请求 JSON 分离；原 Host 验证 exact Program，Route 继续管 Model/Connection/Generation；fallback 重编译/计数 | HTTP execute 不接受 Browser Program override；V3 ModelPort 生产接线归原 V3 |
| C2 Typed semantics | 原 Compiler 产出有序 SemanticBlocks，保留 source/provenance/位置/证据类别；事实、Persona、Memory、Tool 不借 ContextSlot 成为 system 指令；原 Provider render/count/send 共同消费 | 版本化作者模块与 Host policy 可为指令；history 不接受 system/developer 冒充 evidence；不支持仍拒绝 |
| C3 Source currentness | 原 ContextProvider / Host 复验，在 compile、preview return、Secret resolve 后及每次实际发送前使用；固定分支、Source、授权与资源依赖 | 不发明 grant，不用 hash/TTL 代替权限；V3 Audience/Disclosure/Join 仍依赖原任务接线 |
| C4 Draft Preview | 认证 Host 只读 `/preview/draft`，有限 exact 基础资源及同身份草稿替换；原 reader 验 owner/revision/closure，同 Compiler/Provider，无持久化/Secret resolve/send | 草稿不增加读取权、不伪造 Package ownership、不覆盖 execute；回包分 authored/effective/wire 与版本身份；diff 只比较同一受权 source/route/compiler |
| C5 Quality/Evolution | 原 QualityProfile 的不可抵消硬约束、多维/unknown；原 reviewed catalogue 的开发与独立 promotion 分账；扩展原 Candidate/Publication | 缺独立来源保留 source_unready，不伪造审阅、校准/质量收益；plan-prompt 必须用 V3 immutable revision / binding CAS / journal |
| C6 删除/恢复 | 原 ResourceGraph/lifecycle 追踪 exact refs；只读草稿不产生 GC root 或第二存储 | V3 pin/recovery/Storage 按原权威验证，不能无引用证明直接删资源 |

**追加设计与既有接口的对齐**：九轮选择统一归原 Program/Stage/Module/Compiler/PromptIR + Host/Context/Provider/Library/Project；显式 Stage/同 target Module/Anchor 一份顺序权威、exact parent/derive、新版 Stage schema、Context Contribution 动态排序/去重与合法权限仍需 Codex 依据真实 `contracts.js` / `prompt-compiler.js` / `prompt-module-order.js` / `package-freeze.js` 决定具体字段和硬切方式，不能留 `priority` 与新作者序列两套排序。新版名义上的“官方模板、离线发行、独立作者 Preview/试读、视觉独立资产”是设计期范围，既有 `/preview/draft` 仍限可信 exact 基础资源而非任意无 Session fixture。原 D7 `source_unready` 是有效阻塞，不为质量标签伪造数据；Visual Prompt 归 `ImagePromptIR` 与原 Visual Job/Asset，不升级成新的文本 Compiler。

**跨任务集成约束**：Prompt 与 V3 共同祖先 `695acf3bc`、固定 HEAD `760327891` 与 `a3aa5264b` 的完整树有 19 个同时修改路径（详 E0 §9.1）；受信 `programSelection` / `draft-preview` / Typed lowering 与 V3 `GenerationHost`、quota/bank、Scope/Audience Context、Receipt/Result、Native Evolution 的并集必须在真实三方合并和消费者测试中证明。**不能**因为某条历史 `/preview/draft` 或 V3 有限 Profile 用例通过就立即合并到 main、清掉别人的工作或伪称最终通过。

## 实施与交接

1. **开始前**读取仓库治理、当前 `main`/Prompt/V3 分支、同一 Plan/Record、原 V3 acceptance/backend-integration 和 E0 §9；确认当时 Gate、真实 HEAD 与工作树。先进行三方集成预演，不直接覆盖另一分支。当前用户决定后续在 Codex 启动，本次交接不自行创建产品任务分支。
2. 处理 V3/Prompt 既有 Program/Route/Context/Provider/Source/Runtime/候选重叠改动：保留两边有效的 Source/费用/错误/取消/恢复权益，按最新原生产消费者和相关用例解决物理差异。
3. 依真实代码为显式 Stage/Module/Anchor 排序、Parent exact 增量继承、Contribution 选择/去重、Typed Trust/Provider Lowering 建立单一原生合同；连同 Compiler/Preview/Package Freeze/Library/Export/Evolution 真实消费者一起验证。
4. 同源扩展独立 Library 提示词作者和 Game Studio 资源复用、Host 非 Session 有界测试 fixture、手动付费试读、Trace/精确 Diff；加入少量可编辑官方任务模板、离线作者发行闭包/本地映射/升级 CAS，不替游戏作者强制编写 Prompt。
5. 原 Quality/Eval/Promotion/PlanBinding 原权威收口；Visual 独立 Prompt 相关非 Session Job/Asset 需按真实视觉领域确认接口与任务归属，不用假 Session 或第二 Visual Store。前端继续按原全域 189 组与审美正式批准状态接线。
6. 完成各项实际生产 Gate/失败修复与最小相关测试、跨分支合并回归、权限/预算/版本/恢复/真 Provider 可运行时证据、Windows/CachyOS/Termux 真正可得端侧证据，再更新同一 Record/E0 和源代码 API；NOT_RUN/UNKNOWN 保留而不能称 PASS。Code/Docs 的提交、集成与清理按仓库规则执行。

零 ST / 旧 Workspace / 旧 Agent Director 兼容继续生效。旧容器中的 Memory/Goals/Experience/Visual Director 等原生能力必须保留；V3 替代未接通时不能把清退写成完成。HTML 未展示的功能仍按审计与冻结合同实现。
