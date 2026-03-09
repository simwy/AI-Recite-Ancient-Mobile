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

/** 纠错类反馈的默认内容模板中的“纠错类型”占位说明 */
const CORRECTION_TYPE_HINT = '纠错类型：（正文错误/标点错误/作者或出处错误/其他）'

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

  // 根据 type 可扩展不同模板，例如 correction | bug | other
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
