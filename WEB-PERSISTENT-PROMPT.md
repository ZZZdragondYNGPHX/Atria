# Atria Remote Execution Status — Inactive

2026-10-09 用户确认：本地是开发与验证主力，远端仅存储已提交的源码、资产、文档和历史。

- GitHub Actions 全部停用，包括自动/手动测试、APK/Docker 构建、发布、reference 同步与分支清理。
- 不主动在 Web / remote 环境实施产品任务，不要求 PR、远端 CI 或自动合并。
- 本地执行统一遵循当前工作区 `AGENTS.md` 与 `docs:README.md`；续接读取真实本地 Git → `docs:HANDOFF.md` → 指定 Plan entrypoint / 当前模块 → Record。
- 仅当用户另行明确授权远端执行时，才按实际能力确定临时执行方式；该授权不自动恢复 Actions，不扩大 reference 权限，也不允许声称未执行的验证通过。
- API 测试硬限仍仅每日 2000 次调用 / 20 RPM，由发送端自动执行，权威为 `README.md` §13.1。

本文件是状态入口，不是另一套治理或活跃任务交接。
