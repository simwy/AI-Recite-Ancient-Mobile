# 默写批改详情 — 丰富错误分类设计

## 背景

当前批改详情只有 correct/wrong/missing 三种状态，用户无法直观看到错误类型和具体错在哪。需要增加更丰富的错误分类，并以零交互方式展示。

## 技术方案：LCS + 大模型混合

保留现有 LCS 逐字匹配作为基础，新增大模型调用做错误分类。大模型失败时降级为现有效果。

### 流程

```
OCR识别 → LCS逐字匹配(基础diffResult) → 大模型错误分类 → 合并结果(enriched diffResult) → 前端渲染
```

## 错误类型

| 类型 | errorType | 说明 |
|------|-----------|------|
| 写错字 | `wrong_char` | 字写错了，有对应的识别字符 |
| 漏写字 | `missing_char` | 漏了个别字 |
| 漏写句 | `missing_sentence` | 漏了整句或连续多字 |
| 顺序颠倒 | `reversed` | 相邻的字或句子写反了顺序 |
| 多写/添字 | `extra_char` | 写了原文没有的多余字 |
| 正确 | `correct` | 正确 |
| 标点 | `punctuation` | 标点符号，不参与评分 |

## 大模型调用设计

### 位置

云函数 `gw_dictation-check` 的 `handleCheck` 中，LCS 之后、存数据库之前。

### 输入

将原文、识别文本、LCS 差异摘要发给大模型（通义千问 Qwen-plus）。

### 输出 JSON

```json
{
  "errors": [
    { "type": "wrong_char", "position": 5, "original": "明", "written": "名" },
    { "type": "missing_char", "positions": [8] },
    { "type": "missing_sentence", "startPos": 15, "endPos": 22 },
    { "type": "reversed", "positions": [3, 4], "written": "月明" },
    { "type": "extra_char", "written": "了", "nearPosition": 10 }
  ]
}
```

### 合并逻辑

大模型返回的 errors 映射到 diffResult 数组，为每个字增加 `errorType` 字段。未被大模型分类的 wrong/missing 保持原状态。

### 降级

大模型调用失败（超时/格式错误等）→ 使用 LCS 原始结果，体验与当前一致。

## 前端展示设计（零交互，纯视觉）

核心原则：用户不需要任何点击操作，从上到下扫一遍就能看清所有错误。

### 写错字 `wrong_char`

正确字红色显示 + 用户写错的字紧跟其后，红色删除线。

示例：`...悠然见 南(红色) 三̶(红色删除线) 山...`

用户一眼看到：原文是"南"，我写成了"三"。

### 漏写字 `missing_char`

原文字红色 + 红色下划线 + 右上角小标签"漏"。

示例：`...床前 [明](红色下划线+漏标签) 月光...`

### 漏写句 `missing_sentence`

连续漏写的整句红色 + 红色下划线 + 标签"漏句"。

示例：`...[疑是地上霜](红色下划线+漏句标签)...`

### 顺序颠倒 `reversed`

原文橙色 + 下划线 + 小标签"颠倒"，旁边灰色小字显示用户实际写的顺序。

示例：`...[明月](橙色下划线+颠倒标签) 写成→月明 ...`

### 多写/添字 `extra_char`

多余的字灰色删除线 + 小标签"多写"。

示例：`...疑是地上霜 [了̶](灰色删除线+多写标签)...`

### 图例扩展

现有图例从 3 种扩展为：
- 🟢 正确
- 🔴 写错字（红色 + 删除线标注错字）
- 🔴 漏写（红色下划线 + 漏标签）
- 🟠 顺序颠倒（橙色下划线）
- ⚫ 多写（灰色删除线）

## diffResult 数据结构变化

现有字段保持不变，新增 `errorType` 和相关字段：

```js
// 写错字
{ char: '南', status: 'wrong', errorType: 'wrong_char', recognized: '三' }

// 漏写字
{ char: '明', status: 'missing', errorType: 'missing_char' }

// 漏写句（连续的 missing 字符共享同一标记）
{ char: '疑', status: 'missing', errorType: 'missing_sentence' }

// 顺序颠倒
{ char: '明', status: 'wrong', errorType: 'reversed', reversedText: '月明' }

// 多写（插入到 diffResult 中对应位置之后）
{ char: '了', status: 'extra', errorType: 'extra_char' }

// 正确 / 标点（不变）
{ char: '床', status: 'correct' }
{ char: '，', status: 'punctuation' }
```

## 改动范围

1. **云函数 `gw_dictation-check/index.js`**
   - handleCheck 中 LCS 之后新增大模型调用
   - 合并大模型分类结果到 diffResult
   - 新增大模型调用失败降级逻辑

2. **前端 `pages/ancient/dictation-result.vue`**
   - 批改详情区域重写渲染逻辑，支持新的 errorType
   - 新增对应 CSS 样式（删除线、标签、颜色等）
   - 图例扩展

3. **不改动的部分**
   - `common/diff.js` — LCS 算法不变
   - 准确率计算逻辑不变（仍基于 LCS）
   - 数据库结构不变（diffResult 字段兼容）
