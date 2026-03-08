#!/usr/bin/env node
/**
 * 从 gw-ancient-texts.init_data.json 中剔除「数据库已有」的条目。
 * 已有列表来自云函数 listExistingTitleAuthor 的返回，保存为 JSON 文件传入。
 *
 * 用法:
 *   node tools/remove-existing-from-init-data.js [已有数据的 JSON 文件路径]
 *
 * 文件格式：云函数完整返回 { code, data: { list: [ { title, author }, ... ] } } 或直接数组 [...]。
 * 默认读取 data/existing-in-db.json。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const INIT_DATA_PATH = path.join(ROOT, 'uniCloud-alipay', 'database', 'gw-ancient-texts.init_data.json')
const DEFAULT_EXISTING_PATH = path.join(ROOT, 'data', 'existing-in-db.json')

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function key(title, author) {
  return `${trim(title)}::${trim(author)}`
}

function main() {
  const existingPath = process.argv[2] || DEFAULT_EXISTING_PATH
  const absExisting = path.isAbsolute(existingPath) ? existingPath : path.join(process.cwd(), existingPath)

  if (!fs.existsSync(absExisting)) {
    console.error('已有数据文件不存在:', absExisting)
    console.error('请先运行云函数 listExistingTitleAuthor，将返回保存为该文件。')
    console.error('入参: { "action": "listExistingTitleAuthor" }')
    process.exit(1)
  }

  let existingList = []
  try {
    const raw = fs.readFileSync(absExisting, 'utf8')
    const data = JSON.parse(raw)
    existingList = Array.isArray(data) ? data : (data && data.data && data.data.list) || []
  } catch (e) {
    console.error('读取已有数据文件失败:', e.message)
    process.exit(1)
  }

  const existingSet = new Set(existingList.map((item) => key(item.title, item.author)))
  console.log('库中已有', existingSet.size, '条 (title+author)')

  let initData = []
  try {
    initData = JSON.parse(fs.readFileSync(INIT_DATA_PATH, 'utf8'))
  } catch (e) {
    console.error('读取 init_data 失败:', e.message)
    process.exit(1)
  }

  const before = initData.length
  const kept = initData.filter((item) => !existingSet.has(key(item.title, item.author)))
  const removed = before - kept.length
  console.log('init_data 原条数:', before, '，剔除:', removed, '，剩余:', kept.length)

  // 重新编号 _id 为 gw-at-100day-001, 002, ...
  kept.forEach((item, i) => {
    item._id = `gw-at-100day-${String(i + 1).padStart(3, '0')}`
  })

  fs.writeFileSync(INIT_DATA_PATH, JSON.stringify(kept, null, 2), 'utf8')
  console.log('已写回', INIT_DATA_PATH)
}

main()
