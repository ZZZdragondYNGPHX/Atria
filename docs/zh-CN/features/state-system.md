# 状态系统

Atria 向扩展提供角色、聊天和预设状态。各命名空间保存各自的数据，扩展无需直接修改角色卡或聊天消息即可管理状态。

聊天状态属于具体聊天。Floor State 在其基础上让扩展状态与当前消息和 swipe 历史保持一致。请通过存储 API 访问数据，具体持久化方式由所配置的存储引擎负责。

可用操作见[聊天与状态 API](/zh-CN/development/extension-api/chat-and-state)，支持回退的状态见 [Floor State](/zh-CN/development/extension-api/chat-and-state#floor-state)。
