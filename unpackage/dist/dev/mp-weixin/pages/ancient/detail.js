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
        const res = await db.collection("gw-ancient-texts").doc(this.id).get();
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
    },
    goDictation() {
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.currentText = this.detail;
      common_vendor.index.navigateTo({
        url: `/pages/ancient/dictation?id=${this.id}`
      });
    },
    goRead() {
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.currentText = this.detail;
      common_vendor.index.navigateTo({
        url: `/pages/ancient/read?id=${this.id}`
      });
    }
  }
};
if (!Array) {
  const _easycom_uni_icons2 = common_vendor.resolveComponent("uni-icons");
  _easycom_uni_icons2();
}
const _easycom_uni_icons = () => "../../uni_modules/uni-icons/components/uni-icons/uni-icons.js";
if (!Math) {
  _easycom_uni_icons();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.t($data.detail.title),
    b: common_vendor.t($data.detail.dynasty),
    c: common_vendor.t($data.detail.author),
    d: common_vendor.t($data.detail.content),
    e: common_vendor.p({
      type: "eye",
      size: "18",
      color: "#4f46e5"
    }),
    f: common_vendor.o((...args) => $options.goRead && $options.goRead(...args)),
    g: common_vendor.p({
      type: "mic",
      size: "18",
      color: "#0b57d0"
    }),
    h: common_vendor.o((...args) => $options.goRecite && $options.goRecite(...args)),
    i: common_vendor.p({
      type: "compose",
      size: "18",
      color: "#2563eb"
    }),
    j: common_vendor.o((...args) => $options.goDictation && $options.goDictation(...args))
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-6ec0574f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/detail.js.map
