# 当前任务交接

## Task

- Task ID: refactor/original-occult-western-fantasy-open-roleplay
- Primary Workspace: package
- Current game branch: refactor/original-occult-western-fantasy-open-roleplay
- Current game implementation HEAD: 25b39d57eb206b4c6b09d4642d0c458c8d9e5784
- Base / stable Package HEAD: 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e
- Core auxiliary branch: refactor/open-roleplay-core
- Core implementation / tested HEAD: 1661af11245c856363bfc1084275c02b55a97452
- Core base / unchanged main HEAD: c8d2d0e0c11c283ade2fa3c730740a0dc480c746
- Core integration: pending；P4 必要读口修复也保留在原辅助分支，尚未合入 main。
- Current stage: Phase 4 complete; Phase 5 pending
- Plan entrypoint: plans/package/original-occult-western-fantasy-open-roleplay/index.md
- Record: records/package/original-occult-western-fantasy-open-roleplay.md（唯一，保留 Phase 0–3，新增 Phase 4）
- docs HEAD: 以实际远端 docs ref 为准，不嵌入本文件自身 hash。
- Phase 5 required modules: implementation-staging.md、verification.md；按最终集成实际影响读 runtime-contracts.md Phase 2/3/4、frontend.md 或相关游戏领域。冻结方向不重开。

## Completed

Phase 0–3 原有参考/方向/Core A/B/C/内容闭环保留。P4 在原游戏分支完成真实 Native 问卷、模式/背景复核、单列故事阅读、可增长输入与草稿建议、右缘随身记事、自身/人物/物件/地点见闻/保存、普通和铁人终局显示。默认 Open Lives 3.0.0 compiler 已替换 neutral shell，编译 OpenLives/Companion 与受限 controller/model/CSS/public catalogue；旧 Inquiry/历史发布/参考保持原样。只绑定派生 roleplay_summary / roleplay_visible，Host begin/composer/save/run 保持权威；19 事务/17 玩家原语与 2 jobs 不变。

必要 Core 接入缺口在原辅助分支修复：host.conversation.recent 读取最多 32 条最新或向前消息；铁人墓碑保留安装身份/hash，清理后可重新打开只允许终局 run/status 和 Host exit 的 Native epoch，不重建 Session、不恢复数据、不允许其它读写/restore。旧墓碑若无 origin，仍有 /run，但不承诺此图重开。具体契约以 runtime-contracts Phase 4 / 游戏 runtime/ROLEPLAY.md 为准。

问答确认单 CAS / 零模型，未知响应同确认重试或只读恢复；失败保草稿并阻挡未确认再发送。新回复保留回读窗口，用户明确返回最新。Native overlay 负责 focus/inert/Escape/返回；输入随文档流，纸色/黄铜方向和衬线层级保留，修正小字对比，44px 触控与 reduced motion。P4 使用正式要求的本地 frontend-design/ui-ux-pro-max/emil-design-eng 和本地浏览器指引。

## 最新工作约定

用户 2026-10-04 最新 AGENTS.md：**每阶段及任务完成时，只在本地执行最小相关验证。** 推送后核对 refs 仅为发布确认；不启动、等待或依赖远端 CI/GitHub Actions。本轮没有远端验证。

保护无关 dirty：Core AGENTS.md；docs README.md、WEB-PERSISTENT-PROMPT.md、templates/HANDOFF.md、templates/RECORD.md。未纳入任务提交；后续仍应保留。

## Validation

P4 实际 UI 九组通过：编译 Native/QuickJS/bridge 和 Host composer/save/restore，隔离 FS、回环合成 HTTP provider、Playwright Chromium 141 headless；问答/零发送/单 CAS/丢响应恢复、建议草稿与公开资料/焦点、真实工作/保存恢复、Narrator 失败/未知结果、390/1440 和补充 375/768/1024、横屏/Native 200% 字号/缩小手机视口、44px 目标/reduced motion、长窗口回读稳定、旅人独行/经历收束、真实 Claim/普通死亡恢复、铁人限制和清理后主区/资料终局。最终 page errors / Native diagnostics 为空。15 张视口截图与 ui.json 在 Record 旁 p4-evidence；实际发送数以报告为准，可随新临时局风险尝试数变化。

最终 UI 报告保留真实 clean End Package HEAD / 精确 Core HEAD。主体界面完成后归档发现早期截图命中 Native epoch 重绘，End game 提交仅补 destination/读取就绪与内容检查，再执行对应最终 UI 检查；不为 clean 元数据重写报告或重复未变化检查。Core report 对应精确 tested HEAD 的源码（测试前父 HEAD 工作树改动随后提交），仅 AGENTS.md 无关 dirty 保留。Node24 用于 UI；Core SQLite 按既有原生 ABI 用现有 Node22。run-policy-p2/frontend-bridge 两套件 57/57（FS/SQLite），frontend-conversation 一套件 7/7，共 64 项；ESLint、相关 Package Node 语法/实际编译、diff 空白、文档链接与历史 hash 通过。未重跑 P2 全套、P3 内容全闭环或旧 soak。

UI harness 暂停自动后台派发，P3 的原自动路径证据保持独立；后期 Claim/死亡前置通过真实 typed Native authority，长阅读样本通过 appendTimeline，不算全点击/生产模型内容。未测生产模型、Android/真实软键盘/辅助技术、最大单条消息、MySQL/PostgreSQL、个人旧存档迁移或新发行；不把视口缩小/Native 字号等同 OS 证据。具体命令、日志、发送计数、证据边界见唯一 Record Phase 4。

## Pending

下一阶段仅 P5 集成与版本化交付。先核对 main/package/docs/两个任务 refs、实际祖先和 protected dirty；用独立 Core 环境按相关变更做最小本地兼容检查，将辅助 Core 集成 main 并记录/验证精确 HEAD。游戏任务资产按治理集成 package，检查最终 Core/Package 组合、真实模式/恢复/预算/UI 对应风险，再生成全新 3.0.0 .atria，不覆盖 releases/1.0.0 和 2.0.0。正式完成前按证据决定生产模型或其它必要检查，不能把未执行的发布/模型质量记为通过。

当前 package.mjs 对默认新 profile 的 build/release-only 显式阻挡直到 P5；UI 检查用 --roleplay-ui-only，默认 validate 仍为 P3 内容闭环，历史标志保持其旧 compiler。P5 需要处理正式发布入口，不能把临时 UI harness 或内存 archive 当已发布资产。Core/main 与 game/package 集成均未做，新 .atria 未创建。

完成整体任务后更新永久 Record，按治理移除 live HANDOFF 和短期分支；此前继续保持唯一交接。不得把 main merge 进 package/docs，或把游戏分支 merge main。

## Read first

1. 实际远端 refs、对应工作树/AGENTS 与 dirty；治理敏感集成/发布读 docs:README.md。
2. docs:HANDOFF.md → Plan index → P5 staging/verification。
3. 唯一 Record Phase 4 的 HEAD/命令/原始证据与未测限制；P2/P3 仅按集成风险读。
4. runtime-contracts Phase 2/3/4 / 游戏 runtime/ROLEPLAY.md 的实际接口，按影响补 frontend 等领域模块。

## Do not repeat

不重开方向讨论，不新建游戏任务分支/第二 Record/HANDOFF，不重新归档或改写参考，不绕读 skills 分支、不全仓扫描 Plans/Records。不把 P3 内容或 P4 synthetic UI 当生产模型/最终发布验收；不以旧长期 soak 替代新 profile。保护旧发布和个人数据，保持既有 dirty。不开远端 CI，不为 clean 报告重复已通过且无变化的检查。

## New-chat bootstrap prompt

继续 ZZZdragondYNGPHX/Atria 的 refactor/original-occult-western-fantasy-open-roleplay，只执行 Phase 5 集成与版本化交付。先核对远端 main/package/docs/原游戏任务/refactor/open-roleplay-core refs 与工作树，读 docs:HANDOFF.md → plans/package/original-occult-western-fantasy-open-roleplay/index.md → staging/verification → 唯一 Record Phase 4；按影响读实际接口。游戏 P4 已在 25b39d57eb206b4c6b09d4642d0c458c8d9e5784 完成真实 Native 页面，Core 辅助为 1661af11245c856363bfc1084275c02b55a97452（含 A/B/C 和 P4 recent/终局读口），main 仍 c8d2d0e0c11c283ade2fa3c730740a0dc480c746，package 仍 48b1d97fa660ab5fdd5e2a0c1e50c5e91a57148e，未集成/发布。保护 Core AGENTS.md 和 docs 四份既有 dirty。按实际风险只做最小相关本地兼容和最终组合验证，再按治理集成 Core main / game package、创建新版本且保留旧 releases；不 merge main 到 package/docs，不把 game 合 main，不启动/等待远端 CI。沿用同一 Record/HANDOFF，精确记录 HEAD/已测/未测，整体完成后再清理交接与短期分支。
