# Plans

> 本分支保存设计编辑副本；正式执行、验证、配额与恢复只归 `docs` 分支，不从本分支历史内容恢复许可或停止要求。

Read the relevant Plan index and Record. Execution rules belong to [Governance](https://github.com/ZZZdragondYNGPHX/Atria/blob/docs/README.md).

Plans 记录实现前或实现期间的设计与理由，不承担实施历史。

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
