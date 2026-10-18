# 安全威胁模型与故障矩阵

本模块定义测试追踪；各领域的详细授权规则仍归对应冻结模块。可信边界为客户端真实人工交互、MCP 精确 Registry/Ceiling、原生认证与事务、Secret/Network Port 和版本化 Store。

| 编号 | 威胁 / 故障 | 必须保持的结果 ||
| --- | --- | --- | --- |
| S01 | 任意 Action/method/path/JS、未知 schema、提示注入 | 固定 ID/schema；内容不提升权限；Browser 不开放任意 DOM/JS | 合同、浏览器 |
| S02 | Form 伪批准、MRTR state 篡改/重放/过期/跨 client || 单元、wire、真实人工待验 |
| S03 | 审批等待中 Revision/Boot/Epoch 改变 |Review 不授权 Commit| 单元、真实 Native CAS |
| S04 | 长审批/网络/浏览器阻塞控制 | 独立 Control，队列/超时有界，取消意图可达 | stdio 并发、故障注入 |
| S05 | 同目标/跨进程写竞态、Lease 双花 | 本进程资源隔离 + 原生 OCC/CAS；凭证不跨实例 | 单元、多进程 Native |
| S06 | Dispatch 后断线、回执丢失、MCP/Host 重启 | 先 Journal 后 dispatch；unknown 不重发；| 故障、重启 |
| S07 | 名义查询隐性 reconcile/费用/持久清理 | 纯 Observe 与效果操作分开；READ 无持久变化/Secret/Send | 存储前后比较、调用 spy |
| S08 | SecretRef 绑定恶意 endpoint、DNS/redirect/内网/降级 | 正确网络目标绑定、独立审查；输出无明文| 网络故障 fixture、Native |
| S09 || 不完成/不安装半包；独立下游审批；非任意 URL/磁盘 | 二进制单元、真实大包 |
| S10 | Skill 指令提权、Git 漂移、Extension/Host code 执行 | Skill 无权限；安装禁用；无 Host 执行旁路| 合同、恶意 fixture |
| S11 | 伪 host evidence/human feedback/label、自动 wake 隐藏费用 | 来源不可由模型自封；级联效果与预算前检；发布独批 ||
| S12 | 截图 stale/跨任务 page/跨 owner/敏感内容 |缺失明确不确定，最小采集| Browser、产品 UI |
| S13 | Journal 注入/路径穿越/Secret/正文/原子落盘失败 | 字段允许表、实例/checkout/origin 隔离、私有权限、损坏拒绝，不重放 | 单元、文件故障 |
| S14 | cancel 被误报 rollback/refund，Speech/Image 恢复混用 | 明确 intent/confirmed/unknown，区分各原生 ledger 与任务耐久度 | 单元、Native 故障 |
| S15 | 超长源码/Skill 文本拖垮脱敏或审批控制面 |完整差异分页，不丢审查能力| 恶意长文本子进程时限、真实大资源 |

攻击 fixture 为本地无秘密数据；模拟审批只证明协议逻辑，不能升级为人的批准。
