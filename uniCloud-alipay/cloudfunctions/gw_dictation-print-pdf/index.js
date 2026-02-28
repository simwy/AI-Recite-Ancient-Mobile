'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const PDFDocument = require('pdfkit')

const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89
const PAGE_MARGIN = 56
const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN * 2

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
}

function sanitizeFilenamePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 30)
}

function tryResolveFontPath() {
  const candidates = [
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/arphic/uming.ttc'
  ]
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath
  }
  return ''
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

async function generateDictationPdf(data) {
  const title = normalizeText(data.title || '古文默写')
  const author = normalizeText(data.author || '')
  const content = normalizeText(data.content || '')
  const fontSize = String(data.fontSize || 'medium')
  const difficultyLabel = normalizeText(data.difficultyLabel || '')
  const generatedAt = new Date()

  if (!content) {
    return { code: -1, msg: '缺少正文内容' }
  }

  const id = crypto.randomBytes(8).toString('hex')
  const tmpFile = path.join('/tmp', `dictation-${id}.pdf`)
  const cloudPath = `dictation-papers/${Date.now()}-${id}.pdf`
  const fontConfig = getFontSizeConfig(fontSize)
  const cjkFontPath = tryResolveFontPath()

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

      if (cjkFontPath) {
        doc.font(cjkFontPath)
      }

      doc
        .fontSize(fontConfig.title)
        .fillColor('#1f2937')
        .text('古文默写纸', {
          width: CONTENT_WIDTH,
          align: 'center'
        })

      doc.moveDown(0.8)
      doc
        .fontSize(fontConfig.meta)
        .fillColor('#374151')
        .text(`标题：${title}`)
      doc.moveDown(0.4)
      doc.text(`作者：${author || '________'}`)
      if (difficultyLabel) {
        doc.moveDown(0.4)
        doc.text(`默写级别：${difficultyLabel}`)
      }
      doc.moveDown(0.6)

      const lineTop = doc.y
      doc
        .moveTo(PAGE_MARGIN, lineTop)
        .lineTo(A4_WIDTH - PAGE_MARGIN, lineTop)
        .lineWidth(1)
        .strokeColor('#d1d5db')
        .stroke()
      doc.moveDown(0.8)

      doc
        .fontSize(fontConfig.body)
        .fillColor('#111827')
        .text(content, {
          width: CONTENT_WIDTH,
          align: 'left',
          lineGap: fontConfig.lineGap
        })

      const footerText = `生成时间：${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')} ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`
      doc
        .fontSize(10)
        .fillColor('#9ca3af')
        .text(footerText, PAGE_MARGIN, A4_HEIGHT - PAGE_MARGIN + 12, {
          width: CONTENT_WIDTH,
          align: 'right'
        })

      doc.end()
    })

    const fileContent = fs.readFileSync(tmpFile)
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
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    } catch (e) {}
  }
}

exports.main = async (event) => {
  try {
    const action = (event && event.action) || 'generate'
    const data = (event && event.data) || {}
    if (action !== 'generate') {
      return { code: -1, msg: '未知操作' }
    }
    return await generateDictationPdf(data)
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '打印服务异常'
    }
  }
}
