# S29：原 Native Frontend 的公开表达展示

状态：2026-10-13 有限本地工程消费者完成，source `293653079`（功能提交`05a18e6d4`及测试文件末尾规范化）。依赖[S27](s27-expression-plan.md)，选择已有Native renderer与Package exact PNG素材，不使用外部Avatar/图像生成、额外plugin或新状态authority。实际S28音频不自动播放，M4/M5未取得的模型语义与收益证据保持pending。

在原closed Host catalogue新增只读host.expression.status，必须由作品frontend bridge显式声明；沿当前Session/revision/epoch/schema权限读取原Information及ExpressionPlan，累计4096扫描限额，只返回status/actorId/intent/reason/revisionId五个有界primitive。无声明、公开来源失效或不可用时fallback，不返回private cognition/原context/模型rationale，不成为角色实际动作或情绪判定。

作者沿原class sink、静态CSS和exact Package资产为该Actor+ready+五类intent显式映射图片，不能由模型/远程URL选素材。不新增AUI语法，不手工修改编译IR/hash，不放宽SVG/media白名单。公开表达图片只说明作者选择的表达建议；正文与文字fallback保留，未知Actor/intent或隐藏/失效状态不展示其它角色图片。素材破损沿原media fallback，不捏造可用图片。

首批图形为本地code-native SVG经本机Chromium光栅化后的PNG bytes，装入原Package闭包；不会提交机器cache或临时二进制。真实测试经原Package安装、FrontendBridgeService HTTP与mountNativeFrontend，1440/390宽度检查实际图片像素、expected exact hash、source/revision/scope变更刷新与文字降级，截图复核无溢出。图片alt明确表达建议，静态无自动motion/音频，沿既有键盘/响应式/无障碍语义。renderer输出、工程权限、模型语义质量分开记录；本地真实画面不替代角色长期行为收益。

已验证新增backend4、真实Chromium六组合（component/hybrid/full×1440/390）、其它Actor/损坏图及恢复的full390定向复验，原Conversation7/required media1受影响PASS。图片实际Blob bytes与compiled exact hash相符，原Session/state/费用只读，browser外部请求0。inform/reassure由不同真实installed Package配置切换，不假装修改frozenmanifest；同Session source授权撤回与scope关闭真实app.command触发只读bridge刷新。原图片解码失败误标available已修为loading→真实load可用/error unavailable，request/epoch/URL/dispose guard阻止旧事件覆盖新图，破损时文字及图片占位保留。
