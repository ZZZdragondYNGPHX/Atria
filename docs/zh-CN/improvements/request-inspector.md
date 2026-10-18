# 请求器

它是生成诊断能力的基础设施。

## 问题背景

在 SillyTavern 中，AI 生成请求发出后，后端不会系统性地记录请求的 Token 消耗。用户无法得知每次生成实际花费了多少 Token，管理员也无法追踪多用户场景下的资源使用情况。

Atria 实现了一套完整的请求生命周期追踪系统，覆盖文本生成、图像生成、向量嵌入 / 重排三类请求。

## 核心能力

### 请求生命周期追踪

每个 AI 生成请求都会经历以下状态流转：

1. **开始** — 记录请求元数据，标记请求进入追踪
2. **完成** — 请求成功返回，记录 Token 用量
3. **失败** — 请求出错，记录错误信息
4. **中止** — 用户主动取消生成

```d2
direction: down

start: "" {
  shape: circle
  width: 20
  style.fill: "#222"
}
in_progress: "进行中"
done: "完成"
failed: "失败"
aborted: "中止"
end_: "" {
  shape: circle
  width: 20
  style.fill: "#222"
}

note: "流式响应从流的最后一个 SSE 事件中提取用量" {
  shape: text
  style.fill: "#fff8d4"
}

start -> in_progress: "记录元数据"
in_progress -> done: "记录 Token 用量"
in_progress -> failed: "记录错误信息"
in_progress -> aborted: "用户取消"
done -> end_
failed -> end_
aborted -> end_
in_progress -- note: {style.stroke-dash: 3}
```

### Token 用量统计

- **Prompt Tokens** — 输入提示词消耗的 Token 数
- **Completion Tokens** — 模型生成内容消耗的 Token 数
- **Total Tokens** — 总用量

这些数据从 API 响应中提取，并与用户账户关联，用于用量统计和诊断分析。

### 流式响应的 Token 统计

对于流式（SSE）响应，Token 用量信息通常包含在最后一个 SSE 事件中。

### 向量嵌入与重排请求追踪

仅在本地进程内推理的源不会离开本机，因此会被跳过，让环形缓冲专注于真正的上游流量。

## 与存储配额的关系

这与[认证与配额](/zh-CN/improvements/auth-and-quota)中的存储配额管理是两个独立的系统：

- **存储配额管理**：管理文件存储空间的分配和限制

> [!TIP]
