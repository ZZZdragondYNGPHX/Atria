# Atria Web Persistent Prompt

API 测试执行以 `README.md` §13.1 为准：仅每日 2000 次调用 / 20 RPM，发送端自动计数/等待；不沿旧预算、Step claim、错误窗口或历史记录要求每轮额度审计和重新许可。

你在 Web / remote 环境中开发 `ZZZdragondYNGPHX/Atria`。完整 Repository Governance 位于 `docs:README.md`；本文件只提供网页端执行适配，不改变 Governance。

## Hot path

- `main` 是稳定产品主线；普通产品工作使用 `feat/*`、`fix/*`、`refactor/*` 等短期语义分支。
- `docs`、`package`、`plugin`、`skills` 是长期独立工作空间，不为方便 merge `main`。
- `reference/<project>` 只有用户明确说“参考”时读取，明确说“更新”时同步；两种授权相互独立。
- Plan 描述设计；大型 Plan 使用 `index.md` + 模块文件的 Plan Bundle；Record 保存永久实施历史；HANDOFF 只保存一个当前实时恢复状态。
- 多阶段任务每阶段更新同一 Record 与 HANDOFF，然后在阶段边界停止。

## Remote execution

- 以当前远端 refs、文件与提交为事实，不把旧聊天或旧文档 SHA 当作仓库真相。
- 使用实际可用的 GitHub/远程能力，不假装存在持久本地工作树。
- 重要写入前核对目标 branch/HEAD。
- 需要时使用实际 GitHub CI/workflow 作为验证证据。
- 没有实际运行的本地 test/build、Android/Termux、真机或 UI 验证不得声称通过。
- 普通代码错误、测试失败、workflow、merge conflict 和常规技术选择自行修复并推进。
- 不因普通步骤反复询问是否继续。

## Minimal context

- 新普通任务：只读直接相关代码与必要热路径规则。
- 续接/多阶段任务：先核对远端，再读对应 HANDOFF → Plan entrypoint；若为 Bundle，先读 `index.md`、再只读当前阶段要求的模块 → Record。
- Skill：仅当用户或正式 Plan 明确指定时，从仓库 `skills` 工作空间加载；先读 `skills:SKILLS.md`，再读对应 Skill。Web / remote 不假定存在可自由访问的本地 Skill 安装。
- Reference：仅读取用户明确授权的 `reference/<project>`。
- 治理敏感操作：读取完整 `docs:README.md`。
- 不默认扫描所有 Plans、Records、Skills 或 references。

## Stop conditions

主动停止仅在：

1. Governance 要求的多阶段阶段边界；
2. 明显耗时的远程 CI 已成为唯一剩余依赖；
3. 下一步必须依赖当前无法取得的 Android / Termux / 真机或真实 UI 证据；
4. 必须由用户处理 Secret、权限、登录或账号授权；
5. 用户明确要求暂停。

## Handoff

任务需要续接时，`docs:HANDOFF.md` 至少记录 Task ID、Primary Workspace、当前分支/HEAD、阶段、Plan entrypoint、当前阶段所需 Plan modules、Record 路径、已完成/未完成、关键决策、实际验证/CI、下一目标、开始前必读文件、不要重复的工作，以及可复制的新对话接手提示词。下一位执行者仍需核对真实远端。
