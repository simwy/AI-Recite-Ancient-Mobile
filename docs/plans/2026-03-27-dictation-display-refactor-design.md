# 默写批改显示规则重构设计

## 概述

重构 `dictation-result.vue` 的双行对照显示规则，简化错误类型分类，统一显示样式。LLM 一次调用返回两套结果：显示用 (display_errors) 和统计用 (stat_errors)，各司其职。

## 数据结构：双结果集

LLM 一次调用返回两部分数据：

### display_errors（前端显示用）

3种错误类型 + 通假字，写反已拆解为多写+漏写：

| 类型 | type 值 | 说明 |
|------|---------|------|
| 错别字 | `wrong` | 含同音字/形近字/其他 |
| 漏写 | `missing` | 原文有但未写出 |
| 多写 | `extra` | 写了原文没有的字 |
| 通假字 | `tongjiazi` | 古文通假，不算错误 |

### stat_errors（后台统计用）

4种错误类型 + 通假字，保留写反的原始语义：

| 类型 | type 值 | 说明 |
|------|---------|------|
| 错别字 | `wrong` | 含同音字/形近字/其他 |
| 漏写 | `missing` | 原文有但未写出 |
| 多写 | `extra` | 写了原文没有的字 |
| 写反 | `reversed` | 前后顺序颠倒 |
| 通假字 | `tongjiazi` | 古文通假，不算错误 |

标点符号和 `·` 不校验，全部灰色显示。

### LLM 返回结构示例

```json
{
  "accuracy": 85.5,
  "display_errors": [
    { "type": "wrong", "original": "觉", "context": "不觉晓", "written": "角", "errorType": "homophone" },
    { "type": "missing", "original": "处处", "context": "处处闻啼鸟" },
    { "type": "extra", "written": "闻处", "afterOriginal": "闻", "context": "处处闻啼鸟" },
    { "type": "tongjiazi", "original": "说", "context": "不亦说乎", "written": "悦", "note": "说通悦" }
  ],
  "stat_errors": [
    { "type": "wrong", "original": "觉", "written": "角", "errorType": "homophone" },
    { "type": "reversed", "original": "处处闻", "written": "闻处处" },
    { "type": "tongjiazi", "original": "说", "written": "悦", "note": "说通悦" }
  ]
}
```

## 双行对照显示规则

| 类型 | 第一行（原文） | 第二行（实际默写） |
|------|------------|--------------|
| 正确 | 绿色 | 空白 |
| 错别字 | 红色原字 | 红色错字 + 删除线 |
| 漏写 | 红色原字 | 空白 |
| 多写 | 空白（留白） | 红色多写字 + 删除线 |
| 通假字 | 蓝色原字 | 蓝色实际字 |
| 标点 | 灰色 | 空白 |

## 改动范围

### 1. LLM Prompt（云函数）

文件：`uniCloud-alipay/cloudfunctions/gw_dictation-check/index.js`

- 修改 system prompt，要求 LLM 返回 `display_errors` 和 `stat_errors` 两个数组
- `display_errors` 中不含 reversed，写反拆解为 extra + missing
- `stat_errors` 中保留 reversed 原始类型
- 通假字两边都返回

### 2. 云函数数据存储

- 将 `stat_errors` 存入数据库用于后台统计
- 将 `display_errors` 传给前端用于渲染

### 3. 前端页面

文件：`pages/ancient/dictation-result.vue`

**CSS 改动：**
- 第二行 wrong/extra 文字新增 `text-decoration: line-through`
- 移除 reversed 相关样式
- 移除 reversed 图例样式

**模板改动：**
- 图例简化为：正确 / 错别字 / 漏写 / 多写 / 通假字
- 移除 reversed 相关图例项

**JS 改动：**
- `buildRenderList` 中移除 reversed 相关处理
- `wrongDetails` computed 中移除 reversed 过滤
- `errorTypeLabel` 中移除 reversed 映射
- 前端只消费 `display_errors` 数据
