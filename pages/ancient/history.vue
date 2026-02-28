<template>
  <view class="container">
    <view class="list" v-if="list.length > 0">
      <view
        class="list-item"
        v-for="item in list"
        :key="item._id"
        @click="toggleDetail(item._id)"
      >
        <view class="item-header">
          <text class="item-title">{{ item.text_title }}</text>
          <view class="item-right">
            <text class="item-accuracy">{{ item.accuracy || 0 }}%</text>
            <text class="item-delete" @click.stop="confirmDelete(item)">删除</text>
          </view>
        </view>
        <view class="item-meta">
          <text>提示 {{ item.hint_count }} 次</text>
          <text class="item-time">{{ formatTime(item.created_at) }}</text>
        </view>

        <!-- 展开的对比详情 -->
        <view class="item-detail" v-if="expandedId === item._id">
          <view class="diff-content">
            <text
              v-for="(d, idx) in (item.diff_result || [])"
              :key="idx"
              :class="['diff-char', 'diff-' + d.status]"
            >{{ d.char }}</text>
          </view>
          <view class="recognized" v-if="item.recognized_text">
            <text class="recognized-label">识别文字：</text>
            <text class="recognized-text">{{ item.recognized_text }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="empty" v-else-if="!loading">
      <text>暂无背诵记录</text>
    </view>

    <view class="loading" v-if="loading">
      <text>加载中...</text>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      list: [],
      loading: false,
      page: 1,
      total: 0,
      expandedId: '',
      deletingId: ''
    }
  },
  onShow() {
    this.page = 1
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
    async loadData(append = false) {
      this.loading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'list',
            data: { page: this.page, pageSize: 20 }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || '加载失败')
        }
        const { list, total } = result.data
        this.list = append ? [...this.list, ...list] : list
        this.total = total
      } catch (e) {
        uni.showToast({
          title: (e && e.message) || '加载失败',
          icon: 'none'
        })
      } finally {
        this.loading = false
      }
    },
    toggleDetail(id) {
      this.expandedId = this.expandedId === id ? '' : id
    },
    async confirmDelete(item) {
      if (!item || !item._id || this.deletingId) return
      const modalRes = await new Promise(resolve => {
        uni.showModal({
          title: '删除记录',
          content: '确定删除这条背诵记录吗？删除后不可恢复。',
          confirmText: '删除',
          confirmColor: '#f5222d',
          success: resolve,
          fail: () => resolve({ confirm: false })
        })
      })
      if (!modalRes.confirm) return
      this.deleteRecord(item._id)
    },
    async deleteRecord(id) {
      this.deletingId = id
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_recite-record',
          data: {
            action: 'delete',
            data: { id }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          throw new Error(result.msg || '删除失败')
        }
        this.list = this.list.filter(item => item._id !== id)
        this.total = Math.max(0, this.total - 1)
        if (this.expandedId === id) {
          this.expandedId = ''
        }
        uni.showToast({
          title: '删除成功',
          icon: 'success'
        })
      } catch (e) {
        uni.showToast({
          title: (e && e.message) || '删除失败',
          icon: 'none'
        })
      } finally {
        this.deletingId = ''
      }
    },
    formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
  }
}
</script>

<style scoped>
.container {
  padding: 20rpx;
  min-height: 100vh;
  background: #f5f5f5;
}
.list-item {
  background: #fff;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}
.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.item-right {
  display: flex;
  align-items: center;
}
.item-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}
.item-accuracy {
  font-size: 32rpx;
  font-weight: bold;
  color: #1890ff;
}
.item-delete {
  margin-left: 20rpx;
  font-size: 24rpx;
  color: #f5222d;
}
.item-meta {
  display: flex;
  justify-content: space-between;
  font-size: 24rpx;
  color: #999;
}
.item-detail {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #f0f0f0;
}
.diff-content {
  line-height: 2;
  margin-bottom: 16rpx;
}
.diff-char {
  font-size: 32rpx;
}
.diff-correct {
  color: #52c41a;
}
.diff-missing, .diff-wrong {
  color: #f5222d;
  text-decoration: underline;
}
.recognized-label {
  font-size: 24rpx;
  color: #999;
}
.recognized-text {
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
</style>
