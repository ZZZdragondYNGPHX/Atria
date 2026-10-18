# S04：Project 持久任务、轨迹与恢复

本阶段只扩展现有 ProjectAgentService / StudioService，不新增执行或 Project authority，S05 的反馈与 retention 能力由 [s05-feedback.md](s05-feedback.md) 独立管理。下列是已授权范围内的工程细化。

## 持久 schema 与 key

新增 `atri_project_agent_task`，key 为 authenticated handle + projectId + taskId；taskId 沿用 `agenttask_*`，不迁移现有 Project ID。owner 只来自 storage key。

单条 task 限 2 MiB JSON、1024 timeline events、128 attempts、128 conversation messages；达到边界明确失败，不静默截断已保存证据。沿原 StorageEngine native kind 的 FS / SQL key、list、dump / restore、迁移与 deleteUser。Additive kind，无 DDL / backfill / 存储版本升级；旧内存任务无法凭空恢复，原 Studio / Project source 不变。

公开 service API 改为异步，HTTP 与 source consumer 一并适配；FS 支持单 Host writer，不声称跨进程或 Project Git / StorageEngine 的整体事务。

## 尝试与对话

generation attempt 从标明 `client_observation` 的浏览器 facade marker 开始；Host observation 无客户端写入入口，不推断 upstream 内部 retry / missing total / 费用或真实质量；legacy 请求没有该关联则明确缺失。Host outcome 保存失败返回独立 capture failed 状态，不重发已经返回的 generation。未知 usage 为 null。

generation 开始前保存 marker；完整 round 的公开对话按前缀追加，未知 attempt / 旧 sequence / rewrite 拒绝，关闭页面后仅显式 Continue 继续。

conversation 只保存 user / assistant / tool 的公开接口消息，拒绝 system、credentials 字段或 providerState / opaque reasoning。对话与 task 操作状态分开；未结束的 round 保留之前完整前缀，成功 tool proposals 仍在 task authority 中。恢复模型输入将历史 tool messages 转成公开 observation 文本，不重放缺失签名 / opaque state 的 provider tool history；同一次 live loop 继续保留原 providerState。不得从前端消息重做 operation / commit。

## 正式 receipt 与恢复

commit 前先持久化 exact Workspace 和 host 生成的 changeSetId。receipt 与 Project source 属于同一次 Git commit；原 operations / origin 来自 task 中已固定的 Workspace。空变更也保留一次正式 receipt commit。

超限时恢复原 source，回到 Review，不能产生存不下的正式结果。

唯一匹配才能重建 resultingRevision 与 changeset。task 保存失败或响应丢失后，相同 Commit 返回该正式结果，不重复 apply；后续 human revision 不改写已经完成的历史 receipt，但 S02 currentness 继续失效。Git 已提交后异常不得 restore 旧 source。

没有 receipt 且 HEAD 仍是 base：回到原 Review，仅用户再次显式 Commit 才可提交；HEAD 改变、证据损坏 / 多义 / 超出历史界限：conflict，不自动 rebase / replay。evaluating 中断：转 repair / blocked，旧 Preview handle 只作历史观察；其他未完成 task 遇到过期 baseRevision 进入 conflict；

项目不存在时 task consumer 返回 missing；显式 task 删除走原 deleteResource，Project HTTP 删除同时清除该 Project tasks；用户删除保持原 engine 语义。read-only 禁止新 task / mutation / recovery 持久写；撤回 consumer / kind 注册即可，历史资源不要求破坏性转换。
