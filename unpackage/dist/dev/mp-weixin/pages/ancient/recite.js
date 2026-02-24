"use strict";
const common_vendor = require("../../common/vendor.js");
const _sfc_main = {
  data() {
    return {
      id: "",
      textData: {},
      started: false,
      recording: false,
      duration: 0,
      durationTimer: null,
      hintCount: 0,
      hintIndex: 0,
      hintCharCount: 0,
      hints: [],
      recorderManager: null
    };
  },
  onLoad(options) {
    this.id = options.id;
    const app = getApp();
    if (app.globalData && app.globalData.currentText) {
      this.textData = app.globalData.currentText;
    }
    this.initRecorder();
  },
  onUnload() {
    clearInterval(this.durationTimer);
    if (this.recording && this.recorderManager) {
      this.recorderManager.stop();
    }
  },
  methods: {
    initRecorder() {
      this.recorderManager = common_vendor.index.getRecorderManager();
      this.recorderManager.onStop((res) => {
        this.recording = false;
        clearInterval(this.durationTimer);
        this.processRecording(res.tempFilePath);
      });
      this.recorderManager.onError((err) => {
        this.recording = false;
        clearInterval(this.durationTimer);
        common_vendor.index.showToast({ title: "录音失败", icon: "none" });
        common_vendor.index.__f__("error", "at pages/ancient/recite.vue:96", "录音错误:", err);
      });
    },
    startRecite() {
      this.started = true;
      this.recording = true;
      this.duration = 0;
      this.durationTimer = setInterval(() => {
        this.duration++;
      }, 1e3);
      this.recorderManager.start({
        format: "mp3",
        sampleRate: 16e3,
        numberOfChannels: 1
      });
    },
    showHint() {
      const paragraphs = this.textData.paragraphs || [];
      if (paragraphs.length === 0)
        return;
      if (this.hintIndex >= paragraphs.length) {
        common_vendor.index.showToast({ title: "已无更多提示", icon: "none" });
        return;
      }
      const currentSentence = paragraphs[this.hintIndex];
      this.hintCharCount++;
      if (this.hintCharCount > currentSentence.length) {
        this.hintIndex++;
        this.hintCharCount = 1;
        if (this.hintIndex >= paragraphs.length) {
          this.hintCount++;
          return;
        }
        const nextSentence = paragraphs[this.hintIndex];
        this.hints.push(nextSentence.slice(0, 1) + "...");
      } else {
        const hintText = currentSentence.slice(0, this.hintCharCount) + "...";
        if (this.hints.length > 0 && this.hintIndex === this.hints.length - 1 + (this.hintCharCount > 1 ? 0 : 1)) {
          const lastIdx = this.hints.length - 1;
          if (lastIdx >= 0) {
            this.hints[lastIdx] = hintText;
            this.hints = [...this.hints];
          }
        } else {
          this.hints.push(hintText);
        }
      }
      this.hintCount++;
    },
    stopRecite() {
      this.recorderManager.stop();
    },
    processRecording(filePath) {
      common_vendor.index.showLoading({ title: "语音识别中..." });
      this.wxSpeechRecognize(filePath);
    },
    appSpeechRecognize(filePath) {
      if (plus.speech) {
        plus.speech.startRecognize({
          engine: "iFly",
          lang: "zh-cn",
          "userInterface": false,
          nbest: 1
        }, (text) => {
          common_vendor.index.hideLoading();
          this.goResult(text);
        }, (err) => {
          common_vendor.index.hideLoading();
          common_vendor.index.showToast({ title: "识别失败", icon: "none" });
          common_vendor.index.__f__("error", "at pages/ancient/recite.vue:173", "语音识别错误:", err);
        });
      }
    },
    wxSpeechRecognize(filePath) {
      const plugin = requirePlugin("WechatSI");
      plugin.manager = plugin.getRecordRecognitionManager();
      common_vendor.index.uploadFile({
        url: "",
        // 需配置实际地址或使用插件
        filePath,
        name: "file",
        success: () => {
          common_vendor.index.hideLoading();
          this.goResult("");
        },
        fail: () => {
          common_vendor.index.hideLoading();
          this.goResult("");
        }
      });
    },
    goResult(recognizedText) {
      getApp().globalData = getApp().globalData || {};
      getApp().globalData.reciteResult = {
        textData: this.textData,
        recognizedText,
        hintCount: this.hintCount
      };
      common_vendor.index.redirectTo({
        url: `/pages/ancient/result?id=${this.id}`
      });
    },
    formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
  }
};
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.t($data.textData.title),
    b: common_vendor.t($data.textData.dynasty),
    c: common_vendor.t($data.textData.author),
    d: $data.hints.length > 0
  }, $data.hints.length > 0 ? {
    e: common_vendor.f($data.hints, (h, idx, i0) => {
      return {
        a: common_vendor.t(h),
        b: idx
      };
    })
  } : {}, {
    f: $data.recording
  }, $data.recording ? {
    g: common_vendor.t($options.formatTime($data.duration))
  } : !$data.started ? {} : {}, {
    h: !$data.started,
    i: !$data.started
  }, !$data.started ? {
    j: common_vendor.o((...args) => $options.startRecite && $options.startRecite(...args))
  } : {}, {
    k: $data.recording
  }, $data.recording ? {
    l: common_vendor.t($data.hintCount),
    m: common_vendor.o((...args) => $options.showHint && $options.showHint(...args)),
    n: common_vendor.o((...args) => $options.stopRecite && $options.stopRecite(...args))
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-8a14f31b"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/recite.js.map
