# S1 — 内核基础

## Ownership

正文已提交消息不可变。标注/图片历史是由内核管理的呈现数据，不修改 Variant/Timeline，不推进剧情或建立新剧情 authority。

使用现有 SessionRepo 的 `atri_illustrations` 内容寻址 state records；Session 的可选 `illustrationHead` 指向当前记录，`illustrationHeads` 保存各分支的记录，SavePoint 的可选 `illustrationHead` 冻结存档时对应分支的记录。呈现写入使用现有 session 写锁与 CAS；后续剧情 publication 保留最新呈现 head，不回写旧快照。恢复 SavePoint 显式采用存档 head；如果正文 HEAD 相同但呈现状态不同，也派生新分支，保留原分支的图片历史。晚到任务可指定原 branchId 登记图片。读取快照返回对应分支/正文的独立 illustrations 投影，不加入剧情/LLM 默认 state context。

## Data and API

标注具有 opaque Native ID，绑定 messageId/variantId、原始正文 SHA-256、UTF-16 源文范围与完整选文，保留创建时的 revisionId 供 S3 历史上下文读取。不可用 DOM/数组下标持久定位。范围禁止切开 surrogate pair；服务验证实际消息与范围，允许相同段落多个标注。删除标注保留图片历史，显示记录与生成结果分别管理。

图片版本独立 ID，关联 annotationId 与 AssetStore assetId，记录尺寸、替代文字及实际提示词/参数快照。选中的版本必须属于当前标注。图片通过既有资产交付端点读取。服务支持创建/删除标注、登记图片版本、选择展示版本；S1 不请求模型或生图后端。资产引用锁在进入存储事务前获取，与删除资产的顺序一致；呈现源文版本接入既有历史可达/GC 引用。

共享 contract 同时用于服务与呈现，拒绝错误归属、重复 ID、悬空选中版本、错误资产类型与无效范围。图片引用覆盖展示与历史，接入 AssetStore 的引用查询/删除保护。

## Rendering and save compatibility

Host Safe Prose 保留 canonical source mapping，插图在选文最后一个 block 下方稳定呈现；多人/多标注排序按源文位置。图片有替代文字、尺寸、懒加载，停用插件仍可阅读。重绘保持已有正文节点与文本选择。

存档收集当前 Session / 各 SavePoint 呈现 head 的不可变记录、目标正文依赖及全部图片版本；snapshot 只携带保存时的呈现状态，resume 裁剪到可达正文。导入在发布 Session 前校验完整锚点、状态 hash 与资产依赖。旧存档无字段时返回空呈现数据。导出的内容不包含密钥及整个全局角色库。

## Minimal validation

本地 FsEngine / SqliteEngine 的锚点与并发写验证、保存时刻隔离、干净存储导入与恢复、资产引用保护；DOM 测试验证格式化正文的源文映射、跨段插图排序、版本隔离与正文节点保留。针对触及文件 lint；本阶段不声称手机长按或真实 NovelAI 请求已经验证。
