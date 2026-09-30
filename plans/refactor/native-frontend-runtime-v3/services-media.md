# Atria Native Frontend Runtime v3 — Host Services & Media

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 11. Fixed Host Services

Baseline fixed services：

- `host.composer`
- `host.conversation`
- `host.session`
- `host.media`
- `host.presentation`
- `host.external`

### 11.1 Composer

支持：

- get/set/append/clear Draft；
- focus；
- submit。

Submit 进入正式 Turn/Session authority，不直接 append Timeline。

### 11.2 Managed + Headless Conversation

作者可以选择：

- Managed Native Conversation/Composer；
- Headless Conversation Service + Package-owned DOM/CSS。

Managed Component 必须基于同一 Headless Host contract。

Headless 提供：

- committed message collection；
- active branch/revision/tail；
- GenerationProjection；
- reply alternatives；
- history metadata；
- retry/regenerate/fork/switch/inspect；
- generation cancel/status。

Reply alternative 保持 Native 语义：同一 predecessor 后的不同 committed assistant messages / branch lineage，不复活 legacy Swipe。

### 11.3 GenerationProjection

Streaming/provisional generation 是 ephemeral Presentation，不是 Timeline Authority。

状态至少：

- idle；
- preparing；
- streaming；
- finalizing；
- cancelling；
- failed。

Final commit 后消息通过 committed Conversation Collection 出现。

### 11.4 Session

`host.session` 支持：

- status；
- create/list/restore SavePoint；
- reload/recover；
- exit Experience；
- restart current entry/session（Host policy允许时）；
- diagnostics。

所有 branch/save/restore/retry 有 exact/current revision guard。

Destructive/navigation-like action 的 confirmation 由 Host policy 决定。

### 11.5 Experience Epoch

Restore、branch switch、reload 等引发 Experience Epoch 变化。

Runtime 自动：

- revoke stale cursors/handles；
- cancel stale async requests；
- discard late completion；
- rebind projection；
- remount/recreate affected Controller/View。

---

## 12. Safe Prose / Message Presentation

Canonical narrative text 继续只有一份。

Prose AST 是 inert Presentation Projection，不是第二份 Narrative Truth。

Prose nodes baseline：

- paragraph；
- line break；
- emphasis/strong；
- heading；
- quote；
- ordered/unordered list；
- code/pre；
- safe link；
- semantic inline mark。

AST 通过 canonical content span/range 或 exact textual mapping 验证。

禁止 raw HTML/script/style/iframe/embed。

Native Declarative Runtime 将 Prose AST 展开成 Experience-owned semantic DOM，因此 Package CSS 完整控制视觉。

Safe links走 Host External Navigation。

Message Blocks 保持独立 typed block，不吸收进 Prose AST。

---

## 13. Media / Assets

Frontend Asset Graph 复用现有 exact AssetRef / Asset Pack / content hash 基础。

覆盖：

- styles；
- fonts；
- images；
- SVG；
- cursor/mask/texture；
- controller modules；
- audio/video；
- presentation resources。

### 13.1 Local Media

Embedded Exact AssetRef 可离线、可重复验证。

支持 image/audio/video/speech presentation；播放、autoplay、visibility、user gesture 服从 Host/平台策略。

### 13.2 Remote Media

Remote image 是正式能力，用于避免大量角色立绘/CG使 `.atria` 体积爆炸。

Remote media identity：

- DeclaredRemoteMediaRef；
- HostIssuedMediaRef。

大量立绘进入 lightweight Remote Media Catalog：

- mediaId；
- URL/source candidates；
- optional integrity；
- dimensions/MIME；
- loading/cache hints；
- fallback。

World/Application 投影保存 `mediaId/ImageRef`，不保存运行时可执行 URL。

Frontend/Script 不得任意构造 RemoteImageRef URL。

### 13.3 Remote Media Permission / Threat Model

`remote-media` 是 **External Access Permission**。

Declared origins/MediaRefs 可以阻止 arbitrary URL / arbitrary destination / raw fetch，但不能保证完全无数据外传；获准 origin 仍可能观察请求选择与时序。

因此：

- 安装/启用 UI 明示远程媒体 origins 与隐私含义；
- Host strip credentials/referrer；
- Host 可使用 privacy proxy/cache；
- 用户可禁用 Remote Media；
- denied/offline 使用 fallback；
- 所有静态 CSS network-producing URL sink 都由 Compiler 解析/分类。

Remote audio/video 不是 Core v3 必须项；future 可扩展 MIME policy。

---
