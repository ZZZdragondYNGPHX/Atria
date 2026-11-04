# 狀態系統

Atria 向擴充提供角色、聊天和預設狀態。各命名空間保存各自的資料，擴充無需直接修改角色卡或聊天訊息即可管理狀態。

聊天狀態屬於具體聊天。Floor State 在其基礎上讓擴充狀態與目前訊息和 swipe 歷史保持一致。請透過儲存 API 存取資料，具體持久化方式由所設定的儲存引擎負責。

可用操作見[聊天與狀態 API](/zh-TW/development/extension-api/chat-and-state)，支援回退的狀態見 [Floor State](/zh-TW/development/extension-api/chat-and-state#floor-state)。
