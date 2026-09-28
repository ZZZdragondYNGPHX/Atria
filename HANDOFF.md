# HANDOFF — Native Frontend Runtime v3

- Task ID: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`（当前仍为纯方案讨论，未创建实现分支）
- Current stage: Discussion / Architecture
- Source baseline: `main@191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Plan HEAD: `docs@5fe09a88b6389ed18be3eb712f86675cfefea5e2`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: 尚未开始实施，不建立 Implementation Record
- 当前 Plan 状态: Discussion Draft v0.8

## 已写入 Plan

- Package owns presentation; Host owns capabilities and authority.
- Declarative DOM / Full CSS / Fonts / Shadow boundary.
- Client Interaction Runtime.
- Package Component System.
- Optional Script Sandbox.
- Frontend Asset Graph / Remote Media / typed ImageRef / Host Media Resolver.
- Framework Adapter / future Web Island。
- Hard cut legacy Native UI：无 v1/v2 migration、兼容 CSS、双 renderer 或旧 manifest 兼容；最终 v3 唯一正式 Native UI Runtime。

## 本轮新增讨论（尚未写入 Plan；下一轮开始前先增量/覆盖更新）

Frontend Manifest / Capability Negotiation：

- 不再把 v3 作为 `componentModelVersion: 3`；使用 `runtime.experience.frontend`。
- Core frontend identity 建议：
  ```yaml
  runtime:
    experience:
      mode: hybrid
      frontend:
        kind: native
        version: 3
        entry: ui/main.frontend.json
  ```
- `frontend.kind/version` 本身决定核心 runtime compatibility；不再额外声明重复的 `native-frontend@3` capability。
- Native Frontend v3 baseline 应直接包含 DOM、CSS、本地字体、Component、Interaction、responsive、local/draft/prefs state、Native Host Bridge 等核心能力；不要把每个基础能力拆成可选 feature。
- 只有正交/高级子系统才进入 versioned Feature，例如：
  - `frontend-script@1`
  - `remote-media@1`
  - `canvas-2d@1`（是否纳入 core baseline 仍可最终决定）
  - future `webgl@1` / `webgpu@1`
  - future host-mediated `network@1`
- Feature 与 Permission 分离：
  - Feature 表示 Host 是否实现某技术 API；
  - Permission 表示 Package 是否被允许触及外部网络、用户设备/数据或其它敏感 Host 能力。
- `frontend-script` 仅使用无 browser/network/authority 的 sandbox 时属于 Feature，不是用户 Permission。
- `remote-media` 同时具有 Runtime Feature 与用户可见 External Access Permission 两个维度：Host 必须实现 Resolver，用户/Host 还必须允许指定远程 origins。
- `canvas-2d` 通常是 Feature，不是 Permission。
- `network / clipboard / camera / microphone` 等是 Permission；Host API 的具体版本可另有对应 Feature version。
- Package 顶层 coarse `capabilities` 不应承担 Runtime negotiation；现有三层 capability 命名在实现阶段应清理/重命名，避免语义重叠。具体是否重命名顶层字段留给 Manifest 最终定稿。
- required Feature unsupported / environment unavailable => preflight fail，不启动 Experience。
- optional Feature unsupported => Experience 可以启动，但 Host 必须把状态投影给 UI，Package 必须显式提供 guarded/fallback path；禁止 silent partial execution。
- required Permission denied => preflight/activation fail，并清楚显示拒绝原因。
- optional Permission denied => Experience 继续运行，Host 投影 `denied`，Package 使用 fallback。
- Capability/permission projection 至少区分：
  - `available`
  - `unsupported`
  - `unavailable`（当前设备/环境不可用）
  - `denied`
  并带 stable reasonCode。
- Optional capability 的 fallback 应通过 Declarative condition/resource fallback 表达，而不是 Host 私自猜测降级行为。
- Remote Image 已有专门 fallback，可直接适配该机制。
- Permission constraints 应属于 Host-validated manifest contract，例如 Remote Media 的 allowed HTTPS origins；静态 RemoteImageRef 必须落在声明范围内，动态 ImageRef 运行时也必须匹配。
- 权限授权状态属于 Host，不属于 Package UI/World。建议按 package identity + permission + constraints 管理；PackageVersion 若扩大权限范围需重新授权，缩小范围不应扩大旧授权。
- 安装/启用 UI 应区分：
  - Runtime profile（Native v3 / future Web Island）
  - Technical features（Script Sandbox / Canvas 等）
  - External/sensitive permissions（Remote Media origins / Network / Clipboard / Camera / Mic）
  避免把“使用 CSS”这类普通能力伪装成危险权限。
- Native Declarative、Sandbox Script、future Web Island 必须共用同一个 typed Frontend Host Bridge 语义；不同 runtime 只改变 transport/isolation，不改变 Authority API。
- 由于 hard cut，可以提升 Package / Runtime Descriptor / Experience contract schema，只按新架构清晰度决定；不需要为旧版本保持 schema number/shape。
- 暂不建议因为本任务顺便重做与 Frontend 无关的整个 Native storage schema；hard cut 用于清理 frontend/runtime contract，不做无关重构。

## 讨论工作流

用户要求后续每一轮：
1. 先将上一轮新增/变化的讨论结论增量或覆盖更新到 Plan；
2. 再继续本轮新主题；
3. 当前仍不开始实施，直到用户明确批准进入开发。

## 下一轮建议主题

先把本轮 Manifest / Feature / Permission / negotiation 结论写入 Plan，再讨论：

- 最终 Frontend Host Bridge API surface：
  - projection/read；
  - command；
  - composer；
  - task；
  - activity；
  - media；
  - storage/preferences；
  - navigation/fullscreen/input；
- Sandbox Script 能调用哪些 Bridge；
- future Web Island 是否严格使用同一 RPC surface；
- Package-local persistence 是否需要，若需要如何防止形成第二套 Authority；
- Clipboard / external navigation / download/upload 等边缘能力是否进入 v3 baseline。

## 不要重复

- 不考虑 v1/v2 用户数据或 migration。
- 不重建 legacy compatibility。
- 不重复讨论远程立绘是否允许。
- 不创建实现分支或代码，除非用户明确批准进入实施。
