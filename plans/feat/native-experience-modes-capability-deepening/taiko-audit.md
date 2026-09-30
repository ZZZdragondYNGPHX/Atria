# Atria Native Experience Modes & Capability Deepening — Taiko Heavy-Frontend Audit

> Governance 1.1 migration: the detailed Plan text below is preserved from the former monolithic Plan; this module now owns only the domain named above.

## 二十一、重前端 MVU 案例审计：太阁立志前端正则

本轮使用一份约 611 KB 的重前端 MVU Regex 成品作为压力样本。该成品表面上是 AI_OUTPUT Regex HTML，实质上已经是一套完整 Vue/Pinia 单页游戏前端：

- 24 个 Vue Component；
- 自定义开局 Prologue + Setup Form；
- 正文阅读与历史楼层阅读；
- 选项直发 / 回填；
- 人物、势力、个人、世界、地图等多 Panel；
- Town / Store / Trade Drawer & Modal；
- Hex Battle；
- 卡片/称号解锁 UI；
- PC / mobile / handheld 三种布局；
- Fullscreen / pseudo-fullscreen；
- Gamepad focus/navigation；
- LocalStorage 偏好与自动存档；
- MVU `stat_data` 读写；
- AI 输出标签解析；
- 自定义消息生成流水线。

这类案例说明，未来 Atria 不能只以“状态栏”理解 MVU 前端生态。高阶卡已经把 Regex HTML 当成了一个轻量游戏运行容器。

### 21.1 应吸收的精华：四层前端状态

该样本实际存在四种不同状态，不应继续混成一个 `stat_data`：

1. **Authoritative World State**
   - 人物属性；
   - 技能等级；
   - 装备；
   - 金钱 / 物品；
   - 世界时间 / 地点；
   - 势力 / 事件；
   - 战斗最终结果。

2. **Local UI State**
   - 当前 tab；
   - modal / drawer 是否打开；
   - 当前选中地点 / 商店；
   - shopping cart；
   - battle cursor / pending selection；
   - setup form fields；
   - reading mode。

3. **Player Preference State**
   - PC/mobile/handheld display mode；
   - option click 是“直发”还是“回填”；
   - UI zoom / input preference 等。

4. **Message / Projection State**
   - 当前正文；
   - `options`；
   - `BattleStart`；
   - `Awaken`；
   - `Title`；
   - 当前 message-local structured blocks。

因此 v2 设计需要在既有 Local UI State 之外，预留独立的 **Package Player Preference State**。它不属于 World，不随 Branch 回滚，也不应由角色卡写入任意 account settings。

### 21.2 Read-only Package Data Resources

该样本大量内置：

- 技能定义；
- 称号定义；
- 物品 catalog；
- 城镇/设施 catalog；
- 历史事件 timeline；
- 地图节点；
- 地图道路；
- 价格表；
- 战斗地图定义。

这些既不是 World State，也不是 UI State，而是**版本化只读 Package Data**。

因此新增设计结论：

> Component Model v2 / Game Runtime 必须能安全读取 Package-owned JSON Data Resource。

候选：

```text
data.catalog.*
data.table.*
data.graph.*
```

具体资源类型可以后续统一成一个 `data` resource + schema，不必一开始分太细。

Selector / Expression / Command 均可只读访问该资源，但不能运行 Package JS。

### 21.3 Derived State / Projection

该前端大量逻辑不是“写变量”，而是从权威状态派生：

- 称号 bonus → effective stats；
- 当前地点 → 可访问设施；
- 当前持有物 → 可售商品；
- 身份/日期 → 历史事件；
- 位置/道路 → 路径；
- 装备名 → 战斗属性；
- 技能/流派 → 可解锁卡片。

这说明 Selector 不能只做标量公式。

v2 后续需要一个**受限 Data Projection 能力**，至少能覆盖：

- lookup；
- filter；
- map/project；
- sort；
- contains；
- length；
- object/array → stable array projection。

复杂图算法（如 shortest path）不应通过任意 JS 实现；可后续作为经过审计的标准 builtin 能力加入。

### 21.4 Message Projection 已有现实原型

该样本会从 assistant message 中解析：

- narrative container；
- options；
- battle setup JSON；
- unlock/title tags。

然后分别映射到正文、Quick Action、Battle UI、Card UI。

这正是 Round 4 Message Projection 所要 Native 化的现实原型：

```text
Assistant Turn Result
├─ narrative
├─ structured blocks
├─ actions
└─ typed outcome hints
```

不应再靠 Regex 扫 HTML tag + JS DOM。

### 21.5 Host Capability 需求补充

该样本还暴露出 v2 必须考虑的 Host capability：

- Composer prefill / submit；
- Native generation busy state；
- History/Timeline read；
- Save/Restore；
- Fullscreen；
- keyboard focus；
- Gamepad navigation；
- responsive device/orientation；
- modal/drawer focus ownership。

其中：

- Save/Load 应落到 Native SavePoint / Branch；
- Fullscreen 应为显式 Host capability；
- Gamepad / keyboard focus 应由 Host 提供语义 focus navigation，而不是 Package 自己遍历 DOM；
- Package 只声明 focusable/action priority，不自行接管全局 input。

### 21.6 Heavy Frontend 与模式边界

这类前端不代表所有 MVU 卡都应使用 Full。

判断仍看布局 ownership：

- 仅正文尾状态 / Quick Actions → Component；
- 仍以聊天为中心，但有 Setup / Town / Map / Inventory / Battle overlay → Hybrid；
- Package 主界面完全替代聊天，Conversation 只是一个可选服务 → Full。

模式与“前端复杂度”仍然正交。

### 21.7 “额外变量更新 API”分析

如果“额外变量更新 API”指：

> 允许前端像 `Mvu.replaceMvuData()` 一样直接对任意 World State 路径做 patch，

则**不建议引入**。弊大于利。

主要问题：

- 形成 UI 与 Game Runtime 双重事实源；
- 绕过 Command validator / reducer；
- 绕过 Event Journal；
- Branch / Retry / SavePoint 难以正确回滚；
- 很难回答“谁改了这个变量、为什么改”；
- UI mount/refresh 可能产生隐藏副作用；
- 迁移、schema version、权限和 diagnostics 都会恶化；
- Package UI 一旦有任意 patch 权限，声明式安全边界被实质打穿。

但是该样本明确证明另一件事：

> **Atria 必须支持“不调用 LLM，也能由 UI 触发权威状态变化”。**

例如：

- 换装备；
- 购买/出售；
- 增加训练经验；
- 领取称号；
- 战斗结算；
- 初始化住所；
- 应用历史事件；
- 使用道具。

这个能力**利大于弊，而且是重前端游戏卡必需的**。

### 21.8 结论：引入“能力”，不引入“裸 patch API”

建议不新增第二套 `world.patch(path, value)`。

继续以：

```text
UI
 ↓
typed Command
 ↓
validator
 ↓
Event
 ↓
Reducer
 ↓
World State
 ↓
Session Revision / Event Journal
```

作为唯一权威写入路径。

为了避免每个简单变量修改都必须手写 Command + Event + Reducer 三层 boilerplate，可以在 authoring 层增加 **Declarative Mutation shorthand**。

例如概念上：

```json
{
  "id": "equipment.set",
  "argsSchema": {
    "slot": "string",
    "item": "string"
  },
  "when": "catalog/equipment contains args.item",
  "assign": {
    "player.equipment[args.slot]": "args.item"
  },
  "event": "equipment.changed"
}
```

Build 时将其**编译/降低成标准 Command → Event → Reducer**。

因此：

- Runtime 仍只有一个 authority；
- Studio 作者写起来接近 MVU 的“更新变量”；
- importer 也容易把常见 `replaceMvuData` 操作迁移成 Native Mutation；
- 每次变更仍有 Revision / Event / provenance。

### 21.9 Mutation shorthand 的边界

适合：

- 单纯赋值；
- 增减计数；
- array/object add/remove；
- 小规模 deterministic patch；
- 初始化明确缺省字段；
- UI 操作产生的简单状态改变。

不适合：

- 交易事务；
- 战斗结算；
- 多条件技能升级；
- RNG；
- 跨多个复杂对象的原子规则；
- 需要 chained Rule 的逻辑。

这些仍使用正式 typed Command。

建议 Mutation shorthand 必须：

- 声明允许写入的 schema path；
- args 经过 schema 验证；
- expression 纯函数；
- 不能动态构造任意 root path；
- transaction atomic；
- mutation 自动生成/关联 Event；
- 进入 Revision / Journal；
- Branch-aware；
- 有 before/after diagnostics；
- 支持 simulate / preview；
- 不允许从 component render/mount 自动执行，只能由明确 Action 或受控 lifecycle trigger 调用。

### 21.10 初始化与数据迁移单独处理

该样本还会在 UI refresh 时修正旧字段、清理旧物品字段，这在 legacy MVU 中很实用，但 Native 不能让 Component mount 顺手改 World State。

需要单独设计：

- Package / World schema migration；
- Session bootstrap；
- versioned one-shot migration。

它们必须幂等、有版本、有 provenance，并与普通 UI mutation 分离。

### 21.11 Autosave / Load 不使用变量 API

该样本用 LocalStorage 保存：

- floor id；
- MVU snapshot；
- preview；

读档时删除后续 chat floors，再 replace MVU snapshot。

Native 不应复制这个模式。

直接映射为：

- Quick Save → Native SavePoint；
- Load → restore/fork from Revision；
- 历史阅读 → Timeline projection；
- 分支切换 → Branch facade。

### 21.12 Round 3 增补冻结建议

基于该重前端案例，建议新增冻结项：

1. v2 增加 read-only Package Data Resource。
2. Selector 后续增加受限 Data Projection，不只标量公式。
3. 设计 Package Player Preference State，与 Local UI / World State 分离。
4. 增加 Host Fullscreen capability。
5. Host 统一承担 keyboard/gamepad focus navigation。
6. 引入 **Declarative Mutation shorthand**，但 Runtime 仍统一降低到 Command/Event/Reducer。
7. 不提供任意 World State patch API。
8. UI mount/render 不允许隐式修改 World State。
9. 初始化/迁移使用独立 versioned bootstrap/migration contract。
10. Message Projection 需要直接支持 structured block，而不是依赖 Regex HTML tag parser。


---
