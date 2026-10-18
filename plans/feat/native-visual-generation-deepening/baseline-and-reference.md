# Atria 视觉生成深化 — 基线与参考源码审计（E0）

> 审计日期：2026-10-14；
>
> Atria `main@7e1045ab836c22cafbc92c5de056ad701f56e723`；参考项目 `damoshen123/st-chatu8` 默认分支 `main`；本审计不代表未来 HEAD。

## 1. Atria 当前实际链路（与旧 ST 生图路径区分）

| 层次 | 文件/行为 | 静态结论 |
| --- | --- | --- |
| 官方前端 | `public/scripts/native/official-illustration.js`、`illustration-settings-ui.js`、`illustration-client.js` | 选择剧情选段、管理绘图角色/别名/固定描述/服装/预设、生成提示词与图片分步执行，提供单标注卡片与图片版本 |
| 安全呈现 | `illustration-surfaces.js`、`illustration-renderer.js` | 通过 canonical prose 选区关联标注，渲染选中图片版本；不需要把图片注入消息文字 |
| 角色/提示词契约 | `public/shared/illustration-plugin-contract.js` | 绘图角色库、作品级启用清单和单标注草稿；`composeIllustrationPrompt` 组合风格/质量/场景/角色固定与动态描述 |
| 提示词服务 | `src/native/illustration-prompt-service.js` | 独立 `role.illustration_prompt` 模型路线，JSON 输出 scene、characters[id,dynamicPrompt,clothing]；任务结果版本化 |
| 上下文源 | `src/native/illustration-context.js` | 使用标注历史 Revision 的原文/相邻段、前两轮历史与正式 context compiler 选中知识/状态；拒绝跨分支替代事实 |
| 图片协议 | `public/shared/novelai-illustration.js` | 官方能力集针对 NovelAI V3/V4/V4.5 文生图；|
| 图片服务 | `src/native/illustration-image-service.js` | 解析连接配置和 Secret，按 Resource 排队/取消；固定请求快照，调用图片 Provider，成功后 AssetStore 存图与标注版本 |
| Provider | `src/native/adapters/novelai-image-provider.js` | 发送 NovelAI 风格 HTTP 请求；|
| 持久化契约 | `public/shared/native-illustration-contract.js`、`src/native/illustration-service.js`、`src/native/session-illustrations.js` | `atri_illustrations` 呈现空间；annotation/imageVersion 与原文、Revision 和 Branch 绑定 |
| 资产引用 | `src/native/repositories/asset-store.js` |当前 Session 与 SavePoint 的插画引用参与保留/保护和清理|
| 任务系统 | `src/native/task-scheduler.js` | 并发/资源限制、优先级、取消、任务终态与晚到结果防护；当前任务队列主要是宿主内存投影 |
| 旧路径 | `tests/native/capability-retirement.test.js`、`src/server-startup.js` | 退役旧 `public/scripts/extensions/stable-diffusion`、`src/endpoints/stable-diffusion.js` 和旧 `/api/sd`；仍存在别的 NovelAI 端点不能据此认为 Native 插画已经具备所有旧功能 |

已完成的 [NovelAI 插画 Plan](../novelai-illustration/index.md) 将首期限定为官方与第三方 NovelAI 兼容接口，明确不做角色参考图/Vibe/全局批量生成；其边界仅适用于前一开发任务。本次新功能可重新讨论这些范围，但须定义新契约。

## 2. 主要能力缺口和重构点

图片服务默认 `createNovelaiImageProvider()`，连接接受 `provider.novelai-image` 和 compatible 类型。因此增加 ComfyUI、SD 或 OpenAI 不能仅在 UI 加菜单；还需通用 ImageRequest/Result/Evidence 契约和每类协议适配。

**支持范围（已证实）**：`officialNovelaiCapabilities()` 当前只列 V3/V4/V4.5 文生图；未确认 V5、参考图/Vibe、inpaint、其他绘图后端已经接入 *本原生插画管线*。虽存在旧端点/ComfyUI 工作流数据目录，不应混淆静态存在与 Native 产品接通。

**视觉连续性（能力空白）**：现有角色有固定 prompt、服装、alias、storyActorId，LLM 生成场景和临时动作；应与当前 Session/Actor/World 正式状态对齐，避免建设平行的剧情真相数据库。

**触发/自主性（能力空白）**：当前入口以选段/标注卡片为主，没有已证实的完整 Native Visual Director 自动审图触发管线。需要区分手动请求、候选建议、已授权实际花费与生成物回写。

**任务与恢复（已证实/待测）**：Scheduler 当前为内存任务投影（有任务保持/限流、状态查询），不能等同于所有图片作业具有崩溃持久化、外部 GPU 任务重认领或 Provider 退款保证。是否引入耐久作业日志需要单独设计。

## 3. st-chatu8 参考源码事实

- 参考仓库 [README](https://github.com/damoshen123/st-chatu8/blob/main/README.md) 仍显示旧 `1.0.0` 介绍，不反映全部现有能力；[manifest.json](https://github.com/damoshen123/st-chatu8/blob/main/manifest.json) 标识 `3.1.6`，含详细变更清单。
- `index.js` 是约 5 MB、约 11.3 万行的合并构建代码，模块标记可定位 `utils/imageInserter.js`、`utils/taskQueue.js`、`utils/llmRequest.js`、`utils/imagePromptGen.js`、`utils/characterprompt.js`、`utils/comfyui.js`、`utils/novelai.js`、`utils/banana.js`、`utils/runninghub.js`、`utils/iframe/novelaiInpaint.js`、`utils/iframe/comfyuiInpaint.js` 等。
- 可借鉴的产品能力（源码模块/更新记录可定位）：SD/NovelAI/ComfyUI/RunningHub 等后端；消息标记与流式预生成；独立 LLM 提示词编译/Tool Call；角色与服装档案；参考图/氛围/Vibe；自动触发；编辑/inpaint；任务管理/缓存；图片与视频素材。
- 存在基于旧 SillyTavern `extensions.js`、`script.js`、事件/DOM/聊天楼层存储、世界书等耦合。Atria 已主动退役部分旧端点/插件，**不可直接复制该执行链路**。
- [LICENSE](https://github.com/damoshen123/st-chatu8/blob/main/LICENSE) 声明 Aladdin Free Public License v9（AFPL），**不是 OSI 开源许可**，带分发尤其商业组织分发的限制。参考功能与标准协议，不复制实现及美术素材/预设版权内容；需要借用实质代码时必须单独完成许可判断和用户批准。

## 5. Evidence limits

上述是源代码阅读结论与设计风险，不包含：真实 NovelAI V5/ComfyUI API 可用性、跨平台 UI/真机表现、请求性能、生成图像质量、真实费用、任务重启恢复实测。未实测的项目不得标“已通过”。
