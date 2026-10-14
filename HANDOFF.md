# Native visual generation deepening — live HANDOFF

## Task

- Task ID: `atria-native-visual-generation-deepening`
- Repository: https://github.com/ZZZdragondYNGPHX/Atria
- Primary Workspace: `main` 产品源码；Plan/Record/HANDOFF 在 `docs`，不得合并 docs 与 main。
- 用户于本轮明确要求“找个合适的时机停下，我要打算新建对话继续”。停在 S5 已提交/已验证的节点；S6 只开始审查，没有新增代码。
- Main worktree: `/home/henry/Projects/Atria`，`main@7e1045ab836c22cafbc92c5de056ad701f56e723`，本地干净。
- Source worktree: `/home/henry/Projects/Atria-worktrees/tasks/atria-native-visual-generation-deepening/source`
- Source remote: 已确认 `origin/feat/native-visual-generation-deepening` 与本地 HEAD 一致；TLS EOF 后重试推送成功。
- Source branch / HEAD: `feat/native-visual-generation-deepening@5c8131e67c380d07a699bb6fc4c75414d417af3d`，本地干净。
- Docs worktree: `/home/henry/Projects/Atria-worktrees/docs`，branch `docs`。文档更新 HEAD 以本交接提交后的真实 Git 为准。
- Stage: S0–S5 已逐阶段实现和记录；S6 审查刚开始，最终冻结范围审计/验收/合并尚未完成。
- Plan entrypoint: [index](plans/feat/native-visual-generation-deepening/index.md)
- Frozen authority: [decisions](plans/feat/native-visual-generation-deepening/decisions.md), [E0](plans/feat/native-visual-generation-deepening/e0-closure-audit.md)
- S6 modules: [delivery](plans/feat/native-visual-generation-deepening/native-contracts-ui-delivery.md), [media precision](plans/feat/native-visual-generation-deepening/media-precision.md), [provider matrix](plans/feat/native-visual-generation-deepening/provider-editing-matrix.md)。修改连续性/参考图时读 visual-continuity.md；其它按索引路由。
- Record: [唯一正式 Record](records/feat/native-visual-generation-deepening.md)

## Completed

- S0 `5b7b21edd`: SourceRef/IR/Capabilities/中立非秘密 Evidence schema 2、版本化 Target/Rendering、dev hard cutover。
- S1 `8cdc38bb6`: Native resources 持久 Job/Attempt、预算 CAS、lease/fence、未知提交不重发、媒体 DAG/Save/GC 基础。
- S2 `4d9aaf979` → `b8cbf6a2c`: 先 NovelAI Native 垂直切片，再 ComfyUI/OpenAI Images。Native Session/Runtime/Secrets/AssetStore/SavePoint 复用；无旧新执行双通道。
- S3 `1dd6e05da` → `33d602d85`: Actor/时点状态/披露、跨提交 Scene/Shot、低成本评分和按需 Director LLM、manual/semi/automatic，Planner/Image 双账。后者修复历史 Source context 与实际当前 execution admission 的分离。
- S4 `5985d3ddfbf1decf1991c3db0dfd12c13109f6fe`: 原像素 gray8 Mask/命令/检查点/CAS/触控草稿，统一编辑管线，原始结果与显式 composite 双版本，分页 Gallery/选择/参考晋升、双扫描宽限 GC、可编辑闭包。ImageVersion 独立内容寻址 `atri_visual_image`，`atri_illustrations` 存 manifest 引用。Reference 权威在 Native presentation snapshots。
- S5 `5c8131e67c380d07a699bb6fc4c75414d417af3d`: Gemini 原生图像/语义编辑；WebUI/Forge 实际目录/API/扩展探测、LoRA/ControlNet、编辑/放大；RunningHub typed full Workflow、上传/Task ID/查询/恢复/取消、受限 CDN 无凭据下载；显式 Adapter 注册扩展。
- 产品合同和官方协议出处在 source 的 `docs/native-visual-generation.md`。

## Local validation

- 按用户 AGENTS 指令：每阶段及任务完成仅最小相关本地验证；没有启动远端 Actions CI。
- S4: `visual-media.test.js` 17/17；`visual-p0-adapters.test.js` 7/7；`illustration-core.test.js` 19/19；renderer 3/3；durable slice 10/10 在早期相关 S4 run 通过。受影响产品 ESLint/diff check 通过。失败/修复详情见 Record。
- S5: P1 22/22、kernel 9/9、P0 7/7，合计相关 run 38/38；最终 HEAD 加 aggregate-input guard 后 P1 单独复测 22/22。产品 ESLint/diff check 通过。
- Jest: `node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand <相关文件>`，在 source worktree 执行。
- source 的 ignored node_modules、tests/node_modules 是指向 main 既有安装的 symlink；不得删除或修改实际 main dependencies。
- L3 全部 `not_run`，没有真实合法 Provider 凭据/明确付费授权，也没有付费生图。fixture 使用 synthetic-secret，不能当 live 证据。
- 当前机器 `/etc/os-release` 为 CachyOS；环境 `XDG_CURRENT_DESKTOP=KDE`、Wayland。Node/FS/SQLite 验证已在此主机运行。浏览器 UI 尚未运行；Windows 和 Android Termux 真机 `not_run`。
- 已读 playwright-cli skill（`/home/henry/.agents/skills/playwright-cli/SKILL.md`），二进制 `/home/henry/.local/bin/playwright-cli` 可用，但本任务未启动浏览器/应用。新对话应用技能时按当前技能规则告知。
- 交接时没有活跃 Jest/Provider/浏览器进程；仅 Git 同步可能短暂运行，完成状态需核对。

## Key decisions / invariants

- 严守 D-001～D-013 + E0；S6 完成后才可按 Governance 合并 main、推送并删除完成 feat。此次没有合并/删分支。
- Source 是正式祖先 Revision/Branch/精确 UTF16 anchor/hash；图片不改 World Truth/正文；结果仅入历史，显式选择 CAS 才更换展示。
- Native Job 为持久权威，Scheduler 只执行；未取得远端 ID 的未知提交绝不重发。已知 ID 只 query/reconcile。取消不宣称退款。
- 正式 SavePoint 完整可编辑。Ironman 仍 head-only Narrative：保留不可变视觉 Source/Evidence，以经过校验的 originalAnchor/sourceProof 表示 presentation alias；缺历史时只许可冻结公开视觉 packet，不伪造历史 World。已有 core ironman 验证通过，但生成/编辑/再次导入闭环还需 S6 加强。
- NovelAI 官方 OpenAPI 要求人类发起，自动无人触发生图拒绝 `native_visual_human_initiation_required`，人工/semi 正常；此官方限制已记录到 Plan matrix。
- NAI V4.5 precise + Vibe 不兼容；Vibe encoding 当前 unknown/拒绝，绝不隐含付费。V5 仅明确 Full 协议，Medium effort 没有实现/验证，不得称完成 live。
- Gemini 是语义编辑，Canonical Mask/strict Mask/upscale unsupported；OpenAI 的 Mask 不保证原像素保留，可显式另存 composite，有接缝/同尺寸限制。
- Capabilities 为当前 Adapter 的 protocol/local probe 声明，不信任编辑 capability JSON。L1/L2 不冒充 L3/艺术效果/模型兼容证据。
- 不建立自己的测试配额/阶段人工审批。新对话恢复后原完整开发授权仍有效；此次暂停不是下次新的 S0 起点。

## Pending — S6 audit findings / next actions

以下是刚读代码确认的缺口或待验证点，**尚未修改**，不可从旧阶段“completed”推定最终全范围已验收：

1. Annotation Target/Rendering override：resolver 有四层顺序，但 `annotation.imageSelection` 目前未加入 annotation contract/update API/UI；单次生图 UI 也缺 Target/Rendering override。补齐受 CAS 的保存、显示继承来源，并测试旧 Job/Evidence 不随新配置改变。
2. Workflow 产品 UX：`visual-configuration-ui.js` 目前只有高级 JSON。冻结文档要求导入 API JSON、可视绑定/校验 slots；补导入与映射，不要求普通用户手写替换字符串。Rendering 当前只有创建 UI，应检查编辑/CAS/约束降级体验。
3. 长会话性能：虽然持久化已规范化，Session/illustrations read 和 Job status 仍返回整个 materialized history；Official card eagerly builds evidence pre。`visual-gallery.js` 对每图调用 `media.image`，重复读取整份 presentation/Source，可能平方增长。做可重建/非权威轻量 presentation、按需 history/evidence、Source/annotation 校验复用，最小规模证据；不要丢完整 Save/DAG/GC 根。
4. References：当前分支快照权威；`allowedBranches`/standard grant 已有字段，但 post-fork 标准图共享/跨作品机制不能仅因字段存在就声称完整。`VisualContinuity.references` 当前重绑定 ref.source.branchId 为目标 branch，可能拒绝合法独立标准图；Media.prepare 只从当前 state.references 找 ID。按冻结标准身份/用途与显式授权补齐或精确记范围，禁止其它分支 outfit/state/剧透混入。Reference Save source/asset hash/attachment 需继续审计。
5. Provider combos：WebUI/Forge 目录存在并不证明 SD 模型家族匹配；Comfy/RunningHub typed reachable nodes 已检验，但 exact installed version/真实组合效果尚无 L3。所有未知 required 保持 fail closed。检查未实现 NAI Vibe/精确协议子项是否符合冻结矩阵，不伪称 live/full native feature。
6. UI：读 playwright-cli 并用隔离本地 fixture/app 做桌面/移动 viewport、触控/键盘/CAS/错误/恢复/审批/版本选中检查。当前实际 CachyOS/KDE 环境可取得浏览器证据；仿真手机不等于 Termux 真机。补 Windows/Termux endpoint/路径说明。仅在关键外部设备证据确不可替代时说明所缺条件，其它继续做。
7. Mask 保存竞争：checkpoint 同步期间撤销/改写前 50 命令已有冲突保留；fork 保存期间仍可绘制，需检查是否把更新中的像素标成已保存。范围/命令上限、scope、multipart 认证前解析与错误卫生需验证。freezeMask 服务现在仅 draftId/revision；检查 scope/API ownership。
8. GC：root 扫描目前保守保留全部 atri.visual.*（排除 gc 和过期 prepared）。冻结 Mask catalog/历史 draft/checkpoints/terminal jobs 可能永远保护暂存 bytes；需要审计显式 discard/宽限/租约，不能直接删仍可达正式资产。`NativeSaveSystem` 已使用 acquireSessionReadLease，AssetStore 有 read lease，不要未经检查再造并行 lease 真相。
9. 保存/安全：补实际生成 → Mask edit → SavePoint/export/import → 再编辑的 ironman alias 闭环、缺父/Mask/Reference/hash/恶意归档、late-job/source/branch、预算/Secret/输入上限最小验证。展示级 compact export 当前没有提供，禁止冒充正式 full save。
10. 可审计实际传输：当前冻结请求存不可变 asset descriptors + SHA；hydrated wire 大字节在 Adapter 瞬时转换。复核 E0 Attempt/approval/actual request fingerprint 证据槽位是否都充分；如补实际 wire hash，不可持久 API key/Base64/签名 URL，不可假造 Actual cost。
11. 完成 S6.1～S6.4 和可取得验收后更新同一 Record/必要 Plan，核对真实 main 未被其它任务改动，Governance 本地合并/push/main和 docs 分开同步，删除本任务完成 feat/worktree 和 live HANDOFF。此处不提前合并。

## Read first / do not repeat

1. 本文件 → docs README Governance → 最新 Git/worktrees → Record → Plan index/decisions/E0 → S6 模块。
2. 不重做 S0/S1、不创建新 feat、不把 docs 合并 main、不误触另一个 `feat/atria-project-skill-routing` 或 package/plugin worktree。
3. 不跑全仓库重复测试或远端 CI；仅必要相关本地验证。
4. 不读取/打印实际 Secret、不自动付费、不把 fixtures 或已冻结设计文档当实际设备/模型通过。
5. TLS EOF 曾导致 S5 source push 失败；普通网络错误可以重试，确认 origin feat 真 HEAD，不能按“已提交”推定“已推送”。

## New-chat bootstrap prompt

继续 Atria 完整任务 `atria-native-visual-generation-deepening`。先读 `/home/henry/Projects/Atria-worktrees/docs/HANDOFF.md`、Governance、Record 与冻结 Plan，检查实际 Git/工作树和远端 HEAD。复用现有 `feat/native-visual-generation-deepening` source worktree，当前产品 HEAD `5c8131e67c380d07a699bb6fc4c75414d417af3d`。S0～S5 已逐阶段实现/本地验证，S6 刚开始审查且尚未改代码。按 HANDOFF 的具体缺口继续完成 S6 和最终冻结范围审计，只做最小相关本地验证，L3/真机缺资源标 not_run，不自行付费。原用户授权连续推进仍有效，阶段间不等待确认。完成全部可取得验收后按 Governance 合并/push main、更新 docs Record，删除完成 feat/live HANDOFF；不合并 docs 与 main。
