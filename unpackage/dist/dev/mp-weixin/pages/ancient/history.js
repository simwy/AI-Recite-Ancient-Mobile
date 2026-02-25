"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  data() {
    return {
      list: [],
      loading: false,
      page: 1,
      total: 0,
      expandedId: "",
      deletingId: ""
    };
  },
  onShow() {
    this.page = 1;
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
    async loadData(append = false) {
      this.loading = true;
      try {
        const res = await common_vendor.tr.callFunction({
          name: "recite-record",
          data: {
            action: "list",
            data: { page: this.page, pageSize: 20 }
          }
        });
        const result = res && res.result || {};
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || "加载失败");
        }
        const { list, total } = result.data;
        this.list = append ? [...this.list, ...list] : list;
        this.total = total;
      } catch (e) {
        common_vendor.index.showToast({
          title: e && e.message || "加载失败",
          icon: "none"
        });
      } finally {
        this.loading = false;
      }
    },
    toggleDetail(id) {
      this.expandedId = this.expandedId === id ? "" : id;
    },
    async confirmDelete(item) {
      if (!item || !item._id || this.deletingId)
        return;
      const modalRes = await new Promise((resolve) => {
        common_vendor.index.showModal({
          title: "删除记录",
          content: "确定删除这条背诵记录吗？删除后不可恢复。",
          confirmText: "删除",
          confirmColor: "#f5222d",
          success: resolve,
          fail: () => resolve({ confirm: false })
        });
      });
      if (!modalRes.confirm)
        return;
      this.deleteRecord(item._id);
    },
    async deleteRecord(id) {
      this.deletingId = id;
      try {
        const res = await common_vendor.tr.callFunction({
          name: "recite-record",
          data: {
            action: "delete",
            data: { id }
          }
        });
        const result = res && res.result || {};
        if (result.code !== 0) {
          throw new Error(result.msg || "删除失败");
        }
        this.list = this.list.filter((item) => item._id !== id);
        this.total = Math.max(0, this.total - 1);
        if (this.expandedId === id) {
          this.expandedId = "";
        }
        common_vendor.index.showToast({
          title: "删除成功",
          icon: "success"
        });
      } catch (e) {
        common_vendor.index.showToast({
          title: e && e.message || "删除失败",
          icon: "none"
        });
      } finally {
        this.deletingId = "";
      }
    },
    formatTime(ts) {
      if (!ts)
        return "";
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: $data.list.length > 0
  }, $data.list.length > 0 ? {
    b: common_vendor.f($data.list, (item, k0, i0) => {
      return common_vendor.e({
        a: common_vendor.t(item.text_title),
        b: common_vendor.t(item.accuracy || 0),
        c: common_vendor.o(($event) => $options.confirmDelete(item), item._id),
        d: common_vendor.t(item.hint_count),
        e: common_vendor.t($options.formatTime(item.created_at)),
        f: $data.expandedId === item._id
      }, $data.expandedId === item._id ? common_vendor.e({
        g: common_vendor.f(item.diff_result || [], (d, idx, i1) => {
          return {
            a: common_vendor.t(d.char),
            b: idx,
            c: common_vendor.n("diff-" + d.status)
          };
        }),
        h: item.recognized_text
      }, item.recognized_text ? {
        i: common_vendor.t(item.recognized_text)
      } : {}) : {}, {
        j: item._id,
        k: common_vendor.o(($event) => $options.toggleDetail(item._id), item._id)
      });
    })
  } : !$data.loading ? {} : {}, {
    c: !$data.loading,
    d: $data.loading
  }, $data.loading ? {} : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-d063c3ac"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/history.js.map
