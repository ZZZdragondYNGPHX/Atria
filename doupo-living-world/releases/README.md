# 版本化构建

本目录保留历代 `.atria`，禁止覆盖旧版本。均为后端验证构建，没有最终原生前端或美术；归档含随机盐/nonce，重建核对明文内容和版本。

| 版本 | 所需 Atria main | PackageVersion ID | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| 0.1.0-be.4 | 4470cffb9f688d7e889eb94b42b1cb85966318c1 | pkgv_6790d42cc8fafc47da183f423c5052e0 | 104722 | afaf3e90e100d5cbb91285958e7e207e48f929f4d83e6cc9ffd760bbd078b9dd |
| 0.1.0-be.3 | 4470cffb9f688d7e889eb94b42b1cb85966318c1 | pkgv_7ec58f3860f3d419bbf0763f363db4b8 | 103931 | 1a7b4a8ae350e5ade07acab52453827c7ba368fc08540852cdeba3164edbef83 |
| 0.1.0-be.2 | a9a914c66141daaf7ab9ae26119a506444d73698 | pkgv_7c88452886975acbfe72d2af6c59b44f | 55261 | 4992ccaefcda78de98ae04ae52c53f21b837c2a7750293b8dcd85decd38009cd |

be.4修正性别/地点表达上下文、NPC本人已说经历及报价令牌/拒绝语义，并通过真实模型购买复测；be.3保留为技术验证初版。be.3 增加真实身体/活动/器物/世界生活、个人图谱与因果查询，实际接口为 C3，使用新局，不声明 be.2 存档迁移。本归档已通过真实安装、新局、详情/事件查询、交易和恢复。完整验证与真实模型结果归 `docs:records/package/doupo-living-world.md`，不能用包构建替代服务或界面验收。
