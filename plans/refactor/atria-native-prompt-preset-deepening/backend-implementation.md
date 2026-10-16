# 后端实施与前端交接边界

> 2026-10-16 用户授权正式开始，范围包含 D2–D8 全部 Prompt/Behavior 后端；前端交给 Claude Code。沿用本 Bundle 和唯一 Record。这里确定工程接口，不冻结外部设计稿 §8.4 的提案或视觉。

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

## 实施与交接

1. 编译语义、信任降权、来源证据。
2. 可信 Program selection / fallback 与消费前复验。
3. 未发布 Draft Preview、同源三层差异及 HTTP 负例。
4. 原质量合同与候选链实施；未接通的依赖逐项记录具体原因。
5. 更新同一 Record、E0 与产品 API 文档。
6. 完成独立工作后按用户要求交接 Claude Code：实有接口、状态/错误、缺口与完整功能范围，不能用 mock/HTML 销账后端阻塞。

零 ST / 旧 Workspace / 旧 Agent Director 兼容继续生效。旧容器中的 Memory/Goals/Experience/Visual Director 等原生能力必须保留；V3 替代未接通时不能把清退写成完成。HTML 未展示的功能仍按审计与冻结合同实现。
