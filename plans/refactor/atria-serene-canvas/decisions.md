# Atria Serene Canvas — Frozen Decisions

本文件只拥有影响多个模块的已确定边界。尚未解决的界面细节归各模块，不因参考文档出现命令式措辞而自动成为决定。

## Decisions

### 1. Serene Canvas 视觉基线

- **Decision:** 采用已接受 v0.1 的温纸画布、深灰墨色、衬线叙事、悬浮导航、画廊资源与白纸工作台方向。参考稿的精致程度是后续视觉设计的基线。
- **Reason:** 各域需要具有辨识度且一致的审美，专业密度与沉浸阅读共同成立。
- **Affected modules:** `visual.md`, `coverage.md`, `validation.md`。

### 2. 本轮只设计浅色主题

- **Decision:** 当前重构范围仅含浅色系统界面，不增加暗色主题设计。旧用户配置和数据兼容问题按 `migration.md` 研究，不据此自动扩展主题范围。
- **Reason:** 使当前视觉与验证目标明确。
- **Affected modules:** `visual.md`, `coverage.md`, `migration.md`, `validation.md`。

### 3. 不加入选文重生成

- **Decision:** 不实现“选中正文段落 → 重生成”。旧 swipe、逐消息重生成与旧消息按钮不自动成为新默认 Play 的需求。
- **Reason:** 该能力来自外部设计稿的自行添加，已明确排除。现有历史修订与分支能力按真实源码完整呈现。
- **Affected modules:** `coverage.md`, `migration.md`, `validation.md`。

### 4. 新能力需要单独讨论

- **Decision:** 现有能力的布局、控件和恢复路径可在重构中完善；新增产品能力必须明确标为提案并讨论，不能通过 HTML 假按钮或文档措辞默默扩展范围。
- **Reason:** 视觉重构与新增产品能力需要分别可判断。
- **Affected modules:** 全部模块。

### 5. 旧外观舍弃，必要设施积极原生化

- **Decision:** 按用户价值舍弃旧聊天控件；对仍承担生成、停止、会话、设置或扩展职责的兼容设施，研究并实施可验证的原生替代。复用已有服务、状态和持久层，保持既有用户数据语义。
- **Reason:** 旧 DOM 不是长期产品架构目标，现有原生执行链已提供替代切口。
- **Affected modules:** `migration.md`, `coverage.md`, `validation.md`。

### 6. 沿实际技术栈改造素材

- **Decision:** 沿 Atria 当前原生 ES modules / DOM / CSS 架构设计，复用现有组件与权威。素材的 React/Tailwind 实现不构成迁移整个项目的理由；新增依赖以具体实现价值判断。
- **Reason:** 同一交互机制可适配当前产品架构，避免引入平行状态和持久化系统。
- **Affected modules:** `visual.md`, `migration.md`, `validation.md`。

### 7. HTML 与方案共同成为实施依据

- **Decision:** 讨论中持续更新可浏览 HTML；已接受视觉快照、最新讨论稿与文字方案保持可区分。正式实施同时读取相关 HTML 和领域模块，实质视觉偏离先更新稿件并讨论。
- **Reason:** 具体稿件可固定布局、比例、材质与交互关系，防止仅凭文字自由发挥。
- **Affected modules:** `visual.md`, `coverage.md`, `validation.md`。

## Scope state

首轮视觉讨论已结束；当前为第二轮完整企划讨论。尚未收到“开始重构”，产品实施未开始。
