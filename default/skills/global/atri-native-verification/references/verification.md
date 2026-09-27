# 验证层次与边界

## 1. 编译与精确 Preview

用现有 Studio Workspace 的 validation、Package build 和 exact preview archive。Preview 必须固定构建版本，后续 Source 编辑不能悄悄改变已显示结果。v1/v2 使用生产 renderer。作者界面的 conversation/composer 是隔离占位，Scene 没有有效 scoped Session 就不能模拟真实 Play。

## 2. Scenario（catalog: scenario）

附件 examples/scenario.json 是独立 fixture；放入 Source 的 scenarios/main.json。schemaVersion: 1，最多 64 steps，读取当前 schema 确认支持的 kind 和 input。支持 lifecycle、turn、task、proposal、continuity、realm、checkpoint、restore、shared.enable、shared.membership、shared.command、assert。

Task 使用真实结果应用流程的 recorded payload；$pending 只解析唯一 pending Task，Shared $current 使用当前 Turn。expectError 验证预期拒绝；assert 仅限受控 states/timeline/continuityViews/realmViews 路径，不使用 prototype 路径或任意代码。

实际 runner 用临时存储和真实 PackageInstaller/SessionCore，返回逐步诊断、provider 调用证据与持久化说明。不要把 mock provider 写进真实用户配置。该工具不是 provider emulator、RNG seed 覆盖接口或 live 存档迁移器。

## 3. Play Health / 修复

检查 active Session 的 exact package/branch/revision、capability negotiation、Task binding preflight 和 prepared transfers。Health 读取不应写状态；修复必须使用既有 preview，再确认其 anchored token。确认时 revision 和独立账本 revision 要重新核验。只支持已实现的 retention compaction、transfer resume/cancel 等 typed repair；不手改余额、receipt、lineage 或 schema。

## 4. 相关回归

- UI：输入/局部动作、Opening、消息 action policy、320px 无横向溢出、焦点和卸载。
- Activity：fact-before-Narrator、迟到结果、取消/恢复、assets 精确校验。
- Information：exposure 与 Actor scope，Rollup 来源与过期。
- Player/Realm：publication 边界、reservation、幂等 receipt、Session restore 不回滚独立账本。
- Shared：认证/ACL、固定席位、一次输入、all-required Host commit、Host RNG、私有槽隔离。

优先验证本次涉及的层。只在集成交付需要时扩大回归；设备测试、网络 soak 和付费模型各自需要实际任务授权，不能用“测试”作为隐含授权。
