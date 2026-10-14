# Atria MCP 补强｜Package / Library / Media / Skills / Extensions（第八轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；Primary Workspace 为长期独立 `plugin` 分支中 `atria-mcp/`；Plan 位于 `docs`。
- **冻结决策**：2026-10-14 第八轮选 **B：分域完整控制 + 统一安全二进制资产通道**；本页是**待实施设计**，不是代码和测试结果。
- **静态审计源**：`main@9241325a7290e613e0fdaaa1870409105c161c89`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。实现前重新检查真实 HEAD、Method、参数、Result Schema。
- **依赖**：[index](index.md) · [P0 reliability](p0-reliability.md) · [能力矩阵](capability-matrix.md) · [Studio/Agent](studio-project-agent.md) · [Runtime/Provider](model-prompt-runtime-provider.md) · [Session/Save](session-save-generation-lifecycle.md) · [Browser UI](browser-ui-semantic-interaction.md)。

## 1. 已冻结的总体模型和不变量

1. **分域完整控制，而不是第二套产品内核**：MCP 对 Package、Library、Resource Graph、Resource Bundle、Visual/Image/Media、Speech、Runtime Skills、Browser Extensions、Host Plugins、Package Runtime Plugins 提供审过的语义 Action。真实版本、状态、预算、发布、恢复由 Atria 原生权威管理，不建立影子 PackageRegistry/MediaStore/SkillRepository/PluginHost。
2. **共享底层字节传输，不共享业务授权**：通用 Binary Asset Lane 负责限定来源、SHA-256、分块完整性、限制大小与归属；Install、Import、Provider Send、正式 Publish、Activate 分别需要符合其领域权限、批准和 Native Receipt。数据 Handle 本身绝非写入或网络外传许可。
3. **精确身份及失效**：Package `packageVersionId/contentHash`、Project `baseRevision`、Library `scope/type/id/revision`、Media `session/branch/imageVersionId/expectedHead`、Mask `draftId/expectedRevision`、Skill `scope/name/version/hash`、Extension `source/revision/manifest/targets`、HostPlugin `manifest/permission/dependency` 逐项绑定，不同 Scope 或过期版本绝不共享旧授权。
4. **权限是交集**：ActionRegistry + PolicyCeiling + 可信用户审批/Lease + 产品原生 owner/Scope/Revision/CAS + Provider/Asset externalEffects；模型传来的 `confirm`、Package/Skill 文字、插件页面按钮以及 HTML/JS 评论均不能升级权限。
5. **业务执行与观察分离**：有原生持久写入或收费副作用的 `scan/prepare/describe/inspect` 按实际效果升级风险；不能根据名称/HTTP Method 假设 READ。结果未知不重复发送外部费用/安装/发布。
6. **用户未显式授权不自动运营**：MCP 不默认开启自动画图、Plugin 自动启用/更新、Skill 自动发布、Package 自动安装；已存在有效产品自动策略遵守其 Native Budget/Permission。
7. **保持分支边界**：产品内置 Runtime Skills/Browser Extensions/HostPlugin/PackagePlugin 与长期 `plugin` 开发工具及长期 `skills` 仓库 Agent Skill 副本是不同对象；不混合路径、角色、权限。生图深化项目未来变更要以实际 `main` 权威为准，不由 MCP 创建平行媒体格式。

## 2. Package / Library / Resource Graph / Resource Bundle 完整能力

已观察的产品权威：`src/native/authoring/{resource-graph,library-service}.js`、`src/native/resource-bundle.js`、`package-{composition,container}.js`、`repositories/package-repo.js`、`endpoints/native-{studio,product}.js`。旧 MCP `atria-mcp/src/high-risk.js` 已提供 Package Capture/Build/Inspect/Preflight/Review/Install 及限制性删除。

| 候选语义 Action（准确名字/Schema 实现期核实） | 风险 | 必要检查 |
| --- | --- | --- |
| `library.list/exact/graph/closure/dependencies/used_by` | READ | Exact `resourceType/id/revision/scope`、Owner、索引分页、引用图版本、去敏感 |
| `library.bundle.export/inspect/preflight` | READ，导出额外数据许可 | 全部子资源、Bundle Hash、图闭包、可移植性与目标冲突 |
| `library.bundle.import` | MUTATE | 原生 Preflight 的精确 BundleHash+Token+映射+权限，安全续接同一意图 |
| `library.resource.attach/fork/update/promote` | MUTATE | 原生类型限定的 Source/Library authority、Project Revision、Dependency CAS |
| `library.resource.delete-safety/revision.delete` | READ / DESTRUCTIVE | 反向引用、Package/Session/版本依赖、一次性审批 |
| `package.build/inspect/compare/preflight/review/install/versions/receipt` | READ / INTERACT / MUTATE | 原生包 SHA、Manifest、Permission Grant、baseVersion/current pointer |
| `package.export/import` | 敏感 READ / MUTATE | 归档完整性、Package provenance、权限和 Archive 数据传输 |
| `package.version.gc/work.delete` | DESTRUCTIVE | 完整使用者清单/CurrentVersion/Session/Save 保护，不能自行物理删除 |

**冻结正式闭环**：

`Studio Source/Resource Graph/Revision → Workspace/Validation → 可信批准 Apply → Build frozen Package → Binary Artifact Hash → Native Preflight → 展示依赖与 Permission Diff → 独立可信 Install Review → 原生 Install → 正式 PackageVersion/Receipt 验证`。

- 每一阶段分别签入精确版本、owner/来源/差异与审批；Studio Apply ≠ Build 成功 ≠ 安装成功。使用当前已经预检的 archive Hash、PackageVersion、required/granted permissions 和 baseVersion CAS，不能用新内容套旧 Preflight Receipt。
- `PackageRepo.commitVersion` 将不可变子版本先持久化，再发布 current pointer；响应丢失可能留 orphan version，MCP 查询 Native Product 状态而非盲重装。已被 Session / current root 使用的旧版本不可删除。
- `ResourceBundleService` 有专用闭包、32 MiB / 512 resources / depth 64 的审计基线及 `bundleHash + token` 的确定性 ID 映射。**只在相同 Owner/BundleHash/Token 的已审导入意图**经原生预检与来源核对后允许安全续接部分导入；不能把这一特例外推成“所有写入可自动重试”。
- Package 原件及 Packaged Prompt/Skill 是不可变的；需要修订时回 Studio Project Source 并 Build 新 PackageVersion。Library Promote 不是直接篡改 Package 当前内容。
- 现有 MCP `build.package.create` 需从约 1 MiB JSON 读取 Base64，而 MCP Artifact Handle 上限 16 MiB，存在容量裂缝；由第二轮 P0 Binary Lane 共同解决，不能单纯提升全局响应上限。

## 3. 统一安全 Binary Asset Lane（冻结设计方向）

**用途**：Package Archive/Resource Bundle、Atria AssetStore 图像音频、Mask Checkpoint 等需要有界二进制传输，但每个业务继续使用自己的限制和权限。

- **传输身份**：`owner, clientInstanceId, purpose, sourceAuthority, sourceScope/revision, contentHash, totalBytes, mediaType, expiresAt, allowedOperations`；句柄不可跨 Owner、跨 Client、跨 Purpose 复用，不外露任意绝对路径、开放 URL、任意目标文件名或 Secret。
- **分块协议**：只从受信任 Product Asset Authority 或固定非敏感开发根获取；读取固定 offset/range，写入仅 Product 提供经审的 staging 端口；分块/总 Hash、长度、顺序、复用、MIME、大小与有效期校验。最后只有完整 SHA-256 匹配方可 `finalize`；丢块/半包不会产生正式 Artifact Receipt。
- **上下文与隐私**：真正字节不放入 LLM 文本、Receipt 或 MCP Journal；模型只见经授权的 metadata、Hash、版本、必要预览缩略图。未授权不得导出完整私有 Session/Mask/图片/音频/Prompt；不能偷取 StorageState、Cookie、SecretRef 值。
- **下游审批**：完成 Byte Transfer 不触发 Install/Publish；向 Provider 发送带身份/人像/私有素材时重新核对 Connection/Endpoint/SecretRef、用途、`externalAssetIds` 与准确费用/降级政策。
- **容量与 GC**：总大小与单块、并发、保留时间按 Package/Bundle/Media 各自 Native 硬限额配置，不把 Bundle 32 MiB 推成所有资源 32 MiB；过期中间句柄/分块可安全回收，但正式 AssetStore 的引用按其 lease/GC authority 保护。
- **重连恢复**：最多恢复已经 Hash 确认的临时片段；绝不因为二进制传输恢复就自动重做产品 Install/Image Send/Extension Enable。隔离 Control Lane，避免大文件堵住 status/cancel。

## 4. Visual / Media 原生语义与真实持久 Job

所有权：`IllustrationImageService`、`VisualDirector`、`MediaStudio`、`VisualGallery`、`VisualStore`、`VisualContinuity`、`ImageJobWorker`、`ImageAdapterRegistry`、`AssetStore`。目前视觉 Provider Adapter 包括 NovelAI、ComfyUI、OpenAI Images、Gemini Image、SD WebUI/Forge、RunningHub，但能否 T2I/Img2Img/Inpaint/Upscale 取决于当前 Target `CapabilityManifest`，不能根据 Provider 名称猜测。

| 候选 Action | 风险与不变量 |
| --- | --- |
| `media.target/rendering/capabilities.inspect` | READ；网络探测/Secret 使用为 INTERACT，固定 TargetFingerprint、Effective Features/Cost/Expiry |
| `media.director.shots.list` | READ，固定 Shot/Scene/Source |
| `media.director.scan/analyze/prepare/skip/submit` | MUTATE / INTERACT：Scan 可建 Scene/Shot 甚至触发 Automatic Image 费用，不包装为纯 READ |
| `media.image.prepare/start/status/list/cancel/reconcile` | Prepare 持久创建 Intent 为 MUTATE；Start 带费用/写入，Status/Cancel 分别权限；JobId/RemoteId 需 Source/Owner 绑定 |
| `media.edit.regenerate/img2img/inpaint/upscale.prepare` | 指定原 ImageVersion、父子版本、Geometry、Reference/Mask、目标 Capability 和费用 |
| `media.mask.draft.create/read/save/checkpoint/freeze` | READ/MUTATE：CAS `expectedRevision`，Mask Command、Raster SHA、BaseHash/Dimension 校验，不用 Playwright 任意鼠标画布 |
| `media.gallery.query/history/select/mark` | READ/MUTATE：ImageVersion lineage、Gallery metadataRevision/PresentationHead；Gallery hide ≠ 聊天楼层 hide |
| `media.reference.inspect/promote/revoke` | READ/MUTATE：Purpose、Identity、allowedBranches、externalConnectionIds；外传素材必须另审 |
| `media.gc.preview/mark/sweep` | READ/MUTATE/DESTRUCTIVE：UsedBy、quarantine、AssetHash、二次引用检查，禁止原始文件删除 |

- Image Job 已有 `VisualStore` 持久 Ledger、Reservation、CAS/Fenced Lease、`ImageJobWorker.recover` 只核对已发送 Remote ID，存在 `uncertain_submission`；MCP 只观察/调用原生恢复，不实现第二个图像 Worker，也不对远端状态未知的 Job 自动再发请求。
- `IllustrationImageService.prepare` 持久记录 Prepared Intent；`VisualDirector.scan` 会写 Shot/Scene，在已批准 Automatic Policy 下可能真实发起图像生成。Risk 必须按真实 effects 分级。Provider Target describe 可能调用带 Secret 的网络探测。
- `VisualStore` 的 ImageHour/Day、AutoConcurrency、MoneyDay/AutoMoneyDay/PlannerTokens 是独立原生额度，MCP Policy Envelope 只能收紧不能替代。默认 MCP 不启用新的 Automatic Mode；已有用户有效设置继续遵守 Native Policy。
- 图片 `prepareId`、`targetFingerprint`、`requestHash`、`externalAssetIds`、`maxCost/currency/allowUnknownCost` 是生成批准绑定；不允许模型伪造第三方素材授权，费用未知时严格遵守原生限制。
- Mask Draft/Freeze 创建正式 Artifact；Gallery 支持父子版本、Hide/Show/Remove/Restore/Soft-delete；Reference promotion 需查目的 `identity/outfit/style/structure/vibe`、允许分支与可外传连接。原生 visual GC mark 至 sweep 有按类别宽限（审计时 temporary ≥7天、soft-deleted ≥30天）及二次 UsedBy 检查；Blob 清理由 AssetStore 管理。
- Image Cancel 即使成功也不能宣称 Provider 已退款；只有有凭据的 remoteConfirmed 才能说明远端取消，其他状态保持 `unknown`。

## 5. Speech 有不同的任务恢复等级

`src/native/speech-service.js` 的 `voices/describe/start/status/cancel` 和 Audio AssetStore 引用由正式 Session Revision/ExpressionPlan/RunControl 约束。Speech 的工作状态目前主要由进程内 WeakMap/Map 和 NativeTaskScheduler 管理（审计 TTL 约 10 分钟），**不像 Image Job 一样具有持久 Worker Ledger**。

- MCP 语义 `speech.voices/describe/start/status/cancel/artifact.inspect` 分别按是否网络、局部计算、产生音频资产、删除风险标注，不把 Voice 列表或 Status 默认视为无网络副作用。
- 实际合成只使用拥有者当前可披露的正式 Timeline 文本/Actor 信息；公开音频经 Binary Lane，音频引用和来源/Asset SHA 必须一致。
- Host 重启后原 Task 可能丢失，MCP 只能核对正式已有音频产物/来源和未知执行，不宣称仍在后台运行，也不无授权自动重新付费或清零成本。
- 如需真正 Durable Speech Job，必须先由 `main` 建立原生受控任务，不能靠 MCP Journal 复制完整业务记录。

## 6. Runtime Skills 版本化且永不提供权限

Atria `src/skills/{repository,versions,url-import}.js` 和 `src/endpoints/skills.js` 已有 Scoped Skill、File、History、Version Pin、Candidate Prepare/Check/Apply、Copy/Rename/Edit/Install/Delete。MCP 可以提供：

| 方向 | 风险/校验 |
| --- | --- |
| `skill.list/read/search/files/history` | READ，exact scope/name/version/hash，分页，文件内容为不可信指令文本 |
| `skill.pin/candidate.prepare/check/apply` | 状态持久时 MUTATE；候选 Hash、差异/依赖审查、Apply 单独审批 |
| `skill.file.write/edit/rename/move` | MUTATE，指定路径/内容 hash/旧版本/目标 Scope，绝无任意磁盘写入 |
| `skill.install/import.url` | 网络 INTERACT + MUTATE，内容审查、来源 URL/Hash、SSRF/Redirect/大小/路径限制，独立审批 |
| `skill.delete/file.delete/scope.delete` | DESTRUCTIVE，引用/当前 Pin/Scope 确认、one-shot |

- 安装在 **Package Scope 的 Skills 原件只读**；要修改必须回源 Project 并 Build 新 PackageVersion。
- Skill 脚本或自然语言“指令”都不视为权限、Secret/Host Code 执行许可或用户 Approval。外部 AI 不能通过安装恶意 Skill 改变自己的 MCP Ceiling。
- Skill URL 导入目前 HTTPS + 下载后 Frontmatter/Size 检查不构成完整 SSRF/Egress 防线，MCP 开放前须补目标 URI、DNS、Redirect、内网/Metadata 和流式大小/ContentType 校验，产品端可能需要新增小型正式安全 Authority。
- Atria 玩家 Runtime Skills ≠ 长期 `skills` 分支中给仓库 Agent 用的 Skill 副本。
- 容量收口：支持原生每文件 4 MiB、每 Skill 16 MiB、100 个文件及 `SKILL.md` 512 KiB 上限。大 payload 从允许的开发产物文件进入固定 `skill-payload-upload` Binary Lane；先独立 staging，再纯 preflight 与独立正式 Install。JSON 编码容量不替代原生解码后大小检查。候选只返回 immutable metadata/hash，before/after 完整差异和文件内容分页获取；单条超长文本不能令完整审查不可达，列表带完整 inventory Hash 与游标。

## 7. Browser Extensions 与 Host Plugins 两级代码执行信任

### 7.1 Browser Extensions

`src/endpoints/native-extensions.js` 与 `extensions-store.js` 管理列表、Revision、Scope、Git URL 安装、默认 `enabled:false`、启用/停用/删除。浏览器 `extension-runtime.js` 通过动态 `import()` 执行 `activate(sdk)`；`extension-sdk.js` 明确说明 **用户启用的页面 JavaScript 不是沙箱**，SDK 清理注册组件/监听器不等于限制其他 DOM/网络副作用。

- MCP 按 `extension.list/get/dependencies/source.inspect/install.preflight/install/update/enable/disable/delete/status` 分段；安装默认保持禁用，启用执行时必须单独可信用户审批和代码信任门槛。
- 批准绑定 Git origin、**确切 Commit/内容 Hash**、Manifest/入口、目标 Work/Preset/Session Scope、变更 Diff、第三方网络/DOM 权限、代码更新和原生 Revision；不能以“曾允许上一版本运行”批准新的 Git HEAD。
- 外部 Git clone 的 HTTPS、Manifest/文件深度和 Symlink 检查不足以宣称运行代码隔离，需供应链/Redirect/SSRF/Hash 漂移/仓库更新检查。没有足够来源证明时只能观察/预检，不能给模型一键执行任意代码。
- 禁用后仍应重新观察前端 Epoch/实际激活状态，不声称能撤销第三方代码已经产生的外部效果或远端网络传输。
- 本地 Extension 源码按 UTF-8 字节保留 4 MiB 原生上限，使用共享池的固定 `extension-source-upload` 用途分块，绑定 owner/client/boot、完整 source Hash 与 metadata Hash，最终惯用原锁内 CAS。staging/prepare 仅形成 inert source，Review/Install/Enable 仍各走原独立权限。大型输入审批展示专用有界源码摘要，完整输入 Hash 仍进入 Lease/MRTR 绑定；完整内容通过 preparation source 分页审阅，不在回执或 Journal 复制源码。

### 7.2 Host Plugins 与 Package Runtime Plugins

`src/native/plugin-platform.js` 的 `HostPluginBoundary` 定义 Manifest/ContributionRegistry、Dependency、Capabilities 与 `grantedPermissions`；`host-plugin-loader.js` 真实在宿主进程加载模块。**这是权限与贡献边界，不是进程/容器隔离沙箱**。

- MCP 首先开放 `hostplugin.manifest/permission/dependency/contribution/active.inspect` 的固定 READ；真正启用/更新/关闭高危服务器插件须产品有正式运维/代码发布 Authority、可信 Operator Admin 权限和独立审批，否则 `UNSUPPORTED`，不得提供 MCP 通用 `import/require/eval/shell`。
- Package Runtime Plugin 在原生编译中按声明的 runtime Capability/Permission 授权，**禁止**打包可执行 Host Plugin EntryPoint 或 Host Contribution；Package Review 只能批准包内运行时权限，不可升级为宿主 Host 权限。
- 产品 Runtime Extensions/Host Plugins/Package Plugins ≠ 长期 `plugin` 分支的独立 MCP 开发工具。

## 8. Budget、Approval、Receipt、Recovery 与 GC（跨域冻结）

- **分领域权限交集**：MCP Action Ceiling + 可信客户端审批 + Product Owner/Scope/CAS + Provider Secret/Network/ExternalAsset authorization + Package/Skill/Plugin Code trust。不得从 Package Review 承袭 Image Send、Skill Apply、Extension Enable 或 Host Activate 的独立许可。
- **独立预算**：MCP Operation Envelope、Native Generation compute、VisualStore Image/Planner/Money、Speech LocalWork、实际 Provider Usage 分开计账；不能将文字模型额度偷换为图片费用。成本未知/远端可能已提交时状态 `unknown`，原生 Reservation 不自动释放。
- **不同恢复通道**：Image Job 有真实 durable ledger/remote reconcile；Bundle Import 可在同一 Native Token 下受控续接；Speech 多为短期运行记录；Package Install/Studio Apply/Skill/Extension 更新按各自原生 Receipt/Revision 核对，不提供统一盲重试。
- **删除的最小权限**：AssetStore/Visual mark→quarantine→sweep 与 Session/Package/Skill 引用检查分别属于拥有方。MCP 无权直接删用户数据Root、原始 Asset Blob、Skill 版本文件、Provider Storage。高危删除仍要求 exact ID、UsedBy、一次性批准和再次校验。
- **MCP Journal 只记录关联**：最小 `operationId/target/hash/approval summary/source/receipt/unknown`，不成为第二套 Package、图像、Skill、Plugin、Secret 的状态库。
- **入侵/提示注入风险**：页面 HTML、Skill 文本、Extension 源、Package Manifest、Provider 响应与文件路径都只是低信任数据。模型不能从这些内容获取更高工具权限，二进制资产、敏感截图和私人对话不通过普通文本输出泄露。

## 9. 第八轮冻结验收目标

| 测试域 | 必须证明 |
| --- | --- |
| Package & Library | 固定 SourceRevision/PackageVersion/BundleHash、依赖闭包和权限差异；旧 Session 引用阻止不安全删除；Install 断联/重复执行不会制造未经审的版本 |
| Resource Bundle | 已审 Token 同一意图的部分 Import 安全续接、Missing/Duplicate/Cycle/Scope/Hash 不可越界；支持原生容量上限 |
| Binary Lane | 断块/重放/篡改/Hash/Owner/Purpose/TTL/大小与 Client 混用不能产生完成回执；资产字节不入 LLM/Journal |
| Visual/Media | 不同 Provider Capability、费用、自动 Director Scan 副作用、Job Reservation/Unknown/Remote Recover、Mask CAS/Checkpoint/Geometry、Gallery parent/soft-delete/Reference/GC |
| Speech | Voice/Source/RunControl、音频 Asset SHA、Stop、Host 重启后不伪造运行中结果 |
| Skills | Version Pin/Candidate/Apply、Package Skill 原件只读、恶意 Skill 指令和外部 URL/Redirect/内网/超限 |
| Browser Extensions | 第三方 Code Review、确切 Git SHA、安装默认 disabled、启用另批、Scope/Epoch reset、用户私密数据边界 |
| Host/Package Plugin | Manifest、Dependency、Permission Grant、Host/Package Contribution 不混同；没有原生授权不向 AI 暴露服务器执行 |
| 全链路 | Studio → Binary Asset/Media → Build → Package Permission Review → Install → Native Receipt，每阶段独立审批/费用/身份，HTTP 响应丢失不会盲重发 |

本模块定义冻结目标；执行事实与未验边界统一见 [本任务 Record](../../../records/plugin/atria-mcp-strengthening.md)。

## 10. 第九轮实施收口路由

第八轮初次冻结时列出的第九轮事项，现由本次开工指令授权的 E0 收口；不是此前单独选择的追认。阶段依赖见 [implementation](implementation.md)，全域验收见 [acceptance](acceptance.md)，威胁与故障矩阵见 [security](security.md)。
