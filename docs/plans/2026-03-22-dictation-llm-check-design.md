# 默写批改大模型校验设计

## 概述

将默写批改中的 JS diff 逐字对比算法替换为大模型（阿里云百炼 qwen-plus）校验，支持更丰富的错误类型识别，并在批改详情页以双行对照方式展示结果。

OCR 识别逻辑保持不变，仅替换对比校验部分。

## 错误类型

| 类型 | type 值 | 说明 |
|------|---------|------|
| 写错字 | `wrong` | 包含同音字(homophone)、形近字(similar)、其他(other) |
| 漏写 | `missing` | 原文有但未写出 |
| 多写 | `extra` | 写了原文没有的字/句 |
| 字句写反 | `reversed` | 前后顺序颠倒 |
| 通假字 | `tongjiazi` | 古文通假，不算错误 |

标点符号显示但不校验，不参与准确率计算。

## 大模型调用方案

### 方案选择

在现有 `gw_dictation-check` 云函数中，OCR 完成后直接调用大模型，替换原有的 `diffChars` 逻辑。

### 返回策略：只返回错误

大模型只返回错误部分，不返回正确内容。优点：
- 减少幻觉风险（不需要重复输出所有正确内容）
- 输出更短，token 消耗少，响应更快
- 前端可验证（错误位置必须存在于原文中）

### 大模型返回数据结构

```json
{
  "accuracy": 85.5,
  "errors": [
    {
      "type": "wrong",
      "original": "觉",
      "context": "不觉晓",
      "written": "角",
      "errorType": "homophone"
    },
    {
      "type": "reversed",
      "original": "处处闻",
      "context": "处处闻啼鸟",
      "written": "闻处处"
    },
    {
      "type": "missing",
      "original": "啼鸟",
      "context": "闻啼鸟"
    },
    {
      "type": "extra",
      "written": "春来",
      "afterOriginal": "多少",
      "context": "知多少"
    },
    {
      "type": "tongjiazi",
      "original": "说",
      "context": "不亦说乎",
      "written": "悦",
      "note": "说通悦"
    }
  ]
}
```

字段说明：
- `type`: 错误类型枚举
- `original`: 原文中的正确文字
- `context`: 原文上下文片段，用于前端精确定位（避免 LLM 数 index 不准）
- `written`: 用户实际写的内容
- `errorType`: 写错字的细分（homophone/similar/other）
- `afterOriginal`: 多写时，表示在原文哪段文字之后出现
- `note`: 可选备注（如通假字说明）

## 前端 UI 设计：双行对照

### 展示方式

批改详情区域采用双行对照：
- 第一行：完整原文，正确字绿色，错误字红色
- 第二行：实际默写的错误内容，与第一行严格对齐

### 各错误类型的双行规则

| 类型 | 第一行（原文） | 第二行（实际） |
|------|------------|------------|
| 正确 | 绿色字 | 空 |
| 写错 | 红色原字 | 红色错字 |
| 漏写 | 红色原字 | 空 |
| 多写 | 空（占位） | 红色多写的字 |
| 写反 | 红色正确顺序 | 红色实际顺序 |
| 通假字 | 蓝色原字 | 蓝色实际字 |
| 标点 | 灰色 | 空 |

### 对齐实现

中文字符等宽，使用 CSS grid 或 flexbox 固定每列宽度，确保上下两行一一对应。多写的字在第一行用空占位，保证位置不偏移。

### 效果示意

```
原文行：春 眠 不 觉 晓 ， 处 处 闻 啼 鸟 。 ＿ ＿
        绿 绿 绿 红 绿 灰 红 红 红 红 红 灰
实际行：         角       闻 处 处          春 来
                 红       红 红 红          红 红
```

### 前端渲染逻辑

1. 原文准备：从 `originalText` 获取完整原文
2. 错误定位：遍历大模型返回的 `errors`，通过 `original` + `context` 在原文中找到精确位置
3. 合并渲染：生成逐字渲染数组，未被标记的字符默认 `correct`
4. 多写插入：根据 `afterOriginal` 在对应位置插入占位列

渲染数组结构：

```js
[
  { char: '春', status: 'correct' },
  { char: '觉', status: 'wrong', errorType: 'homophone', written: '角' },
  { char: '啼', status: 'missing' },
  { char: '处', status: 'reversed', written: '闻处处', isGroupStart: true },
  { char: '处', status: 'reversed' },
  { char: '闻', status: 'reversed' },
  { char: null, status: 'extra', written: '春' },  // 多写占位
  { char: '，', status: 'punctuation' }
]
```

## 云函数改动

### 改动范围

仅修改 `gw_dictation-check` 云函数中 `check` action 的 diff 逻辑部分（约第291-297行）。OCR 识别和数据库存储逻辑不变。

### 改动内容

新增 `callLLMCheck(originalText, recognizedText)` 函数：
1. 构建 prompt（系统提示 + 用户输入）
2. 调用阿里云百炼 qwen-plus API（复用项目已有配置）
3. 解析返回的 JSON
4. 容错：大模型返回格式异常时 fallback 到旧的 JS LCS diff

### 数据库兼容

`gw-dictation-checks` 表的 `diff_result` 字段：
- 新格式：`{ errors, extras, version: 2 }`
- 旧格式：现有逐字数组 `[{char, status}, ...]`
- 前端通过 `version` 字段区分，旧数据用旧渲染逻辑

### Fallback 策略

大模型调用失败（超时、格式错误等）时，回退到现有 JS LCS diff 算法，确保功能不中断。结果以旧格式（version 1）存储。
