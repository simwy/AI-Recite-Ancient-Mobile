"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  data() {
    return {
      keyword: "",
      list: [],
      loading: false,
      page: 1,
      total: 0,
      timer: null,
      manualTitle: "",
      manualAuthor: "",
      aiLoading: false,
      showAddPopup: false,
      aiCandidates: []
    };
  },
  onLoad() {
    this.loadData();
  },
  onPullDownRefresh() {
    this.page = 1;
    this.loadData().then(() => common_vendor.index.stopPullDownRefresh());
  },
  onReachBottom() {
    if (this.list.length < this.total) {
      this.page++;
      this.loadData(true);
    }
  },
  methods: {
    onInput(e) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.page = 1;
        this.aiCandidates = [];
        this.loadData();
      }, 300);
    },
    onSearch() {
      this.page = 1;
      this.aiCandidates = [];
      this.loadData();
    },
    onClear() {
      this.keyword = "";
      this.page = 1;
      this.manualTitle = "";
      this.manualAuthor = "";
      this.aiCandidates = [];
      this.showAddPopup = false;
      this.loadData();
    },
    async loadData(append = false) {
      this.loading = true;
      try {
        const res = await common_vendor.tr.callFunction({
          name: "gw_ancient-search",
          data: {
            action: "search",
            keyword: this.keyword,
            page: this.page,
            pageSize: 20
          }
        });
        const { list, total } = res.result.data;
        this.list = append ? [...this.list, ...list] : list;
        this.total = total;
      } catch (e) {
        common_vendor.index.showToast({ title: "加载失败", icon: "none" });
      } finally {
        this.loading = false;
      }
    },
    getPreview(content, len = 30) {
      if (!content)
        return "";
      return content.length > len ? content.slice(0, len) + "..." : content;
    },
    goDetail(itemOrId) {
      const isObjectParam = itemOrId && typeof itemOrId === "object";
      const id = isObjectParam ? itemOrId._id : itemOrId;
      if (!id)
        return;
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.currentText = isObjectParam ? itemOrId : null;
      const title = isObjectParam ? itemOrId.title || "" : "";
      common_vendor.index.navigateTo({ url: `/pages/ancient/detail?id=${id}&title=${encodeURIComponent(title)}` });
    },
    openAddPopup() {
      this.showAddPopup = true;
      this.manualTitle = this.keyword || "";
      this.manualAuthor = "";
      this.aiCandidates = [];
    },
    closeAddPopup() {
      this.showAddPopup = false;
      this.aiLoading = false;
      this.aiCandidates = [];
    },
    async searchByAI() {
      const title = (this.manualTitle || "").trim();
      const author = (this.manualAuthor || "").trim();
      if (!title || !author) {
        common_vendor.index.showToast({ title: "请先填写古文名称和作者", icon: "none" });
        return;
      }
      this.aiLoading = true;
      this.aiCandidates = [];
      try {
        const res = await common_vendor.tr.callFunction({
          name: "gw_ancient-search",
          data: {
            action: "aiSearch",
            data: { title, author }
          }
        });
        const result = res && res.result || {};
        if (result.code !== 0) {
          throw new Error(result.msg || "AI 检索失败");
        }
        const data = result.data || {};
        if (data.existed && data.text) {
          common_vendor.index.showModal({
            title: "古文已存在",
            content: "该古文已在库中，是否前往查看？",
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.goDetail(data.text._id);
              }
            }
          });
          return;
        }
        if (!data.candidates || data.candidates.length === 0) {
          common_vendor.index.showToast({ title: "未找到精确匹配古文", icon: "none" });
          return;
        }
        this.aiCandidates = data.candidates;
      } catch (e) {
        common_vendor.index.showToast({ title: e.message || "AI 检索失败", icon: "none" });
      } finally {
        this.aiLoading = false;
      }
    },
    confirmAddFromAI(item) {
      if (!item)
        return;
      this.showAddPopup = false;
      setTimeout(() => {
        common_vendor.index.showModal({
          title: "确认添加古文",
          content: `将《${item.title}》- ${item.author} 加入古文库？`,
          success: async (modalRes) => {
            if (!modalRes.confirm) {
              this.showAddPopup = true;
              return;
            }
            await this.submitAddFromAI(item);
          }
        });
      }, 50);
    },
    async submitAddFromAI(item) {
      if (!item)
        return;
      common_vendor.index.showLoading({ title: "提交中..." });
      try {
        const res = await common_vendor.tr.callFunction({
          name: "gw_ancient-search",
          data: {
            action: "confirmAdd",
            data: item
          }
        });
        const result = res && res.result || {};
        if (result.code !== 0) {
          throw new Error(result.msg || "添加失败");
        }
        const info = result.data || {};
        if (info.existed && info.text) {
          common_vendor.index.showToast({ title: "古文已存在", icon: "none" });
          this.goDetail(info.text._id);
          return;
        }
        common_vendor.index.showToast({ title: "添加成功", icon: "success" });
        this.keyword = item.title;
        this.page = 1;
        this.aiCandidates = [];
        this.showAddPopup = false;
        await this.loadData();
      } catch (e) {
        common_vendor.index.showToast({ title: e.message || "添加失败", icon: "none" });
      } finally {
        common_vendor.index.hideLoading();
      }
    }
  }
};
if (!Array) {
  const _easycom_uni_search_bar2 = common_vendor.resolveComponent("uni-search-bar");
  _easycom_uni_search_bar2();
}
const _easycom_uni_search_bar = () => "../../uni_modules/uni-search-bar/components/uni-search-bar/uni-search-bar.js";
if (!Math) {
  _easycom_uni_search_bar();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.o($options.onSearch),
    b: common_vendor.o($options.onClear),
    c: common_vendor.o($options.onInput),
    d: common_vendor.o(($event) => $data.keyword = $event),
    e: common_vendor.p({
      placeholder: "搜索古文标题、作者或内容",
      modelValue: $data.keyword
    }),
    f: $data.list.length > 0
  }, $data.list.length > 0 ? {
    g: common_vendor.f($data.list, (item, k0, i0) => {
      return {
        a: common_vendor.t(item.title),
        b: common_vendor.t(item.dynasty),
        c: common_vendor.t(item.author),
        d: common_vendor.t($options.getPreview(item.content)),
        e: item._id,
        f: common_vendor.o(($event) => $options.goDetail(item), item._id)
      };
    })
  } : !$data.loading ? common_vendor.e({
    i: common_vendor.t($data.keyword ? "未找到相关古文" : "暂无古文数据"),
    j: $data.keyword
  }, $data.keyword ? {
    k: common_vendor.o((...args) => $options.openAddPopup && $options.openAddPopup(...args))
  } : {}) : {}, {
    h: !$data.loading,
    l: $data.loading
  }, $data.loading ? {} : {}, {
    m: $data.showAddPopup
  }, $data.showAddPopup ? common_vendor.e({
    n: common_vendor.o((...args) => $options.closeAddPopup && $options.closeAddPopup(...args)),
    o: $data.manualTitle,
    p: common_vendor.o(($event) => $data.manualTitle = $event.detail.value),
    q: $data.manualAuthor,
    r: common_vendor.o(($event) => $data.manualAuthor = $event.detail.value),
    s: common_vendor.o((...args) => $options.closeAddPopup && $options.closeAddPopup(...args)),
    t: $data.aiLoading,
    v: common_vendor.o((...args) => $options.searchByAI && $options.searchByAI(...args)),
    w: $data.aiCandidates.length > 0
  }, $data.aiCandidates.length > 0 ? {
    x: common_vendor.f($data.aiCandidates, (item, idx, i0) => {
      return {
        a: common_vendor.t(idx + 1),
        b: common_vendor.t(item.title),
        c: common_vendor.t(item.dynasty || "未知朝代"),
        d: common_vendor.t(item.author),
        e: common_vendor.t($options.getPreview(item.content, 110)),
        f: common_vendor.o(($event) => $options.confirmAddFromAI(item), idx),
        g: idx
      };
    })
  } : {}, {
    y: common_vendor.o(() => {
    })
  }) : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-751272cd"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/list.js.map
