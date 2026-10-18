# 媒体精确协议：Canonical Mask、草稿恢复、能力清单、Gallery 与 Save/GC（D-011）

- Task ID: atria-native-visual-generation-deepening
- **Status: D-011 / Round 11 C — 已冻结**。从 [decisions.md](decisions.md) 读取跨模块权威，D-009/D-010 的编辑/资产分层见 [media-editing-gallery.md](media-editing-gallery.md)。
- **真正的 Live 能力仍依赖逐 Target 实测**。详见 [provider-editing-matrix.md](provider-editing-matrix.md)。
- Baseline: main@7e1045ab836c22cafbc92c5de056ad701f56e723；2026-10-14 GitHub 远端静态审计。

## 1. Canonical Mask 坐标、像素及提交不可变性

1. **图像方向**：首先把输入图像 EXIF/解码方向归一化，再使用该显示方向下的源图像像素平面。原点为左上 (0,0)，x 向右、y 向下，范围 x∈[0,width)、y∈[0,height)。屏幕 CSS 坐标、devicePixelRatio、缩放/平移/触摸手势仅属于视图，保存时必须经过明确的逆变换。
2. **规范数值**：Canonical submitted raster 为单通道 **8-bit 灰度**、从上到下/从左到右的固定顺序：**0=保留，255=希望编辑，1～254=羽化/编辑权重**。像素宽高必须严格匹配源 ImageVersion 的规范尺寸；允许 PNG 无损封装，但不能因 PNG alpha 解释改变 Atria 的内部数值语义。
3. 裁剪、变换、外扩画布 (Outpaint) 必须另行记录坐标变换与目标几何；Outpaint 不是“不同宽高的 Inpaint Mask 静默兼容”。
4. **提交瞬间冻结**：正式 MaskArtifact 及其基图、变换、编辑提示词、目标 Target/Workflow、有效能力快照、MediaOperation/Job/Attempt 均不可变。用户之后继续绘制的草稿不会更改已发送的 Mask、输出和计费证据。
5. **Provider 转换**：Mask 0/255 语义不假定与 Provider 原生 Alpha 极性相同。Adapter 必须按该精确模型/工作流的约定执行必要的 Alpha/反色/尺寸/裁剪/上传顺序转换，记录原始输入指纹与变换证据；不得静默忽略/反转/缩小必须满足的条件。

## 2. 混合可恢复草稿：Checkpoint + 有界命令

1. **草稿与版本分离**：编辑时保留可逆的笔刷、擦除、区域操作、Undo/Redo 等命令，但仅存为草稿；不为每笔永久保存完整图片，不无限增长命令日志。
2. **可调初始保存策略**：**空闲约 2 秒后自动保存**；连续绘制需最大保存间隔与日志/图片大小上限，不能只在页面关闭时尝试保存。
3. 写入失败明确展示“未同步/待重试”，不能假装已保存。
4. **跨端 CAS**：PC、手机同时编辑相同草稿时，过时版本写入不得 last-write-wins 覆盖新版本。应明确冲突并支持创建草稿分叉/选择版本；不用一个自动合并算法偷改 Mask。草稿尚可恢复且处于保存期内时为 GC Root。提交生成后的 Mask 不受草稿撤销影响。
5. 撤销重做后 raster 可复算；快照损坏/命令越界/崩溃中断/跨端冲突均 fail safe。

## 3. Provider 编辑能力清单声明规范

2. 按操作声明 text-to-image、image-to-image、inpaint、outpaint、upscale、reference identity/style/Vibe、LoRA、ControlNet、multi-image input 与编辑返回张数等能力，另声明输入格式、数量/像素/Mask 极性/透明度、裁剪、模型专有强度参数、输出 MIME/多结果、远端 task ID/状态与 cancel、并发和费用/附加收费可见度。
3. **组合能力不由单独支持推导**：单独支持参考图与 Vibe 不能证明二者可同时使用；必需能力或组合为 unknown/unsupported 则阻止自动/付费提交并报告缺口。不得默认以文字描述替代必须保真的角色参考，或自动切换其它收费 Provider。只有第十二轮另行冻结的显式回退策略才能允许降级。
4. 修改 Workflow、安装/卸载 LoRA/ControlNet、升级模型、替换连接将失效旧能力缓存；

## 4. Gallery 默认展示与版本交互

1. **默认只显示当前作品/Session/Branch** 中依据正式披露权允许展示的媒体，按 Scene/Shot 叙事顺序分页/缩略图惰性加载。
2. 普通视图为单图卡片、当前选中版本、版本切换/比较、再生成/Img2Img/Inpaint/Upscale 能力感知入口。高级视图才懒加载 DAG 血缘、父图/Mask/编辑参数/Provider/实际计费与引用阻断。PC 键鼠与手机触屏都可用；完整多父树不强制首屏展开。
3. 已完成 ImageJob **默认只追加历史、不抢占当前显示指针**。明确的“生成完成并使用”须通过来源 Branch/Annotation 和原选择 pointer 的 expected CAS；用户查看父图/对比/筛选不会修改选择。
4. hide/remove-from-gallery/soft-delete/physical-gc 分开；危险操作显示引用持有者和明确确认，缩略图/索引是可重建的派生缓存而非剧情权威。

## 5. 引用安全 GC：两轮扫描 + 宽限

1. 1.不能只扫描原 atri_illustrations 的 images 数组。
2. 两阶段 Mark-and-Sweep：**一致性快照扫描可达 -> 将无引用候选隔离/记录 -> 等待可调宽限 -> 在新的引用锁/CAS/Lease 下再次扫描 -> 仅仍不可达时回收 Blob/AssetRef**。需要审计报告、崩溃恢复和持有者阻断说明；不能因为旧视图显示“已删除”而删除仍被新 SavePoint 引用的对象。
3. **产品可调初始默认**：软删的历史媒体版本保留 **30 天**可恢复窗口；可证明未进入正式依赖的失败临时 Blob 默认隔离至少 **7 天**。宽限期**绝不是强制回收日**；有引用或有效 Lease 必须继续保留。可恢复的编辑草稿和未知提交的 Provider Job 受 Root 保护。
4. 软删父图但 DAG/Mask/SavePoint/参考库有依赖时不得级联破坏。不可用未审计引用计数代替闭包。

## 6. 正式 SavePoint 默认完整可编辑；可选展示级导出

1. 正式 Native SavePoint 默认要求**完整可编辑级媒体闭包**：其选中图片、原图/祖先 DAG、Mask、必要编辑操作与非秘密请求证据、合法 References/AssetRefs 均须可达且可恢复，分支/时点/选择 pointer 不因加载当前 HEAD 而漂移。可选对外“展示级紧凑导出”只保证展示，必须明确告知不保证继续编辑。
2. 禁止导入时自动触发付费重新生成。
3. 失败回滚或可恢复补偿，不能留半完成 Session、越权跨分支选中或永久孤儿资产。导入/GC 并发必须保护引用 Root。
4. 不能把模拟移动端交互标为真机通过。

## 7. Decision boundary and next discussion

**Round 13 D-013** 已冻结资源/API 的职责方向及三端设置 UI 与七阶段交付路线，详见 [native-contracts-ui-delivery.md](native-contracts-ui-delivery.md)；本次没有创建开发分支。
