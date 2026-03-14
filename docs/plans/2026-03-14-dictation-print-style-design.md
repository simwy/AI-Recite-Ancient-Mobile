# 默写纸打印样式设计

## 目标

在 `pages/ancient/dictation.vue` 默写页增加「纸张样式」设置，在现有**下划线**基础上增加**虚线**、**米字格**、**中高考作文格**三种样式；**预览与打印一致**，即页面上的纸张预览与生成的 PDF 表现一致。

## 样式定义

| 样式     | 值           | 说明 |
|----------|--------------|------|
| 下划线   | `underline`  | 每个空位一条实线横线（当前行为） |
| 虚线     | `dotted`     | 每个空位一条虚线横线（一段实一段空） |
| 米字格   | `rice_grid`  | 每字一格（含标点），格内画外框 + 两条对角线；空位不写字 |
| 作文格   | `essay_grid` | 整页横竖网格，每格一字，标点占格且系统预先填入；空位为空格子 |

标点符号均由系统填入（不挖空），且标点也占格子/空位的一格。

## 方案：单一参数 paperStyle

- 前端增加「纸张样式」Tab：下划线、虚线、米字格、作文格，选中值 `paperStyle` 传给云函数并写入打印记录。
- 云函数 `gw_dictation-print-pdf` 增加入参 `paperStyle`（默认 `underline`），按四种取值分支绘制。
- 打印记录表 `gw-dictation-print-records` 增加可选字段 `paper_style`（string）。

## 数据与接口

- **前端**：`paperStyleOptions`、`selectedPaperStyle`（默认 `underline`）；调用 `gw_dictation-print-pdf` 时传 `paperStyle`；保存打印记录时传 `paper_style`。
- **云函数**：入参增加 `paperStyle`（可选，默认 `underline`）；未知值时回退为 `underline`。
- **数据库**：`gw-dictation-print-records` 增加 `paper_style`（string，可选）。

## UI 与预览（与打印一致）

- 在默写页「难度」与「字号」附近增加一行「纸张样式」Tab，四项：下划线、虚线、米字格、作文格。
- **预览与 PDF 一致**：
  - **下划线**：空白处 `underline-cell`，底部实线。
  - **虚线**：空白处同占位，底部虚线（`border-bottom-style: dashed`）。
  - **米字格**：每个 segment（字或空）占一格，格内画外框 + 两条对角线；有字则格内居中显示字，空则只显示格子。
  - **作文格**：正文区域为规则方格（横竖线），每格一字；按 segments 顺序在格内填字或留空，标点占格并显示。

即米字格、作文格在页面上也需画出完整格子，不做简化，与导出 PDF 一致。

## PDF 绘制（云函数）

- **下划线**：仅对 `type === 'blank'` 画实线横线（现有逻辑）。
- **虚线**：仅对 blank 画横线，使用 PDFKit 虚线（如 `doc.dash(4, 2)`），画毕恢复实线。
- **米字格**：每个 segment 对应一格（正方形，边长取字宽）；每格画四边 + 两条对角线；char 在格心绘字，blank 不绘字。
- **作文格**：按内容宽度与字宽算每行格数、总行数；先画整页横竖网格，再按 segments 在格心逐字绘制，blank 不绘字。
- 未知 `paperStyle` 时按 `underline` 处理。

## 错误处理

- 云函数收到未知 `paperStyle` 时回退为 `underline` 并正常生成 PDF。

## 涉及文件

- `pages/ancient/dictation.vue`：纸张样式 Tab、四种预览渲染、传参与记录。
- `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`：四种样式的 PDF 绘制分支。
- `uniCloud-alipay/database/gw-dictation-print-records.schema.json`：增加 `paper_style` 字段。
