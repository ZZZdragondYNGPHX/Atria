# Plan Bundle Template

当单个 Plan 已经大到不适合阶段执行时整份读取，使用 Plan Bundle。

示例：

```text
plans/package/my-project/
├─ index.md
├─ decisions.md
├─ nation.md
├─ religion.md
└─ economy.md
```

规则：

- `index.md` 是唯一入口和路由权威。
- 模块文件只拥有自己的领域。
- 详细规则不要跨模块重复。
- `decisions.md` 可选，只保存跨模块冻结决策。
- 每个阶段在 `index.md` 中列出精确必读模块。
- Agent 先读 `index.md`，再只读当前阶段所需模块。
