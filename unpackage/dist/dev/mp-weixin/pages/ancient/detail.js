"use strict";
const common_vendor = require("../../common/vendor.js");
const uni_modules_uniIdPages_common_store = require("../../uni_modules/uni-id-pages/common/store.js");
const db = common_vendor.tr.database();
const _sfc_main = {
  data() {
    return {
      id: "",
      detail: {},
      isFavorited: false,
      togglingFavorite: false
    };
  },
  onLoad(options) {
    this.id = options.id;
    this.loadDetail();
    this.checkFavorite();
  },
  onShow() {
    this.checkFavorite();
  },
  computed: {
    hasLogin() {
      return uni_modules_uniIdPages_common_store.store.hasLogin;
    }
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
    },
    async checkFavorite() {
      if (!this.id || !this.hasLogin) {
        this.isFavorited = false;
        return;
      }
      try {
        const res = await common_vendor.tr.callFunction({
          name: "gw_favorite",
          data: {
            action: "check",
            data: { text_id: this.id }
          }
        });
        const result = res && res.result || {};
        if (result.code === 0) {
          this.isFavorited = !!(result.data && result.data.favorited);
        }
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/ancient/detail.vue:120", "检查收藏状态失败", e);
      }
    },
    async toggleFavorite() {
      if (!this.hasLogin) {
        common_vendor.index.showToast({ title: "请先登录", icon: "none" });
        return;
      }
      if (!this.id || this.togglingFavorite)
        return;
      this.togglingFavorite = true;
      try {
        const res = await common_vendor.tr.callFunction({
          name: "gw_favorite",
          data: {
            action: "toggle",
            data: {
              text_id: this.id,
              text_title: this.detail.title || "",
              text_author: this.detail.author || "",
              text_dynasty: this.detail.dynasty || ""
            }
          }
        });
        const result = res && res.result || {};
        if (result.code !== 0) {
          throw new Error(result.msg || "操作失败");
        }
        this.isFavorited = !!(result.data && result.data.favorited);
        common_vendor.index.showToast({
          title: this.isFavorited ? "已收藏" : "已取消收藏",
          icon: "none"
        });
      } catch (e) {
        common_vendor.index.showToast({
          title: e && e.message || "操作失败",
          icon: "none"
        });
      } finally {
        this.togglingFavorite = false;
      }
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
    a: common_vendor.p({
      type: $data.isFavorited ? "star-filled" : "star",
      size: "16",
      color: $data.isFavorited ? "#d97706" : "#b45309"
    }),
    b: common_vendor.t($data.isFavorited ? "已收藏" : "收藏"),
    c: common_vendor.o((...args) => $options.toggleFavorite && $options.toggleFavorite(...args)),
    d: common_vendor.t($data.detail.title),
    e: common_vendor.t($data.detail.dynasty),
    f: common_vendor.t($data.detail.author),
    g: common_vendor.t($data.detail.content),
    h: common_vendor.p({
      type: "eye",
      size: "18",
      color: "#4f46e5"
    }),
    i: common_vendor.o((...args) => $options.goRead && $options.goRead(...args)),
    j: common_vendor.p({
      type: "mic",
      size: "18",
      color: "#0b57d0"
    }),
    k: common_vendor.o((...args) => $options.goRecite && $options.goRecite(...args)),
    l: common_vendor.p({
      type: "compose",
      size: "18",
      color: "#2563eb"
    }),
    m: common_vendor.o((...args) => $options.goDictation && $options.goDictation(...args))
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-6ec0574f"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/detail.js.map
