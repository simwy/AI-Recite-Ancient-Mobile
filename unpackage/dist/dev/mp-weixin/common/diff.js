"use strict";
function filterPunctuation(text) {
  return text.replace(/[，。、；：？！""''（）《》\s\n\r,.;:?!'"()\[\]{}]/g, "");
}
function buildLCSTable(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}
function diffChars(original, recognized) {
  const a = filterPunctuation(original);
  const b = filterPunctuation(recognized);
  const dp = buildLCSTable(a, b);
  const result = [];
  let i = a.length;
  let j = b.length;
  const marks = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      marks.unshift({ i: i - 1, j: j - 1, match: true });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  let mi = 0;
  for (let idx = 0; idx < a.length; idx++) {
    if (mi < marks.length && marks[mi].i === idx) {
      result.push({ char: a[idx], status: "correct" });
      mi++;
    } else {
      result.push({ char: a[idx], status: "missing" });
    }
  }
  return result;
}
function calcAccuracy(diffResult) {
  if (!diffResult || diffResult.length === 0)
    return 0;
  const correct = diffResult.filter((d) => d.status === "correct").length;
  return Math.round(correct / diffResult.length * 100);
}
exports.calcAccuracy = calcAccuracy;
exports.diffChars = diffChars;
//# sourceMappingURL=../../.sourcemap/mp-weixin/common/diff.js.map
