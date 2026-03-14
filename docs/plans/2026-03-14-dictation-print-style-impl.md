# 默写纸打印样式 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在默写页增加纸张样式（下划线/虚线/米字格/作文格），预览与 PDF 一致，云函数与打印记录支持新参数。

**Architecture:** 前端新增 paperStyle 状态与 Tab，按样式渲染正文预览（含米字格/作文格格子）；云函数 gw_dictation-print-pdf 按 paperStyle 分支绘制四种 PDF；打印记录表与保存逻辑增加 paper_style 字段。

**Tech Stack:** uni-app (Vue 3), PDFKit (云函数), uniCloud 数据库

**Design:** `docs/plans/2026-03-14-dictation-print-style-design.md`

---

### Task 1: 数据库 schema 增加 paper_style

**Files:**
- Modify: `uniCloud-alipay/database/gw-dictation-print-records.schema.json`

**Step 1:** 在 `font_size` 与 `file_name` 之间增加 `paper_style` 字段。

在 `"font_size": { ... }` 的闭合 `}` 后、`"file_name"` 前插入：

```json
    "paper_style": {
      "bsonType": "string",
      "description": "纸张样式（underline/dotted/rice_grid/essay_grid）",
      "label": "纸张样式"
    },
```

**Step 2:** 保存后可在 HBuilderX 中右键该 schema 校验语法（如有校验功能）。

**Step 3:** Commit

```bash
git add uniCloud-alipay/database/gw-dictation-print-records.schema.json
git commit -m "feat(schema): add paper_style to gw-dictation-print-records"
```

---

### Task 2: 云函数入参与下划线/虚线分支

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 在 `generateDictationPdf` 内解析 `paperStyle`（在解析 `fontSize` 附近）。

- 从 `inner` 或 `data` 读取 `paperStyle`，默认 `'underline'`；归一化为 `underline | dotted | rice_grid | essay_grid`，非法则回退 `underline`。

**Step 2:** 将当前正文绘制逻辑（约 183–222 行）抽成「仅处理 underline 与 dotted」的分支：若 `paperStyle === 'dotted'`，在画 blank 横线前 `doc.dash(4, 2)`，画完后 `doc.dash()` 恢复；否则保持现有实线。`rice_grid`、`essay_grid` 在本任务先不实现，保持与 underline 相同行为（或同一分支）。

**Step 3:** 本地或云端运行一次 generate，传入 `paperStyle: 'dotted'`，确认 PDF 中空位为虚线。Commit。

```bash
git add uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js
git commit -m "feat(print-pdf): accept paperStyle and implement dotted underline"
```

---

### Task 3: 云函数实现米字格绘制

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 当 `paperStyle === 'rice_grid'` 时，使用独立绘制路径：遍历 segments，每个 segment 占一格（正方形边长 = 字宽，如 `charWidth * 1.15`），换行与越界与现有一致。对每一格：画四边矩形 + 两条对角线（从左上到右下、从左下到右上）；若为 char 则在格心写文字，若为 blank 则不写。

**Step 2:** 确保标点也占一格且格内绘制，与设计一致。验证：生成一篇短文 PDF，检查米字格与字符对齐。Commit。

```bash
git add uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js
git commit -m "feat(print-pdf): implement rice_grid style"
```

---

### Task 4: 云函数实现作文格绘制

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js`

**Step 1:** 当 `paperStyle === 'essay_grid'` 时：根据 CONTENT_WIDTH 与单字宽度计算每行格数；根据 segments 与换行计算总行数。先画整页横线、竖线形成网格（仅正文区域），再按 segments 顺序在对应格心绘制字符（标点同占格）；blank 不绘字。

**Step 2:** 验证：生成 PDF，检查网格与字对齐、标点占格。Commit。

```bash
git add uniCloud-alipay/cloudfunctions/gw_dictation-print-pdf/index.js
git commit -m "feat(print-pdf): implement essay_grid style"
```

---

### Task 5: 前端纸张样式状态与 Tab

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 在 `data()` 中增加 `paperStyleOptions` 与 `selectedPaperStyle`：

```js
paperStyleOptions: [
  { label: '下划线', value: 'underline' },
  { label: '虚线', value: 'dotted' },
  { label: '米字格', value: 'rice_grid' },
  { label: '作文格', value: 'essay_grid' }
],
selectedPaperStyle: 'underline'
```

**Step 2:** 在模板中在 `difficulty-tabs` 下方增加一行「纸张样式」Tab（与 difficulty 同风格），绑定 `selectedPaperStyle`。

**Step 3:** 在 `printDictationPaper` 的 `uniCloud.callFunction` 的 `data` 中增加 `paperStyle: this.selectedPaperStyle`。在 `savePrintRecord` 的 payload 中增加 `paper_style: this.selectedPaperStyle`。

**Step 4:** 在打印记录列表的 meta 中可选显示纸张样式（如 `item.paper_style` 映射为中文短名）。Commit。

```bash
git add pages/ancient/dictation.vue
git commit -m "feat(dictation): add paper style tabs and pass to print API"
```

---

### Task 6: 前端预览 — 下划线与虚线

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 正文预览中，根据 `selectedPaperStyle` 渲染空白：`underline` 时保留现有 `class="underline-cell"`；`dotted` 时使用新 class（如 `dotted-cell`），样式为底部虚线（`border-bottom: 2rpx dashed #1f2937`）。用 `v-if`/`v-else-if` 或动态 class 区分。

**Step 2:** 真机或模拟器打开默写页，切换「虚线」查看预览是否与预期一致。Commit。

```bash
git add pages/ancient/dictation.vue
git commit -m "feat(dictation): preview dotted underline style"
```

---

### Task 7: 前端预览 — 米字格

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 当 `selectedPaperStyle === 'rice_grid'` 时，正文区域不再用「字 + underline-cell」混排，改为每个 segment 对应一个格子（inline-block 方框）。每个格子：宽高相等（如 1.2em 或与字号一致），边框 1rpx 实线，内画两条对角线（用两个绝对定位的 line 或 background linear-gradient 模拟）；有字则格内居中显示字，空则空白。注意换行与现有 `paperSegments` 一致。

**Step 2:** 样式与 `paper-font-large/medium/small` 协调，保证预览与 PDF 米字格一致感。验证后 Commit。

```bash
git add pages/ancient/dictation.vue
git commit -m "feat(dictation): preview rice_grid style"
```

---

### Task 8: 前端预览 — 作文格

**Files:**
- Modify: `pages/ancient/dictation.vue`

**Step 1:** 当 `selectedPaperStyle === 'essay_grid'` 时，正文区域用网格布局：先根据每行字数和行数生成网格线（如用 CSS grid + border 或背景线），再在对应格子里按 `paperSegments` 顺序填字或留空，标点占格。可与米字格共用「单格」组件思路，但外层为规则网格。

**Step 2:** 验证预览与 PDF 作文格一致（每行格数、换行、标点占格）。Commit。

```bash
git add pages/ancient/dictation.vue
git commit -m "feat(dictation): preview essay_grid style"
```

---

### Task 9: 云函数 gw_dictation-print-record 保存 paper_style

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_dictation-print-record/index.js`

**Step 1:** 在保存打印记录的 action 中，从 payload 读取 `paper_style`（可选），写入要插入的文档字段 `paper_style`，便于列表展示与排查。

**Step 2:** 确认前端已在 Task 5 传入 `paper_style`，云函数只需透存。Commit。

```bash
git add uniCloud-alipay/cloudfunctions/gw_dictation-print-record/index.js
git commit -m "feat(print-record): persist paper_style"
```

---

### Task 10: 联调与文档

**Files:**
- Modify: `docs/plans/2026-03-14-dictation-print-style-design.md`（如需小修正）

**Step 1:** 在 HBuilderX 运行默写页，依次切换四种样式，确认预览正确；各样式点「打印默写纸」，确认 PDF 与预览一致；展开打印记录，确认有纸张样式信息。

**Step 2:** 若设计文档有细节与实现不符，更新设计文档。Commit。

```bash
git add docs/plans/2026-03-14-dictation-print-style-design.md
git commit -m "docs: update print style design if needed"
```

---

**Plan complete and saved to `docs/plans/2026-03-14-dictation-print-style-impl.md`.**

执行方式二选一：

1. **本会话子 agent 驱动** — 按任务拆给子 agent，每步完成后你做代码审查再继续。  
2. **并行会话** — 在新会话中打开 worktree，用 executing-plans 按检查点批量执行。

你更倾向哪种？
