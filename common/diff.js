/**
 * 古文逐字对比工具（基于 LCS 最长公共子序列）
 */

// 过滤标点符号，只保留文字
function filterPunctuation(text) {
  return text.replace(/[，。、；：？！""''（）《》\s\n\r,.;:?!'"()\[\]{}]/g, '')
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
      if (a[i - 1] === b[j - 1]) {
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
  const a = filterPunctuation(original)
  const b = filterPunctuation(recognized)
  const dp = buildLCSTable(a, b)

  const result = []
  let i = a.length
  let j = b.length

  // 回溯 LCS
  const marks = []
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      marks.unshift({ i: i - 1, j: j - 1, match: true })
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  // 根据匹配结果生成 diff
  let mi = 0
  for (let idx = 0; idx < a.length; idx++) {
    if (mi < marks.length && marks[mi].i === idx) {
      result.push({ char: a[idx], status: 'correct' })
      mi++
    } else {
      result.push({ char: a[idx], status: 'missing' })
    }
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
  const correct = diffResult.filter(d => d.status === 'correct').length
  return Math.round((correct / diffResult.length) * 100)
}
