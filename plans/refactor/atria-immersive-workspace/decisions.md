# Confirmed decisions and draft choices

## Authority

本模块仅保存跨模块决策。表中“已确认”来自本任务用户答复；其含义不等于整体 Plan 已批准。推荐实施行为保持“草案”，D1 冻结后再进入代码实施。

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

## Draft defaults to review in D1

以下是为了让方案可实施而提出的默认规则，不伪称用户已经逐项确认。

| ID | 草案提议 | 处理边界 |
| --- | --- | --- |
| P01 | Enter 默认换行，Ctrl/Cmd+Enter 发送；统一现有 Send on Enter 设置与新输入区 | 修改输入策略前核对现有设置值和 IME 规则；所有发送入口使用同一策略 |
| P02 | 用户设定只提供持久会话选择，首轮不增加“一条消息临时身份”模式 | 旧临时/自动锁定行为保留在迁移来源，显式转换到当前会话选择 |
| P03 | 作品/入口可以声明是否使用玩家描述；首轮不建立自动 persona 推荐优先级 | 多个旧绑定只作待处理；不要猜测 avatar/角色/群组到 Native 实体的映射 |
| P04 | 归档作为默认管理动作；永久删除仅允许无引用闭包的资源 | 引用者修复与显式解绑后才可删除；不能级联改写时间线 |
| P05 | 重试同一已接受请求使用当时身份证据；重新输入/分叉后的新请求取其新上下文 | 与现有 retry/branch/lifecycle 的准确契约在 D1 核定 |
| P06 | 用户描述作为玩家提供资料，按类型和用途进入既有 Context/Prompt 管线 | 不提升为世界事实，不作为全局系统指令，不进入无关 Studio/记忆任务 |

## Scope changes relative to completed design

旧版的整体 SillyTavern 产品迁移已退役，本任务不恢复其导入整站配置、角色/聊天抽屉或全局扩展迁移。本次明确新增的是**用户设定数据**的原生重构及受控迁移，见 [personas.md](personas.md)。

用户补充 S20 属于新增能力，不能按“仅隐藏入口重新显示”估算。公共云同步、插件沙箱、全新共享协议并未因此纳入本次。

## Freeze record

- 当前：Draft；D01–D20 已确认，P01–P06 为建议。
- D1 输出：确认/修订建议项，补齐 personas 的 schema/API 与迁移试件范围，记录批准的实施阶段。不得把“继续整理讨论”解释为已批准产品实施。
