#!/usr/bin/env node
/**
 * 根据 100-day-poems.json 生成 gw-ancient-texts.init_data.json。
 * 若提供「已在库中的 title+author」文件，则只生成缺失项；否则生成全部。
 * 正文通过 DashScope 百炼接口拉取。
 *
 * 用法:
 *   node tools/generate-init-data.js
 *   node tools/generate-init-data.js [已有数据的 JSON 文件路径]
 *
 * 已有数据文件格式：数组 [ { "title": "", "author": "" }, ... ]
 * API Key: 环境变量 DASHSCOPE_API_KEY，或从 uniCloud 的 common/config 读取。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const POEMS_PATH = path.join(ROOT, 'data', '100-day-poems.json')
const OUTPUT_PATH = path.join(ROOT, 'uniCloud-alipay', 'database', 'gw-ancient-texts.init_data.json')
const ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const MODEL = 'qwen-plus'
const DELAY_MS = 600

function getApiKey() {
  if (process.env.DASHSCOPE_API_KEY) return process.env.DASHSCOPE_API_KEY
  try {
    const configPath = path.join(ROOT, 'uniCloud-alipay', 'cloudfunctions', 'common', 'config', 'index.js')
    const config = require(configPath)
    if (config && config.bailianPoemSearch && config.bailianPoemSearch.apiKey) {
      return config.bailianPoemSearch.apiKey
    }
  } catch (e) {}
  return null
}

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchPoem(apiKey, title, author) {
  const authorHint = author ? `，作者或出处=${author}` : '（作者或出处未提供，可填未知或出处）'
  const body = {
    model: MODEL,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          '你是古诗文检索助手。根据标题（必选）和作者或出处（可选）检索古诗文。标题需高度一致，作者或出处可模糊。仅输出 JSON。'
      },
      {
        role: 'user',
        content: `请检索古诗文。标题=${title}${authorHint}。\n要求：返回 JSON：{"found":boolean,"items":[{"title":"","author":"","dynasty":"","content":""}]}。content 必须是可背诵的完整正文，保留常见标点。`
      }
    ]
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }

  const data = await res.json()
  const choices = data.choices || []
  const raw = (choices[0] && choices[0].message && choices[0].message.content) || ''
  const parsed = (() => {
    try {
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  })()

  if (!parsed) return null
  const items = Array.isArray(parsed.items) ? parsed.items : [parsed]
  const first = items.find((i) => i && trim(i.content))
  if (!first) return null
  return {
    title: trim(first.title) || title,
    author: trim(first.author) || author,
    dynasty: trim(first.dynasty) || '',
    content: trim(first.content)
  }
}

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

function existsInSet(set, title, author) {
  const key = `${trim(title)}::${trim(author)}`
  return set.has(key)
}

function addToSet(set, title, author) {
  set.add(`${trim(title)}::${trim(author)}`)
}

async function main() {
  const existingPath = process.argv[2]
  let existingSet = new Set()
  if (existingPath) {
    const abs = path.isAbsolute(existingPath) ? existingPath : path.join(process.cwd(), existingPath)
    if (fs.existsSync(abs)) {
      const arr = loadJson(abs)
      if (Array.isArray(arr)) {
        arr.forEach((item) => addToSet(existingSet, item.title, item.author))
        console.log('已加载已有数据', existingSet.size, '条，只生成缺失项')
      }
    }
  }

  const list = loadJson(POEMS_PATH)
  const missing = list.filter((item) => !existsInSet(existingSet, item.title, item.author))
  console.log('待生成:', missing.length, '条')

  const apiKey = getApiKey()
  if (!apiKey) {
    console.error('请设置 DASHSCOPE_API_KEY 或确保 common/config 中有 bailianPoemSearch.apiKey')
    process.exit(1)
  }

  const initData = []
  let index = 0
  for (let i = 0; i < missing.length; i++) {
    const item = missing[i]
    const title = trim(item.title)
    const author = trim(item.author) || ''
    process.stdout.write(`[${i + 1}/${missing.length}] ${title} ... `)
    try {
      const poem = await fetchPoem(apiKey, title, author)
      await sleep(DELAY_MS)
      if (poem && poem.content) {
        index += 1
        initData.push({
          _id: `gw-at-100day-${String(index).padStart(3, '0')}`,
          title: poem.title,
          author: poem.author,
          dynasty: poem.dynasty,
          content: poem.content,
          source: '100天背诵计划'
        })
        console.log('ok')
      } else {
        console.log('无正文，跳过')
      }
    } catch (e) {
      console.log('失败:', (e && e.message) || e)
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(initData, null, 2), 'utf8')
  console.log('已写入', initData.length, '条到', OUTPUT_PATH)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
