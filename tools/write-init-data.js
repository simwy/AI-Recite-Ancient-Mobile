#!/usr/bin/env node
/**
 * 将云函数 getMissingInitData 返回的 initData 写入 gw-ancient-texts.init_data.json。
 * 用法: node tools/write-init-data.js <云函数返回的 JSON 文件路径>
 * 文件内容可为完整返回 { data: { initData: [...] } } 或直接为数组 [...]。
 */
const fs = require('fs')
const path = require('path')

const args = process.argv.slice(2)
const inputPath = args[0]
if (!inputPath) {
  console.error('用法: node tools/write-init-data.js <云函数返回的 JSON 文件路径>')
  process.exit(1)
}

const absInput = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath)
const outputPath = path.join(__dirname, '..', 'uniCloud-alipay', 'database', 'gw-ancient-texts.init_data.json')

if (!fs.existsSync(absInput)) {
  console.error('文件不存在:', absInput)
  process.exit(1)
}

let raw
try {
  raw = fs.readFileSync(absInput, 'utf8')
} catch (e) {
  console.error('读取失败:', e.message)
  process.exit(1)
}

let data
try {
  data = JSON.parse(raw)
} catch (e) {
  console.error('JSON 解析失败:', e.message)
  process.exit(1)
}

let list = Array.isArray(data) ? data : (data && data.data && data.data.initData)
if (!Array.isArray(list)) {
  console.error('未找到 initData 数组，请传入云函数 getMissingInitData 的返回 JSON 或 initData 数组')
  process.exit(1)
}

try {
  fs.writeFileSync(outputPath, JSON.stringify(list, null, 2), 'utf8')
  console.log('已写入', list.length, '条到', outputPath)
} catch (e) {
  console.error('写入失败:', e.message)
  process.exit(1)
}
