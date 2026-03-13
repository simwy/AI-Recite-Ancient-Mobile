<template>
  <view class="container">
    <!-- 头部信息 -->
    <view class="header">
      <view class="header-left">
        <view class="correction-btn" @click="goCorrection">
          <uni-icons type="compose" size="16" color="#666" />
          <text class="correction-text">纠错</text>
        </view>
      </view>
      <view class="header-main">
        <text class="title">{{ title }}</text>
        <text class="author" v-if="author">{{ dynasty ? dynasty + ' · ' : '' }}{{ author }}</text>
      </view>
    </view>

    <!-- 准确率 -->
    <view class="accuracy-card">
      <view class="accuracy-row">
        <text class="accuracy-label">准确率</text>
        <text class="accuracy-value">{{ accuracy }}%</text>
      </view>
      <view class="progress-bar">
        <view class="progress-fill" :style="{ width: accuracy + '%' }"></view>
      </view>
    </view>

    <!-- 拍照原图（横向展示） -->
    <view class="section-card" v-if="imageUrl">
      <view class="section-label">默写照片（点击查看大图）</view>
      <scroll-view class="photo-scroll" scroll-x>
        <image
          class="photo-preview"
          :src="imageUrl"
          mode="heightFix"
          @tap="previewImage"
        />
      </scroll-view>
    </view>

    <!-- 逐字批改 -->
    <view class="section-card">
      <view class="section-label">批改详情</view>

      <!-- 双行对照 -->
        <view class="detail-row" v-if="renderTitleList.length" @tap="onTapTitle">
          <text class="detail-label">标题：</text>
          <view :class="['dual-row-grid', playingIndex === -1 ? 'sentence-playing' : '', loadingIndex === -1 ? 'sentence-loading' : '']">
            <view class="char-col" v-for="(item, idx) in renderTitleList" :key="'rt-' + idx">
              <text :class="['row-original', 'diff-' + item.status]">{{ item.char || '\u3000' }}</text>
              <text :class="['row-actual', item.written ? ('diff-actual-' + item.status) : '', (item.status === 'wrong' || item.status === 'extra') && item.written ? 'row-actual-strikethrough' : '']">{{ item.written || '\u3000' }}</text>
            </view>
          </view>
        </view>
        <view class="detail-row" v-if="renderAuthorList.length" @tap="onTapAuthor">
          <text class="detail-label">朝代·作者：</text>
          <view :class="['dual-row-grid', playingIndex === -2 ? 'sentence-playing' : '', loadingIndex === -2 ? 'sentence-loading' : '']">
            <view class="char-col" v-for="(item, idx) in renderAuthorList" :key="'ra-' + idx">
              <text :class="['row-original', 'diff-' + item.status]">{{ item.char || '\u3000' }}</text>
              <text :class="['row-actual', item.written ? ('diff-actual-' + item.status) : '', (item.status === 'wrong' || item.status === 'extra') && item.written ? 'row-actual-strikethrough' : '']">{{ item.written || '\u3000' }}</text>
            </view>
          </view>
        </view>
        <view class="content-row" v-if="sentenceGroups.length">
          <text class="detail-label">正文：</text>
          <view
            v-for="(group, gi) in sentenceGroups"
            :key="'sg-' + gi"
            :class="['sentence-group', playingIndex === gi ? 'sentence-playing' : '', loadingIndex === gi ? 'sentence-loading' : '']"
            @tap="onTapSentence(gi)"
          >
            <view class="dual-row-grid">
              <view class="char-col" v-for="(item, idx) in group.chars" :key="'rc-' + gi + '-' + idx">
                <text :class="['row-original', 'diff-' + item.status]">{{ item.char || '\u3000' }}</text>
                <text :class="['row-actual', item.written ? ('diff-actual-' + item.status) : '', (item.status === 'wrong' || item.status === 'extra') && item.written && item.status !== 'tongjiazi' ? 'row-actual-strikethrough' : '']">{{ item.written || '\u3000' }}</text>
              </view>
            </view>
          </view>
        </view>

      <!-- 图例 -->
      <view class="legend">
        <text class="legend-correct">● 正确</text>
        <text class="legend-wrong">● 错别字</text>
        <text class="legend-missing">● 漏写</text>
        <text class="legend-extra">● 多写</text>
        <text class="legend-tongjiazi">● 通假字</text>
      </view>
    </view>

    <!-- 错字详情 -->
    <view class="section-card" v-if="wrongDetails.length > 0">
      <view class="section-label">错字详情</view>
      <view class="wrong-list">
        <view class="wrong-item" v-for="(item, idx) in wrongDetails" :key="idx">
          <text class="wrong-original">{{ item.char }}</text>
          <text class="wrong-arrow">→</text>
          <text class="wrong-written">{{ item.recognized }}</text>
        </view>
      </view>
    </view>

    <!-- 识别文字 -->
    <view class="section-card">
      <view class="section-label">识别文字</view>
      <text class="recognized-text">{{ recognizedText || '（无识别内容）' }}</text>
    </view>

    <!-- 操作按钮 -->
    <view class="action-area">
      <button class="btn btn-primary" @tap="checkAgain">再次检查</button>
      <button class="btn btn-secondary" @tap="goBack">返回默写</button>
    </view>
  </view>
</template>

<script>
import { getFeedbackUrl } from '@/common/feedbackHelper.js'
import { buildPlayUnits } from '@/common/playUnits.js'
import ttsService from '@/common/ttsService.js'

export default {
  data() {
    return {
      title: '',
      author: '',
      dynasty: '',
      content: '',
      originalText: '',
      recognizedText: '',
      accuracy: 0,
      imageUrl: '',
      articleId: '',
      renderTitleList: [],
      renderAuthorList: [],
      renderContentList: [],
      sentenceGroups: [],
      playingIndex: -1,
      loadingIndex: -1,
      audioContext: null,
      audioPlayResolver: null
    }
  },
  computed: {
    /** 原文中标题部分长度（去空格），用于拆分批改结果 */
    titlePartLength() {
      return (this.title || '').replace(/\s+/g, '').length
    },
    /** 原文中朝代·作者部分长度（去空格） */
    authorPartLength() {
      const s = this.dynasty && this.author ? (this.dynasty + '·' + this.author) : (this.author || this.dynasty || '')
      return (s || '').replace(/\s+/g, '').length
    },
    wrongDetails() {
      const all = [...this.renderTitleList, ...this.renderAuthorList, ...this.renderContentList]
      return all.filter(d => d.status === 'wrong' && d.written).map(d => ({
        char: d.char,
        recognized: d.written
      }))
    }
  },
  onLoad(options) {
    if (options.recordId) {
      this.loadRecordDetail(options.recordId)
      return
    }
    const app = getApp()
    const result = app.globalData && app.globalData.dictationCheckResult
    if (!result) {
      uni.showToast({ title: '无批改数据', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 1500)
      return
    }
    this.title = result.title || ''
    this.author = result.author || ''
    this.dynasty = result.dynasty || ''
    this.content = result.content || ''
    this.originalText = result.originalText || ''
    this.recognizedText = this.parseRecognizedText(result.recognizedText || '') || ''
    this.imageUrl = result.imageUrl || ''
    this.articleId = result.articleId || ''
    this.initAudioContext()
    if (result.sentenceResults && result.snapshotSentences) {
      this.runSentenceMatch(result.sentenceResults, result.snapshotSentences, result.titleRecite || '', result.authorRecite || '')
    } else {
      this.runCompare()
    }
  },
  onUnload() {
    this.stopAudio()
    if (this.audioContext) {
      this.audioContext.destroy()
      this.audioContext = null
    }
  },
  methods: {
    /** 若识别结果为 JSON 字符串（如 {"content":"..."}），则解析并返回 content，否则返回原值 */
    parseRecognizedText(val) {
      if (val == null || typeof val !== 'string' || !val.trim()) return val
      try {
        const p = JSON.parse(val)
        if (p && typeof p.content === 'string') return p.content
      } catch (e) {}
      return val
    },
    goCorrection() {
      const id = this.articleId || ''
      const title = this.title || ''
      uni.navigateTo({ url: getFeedbackUrl({ id, title, type: 'dictation' }) })
    },
    async loadRecordDetail(recordId) {
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_dictation-check',
          data: { action: 'detail', data: { id: recordId } }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          uni.showToast({ title: result.msg || '记录加载失败', icon: 'none' })
          setTimeout(() => uni.navigateBack(), 1500)
          return
        }
        const r = result.data
        this.title = r.text_title || ''
        this.author = r.text_author || ''
        this.dynasty = r.text_dynasty || ''
        this.content = r.text_content || ''
        this.originalText = r.original_text || ''
        this.recognizedText = this.parseRecognizedText(r.recognized_text || '') || ''
        this.imageUrl = r.image_url || ''
        this.articleId = r.article_id || ''
        this.initAudioContext()
        if (r.sentence_results && r.snapshot_sentences) {
          this.runSentenceMatch(r.sentence_results, r.snapshot_sentences, r.title_recite || '', r.author_recite || '')
        } else {
          this.runCompare()
        }
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 1500)
      }
    },
    previewImage() {
      if (!this.imageUrl) return
      uni.previewImage({
        urls: [this.imageUrl],
        current: this.imageUrl
      })
    },
    checkAgain() {
      uni.navigateBack()
    },
    goBack() {
      uni.navigateBack()
    },
    errorTypeLabel(type) {
      const map = { homophone: '同音字', similar: '形近字', other: '写错' }
      return map[type] || '写错'
    },
    /** 标点/间隔符判断 */
    isPunct(ch) {
      return /[，。、；：？！""''（）《》〈〉【】「」『』〔〕…—\-·\u00B7\u3000-\u303f\u2000-\u206f\s]/.test(ch)
    },
    /** 前端 LCS 比较并生成渲染列表 */
    runCompare() {
      const orig = (this.originalText || '').split('')
      const rec = (this.recognizedText || '').replace(/[\s]/g, '').split('')
      // 过滤标点
      const a = [], aIdx = []
      orig.forEach((ch, i) => { if (!this.isPunct(ch)) { a.push(ch); aIdx.push(i) } })
      const b = [], bIdx = []
      rec.forEach((ch, i) => { if (!this.isPunct(ch)) { b.push(ch); bIdx.push(i) } })
      // LCS DP
      const m = a.length, n = b.length
      const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
        }
      }
      // 回溯生成 diff 操作序列
      const ops = []
      let i = m, j = n
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
          ops.push({ type: 'match', oi: aIdx[i-1], ri: bIdx[j-1] })
          i--; j--
        } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
          ops.push({ type: 'extra', ri: bIdx[j-1] })
          j--
        } else {
          ops.push({ type: 'delete', oi: aIdx[i-1] })
          i--
        }
      }
      ops.reverse()
      this.buildFromOps(orig, rec, ops)
    },
    /** 从 diff ops 构建渲染列表 */
    buildFromOps(orig, rec, ops) {
      const list = []
      // 收集连续 delete 和 extra，尝试配对为 wrong
      let di = 0
      while (di < ops.length) {
        const op = ops[di]
        if (op.type === 'match') {
          list.push({ char: orig[op.oi], status: 'correct', written: '' })
          di++
        } else if (op.type === 'delete') {
          // 收集连续 delete
          const deletes = []
          while (di < ops.length && ops[di].type === 'delete') {
            deletes.push(ops[di]); di++
          }
          // 收集紧跟的连续 extra
          const extras = []
          while (di < ops.length && ops[di].type === 'extra') {
            extras.push(ops[di]); di++
          }
          // 配对：min(deletes, extras) 为 wrong，剩余为 missing 或 extra
          const pairs = Math.min(deletes.length, extras.length)
          for (let k = 0; k < pairs; k++) {
            list.push({ char: orig[deletes[k].oi], status: 'wrong', written: rec[extras[k].ri] })
          }
          for (let k = pairs; k < deletes.length; k++) {
            list.push({ char: orig[deletes[k].oi], status: 'missing', written: '' })
          }
          for (let k = pairs; k < extras.length; k++) {
            list.push({ char: '', status: 'extra', written: rec[extras[k].ri] })
          }
        } else if (op.type === 'extra') {
          // 独立的 extra（前面没有 delete）
          const extras = []
          while (di < ops.length && ops[di].type === 'extra') {
            extras.push(ops[di]); di++
          }
          for (const e of extras) {
            list.push({ char: '', status: 'extra', written: rec[e.ri] })
          }
        } else {
          di++
        }
      }
      // 插回标点
      const fullList = []
      let li = 0
      for (let oi = 0; oi < orig.length; oi++) {
        if (this.isPunct(orig[oi])) {
          fullList.push({ char: orig[oi], status: 'punctuation', written: '' })
        } else if (li < list.length) {
          fullList.push(list[li]); li++
        }
      }
      // 剩余 extra 追加到末尾
      while (li < list.length) { fullList.push(list[li]); li++ }
      // 计算准确率
      const total = fullList.filter(d => d.status !== 'punctuation' && d.status !== 'extra').length
      const correct = fullList.filter(d => d.status === 'correct').length
      this.accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
      // 拆分标题、作者、正文
      const titleLen = this.titlePartLength
      const authorLen = this.authorPartLength
      this.renderTitleList = fullList.slice(0, titleLen)
      this.renderAuthorList = fullList.slice(titleLen, titleLen + authorLen)
      this.renderContentList = fullList.slice(titleLen + authorLen)
      // 按句子分组
      this.buildSentenceGroups()
    },
    /** 句子级 LCS diff：对单句原文和默写做逐字比对 */
    lcsDiffSentence(original, recite, tongjiazi) {
      const origChars = (original || '').split('')
      const recChars = (recite || '').split('')
      // 过滤标点
      const a = [], aIdx = []
      origChars.forEach((ch, i) => { if (!this.isPunct(ch)) { a.push(ch); aIdx.push(i) } })
      const b = [], bIdx = []
      recChars.forEach((ch, i) => { if (!this.isPunct(ch)) { b.push(ch); bIdx.push(i) } })
      // 通假字映射: original -> written
      const tjMap = {}
      if (Array.isArray(tongjiazi)) {
        tongjiazi.forEach(t => { if (t.original && t.written) tjMap[t.original] = t.written })
      }
      // LCS DP（通假字视为匹配）
      const m = a.length, n = b.length
      const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1))
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const isMatch = a[i-1] === b[j-1] || (tjMap[a[i-1]] && tjMap[a[i-1]] === b[j-1])
          dp[i][j] = isMatch ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1])
        }
      }
      // 回溯
      const ops = []
      let i = m, j = n
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0) {
          const isMatch = a[i-1] === b[j-1] || (tjMap[a[i-1]] && tjMap[a[i-1]] === b[j-1])
          if (isMatch) {
            const isTj = a[i-1] !== b[j-1] && tjMap[a[i-1]] === b[j-1]
            ops.push({ type: 'match', oi: aIdx[i-1], ri: bIdx[j-1], tongjiazi: isTj })
            i--; j--; continue
          }
        }
        if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
          ops.push({ type: 'extra', ri: bIdx[j-1] }); j--
        } else {
          ops.push({ type: 'delete', oi: aIdx[i-1] }); i--
        }
      }
      ops.reverse()
      return this.buildSentenceDiffList(origChars, recChars, ops)
    },
    /** 从句子 diff ops 构建渲染列表 */
    buildSentenceDiffList(origChars, recChars, ops) {
      const list = []
      let di = 0
      while (di < ops.length) {
        const op = ops[di]
        if (op.type === 'match') {
          if (op.tongjiazi) {
            list.push({ char: origChars[op.oi], status: 'tongjiazi', written: recChars[op.ri], oi: op.oi })
          } else {
            list.push({ char: origChars[op.oi], status: 'correct', written: '', oi: op.oi })
          }
          di++
        } else if (op.type === 'delete') {
          const deletes = []
          while (di < ops.length && ops[di].type === 'delete') { deletes.push(ops[di]); di++ }
          const extras = []
          while (di < ops.length && ops[di].type === 'extra') { extras.push(ops[di]); di++ }
          const pairs = Math.min(deletes.length, extras.length)
          for (let k = 0; k < pairs; k++) {
            list.push({ char: origChars[deletes[k].oi], status: 'wrong', written: recChars[extras[k].ri], oi: deletes[k].oi })
          }
          for (let k = pairs; k < deletes.length; k++) {
            list.push({ char: origChars[deletes[k].oi], status: 'missing', written: '', oi: deletes[k].oi })
          }
          for (let k = pairs; k < extras.length; k++) {
            list.push({ char: '', status: 'extra', written: recChars[extras[k].ri], oi: -1 })
          }
        } else if (op.type === 'extra') {
          const extras = []
          while (di < ops.length && ops[di].type === 'extra') { extras.push(ops[di]); di++ }
          for (const e of extras) {
            list.push({ char: '', status: 'extra', written: recChars[e.ri], oi: -1 })
          }
        } else { di++ }
      }
      // 按原文位置插回标点
      const fullList = []
      let li = 0
      for (let oi = 0; oi < origChars.length; oi++) {
        if (this.isPunct(origChars[oi])) {
          fullList.push({ char: origChars[oi], status: 'punctuation', written: '' })
        } else {
          // 先插入该位置之前的 extra（oi === -1 且紧邻当前位置）
          while (li < list.length && list[li].oi === -1) {
            fullList.push(list[li]); li++
          }
          if (li < list.length && list[li].oi === oi) {
            fullList.push(list[li]); li++
          }
        }
      }
      // 剩余 extra 追加到末尾
      while (li < list.length) { fullList.push(list[li]); li++ }
      return fullList
    },
    /** 根据 buildPlayUnits 的句子边界，将 renderContentList 分组 */
    buildSentenceGroups() {
      const units = buildPlayUnits(this.content)
      if (!units.length) {
        this.sentenceGroups = [{ text: '', chars: this.renderContentList, unitIndex: 0 }]
        return
      }
      const groups = []
      let charIdx = 0
      for (let ui = 0; ui < units.length; ui++) {
        const unitText = units[ui].text
        const unitCharsNoPunct = unitText.replace(/[\s，。、；：？！""''（）《》〈〉【】「」『』〔〕…—·\u3000-\u303f\u2000-\u206f]/g, '').length
        // 从 renderContentList 中取出对应数量的字符（含标点）
        let consumedNoPunct = 0
        const chars = []
        while (charIdx < this.renderContentList.length && consumedNoPunct < unitCharsNoPunct) {
          const item = this.renderContentList[charIdx]
          chars.push(item)
          charIdx++
          if (item.status !== 'punctuation') {
            consumedNoPunct++
          }
        }
        // 继续吃掉紧跟的标点
        while (charIdx < this.renderContentList.length && this.renderContentList[charIdx].status === 'punctuation') {
          chars.push(this.renderContentList[charIdx])
          charIdx++
        }
        groups.push({ text: unitText, chars, unitIndex: ui })
      }
      // 剩余字符（extra等）追加到最后一组
      if (charIdx < this.renderContentList.length) {
        const last = groups.length ? groups[groups.length - 1] : { text: '', chars: [], unitIndex: 0 }
        while (charIdx < this.renderContentList.length) {
          last.chars.push(this.renderContentList[charIdx])
          charIdx++
        }
        if (!groups.length) groups.push(last)
      }
      this.sentenceGroups = groups
    },
    /** 句子级匹配：用 LLM 结果 + 前端 LCS 逐字 diff */
    runSentenceMatch(sentenceResults, snapshotSentences, titleRecite, authorRecite) {
      // 标题 diff
      if (this.title) {
        this.renderTitleList = this.lcsDiffSentence(this.title, titleRecite || '', [])
      }
      // 作者 diff
      const authorDisplay = this.dynasty && this.author ? (this.dynasty + '·' + this.author) : (this.author || this.dynasty || '')
      if (authorDisplay) {
        this.renderAuthorList = this.lcsDiffSentence(authorDisplay, authorRecite || '', [])
      }
      // 正文：按 snapshot 句子逐句处理
      const groups = []
      const contentChars = [] // 用于 wrongDetails 和准确率
      for (let si = 0; si < snapshotSentences.length; si++) {
        const snap = snapshotSentences[si]
        const sr = sentenceResults.find(r => r.index === si)
        const origText = snap.text || ''
        let chars = []
        if (!sr || sr.status === 'missing') {
          // 整句漏写：每个非标点字标红
          chars = origText.split('').map(ch => {
            if (this.isPunct(ch)) return { char: ch, status: 'punctuation', written: '' }
            return { char: ch, status: 'missing', written: '' }
          })
        } else if (sr.status === 'correct') {
          // 整句正确：每个非标点字标绿
          chars = origText.split('').map(ch => {
            if (this.isPunct(ch)) return { char: ch, status: 'punctuation', written: '' }
            return { char: ch, status: 'correct', written: '' }
          })
        } else if (sr.status === 'wrong') {
          // 有错误：用 LCS 逐字 diff
          chars = this.lcsDiffSentence(origText, sr.recite || '', sr.tongjiazi || [])
        } else {
          // 其他状态按 wrong 处理
          chars = this.lcsDiffSentence(origText, sr.recite || '', sr.tongjiazi || [])
        }
        groups.push({ text: origText, chars, unitIndex: si })
        contentChars.push(...chars)
      }
      // 处理 extra 句子（index === -1）
      sentenceResults.filter(r => r.index === -1 || r.status === 'extra').forEach(sr => {
        const recText = sr.recite || ''
        const chars = recText.split('').map(ch => {
          if (this.isPunct(ch)) return { char: ch, status: 'punctuation', written: '' }
          return { char: '', status: 'extra', written: ch }
        })
        groups.push({ text: '', chars, unitIndex: -1 })
        contentChars.push(...chars)
      })
      this.sentenceGroups = groups
      this.renderContentList = contentChars
      // 计算准确率
      const allChars = [...this.renderTitleList, ...this.renderAuthorList, ...contentChars]
      const total = allChars.filter(d => d.status !== 'punctuation' && d.status !== 'extra').length
      const correct = allChars.filter(d => d.status === 'correct' || d.status === 'tongjiazi').length
      this.accuracy = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0
      // 回写准确率到云函数
      this.updateAccuracyToCloud()
    },
    /** 回写准确率到云端 */
    async updateAccuracyToCloud() {
      const app = getApp()
      const result = app.globalData && app.globalData.dictationCheckResult
      const recordId = (result && result.recordId) || ''
      if (!recordId || !this.accuracy) return
      try {
        await uniCloud.callFunction({
          name: 'gw_dictation-check',
          data: { action: 'updateAccuracy', data: { id: recordId, accuracy: this.accuracy } }
        })
      } catch (e) {
        console.error('回写准确率失败:', e)
      }
    },
    /** 初始化音频上下文 */
    initAudioContext() {
      if (typeof uni.createInnerAudioContext !== 'function') return
      this.audioContext = uni.createInnerAudioContext()
      this.audioContext.onEnded(() => {
        this.playingIndex = -1
        if (typeof this.audioPlayResolver === 'function') {
          this.audioPlayResolver()
          this.audioPlayResolver = null
        }
      })
      this.audioContext.onError(() => {
        this.playingIndex = -1
        this.loadingIndex = -1
        if (typeof this.audioPlayResolver === 'function') {
          this.audioPlayResolver()
          this.audioPlayResolver = null
        }
      })
    },
    /** 点击句子播放 TTS */
    async onTapSentence(groupIndex) {
      const group = this.sentenceGroups[groupIndex]
      if (!group || !group.text || !this.audioContext) return
      // 如果正在播放同一句，停止
      if (this.playingIndex === groupIndex) {
        this.stopAudio()
        return
      }
      this.stopAudio()
      this.loadingIndex = groupIndex
      try {
        const unit = {
          text: group.text,
          hash: ttsService.buildUnitHash(group.text)
        }
        const audioSrc = await ttsService.ensureUnitAudio(unit)
        this.loadingIndex = -1
        this.playingIndex = groupIndex
        this.audioContext.src = audioSrc
        this.audioContext.play()
      } catch (err) {
        this.loadingIndex = -1
        this.playingIndex = -1
        uni.showToast({ title: err.message || '语音播放失败', icon: 'none' })
      }
    },
    /** 点击标题播放 */
    onTapTitle() {
      if (!this.title || !this.audioContext) return
      this.onTapCustomText(this.title, -1)
    },
    /** 点击作者播放 */
    onTapAuthor() {
      const metaText = this.dynasty && this.author ? (this.dynasty + ' · ' + this.author) : (this.author || this.dynasty || '')
      if (!metaText || !this.audioContext) return
      this.onTapCustomText(metaText, -2)
    },
    async onTapCustomText(text, index) {
      if (this.playingIndex === index) {
        this.stopAudio()
        return
      }
      this.stopAudio()
      this.loadingIndex = index
      try {
        const unit = { text, hash: ttsService.buildUnitHash(text) }
        const audioSrc = await ttsService.ensureUnitAudio(unit)
        this.loadingIndex = -1
        this.playingIndex = index
        this.audioContext.src = audioSrc
        this.audioContext.play()
      } catch (err) {
        this.loadingIndex = -1
        this.playingIndex = -1
        uni.showToast({ title: err.message || '语音播放失败', icon: 'none' })
      }
    },
    stopAudio() {
      if (this.audioContext) {
        try { this.audioContext.stop() } catch (e) {}
      }
      this.playingIndex = -1
      this.loadingIndex = -1
    }
  }
}
</script>

<style scoped>
.container {
  padding: 24rpx;
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 40rpx;
}
.header {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-bottom: 24rpx;
}
.header-left {
  flex-shrink: 0;
  margin-right: 16rpx;
}
.header-main {
  flex: 1;
  min-width: 0;
  text-align: center;
}
.correction-btn {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 12rpx;
  border-radius: 16rpx;
  background: #f5f5f5;
  border: 1rpx solid #e5e5e5;
}
.correction-text {
  font-size: 22rpx;
  color: #666;
}
.title {
  display: block;
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
}
.author {
  display: block;
  font-size: 26rpx;
  color: #999;
  margin-top: 8rpx;
}
.accuracy-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.accuracy-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.accuracy-label {
  font-size: 28rpx;
  color: #666;
}
.accuracy-value {
  font-size: 48rpx;
  font-weight: bold;
  color: #1890ff;
}
.progress-bar {
  height: 12rpx;
  background: #f0f0f0;
  border-radius: 6rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #1890ff);
  border-radius: 6rpx;
  transition: width 0.5s ease;
}
.section-card {
  background: #fff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
}
.section-label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 16rpx;
}
.detail-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 16rpx;
}
.detail-label {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #999;
  margin-right: 12rpx;
  line-height: 2.4;
}
.detail-row .diff-char {
  font-size: 36rpx;
}
.content-row {
  display: block;
}
.content-row .detail-label {
  display: block;
  margin-bottom: 8rpx;
}
.content-row .diff-content {
  margin-bottom: 0;
}
.photo-scroll {
  width: 100%;
  white-space: nowrap;
  border-radius: 8rpx;
}
.photo-preview {
  height: 400rpx;
  border-radius: 8rpx;
}
.diff-content {
  line-height: 2.4;
  margin-bottom: 16rpx;
}
.diff-char {
  font-size: 36rpx;
  letter-spacing: 2rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.diff-missing {
  color: #f5222d;
  text-decoration: underline;
}
.diff-punctuation {
  color: #333;
}
/* 双行对照样式 */
.dual-row-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 16rpx;
}
.char-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 52rpx;
  margin-bottom: 12rpx;
}
.row-original {
  font-size: 36rpx;
  line-height: 1.6;
  text-align: center;
}
.row-actual {
  font-size: 26rpx;
  line-height: 1.4;
  text-align: center;
  min-height: 36rpx;
}
/* 原文行颜色 */
.row-original.diff-correct {
  color: #52c41a;
}
.row-original.diff-wrong {
  color: #f5222d;
}
.row-original.diff-missing {
  color: #f5222d;
}
.row-original.diff-extra {
  color: transparent;
}
.row-original.diff-punctuation {
  color: #999;
}
.row-original.diff-tongjiazi {
  color: #f5222d;
}
/* 实际行颜色 */
.diff-actual-wrong {
  color: #f5222d;
}
.diff-actual-extra {
  color: #f5222d;
}
.diff-actual-tongjiazi {
  color: #f5222d;
}
/* 第二行删除线（错别字、多写） */
.row-actual-strikethrough {
  text-decoration: line-through;
}
/* 句子分组样式 */
.sentence-group {
  padding: 8rpx 4rpx;
  border-radius: 8rpx;
  margin-bottom: 8rpx;
}
.sentence-group:active {
  background: #f0f0f0;
}
.sentence-playing {
  background: #e6f7ff;
}
.sentence-loading {
  opacity: 0.6;
}
.legend {
  display: flex;
  gap: 30rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}
.legend-correct {
  font-size: 24rpx;
  color: #52c41a;
}
.legend-wrong {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-missing {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-extra {
  font-size: 24rpx;
  color: #f5222d;
}
.legend-tongjiazi {
  font-size: 24rpx;
  color: #f5222d;
}
.wrong-type {
  font-size: 22rpx;
  color: #999;
  margin-left: 8rpx;
  background: #f5f5f5;
  padding: 2rpx 8rpx;
  border-radius: 4rpx;
}
.wrong-list {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.wrong-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 8rpx 16rpx;
  background: #fff2f0;
  border-radius: 8rpx;
}
.wrong-original {
  font-size: 30rpx;
  color: #52c41a;
  font-weight: bold;
}
.wrong-arrow {
  font-size: 24rpx;
  color: #999;
}
.wrong-written {
  font-size: 30rpx;
  color: #f5222d;
  font-weight: bold;
}
.recognized-text {
  font-size: 28rpx;
  color: #666;
  line-height: 1.8;
}
.action-area {
  padding: 20rpx 0;
}
.btn {
  width: 100%;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
}
.btn-primary {
  background: #2f6fff;
  color: #fff;
}
.btn-secondary {
  background: #fff;
  color: #333;
  border: 1rpx solid #ddd;
}
</style>
