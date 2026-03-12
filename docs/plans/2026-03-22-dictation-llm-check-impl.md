# 默写批改大模型校验 - 实现计划

基于设计文档：`docs/plans/2026-03-22-dictation-llm-check-design.md`

## 步骤 1：云函数 - 新增 config 配置项

文件：`uniCloud-alipay/cloudfunctions/common/config/index.js`

在 config 中新增 `bailianDictationCheck` 配置（复用已有的百炼 API Key），与 `bailianPoemSearch` 同级：

```js
bailianDictationCheck: {
  get apiKey() { return env('BAILIAN_API_KEY') },
  endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  model: 'qwen-plus',
  timeout: 30000
}
```

同步更新 `config.example.js` 和 `config.local.js`。

## 步骤 2：云函数 - 新增 callLLMCheck 函数

文件：`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

在 `calcAccuracy` 函数之后、OCR 部分之前，新增 `callLLMCheck(originalText, recognizedText)` 函数：

1. 引入 config：`const { bailianDictationCheck } = require('config')`
2. 构建 system prompt（古文默写批改专家角色）
3. 构建 user prompt（传入原文和识别文本）
4. 调用百炼 API（参考 `gw_ancient-search` 中 `requestPoemsFromBailian` 的调用模式）
5. 解析返回的 JSON，提取 `{ accuracy, errors }`
6. 异常时返回 null（由调用方 fallback）

### Prompt 设计

System prompt 核心内容：
- 角色：古文默写批改专家
- 任务：对比原文和学生默写内容，找出所有错误
- 错误类型：wrong（写错字，含 errorType: homophone/similar/other）、missing（漏写）、extra（多写）、reversed（字句写反）、tongjiazi（通假字，不算错）
- 标点符号忽略，不参与校验
- 输出格式：严格 JSON，只返回错误，不返回正确部分
- 每个错误包含 context 字段用于定位

## 步骤 3：云函数 - 修改 handleCheck 中的 diff 逻辑

文件：`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

修改 `handleCheck` 函数第 291-297 行区域：

```js
// 改动前
const diffResult = diffChars(originalText, recognizedText)
const accuracy = calcAccuracy(diffResult)
const wrongChars = diffResult.filter(d => d.status === 'wrong' || d.status === 'missing').map(d => d.recognized || d.char)

// 改动后
let diffResult, accuracy, wrongChars, diffVersion = 1
const llmResult = await callLLMCheck(originalText, recognizedText)
if (llmResult) {
  diffResult = { errors: llmResult.errors, version: 2 }
  accuracy = llmResult.accuracy
  wrongChars = llmResult.errors
    .filter(e => e.type === 'wrong' || e.type === 'missing')
    .map(e => e.written || e.original)
  diffVersion = 2
} else {
  // fallback 到旧的 LCS diff
  const oldDiff = diffChars(originalText, recognizedText)
  diffResult = oldDiff
  accuracy = calcAccuracy(oldDiff)
  wrongChars = oldDiff.filter(d => d.status === 'wrong' || d.status === 'missing').map(d => d.recognized || d.char)
}
```

保留原有的 `diffChars` 和 `calcAccuracy` 函数不删除，作为 fallback。

## 步骤 4：前端 - 新增双行对照渲染逻辑

文件：`pages/ancient/dictation-result.vue`

### 4a. data 新增字段

```js
diffVersion: 1,  // 区分新旧数据格式
renderList: []   // 双行对照渲染数组
```

### 4b. 新增 buildRenderList 方法

将大模型返回的 errors + 原文 合并为逐字渲染数组：

1. 原文逐字拆分，每个字默认 `{ char, status: 'correct', written: '' }`
2. 标点字符标记为 `punctuation`
3. 遍历 errors，通过 `original` + `context` 在原文中定位
4. 标记对应位置的 status、written、errorType 等
5. 多写（extra）根据 afterOriginal 插入占位 `{ char: null, status: 'extra', written }`
6. reversed 类型标记 isGroupStart

### 4c. 数据加载兼容

在 onLoad 和 loadRecordDetail 中：
- 检查 diffResult 是否有 `version: 2`
- version 2：调用 buildRenderList 生成 renderList
- version 1（旧数据）：保持现有逻辑不变

## 步骤 5：前端 - 重写批改详情模板

文件：`pages/ancient/dictation-result.vue`

### 5a. 新版模板（version 2）

用 `v-if="diffVersion === 2"` 切换新旧模板。

新版批改详情采用双行对照布局：
- 外层用 flex-wrap 实现自动换行
- 每个字符一列，固定宽度
- 每列包含上下两个 text：原文行 + 实际行
- 通过 status 控制颜色

```html
<view class="dual-row-grid" v-if="diffVersion === 2">
  <view class="char-col" v-for="(item, idx) in renderList" :key="idx">
    <text :class="['row-original', 'diff-' + item.status]">
      {{ item.char || '　' }}
    </text>
    <text :class="['row-actual', item.written ? 'diff-wrong' : '']">
      {{ item.written || '　' }}
    </text>
  </view>
</view>
```

### 5b. 旧版模板保留（version 1）

用 `v-else` 保留现有的标题/作者/正文三行渲染逻辑。

## 步骤 6：前端 - 更新图例和错字详情

### 6a. 图例更新

version 2 时显示完整图例：
```
● 正确  ● 写错  ● 漏写  ● 写反  ● 多写  ● 通假字
```

### 6b. 错字详情更新

version 2 时从 errors 中提取，显示更丰富的信息：
- 原字 → 错字（错误类型：同音/形近/其他）
- 漏写的字列表
- 写反的内容

## 步骤 7：前端 - 新增样式

新增双行对照相关样式：
- `.dual-row-grid`：flex 容器，flex-wrap
- `.char-col`：固定宽度列，上下两行
- `.row-original` / `.row-actual`：上下行文字
- `.diff-reversed`：写反颜色（橙色或红色）
- `.diff-extra`：多写颜色
- `.diff-tongjiazi`：通假字颜色（蓝色）

## 步骤 8：同步更新 config 文件

- `config.example.js`：新增 bailianDictationCheck 示例
- `config.local.js`：新增 bailianDictationCheck 实际配置

## 实现顺序

1. 步骤 1 + 8（config 配置）
2. 步骤 2（callLLMCheck 函数）
3. 步骤 3（修改 handleCheck）
4. 步骤 4（前端数据处理）
5. 步骤 5 + 6 + 7（前端模板和样式）

## 风险与注意事项

- 大模型返回 JSON 格式不稳定：需要 try-catch + fallback
- context 定位可能有歧义（原文中重复的字）：用最长匹配 + 首次出现策略
- 云函数超时：百炼 API 超时设 30s，加上 OCR 约 10s，总计 40s 内，uniCloud 默认 60s 够用
- 旧数据兼容：version 字段缺失时视为 version 1
