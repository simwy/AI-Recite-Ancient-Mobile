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

function getCharPinyin(char) {
  if (!char) return ''
  if (pinyinCache.has(char)) return pinyinCache.get(char)

  const value = pinyin(char, {
    toneType: 'none',
    type: 'array'
  })
  const first = Array.isArray(value) && value.length ? value[0] : ''
  pinyinCache.set(char, first)
  return first
}

function isHomophone(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const aPy = getCharPinyin(a)
  const bPy = getCharPinyin(b)
  return Boolean(aPy && bPy && aPy === bPy)
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
 * @returns {Array<{char: string, status: 'correct'|'wrong'|'missing'}>}
 */
export function diffChars(original, recognized) {
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

  // 回溯 LCS
  const matchedOriginalIndexes = new Set()
  while (i > 0 && j > 0) {
    if (isHomophone(a[i - 1].char, b[j - 1].char)) {
      matchedOriginalIndexes.add(a[i - 1].index)
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  source.chars.forEach((char, index) => {
    if (!isPunctuation(char) && matchedOriginalIndexes.has(index)) {
      result[index] = { char, status: 'correct' }
    }
  })

  return result
}

/**
 * 计算正确率
 * @param {Array} diffResult - diffChars 返回的结果
 * @returns {number} 0-100 的正确率
 */
export function calcAccuracy(diffResult) {
  if (!diffResult || diffResult.length === 0) return 0
  const compareChars = diffResult.filter(d => d.status !== 'punctuation')
  if (compareChars.length === 0) return 0
  const correct = compareChars.filter(d => d.status === 'correct').length
  return Math.round((correct / compareChars.length) * 100)
}
