"use strict";
const common_vendor = require("../../common/vendor.js");
const common_assets = require("../../common/assets.js");
const _sfc_main = {
  data() {
    return {
      gridList: [],
      current: 0,
      hasLogin: false
    };
  },
  onShow() {
    this.hasLogin = common_vendor.tr.getCurrentUserInfo().tokenExpired > Date.now();
  },
  onLoad() {
    let gridList = [];
    for (var i = 0; i < 3; i++) {
      gridList.push(this.$t("grid.visibleToAll"));
    }
    for (var i = 0; i < 3; i++) {
      gridList.push(this.$t("grid.invisibleToTourists"));
    }
    for (var i = 0; i < 3; i++) {
      gridList.push(this.$t("grid.adminVisible"));
    }
    this.gridList = gridList;
  },
  methods: {
    change(e) {
      common_vendor.index.showToast({
        title: this.$t("grid.clickTip") + ` ${e.detail.index + 1} ` + this.$t("grid.clickTipGrid"),
        icon: "none"
      });
    },
    /**
     * banner加载后触发的回调
     */
    onqueryload(data) {
    },
    changeSwiper(e) {
      this.current = e.detail.current;
    },
    /**
     * 点击banner的处理
     */
    clickBannerItem(item) {
      if (item.open_url) {
        common_vendor.index.navigateTo({
          url: "/uni_modules/uni-id-pages/pages/common/webview/webview?url=" + item.open_url + "&title=" + item.title,
          success: (res) => {
          },
          fail: () => {
          },
          complete: () => {
          }
        });
      }
    }
  }
};
if (!Array) {
  const _easycom_unicloud_db2 = common_vendor.resolveComponent("unicloud-db");
  const _easycom_uni_grid_item2 = common_vendor.resolveComponent("uni-grid-item");
  const _easycom_uni_grid2 = common_vendor.resolveComponent("uni-grid");
  (_easycom_unicloud_db2 + _easycom_uni_grid_item2 + _easycom_uni_grid2)();
}
const _easycom_unicloud_db = () => "../../node-modules/@dcloudio/uni-components/lib/unicloud-db/unicloud-db.js";
const _easycom_uni_grid_item = () => "../../uni_modules/uni-grid/components/uni-grid-item/uni-grid-item.js";
const _easycom_uni_grid = () => "../../uni_modules/uni-grid/components/uni-grid/uni-grid.js";
if (!Math) {
  (_easycom_unicloud_db + _easycom_uni_grid_item + _easycom_uni_grid)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.w(({
      data,
      loading,
      error,
      options
    }, s0, i0) => {
      return common_vendor.e({
        a: !(loading || data.length)
      }, !(loading || data.length) ? {
        b: common_assets._imports_0
      } : {
        c: common_vendor.f(data, (item, index, i1) => {
          return {
            a: item.bannerfile.url,
            b: common_vendor.o(($event) => $options.clickBannerItem(item), item._id),
            c: item._id
          };
        }),
        d: common_vendor.o((...args) => $options.changeSwiper && $options.changeSwiper(...args)),
        e: $data.current
      }, {
        f: i0,
        g: s0
      });
    }, {
      name: "d",
      path: "a",
      vueId: "0adffcc4-0"
    }),
    b: common_vendor.sr("bannerdb", "0adffcc4-0"),
    c: common_vendor.o($options.onqueryload),
    d: common_vendor.p({
      collection: "opendb-banner",
      field: "_id,bannerfile,open_url,title"
    }),
    e: common_vendor.t(_ctx.$t("grid.grid")),
    f: common_vendor.f($data.gridList, (item, i, i0) => {
      return common_vendor.e({
        a: i < 3 || i > 2 && i < 6 && $data.hasLogin || i > 5 && _ctx.uniIDHasRole("admin")
      }, i < 3 || i > 2 && i < 6 && $data.hasLogin || i > 5 && _ctx.uniIDHasRole("admin") ? {
        b: common_vendor.t(i + 1),
        c: common_vendor.t(item),
        d: i,
        e: "0adffcc4-2-" + i0 + ",0adffcc4-1",
        f: common_vendor.p({
          index: i
        })
      } : {});
    }),
    g: common_vendor.o($options.change),
    h: common_vendor.p({
      column: 3,
      highlight: true
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/grid/grid.js.map
