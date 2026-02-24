# 古文背诵 App 设计文档

## 概述

在现有 uni-starter（uni-app + uniCloud 阿里云，Vue 3）基础上扩展，支持 App 和微信小程序双端。复用现有 uni-id 登录体系，新增古文搜索、背诵录音、语音转文字对比、历史记录四大核心功能。

## 架构方案

方案 A：在现有 uni-starter 基础上直接扩展，复用 uni-id 登录、uniCloud 连接、用户中心页面，新增古文相关页面和云函数。

## 页面结构

| 页面 | 路径 | 说明 |
|------|------|------|
| 古文列表/搜索 | `pages/ancient/list` | 首页，支持标题/内容搜索 |
| 古文详情 | `pages/ancient/detail` | 展示全文，入口进入背诵模式 |
| 背诵模式 | `pages/ancient/recite` | 录音、提示、结束背诵 |
| 背诵结果 | `pages/ancient/result` | 转文字对比，标记错误 |
| 历史记录 | `pages/ancient/history` | 查看所有背诵记录 |

tabBar 调整为：**古文**（列表）、**历史**（记录）、**我的**（用户中心，复用现有）

## 数据模型

### `ancient_texts` — 古文表

```json
{
  "_id": "string",
  "title": "string",
  "author": "string",
  "dynasty": "string",
  "content": "string",
  "paragraphs": ["string"]
}
```

`paragraphs`：全文按标点切分的句子数组，供背诵模式逐句给提示。

### `recite_records` — 背诵记录表

```json
{
  "_id": "string",
  "user_id": "string",
  "text_id": "string",
  "text_title": "string",
  "hint_count": "number",
  "recognized_text": "string",
  "diff_result": [{ "char": "string", "status": "correct|wrong|missing" }],
  "created_at": "timestamp"
}
```

`diff_result`：每个字的匹配状态，供结果页渲染红绿高亮。

## 核心功能流程

### 搜索

前端输入关键词 → 云函数查询 `ancient_texts`，同时匹配 `title` 和 `content`（正则模糊搜索）→ 返回列表。

### 背诵模式

1. 进入页面后隐藏全文，只显示标题
2. 点击开始 → 调用 `uni.getRecorderManager()` 开始录音
3. 点击【提醒我】→ 从 `paragraphs` 取当前句，每次多显示一个字，`hint_count +1`
4. 点击【背诵结束】→ 停止录音 → 调用平台原生 ASR 转文字 → 跳转结果页

### 结果页

- 将 ASR 文字与原文逐字对比（编辑距离算法，前端实现）
- 渲染高亮：绿色=正确，红色=错误/缺失
- 保存一条 `recite_records` 记录

### 历史页

按时间倒序列出记录，点击可查看当次的 `diff_result` 对比结果。

## 技术要点

### ASR 方案（平台原生）

- App 端：`uni.getRecorderManager()` 录音 + `plus.speech` 语音识别
- 微信小程序端：`RecorderManager` 录音 + 微信同声传译插件（官方免费插件）

### 文字对比

前端实现 LCS（最长公共子序列）逐字 diff，古文通常 < 300 字，性能无压力。

### 登录

完全复用现有 uni-id，背诵记录写入时带上 `user_id`。

### 云函数

新增 2 个云函数：

- `ancient-search`：搜索古文（支持标题/内容模糊匹配）
- `recite-record`：保存/查询背诵记录
