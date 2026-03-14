# 默写纸打印样式设计（v2）

## 目标

在 `pages/ancient/dictation.vue` 默写页增加「纸张样式」设置，支持 6 种样式：下划线、虚线、田字格、米字格、作文格、中高考贴。样式影响页面预览和 PDF 打印两个场景。

## 样式定义与规格

| 样式 | 值 | 格子尺寸(打印) | 打印布局 | 预览布局 | 说明 |
|------|-----|---------------|---------|---------|------|
| 下划线 | `underline` | — | 流式排列 | 流式，自适应宽度 | 空位底部实线（已有） |
| 虚线 | `dotted` | — | 流式排列 | 流式，自适应宽度 | 空位底部虚线 |
| 田字格 | `tian_grid` | 10mm × 10mm | 每行格数按纸张宽度计算 | 格子用rpx，每行格数自适应屏幕宽度 | 外框实线 + 横竖中线虚线 |
| 米字格 | `mi_grid` | 10mm × 10mm | 同田字格 | 同田字格 | 外框 + 横竖中线 + 两条对角线 |
| 作文格 | `essay_grid` | 10mm × 10mm | 20列×20行(400字/页) | 格子用rpx，每行格数自适应 | 纯方格，无中线 |
| 中高考贴 | `exam_grid` | 9mm × 9mm | 严格每行25格 | 格子用rpx，每行格数自适应 | 模拟高考答题卡作文区 |

共同规则：
- 格子类样式中，所有字符（提示字、标点、空位）统一占一格
- 提示字和标点由系统填入格中，空位显示空格子
- 换行符 `\n` 强制换到下一行起始位置
- 下划线/虚线保持现有流式排列逻辑不变

## 方案：单一参数 paperStyle

- 前端增加「纸张样式」选择器：下划线、虚线、田字格、米字格、作文格、中高考贴，选中值 `paperStyle` 传给云函数并写入打印记录。
- 云函数 `gw_dictation-print-pdf` 增加入参 `paperStyle`（默认 `underline`），按六种取值分支绘制。
- 打印记录表 `gw-dictation-print-records` 增加可选字段 `paper_style`（string）。
- 旧数据没有 `paperStyle` 字段时，默认当作 `underline` 处理，无需数据库迁移。

## 前端页面预览

### 样式选择器 UI

在现有打印设置区域增加样式选择（radio 或 picker），数据模型新增：
```js
paperStyle: 'underline'  // 'underline' | 'dotted' | 'tian_grid' | 'mi_grid' | 'essay_grid' | 'exam_grid'
```

### 渲染逻辑

**下划线 / 虚线**：保持现有 `underline-cell` 流式布局，虚线把 `border-bottom: solid` 改为 `dashed`。

**格子类（田字格 / 米字格 / 作文格 / 中高考贴）**：
- 外层容器 `display: flex; flex-wrap: wrap`
- 每个字符渲染为固定宽高的格子 `<view>`
- 格子大小用 rpx 单位，保证不同屏幕下视觉一致
- 每行格数 = `Math.floor(容器宽度 / 格子宽度)`，动态计算
- 换行符 `\n` 后面的字符强制从下一行第一格开始

### CSS 格子绘制

| 样式 | CSS 实现 |
|------|---------|
| 田字格 | `border: 1px solid` + 横竖中线用 `::before`/`::after` 伪元素（dashed线） |
| 米字格 | 田字格基础上 + 两条对角线用 `linear-gradient` 或额外伪元素 `rotate(45deg)` |
| 作文格 | 简单方格 `border: 1px solid`，无中线 |
| 中高考贴 | 同作文格，格子稍小 |

### 提示字与空位区分

- 提示字格子：格内显示文字，浅色背景或文字颜色区分
- 空位格子：格内为空，保持现有视觉提示
- 标点格子：格内显示标点符号

## PDF 打印实现

### 绘制子函数

在现有 `generateDictationPdf` 函数中提取子函数：

```
drawUnderline(doc, segments, ...)   // 已有逻辑提取
drawDotted(doc, segments, ...)      // 同下划线，线型改 dash
drawTianGrid(doc, segments, ...)    // 10mm 格子 + 横竖中线(虚线)
drawMiGrid(doc, segments, ...)      // 10mm 格子 + 横竖中线 + 对角线
drawEssayGrid(doc, segments, ...)   // 10mm 格子，20列×20行
drawExamGrid(doc, segments, ...)    // 9mm 格子，严格25列
```

### 各样式绘制细节

- **下划线 / 虚线**：流式排列，虚线用 `doc.dash(3, 3)` 设置线型。
- **田字格**：每格 10mm，每行格数 = `Math.floor(可用宽度 / 10)`，外框实线 + 横竖中线虚线，提示字居中写入，空位留空。
- **米字格**：同田字格 + 两条对角线（从四角到中心的虚线）。
- **作文格**：每格 10mm，固定 20 列 × 20 行 = 400 字/页，纯方格无中线。
- **中高考贴**：每格 9mm，固定 25 列，行数按页面高度计算，纯方格。

### 分页逻辑

- 格子类样式：按行计算，当前页剩余高度不够一行时换页
- 每页顶部重绘标题信息（如果有）

## 错误处理

- 云函数收到未知 `paperStyle` 时回退为 `underline` 并正常生成 PDF。

## 涉及文件

- `pages/ancient/dictation.vue`：纸张样式选择器、六种预览渲染、传参与记录。
- `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`：六种样式的 PDF 绘制分支。
- `uniCloud-alipay/database/gw-dictation-print-records.schema.json`：增加 `paper_style` 字段。
