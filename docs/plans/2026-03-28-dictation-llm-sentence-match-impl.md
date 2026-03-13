# 实现计划：默写批改大模型句子级匹配

基于设计文档 `docs/plans/2026-03-28-dictation-llm-sentence-match-design.md`

## Step 1: 云函数 - 新增 LLM 句子匹配函数

文件：`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

在文件顶部引入 `bailianDictationCheck` 配置，新增 `callLLMSentenceMatch(title, authorDisplay, snapshotSentences, recognizedText)` 函数：

1. 引入配置：`const { bailianDictationCheck } = require('config')`
2. 构建 system prompt（古文默写批改助手规则）
3. 构建 user prompt（标题、作者、句子列表、OCR 文本）
4. 调用百炼 API（复用 `gw_ancient-search` 中的 `uniCloud.httpclient.request` 模式）
5. 使用 `response_format: { type: 'json_object' }` 强制 JSON
6. 解析返回的 JSON，校验 sentence_results 数组存在
7. 失败直接抛错

## Step 2: 云函数 - 改造 handleCheck 流程

文件：`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

在 OCR 之后、上传图片之前，插入：

1. 调用 `gw_sentence-snapshot` 云函数获取 snapshot：
   ```js
   const snapRes = await uniCloud.callFunction({
     name: 'gw_sentence-snapshot',
     data: { action: 'get', data: { text_id: articleId } }
   })
   ```
2. 若 snapshot 不存在（`!snapRes.result.data`），返回错误
3. 提取 `snapshotSentences = snapshot.sentences`
4. 构建 authorDisplay，调用 `callLLMSentenceMatch`
5. 将 `sentence_results`、`snapshot_sentences`、`llm_version: 'v3'` 存入数据库记录
6. 返回给前端新增 `sentenceResults`、`snapshotSentences`、`llmVersion`

## Step 3: 前端 - 新增句子级 LCS diff 工具函数

文件：`pages/ancient/dictation-result.vue`（methods 中新增）

新增 `lcsDiffSentence(original, recite, tongjiazi)` 方法：
- 输入：原文句子、默写句子、通假字列表
- 对两个字符串做 LCS diff（复用现有 isPunct/LCS 逻辑，但作用于单句）
- 通假字匹配时标记为 `tongjiazi` 而非 `wrong`
- 输出：`[{ char, status, written }]` 逐字渲染数组

## Step 4: 前端 - 新增 runSentenceMatch 方法

文件：`pages/ancient/dictation-result.vue`

新增 `runSentenceMatch(sentenceResults, snapshotSentences)` 方法：
1. 遍历 snapshotSentences，按 index 找到对应的 sentenceResult
2. 对每个句子：
   - `correct`：每个非标点字标记绿色
   - `missing`：每个非标点字标记红色
   - `wrong`：调用 `lcsDiffSentence` 做逐字 diff
   - `extra`：第一行留白，第二行红色
3. 生成 `sentenceGroups` 数组（直接按 snapshot 句子分组）
4. 处理 title_recite / author_recite 的 diff
5. 计算准确率

## Step 5: 前端 - 改造数据流入口

文件：`pages/ancient/dictation-result.vue`

### onLoad 改造
- 从 `dictationCheckResult` 中检查是否有 `sentenceResults`
- 有：调用 `runSentenceMatch`
- 无：保留现有 `runCompare` 作为旧数据兼容

### loadRecordDetail 改造
- 从 detail 返回中检查 `sentence_results`
- 有：调用 `runSentenceMatch`
- 无：保留现有 `runCompare`

### data 新增
- `sentenceResults: []`
- `snapshotSentences: []`

## Step 6: 前端 - 通假字样式和图例

文件：`pages/ancient/dictation-result.vue`

### 模板改动
- 图例新增"通假字"（蓝色）

### 样式新增
```css
.row-original.diff-tongjiazi { color: #1890ff; }
.diff-actual-tongjiazi { color: #1890ff; }
.legend-tongjiazi { font-size: 24rpx; color: #1890ff; }
```

## Step 7: 云函数 - 准确率存库 + summary 更新

文件：`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

前端计算准确率后，需要回写到数据库。两种方案：
- 方案 A：前端计算后调用一个 `updateAccuracy` action 回写
- 方案 B：云函数也做一次简单的准确率估算存库

采用方案 A：新增 `handleUpdateAccuracy(uid, data)` action，前端在 `runSentenceMatch` 计算完准确率后调用。同时触发 `updateSummaryAfterDictation`。

## 实现顺序

1. Step 1 + Step 2（云函数改动，可独立测试）
2. Step 3 + Step 4 + Step 5（前端核心逻辑）
3. Step 6（样式）
4. Step 7（准确率回写）

## 风险点

- LLM 返回的 JSON 可能格式不符，需要做健壮的解析和校验
- snapshot 可能不存在（文章未生成快照），需要明确的错误提示
- 通假字识别依赖 LLM 准确性，可能有误判
