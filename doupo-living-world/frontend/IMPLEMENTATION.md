# 原生前端：C4 集成

版本 `0.1.0-fe.2`，Task ID `package/doupo-living-world`。规则采用be.5/C4；原生界面沿用`feat/doupo-frontend@bed05a36`的组件、Bridge与宿主控制，再接入当前字段。实际验证与来源见docs分支同一Record；本文只说明实现。

## 界面层级

参考太吾绘卷、觅长生的地图/人物/修行资料层级，使用本作自己的素材。主画面以场景和人物为中心，底部四入口为人物、行囊、山河、见闻，右上菜单集中存档、字号及宿主控制。人物内部按身体器物、功法修行、人物关系切换；交易随本地报价，交锋从所选人物进入，行程放在见闻内部。网格和坐标行走工具默认收起。没有持续装饰动画或等待键盘动画。

`Scene.aui`与`Panels.aui`组合主模板；`main.js`独占读取、串行写入、真实revision/key、待确认请求、草稿和恢复上下文。`scene.js`、`panels.js`从公开screen生成表现并返回意图；没有私有Domain、伪随机人物或前端资源结算。状态声明在三个`*-state.mjs`，构建拒绝重复字段。组件资源通过Native compiler实际编译。

## C4表现与操作

- 新局按bind0/1/2、create、initialize/appraise/refresh执行，零耗时居民准入与公开刷新结束后进入可操作状态。用户不必逐次点击初始化。
- 地图仅消费独立markers及主角appearance，人物列表消费people；地图上限12，截断提示明确。Q版与详情画像取同一appearance的chibiAsset/portraitAsset，不按姓名猜图、不重抽外观。无图明确回退文本。
- 选人调用零耗时focus；不自动接近。标记位于另一人物页时，经当前附近分页找到合法详情再选中。失去感知、换地点与恢复清理失效选择。附近与已知旧档案可切换，旧档案不能用于实时定位/交互。
- 人物/修行展示实际arts，区分已学、持有秘籍、当前修习、资格、收益与斗技消耗；换修传art id，研习传秘籍item id。身体展示已知伤处、缺失、能力限制、器物耐久/余量和治疗/装备/维修操作。
- 人间保留交往、约定、家庭、赠礼与传授，并展示本人关系认识、寄信与释放入口；读口不泄露NPC私人目标。见闻提供来源、时点、书信和事件分页详情，行程包含实际本地生产信息。
- 自由文字沿宿主composer接口进入真实解析路线，保留目标/地点/分支；Ctrl/Cmd+Enter提交，Enter换行，组合输入不误送。失败保稿，未知提交用同revision/key核对，不自动重做交易。
- 保存/恢复使用Native SavePoint与Branch/Epoch；恢复后重挂载，清除旧选择、草稿和叙述。生成停止与规则活动停止分开。

## 构建与美术

`tools/frontend.mjs`复用`tools/interfaces.mjs`生成C4绑定，宿主schema从当前core读取。静态catalog仅传公共地点、路线、出身与物品，不含CAST私有动机。

交付63张图片：40张池配对图，加23张场景/物品/总览与占位引用；未使用的旧人物画像不进入运行资源图。作者原图与来源仍保存在原目录；前端交付以已安装的Apache-2.0 jsquash工具编码WebP，quality90/method6，保留像素尺寸。Native安装资产与前端图像使用同一交付字节及稳定asset id。`media/pools/manifest.json`记录原图，`frontend/media-delivery.json`记录原始hash/尺寸/编码后体积，安装manifest记录交付hash/体积，三者用途不同。

可选`ATRIA_MEDIA_CACHE`指定仓库外的作者图片编码缓存，key包含原始hash和编码参数；不进入包、不包含世界或用户数据。构建保持单资源2MiB、图谱32MiB限制。重要人物8对与普通NPC12对仍是静态姿态，不包含方向行走动画。场景图装饰人物不代表运行时NPC；网格/坐标依规则，建筑画面未逐像素标定为碰撞图。

## 验证口径

验收使用真实Native compiler、PackageInstaller、SessionCore、FrontendBridgeService、浏览器Native renderer和QuickJS Controller。浏览器本地generationHost适配器执行真实Authority交易；自由文字的本地适配器返回无模型错误，因此本轮浏览器证据不能称为真实模型质量验收。既有be.5模型证据归Record，不迁移为本轮实测。

已执行的范围和最终归档身份见Record。模拟窄视口不等于物理手机；没有声称真实输入法候选窗、读屏器、无限历史、96人跨月完整宿主或完整D33战斗已验收。测试/日志/截图/fixture均不入仓库。
