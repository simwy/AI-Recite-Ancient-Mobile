# 默写拍照检查功能设计

## 概述

用户在默写练习页拍照上传手写默写纸，通过 Qwen3.5-Plus 视觉大模型识别图片中的古文ID和手写文字，查询原文进行逐字比对批改，标注正误（绿色正确/红色错误），计算准确率，结果和图片一并存入数据库。

## 数据流

```
用户点击"拍照检查"
  → 选择/拍摄图片 (uni.chooseImage)
  → 客户端压缩 (最长边1080px, JPG质量65, ≈150KB)
  → 读取为 base64
  → 调用云函数 gw_dictation-check (action: 'check')
    → 云函数调用 Qwen3.5-Plus 视觉模型（单次调用）
      → 识别古文ID + 手写文字（不纠错）
    → 查 gw-ancient-texts 获取原文
    → 逐字比对，计算准确率
    → 图片上传云存储
    → 记录存入 gw-dictation-checks
    → 返回批改结果
  → 跳转 dictation-result 页面展示
```

## 云函数：gw_dictation-check

新建云函数，action 路由模式。

### action: 'check'

入参：
- `imageBase64`: 压缩后图片的 base64 字符串
- `difficulty`: 难度等级 (junior/middle/advanced)

处理流程：
1. 认证用户（复用标准 auth 模式）
2. 调用 Qwen3.5-Plus 视觉模型
   - 端点：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
   - 模型：`qwen-vl-plus`
   - API Key：复用 config.bailianPoemSearch.apiKey
   - Prompt 要点：识别纸上印刷的"文章ID"和手写正文，严禁自动纠错/智能校准错别字，返回 JSON
3. 用识别出的古文ID查询 gw-ancient-texts
4. 逐字比对原文和识别文字（去标点后比对）
5. 上传图片到云存储 `dictation-checks/{timestamp}-{userId}.jpg`
6. 存入 gw-dictation-checks 集合
7. 返回结果

返回：
```json
{
  "code": 0,
  "data": {
    "recordId": "xxx",
    "articleId": "古文ID",
    "title": "标题",
    "author": "作者",
    "originalText": "原文",
    "recognizedText": "识别文字",
    "diffResult": [
      { "char": "床", "status": "correct" },
      { "char": "前", "status": "wrong", "recognized": "千" },
      { "char": "明", "status": "missing" }
    ],
    "accuracy": 85.5,
    "imageUrl": "图片URL"
  }
}
```

### action: 'list'

分页查询当前用户的批改历史。

### action: 'detail'

查询单条批改详情。

## 数据库集合：gw-dictation-checks

```javascript
{
  _id: '自动生成',
  user_id: 'uid',
  article_id: '古文ID',
  text_title: '标题',
  text_author: '作者',
  text_dynasty: '朝代',
  original_text: '原文',
  recognized_text: '识别文字',
  difficulty: 'junior|middle|advanced',
  diff_result: [{ char, status, recognized? }],
  accuracy: 85.5,
  wrong_chars: ['千'],
  image_file_id: 'cloud://xxx',
  image_url: 'https://...',
  created_at: 1709260800000
}
```

## 前端修改

### dictation.vue — openPhotoEntry()

1. `uni.chooseImage` 选择/拍摄（camera + album）
2. 压缩：`uni.compressImage` + canvas 调整尺寸（H5兼容），最长边1080px，质量65
3. 读取为 base64
4. loading "AI批改中..."
5. 调用 gw_dictation-check
6. 结果存 globalData.dictationCheckResult
7. 跳转 dictation-result

### 新建 dictation-result.vue

展示内容：
- 拍照原图（可点击放大）
- 准确率 + 进度条
- 逐字批改详情（绿色=正确，红色=错误，下划线=漏写）
- 图例说明
- 识别出的文字
- 操作按钮：再次检查 / 返回默写

颜色方案：
- 正确 correct: #52c41a (绿)
- 错误 wrong: #f5222d (红)
- 漏写 missing: 红色下划线占位
- 多写 extra: 灰色删除线

### pages.json

添加路由 `pages/ancient/dictation-result`。

## 大模型 Prompt 设计

关键原则：**严禁智能纠错**，原样输出手写文字。

```
你是一个古文默写纸图片识别助手。请仔细看这张手写默写纸的照片，完成以下任务：

1. 找到纸上印刷的"文章ID"，提取其值
2. 逐字识别手写的正文内容

重要规则：
- 必须严格按照手写内容原样识别，不要进行任何智能纠错或校准
- 如果写的是错别字，就原样输出错别字，不要替换为正确的字
- 如果某个字无法辨认，用"□"替代
- 保留原文中的标点符号

请以JSON格式返回：
{
  "articleId": "识别到的文章ID",
  "handwrittenText": "逐字识别的手写内容"
}
```

## 图片压缩策略

- 最长边缩放到 1080px，等比缩放
- JPG 质量 65
- 目标大小约 150KB
- 使用 uni.compressImage（APP端）
- H5端通过 canvas 绘制 + toDataURL 实现压缩
