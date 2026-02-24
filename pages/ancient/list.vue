<template>
  <view class="container">
    <view class="search-bar">
      <uni-search-bar
        v-model="keyword"
        placeholder="搜索古文标题或内容"
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
      <text>{{ keyword ? '未找到相关古文' : '暂无古文数据' }}</text>
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
      keyword: '',
      list: [],
      loading: false,
      page: 1,
      total: 0,
      timer: null
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
        this.loadData()
      }, 300)
    },
    onSearch() {
      this.page = 1
      this.loadData()
    },
    onClear() {
      this.keyword = ''
      this.page = 1
      this.loadData()
    },
    async loadData(append = false) {
      this.loading = true
      try {
        const res = await uniCloud.callFunction({
          name: 'ancient-search',
          data: {
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
    getPreview(content) {
      return content.length > 30 ? content.slice(0, 30) + '...' : content
    },
    goDetail(id) {
      uni.navigateTo({ url: `/pages/ancient/detail?id=${id}` })
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
</style>
