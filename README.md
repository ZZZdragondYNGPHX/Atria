# Package Workspace

这是 Atria 的长期独立游戏 / Package 资产工作空间。

## Layout

每个游戏/Package 使用一个顶级目录，并在自己的 `releases/` 下保存历代 `.atria` 成品：

```text
<game>/
├─ README.md
├─ ...game-specific development files...
└─ releases/
   └─ <version>.atria
```

只有游戏自己的开发资料属于这里。不得为了获得 Atria 产品源码而 merge `main`，也不得把独立工具或 repository-agent Skills 放进本工作空间。

当前已迁移资产：

- `native-heavy-frontend-reference/`

复杂或多阶段 Package 工作的 Plan / Record 分别存放于 `docs:plans/package/**` 与 `docs:records/package/**`。
