# Atria Immersive Workspace — Record

- Task ID: `refactor/atria-immersive-workspace`
- Primary Workspace: `main`
- Status: Active — D1 complete; A1 implementation next
- Plan: [Plan index](../../plans/refactor/atria-immersive-workspace/index.md)

## Summary

本任务承接用户的“整理 Atria 前端界面”讨论。经 v0.2–v0.8 多轮交互原型和确认，2026-10-05 整理成新的 Plan Bundle 草案。旧前端重设计与 Native Frontend v3 的已完成历史保持不变。D1 已完成契约核对与范围冻结，产品工作尚未实施，S00–S20 均未进行本任务的集成验收。

## Stage D0 — Discussion consolidation and Draft Bundle

- Date: 2026-10-05
- Docs start HEAD: `eebb2a87a8936d64dc551df3c8bfae0bf3cace3d`
- Product read baseline / unchanged HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Package unchanged HEAD: `a13bce997`（仅恢复上下文，不承载产品实现）
- End/Tested docs content: 本 D0 文档提交中的 Bundle；没有对应产品 tested HEAD。
- Status: D0 complete; D1 review/freeze pending

### Completed

- 新建 9 模块 Bundle：index、决策、工作空间布局、原文能力基线、接线覆盖、共有状态、Native Persona、阶段交付、验证矩阵。
- 整理 D01–D20 用户已确认项，P01–P06 实施提议保留 Draft 标记，避免重新询问已确认偏好。
- S00–S20 映射新归属、源码控制器、结果边界、阶段与 V00–V20 验收责任。
- 复制原任务 `01-screens-and-actions.txt` 的 S00–S19 原文基线，明确其中布局建议由新 Bundle 覆盖；保留完整编辑器与高级 JSON/Source。
- S20 拆为 A4a 原生契约/持久化与 A4b UI/迁移/备份开放；覆盖 account、session、message、request、branch/save、shared seat 和 Host UI。
- 保护 package/main 的原有 untracked 项；未改产品 tracked 文件，未将 main 合并到 package。

### Source evidence and discussion history

原任务：`01a10777-5ad9-76b1-900d-9f53dbb5511a`；续接讨论：`01a107a4-a3f9-7ba3-9adf-47d1d0c2660f`。

独立讨论资产（非仓库产品输出）：v0.2–v0.8 HTML 原型与各轮状态；最新 `19-personas-v0.8.html`、`20-discussion-state-v0.8.txt`、`21-coverage-gaps-v0.8.txt`、`22-persona-reconstruction-scope-v0.8.txt`。用户提供了旧 Persona 管理截图和 [官方概念资料](https://docs.sillytavern.app/usage/core-concepts/personas/)。

v0.8 前轮实际证据包括组装/JS 语法检查、真实 IAB 的管理/身份选择、保存失败草稿/重试、历史身份保持、新会话默认捕获、迁移样例与原配置详情、归档恢复、390×844 布局和深色 picker；日志未读到 error。其限制为内存样例，无真实持久化、迁移、图片上传、模型请求、共享席位或完整会话隔离证明。D0 未重新执行上述原型测试，不把其结果算作产品验收。

### Validation actually executed in D0

- 检查 docs/package/main Git 状态；docs 初始 clean，main/package untracked 用户资产保留。
- 全文读取 repository Governance 和 docs 本地 AGENTS；按模板新建 Bundle。
- 核对旧正式设计 index/设计文件、原能力清单、Native 请求契约/Session snapshot/AssetStore 与测试执行配置。
- 文档检查脚本核验 9 模块、内部链接、源码/测试路径展开、21 coverage 行和 21 validation 行、原清单原文复制一致性。首轮发现 S13 两个错误目录，已更正后复验。
- `git diff --check` 检查新增文档空白问题。
- **未执行产品测试、lint、构建、模型实发或产品浏览器 E2E。**

### Key decisions

当前总体状态 Draft。用户已确认的偏好被保留，但没有把“继续整理”当作产品实施批准。旧全局 persona 设置不构成 Native 会话/请求身份 authority；原生重构与迁移是新增工作。

旧整站 SillyTavern 迁移退役与本次用户设定数据转换范围区分；旧角色/聊天/连接抽屉不恢复成平行主入口。资产/会话/请求映射不得凭名字猜测。

### Known limitations / next checkpoint

D1 必须核定 Persona schema/API、会话 namespace/CAS、请求 context 类型/过滤/预算证据、Shared/Host scope、旧 save/旧会话兼容、迁移 ledger 原子性与备份闭包。P01–P06 仍为草案建议，完整编辑器改造顺序也是建议。不能依据文档链接/路径检查认定产品能力成立。

下一 checkpoint：审阅并冻结整体实施范围；先补 D1 的具体契约/测试设计，再按批准阶段进入 A1。依 Governance 在当前 D0 阶段结束完成交接并停止，不直接跨阶段修改产品。

## Stage D1 — Contract audit and implementation freeze

- Date: 2026-10-05
- Docs start HEAD: `a66f2eb38`（本轮 fetch 后 fast-forward）
- Product baseline / unchanged HEAD: `783bb6fd30729263a97bb69842befcd1d25c1885`
- Product task branch: `refactor/atria-immersive-workspace`
- End/Tested docs content: 本 D1 持久化提交中的 6 个 Plan 模块、同一 Record 与 live HANDOFF；不自引用 commit hash。
- Status: D1 complete; A1 next

### Completed and authority

用户明确要求“拉取远端……准备开工”，随后要求遇到问题自行处理并简要说明。以此作为既有 Bundle 分阶段实施授权；D01–D20 不重开。P01–P06 作为实施选择冻结，不伪称用户逐项答复。B1–B4 沿用方案顺序，各资源类型仍是独立 checkpoint。

拉取远端，main fast-forward 到新语言基线，docs fast-forward 到本任务 Draft；在产品工作树创建同一任务语义分支。产品只有用户原有 AGENTS.md dirty change，没有本阶段产品源码改动。docs 原有 README.md/WEB-PERSISTENT-PROMPT.md/templates/HANDOFF.md/templates/RECORD.md dirty changes 保留且不提交。package/plugin/skills 未改；未读取任何 reference 工作区。

### Contract findings and frozen design

- Persona 尚无 Native ID/kind/validator。新增专用 kinds 经已有 Native Storage 注册，不误用只接收 Prompt 资源的 VersionedJsonResourceHandler；冻结 root/revision/default/receipt、exact ref、CAS、API/错误/内容与头像限制。
- FS withTransaction 不提供跨文件回滚。迁移采用 prepared → 资源发布 → receipt 的逐项恢复账本，source/plan digest、预分配 ID、失败重放与默认独立 CAS；不承诺整批回滚。
- Session namespace/revision/Timeline authority 可复用，需新增 protected atri_player_persona、服务捕获输入身份和并发重验；旧 revision 不回填。
- retryReply 的 post-user fork 与 typed transaction 的 pre-effect + 新建输入路径不同。后一条目前只重建 authority retry metadata，A4a 必须保留原输入身份/快照，Provider retry 则固定已捕获上下文。
- typed task context 当前只有五种来源；Native Context lane/provider/Prompt consumer/host task filter/effective request evidence 都需接线。player persona 显式 opt-in、player_provided authority，不混入世界事实，notes 不发送。
- Shared member/seat/scope/epoch 和 Host 白名单可复用，但无 Persona 功能。冻结主体自行选择、授权头像副本/私密投影与显式 Host picker capability，保留独立宿主恢复。
- Save v1 snapshot/session、v2 resume 继续读取；有 Persona 的新 Save 使用 v3 并补头像闭包/容器校验。账户备份复用 native/native_resources/nativeBlobs/现有 manifest，默认恢复独立审阅，不新建备份服务。
- legacy Persona JSON 实际无版本号，仅三个顶级数据项，无图片/聊天绑定。支持该准确来源，未知版本/宏/绑定/缺图明示 pending 并保留原文，不生成假完整恢复。
- Native play 当前 modifier+Enter，旧设置有 -1/0/1 和 legacy AUTO 平台差异。P01 冻结 Native AUTO 保持换行、显式设置生效；A2 加 IME/Shift/modifier 测试，不改旧保存值。

schema/API 与测试责任在 personas/validation 权威模块中维护；Record 不成为第二份字段定义。新增 C20.1–C20.8 是未来测试目标，没有测试文件或通过证据。

### Validation actually executed in D1

仅本地最小相关验证：核对上述直接相关源码的实现/函数/注册，检查变更文档内部链接、源码证据路径、21 coverage/21 acceptance 行、P01–P06 与 C20.1–C20.8、Plan/HANDOFF 阶段一致性，并执行仅针对本任务文件的 git diff --check。检查覆盖当前 D1 文档内容，不验证新契约可运行性。

未运行产品 unit/E2E/lint/build、真机/IME、模型实发或远端 CI。用户要求每阶段及任务完成时仅本地最小相关验证；validation 已按此更新，不发起/等待远端 CI。

### Limits / next checkpoint

A4 新增契约均待实现；MySQL/Postgres 注册路径仅静态核对，未运行引擎；共享跨账户资产与 Save v3 尚无兼容证明。A1 不提前开放 Persona 占位入口，不替换编辑控制器，不运行 A4 测试。下一 checkpoint 按 index 路由读取 experience/states、coverage S00/S01/S18/S19 和 validation，实施外壳、导航/搜索、认证/学习、设置/全局诊断。

依 Governance 在正式 D1 阶段完成持久化与交接后停止，本轮不跨入 A1。

## Final state

Task ongoing. D1 design frozen and staged work authorized; no product implementation, integration or release accepted yet.
