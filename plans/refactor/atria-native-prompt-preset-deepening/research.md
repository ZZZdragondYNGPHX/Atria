# 背景资料索引

本文件保留先前方案使用的参考线索，具体功能以[入口](index.md)及各模块为准。本轮以本地源码为依据，未重新核验下列外部资料，也不据此声称新的研究结论。

| 方向 | 参考 | 对应功能 |
| --- | --- | --- |
| 有序编排 | [LoomStudio PromptBuild](https://github.com/The-LoomStudio/LoomStudio/blob/10be7f6e460a19d96fe9a4ca4892234f938b0196/docs/architecture/application/prompt-build/README.md) | 原生有序条目、Anchor、来源贡献与正文变量分工 |
| 编译链分工 | [Loom Core 集成说明](https://github.com/The-LoomStudio/LoomStudio/blob/10be7f6e460a19d96fe9a4ca4892234f938b0196/docs/architecture/application/prompt-build/loom-core/studio-integration.md) | 沿 Atria 原 Compiler 实现，不复制另一运行时 |
| 局部提示词改进 | [GEPA](https://arxiv.org/abs/2507.19457) | 原 Evolution 的可选候选策略 |
| 长会话材料组织 | [ACE](https://arxiv.org/abs/2510.04618) | 来源、细节与增量材料维护的背景 |
| 响应分析 | [OR-Bench](https://proceedings.mlr.press/v267/cui25a.html) | 可选创作响应分析背景 |
| 前缀复用 | [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) | 沿原 Adapter 参数与 Provider usage |
| Provider 表达 | [Claude Prompt engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) | 任务、样例与作者原文组织 |

旧位置／depth 注入不作为新实现依据。Atria 的作者能力落实在 Program/Module、显式顺序、预览、模型选择与可选局部改进中。
