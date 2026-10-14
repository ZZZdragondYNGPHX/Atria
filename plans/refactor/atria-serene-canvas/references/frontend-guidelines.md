# Atria "Serene Canvas" 前端开发设计规范

为了确保“浅色极简、无垠画布”的理念在多 AI 协同开发时不被破坏、不退化成传统的 SaaS 界面，请前端开发工程师和协同 AI 严格遵守以下规范体系。

## 1. 核心设计戒律
1. **去边框化 (De-framing):** 界面中禁止使用贯穿屏幕的实线分割线。层级的划分必须依赖：(1) 间距 (Whitespace) (2) 悬浮阴影 (Soft Shadow) (3) 背景色的微妙色阶（如 `#F9F8F6` 到 `#FFFFFF`）。
2. **文字即 UI (Typography as Interface):** 弱化按钮轮廓，大量使用不同字号、字重和颜色的文本来传达可交互性。
3. **纸与墨的美学 (Paper & Ink):** 浅色主题不仅是“把背景设为白色”。底色必须是带有一丝温度的纸张色（Alabaster / Off-white），文字必须是深石板灰（Slate/Charcoal），绝不允许使用纯黑 `#000000` 刺瞎用户的眼睛。

## 2. 视觉代币 (Design Tokens)

### 2.1 颜色系统
*请统一在 `:root` 或 CSS-in-JS 的 Theme Provider 中使用。*
- **Canvas (环境底板):** `--canvas-bg: #F9F8F6`
- **Sheet (信息承载面):** `--sheet-bg: rgba(255, 255, 255, 0.85)` / `--sheet-solid: #FFFFFF`
- **Ink (文本色):** 
  - `--ink-main: #1C1C1E` (高对比主文本，标题)
  - `--ink-muted: #8E8E93` (次要文本，时间戳，非激活 Tab)
  - `--ink-faint: #C7C7CC` (极度弱化的占位符，分隔符)
- **Accents (点缀色 - 极度克制):** 
  - `--accent-primary: #FF5A36` (活力朱砂红，用于极其重要的按钮、提示点)
  - `--accent-blue: #3273F6` (沉静蓝，用于状态、连接成功等)

### 2.2 字体排版系统
本设计的灵魂在于 **衬线体与无衬线体的混搭**。
- **Header/Story (标题与故事正文):** `--font-serif: 'Playfair Display', Georgia, serif;` (传达人文主义、文学属性)
- **UI/Data (界面标签与数据):** `--font-sans: 'Plus Jakarta Sans', system-ui, sans-serif;` (传达精确、现代感)
- **Code (Prompt 与 JSON):** `--font-mono: 'JetBrains Mono', monospace;`
- **排版节奏:** 行高（Line-height）在阅读区域必须设为 `1.8`，字间距（Letter-spacing）在标题上允许使用 `-1px` 以增加紧凑感。

### 2.3 物理材质与阴影
界面中的所有组件只分为两层：**贴合画布的字 (Flat)** 和 **悬浮的纸 (Floating)**。
- 悬浮组件必须使用: `box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.05)`。
- 毛玻璃（Glassmorphism）只能用于极少数组件：全局 Dock 和 Play 态的 Composer Line。参数必须是 `backdrop-filter: blur(20px); background: rgba(255,255,255,0.85)`。

## 3. 交互与动效规范
- **阻尼感与呼吸 (Damping & Breathing):** 任何弹出层（Sheet, Popover）的进入动画，必须使用基于弹簧（Spring）或曲线 `cubic-bezier(0.22, 1, 0.36, 1)` 的缓动，时间设定为 `0.6s` 或 `0.8s`，表现出如同纸张飘落在桌面的质感。
- **Hover 态编排:** 不要在 Hover 时加上厚重的背景块。推荐的做法是：字体颜色从 `--ink-muted` 渐变到 `--ink-main`，或者轻微的 Transform (如 `scale(1.05)` 或 `translateY(-2px)`) 配合微小的阴影增强。

## 4. 边界处理与扩展性
- **作品专属 UI 接管:** 既然采用画布设计，作品（Work）随时可以通过 API 用一张巨大的 Sheet 覆盖掉 Play Stage，或者直接改变全局 Canvas 的 `background` 变量。左侧的 Floating Dock 会自动收缩甚至透明化，仅提供一个半透明的 `Atria Logo` 作为紧急退出按钮 (Escape Hatch)。
- **表单密集场景 (Runtime Settings):** 对于复杂的 JSON 或表单填写，不要使用死板的 Input 框。使用底边框模式（Bottom Border only），在 Focus 时底边框加粗并变色。

## 5. 对旧时代残党的最终判决
请不要在代码中复刻如下内容，它们已被设计系统抛弃：
1. 顶部永远存在的厚重 Header 导航条。
2. 左右两侧把屏幕夹死的分栏。
3. 带有三角形小尾巴的聊天气泡。
4. 红绿蓝警报式的刺眼 Status Badge (请改用带色的小圆点 Dot)。