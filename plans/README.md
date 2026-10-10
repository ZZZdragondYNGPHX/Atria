# Plans

## Directory map

| Category | Plans |
| --- | --- |
| Architecture | [Architecture](architecture/README.md) |
| Features | [Features](feat/README.md) |
| Fixes | [Fixes](fix/README.md) |
| Refactors | [Refactors](refactor/README.md) |
| Packages | [Packages](package/README.md) |
| Tools | [Plugins](plugin/README.md) |

Read the relevant Plan index and [Record](../records/README.md). When resuming a user-requested interruption, read the existing [HANDOFF](../HANDOFF.md) first. Execution rules belong to [Governance](../README.md), not individual Plans.


Plans 记录设计与理由，不定义执行许可。测试数字如非产品契约仅是工程建议；最小相关本地验证与 API 配额统一见 [Governance §12 / §13.1](../README.md#131-api-测试执行规则)。

按语义放入 `feat/`、`fix/`、`refactor/`、`package/`、`plugin/`、`architecture/` 等目录。

## Single-file Plan

设计足够紧凑时使用单文件，例如：

```text
plans/feat/custom-start-form.md
```

## Plan Bundle

大型项目使用项目目录：

```text
plans/package/example-project/
├─ index.md
├─ decisions.md
├─ nation.md
├─ religion.md
├─ economy.md
└─ ui.md
```

`index.md` 是唯一必需入口，负责把 Agent 路由到当前阶段需要的模块。

详细规则必须只有一个权威模块；依赖模块链接回权威来源，不复制。

`decisions.md` 可选，只保存跨模块冻结决策。

使用 Bundle 时：先读 `index.md` → 只读当前阶段模块 → 只更新实质变化的模块；路由/依赖/阶段映射/跨模块冻结决策变化时再更新 `index.md`。

模板位于 `templates/PLAN-BUNDLE/`。
