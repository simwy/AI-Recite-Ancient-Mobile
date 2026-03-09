/**
 * 意见反馈/纠错跳转与预填内容公共逻辑，供详情页、列表页等多处复用。
 */

/** 反馈页路由路径（与 pages.json 中 uni-feedback 子包路径一致） */
export const FEEDBACK_PAGE_PATH = '/uni_modules/uni-feedback/pages/opendb-feedback/opendb-feedback'

/**
 * 生成带查询参数的反馈页 URL，用于 navigateTo。
 * @param {Object} params - 可选，{ id, title, type }
 *   - id: 关联数据 ID（如文章 ID）
 *   - title: 关联标题（如文章标题），会做 encodeURIComponent
 *   - type: 反馈类型标识，后续可扩展（如 correction | bug | other）
 * @returns {string} 完整路径，如 /uni_modules/.../opendb-feedback?id=xx&title=yy
 */
export function getFeedbackUrl(params = {}) {
  const query = []
  if (params.id != null && params.id !== '') {
    query.push('id=' + encodeURIComponent(String(params.id)))
  }
  if (params.title != null && params.title !== '') {
    query.push('title=' + encodeURIComponent(String(params.title)))
  }
  if (params.type != null && params.type !== '') {
    query.push('type=' + encodeURIComponent(String(params.type)))
  }
  return FEEDBACK_PAGE_PATH + (query.length ? '?' + query.join('&') : '')
}

/** 文章纠错：纠错类型占位说明 */
const CORRECTION_TYPE_HINT = '纠错类型：（正文错误/标点错误/作者或出处错误/其他）'
/** 合集纠错：问题类型占位说明（收录少了、收录错了等） */
const COLLECTION_ISSUE_HINT = '问题类型：（收录少了/收录错了/其他）'
/** 跟读问题反馈：语音没声音、语音错误等 */
const FOLLOW_ISSUE_HINT = '问题类型：（语音没有声音/语音识别错误/其他）\n请描述具体问题：'
/** 背诵问题反馈：识别错误、录音未识别等 */
const RECITE_ISSUE_HINT = '问题类型：（识别错误/录音功能没有识别/其他）\n请描述具体问题：'
/** 默写问题反馈：默写纸错误、拍照检查不可用、检查错误等 */
const DICTATION_ISSUE_HINT = '问题类型：（默写纸错误/拍照检查功能无法使用/检查结果错误/其他）\n请描述具体问题：'

/**
 * 根据页面 onLoad 的 options 生成反馈表单的默认留言内容。
 * 供 opendb-feedback 页在 onLoad 时调用，若有 id/title/type 则预填，否则返回空字符串。
 * @param {Object} options - 页面 onLoad(options) 的 options（已解码的 id、title、type）
 * @returns {string} 预填的 content 文本
 */
export function buildFeedbackContentFromOptions(options = {}) {
  const id = options.id != null ? String(options.id).trim() : ''
  const title = options.title != null ? String(options.title).trim() : ''
  const type = (options.type != null ? String(options.type).trim() : '').toLowerCase()

  if (!id && !title) {
    return ''
  }

  const lines = []

  if (type === 'collection') {
    // 广场子合集纠错：收录少了、收录错了等
    lines.push('【合集纠错】')
    if (title) lines.push('合集：《' + title + '》')
    if (id) lines.push('合集ID：' + id)
    if (lines.length) lines.push('')
    lines.push(COLLECTION_ISSUE_HINT)
    lines.push('纠错内容：')
    return lines.join('\n')
  }

  // 跟读问题反馈：语音没声音、语音错误等
  if (type === 'follow') {
    lines.push('【跟读-问题反馈】')
    if (title) lines.push('文章：《' + title + '》')
    if (id) lines.push('文章ID：' + id)
    if (lines.length) lines.push('')
    lines.push(FOLLOW_ISSUE_HINT)
    return lines.join('\n')
  }

  // 背诵问题反馈：识别错误、录音未识别等
  if (type === 'recite') {
    lines.push('【背诵-问题反馈】')
    if (title) lines.push('文章：《' + title + '》')
    if (id) lines.push('文章ID：' + id)
    if (lines.length) lines.push('')
    lines.push(RECITE_ISSUE_HINT)
    return lines.join('\n')
  }

  // 默写问题反馈：默写纸错误、拍照检查不可用、检查错误等
  if (type === 'dictation') {
    lines.push('【默写-问题反馈】')
    if (title) lines.push('文章：《' + title + '》')
    if (id) lines.push('文章ID：' + id)
    if (lines.length) lines.push('')
    lines.push(DICTATION_ISSUE_HINT)
    return lines.join('\n')
  }

  // 文章纠错或未传 type
  if (type === 'correction' || (!type && (id || title))) {
    lines.push('【纠错】')
  } else if (type) {
    lines.push('【' + (type === 'bug' ? '问题反馈' : type) + '】')
  }

  if (title) {
    lines.push('文章：《' + title + '》')
  }
  if (id) {
    lines.push('文章ID：' + id)
  }
  if (lines.length) {
    lines.push('')
  }
  lines.push(CORRECTION_TYPE_HINT)
  lines.push('纠错内容：')

  return lines.join('\n')
}
