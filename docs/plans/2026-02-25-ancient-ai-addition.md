# 古文搜索无结果时 AI 补库 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在古文列表搜索无结果时，允许用户输入“古文名称+作者”并通过百炼检索，确认后自动入库并记录添加账号与添加时间。

**Architecture:** 前端在 `pages/ancient/list.vue` 增加“无结果补录”交互，调用云函数 `ancient-search` 新增动作。云函数对接 DashScope（百炼）文本模型进行严格匹配检索，返回候选古文供用户确认；确认后写入 `ancient-texts` 并记录 `created_by`、`created_at`、`source`。数据库 schema 扩展新增审计字段。

**Tech Stack:** uni-app（Vue2）、uniCloud 云函数、uni-id-common、DashScope 百炼 API（`qwen-plus`）。

---

### Task 1: 扩展古文库数据结构

**Files:**
- Modify: `uniCloud-alipay/database/ancient-texts.schema.json`

**Step 1: 增加补录审计字段**
- 增加 `created_by`（string）、`created_at`（timestamp）、`source`（string）
- 保持现有读取权限不变

**Step 2: 本地自检**
- 检查 schema 字段命名与云函数写入字段一致

### Task 2: 云函数支持 AI 检索与确认入库

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/ancient-search/index.js`
- Modify: `uniCloud-alipay/cloudfunctions/ancient-search/package.json`
- Modify: `uniCloud-alipay/cloudfunctions/common/config/index.js`

**Step 1: 保留原有搜索能力**
- 默认 action 为 `search`，兼容原调用

**Step 2: 新增 `aiSearch`**
- 参数：`title`、`author`
- 先查库：标题+作者完全相等，命中直接返回已存在
- 未命中时调用百炼模型检索并结构化返回（标题、作者、朝代、正文）
- 做严格校验：AI 返回的标题与作者必须与输入完全一致，否则视为未找到

**Step 3: 新增 `confirmAdd`**
- 登录校验（`context.auth.uid` / `uniIdToken`）
- 防重：标题+作者再查一次
- 写入库并记录 `created_by`、`created_at`、`source=ai_bailian_qwen_plus`

### Task 3: 列表页新增“无结果补录”流程

**Files:**
- Modify: `pages/ancient/list.vue`

**Step 1: 无结果区域新增表单**
- 两个输入框：古文名称、作者
- 一个按钮：AI 检索古文

**Step 2: AI 检索与确认**
- 调用 `ancient-search` 的 `aiSearch`
- 展示返回的候选文本（标题/作者/朝代/正文预览）
- 用户确认后调用 `confirmAdd`

**Step 3: 成功后刷新**
- 清空检索输入
- 重新加载列表并可点击进入详情

### Task 4: 回归验证

**Files:**
- Test: `pages/ancient/list.vue`（手工）
- Test: `uniCloud-alipay/cloudfunctions/ancient-search/index.js`（手工）

**Step 1: 正常搜索回归**
- 原搜索功能保持可用

**Step 2: 无结果补录**
- 输入存在古文：提示已存在
- 输入不存在古文：AI 命中后确认入库成功
- 未登录确认入库：提示先登录

**Step 3: 精确匹配验证**
- AI 返回标题或作者与输入不完全一致时，返回未找到
