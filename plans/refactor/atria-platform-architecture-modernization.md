# R8 — Atria Platform Architecture Modernization

## 状态

- 状态：**已立项 / 等待 R7 最终合并后正式实施**
- 仓库：`ZZZdragondYNGPHX/Atria`
- 正式工作分支：`refactor/atria-platform-architecture-modernization`
- 当前分支用途：**预留分支名，不允许在 R7 合并前提交 R8 功能代码**
- 当前预留基线：`main@63da3141a3895d3386ed1bebc30876c9766315ba`
- 真正实施基线：**R0-R7 全部完成、验证并合并后的最新 `main`**
- R8 不从 `refactor/atria-game-first-shell-redesign`、`refactor/game-runtime-architecture` 或任何候选 HEAD 直接开发。
- Astra 开始任何功能改动前，必须先令 R8 分支 HEAD 与当时最新 `origin/main` **完全相同**。

> 本文中的 R7 候选代码规模只用于立项研究。R8A 必须在最终合并后的 `main` 上重新采集并冻结正式基线。

---

## 1. 立项结论

Atria 已经明显超出原 SillyTavern 宿主架构的规模和职责边界。

本项目值得进行底层架构升级，但目标不是“换技术栈重写”，而是：

> **简化 ownership、初始化图与模块边界；保持当前有效业务与数据完整性。实现与兼容取舍遵循 [Governance §12.1](../../README.md#121-minimal-implementation)。**

核心判断：

1. SillyTavern 是上游基础；不因此承担旧版本兼容义务。
2. 保留已经完成的 Atria Storage、Generation、FloorState、Game Runtime、Shell、Workspace 等能力。
3. 不通过 React/Vue/Vite/全 TypeScript 重写来“现代化”。
4. 将 Atria 自己已经形成的新内核逐步提升为真正的应用骨架。
5. 将有效职责迁入现有原生模块，更新真实调用方并删除失效全局模块、DOM、事件和旧入口。
6. 阶段按实际风险验证；仅在数据变更或外部副作用需要时设计恢复措施。

---

## 2. 立项研究快照

R7H 候选 `982c1256f42a255626b22cbf97aa054bce08b936` 的研究快照：

- 文件：约 3407；
- 第一方 JS：约 947 个；
- 第一方 JS 源码：约 17.51 MB；
- >=100 KB 的第一方 JS：28 个；
- `public/index.html`：约 802 KB；
- `public/script.js`：约 894 KB；
- `public/scripts/extensions/memory-graph/main.js`：约 692 KB；
- `public/scripts/world-info.js`：约 543 KB；
- `public/scripts/openai.js`：约 463 KB；
- `src/endpoints/chats.js`：约 177 KB；
- `src/server-main.js`：约 46 KB。

此前审计还显示：

- `public/script.js` 约 2.2 万行、约 91 个静态 import；
- `world-info.js` 约 1.3 万行；
- `memory-graph/main.js` 约 1.6 万行；
- Atria 已经有动态 import、backend lazy router、Webpack filesystem cache、startup milestone、自助 profiler 和部分 Web Worker；
- 说明问题不是“完全没有现代化”，而是现代化能力已经形成，但旧宿主所有权和巨型模块仍然承载过多职责。

这些数字不能作为 R8 最终 KPI 基线。R8A 必须在最终合并后的 `main` 重跑同口径扫描。

---

## 3. 外部技术基线（2026-09）

调研依据：

- Node.js v20 已 EOL；v24 Krypton 为 LTS，v22 仍在 LTS 支持线。
  - https://nodejs.org/en/about/previous-releases
  - https://nodejs.org/en/about/eol
- ESLint v8 已于 2024-10-05 EOL；2026-09 当前主线为 ESLint v10。
  - https://eslint.org/version-support/
  - https://eslint.org/blog/2026/09/eslint-v10.11.0-released/
- Express 5 基础 API 接近 Express 4，但官方明确存在 breaking changes，因此应作为独立兼容性升级，而不是性能重构前提。
  - https://expressjs.com/en/guide/migrating-5/
- Webpack 官方仍推荐通过 dynamic `import()` / code splitting 实现按需加载和加载优先级控制。
  - https://webpack.js.org/guides/code-splitting/
- SillyTavern 本身仍在活跃维护，2026-09 已发布 1.19.0，因此 R8 的依据不是“上游过时”，而是 Atria 已经形成更复杂的产品和运行时架构。
  - https://github.com/SillyTavern/SillyTavern/releases

---

## 4. 绝对前置条件

开始前按 [Governance §8 / §12](../../README.md#8-task-lifecycle) 核对真实 main、任务分支和当前设计，确认相关前置已集成，再在真实基线上采集 R8A 数据。恢复只使用用户要求中断时的 `docs:HANDOFF.md`，不使用旧 `handoff/` 路径。

---

## 5. 核心目标

### 5.1 前端

将当前结构逐步从：

```text
large script.js / world-info.js / openai.js / feature mains
        ↓
global state + eventSource + DOM/jQuery
        ↓
all features initialize around one application graph
```

演进为：

```text
Atria Application Kernel
        │
        ├── Lifecycle Registry
        ├── Feature Registry
        ├── Command / Navigation Ports
        ├── State & Event Contracts
        └── Service Ports
                │
        ┌───────┼────────┐
        ↓       ↓        ↓
      Play    World    Runtime / Studio / Agents
                │
        当前实际使用的宿主接口
```

目标：

- `script.js` 从“应用本体”逐步降级为薄 bootstrap/composition facade；
- 重型 Workspace/功能真正 route/feature lazy-load；
- 巨型文件按明确领域边界拆分；
- 一份状态只有一个 owner；
- 事件 payload / lifecycle / service ports 有稳定契约；
- 新 Atria 核心代码不再直接依赖任意 legacy DOM 几何和全局变量。

### 5.2 后端

目标结构：

```text
HTTP Adapter / Router
        ↓
Application Service
        ↓
Domain / Repository Port
        ↓
FS / SQLite / MySQL / PostgreSQL
```

重点：

- `chats.js` 等大型 endpoint 逐步只保留 HTTP translation / validation / response；
- 业务语义进入 application service；
- persistence 继续通过现有 repository/storage engine；
- 更多低频 endpoint 可按证据转 lazy router；
- 不改变现有公开 API 行为，除非单独立项并有迁移计划。

### 5.3 开发效率

- 引入 architecture/import boundary guards；
- 收敛循环依赖和跨域直接 import；
- 关键 service/event contract 增强类型检查；
- 利用现有 TypeScript 工具做边界检查，而不是全仓 TS 重写；
- 让新功能默认进入 Feature/Service/Workspace 边界，而不是继续向巨型文件堆代码。

---

## 6. 不做的事情

R8 默认明确排除：

- 全项目 React / Vue / Svelte 重写；
- Vite/Rollup/其他构建系统大爆炸替换；
- 全量 TypeScript 重写；
- 删除 PNG / JSON / CharX / `.atria` 既有能力；
- 创建第二套 Conversation / Composer / generation / navigation / runtime authority；
- 重做 R0-R7 已定稿的产品架构；
- 无 profiler/benchmark 证据的缓存体系；
- 无测量证据的 segmented chat storage 大迁移；
- 将 Express 5 升级与核心架构拆分捆绑；
- 为了“现代”而改写稳定模块。

---

## 7. 当前契约边界

实施时核对真实调用方和当前 Plan。保留仍受支持的角色卡/世界书/聊天互换格式、原生服务职责及持久化一致性；不因旧 alias、DOM 节点或 namespace 曾存在而冻结它们。旧插件、全局 facade 和历史格式不默认构成兼容义务，已替代的入口随调用方一起删除。

现有服务仍是唯一权威；不要为兼容再包一层 Adapter。

---

## 8. R8 分阶段实施

### R8A — Architecture Baseline & Guardrails

先测量，后拆分。

必须产出：

- 合并后 `main` 的精确 SHA/tree；
- 前端模块规模和依赖图；
- >=100 KB 第一方模块清单；
- static/dynamic import 图；
- 循环依赖扫描；
- startup milestone 基线；
- server listening / first visible / Play ready；
- Workspace cold/warm open；
- Play↔Workspace route switch；
- Long Task / main-thread profile；
- heap / event listener / DOM node 基线；
- Android/Termux 启动基线；
- Node runtime matrix；
- plugin/API/DOM ABI 清单。

建立 CI guard：

- architecture import boundaries；
- forbidden cross-domain imports；
- no-new-global-owner；
- lazy feature boundary；
- plugin ABI smoke；
- core DOM ABI smoke；
- performance benchmark artifact。

**R8A 不允许先凭感觉拆巨型文件。**

### R8B — Application Kernel & Lifecycle

建立最小 Atria Application Kernel：

- bootstrap；
- lifecycle phases；
- Feature Registry；
- lazy feature descriptor；
- service-port registry；
- feature dispose/reload contract；
- 与 R7 Navigation / WorkspaceHost / Command Registry 对接。

将 `script.js` 的有效职责迁入所属模块并更新调用方；删除失效 facade。

### R8C — Route / Feature Lazy Loading

以真实 profile 选择最重的非首屏模块。

优先候选：

- Studio；
- Diagnostics Expert；
- Memory Graph inspector/editor；
- World Info authoring workspace；
- Character Editor AI；
- Storage/Backup advanced UI；
- provider deep configuration。

原则：

- 原生 ESM `import()` 优先；
- 保持一个 state authority；
- cold load 可变慢一点，但 startup / first Play 必须净收益；
- 不为了 code splitting 引入全量新 bundler。

### R8D — Frontend Domain Decomposition

按行为边界拆分巨型模块，不按“每文件 300 行”机械切割。

候选：

- `public/script.js`
  - app/bootstrap facade
  - conversation service/controller
  - generation coordination
  - character/group session
  - persistence bridge
- `world-info.js`
  - evaluation engine
  - persistence/service
  - authoring controller
  - workspace adapter
- `openai.js`
  - provider settings
  - prompt assembly
  - request runtime
  - model/preset UI
- Memory Graph
  - runtime/service
  - persistence
  - retrieval
  - orchestration bridge
  - UI/controller

拆分前核对现有契约和真实调用方；复用相关检查，仅在重要行为缺乏证据时补测试。

### R8E — Backend Application Services

重点拆：

- `src/endpoints/chats.js`；
- server startup router registration；
- generation / storage / backup 等高耦合入口。

优先目标：

- router 薄化；
- application service 独立；
- repository/storage port 继续复用；
- 请求 validation、domain error、HTTP response 映射分层；
- 低频 endpoint 的 lazy registration。

URL、response shape 和状态码按当前契约调整，同步真实调用方；不默认增加旧接口分支。

### R8F — State / Event / Type Contract Modernization

- 明确 state owner；
- event catalog + typed payload contracts；
- service ports JSDoc/TS declaration；
- 关键边界启用更严格 typecheck；
- 消除新代码对未声明 globals 的依赖；
- 收敛 event listener 生命周期和 dispose；
- 建立 cycle / forbidden import guard。

不做全仓 TypeScript 改写。

### R8G — Runtime & Toolchain Modernization

强制处理已经 EOL 的基础设施：

- Node 20 基线退出；
- 目标：Node 24 LTS 作为主要开发/CI/runtime 基线；
- 若 Android/Termux/第三方兼容仍需要，Node 22 作为最低兼容线；
- 对齐 `@types/node`；
- ESLint 8 → 当前受支持 ESLint 10；
- 迁移 lint config / 自定义规则；
- 更新 CI runtime。

Express 4 → 5：

- 独立兼容性 checkpoint；
- 执行 codemod，并在本地验证受影响 API/E2E；
- 若收益有限而 blast radius 明显，可以正式 defer；
- Express 5 **不是 R8 成功的硬依赖**。

### R8H — Final Performance & Architecture Hardening

最终要求：

- startup 不出现无理由回退；
- first Play / Workspace switch 有可解释结果；
- heavy feature 不再无条件进入首屏模块图；
- 巨型模块职责显著收敛；
- architecture guards 生效；
- Node/ESLint 受支持；
- 受影响的当前契约完成最小相关本地验证；
- final residual/dependency/cycle scan。

完成后才允许合并 `main`。

---

## 9. 性能原则和门槛

R8 不追求“所有指标都更快”，而要求任何复杂化都由数据支持。

### 必测

- Server listening；
- frontend bootstrap；
- first visible；
- Play ready；
- first chat usable；
- cold Workspace open；
- warm Workspace open；
- route switch；
- generation setup；
- World Info evaluation；
- Memory retrieval；
- large chat edit/append；
- JS long tasks；
- heap growth；
- listener/DOM leaks。

### 判断规则

- startup/Play 热路径新增 eager dependency：默认视为回归；
- 重型 feature 若可 lazy load，禁止重新静态挂进 bootstrap；
- 性能优化保持当前正确性契约；不能正确处理的已支持输入应修复或停用该优化，不默认保留双实现；
- 单一微基准不得代替 real-host browser profile；
- 缓存必须先有 invalidation contract；
- worker 化只针对经过 profile 证明的 CPU-bound 路径。

---

## 10. Runtime 策略

预期目标：

```text
Primary CI/runtime: Node 24 LTS
Compatibility floor: Node 22 LTS（仅在实际平台需要时保留）
Node 20: remove
```

R8A 必须验证：

- Windows/macOS/Linux；
- Termux；
- Android bundled Node；
- Docker；
- native addons（尤其 better-sqlite3 / tokenizer 相关）；
- CI matrix。

只有验证完成后修改 `engines.node`。

---

## 11. 分支策略

长期开发分支：

`refactor/atria-platform-architecture-modernization`

### 当前阶段

该分支只是从“当前 main”预留名称，**不能用于实现**。

### R7 合并后

Astra 必须：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch refactor/atria-platform-architecture-modernization
git merge --ff-only origin/main
git push origin refactor/atria-platform-architecture-modernization
```

然后验证：

```bash
git rev-parse HEAD
git rev-parse origin/main
```

两者必须完全相同。

若不能 fast-forward，说明预留分支被污染；不要 merge/rebase 复杂历史，先诊断并恢复为干净的 `main` 基线。

### 阶段提交

R8A-R8H 继续使用这一条长期 R8 分支，不在每个子阶段创建永久分支。

需要实验性高风险 PoC 时，可创建短命 `spike/*`，结论确认后删除。

最终：

`R8 final validated branch -> main`

合并验证后删除 R8 临时/长期重构分支，只保留 `main`、`docs` 和上游参考分支。

---

## 12. 文档规则

正式 Plan 为本文件；实施与测量事实写入同一 `docs:records/refactor/**` Record。文档与交接生命周期统一见 [Governance §5–§7](../../README.md#5-plans)。

---

## 13. 验证矩阵

按实际改动与风险选择现有静态检查、契约测试或浏览器流程，复用已取得且未受影响的证据；不把模块清单转成每阶段全套测试。性能改动测对应热路径，持久化改动检查相关引擎的一致性，设备特性改动按实际证据缺口验证。通用验证方式只归 [Governance §12 / §12.1](../../README.md#121-minimal-implementation)。

---

## 14. Astra 执行纪律

执行与真实阻塞分别见 [Governance §8](../../README.md#8-task-lifecycle) / [§13](../../README.md#13-stop-conditions)。

优先保持小步、可验证的架构切片，禁止一次跨越多个 ownership boundary 的大爆炸提交。

---

## 15. R8 完成标准

R8 不以“某个框架迁完”为完成标准。

完成意味着：

- 当前有效业务契约和数据完整性得到验证；
- Atria Application Kernel 成为新功能的默认宿主；
- 已替代的 legacy 入口和失效依赖已删除；
- 首屏不再无条件初始化大量非 Play 功能；
- 巨型核心文件职责有明显收敛并受架构 guard 约束；
- backend HTTP / application / repository 边界清晰；
- state/event/service ownership 明确；
- Node / ESLint 回到受支持版本；
- 性能结果有 before/after 证据；
- 受影响的当前 plugin / data / Game Runtime / Shell 契约完成相关验证，复用有效证据；
- 没有引入第二套核心 authority；
- 最终 R8 分支可安全合入 `main`。
