"use strict";
const common_vendor = require("../../common/vendor.js");
const db = common_vendor.tr.database();
const _sfc_main = {
  data() {
    return {
      id: "",
      detail: {}
    };
  },
  onLoad(options) {
    this.id = options.id;
    this.loadDetail();
  },
  methods: {
    async loadDetail() {
      try {
        const res = await db.collection("ancient-texts").doc(this.id).get();
        if (res.result.data && res.result.data.length > 0) {
          this.detail = res.result.data[0];
        }
      } catch (e) {
        common_vendor.index.showToast({ title: "加载失败", icon: "none" });
      }
    },
    goRecite() {
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.currentText = this.detail;
      common_vendor.index.navigateTo({
        url: `/pages/ancient/recite?id=${this.id}`
      });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.t($data.detail.title),
    b: common_vendor.t($data.detail.dynasty),
    c: common_vendor.t($data.detail.author),
    d: common_vendor.t($data.detail.content),
    e: common_vendor.o((...args) => $options.goRecite && $options.goRecite(...args))
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-6ec0574f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/detail.js.map
