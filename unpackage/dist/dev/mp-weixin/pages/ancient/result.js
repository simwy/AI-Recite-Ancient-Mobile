"use strict";
const common_vendor = require("../../common/vendor.js");
const common_diff = require("../../common/diff.js");
const _sfc_main = {
  data() {
    return {
      id: "",
      textData: {},
      recognizedText: "",
      hintCount: 0,
      diffResult: [],
      accuracy: 0,
      saved: false
    };
  },
  onLoad(options) {
    this.id = options.id;
    const app = getApp();
    const result = app.globalData && app.globalData.reciteResult;
    if (result) {
      this.textData = result.textData;
      this.recognizedText = result.recognizedText;
      this.hintCount = result.hintCount;
    }
    this.doDiff();
    this.saveRecord();
  },
  methods: {
    doDiff() {
      if (!this.textData.content)
        return;
      this.diffResult = common_diff.diffChars(
        this.textData.content,
        this.recognizedText
      );
      this.accuracy = common_diff.calcAccuracy(this.diffResult);
    },
    async saveRecord() {
      if (this.saved)
        return;
      try {
        await common_vendor.tr.callFunction({
          name: "recite-record",
          data: {
            action: "save",
            data: {
              text_id: this.id,
              text_title: this.textData.title,
              hint_count: this.hintCount,
              recognized_text: this.recognizedText,
              diff_result: this.diffResult,
              accuracy: this.accuracy
            }
          }
        });
        this.saved = true;
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/ancient/result.vue:104", "保存记录失败:", e);
      }
    },
    goReciteAgain() {
      common_vendor.index.redirectTo({
        url: `/pages/ancient/recite?id=${this.id}`
      });
    },
    goHistory() {
      common_vendor.index.switchTab({
        url: "/pages/ancient/history"
      });
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.t($data.textData.title),
    b: common_vendor.t($data.accuracy),
    c: common_vendor.t($data.hintCount),
    d: common_vendor.f($data.diffResult, (item, idx, i0) => {
      return {
        a: common_vendor.t(item.char),
        b: idx,
        c: common_vendor.n("diff-" + item.status)
      };
    }),
    e: $data.recognizedText
  }, $data.recognizedText ? {
    f: common_vendor.t($data.recognizedText)
  } : {}, {
    g: common_vendor.o((...args) => $options.goReciteAgain && $options.goReciteAgain(...args)),
    h: common_vendor.o((...args) => $options.goHistory && $options.goHistory(...args))
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-e8e2eee0"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/result.js.map
