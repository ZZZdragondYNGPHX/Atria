# B4 — UI, Assets, Skills, Plugins and official illustration mapping

顺序 UI→Assets→Skills→Plugins→official illustration；先映射再修复。保留原组件/tokens和完整 Source/manifest，不重复实现已满足设计的专属文件编辑器。

| 表面 | 字段/动作/模式、草稿/修订/authority | 状态差额与验收门 |
| --- | --- | --- |
| Studio UI | owner/Experience、Source Graph(component/node/binding/view/style/state/interaction/message)、完整 Native source/任意nested JSON contract path/node text属性/CSS；Features/permissions/remoteOrigins；Check/Review/Preview/Reload/诊断定位 | 原 drafts/originals per-file、baseRevision、frontend.patch/source.write、StudioService evaluate/Workspace stageOperations；结构表单未 Review 的输入要计 dirty，source/structured冲突明确拒绝；异步evaluate之后复验selection再stage，不提交旧surface |
| Assets | id/logicalName/path/mediaType/任意metadata JSON、文件import/replace/rename/preview/UsedBy/remove/cancel；完整assetFiles集合Source在Studio源视图 | 原 source.move/write/delete + project.save 同Workspace，contentHash后端不可变/manifest闭包；binary只读预览，Source完整不截断；迟到listSources/arrayBuffer/UsedBy不在取消/换project后stage；显式Cancel/Edit重开需dirty guard |
| Skills | installed/builtin、filter/category/scope/new/import(URL/file/builtin)/refresh/move/rename/delete；filetree/new/rename/delete/save/fullSource、SKILL.md frontmatter与附件 | 原 context.skills CRUD/writeFile expectedSha256；原popup/editor全文件与scopepicker；readonlybuiltin隐藏写动作；保持canonical server frontmatter与optimistic冲突；原测试/服务/browser gate |
| Plugins | external/local/builtin/official；HTTPS install/refresh/update/delete；name/enabled/global/preset/work scopes、entrypoint/fullfiletree/source/savedCASrevision/status | 原extension client/install/save/expectedRevision/runtime，更新后停用；迟到确认重验editor sequence/dispose再mutation，保存receipt/readretry；不新增执行authority |
| Illustration configuration | enabled、characters(id/name/aliases/fixedPrompt/defaultClothing/enabled/storyActorId)、全局/作品characterIds/presetoverride/imageConnection/promptRoute、style/quality/negative/NovelAI完整params、模板/恢复/保存 | 原assertIllustrationSettings/CAS client、renderIllustrationPreset；只读查看作品范围不生成覆盖；已有prompt版本不变；完整Source需可达，非法JSON不丢原文、不私自删advanced/unknown |
| Illustration cards/tasks/history | selectedtext/annotations、角色增删/appearance/clothing/blocks/save、prompt task/image task各自generate/cancel、explicit最新版角色/preset/preview/applypromptversion/showimageversion/hide/delete/close | 原annotations/exactSession/message身份/Prompt和图片service+taskcancel+SDKcleanup；保留生成中/取消中/错误/readonlyhistory/placeholder，不合并两种task状态 |

入口：native/studio-frontend-editor.js、asset-editor.js、extensions-workspace.js、illustration-{settings-ui,preset-ui,surfaces,renderer}.js、official-illustration.js、skills/{skill-manager-panel,skill-editor,scope-picker}.js。Project编辑仍human Workspace/ChangeSet；Skills/Plugins/插图各自服务独立。Shared描述停用。执行仅当前触及面的unit/canonical/source/async/CAS/browser并在Record实记，不声称真实外部provider/设备全部通过。
