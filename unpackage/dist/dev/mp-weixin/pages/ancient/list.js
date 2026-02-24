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
      timer: null
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
        this.loadData();
      }, 300);
    },
    onSearch() {
      this.page = 1;
      this.loadData();
    },
    onClear() {
      this.keyword = "";
      this.page = 1;
      this.loadData();
    },
    async loadData(append = false) {
      this.loading = true;
      try {
        const res = await common_vendor.tr.callFunction({
          name: "ancient-search",
          data: {
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
    getPreview(content) {
      return content.length > 30 ? content.slice(0, 30) + "..." : content;
    },
    goDetail(id) {
      common_vendor.index.navigateTo({ url: `/pages/ancient/detail?id=${id}` });
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
      placeholder: "搜索古文标题或内容",
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
        f: common_vendor.o(($event) => $options.goDetail(item._id), item._id)
      };
    })
  } : !$data.loading ? {
    i: common_vendor.t($data.keyword ? "未找到相关古文" : "暂无古文数据")
  } : {}, {
    h: !$data.loading,
    j: $data.loading
  }, $data.loading ? {} : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-751272cd"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/list.js.map
