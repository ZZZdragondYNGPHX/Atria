# Atria MCP 补强｜Package / Library / Media / Skills / Extensions（第八轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；Primary Workspace 为长期独立 `plugin` 分支中 `atria-mcp/`；Plan 位于 `docs`。
- **冻结决策**：2026-10-14 第八轮选 **B：分域完整控制 + 统一安全二进制资产通道**；本页是**待实施设计**，不是代码和测试结果。
- **静态审计源**：`main@9241325a7290e613e0fdaaa1870409105c161c89`、`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。
- **依赖**：[index](index.md) · [P0 reliability](p0-reliability.md) · [能力矩阵](capability-matrix.md) · [Studio/Agent](studio-project-agent.md) · [Runtime/Provider](model-prompt-runtime-provider.md) · [Session/Save](session-save-generation-lifecycle.md) · [Browser UI](browser-ui-semantic-interaction.md)。

## 1. 已冻结的总体模型和不变量

1. **分域完整控制，而不是第二套产品内核**：MCP 对 Package、Library、Resource Graph、Resource Bundle、Visual/Image/Media、Speech、Runtime Skills、Browser Extensions、Host Plugins、Package Runtime Plugins 提供审过的语义 Action。真实版本、状态、预算、发布、恢复由 Atria 原生权威管理，不建立影子 PackageRegistry/MediaStore/SkillRepository/PluginHost。
2. Install、Import、Provider Send、正式 Publish、Activate 分别需要符合其领域权限、批准和 Native Receipt。数据 Handle 本身绝非写入或网络外传许可。
4. **权限是交集**：ActionRegistry + PolicyCeiling + 可信用户审批/Lease + 产品原生 owner/Scope/Revision/CAS + Provider/Asset externalEffects；模型传来的 `confirm`、Package/Skill 文字、插件页面按钮以及 HTML/JS 评论均不能升级权限。
5. **业务执行与观察分离**：有原生持久写入或收费副作用的 `scan/prepare/describe/inspect` 按实际效果升级风险；不能根据名称/HTTP Method 假设 READ。结果未知不重复发送外部费用/安装/发布。
6. **用户未显式授权不自动运营**：MCP 不默认开启自动画图、Plugin 自动启用/更新、Skill 自动发布、Package 自动安装；已存在有效产品自动策略遵守其 Native Budget/Permission。
7. **保持分支边界**：产品内置 Runtime Skills/Browser Extensions/HostPlugin/PackagePlugin 与长期 `plugin` 开发工具及长期 `skills` 仓库 Agent Skill 副本是不同对象；不混合路径、角色、权限。生图深化项目未来变更要以实际 `main` 权威为准，不由 MCP 创建平行媒体格式。

## 2. Package / Library / Resource Graph / Resource Bundle 完整能力

已观察的产品权威：`src/native/authoring/{resource-graph,library-service}.js`、`src/native/resource-bundle.js`、`package-{composition,container}.js`、`repositories/package-repo.js`、`endpoints/native-{studio,product}.js`。旧 MCP `atria-mcp/src/high-risk.js` 已提供 Package Capture/Build/Inspect/Preflight/Review/Install 及限制性删除。

| 候选语义 Action（准确名字/Schema 实现期核实） | 风险 ||
| --- | --- | --- |
| `library.list/exact/graph/closure/dependencies/used_by` | READ | Exact `resourceType/id/revision/scope`、Owner、索引分页、引用图版本、去敏感 |
| `library.bundle.export/inspect/preflight` | READ，导出额外数据许可 ||
| `library.bundle.import` | MUTATE ||
| `library.resource.attach/fork/update/promote` | MUTATE | 原生类型限定的 Source/Library authority、Project Revision、Dependency CAS |
| `library.resource.delete-safety/revision.delete` | READ / DESTRUCTIVE | 反向引用、Package/Session/版本依赖、一次性审批 |
| `package.build/inspect/compare/preflight/review/install/versions/receipt` | READ / INTERACT / MUTATE | 原生包 SHA、Manifest、Permission Grant、baseVersion/current pointer |
| `package.export/import` | 敏感 READ / MUTATE ||
| `package.version.gc/work.delete` | DESTRUCTIVE | 完整使用者清单/CurrentVersion/Session/Save 保护，不能自行物理删除 |

**冻结正式闭环**：

- 每一阶段分别签入精确版本、owner/来源/差异与审批；Studio Apply ≠ Build 成功 ≠ 安装成功。
- `PackageRepo.commitVersion` 将不可变子版本先持久化，再发布 current pointer；响应丢失可能留 orphan version，MCP 查询 Native Product 状态而非盲重装。已被 Session / current root 使用的旧版本不可删除。
- 不能把这一特例外推成“所有写入可自动重试”。
- Package 原件及 Packaged Prompt/Skill 是不可变的；需要修订时回 Studio Project Source 并 Build 新 PackageVersion。Library Promote 不是直接篡改 Package 当前内容。
- 现有 MCP `build.package.create` 需从约 1 MiB JSON 读取 Base64，而 MCP Artifact Handle 上限 16 MiB，存在容量裂缝；由第二轮 P0 Binary Lane 共同解决，不能单纯提升全局响应上限。

## 3. 统一安全 Binary Asset Lane（冻结设计方向）

**用途**：Package Archive/Resource Bundle、Atria AssetStore 图像音频、Mask Checkpoint 等需要有界二进制传输，但每个业务继续使用自己的限制和权限。

- 句柄不可跨 Owner、跨 Client、跨 Purpose 复用，不外露任意绝对路径、开放 URL、任意目标文件名或 Secret。
- **分块协议**：只从受信任 Product Asset Authority 或固定非敏感开发根获取；读取固定 offset/range，写入仅 Product 提供经审的 staging 端口；丢块/半包不会产生正式 Artifact Receipt。
- **上下文与隐私**：真正字节不放入 LLM 文本、Receipt 或 MCP Journal；未授权不得导出完整私有 Session/Mask/图片/音频/Prompt；不能偷取 StorageState、Cookie、SecretRef 值。
- **下游审批**：完成 Byte Transfer 不触发 Install/Publish；
- **容量与 GC**：总大小与单块、并发、保留时间按 Package/Bundle/Media 各自 Native 硬限额配置，不把 Bundle 32 MiB 推成所有资源 32 MiB；过期中间句柄/分块可安全回收，但正式 AssetStore 的引用按其 lease/GC authority 保护。
- 绝不因为二进制传输恢复就自动重做产品 Install/Image Send/Extension Enable。隔离 Control Lane，避免大文件堵住 status/cancel。

## 4. Visual / Media 原生语义与真实持久 Job

所有权：`IllustrationImageService`、`VisualDirector`、`MediaStudio`、`VisualGallery`、`VisualStore`、`VisualContinuity`、`ImageJobWorker`、`ImageAdapterRegistry`、`AssetStore`。目前视觉 Provider Adapter 包括 NovelAI、ComfyUI、OpenAI Images、Gemini Image、SD WebUI/Forge、RunningHub，但能否 T2I/Img2Img/Inpaint/Upscale 取决于当前 Target `CapabilityManifest`，不能根据 Provider 名称猜测。

| 候选 Action | 风险与不变量 |
| --- | --- |
| `media.target/rendering/capabilities.inspect` | READ；网络探测/Secret 使用为 INTERACT，固定 TargetFingerprint、Effective Features/Cost/Expiry |
| `media.director.shots.list` | READ，固定 Shot/Scene/Source |
| `media.director.scan/analyze/prepare/skip/submit` | MUTATE / INTERACT：Scan 可建 Scene/Shot 甚至触发 Automatic Image 费用，不包装为纯 READ |
| `media.image.prepare/start/status/list/cancel/reconcile` | Prepare 持久创建 Intent 为 MUTATE；Start 带费用/写入，Status/Cancel 分别权限；JobId/RemoteId 需 Source/Owner 绑定 |
| `media.edit.regenerate/img2img/inpaint/upscale.prepare` | 指定原 ImageVersion、父子版本、Geometry、Reference/Mask、目标 Capability 和费用 |
| `media.gallery.query/history/select/mark` | READ/MUTATE：ImageVersion lineage、Gallery metadataRevision/PresentationHead；Gallery hide ≠ 聊天楼层 hide |
| `media.reference.inspect/promote/revoke` | READ/MUTATE：Purpose、Identity、allowedBranches、externalConnectionIds；外传素材必须另审 |

- MCP 只观察/调用原生恢复，不实现第二个图像 Worker，也不对远端状态未知的 Job 自动再发请求。
- `IllustrationImageService.prepare` 持久记录 Prepared Intent；`VisualDirector.scan` 会写 Shot/Scene，在已批准 Automatic Policy 下可能真实发起图像生成。Risk 必须按真实 effects 分级。Provider Target describe 可能调用带 Secret 的网络探测。
- `VisualStore` 的 ImageHour/Day、AutoConcurrency、MoneyDay/AutoMoneyDay/PlannerTokens 是独立原生额度，MCP Policy Envelope 只能收紧不能替代。默认 MCP 不启用新的 Automatic Mode；已有用户有效设置继续遵守 Native Policy。
- 不允许模型伪造第三方素材授权，费用未知时严格遵守原生限制。
- Mask Draft/Freeze 创建正式 Artifact；Gallery 支持父子版本、Hide/Show/Remove/Restore/Soft-delete；Reference promotion 需查目的 `identity/outfit/style/structure/vibe`、允许分支与可外传连接。Blob 清理由 AssetStore 管理。
- Image Cancel 即使成功也不能宣称 Provider 已退款；只有有凭据的 remoteConfirmed 才能说明远端取消，其他状态保持 `unknown`。

## 5. Speech 有不同的任务恢复等级

`src/native/speech-service.js` 的 `voices/describe/start/status/cancel` 和 Audio AssetStore 引用由正式 Session Revision/ExpressionPlan/RunControl 约束。Speech 的工作状态目前主要由进程内 WeakMap/Map 和 NativeTaskScheduler 管理（审计 TTL 约 10 分钟），**不像 Image Job 一样具有持久 Worker Ledger**。

- MCP 语义 `speech.voices/describe/start/status/cancel/artifact.inspect` 分别按是否网络、局部计算、产生音频资产、删除风险标注，不把 Voice 列表或 Status 默认视为无网络副作用。
- 实际合成只使用拥有者当前可披露的正式 Timeline 文本/Actor 信息；公开音频经 Binary Lane，音频引用和来源/Asset SHA 必须一致。
- 如需真正 Durable Speech Job，必须先由 `main` 建立原生受控任务，不能靠 MCP Journal 复制完整业务记录。

## 6. Runtime Skills 版本化且永不提供权限

MCP 可以提供：

| --- | --- |
| `skill.delete/file.delete/scope.delete` | DESTRUCTIVE，引用/当前 Pin/Scope 确认、one-shot |

- 安装在 **Package Scope 的 Skills 原件只读**；要修改必须回源 Project 并 Build 新 PackageVersion。
- Skill 脚本或自然语言“指令”都不视为权限、Secret/Host Code 执行许可或用户 Approval。外部 AI 不能通过安装恶意 Skill 改变自己的 MCP Ceiling。
- Atria 玩家 Runtime Skills ≠ 长期 `skills` 分支中给仓库 Agent 用的 Skill 副本。
- 容量收口：支持原生每文件 4 MiB、每 Skill 16 MiB、100 个文件及 `SKILL.md` 512 KiB 上限。大 payload 从允许的开发产物文件进入固定 `skill-payload-upload` Binary Lane；先独立 staging，再纯 preflight 与独立正式 Install。

## 7. Browser Extensions 与 Host Plugins 两级代码执行信任

### 7.1 Browser Extensions

`src/endpoints/native-extensions.js` 与 `extensions-store.js` 管理列表、Revision、Scope、Git URL 安装、默认 `enabled:false`、启用/停用/删除。浏览器 `extension-runtime.js` 通过动态 `import()` 执行 `activate(sdk)`；`extension-sdk.js` 明确说明 **用户启用的页面 JavaScript 不是沙箱**，SDK 清理注册组件/监听器不等于限制其他 DOM/网络副作用。

- MCP 按 `extension.list/get/dependencies/source.inspect/install.preflight/install/update/enable/disable/delete/status` 分段；
- 不能以“曾允许上一版本运行”批准新的 Git HEAD。
- 没有足够来源证明时只能观察/预检，不能给模型一键执行任意代码。
- 禁用后仍应重新观察前端 Epoch/实际激活状态，不声称能撤销第三方代码已经产生的外部效果或远端网络传输。
- staging/prepare 仅形成 inert source，Review/Install/Enable 仍各走原独立权限。完整内容通过 preparation source 分页审阅，不在回执或 Journal 复制源码。

### 7.2 Host Plugins 与 Package Runtime Plugins

`src/native/plugin-platform.js` 的 `HostPluginBoundary` 定义 Manifest/ContributionRegistry、Dependency、Capabilities 与 `grantedPermissions`；`host-plugin-loader.js` 真实在宿主进程加载模块。**这是权限与贡献边界，不是进程/容器隔离沙箱**。

- MCP 首先开放 `hostplugin.manifest/permission/dependency/contribution/active.inspect` 的固定 READ；真正启用/更新/关闭高危服务器插件须产品有正式运维/代码发布 Authority、可信 Operator Admin 权限和独立审批，否则 `UNSUPPORTED`，不得提供 MCP 通用 `import/require/eval/shell`。
- Package Runtime Plugin 在原生编译中按声明的 runtime Capability/Permission 授权，**禁止**打包可执行 Host Plugin EntryPoint 或 Host Contribution；Package Review 只能批准包内运行时权限，不可升级为宿主 Host 权限。
- 产品 Runtime Extensions/Host Plugins/Package Plugins ≠ 长期 `plugin` 分支的独立 MCP 开发工具。

## 8. Budget、Approval、Receipt、Recovery 与 GC（跨域冻结）

- **分领域权限交集**：MCP Action Ceiling + 可信客户端审批 + Product Owner/Scope/CAS + Provider Secret/Network/ExternalAsset authorization + Package/Skill/Plugin Code trust。不得从 Package Review 承袭 Image Send、Skill Apply、Extension Enable 或 Host Activate 的独立许可。
- **独立预算**：MCP Operation Envelope、Native Generation compute、VisualStore Image/Planner/Money、Speech LocalWork、实际 Provider Usage 分开计账；不能将文字模型额度偷换为图片费用。成本未知/远端可能已提交时状态 `unknown`，原生 Reservation 不自动释放。
- **不同恢复通道**：Image Job 有真实 durable ledger/remote reconcile；Bundle Import 可在同一 Native Token 下受控续接；Speech 多为短期运行记录；
- MCP 无权直接删用户数据Root、原始 Asset Blob、Skill 版本文件、Provider Storage。
- **入侵/提示注入风险**：页面 HTML、Skill 文本、Extension 源、Package Manifest、Provider 响应与文件路径都只是低信任数据。模型不能从这些内容获取更高工具权限，二进制资产、敏感截图和私人对话不通过普通文本输出泄露。

## 10. 第九轮实施收口路由

第八轮初次冻结时列出的第九轮事项，现由本次开工指令授权的 E0 收口；不是此前单独选择的追认。
