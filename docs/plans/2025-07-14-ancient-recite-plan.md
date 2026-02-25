# 古文背诵 App 实现计划

参考设计文档：`2025-07-14-ancient-recite-design.md`

---

## Step 1：数据库 Schema

**文件**：`uniCloud-aliyun/database/`

1. 新建 `ancient-texts.schema.json`
   - 字段：`_id`, `title`, `author`, `dynasty`, `content`

2. 新建 `recite-records.schema.json`
   - 字段：`_id`, `user_id`, `text_id`, `text_title`, `hint_count`, `recognized_text`, `diff_result`, `created_at`
   - `permission`：read/write 需登录（`auth.uid != null`）

3. 新建 `ancient-texts.init_data.json`
   - 录入 5-10 条示例古文数据（静夜思、春晓、登鹳雀楼等）

---

## Step 2：云函数

**目录**：`uniCloud-aliyun/cloudfunctions/`

### 2a. `ancient-search` 云函数

- 入参：`{ keyword, page = 1, pageSize = 20 }`
- 逻辑：用正则同时匹配 `title` 和 `content`，返回分页列表
- 出参：`{ list: [...], total }`

### 2b. `recite-record` 云函数

- `action: 'save'`：保存一条背诵记录，写入 `user_id`（从 uni-id token 取）
- `action: 'list'`：查询当前用户的历史记录，按 `created_at` 倒序
- `action: 'detail'`：按 `_id` 查单条记录

---

## Step 3：tabBar 和路由配置

**文件**：`pages.json`

1. 将现有 tabBar 的 `list`、`grid` 替换为：
   - `pages/ancient/list`（古文）
   - `pages/ancient/history`（历史）
   - `pages/ucenter/index`（我的，保留）

2. 在 `pages` 数组中注册所有新页面：
   - `pages/ancient/list`
   - `pages/ancient/detail`
   - `pages/ancient/recite`
   - `pages/ancient/result`
   - `pages/ancient/history`

---

## Step 4：古文列表/搜索页

**文件**：`pages/ancient/list.vue`

- 顶部搜索框，输入防抖 300ms 后调用 `ancient-search`
- 列表展示：标题、作者、朝代、内容前 20 字预览
- 点击跳转 `detail` 页，传 `text_id`
- 空状态和加载状态处理

---

## Step 5：古文详情页

**文件**：`pages/ancient/detail.vue`

- 展示完整古文：标题、作者、朝代、正文
- 底部固定按钮【开始背诵】，跳转 `recite` 页，传 `text_id`

---

## Step 6：背诵模式页

**文件**：`pages/ancient/recite.vue`

- 进入时只显示标题，隐藏正文
- 【开始背诵】按钮：调用 `uni.getRecorderManager().start()`
  - App 端格式：`mp3`，采样率 16000
  - 微信端格式：`mp3`，采样率 16000
- 【提醒我】按钮：
  - 维护 `hintCharCount`（当前提示到第几个汉字）
  - 每次点击：`hintCharCount++`，按 `content` 逐字扩展提示
  - 显示提示文字，`hint_count++`
- 【背诵结束】按钮：
  - 停止录音 `recorderManager.stop()`
  - `onStop` 回调中获取 `tempFilePath`
  - App 端：调用 `plus.speech.startRecognize` 或将文件传给 ASR
  - 微信端：调用同声传译插件 `plugin.translate`
  - ASR 完成后携带结果跳转 `result` 页

---

## Step 7：背诵结果页

**文件**：`pages/ancient/result.vue`

- 接收参数：`text_id`, `recognized_text`, `hint_count`
- 从本地 store 或页面参数取原文 `content`
- 实现 `diffChars(original, recognized)` 函数（LCS 算法）：
  - 返回 `[{ char, status: 'correct'|'wrong'|'missing' }]`
- 渲染高亮文字：正确=默认色，错误=红色，缺失=红色+删除线
- 显示统计：正确率、提示次数
- 调用 `recite-record` 云函数（action: 'save'）保存记录
- 底部按钮：【再背一次】返回 recite 页，【查看历史】跳转 history 页

---

## Step 8：历史记录页

**文件**：`pages/ancient/history.vue`

- 进入时调用 `recite-record`（action: 'list'）
- 列表展示：古文标题、背诵时间、正确率、提示次数
- 点击展开或跳转查看 `diff_result` 高亮详情
- 需要登录才能查看，未登录引导去登录页

---

## Step 9：工具函数

**文件**：`common/diff.js`

- 导出 `diffChars(original, recognized)` — LCS 逐字对比
- 导出 `calcAccuracy(diffResult)` — 计算正确率

---

## 实现顺序

```
Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7 → Step 8 → Step 9
```

Step 9（工具函数）可在 Step 7 之前完成，供结果页使用。

---

## 注意事项

- 微信小程序同声传译插件需在 `manifest.json` 的 `mp-weixin.plugins` 中声明
- App 端 `plus.speech` 需要麦克风权限，在 `androidPrivacy.json` 和 iOS `manifest` 中声明
- 所有调用 `recite-record` 的操作需确保用户已登录，未登录跳转 `/pages/login/login`
- `diff_result` 存储前先 `JSON.stringify`，读取后 `JSON.parse`（uniCloud 支持直接存 array，无需手动序列化）
