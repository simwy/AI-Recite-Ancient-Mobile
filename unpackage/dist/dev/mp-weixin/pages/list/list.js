"use strict";
const common_vendor = require("../../common/vendor.js");
const uni_modules_jsonGps_js_sdk_gps = require("../../uni_modules/json-gps/js_sdk/gps.js");
let cdbRef;
const statusBar = () => "../../uni_modules/uni-nav-bar/components/uni-nav-bar/uni-status-bar.js";
const gps = new uni_modules_jsonGps_js_sdk_gps.Gps(), db = common_vendor.tr.database();
const _sfc_main = {
  components: {
    statusBar
  },
  computed: {
    inputPlaceholder(e) {
      if (common_vendor.index.getStorageSync("CURRENT_LANG") == "en") {
        return "Please enter the search content";
      } else {
        return "请输入搜索内容";
      }
    },
    colList() {
      return [
        db.collection("opendb-news-articles").where(this.where).field("avatar,title,last_modify_date,user_id").getTemp(),
        db.collection("uni-id-users").field("_id,nickname").getTemp()
      ];
    }
  },
  data() {
    return {
      where: '"article_status" == 1',
      keyword: "",
      showRefresh: false,
      listHight: 0
    };
  },
  watch: {
    keyword(keyword, oldValue) {
      let where = '"article_status" == 1 ';
      if (keyword) {
        this.where = where + `&& /${keyword}/.test(title)`;
      } else {
        this.where = where;
      }
    }
  },
  async onReady() {
    this.listHight = "auto";
    cdbRef = this.$refs.udb;
  },
  async onShow() {
    this.keyword = getApp().globalData.searchText;
    getApp().globalData.searchText = "";
    await gps.getLocation({
      geocode: true
    });
  },
  methods: {
    searchClick(e) {
      common_vendor.index.hideKeyboard();
      common_vendor.index.navigateTo({
        url: "/pages/list/search/search",
        animationType: "fade-in"
      });
    },
    retry() {
      this.refresh();
    },
    refresh() {
      cdbRef.loadData({
        clear: true
      }, () => {
        common_vendor.index.stopPullDownRefresh();
        common_vendor.index.__f__("log", "at pages/list/list.nvue:157", "end");
      });
      common_vendor.index.__f__("log", "at pages/list/list.nvue:159", "refresh");
    },
    loadMore() {
      cdbRef.loadMore();
    },
    onqueryerror(e) {
      common_vendor.index.__f__("error", "at pages/list/list.nvue:165", e);
    },
    onpullingdown(e) {
      common_vendor.index.__f__("log", "at pages/list/list.nvue:168", e);
      this.showRefresh = true;
      if (e.pullingDistance > 100) {
        this.refresh();
      }
    }
  },
  onPullDownRefresh() {
    this.refresh();
  },
  onReachBottom() {
    this.loadMore();
  }
};
if (!Array) {
  const _component_statusBar = common_vendor.resolveComponent("statusBar");
  const _easycom_uni_search_bar2 = common_vendor.resolveComponent("uni-search-bar");
  const _easycom_uni_dateformat2 = common_vendor.resolveComponent("uni-dateformat");
  const _easycom_uni_list_item2 = common_vendor.resolveComponent("uni-list-item");
  const _easycom_uni_load_state2 = common_vendor.resolveComponent("uni-load-state");
  const _easycom_uni_list2 = common_vendor.resolveComponent("uni-list");
  const _easycom_unicloud_db2 = common_vendor.resolveComponent("unicloud-db");
  (_component_statusBar + _easycom_uni_search_bar2 + _easycom_uni_dateformat2 + _easycom_uni_list_item2 + _easycom_uni_load_state2 + _easycom_uni_list2 + _easycom_unicloud_db2)();
}
const _easycom_uni_search_bar = () => "../../uni_modules/uni-search-bar/components/uni-search-bar/uni-search-bar.js";
const _easycom_uni_dateformat = () => "../../uni_modules/uni-dateformat/components/uni-dateformat/uni-dateformat.js";
const _easycom_uni_list_item = () => "../../uni_modules/uni-list/components/uni-list-item/uni-list-item.js";
const _easycom_uni_load_state = () => "../../components/uni-load-state/uni-load-state.js";
const _easycom_uni_list = () => "../../uni_modules/uni-list/components/uni-list/uni-list.js";
const _easycom_unicloud_db = () => "../../node-modules/@dcloudio/uni-components/lib/unicloud-db/unicloud-db.js";
if (!Math) {
  (_easycom_uni_search_bar + _easycom_uni_dateformat + _easycom_uni_list_item + _easycom_uni_load_state + _easycom_uni_list + _easycom_unicloud_db)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return {
    a: common_vendor.sr("searchBar", "96c6bf44-1"),
    b: common_vendor.o(($event) => $data.keyword = $event),
    c: common_vendor.p({
      radius: "100",
      cancelButton: "none",
      disabled: true,
      placeholder: $options.inputPlaceholder,
      modelValue: $data.keyword
    }),
    d: common_vendor.o((...args) => $options.searchClick && $options.searchClick(...args)),
    e: common_vendor.w(({
      data,
      pagination,
      hasMore,
      loading,
      error,
      options
    }, s0, i0) => {
      return {
        a: common_vendor.f(data, (item, index, i1) => {
          return {
            a: item.avatar,
            b: common_vendor.t(item.title),
            c: common_vendor.t(item.user_id[0] ? item.user_id[0].nickname : ""),
            d: "96c6bf44-5-" + i0 + "-" + i1 + "," + ("96c6bf44-4-" + i0 + "-" + i1),
            e: common_vendor.p({
              date: item.last_modify_date,
              format: "yyyy-MM-dd",
              threshold: [6e4, 2592e6]
            }),
            f: index,
            g: "96c6bf44-4-" + i0 + "-" + i1 + "," + ("96c6bf44-3-" + i0),
            h: common_vendor.p({
              to: "/pages/list/detail?id=" + item._id + "&title=" + item.title
            })
          };
        }),
        b: "96c6bf44-6-" + i0 + "," + ("96c6bf44-3-" + i0),
        c: common_vendor.p({
          state: {
            data,
            pagination,
            hasMore,
            loading,
            error
          }
        }),
        d: "96c6bf44-3-" + i0 + ",96c6bf44-2",
        e: i0,
        f: s0
      };
    }, {
      name: "d",
      path: "e",
      vueId: "96c6bf44-2"
    }),
    f: common_vendor.o($options.refresh),
    g: common_vendor.o($options.loadMore),
    h: $data.listHight,
    i: common_vendor.p({
      border: false
    }),
    j: common_vendor.sr("udb", "96c6bf44-2"),
    k: common_vendor.o($options.onqueryerror),
    l: common_vendor.p({
      collection: $options.colList,
      ["page-size"]: 10
    })
  };
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-96c6bf44"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/list/list.js.map
