# 默写纸格子样式实现计划（v2）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在默写页增加纸张样式设置，支持 6 种样式（下划线/虚线/田字格/米字格/作文格/中高考贴），预览自适应屏幕宽度，PDF 打印按固定规格输出。

**Architecture:** 前端新增 paperStyle 状态与 Tab，按样式渲染正文预览；云函数按 paperStyle 分支绘制 6 种 PDF；打印记录增加 paper_style 字段。

**Tech Stack:** uni-app (Vue), PDFKit (云函数), uniCloud 数据库

**Design:** `docs/plans/2026-03-14-dictation-print-style-design.md`

---

### Task 1: 前端 — 数据模型与样式选择器

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 在 `data()` 中新增：
```js
paperStyle: 'underline',
paperStyleOptions: [
  { label: '下划线', value: 'underline' },
  { label: '虚线', value: 'dotted' },
  { label: '田字格', value: 'tian_grid' },
  { label: '米字格', value: 'mi_grid' },
  { label: '作文格', value: 'essay_grid' },
  { label: '中高考贴', value: 'exam_grid' }
]
```

**Step 2:** 在模板中 `difficulty-tabs` 下方新增样式选择 tabs（复用同样式）：
```html
<view class="style-label">纸张样式</view>
<view class="difficulty-tabs">
  <view v-for="item in paperStyleOptions" :key="item.value"
    class="difficulty-tab" :class="{ active: paperStyle === item.value }"
    @tap="paperStyle = item.value">
    {{ item.label }}
  </view>
</view>
```

**Step 3:** 在 `printDictationPaper` 的 callFunction data 中增加 `paperStyle: this.paperStyle`。在 `savePrintRecord` payload 中增加 `paperStyle: this.paperStyle`。

---

### Task 2: 前端预览 — 虚线样式

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 在模板 `paper-content` 区域，将 `underline-cell` 改为动态 class：
- `paperStyle === 'underline'` → `underline-cell`
- `paperStyle === 'dotted'` → `dotted-cell`

**Step 2:** 新增 CSS：
```css
.dotted-cell {
  display: inline-block;
  min-width: 40rpx;
  height: 1.2em;
  border-bottom: 2rpx dashed #1f2937;
  vertical-align: bottom;
  margin: 0 2rpx;
}
```

---

### Task 3: 前端预览 — 格子类样式（田字格/米字格/作文格/中高考贴）

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 当 `paperStyle` 为格子类时，`paper-content` 区域切换为格子布局：
- 外层 `display: flex; flex-wrap: wrap`
- 每个 segment 渲染为固定宽高的格子 view
- 格子大小：田字格/米字格/作文格用 60rpx，中高考贴用 54rpx
- 每行格数由容器宽度自适应

**Step 2:** 各格子类 CSS：

田字格 `tian-grid-cell`：
- border 实线，`::before` 横中线 dashed，`::after` 竖中线 dashed

米字格 `mi-grid-cell`：
- 同田字格 + background linear-gradient 画两条对角虚线

作文格 `essay-grid-cell`：
- 纯方格 border 实线，无中线

中高考贴 `exam-grid-cell`：
- 同作文格，格子稍小

**Step 3:** 提示字格内居中显示，空位格子留空，标点格内显示。换行符 `\n` 后插入占满剩余格数的空 view 实现强制换行。

---

### Task 4: 云函数 — 接收 paperStyle 参数 + 虚线分支

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 在 `generateDictationPdf` 中解析 paperStyle：
```js
const paperStyle = normalizeText((inner && inner.paperStyle) || data.paperStyle || 'underline')
const validStyles = ['underline','dotted','tian_grid','mi_grid','essay_grid','exam_grid']
const style = validStyles.includes(paperStyle) ? paperStyle : 'underline'
```

**Step 2:** 将现有正文绘制逻辑（183-225行）提取为 `drawUnderline(doc, segments, ...)`。

**Step 3:** 新增 `drawDotted`：复制 drawUnderline，在画空位横线前 `doc.dash(4, 2)`，画完后 `doc.undash()`。

**Step 4:** 主函数按 style 值调用对应 draw 函数。

---

### Task 5: 云函数 — 田字格 PDF 绘制

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 新增 `drawTianGrid(doc, segments, config)` 函数：
- 格子尺寸：10mm = 28.35pt
- 每行格数 = `Math.floor(CONTENT_WIDTH / cellSize)`
- 遍历 segments，每个占一格
- 每格：`doc.rect()` 画外框实线，`doc.dash(2,2)` 画横竖中线，`doc.undash()`
- char 类型：`doc.text()` 居中写入格内
- blank 类型：格内留空
- `\n`：跳到下一行起始位置（填充当前行剩余空格）
- 分页：当 y + cellSize 超出页面底部时 `doc.addPage()`

---

### Task 6: 云函数 — 米字格 PDF 绘制

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 新增 `drawMiGrid(doc, segments, config)` 函数：
- 同田字格基础上，每格额外画两条对角线（左上→右下，左下→右上），用 `doc.dash(2,2)` 虚线
- 其余逻辑与田字格完全一致

---

### Task 7: 云函数 — 作文格 PDF 绘制

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 新增 `drawEssayGrid(doc, segments, config)` 函数：
- 格子尺寸：10mm = 28.35pt
- 固定每行 20 列，每页 20 行 = 400 字/页
- 纯方格（只画 `doc.rect()`），无中线
- 字符居中写入，空位留空
- 分页逻辑同上

---

### Task 8: 云函数 — 中高考贴 PDF 绘制

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 新增 `drawExamGrid(doc, segments, config)` 函数：
- 格子尺寸：9mm = 25.51pt
- 严格每行 25 格
- 行数按页面可用高度计算
- 纯方格，字符居中，空位留空
- 分页逻辑同上

---

### Task 9: 数据库 schema 增加 paper_style

**Files:**
- Modify: `uniCloud-alipay/database/gw-dictation-print-records.schema.json`（如存在）

**Step 1:** 在 schema 中增加 `paper_style` 字段：
```json
"paper_style": {
  "bsonType": "string",
  "description": "纸张样式",
  "label": "纸张样式"
}
```

如 schema 文件不存在则跳过此步，前端直接透传即可。

---

### Task 10: 云函数 print-record 保存 paper_style

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-record/index.js`

**Step 1:** 在保存打印记录时，从 payload 读取 `paperStyle`，写入文档字段 `paper_style`。

---

### Task 11: 联调验证

**Step 1:** 依次切换 6 种样式，确认页面预览正确渲染。
**Step 2:** 每种样式点「打印默写纸」，确认 PDF 输出与设计规格一致。
**Step 3:** 检查打印记录中 paper_style 字段正确保存。

---

**Plan complete.** 共 11 个任务，建议按顺序执行。Task 1-3 为前端，Task 4-8 为云函数 PDF，Task 9-10 为数据层，Task 11 为联调。
