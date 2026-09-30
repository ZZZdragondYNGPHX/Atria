# Atria Native Experience Modes & Capability Deepening — Boundaries & Historical Discussion

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 十二、历史讨论：SillyTavern / MVU 能力吸收清单（早期初稿，非实施清单）

> 本节是早期压力测试输入清单，已由 §23–§28 与 §0 Implementation Baseline 收敛。实施阶段不得按此列表机械迁移 Legacy 功能。

以下是当时用于拆解能力的历史清单：

1. 自定义开局 HTML / 多步表单
2. alternate greetings / 开局跳转
3. 正文尾状态栏
4. 正文穿插状态块
5. `story_options` / 快速回复
6. 点击按钮 → 自动填入输入框
7. 点击按钮 → 自动发送
8. MVU `stat_data` 展示
9. MVU 初始化变量
10. MVU 变量更新与 Native State 映射
11. 变量驱动条件显示
12. 变量驱动 Knowledge / World Info 激活
13. 消息局部 display-only 替换
14. prompt-only / display-only 内容隔离
15. modal / drawer / sidebar
16. swipe / alternate message interaction
17. Message-local UI
18. 响应式移动端角色卡前端
19. Regex 前端迁移
20. legacy third-party compatibility bridge

后续可能补充 Tavern Helper / CardApp / LoreState 等生态常见能力。

---

## 十三、不能直接复制的 SillyTavern 机制

本任务目标是吸收能力，而不是复制历史接口。

### 不直接 Native 化 `triggerSlash`

旧：

```text
triggerSlash('/send ...|/trigger')
```

Native：

```text
composer.set / composer.submit
```

### 不直接 Native 化 Regex HTML UI

旧：

```text
Regex → HTML / JS
```

Native：

```text
Message Projection / Component
```

### 不让 MVU 成为新的核心状态系统

旧 MVU 作为兼容 Provider。

新游戏事实由 Native World / Session Runtime 承担。

---

## 十四、运行时边界

深化 Experience 不能制造第二套：

- Conversation 数据
- Composer / send pipeline
- generation runtime
- World State
- Event Journal
- Session persistence
- branch / retry / revision
- Knowledge runtime
- Memory runtime
- Orchestrator runtime

Experience 只是 Native runtime 的声明式 UI / interaction layer。

所有世界事实写入必须继续经过明确 Native authority。

---

## 十五、安全与 Package 权限

后续设计必须延续当前 Package 安全模型：

- 不运行任意 Package JavaScript；
- Component / Formula / Template 都是受限声明式数据；
- UI actions 只能调用允许的 Native capability；
- 自定义 UI 与 runtime command 权限继续显式声明；
- 网络 / clipboard / world write 等能力继续经过 Package permission；
- Message Projection 不允许重新打开任意 HTML script 注入路径。

---

## 十六、与现有 Immersive Mode 的关系

现有 `docs:feat/immersive-experience-refactor.md` 解决的是：

> 普通聊天之上的沉浸 Presentation Layer。

本企划解决的是：

> Native Package 的 Component / Hybrid / Full Experience authoring/runtime capability。

两者不是同一层：

- Immersive Mode：用户侧通用剧情呈现层；
- Native Experience：Package 所拥有的声明式 UI / Game front-end contract。

后续实现必须避免二者互相争夺同一 Stage / DOM ownership，并明确组合规则。

---

## 十七、历史讨论：早期未冻结问题（已由后续章节收敛）

> 本节保留早期讨论痕迹，不再代表当前未决列表。实施时以 §0 与后续案例收敛结论为准。

当时尚未冻结的内容包括：

- Component Model v1 增量扩展还是推出 v2；
- Local UI State 的持久化生命周期；
- Message Projection 的数据格式；
- rich-text 是否允许受限 Markdown；
- Component 是否允许 message presentation replacement；
- Message-local state snapshot 语义；
- Hybrid 的 layout route / wizard 切换方式；
- Full 是否必须支持无 Conversation / 无 Composer；
- Form validation contract；
- Action composition / sequence / transaction；
- Template 语法选择；
- Legacy MVU provider 如何映射 selector；
- ST Regex frontend 自动迁移能做到多大程度。

---

## 十八、历史讨论：原计划讨论顺序（已完成 / 已被后续压力测试取代）

### Round 2 — SillyTavern + MVU Feature Inventory

逐项审计旧生态能力，明确：

- 用户真正依赖的行为；
- Atria 现状；
- 应落入的 Native 子系统；
- 是否需要兼容层；
- 是否应该淘汰。

### Round 3 — Component Model vNext

定稿：

- primitive
- form
- local UI state
- expression
- action
- composer
- surface

### Round 4 — Message Projection

定稿：

- message block model
- status / quick action
- prompt/display isolation
- history / swipe / revision semantics

### Round 5 — [历史草案，已取消] MVU / Legacy Migration

当时曾计划讨论：

- provider bridge
- stat_data mapping
- Native World migration
- Regex frontend migration
- compatibility boundary

> 后续 §23 明确纠正：本任务不建设 SillyTavern / MVU 自动迁移体系；旧生态只作为 Capability Benchmark。

### Round 6 — Mode Contract & Authoring UX

定稿：

- Component / Hybrid / Full manifest contract
- Studio editor
- preview
- diagnostics
- migration tooling

全部讨论冻结后，再拆实施阶段和正式工作分支。

---

---
