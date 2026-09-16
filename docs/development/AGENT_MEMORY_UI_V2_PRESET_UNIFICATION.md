# Agent & Memory UI v2 — Unified Preset Library ADR

> 状态：Approved  
> 基线：`custom-release@be3a2f573d54a63182cf47ca8c2f145e2accc973`  
> 产品方向：Standalone-first。

## 1. 决策

废除“全局 preset definition”和“角色 preset definition”两套独立定义。

以后只有一个统一库：

```text
Preset Library
├── preset-a
├── preset-b
└── preset-c
```

其他对象只保存引用：

```text
default -> preset-a
character:X -> preset-b
conversation:Y -> preset-c
```

同一个 `presetId` 永远只有一份 definition。

角色需要特化时：Duplicate preset -> 新 ID -> Bind。

## 2. 原因

当前 Luker `preset-library.js` 仍把四个 mode 各自分成 global / character 两个 scope，并在角色 extension blob 内保存完整 preset libraries 和 active IDs。

这会带来：

- definition duplication
- 编辑 scope 与生效 scope 混淆
- 删除/重命名/导入逻辑翻倍
- character 数据承载本不应属于 character 的共享 workflow definition
- 独立应用继续被 Luker 历史结构绑住

新架构不再继承该模型。

## 3. 新边界

```text
Unified Preset Store
       │
       ├─ Preset Definition
       │
       └─ Binding Store
              │
              └─ effective presetId
                     │
                     ▼
              Preset Compiler
                     ▼
             OrchestrationPlan
```

Definition 和 Binding 必须分开。

## 4. 建议数据形状

```js
OrchestrationPresetV2 = {
  schemaVersion: 1,
  id: 'preset_xxx',
  name: 'Deep RP',
  mode: 'agenda',
  planTemplate: {},
  editorMetadata: {},
};
```

```js
PresetBindingStore = {
  schemaVersion: 1,
  defaultPresetId: 'preset_xxx',
  entries: [
    { scope: 'character', subjectId: '...', presetId: '...' },
    { scope: 'conversation', subjectId: '...', presetId: '...' },
  ],
};
```

Binding Resolver 只返回 `presetId + selectionSource`。

## 5. Engine 关系

当前 Engine `compilePreset()` 能：

- 把 Luker 旧 profile 只读适配为 Plan；
- 若 `profile.orchestrationPlan` 已存在，则直接验证并使用原生 Plan。

UI v2 的新保存路径应逐步改为原生 authoring data -> OrchestrationPlan，而不是继续扩张旧 profile shape。

旧 adapter 仍可服务现阶段 host caller，但不是新产品 schema。

## 6. UI

不再显示：

- Global Presets
- Character Presets
- Edit Global / Edit Character
- Copy Global to Character

改为：

```text
编排预设
[New] [Duplicate] [Import] [Export]

Default: Daily RP
Current Character: Deep RP
```

详情显示：

```text
Preset: Deep RP
Selected by: Character Binding
```

“Selected by”描述引用来源，不描述 definition 的存储位置。

## 7. 删除语义

删除 preset 前检查新 Binding Store：

- default binding
- character binding
- conversation binding

处理方式必须显式：

- 重新绑定
- 清除绑定并 fallback default
- 取消删除

不得留下 dangling presetId。

## 8. Import / Export

导入统一进入一个 preset library。

导出新 schema，不区分 global / character。

旧 Luker preset importer 不是 DoD；只有低成本且不会进入长期产品架构时才可提供一次性 importer。

## 9. Compatibility policy

不要求：

- 旧 global preset 自动迁移
- 旧 character preset 自动迁移
- 旧 override 双写
- 旧 activePresetIds 永久读取
- 同名 preset 自动合并

开发期可短暂读取旧数据做 fixture/equivalence，但验证后应删除无必要 bridge。

## 10. Definition of Done

- 单一 preset definition store
- Binding 与 Definition 分离
- default/character/conversation 只保存 presetId
- stable ID
- Duplicate 创建新 ID
- 删除有引用完整性检查
- import/export 使用新 schema
- Preset Compiler 接受新 authoring data
- UI 无 global/character 双轨编辑
- 不为旧 Luker 数据维护第二套长期逻辑
