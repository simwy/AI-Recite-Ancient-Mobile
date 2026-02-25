'use strict'

const { aliyunParaformer } = require('../../common/config')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function submitTask(fileUrl) {
  const response = await uniCloud.httpclient.request(
    'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliyunParaformer.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable'
      },
      dataType: 'json',
      data: {
        model: 'paraformer-v2',
        input: {
          file_urls: [fileUrl]
        },
        parameters: {
          language_hints: aliyunParaformer.languageHints || ['zh']
        }
      }
    }
  )

  const taskId = response.data && response.data.output && response.data.output.task_id
  if (response.status !== 200 || !taskId) {
    const message = response.data && response.data.message ? response.data.message : '提交录音识别任务失败'
    throw new Error(message)
  }
  return taskId
}

async function queryTask(taskId) {
  const response = await uniCloud.httpclient.request(
    `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliyunParaformer.apiKey}`
      },
      dataType: 'json'
    }
  )
  if (response.status !== 200 || !response.data || !response.data.output) {
    throw new Error('查询录音识别任务失败')
  }
  return response.data.output
}

async function fetchTextByTranscriptionUrl(url) {
  const response = await uniCloud.httpclient.request(url, {
    method: 'GET',
    dataType: 'json'
  })
  if (response.status !== 200 || !response.data) {
    throw new Error('拉取识别结果失败')
  }

  const transcripts = response.data.transcripts || []
  return transcripts.map(item => item.text || '').join('').trim()
}

function uploadBufferFile(base64Audio, format = 'pcm') {
  const ext = format || 'pcm'
  const cloudPath = `asr/h5/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
  const fileContent = Buffer.from(base64Audio, 'base64')
  return uniCloud.uploadFile({
    cloudPath,
    fileContent
  })
}

exports.main = async (event) => {
  try {
    if (!aliyunParaformer || !aliyunParaformer.apiKey || aliyunParaformer.apiKey === 'YOUR_DASHSCOPE_API_KEY') {
      return { code: -1, msg: '请先在 uniCloud-aliyun/common/config.js 中配置阿里云 API Key' }
    }

    const { fileID, audioBase64, format } = event || {}
    let uploadFileId = fileID

    if (!uploadFileId && audioBase64) {
      const uploadRes = await uploadBufferFile(audioBase64, format)
      uploadFileId = uploadRes.fileID
    }

    if (!uploadFileId) {
      return { code: -1, msg: '缺少 fileID 或 audioBase64' }
    }

    const tempUrlRes = await uniCloud.getTempFileURL({
      fileList: [uploadFileId]
    })
    const tempFile = tempUrlRes.fileList && tempUrlRes.fileList[0]
    const fileUrl = tempFile && tempFile.tempFileURL
    if (!fileUrl) {
      return { code: -1, msg: '获取音频临时地址失败' }
    }

    const taskId = await submitTask(fileUrl)

    let output = null
    const maxPollCount = 60
    for (let i = 0; i < maxPollCount; i++) {
      output = await queryTask(taskId)
      const status = output.task_status
      if (status === 'SUCCEEDED') break
      if (status === 'FAILED' || status === 'CANCELED') {
        return { code: -1, msg: `识别任务失败: ${status}` }
      }
      await sleep(1000)
    }

    if (!output || output.task_status !== 'SUCCEEDED') {
      return { code: -1, msg: '识别超时，请稍后重试' }
    }

    const resultItem = (output.results || [])[0]
    if (!resultItem || resultItem.subtask_status !== 'SUCCEEDED' || !resultItem.transcription_url) {
      const reason = resultItem && (resultItem.message || resultItem.code) ? `${resultItem.code || ''} ${resultItem.message || ''}`.trim() : '子任务失败'
      return { code: -1, msg: `识别失败: ${reason}` }
    }

    const text = await fetchTextByTranscriptionUrl(resultItem.transcription_url)

    return {
      code: 0,
      data: {
        text,
        taskId
      }
    }
  } catch (error) {
    return {
      code: -1,
      msg: error.message || '录音识别失败'
    }
  }
}
