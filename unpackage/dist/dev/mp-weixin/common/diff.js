"use strict";
const common_vendor = require("./vendor.js");
const PUNCTUATION_REG = /[，。、；：？！“”‘’（）《》〈〉【】「」『』〔〕…—\s\n\r,.;:?!'"()\[\]{}]/;
const pinyinCache = /* @__PURE__ */ new Map();
function isPunctuation(char) {
  return PUNCTUATION_REG.test(char);
}
function normalizeForDiff(text) {
  const chars = String(text || "").split("");
  const filtered = [];
  chars.forEach((char, index) => {
    if (!isPunctuation(char)) {
      filtered.push({ char, index });
    }
  });
  return { chars, filtered };
}
function getCharPinyin(char) {
  if (!char)
    return "";
  if (pinyinCache.has(char))
    return pinyinCache.get(char);
  const value = common_vendor.pinyin(char, {
    toneType: "none",
    type: "array"
  });
  const first = Array.isArray(value) && value.length ? value[0] : "";
  pinyinCache.set(char, first);
  return first;
}
function isHomophone(a, b) {
  if (!a || !b)
    return false;
  if (a === b)
    return true;
  const aPy = getCharPinyin(a);
  const bPy = getCharPinyin(b);
  return Boolean(aPy && bPy && aPy === bPy);
}
function buildLCSTable(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (isHomophone(a[i - 1].char, b[j - 1].char)) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}
function diffChars(original, recognized) {
  const source = normalizeForDiff(original);
  const target = normalizeForDiff(recognized);
  const a = source.filtered;
  const b = target.filtered;
  const dp = buildLCSTable(a, b);
  const result = source.chars.map((char) => ({
    char,
    status: isPunctuation(char) ? "punctuation" : "missing"
  }));
  let i = a.length;
  let j = b.length;
  const matchedOriginalIndexes = /* @__PURE__ */ new Set();
  while (i > 0 && j > 0) {
    if (isHomophone(a[i - 1].char, b[j - 1].char)) {
      matchedOriginalIndexes.add(a[i - 1].index);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  source.chars.forEach((char, index) => {
    if (!isPunctuation(char) && matchedOriginalIndexes.has(index)) {
      result[index] = { char, status: "correct" };
    }
  });
  return result;
}
function calcAccuracy(diffResult) {
  if (!diffResult || diffResult.length === 0)
    return 0;
  const compareChars = diffResult.filter((d) => d.status !== "punctuation");
  if (compareChars.length === 0)
    return 0;
  const correct = compareChars.filter((d) => d.status === "correct").length;
  return Math.round(correct / compareChars.length * 100);
}
exports.calcAccuracy = calcAccuracy;
exports.diffChars = diffChars;
//# sourceMappingURL=../../.sourcemap/mp-weixin/common/diff.js.map
