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
      recorderManager: null,
      socketTask: null,
      asrConfig: null,
      taskId: "",
      taskStarted: false,
      taskFinished: false,
      frameQueue: [],
      finalSentences: [],
      partialSentence: "",
      realtimeText: "",
      stopping: false,
      waitTaskFinishedResolver: null,
      useWebRecorder: false,
      webAudioContext: null,
      webMediaStream: null,
      webScriptProcessor: null,
      h5MediaRecorder: null,
      h5AudioChunks: [],
      h5StopPromiseResolver: null
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
    if (this.recording) {
      if (this.useWebRecorder) {
        this.stopWebRecorder();
      } else if (this.recorderManager) {
        this.recorderManager.stop();
      }
    }
    this.closeSocket();
    this.destroyWebRecorder();
  },
  methods: {
    initRecorder() {
      if (typeof common_vendor.index.getRecorderManager !== "function") {
        this.useWebRecorder = true;
        return;
      }
      try {
        this.recorderManager = common_vendor.index.getRecorderManager();
      } catch (e) {
        this.useWebRecorder = true;
        return;
      }
      if (!this.recorderManager) {
        this.useWebRecorder = true;
        return;
      }
      this.recorderManager.onFrameRecorded((res) => {
        this.sendAudioFrame(res.frameBuffer);
      });
      this.recorderManager.onStop((res) => {
        this.recording = false;
        clearInterval(this.durationTimer);
        this.handleRecorderStop();
      });
      this.recorderManager.onError((err) => {
        this.recording = false;
        clearInterval(this.durationTimer);
        this.closeSocket();
        common_vendor.index.showToast({ title: "录音失败", icon: "none" });
        common_vendor.index.__f__("error", "at pages/ancient/recite.vue:154", "录音错误:", err);
      });
    },
    async startRecite() {
      if (this.recording)
        return;
      try {
        this.resetRealtimeState();
        await this.loadAsrConfig();
        await this.openSocket();
        this.started = true;
        this.recording = true;
        this.stopping = false;
        this.duration = 0;
        this.durationTimer = setInterval(() => {
          this.duration++;
        }, 1e3);
        if (this.useWebRecorder) {
          await this.startWebRecorder();
        } else {
          this.recorderManager.start({
            format: this.asrConfig.format || "pcm",
            sampleRate: this.asrConfig.sampleRate || 16e3,
            numberOfChannels: 1,
            frameSize: 5
          });
        }
      } catch (err) {
        this.closeSocket();
        common_vendor.index.showToast({ title: err.message || "启动识别失败", icon: "none", duration: 3e3 });
        common_vendor.index.__f__("error", "at pages/ancient/recite.vue:197", "启动实时识别失败:", err);
      }
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
      this.stopping = true;
      if (this.useWebRecorder) {
        this.recording = false;
        clearInterval(this.durationTimer);
        this.handleRecorderStop();
        this.stopWebRecorder();
      } else if (this.recorderManager) {
        this.recorderManager.stop();
      }
    },
    async handleRecorderStop() {
      if (!this.stopping)
        return;
      common_vendor.index.showLoading({ title: "正在结束识别..." });
      await this.finishTask();
      common_vendor.index.hideLoading();
      this.goResult(this.realtimeText);
    },
    async loadAsrConfig() {
      const res = await common_vendor.tr.callFunction({
        name: "asr-config"
      });
      const result = res.result || {};
      if (result.code !== 0 || !result.data) {
        throw new Error(result.msg || "获取语音配置失败");
      }
      this.asrConfig = result.data;
    },
    openSocket() {
      return new Promise((resolve, reject) => {
        let socketUrl = this.asrConfig.wsUrl;
        let socketHeader = {
          Authorization: `${this.asrConfig.tokenType || "bearer"} ${this.asrConfig.temporaryToken}`
        };
        this.taskId = this.createTaskId();
        this.socketTask = common_vendor.index.connectSocket({
          url: socketUrl,
          header: socketHeader,
          complete: () => {
          }
        });
        this.socketTask.onOpen(() => {
          this.sendRunTask();
          resolve();
        });
        this.socketTask.onMessage(({ data }) => {
          this.handleSocketMessage(data);
        });
        this.socketTask.onError((err) => {
          reject(err);
        });
        this.socketTask.onClose(() => {
          this.socketTask = null;
        });
      });
    },
    sendRunTask() {
      if (!this.socketTask)
        return;
      const payload = {
        header: {
          action: "run-task",
          task_id: this.taskId,
          streaming: "duplex"
        },
        payload: {
          task_group: "audio",
          task: "asr",
          function: "recognition",
          model: this.asrConfig.model || "paraformer-realtime-v2",
          parameters: {
            format: this.asrConfig.format || "pcm",
            sample_rate: this.asrConfig.sampleRate || 16e3,
            language_hints: this.asrConfig.languageHints || ["zh"],
            punctuation_prediction_enabled: this.asrConfig.punctuationPredictionEnabled !== false,
            inverse_text_normalization_enabled: this.asrConfig.inverseTextNormalizationEnabled !== false
          },
          input: {}
        }
      };
      this.socketTask.send({
        data: JSON.stringify(payload)
      });
    },
    sendAudioFrame(frameBuffer) {
      if (!frameBuffer || !this.socketTask)
        return;
      if (!this.taskStarted) {
        this.frameQueue.push(frameBuffer);
        return;
      }
      this.socketTask.send({
        data: frameBuffer
      });
    },
    flushFrameQueue() {
      if (!this.socketTask || !this.taskStarted || this.frameQueue.length === 0)
        return;
      while (this.frameQueue.length > 0) {
        const frame = this.frameQueue.shift();
        this.socketTask.send({ data: frame });
      }
    },
    handleSocketMessage(rawData) {
      const decoded = this.decodeSocketData(rawData);
      if (!decoded)
        return;
      let message = decoded;
      try {
        message = JSON.parse(decoded);
      } catch (e) {
        return;
      }
      const header = message.header || {};
      const event = header.event;
      if (event === "task-started") {
        this.taskStarted = true;
        this.flushFrameQueue();
        return;
      }
      if (event === "result-generated") {
        this.handleRecognizedSentence(message.payload && message.payload.output && message.payload.output.sentence);
        return;
      }
      if (event === "task-finished") {
        this.taskFinished = true;
        if (this.waitTaskFinishedResolver) {
          this.waitTaskFinishedResolver();
          this.waitTaskFinishedResolver = null;
        }
        this.closeSocket();
        return;
      }
      if (event === "task-failed") {
        common_vendor.index.__f__("error", "at pages/ancient/recite.vue:402", "任务失败:", header.error_message || "未知错误");
        if (this.waitTaskFinishedResolver) {
          this.waitTaskFinishedResolver();
          this.waitTaskFinishedResolver = null;
        }
        this.closeSocket();
      }
    },
    decodeSocketData(rawData) {
      if (typeof rawData === "string")
        return rawData;
      if (!(rawData instanceof ArrayBuffer))
        return "";
      if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(rawData);
      }
      const bytes = new Uint8Array(rawData);
      let result = "";
      for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
      }
      return decodeURIComponent(escape(result));
    },
    handleRecognizedSentence(sentence) {
      if (!sentence || sentence.heartbeat)
        return;
      const text = sentence.text || "";
      if (!text)
        return;
      if (sentence.sentence_end) {
        this.finalSentences.push(text);
        this.partialSentence = "";
      } else {
        this.partialSentence = text;
      }
      this.realtimeText = `${this.finalSentences.join("")}${this.partialSentence}`;
    },
    finishTask() {
      return new Promise((resolve) => {
        if (!this.socketTask) {
          resolve();
          return;
        }
        if (this.taskStarted && !this.taskFinished) {
          this.socketTask.send({
            data: JSON.stringify({
              header: {
                action: "finish-task",
                task_id: this.taskId,
                streaming: "duplex"
              },
              payload: {
                input: {}
              }
            })
          });
        }
        const timer = setTimeout(() => {
          this.closeSocket();
          resolve();
        }, 5e3);
        this.waitTaskFinishedResolver = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    },
    closeSocket() {
      if (!this.socketTask)
        return;
      try {
        this.socketTask.close({});
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/ancient/recite.vue:477", "关闭 socket 失败:", e);
      }
      this.socketTask = null;
    },
    resetRealtimeState() {
      this.taskId = "";
      this.taskStarted = false;
      this.taskFinished = false;
      this.frameQueue = [];
      this.finalSentences = [];
      this.partialSentence = "";
      this.realtimeText = "";
      this.waitTaskFinishedResolver = null;
    },
    createTaskId() {
      return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    },
    buildDefaultRelayWsUrl() {
      return "";
    },
    async startWebRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("当前浏览器不支持录音");
      }
      const targetSampleRate = this.asrConfig.sampleRate || 16e3;
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.webAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.webAudioContext.createMediaStreamSource(this.webMediaStream);
      this.webScriptProcessor = this.webAudioContext.createScriptProcessor(4096, 1, 1);
      this.webScriptProcessor.onaudioprocess = (event) => {
        if (!this.recording || !this.socketTask)
          return;
        const inputData = event.inputBuffer.getChannelData(0);
        const pcmBuffer = this.convertFloat32To16kPcm(inputData, this.webAudioContext.sampleRate, targetSampleRate);
        if (pcmBuffer && pcmBuffer.byteLength > 0) {
          this.sendAudioFrame(pcmBuffer);
        }
      };
      source.connect(this.webScriptProcessor);
      this.webScriptProcessor.connect(this.webAudioContext.destination);
    },
    async startH5PcmRecorder() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("当前浏览器不支持录音");
      }
      if (typeof MediaRecorder === "undefined") {
        throw new Error("当前浏览器不支持 MediaRecorder");
      }
      this.h5AudioChunks = [];
      this.webMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.h5MediaRecorder = new MediaRecorder(this.webMediaStream, {
        mimeType: "audio/webm"
      });
      this.h5MediaRecorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          this.h5AudioChunks.push(evt.data);
        }
      };
      this.h5MediaRecorder.onstop = async () => {
        if (!this.stopping)
          return;
        try {
          common_vendor.index.showLoading({ title: "语音识别中..." });
          const audioBlob = new Blob(this.h5AudioChunks, { type: "audio/webm" });
          const audioBase64 = await this.blobToBase64(audioBlob);
          const callRes = await common_vendor.tr.callFunction({
            name: "asr-file-recognize",
            data: {
              audioBase64,
              format: "webm"
            }
          });
          const result = callRes.result || {};
          if (result.code !== 0) {
            throw new Error(result.msg || "识别失败");
          }
          this.realtimeText = result.data && result.data.text || "";
          this.goResult(this.realtimeText);
        } catch (error) {
          common_vendor.index.showToast({ title: error.message || "识别失败", icon: "none" });
          common_vendor.index.__f__("error", "at pages/ancient/recite.vue:567", "H5 文件识别失败:", error);
        } finally {
          common_vendor.index.hideLoading();
          this.cleanupH5PcmRecorder();
          if (this.h5StopPromiseResolver) {
            this.h5StopPromiseResolver();
            this.h5StopPromiseResolver = null;
          }
        }
      };
      this.h5MediaRecorder.start();
    },
    async stopH5PcmRecorder() {
      if (!this.h5MediaRecorder || this.h5MediaRecorder.state === "inactive") {
        this.cleanupH5PcmRecorder();
        return;
      }
      await new Promise((resolve) => {
        this.h5StopPromiseResolver = resolve;
        this.h5MediaRecorder.stop();
      });
    },
    cleanupH5PcmRecorder() {
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach((track) => track.stop());
      }
      this.webMediaStream = null;
      this.h5MediaRecorder = null;
      this.h5AudioChunks = [];
      this.h5StopPromiseResolver = null;
    },
    blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result || "";
          const base64 = String(result).split(",")[1] || "";
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
    stopWebRecorder() {
      if (this.webScriptProcessor) {
        this.webScriptProcessor.disconnect();
        this.webScriptProcessor.onaudioprocess = null;
      }
      if (this.webMediaStream) {
        this.webMediaStream.getTracks().forEach((track) => track.stop());
      }
      if (this.webAudioContext) {
        this.webAudioContext.close();
      }
      this.webScriptProcessor = null;
      this.webMediaStream = null;
      this.webAudioContext = null;
    },
    destroyWebRecorder() {
      this.stopWebRecorder();
    },
    convertFloat32To16kPcm(float32Array, inputSampleRate, outputSampleRate) {
      if (!float32Array || float32Array.length === 0)
        return null;
      const ratio = inputSampleRate / outputSampleRate;
      const outputLength = Math.max(1, Math.floor(float32Array.length / ratio));
      const result = new Int16Array(outputLength);
      let offsetResult = 0;
      let offsetBuffer = 0;
      while (offsetResult < outputLength) {
        const nextOffsetBuffer = Math.floor((offsetResult + 1) * ratio);
        let accum = 0;
        let count = 0;
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < float32Array.length; i++) {
          accum += float32Array[i];
          count++;
        }
        const sample = count > 0 ? accum / count : 0;
        const clamped = Math.max(-1, Math.min(1, sample));
        result[offsetResult] = clamped < 0 ? clamped * 32768 : clamped * 32767;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
      }
      return result.buffer;
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
    i: $data.started
  }, $data.started ? {
    j: common_vendor.t($data.realtimeText || "等待识别结果...")
  } : {}, {
    k: !$data.started
  }, !$data.started ? {
    l: common_vendor.o((...args) => $options.startRecite && $options.startRecite(...args))
  } : {}, {
    m: $data.recording
  }, $data.recording ? {
    n: common_vendor.o((...args) => $options.stopRecite && $options.stopRecite(...args))
  } : {});
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-8a14f31b"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ancient/recite.js.map
