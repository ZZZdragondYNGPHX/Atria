# B2 — Prompt, Runtime and retrieval mapping

基于产品 `f0584c157`，先映射再实现。顺序 Prompt program/module/generation/Regex → Runtime connection/model/route/用途 → retrieval/compile；各项沿原服务。Shared Persona description 停用，stage.contextConsumers 仍原显式 consumer 契约。

## Fields, modes, output and handlers

| 类型 | 字段/模式与展示去向 | 原 handler / authority / validation |
| --- | --- | --- |
| Prompt Module | schema/id/revision/name；target/stages/priority/body；typed parameters(type/required/default/label/description/options)、condition(op/path/value/all/any/not)；只读provenance；Simple folds与完整Advanced Source | mountPromptEditor→Library runtime resource revision或Studio stageProject；原assertPromptModule/compiler；system provenance不可作者改写 |
| Prompt Program | identity；ordered stages(stageId/targets/moduleRefs/condition/consumes/contextConsumers)、parameters/locals/artifacts/exclusiveTargets、parentRef/derive(add/disable/replace/configure)、responseDirective任意JSON、provenance | 原 stage/module tree、semantics helpers、Advanced Source；Library immutable或Project source exact refs，Fork closure/Derive保留确切依赖和旧资源 |
| Generation | identity；sampling/output/reasoning/stop/cache/streaming/toolChoice/providerExtensions/provenance；Simple全部已有控件、Advanced完整JSON | 原generationFields/资源Revision/契约/adapter预算；未支持provider组合由preview明确拒绝，不实发模型 |
| Preset Regex | 原regex脚本所有字段/placement/作用域、顺序、启禁、导入导出、preset归属 | 原mountNativeRegexRules→editNativeRegexRule→preset save；不同于全局Regex，不搬authority |
| Preset管理/Runtime choices | 四类资源与分类CRUD/移动、exact revisions/UsedBy/archive/restore/Fork/导出；作者开关/互斥/default/参数override | 原prompt-presets/resource bundle；choices写Session/Route参数，不新建作者Revision |
| Runtime Connection | schema/id/player scope/name/adapter/transport/endpoint/networkPolicy/SecretRef/options；兼容JSONschema/responseMode/minoutput/imagecapabilities；probe/Secret存储 | 原configuration PUT/DELETE与Secret store/probe；密码输入不回显，endpoint与options任意原契约，未发送测试不叫provider实测 |
| Runtime Model | identity/connection/remoteModel/capabilities(state/provenance)/limits/limitProvenance/tokenizer/messageFormat/providerHints；发现与显式采用 | 原configuration PUT，provider discovery与编辑epoch；exact connection身份，tokenizer高级内容Source可编辑，避免普通保存重写原source |
| Runtime Route/用途 | identity/scope/role/model/connection/exactGeneration/exactPrompt/fallbackrefs/promptParameters/policy(timeout/retry/fallback)/requirements；用途picker/savecontinue/cancel | 原route resolver/configuration与task-binding/Session；不自动latest/选新scope，全部角色/备用顺序，缺项修复原启动返回 |
| Retrieval | player retr_/rev_/name、embed/rerank/source/model/endpoint/secretRef/options；Jina dimensions/task/lateChunking、Ollama keep、Vertex authMode/region/projectId；browser models | 原retrieval-contracts/assertRetrievalProfile→commitRetrievalProfile；immutable exact选择，非portable Library；Source只提交同一profile新revision，不切换Memory |
| Compile diagnostics | exact route/Session或Project revision/context、input、Prompt choices、预算/IR/evidence、失败 | 原generation preview，不send/resolveSecret/writeSession；过期Project需显式选revision，原service authority |

源码：public/scripts/native/{prompt-authoring,prompt-presets,prompt-semantics,prompt-runtime-controls,regex-authoring,runtime-workspace,runtime-route-picker,runtime-readiness,task-binding-ui,retrieval-workspace,retrieval-contracts,retrieval-picker}.js；src/native/model-prompt-runtime/{contracts,persistence,prompt-compiler,route-resolver}.js、retrieval-runtime.js。

## State gaps and gates

既有专属控件/folds已符合设计，不为替换名义重复实现。局部缺口：Prompt Fields补optional默认/隐式排序；Runtime没有full Source、Model tokenizer普通保存重写source；retrieval没有full Source、provider切换丢未保存options；Runtime Delete确认后未重验scope。保持原错误/receipt/Back/compact焦点/独立services，补具体缺口。

验证门：原Prompt semantics/authoring、preset/choices、Runtime全字段/ref/fallback/Secret/能力发现/receipt/Source与延迟scope、retrieval全provider合约/Source/选项切换/保存失败、compiler不发送/不解析Secret/不写Session。新旧canonical输出、未知高级字段/非法JSON原文、真实FS/HTTP/immutable pin、English和中文320/719/720与keyboard/browser；现有mockprovider不称真实外部模型。具体执行与限制只记Record。
