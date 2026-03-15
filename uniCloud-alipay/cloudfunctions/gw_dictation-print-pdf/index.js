'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const PDFDocument = require('pdfkit')

const A4_WIDTH = 595.28
const PAGE_MARGIN = 56
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function normalizeContent(value) {
  return String(value || '').replace(/\r\n/g, '\n')
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 30)
}

function getFontSizeConfig(size) {
  if (size === 'large') {
    return { title: 24, meta: 15, body: 18, lineGap: 14 }
  }
  if (size === 'small') {
    return { title: 20, meta: 13, body: 15, lineGap: 10 }
  }
  return { title: 22, meta: 14, body: 16.5, lineGap: 12 }
}

function isPunctuation(char) {
  return /[，。、！？；：、""''（）《》〈〉【】『』「」…,.!?;:'"()\-、]/.test(char)
}
function isPhraseDelimiter(char) {
  return /[，、；：,;:]/.test(char)
}
function isSentenceDelimiter(char) {
  return /[。！？!?]/.test(char)
}

function normalizeDifficulty(value) {
  const v = String(value || '').toLowerCase().trim()
  if (v === 'middle' || v === '中级') return 'middle'
  if (v === 'advanced' || v === '高级') return 'advanced'
  return 'junior'
}

function getPaperSegments(content, difficulty) {
  const level = normalizeDifficulty(difficulty)
  let startChecker = () => false
  if (level === 'junior') {
    startChecker = isPhraseDelimiter
  } else if (level === 'middle') {
    startChecker = isSentenceDelimiter
  }
  let shouldHint = level !== 'advanced'
  const segments = []
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (char === '\n') {
      segments.push({ type: 'char', value: '\n' })
      shouldHint = level !== 'advanced'
      continue
    }
    if (/\s/.test(char)) {
      segments.push({ type: 'char', value: char })
      continue
    }
    if (isPunctuation(char)) {
      segments.push({ type: 'char', value: char })
      if (level !== 'advanced' && startChecker(char)) {
        shouldHint = true
      }
      continue
    }
    if (level !== 'advanced' && shouldHint) {
      segments.push({ type: 'char', value: char })
      shouldHint = false
    } else {
      segments.push({ type: 'blank', value: '' })
    }
  }
  return segments
}

function drawGridStyle(doc, segments, fontConfig, gridType) {
  // 格子尺寸：田/米/作文 10mm=28.35pt，中高考 9mm=25.51pt
  const cellSize = gridType === 'exam' ? 25.51 : 28.35
  const isExam = gridType === 'exam'
  const isEssay = gridType === 'essay'
  // 行间距：田字格/米字格 5mm=14.17pt，作文格 3mm=8.50pt，中高考贴 2mm=5.67pt
  const rowGapMap = { tian: 14.17, mi: 14.17, essay: 8.50, exam: 5.67 }
  const rowGap = rowGapMap[gridType] || 0
  const rowHeight = cellSize + rowGap
  // 每行格数：作文固定17，中高考固定19，其余按宽度计算
  const cols = isEssay ? 17 : isExam ? 19 : Math.floor(CONTENT_WIDTH / cellSize)
  const pageBottom = 841.89 - PAGE_MARGIN // A4 height - margin
  let x = PAGE_MARGIN
  let y = doc.y
  let col = 0

  // 居中偏移：让格子在页面中居中
  const gridWidth = cols * cellSize
  const offsetX = PAGE_MARGIN + (CONTENT_WIDTH - gridWidth) / 2

  for (const seg of segments) {
    const value = seg && seg.value !== undefined ? String(seg.value) : ''
    const isBlank = seg && String(seg.type) === 'blank'

    if (value === '\n') {
      // 换行：跳到下一行起始
      if (col > 0) {
        col = 0
        y += rowHeight
      }
      continue
    }
    if (value === '' && !isBlank) continue

    // 换行检测
    if (col >= cols) {
      col = 0
      y += rowHeight
    }
    // 分页检测
    if (y + cellSize > pageBottom) {
      doc.addPage()
      y = PAGE_MARGIN
      col = 0
    }

    x = offsetX + col * cellSize
    drawSingleCell(doc, x, y, cellSize, gridType, isBlank, value, fontConfig)
    col++
  }
}

function drawSingleCell(doc, x, y, size, gridType, isBlank, value, fontConfig) {
  // 外框
  doc.rect(x, y, size, size).lineWidth(0.5).strokeColor('#333').stroke()

  // 田字格/米字格：画中线
  if (gridType === 'tian' || gridType === 'mi') {
    doc.save()
    doc.dash(2, { space: 2 })
    doc.strokeColor('#ccc').lineWidth(0.3)
    // 横中线
    doc.moveTo(x, y + size / 2).lineTo(x + size, y + size / 2).stroke()
    // 竖中线
    doc.moveTo(x + size / 2, y).lineTo(x + size / 2, y + size).stroke()
    doc.undash()
    doc.restore()
  }

  // 米字格：额外画对角线
  if (gridType === 'mi') {
    doc.save()
    doc.dash(2, { space: 2 })
    doc.strokeColor('#ccc').lineWidth(0.3)
    doc.moveTo(x, y).lineTo(x + size, y + size).stroke()
    doc.moveTo(x + size, y).lineTo(x, y + size).stroke()
    doc.undash()
    doc.restore()
  }

  // 写入文字（垂直居中）
  if (!isBlank && value) {
    const fSize = size * 0.6
    doc.fontSize(fSize).fillColor('#111827')
    const tw = doc.widthOfString(value)
    const th = doc.heightOfString(value, { lineBreak: false })
    const tx = x + (size - tw) / 2
    const ty = y + (size - th) / 2
    doc.text(value, tx, ty, { lineBreak: false })
    doc.fontSize(fontConfig.body)
  }
}

function drawUnderlineStyle(doc, segments, fontConfig, isDotted) {
  const lineHeight = fontConfig.body + fontConfig.lineGap
  const rightEdge = A4_WIDTH - PAGE_MARGIN
  let x = PAGE_MARGIN
  let y = doc.y
  const underlineGap = 2
  for (const seg of segments) {
    const isBlank = seg && String(seg.type) === 'blank'
    const value = seg && seg.value !== undefined ? String(seg.value) : ''
    if (isBlank) {
      const charWidth = doc.widthOfString('字')
      const blankWidth = charWidth * 1.15
      if (x + blankWidth > rightEdge) {
        x = PAGE_MARGIN
        y += lineHeight
      }
      const underlineY = y + fontConfig.body * 1.05 + underlineGap
      if (isDotted) doc.dash(4, { space: 2 })
      doc
        .moveTo(x, underlineY)
        .lineTo(x + charWidth, underlineY)
        .lineWidth(1)
        .strokeColor('#1f2937')
        .stroke()
      if (isDotted) doc.undash()
      doc.fillColor('#111827')
      x += blankWidth
    } else {
      if (value === '\n') {
        x = PAGE_MARGIN
        y += lineHeight
        continue
      }
      if (value === '') continue
      const w = doc.widthOfString(value)
      if (x + w > rightEdge) {
        x = PAGE_MARGIN
        y += lineHeight
      }
      doc.text(value, x, y, { lineBreak: false })
      x += w
    }
  }
}

async function generateDictationPdf(data) {
  const inner = data && data.data && typeof data.data === 'object' ? data.data : data
  const articleId = normalizeText((inner && inner.articleId) || data.articleId || '')
  const title = normalizeText((inner && inner.title) || data.title || '古文默写')
  const dynasty = normalizeText((inner && inner.dynasty) || data.dynasty || '')
  const author = normalizeText((inner && inner.author) || data.author || '')
  const authorDisplay = dynasty && author ? `${dynasty} · ${author}` : (author || '')
  const rawContent = normalizeContent((inner && inner.content) || data.content || '')
  const difficulty = normalizeDifficulty((inner && inner.difficulty) || data.difficulty)
  const fontSize = String((inner && inner.fontSize) || data.fontSize || 'medium')
  const difficultyLabel = normalizeText((inner && inner.difficultyLabel) || data.difficultyLabel || '')
  const paperStyleRaw = normalizeText((inner && inner.paperStyle) || data.paperStyle || 'underline')
  const validStyles = ['underline', 'dotted', 'tian_grid', 'mi_grid', 'essay_grid', 'exam_grid']
  const paperStyle = validStyles.includes(paperStyleRaw) ? paperStyleRaw : 'underline'

  if (!rawContent) {
    return { code: -1, msg: '缺少正文内容' }
  }

  let segments = getPaperSegments(rawContent, difficulty)
  const blankCount = segments.filter(s => s && String(s.type) === 'blank').length
  if (blankCount === 0 && segments.length > 0) {
    segments = getPaperSegments(rawContent, 'advanced')
  }

  const id = crypto.randomBytes(8).toString('hex')
  const tmpFile = path.join('/tmp', `dictation-${id}.pdf`)
  const cloudPath = `dictation-papers/${Date.now()}-${id}.pdf`
  const fontConfig = getFontSizeConfig(fontSize)

  const fontPath = path.join(__dirname, 'fonts', 'NotoSansSC-VariableFont_wght.ttf')
  const fontExists = fs.existsSync(fontPath)
  if (!fontExists) {
    return { code: -1, msg: '本地字体文件不存在：fonts/NotoSansSC-VariableFont_wght.ttf' }
  }

  try {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: PAGE_MARGIN,
          bottom: PAGE_MARGIN,
          left: PAGE_MARGIN,
          right: PAGE_MARGIN
        }
      })

      const output = fs.createWriteStream(tmpFile)
      output.on('finish', resolve)
      output.on('error', reject)
      doc.on('error', reject)
      doc.pipe(output)

      doc.registerFont('NotoSansSC', fontPath)
      doc.font('NotoSansSC')

      doc
        .fontSize(fontConfig.title)
        .fillColor('#1f2937')
        .text(title, {
          width: CONTENT_WIDTH,
          align: 'center'
        })

      doc.moveDown(0.4)
      doc
        .fontSize(fontConfig.meta)
        .fillColor('#374151')
        .text(authorDisplay || '——', {
          width: CONTENT_WIDTH,
          align: 'center'
        })

      doc.moveDown(0.6)
      // 默写级别（左）+ 文章ID（右）同一行
      const metaY = doc.y
      if (difficultyLabel) {
        doc.fontSize(fontConfig.meta).fillColor('#374151')
        doc.text(difficultyLabel, PAGE_MARGIN, metaY, { lineBreak: false })
      }
      if (articleId) {
        doc.fontSize(fontConfig.meta - 1).fillColor('#6b7280')
        const idWidth = doc.widthOfString(articleId)
        doc.text(articleId, A4_WIDTH - PAGE_MARGIN - idWidth, metaY, { lineBreak: false })
      }
      doc.y = metaY + fontConfig.meta + 4
      doc.moveDown(0.6)

      const lineTop = doc.y
      doc
        .moveTo(PAGE_MARGIN, lineTop)
        .lineTo(A4_WIDTH - PAGE_MARGIN, lineTop)
        .lineWidth(1)
        .strokeColor('#d1d5db')
        .stroke()
      doc.moveDown(0.8)

      doc.fontSize(fontConfig.body).fillColor('#111827')

      if (paperStyle === 'underline' || paperStyle === 'dotted') {
        drawUnderlineStyle(doc, segments, fontConfig, paperStyle === 'dotted')
      } else if (paperStyle === 'tian_grid') {
        drawGridStyle(doc, segments, fontConfig, 'tian')
      } else if (paperStyle === 'mi_grid') {
        drawGridStyle(doc, segments, fontConfig, 'mi')
      } else if (paperStyle === 'essay_grid') {
        drawGridStyle(doc, segments, fontConfig, 'essay')
      } else if (paperStyle === 'exam_grid') {
        drawGridStyle(doc, segments, fontConfig, 'exam')
      }

      doc.end()
    })

    const fileContent = await fs.promises.readFile(tmpFile)
    const uploadRes = await uniCloud.uploadFile({
      cloudPath,
      fileContent
    })

    const fileNameTitle = sanitizeFilenamePart(title) || '默写纸'
    return {
      code: 0,
      data: {
        fileID: uploadRes.fileID,
        fileName: `${fileNameTitle}.pdf`
      }
    }
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '生成PDF失败'
    }
  } finally {
    try {
      await fs.promises.unlink(tmpFile)
    } catch (e) {}
  }
}

function getPayload(event) {
  const inner = (event && event.data) || event || {}
  return (inner.data && typeof inner.data === 'object') ? inner.data : inner
}

exports.main = async (event) => {
  try {
    const action = (event && event.action) || ''
    const data = getPayload(event)
    const isGenerate = action === 'generate' || (data && data.action === 'generate')
    if (isGenerate) {
      return await generateDictationPdf(data)
    }
    return { code: -1, msg: '未知操作' }
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '打印服务异常'
    }
  }
}
