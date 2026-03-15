/**
 * 拍照检查（默写批改）共用逻辑
 * - 首页 list：不传 articleId，云函数从照片识别文章ID
 * - 默写页 dictation：传 articleId 为当前页古文ID，不从照片取
 */
// 模拟阶段文案与进度（方案 A）
const STAGES = [
  { text: 'OCR 识别中...', progress: 12 },
  { text: '识别完成，大模型批改中...', progress: 35 },
  { text: '大模型批改中...', progress: 58 },
  { text: '即将完成...', progress: 82 }
]
const STAGE_INTERVAL = 2600
const PROGRESS_CAP = 90

/** 是否正在用原生 uni.showLoading 兜底（自定义浮层未就绪时） */
let useNativeLoading = false

function updateProgress(visible, stageText, progress) {
  const app = getApp()
  if (app && typeof app.dictationProgressUpdater === 'function') {
    app.dictationProgressUpdater({ visible, stageText, progress })
  }
}

function showProgress() {
  const app = getApp()
  if (app && typeof app.dictationProgressUpdater === 'function') {
    updateProgress(true, STAGES[0].text, STAGES[0].progress)
  } else {
    useNativeLoading = true
    uni.showLoading({ title: 'AI批改中...', mask: true })
  }
}

function hideProgress() {
  if (useNativeLoading) {
    useNativeLoading = false
    uni.hideLoading()
  }
  updateProgress(false, '', 0)
}

function getUniIdToken() {
  const currentUserInfo = uniCloud.getCurrentUserInfo() || {}
  if (!currentUserInfo.token) return ''
  if (currentUserInfo.tokenExpired && currentUserInfo.tokenExpired < Date.now()) return ''
  return currentUserInfo.token
}

function compressImageApp(filePath) {
  return new Promise((resolve) => {
    uni.compressImage({
      src: filePath,
      quality: 88,
      width: 'auto',
      height: 'auto',
      compressedWidth: 1600,
      rotate: 0,
      success: (res) => resolve(res.tempFilePath),
      fail: () => resolve(filePath)
    })
  })
}

function compressImageH5(filePath) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      const maxSide = 1600
      if (width > maxSide || height > maxSide) {
        if (width >= height) {
          height = Math.round(height * maxSide / width)
          width = maxSide
        } else {
          width = Math.round(width * maxSide / height)
          height = maxSide
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = reject
    img.src = filePath
  })
}

function readAndUpload(filePath, options, callCheck) {
  // #ifdef APP-PLUS
  plus.io.resolveLocalFileSystemURL(filePath, (entry) => {
    entry.file((file) => {
      const reader = new plus.io.FileReader()
      reader.onloadend = (e) => callCheck(e.target.result)
      reader.onerror = () => {
        hideProgress()
        uni.showToast({ title: '读取图片失败', icon: 'none' })
      }
      reader.readAsDataURL(file)
    })
  }, () => {
    hideProgress()
    uni.showToast({ title: '读取图片失败', icon: 'none' })
  })
  // #endif
  // #ifdef MP-WEIXIN || MP-ALIPAY
  const fs = uni.getFileSystemManager()
  const base64Data = fs.readFileSync(filePath, 'base64')
  const base64 = 'data:image/jpeg;base64,' + base64Data
  callCheck(base64)
  // #endif
}

async function callCheck(imageBase64, options, onSuccess, onFail) {
  try {
    const uniIdToken = getUniIdToken()
    const data = {
      imageBase64,
      difficulty: options.difficulty || 'middle'
    }
    if (options.articleId) {
      data.articleId = options.articleId
    }
    const res = await uniCloud.callFunction({
      name: 'gw_dictation-check',
      data: {
        action: 'check',
        uniIdToken,
        data
      }
    })
    const result = (res && res.result) || {}
    if (result.code !== 0) {
      if (onFail) onFail()
      uni.showToast({ title: result.msg || '批改失败', icon: 'none' })
      return
    }
    const app = getApp()
    app.globalData = app.globalData || {}
    app.globalData.dictationCheckResult = result.data
    if (onSuccess) onSuccess()
    uni.navigateTo({ url: '/pages/ancient/dictation-result' })
  } catch (e) {
    if (onFail) onFail()
    console.error('拍照检查失败:', e)
    uni.showToast({ title: '批改服务异常', icon: 'none' })
  }
}

function compressAndCheck(filePath, options) {
  showProgress()
  let stageIndex = 0
  let currentProgress = STAGES[0].progress

  const timer = setInterval(() => {
    stageIndex = Math.min(stageIndex + 1, STAGES.length - 1)
    const stage = STAGES[stageIndex]
    currentProgress = Math.min(PROGRESS_CAP, currentProgress + 12)
    updateProgress(true, stage.text, currentProgress)
  }, STAGE_INTERVAL)

  const doCallCheck = (base64) => {
    callCheck(base64, options, () => {
      clearInterval(timer)
      updateProgress(true, '批改完成，正在跳转...', 100)
      setTimeout(hideProgress, 400)
    }, () => {
      clearInterval(timer)
      hideProgress()
    })
  }

  // #ifdef APP-PLUS || MP-WEIXIN || MP-ALIPAY
  compressImageApp(filePath).then((compressedPath) => {
    readAndUpload(compressedPath, options, doCallCheck)
  }).catch(() => {
    clearInterval(timer)
    hideProgress()
    uni.showToast({ title: '图片压缩失败', icon: 'none' })
  })
  // #endif
  // #ifdef H5
  compressImageH5(filePath).then(doCallCheck).catch(() => {
    clearInterval(timer)
    hideProgress()
    uni.showToast({ title: '图片压缩失败', icon: 'none' })
  })
  // #endif
}

/**
 * 打开选图/拍照并执行批改
 * @param {Object} options
 * @param {string} [options.articleId] - 可选。默写页传入当前页古文ID则用该ID，不传则云函数从照片识别
 * @param {string} [options.difficulty] - 可选，默认 'middle'
 */
export function runDictationCheck(options = {}) {
  uni.chooseImage({
    count: 1,
    sourceType: ['camera', 'album'],
    sizeType: ['original', 'compressed'],
    success: (res) => {
      const tempFilePath = res.tempFilePaths[0]
      compressAndCheck(tempFilePath, options)
    }
  })
}
