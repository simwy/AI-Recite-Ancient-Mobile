<template>
  <view class="container">
    <view class="layout">
      <scroll-view class="left-panel" scroll-y>
        <view
          v-for="item in categories"
          :key="getDocId(item)"
          :class="['category-item', activeCategoryId === getDocId(item) ? 'active' : '']"
          @click="onCategoryClick(item)"
        >
          <text class="category-text">{{ item.name }}</text>
        </view>
      </scroll-view>

      <view class="right-panel">
        <view class="panel-title">{{ activeCategoryName || '子合集' }}</view>

        <view v-if="loadingSubcollections" class="status-text">加载中...</view>
        <view v-else-if="subcollections.length === 0" class="status-text">暂无子合集</view>
        <scroll-view v-else class="sub-list" scroll-y>
          <view
            class="sub-item"
            v-for="item in subcollections"
            :key="getDocId(item)"
            @click="openSubcollection(item)"
          >
            <view class="sub-title">{{ item.name }}</view>
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
      categories: [],
      activeCategoryId: '',
      activeCategoryName: '',
      subcollections: [],
      loadingCategories: false,
      loadingSubcollections: false
    }
  },
  onLoad() {
    this.loadCategories()
  },
  methods: {
    getDocId(item) {
      if (!item) return ''
      return item._id || item.id || ''
    },
    async loadCategories() {
      this.loadingCategories = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_ancient-search',
          data: { action: 'getSquareCategories' }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          throw new Error(result.msg || '分类加载失败')
        }
        this.categories = (result.data && result.data.list) || []
        if (this.categories.length === 0) {
          this.activeCategoryId = ''
          this.activeCategoryName = ''
          this.subcollections = []
          return
        }
        const first = this.categories[0]
        this.activeCategoryId = this.getDocId(first)
        this.activeCategoryName = first.name
        await this.loadSubcollections()
      } catch (e) {
        uni.showToast({ title: e.message || '分类加载失败', icon: 'none' })
      } finally {
        this.loadingCategories = false
      }
    },
    async loadSubcollections() {
      if (!this.activeCategoryId) {
        this.subcollections = []
        return
      }
      this.loadingSubcollections = true
      try {
        const res = await uniCloud.callFunction({
          name: 'gw_ancient-search',
          data: {
            action: 'getSubcollectionsByCategory',
            data: {
              categoryId: this.activeCategoryId
            }
          }
        })
        const result = (res && res.result) || {}
        if (result.code !== 0) {
          throw new Error(result.msg || '子合集加载失败')
        }
        this.subcollections = (result.data && result.data.list) || []
      } catch (e) {
        this.subcollections = []
        uni.showToast({ title: e.message || '子合集加载失败', icon: 'none' })
      } finally {
        this.loadingSubcollections = false
      }
    },
    async onCategoryClick(item) {
      const categoryId = this.getDocId(item)
      if (!categoryId || categoryId === this.activeCategoryId) {
        return
      }
      this.activeCategoryId = categoryId
      this.activeCategoryName = item.name
      await this.loadSubcollections()
    },
    openSubcollection(item) {
      const subcollectionId = this.getDocId(item)
      if (!subcollectionId) return
      const query = [
        `categoryId=${encodeURIComponent(this.activeCategoryId)}`,
        `subcollectionId=${encodeURIComponent(subcollectionId)}`,
        `categoryName=${encodeURIComponent(this.activeCategoryName || '')}`,
        `subcollectionName=${encodeURIComponent(item.name || '')}`
      ].join('&')
      uni.navigateTo({
        url: `/pages/square/list?${query}`
      })
    }
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  background: #f5f5f5;
}

.layout {
  display: flex;
  height: calc(100vh - 20rpx);
}

.left-panel {
  width: 190rpx;
  background: #f0f2f5;
  border-right: 1rpx solid #e8eaed;
}

.category-item {
  padding: 28rpx 18rpx;
  border-left: 6rpx solid transparent;
  text-align: center;
}

.category-item.active {
  background: #ffffff;
  border-left-color: #007aff;
}

.category-text {
  font-size: 28rpx;
  color: #4e5969;
}

.category-item.active .category-text {
  color: #007aff;
  font-weight: 600;
}

.right-panel {
  flex: 1;
  background: #ffffff;
  padding: 24rpx;
}

.panel-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2329;
  margin-bottom: 16rpx;
}

.sub-list {
  height: calc(100vh - 160rpx);
}

.sub-item {
  background: #f8f9fb;
  border-radius: 12rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}

.sub-title {
  font-size: 30rpx;
  color: #1f2329;
  font-weight: 600;
}

.status-text {
  color: #86909c;
  font-size: 26rpx;
  text-align: center;
  margin-top: 120rpx;
}
</style>
