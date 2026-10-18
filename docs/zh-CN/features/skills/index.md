# Skills

Skill 提供可复用的过程指导。安装 Skill 不会向原生 Plan 授予工具、Source 访问权或执行权。

## Skill 的结构

一个 Skill 是一个目录：

```
director-anti-cliche-zh/
├── SKILL.md          # 必需 —— frontmatter + 正文
├── references/       # 可选 —— 辅助清单、更长的参考资料
├── examples/         # 可选 —— 真实示例
└── assets/           # 可选 —— 二进制附件
```

`SKILL.md` 是唯一必需的文件。它带着 Anthropic 标准的 YAML frontmatter：

```markdown
---
name: director-anti-cliche-zh
description: 叙事写作的反八股模式。
license: MIT
metadata:
  author: Atria Team
  version: 1.0.0
  tags: [writing-rules, zh, director]
---

# director-anti-cliche-zh

本 Skill 记录叙事写作中应避免的八股模式……
```

- `name` 和 `description` 是必需的。
- `license` 和 `metadata.*` 是可选的，遵循 Anthropic 标准。Atria 不引入私有命名空间。
- 正文就是「契约」—— agent 读取这个 Skill 时，正文就是它消费的内容。要写得直接、命令式；把「什么时候用」「怎么用」「优先使用哪些工具」等指导都放进正文。

完整的写作手册见 [创作 Skill](/zh-CN/features/skills/authoring)。

## 作用域

Skill 支持 `global`、`project`、`package`、`preset` 和 `character`。Project 路径使用 `project/<projectId>`；Package 使用 `package/<packageId>/<packageVersionId>`；预设使用 `preset/<name>`，不含 API 段。只有属于当前上下文的作用域参与选择。

原生 Project/Package 按 global → project → 精确 Package 版本的顺序覆盖；保留的聊天选择按 global → 当前预设 → 角色卡覆盖。这两种上下文不同，移动或改名可能改变实际选中的内容，编辑后应重新核对消费者。

预设和角色卡的 Skill 仍可通过 `embedded_skills_source` 随原始资产导出。导入这些内容不会导入可执行的原生 Plan。

## 调用与执行

在 **Extensions → Skills** 管理已安装内容和调用设置。Skill 可关闭、始终纳入，或在消费者支持时按需读取。原生 RP 为 Narrator 捕获所选始终纳入指导的精确安装版本，不把这些指导继承给独立 Actor。

Skill 不授予 Source 访问权或能力。Host 准入的 Plan、当前资源 pin、角色上下文和输出合同仍是权威。目录条目或正文里的工具名不能证明当前运行时提供该工具。见[原生 Plan 与 Run](/zh-CN/features/native-orchestration)。

## 内置指导

内置页列出当前随 `default/skills/global/` 提供的写作与方法 Skill。`director-character-voice-zh` 等名称标识可复用指导，不启用已退役的 Director 执行协议。安装内容不会自动让所有 Agent 消费它。

安装和编辑见 [Skill 管理](/zh-CN/features/skills/management)，文件格式及示例见[创作 Skill](/zh-CN/features/skills/authoring)。
