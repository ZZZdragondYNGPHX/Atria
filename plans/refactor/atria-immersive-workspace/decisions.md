# Confirmed decisions and draft choices

## Authority

本模块仅保存跨模块决策。D01–D20 来自前轮用户答复；P01–P06 是 D1 根据源码核对冻结的实施选择，不能写作用户逐项答复。2026-10-05 用户明确要求拉取远端并准备开工，随后授权普通问题自行处理，作为按本 Bundle 分阶段推进的授权。

## User-confirmed decisions

| ID | 已确认内容 | 权威细则 |
| --- | --- | --- |
| D01 | 保留浮动工作空间、现有配色与分层阅读气氛 | experience |
| D02 | English / 简体中文 | experience |
| D03 | 游玩优先 | experience |
| D04 | 平台衬线正文 / 无衬线控件；保留作品自有字体布局 | experience |
| D05 | 头像、叙述者/角色、回合元数据可并列辨认 | experience |
| D06 | 先进行多轮讨论，再形成正式 Plan | index、delivery |
| D07 | 桌面“历史与存档”默认收起，按需展开 | experience |
| D08 | 手机阅读隐藏五域底栏，使用顶部全局入口 | experience |
| D09 | Studio 右侧区域切换检查器 / AI | experience |
| D10 | Runtime 默认用途路线与就绪情况，提供缺项修复 | experience |
| D11 | Library 分类切换，默认作品 | experience |
| D12 | Agents 默认运行，保持固定会话范围；另有编排/记忆/诊断 | experience |
| D13 | 扩展管理按 Skills、Plugins、官方插图分组；会话工具另设入口 | experience |
| D14 | 自有界面保留独立宿主恢复入口，动作按真实能力提供 | experience |
| D15 | 分组快速搜索，跳至拥有者；部分来源失败保留其余结果/重试 | experience、states |
| D16 | 安装作品/导入存档采用 Library 完整流程页 | experience、coverage |
| D17 | Studio 世界/知识/资产页内设“资料库引用”页签 | coverage |
| D18 | 分阶段保留完整编辑能力，后续逐类重构 | delivery |
| D19 | Library 第四分类用户设定；游玩输入旁选择；账户和作品 Actor 独立 | personas |
| D20 | 新会话继承可用默认；已有会话独立，切换只影响后续输入/生成 | personas |

## D1 frozen implementation defaults

以下为实施者在既有偏好与兼容边界内冻结的默认规则；变更范围时更新对应权威模块。

| ID | 冻结处置 | 处理边界 |
| --- | --- | --- |
| P01 | Native AUTO 保持 Enter 换行、Ctrl/Cmd+Enter 发送；显式 ENABLED/DISABLED 在 Native 输入区生效 | 复用 send_on_enter 数值 -1/0/1；不迁移重写旧设置或改变 legacy AUTO 的桌面/手机规则。Shift+Enter 换行，IME composing/229 不发送；按钮与快捷键共用接受路径，A2 接线 |
| P02 | 接受：用户设定只提供持久会话选择，首轮不增加“一条消息临时身份”模式 | 旧临时/自动锁定行为保留在迁移来源，显式转换到当前会话选择 |
| P03 | 接受：作品/入口与任务显式 opt-in 玩家描述，旧作品默认不消费；首轮无自动推荐优先级 | 多个旧绑定只作待处理；不要猜测 avatar/角色/群组到 Native 实体的映射 |
| P04 | 接受：归档作为默认管理动作；永久删除仅允许无引用闭包的资源 | 引用者修复与显式解绑后才可删除；不能级联改写时间线 |
| P05 | 接受：Provider retry 固定捕获上下文；retryReply 继承原输入身份；新输入使用新分支上下文 | retryReply 有 post-user fork 与 typed transaction pre-effect + 重建输入两条路径，后一条须补原身份复制；见 personas |
| P06 | 接受：用户描述作为玩家提供资料，经 player_persona lane 和显式 consumer 进入既有 Context/Prompt 管线 | 不提升为世界事实，不作为全局系统指令，不进入无关 Studio/记忆任务 |

## Scope changes relative to completed design

旧版的整体 SillyTavern 产品迁移已退役，本任务不恢复其导入整站配置、角色/聊天抽屉或全局扩展迁移。本次明确新增的是**用户设定数据**的原生重构及受控迁移，见 [personas.md](personas.md)。

用户补充 S20 属于新增能力，不能按“仅隐藏入口重新显示”估算。公共云同步、插件沙箱、全新共享协议并未因此纳入本次。

## Freeze record

- 2026-10-05 D1：范围与实施默认冻结，D01–D20 保持；P01 按现有设置兼容修订，其余按表接受。
- 用户本轮开工与自主处理指令授权分阶段实施；A1–A5、B1–B4（逐资源 checkpoint）、F 顺序按 delivery。
- personas 冻结新增契约与迁移/兼容范围，validation C20 给出待实现测试；冻结设计不表示产品验收通过。
