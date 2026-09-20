# Standalone-first Product Policy

> 状态：Approved product direction  
> 适用：Agent Runtime、Orchestration Engine、Agent & Memory Workspace 后续产品化。

## 1. 产品目标

长期目标是发布独立于 Luker 的类 SillyTavern Agent 应用。

因此 Luker 是当前 Host / 集成环境，不是未来 domain model 的定义者。

## 2. 决策优先级

1. 独立应用长期架构
2. 单一事实源
3. Runtime / Engine / Memory / UI 边界
4. 简洁稳定 schema
5. 可测试与可观察
6. 当前 Luker 集成便利
7. Luker 历史数据兼容

第 7 项默认可以牺牲。

## 3. 默认 breaking change

如无明确必要，不为以下内容保留长期兼容：

- 旧 preset schema
- global / character 双轨 preset
- character override 历史字段
- 旧 UI DOM
- 旧 Run Panel event shape
- 旧 Memory Inspector DOM
- 旧 import/export shape
- 旧 storage path

兼容需要证明值得保留，而不是默认要求。

## 4. 兼容例外条件

只有实现非常小并同时满足以下条件时才考虑：

- 不增加第二事实源
- 不需要双写
- 不扩大长期测试矩阵
- 不限制新 schema
- 能清晰隔离
- 能随时删除

否则采用新架构。

## 5. 允许的开发期 bridge

可临时存在：

- legacy caller adapter
- fixture importer
- A/B reader
- 一次性转换脚本
- 旧入口代理到新实现

完成 caller audit 与新路径验证后，应删除无必要 bridge。

## 6. Host Adapter 原则

通用层只认识：

- Agent / Plan / Graph / Result / Capability
- Runtime state/events/checkpoint
- Memory references / provider interface
- Preset / Binding
- Workspace ViewModel

Luker 专有概念放 adapter：

- character extension blob
- SillyTavern/Luker settings path
- chat DOM
- world info host glue
- current provider/preset resolver

未来独立应用可以替换这些 adapter 而不重写核心 Workspace。

## 7. Memory Provider 原则

Memory OS 是共享长期记忆核心。

LoreState、MVU、Chat history 等属于来源/provider，不把它们的内部 schema 写死进通用 UI domain model。

## 8. 测试原则

优先自动化与离线代理测试。

Android 真机、真实 provider/model、长期人工 RP 若无法自动完成，记录 coverage gap，由用户未来实际游玩检查，不阻塞阶段完成。

## 9. DoD

- 新 schema 不依赖 Luker 历史数据结构
- 不存在兼容导致的双重事实源
- 无必要长期 migration shim
- Host-specific 逻辑可隔离替换
- 核心 Agent/Memory Workspace 可朝独立应用继续演进
