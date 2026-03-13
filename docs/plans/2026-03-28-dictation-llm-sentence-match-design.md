# 默写批改：大模型句子级匹配 + 前端 LCS 逐字 diff 设计

## 概述

重构默写批改流程，将大模型的职责从"逐字比对"降级为"句子级匹配"，前端负责逐字精细 diff。

核心思路：以 `gw-ancient-sentence-snapshots` 表的句子切分作为锚点，让大模型按句子粒度匹配默写内容，前端再用 LCS 对 wrong 句子做逐字 diff。

## 整体数据流

```
拍照 → OCR(云函数)
     → 查 snapshot(云函数)
     → 构建 prompt + 调 LLM(云函数)
     → 返回 { sentenceResults, snapshotSentences }
     → 前端逐句 LCS diff + 双行渲染
```

## 大模型输入输出

### 输入（prompt 包含）

- 标题、朝代·作者
- snapshot 句子列表（带 index 和 text）
- OCR 识别的默写全文

### 输出结构

```json
{
  "title_recite": "用户默写的标题（无则空字符串）",
  "author_recite": "用户默写的朝代·作者（无则空字符串）",
  "sentence_results": [
    {
      "index": 0,
      "original": "晋太元中，武陵人捕鱼为业。",
      "recite": "晋太原中，武陵人捕鱼为业。",
      "status": "wrong",
      "tongjiazi": []
    },
    {
      "index": 1,
      "original": "缘溪行，忘路之远近。",
      "recite": "",
      "status": "missing",
      "tongjiazi": []
    }
  ]
}
```

### 字段说明

- `title_recite`：LLM 从 OCR 文本中提取的标题默写内容
- `author_recite`：LLM 从 OCR 文本中提取的朝代·作者默写内容
- `sentence_results`：按 snapshot 句子顺序，每句一个结果
- `status`：4 种状态
  - `correct`：完全默写正确
  - `wrong`：有错误（含部分错），前端 LCS 细分
  - `missing`：整句漏写（recite 为空字符串）
  - `extra`：多写了原文没有的句子（index 为 -1）
- `tongjiazi`：通假字列表 `[{original: "说", written: "悦"}]`

## 云函数改动

### 改动文件

`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

### handleCheck 流程变更

现有步骤（保留不变）：
1. OCR 识别 → recognizedText
2. 查原文 textDoc
3. 上传图片 → imageUrl

新增步骤（OCR 之后、存库之前）：
4. 调用 `gw_sentence-snapshot` 云函数获取 snapshot（用 textDoc._id 作为 text_id）
5. 若 snapshot 不存在，返回错误"该文章尚未生成句子快照"
6. 从 snapshot.sentences 提取句子列表，构建 LLM prompt
7. 调用阿里云百炼 qwen-plus（复用 bailianDictationCheck 配置）
8. 解析 LLM 返回的 JSON
9. 将 sentenceResults 存入 gw-dictation-checks 记录
10. 返回 sentenceResults + snapshotSentences 给前端

### 新增函数

```js
async function callLLMSentenceMatch(title, authorDisplay, snapshotSentences, recognizedText) {
  // 1. 构建 prompt
  // 2. 调用百炼 API（复用 gw_ancient-search 中的 httpclient 模式）
  // 3. 解析 JSON 返回
  // 4. 失败直接抛错（不做 fallback）
}
```

### 返回给前端的 data 新增字段

```js
{
  // ...现有字段保留...
  sentenceResults: [...],      // LLM 返回的句子级匹配结果
  snapshotSentences: [...],    // snapshot 的句子列表（前端严格渲染第一行）
  llmVersion: 'v3'             // 版本标记
}
```

### 数据库 gw-dictation-checks 新增字段

- `sentence_results`：LLM 返回的句子级匹配结果
- `snapshot_sentences`：snapshot 句子列表快照
- `llm_version`：`"v3"`

## LLM Prompt 设计

### System Prompt

```
你是古文默写批改助手。根据原文句子列表和用户默写文本，逐句匹配默写情况。

规则：
1. 将默写文本按顺序拆分匹配到对应的原文句子
2. 每个原文句子对应一个结果，status 为 correct/wrong/missing/extra
3. correct：默写与原文完全一致（忽略标点差异）
4. wrong：默写了但有错误（含部分错误）
5. missing：整句未默写（recite 为空字符串）
6. extra：用户多写了原文没有的内容（index 为 -1）
7. 识别通假字（古文中的通假现象），通假字不算错误
8. recite 字段填写用户实际默写的对应文本，保留用户原始书写
9. 标点符号差异不影响 status 判断
10. 严格按照提供的句子列表顺序输出，不要遗漏任何句子
```

### User Prompt 模板

```
标题：{title}
朝代·作者：{authorDisplay}

原文句子列表：
[0] {sentence_0_text}
[1] {sentence_1_text}
...

用户默写文本（OCR识别）：
{recognizedText}

请返回 JSON 格式结果。
```

### Response Format

使用 `response_format: { type: 'json_object' }` 强制 JSON 输出。

## 前端改动

### 改动文件

`pages/ancient/dictation-result.vue`

### 渲染逻辑重构

#### 1. 数据接收

从云函数返回中取 `sentenceResults` 和 `snapshotSentences`，替代现有的 `originalText` + `recognizedText` 全文比对。

#### 2. 逐句处理

对每个 sentence_result：
- `correct`：所有字绿色，第二行空白
- `missing`：所有字红色，第二行空白
- `wrong`：用 LCS 算法对 original 和 recite 做逐字 diff
- `extra`：第一行留白，第二行红色显示多写的字

#### 3. LCS diff 生成逐字渲染数组

对 wrong 句子，LCS diff 产出：

```js
[
  { char: '晋', status: 'correct' },
  { char: '太', status: 'correct' },
  { char: '元', status: 'wrong', written: '原' },
  { char: '中', status: 'correct' },
  { char: '，', status: 'punctuation' }
]
```

#### 4. 通假字处理

LCS diff 时，如果某个字在 tongjiazi 列表中，标记为 `tongjiazi` 而非 `wrong`：
- 第一行蓝色显示原字
- 第二行蓝色显示实际写的字

#### 5. 标题和作者的 diff

title_recite 和 author_recite 同样用 LCS 与原文标题/作者做逐字 diff。

### 双行对照显示规则

| 类型 | 第一行（原文） | 第二行（实际默写） |
|------|------------|--------------|
| 正确 | 绿色 | 空白 |
| 错别字 | 红色原字 | 红色错字 |
| 漏写 | 红色原字 | 空白 |
| 多写 | 空白（留白占位） | 红色多写字 |
| 通假字 | 蓝色原字 | 蓝色实际字 |
| 标点 | 灰色 | 空白 |

### 第一行严格按 snapshot 显示

第一行的原文内容严格来自 `snapshotSentences`，不依赖 LLM 返回的 original 字段。LLM 的 original 仅用于校验一致性。

### 多写字的处理

当 LCS diff 发现 recite 中有 extra 字符时，第一行在对应位置插入空白占位格，第二行显示红色多写字，保证上下对齐。

## 准确率计算

前端根据 LCS diff 结果计算：
- 分母：所有原文汉字数（不含标点）
- 分子：correct 状态的汉字数 + tongjiazi 的汉字数
- accuracy = 分子 / 分母 * 100

## 不做的事情

- 不做 fallback：LLM 失败直接报错，让用户重试
- 不做 reversed 类型：写反拆解为 wrong/extra/missing
- 不做旧数据兼容：新版本独立渲染逻辑（通过 llmVersion 区分）
