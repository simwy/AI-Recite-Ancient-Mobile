/**
 * 与跟读页一致的句子拆分逻辑，供详情页展示可点击句、与 read 页 startIndex 对齐
 */

function countHanChars(text) {
  const m = String(text || '').match(/[\u4e00-\u9fff]/g)
  return m ? m.length : 0
}

function isSinglePunctuationUnit(text) {
  if (!text || text.length !== 1) return false
  return /^[，。！？；：、,.!?;:'"""''（）()《》〈〉【】\[\]—…]$/.test(text)
}

function splitByDelimiter(text, reg) {
  const tokens = text.split(reg).filter(Boolean)
  const chunks = []
  const delimiterChecker = new RegExp(`^${reg.source.replace(/^\(|\)$/g, '')}$`)
  let current = ''
  tokens.forEach((token) => {
    if (delimiterChecker.test(token)) {
      current += token
      if (current.trim()) {
        chunks.push(current.trim())
      }
      current = ''
      return
    }
    current += token
  })
  if (current.trim()) {
    chunks.push(current.trim())
  }
  return chunks
}

function splitAdaptive(sentence) {
  const pureLen = countHanChars(sentence)
  if (pureLen <= 22) return [sentence]
  const roughParts = splitByDelimiter(sentence, /([，、,:：])/g)
  if (roughParts.length <= 1) return [sentence]

  const merged = []
  const minLen = 8
  const maxLen = 18

  roughParts.forEach((part) => {
    if (!part) return
    const partLen = countHanChars(part)
    if (merged.length === 0) {
      merged.push(part)
      return
    }
    const last = merged[merged.length - 1]
    const combined = `${last}${part}`
    const combinedLen = countHanChars(combined)
    if (partLen < minLen || combinedLen <= maxLen) {
      merged[merged.length - 1] = combined
    } else {
      merged.push(part)
    }
  })

  if (merged.length > 1) {
    const lastLen = countHanChars(merged[merged.length - 1])
    if (lastLen < minLen) {
      merged[merged.length - 2] += merged[merged.length - 1]
      merged.pop()
    }
  }
  return merged
}

/**
 * 将正文拆成与跟读页一致的「朗读单元」列表
 * @param {string} content - 正文
 * @returns {Array<{ text: string, mainIndex: number, subIndex: number }>}
 */
export function buildPlayUnits(content) {
  if (!content) return []
  const rawContent = String(content).replace(/\r\n/g, '\n')
  const lines = rawContent.split('\n')
  const result = []
  let mainIndex = 0
  lines.forEach((line) => {
    const trimmedLine = line.trim()
    if (!trimmedLine) return
    const mainSentences = splitByDelimiter(trimmedLine, /([。！？；!?;])/g)
    mainSentences.forEach((sentence) => {
      const adaptiveUnits = splitAdaptive(sentence)
      adaptiveUnits.forEach((subSentence, subIndex) => {
        const normalized = String(subSentence || '').trim()
        if (isSinglePunctuationUnit(normalized) && result.length > 0) {
          result[result.length - 1].text += normalized
          return
        }
        result.push({
          text: normalized,
          mainIndex,
          subIndex
        })
      })
      mainIndex++
    })
  })
  return result
}
