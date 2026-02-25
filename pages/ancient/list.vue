<template>
  <view class="container">
    <view class="search-bar">
      <uni-search-bar
        v-model="keyword"
        placeholder="搜索古文标题、作者或内容"
        @confirm="onSearch"
        @clear="onClear"
        @input="onInput"
      />
    </view>

    <view class="list" v-if="list.length > 0">
      <view
        class="list-item"
        v-for="item in list"
        :key="item._id"
        @click="goDetail(item._id)"
      >
        <view class="item-title">{{ item.title }}</view>
        <view class="item-meta">
          <text class="item-author">{{ item.dynasty }} · {{ item.author }}</text>
        </view>
        <view class="item-preview">{{ getPreview(item.content) }}</view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text class="empty-text">{{ keyword ? '未找到相关古文' : '暂无古文数据' }}</text>
      <view class="empty-action-card" v-if="keyword">
        <text class="empty-tip">没找到想要的文章？</text>
        <text class="empty-desc">你可以手动添加，系统会帮你智能匹配内容</text>
        <button
          class="add-entry-btn"
          size="mini"
          @click="openAddPopup"
        >
          添加文章
        </button>
      </view>
    </view>

    <view class="loading" v-if="loading">
      <text>加载中...</text>
    </view>

    <view class="mask" v-if="showAddPopup">
      <view class="popup-card" @tap.stop>
        <view class="popup-header">
          <view class="popup-title">新增古文文章</view>
          <text class="popup-close" @tap="closeAddPopup">×</text>
        </view>

        <view class="field-group">
          <view class="field-label">古文标题</view>
          <input
            class="manual-input"
            v-model="manualTitle"
            placeholder="请输入古文标题"
            confirm-type="next"
          />
        </view>
        <view class="field-group">
          <view class="field-label">作者</view>
          <input
            class="manual-input"
            v-model="manualAuthor"
            placeholder="请输入作者"
            confirm-type="search"
          />
        </view>

        <view class="popup-actions">
          <button class="btn-cancel" size="mini" @tap="closeAddPopup">取消</button>
          <button class="btn-search" type="primary" size="mini" :loading="aiLoading" @tap="searchByAI">查找</button>
        </view>

        <scroll-view class="candidate-list" scroll-y v-if="aiCandidates.length > 0">
          <view class="ai-candidate" v-for="(item, idx) in aiCandidates" :key="idx">
            <view class="candidate-index">版本 {{ idx + 1 }}</view>
            <view class="candidate-title">{{ item.title }}</view>
            <view class="candidate-meta">{{ item.dynasty || '未知朝代' }} · {{ item.author }}</view>
            <view class="candidate-content">{{ getPreview(item.content, 110) }}</view>
            <button
              class="manual-btn"
              type="primary"
              size="mini"
              @tap="confirmAddFromAI(item)"
            >
              确认增加
            </button>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      keyword: '',
      list: [],
      loading: false,
      page: 1,
      total: 0,
      timer: null,
      manualTitle: '',
      manualAuthor: '',
      aiLoading: false,
      showAddPopup: false,
      aiCandidates: []
    }
  },
  onLoad() {
    this.loadData()
  },
  onPullDownRefresh() {
    this.page = 1
    this.loadData().then(() => uni.stopPullDownRefresh())
  },
  onReachBottom() {
    if (this.list.length < this.total) {
      this.page++
      this.loadData(true)
    }
  },
  methods: {
    onInput(e) {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.page = 1
        this.aiCandidates = []
        this.loadData()
      }, 300)
    },
    onSearch() {
      this.page = 1
      this.aiCandidates = []
      this.loadData()
    },
    onClear() {
      this.keyword = ''
      this.page = 1
      this.manualTitle = ''
      this.manualAuthor = ''
      this.aiCandidates = []
      this.showAddPopup = false
      this.loadData()
    },
    async loadData(append = false) {
      this.loading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'ancient-search',
          data: {
            action: 'search',
            keyword: this.keyword,
            page: this.page,
            pageSize: 20
          }
        })
        const { list, total } = res.result.data
        this.list = append ? [...this.list, ...list] : list
        this.total = total
      } catch (e) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      } finally {
        this.loading = false
      }
    },
    getPreview(content, len = 30) {
      if (!content) return ''
      return content.length > len ? content.slice(0, len) + '...' : content
    },
    goDetail(id) {
      uni.navigateTo({ url: `/pages/ancient/detail?id=${id}` })
    },
    openAddPopup() {
      this.showAddPopup = true
      this.manualTitle = this.keyword || ''
      this.manualAuthor = ''
      this.aiCandidates = []
    },
    closeAddPopup() {
      this.showAddPopup = false
      this.aiLoading = false
      this.aiCandidates = []
    },
    async searchByAI() {
      const title = (this.manualTitle || '').trim()
      const author = (this.manualAuthor || '').trim()
      if (!title || !author) {
        uni.showToast({ title: '请先填写古文名称和作者', icon: 'none' })
        return
      }

      this.aiLoading = true
      this.aiCandidates = []
      try {
        const res = await uniCloud.callFunction({
          name: 'ancient-search',
          data: {
            action: 'aiSearch',
            data: { title, author }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          throw new Error(result.msg || 'AI 检索失败')
        }

        const data = result.data || {}
        if (data.existed && data.text) {
          uni.showModal({
            title: '古文已存在',
            content: '该古文已在库中，是否前往查看？',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.goDetail(data.text._id)
              }
            }
          })
          return
        }

        if (!data.candidates || data.candidates.length === 0) {
          uni.showToast({ title: '未找到精确匹配古文', icon: 'none' })
          return
        }

        this.aiCandidates = data.candidates
      } catch (e) {
        uni.showToast({ title: e.message || 'AI 检索失败', icon: 'none' })
      } finally {
        this.aiLoading = false
      }
    },
    confirmAddFromAI(item) {
      if (!item) return

      // 先隐藏当前自定义弹层，避免与系统确认弹窗发生层级冲突
      this.showAddPopup = false
      setTimeout(() => {
        uni.showModal({
          title: '确认添加古文',
          content: `将《${item.title}》- ${item.author} 加入古文库？`,
          success: async (modalRes) => {
            if (!modalRes.confirm) {
              this.showAddPopup = true
              return
            }
            await this.submitAddFromAI(item)
          }
        })
      }, 50)
    },
    async submitAddFromAI(item) {
      if (!item) return

      uni.showLoading({ title: '提交中...' })
      try {
        const res = await uniCloud.callFunction({
          name: 'ancient-search',
          data: {
            action: 'confirmAdd',
            data: item
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          throw new Error(result.msg || '添加失败')
        }

        const info = result.data || {}
        if (info.existed && info.text) {
          uni.showToast({ title: '古文已存在', icon: 'none' })
          this.goDetail(info.text._id)
          return
        }

        uni.showToast({ title: '添加成功', icon: 'success' })
        this.keyword = item.title
        this.page = 1
        this.aiCandidates = []
        this.showAddPopup = false
        await this.loadData()
      } catch (e) {
        uni.showToast({ title: e.message || '添加失败', icon: 'none' })
      } finally {
        uni.hideLoading()
      }
    }
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
}
.search-bar {
  margin-bottom: 20rpx;
}
.list-item {
  padding: 24rpx;
  margin-bottom: 16rpx;
  background: #fff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.item-title {
  font-size: 34rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 8rpx;
}
.item-meta {
  margin-bottom: 12rpx;
}
.item-author {
  font-size: 26rpx;
  color: #888;
}
.item-preview {
  font-size: 28rpx;
  color: #666;
  line-height: 1.6;
}
.empty, .loading {
  text-align: center;
  padding: 100rpx 0;
  color: #999;
  font-size: 28rpx;
}
.empty-text {
  color: #8a8a8a;
}
.empty-action-card {
  margin: 26rpx auto 0;
  width: 86%;
  max-width: 560rpx;
  padding: 26rpx 22rpx 24rpx;
  border-radius: 16rpx;
  background: #f7f8fa;
}
.empty-tip {
  display: block;
  font-size: 28rpx;
  color: #4c4c4c;
}
.empty-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #9b9b9b;
}
.add-entry-btn {
  margin-top: 18rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 30rpx;
  min-width: 200rpx;
  height: 64rpx;
  line-height: 64rpx;
  border-radius: 999rpx;
  border: 1rpx solid #07c160;
  background: #ffffff;
  color: #07c160;
  font-size: 26rpx;
}
.add-entry-btn::after {
  border: none;
}
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}
.popup-card {
  width: 88%;
  max-height: 80vh;
  background: #f7f8fa;
  border-radius: 20rpx;
  padding: 24rpx;
  box-sizing: border-box;
}
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}
.popup-title {
  font-size: 28rpx;
  color: #1f2329;
  font-weight: 600;
}
.popup-close {
  width: 52rpx;
  height: 52rpx;
  line-height: 52rpx;
  border-radius: 26rpx;
  text-align: center;
  font-size: 36rpx;
  color: #8a919f;
  background: #eef0f3;
}
.field-group {
  margin-top: 16rpx;
}
.field-label {
  font-size: 24rpx;
  color: #4e5969;
  margin-bottom: 10rpx;
}
.manual-input {
  width: 100%;
  box-sizing: border-box;
  height: 82rpx;
  padding: 0 20rpx;
  border: 1rpx solid #d9dce3;
  border-radius: 12rpx;
  font-size: 26rpx;
  color: #1f2329;
  background: #fff;
}
.popup-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 20rpx;
}
.btn-cancel,
.btn-search {
  width: 48%;
  border-radius: 10rpx;
}
.candidate-list {
  margin-top: 16rpx;
  max-height: 42vh;
}
.manual-btn {
  margin-top: 12rpx;
  border-radius: 10rpx;
}
.ai-candidate {
  margin-top: 12rpx;
  padding: 18rpx;
  border-radius: 12rpx;
  background: #fff;
}
.candidate-index {
  font-size: 22rpx;
  color: #576b95;
}
.candidate-title {
  font-size: 30rpx;
  color: #1f2329;
  font-weight: bold;
  margin-top: 4rpx;
}
.candidate-meta {
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #86909c;
}
.candidate-content {
  margin-top: 12rpx;
  font-size: 26rpx;
  line-height: 1.7;
  color: #4e5969;
}
</style>
