/**
 * 古文逐字对比工具（基于 LCS 最长公共子序列）
 */
import { pinyin } from 'pinyin-pro'

const PUNCTUATION_REG = /[，。、；：？！“”‘’（）《》〈〉【】「」『』〔〕…—\s\n\r,.;:?!'"()\[\]{}]/
const pinyinCache = new Map()

function isPunctuation(char) {
  return PUNCTUATION_REG.test(char)
}

// 过滤标点并保留原始索引，便于最终还原完整显示内容
function normalizeForDiff(text) {
  const chars = String(text || '').split('')
  const filtered = []

  chars.forEach((char, index) => {
    if (!isPunctuation(char)) {
      filtered.push({ char, index })
    }
  })

  return { chars, filtered }
}

function getCharPinyinSet(char) {
  if (!char) return []
  if (pinyinCache.has(char)) return pinyinCache.get(char)

  const value = pinyin(char, {
    toneType: 'none',
    type: 'array',
    multiple: true
  })
  const list = Array.isArray(value)
    ? Array.from(new Set(value.filter(Boolean).map(item => String(item).toLowerCase())))
    : []
  pinyinCache.set(char, list)
  return list
}

// 模糊音：声母/韵母常见混淆对（语音识别高频错误）
const FUZZY_INITIALS = [['l', 'r'], ['l', 'n'], ['z', 'zh'], ['c', 'ch'], ['s', 'sh'], ['f', 'h']]
const FUZZY_FINALS = [['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang']]
const INITIALS_LIST = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']

function splitPinyin(py) {
  for (const ini of INITIALS_LIST) {
    if (py.startsWith(ini)) return [ini, py.slice(ini.length)]
  }
  return ['', py]
}

function fuzzyPartMatch(a, b, pairs) {
  if (a === b) return true
  return pairs.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

function isFuzzyPinyinMatch(py1, py2) {
  if (py1 === py2) return true
  const [i1, f1] = splitPinyin(py1)
  const [i2, f2] = splitPinyin(py2)
  return fuzzyPartMatch(i1, i2, FUZZY_INITIALS) && fuzzyPartMatch(f1, f2, FUZZY_FINALS)
}

function isHomophone(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const aPySet = getCharPinyinSet(a)
  const bPySet = getCharPinyinSet(b)
  if (!aPySet.length || !bPySet.length) return false
  if (aPySet.some(py => bPySet.includes(py))) return true
  return aPySet.some(ap => bPySet.some(bp => isFuzzyPinyinMatch(ap, bp)))
}

/**
 * 判断两个字符的匹配类型
 * @returns {'correct'|'fuzzy'|null} correct=同音/韵母模糊, fuzzy=声母不同(需标注拼音), null=不匹配
 */
function getMatchType(origChar, recogChar) {
  if (!origChar || !recogChar) return null
  if (origChar === recogChar) return 'correct'
  const aPySet = getCharPinyinSet(origChar)
  const bPySet = getCharPinyinSet(recogChar)
  if (!aPySet.length || !bPySet.length) return null
  if (aPySet.some(py => bPySet.includes(py))) return 'correct'
  for (const ap of aPySet) {
    for (const bp of bPySet) {
      const [i1, f1] = splitPinyin(ap)
      const [i2, f2] = splitPinyin(bp)
      const initSame = i1 === i2
      const finSame = f1 === f2
      const initFuzzy = fuzzyPartMatch(i1, i2, FUZZY_INITIALS)
      const finFuzzy = fuzzyPartMatch(f1, f2, FUZZY_FINALS)
      if (initSame && finFuzzy) return 'correct'
      if (initFuzzy && (finSame || finFuzzy)) return 'fuzzy'
    }
  }
  return null
}

function getCharPinyinDisplay(char) {
  if (!char) return ''
  return pinyin(char, { toneType: 'symbol', type: 'string' }) || ''
}

/**
 * 计算两个字符串的 LCS 表
 */
function buildLCSTable(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (isHomophone(a[i - 1].char, b[j - 1].char)) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

/**
 * 逐字对比原文和识别文字
 * @param {string} original - 原文
 * @param {string} recognized - 语音识别文字
 * @returns {Array<{char: string, status: 'correct'|'wrong'|'missing'|'normal'}>}
 */
export function diffChars(original, recognized, options = {}) {
  const tailUnmatchedAsNormal = Boolean(options && options.tailUnmatchedAsNormal)
  const source = normalizeForDiff(original)
  const target = normalizeForDiff(recognized)
  const a = source.filtered
  const b = target.filtered
  const dp = buildLCSTable(a, b)

  const result = source.chars.map(char => ({
    char,
    status: isPunctuation(char) ? 'punctuation' : 'missing'
  }))
  let i = a.length
  let j = b.length

  // 回溯 LCS，记录匹配对（原文索引 → 识别字符）
  const matchedOriginalIndexes = new Set()
  const matchedPairs = new Map()
  while (i > 0 && j > 0) {
    if (isHomophone(a[i - 1].char, b[j - 1].char)) {
      matchedOriginalIndexes.add(a[i - 1].index)
      matchedPairs.set(a[i - 1].index, b[j - 1].char)
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  source.chars.forEach((char, index) => {
    if (isPunctuation(char) || !matchedOriginalIndexes.has(index)) return
    const recogChar = matchedPairs.get(index)
    const matchType = getMatchType(char, recogChar)
    if (matchType === 'fuzzy') {
      result[index] = {
        char,
        status: 'fuzzy',
        origPinyin: getCharPinyinDisplay(char),
        recogChar,
        recogPinyin: getCharPinyinDisplay(recogChar)
      }
    } else {
      result[index] = { char, status: 'correct' }
    }
  })

  // 仅把“最后命中位置之后”的未匹配字符视为未读完，不标红。
  if (tailUnmatchedAsNormal && matchedOriginalIndexes.size > 0) {
    let lastMatchedIndex = -1
    matchedOriginalIndexes.forEach((idx) => {
      if (idx > lastMatchedIndex) lastMatchedIndex = idx
    })
    source.chars.forEach((char, index) => {
      if (index <= lastMatchedIndex) return
      if (isPunctuation(char)) return
      if (matchedOriginalIndexes.has(index)) return
      result[index] = { char, status: 'normal' }
    })
  }

  return result
}

/**
 * 计算正确率
 * @param {Array} diffResult - diffChars 返回的结果
 * @returns {number} 0-100 的正确率
 */
export function calcAccuracy(diffResult) {
  if (!diffResult || diffResult.length === 0) return 0
  const compareChars = diffResult.filter(d => d.status !== 'punctuation' && d.status !== 'normal')
  if (compareChars.length === 0) return 0
  const correct = compareChars.filter(d => d.status === 'correct' || d.status === 'fuzzy').length
  return Math.round((correct / compareChars.length) * 100)
}
