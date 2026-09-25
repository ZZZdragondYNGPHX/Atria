# 配置 Native Agents

1. 在运行时中创建连接，按需引用已保存的 Secret。创建模型、生成配置和提示词资源，再用这些精确修订创建运行时路由。
2. 打开 Agents → 编排，选择 Spec、Loop、Agenda 或 Director，为所需角色选择运行时路由并保存编排配置。
3. 如需语义记忆检索，在运行时 → 检索中创建嵌入资源，按需配置重排，再在 Agents → Memory 中选择精确修订。
4. 打开 Native 会话并运行工作流。在运行记录和诊断中查看失败原因，返回对应的运行时资源修正配置。

Secret 和运行时配置归玩家所有，不随作品分发。已安装作品内容不可直接修改；项目修改通过 Studio → ChangeSet → Review → Apply 完成。

可选全局插件只有 Regex 和 Search Tools。编排与记忆属于 Agents，无需安装扩展。
