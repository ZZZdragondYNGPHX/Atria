# Atria 设置界面与原生主题重构

- Task ID: `refactor/atria-settings-and-themes`
- Primary Workspace: `main`
- Plan: [index](../../plans/refactor/atria-settings-and-themes/index.md)
- 实施分支: `refactor/atria-settings-and-themes`

## I1 — 契约与基线（完成）

- Start HEAD: `60aca695726893e298b7d485f300c6efef3b79fd`，获取远端后与 `origin/main` 相同，源码主线干净。
- docs 当前 HEAD 为 `050d892b8`；本任务方案已存在，其他任务 dirty 内容不纳入本任务提交。
- 独立语义分支和源码工作树已建立，产品代码不写入 docs。
- 新增版本化原生主题模型；六个只读起点、确定性角色补全、日夜解析、严格导入和保留原文的迁移计划。

## I2 — 原生主题与资产（完成）

- Start HEAD: `24962ec0e`。
- End/Tested HEAD: `328142167`。
- 接通现有 `/api/themes`、NamedDocRepo 和 settings 保存队列；内置原件与用户同名文档分离。
- 新账户默认 settings 明确种入 system 合同；历史 `firstRun` 只代表引导未完成，不据此把旧账户误判为新账户。已有账户升级保持 light。
- 迁移资产先写、标记最后写；稳定 ID 复用部分成功资产，保留完整旧偏好、CSS 和未映射字段。原文档不删除。
- 预览独立于普通偏好；系统变化、确认/取消重新解析模式；单一 CSS 投影，支持 URL `atriaNoThemeCss=1` 与 `Ctrl+Alt+Shift+R` 临时恢复。
- 保存中禁止撤回或重复提交。
- 首次组合运行发现旧全局 stub 不适用新输入，改为明确注入 authority 后补测系统变化/CSS/释放；复测通过。
- 定向 ESLint 首次发现 4 处 brace-style，已自动修复；

## I3 — 设置呈现与交互（完成）

- Start HEAD: `328142167`。
- 桌面两列工作纸、手机分类子页；分类和搜索定位使用原 Navigation child，未增加全局 router。高级目标展开原控件，查询编码在现有 route 内。
- 普通偏好即时生效并等待原保存队列回执；失败保留值并逐行重试，迟到回执和卸载保护由 revision/epoch 处理。
- Native 消费者核查：Enter 已由 `native/play-product.js` 读取；字号沿 `--fontScale` → `--mainFontSize` → Atria typography tokens；减动/模糊沿 power-user 与 Environment。Native 阅读器独立管理跟随和历史锚点，不公开旧 scroll 开关。
- 语言是原浏览器存储/重载权威；旧通知、声音、保活未接通 Native 生命周期，媒体由 Work/Session 权限控制；六分类说明真实归属，不做虚构开关，旧数据保留。
- JSDOM 缺少 randomUUID 的问题通过注入现有 UUID authority 修复。
- 独立 Chromium：1440×1000、320×850；截图仅在隔离临时测试目录，非用户资料。
- 视觉发现并修复：搜索输入缺少主题样式、墨色按钮需独立文字角色；不把即时颜色过渡截图误认成稳定颜色。

## 交付

- 实施提交：`24962ec0e`（I1）、`328142167`（I2）、`24d7defd2`（I3）、`5eb3bc765`（I4）。
- Plan 入口及主题/迁移状态已链接本 Record；源码与 docs 各自提交、同步，保留其他任务未提交内容。
- 本任务未创建 HANDOFF 或 PR；交付清理仅处理本任务源码工作树、语义分支和临时测试材料。
