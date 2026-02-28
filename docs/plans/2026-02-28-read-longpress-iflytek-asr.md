# Read 页长按朗读实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `read.vue` 实现长按实时朗读、逐句匹配、正误高亮、练习记录落库，并接入讯飞实时语音转写大模型接口。

**Architecture:** 复用现有分句和逐字 diff 能力，在 `read.vue` 内新增“按住说话”录音链路。云函数 `gw_asr-config` 增加讯飞 provider 的签名 URL 下发，前端通过 WebSocket 发送 PCM 帧并解析返回结果。每次长按结束后做句子匹配、跳转定位、高亮标注，并调用 `gw_recite-record` 保存练习结果与遍数。

**Tech Stack:** uni-app(Vue3 options API)、uniCloud 云函数、WebSocket、讯飞 RTASR LLM、`common/diff.js`

---

### Task 1: 讯飞配置与签名下发

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/common/config/index.js`
- Modify: `uniCloud-alipay/cloudfunctions/gw_asr-config/index.js`

**Step 1:** 在配置文件新增/调整 `iflytekAsr` 字段（endpoint、appId、accessKeyId、accessKeySecret、lang、audioEncode、sampleRate、帧参数）。

**Step 2:** 在 `gw_asr-config` 增加 `provider=iflytek-rtasr` 分支，按文档生成签名 URL 并返回给前端。

**Step 3:** 保持默认 provider 仍走现有阿里云逻辑，避免回归影响 `recite.vue`。

### Task 2: read.vue 长按实时朗读与逐句定位

**Files:**
- Modify: `pages/ancient/read.vue`

**Step 1:** 新增 UI 交互（句子项支持 `touchstart/touchend/touchcancel`），显示长按状态和识别状态。

**Step 2:** 新增长按录音生命周期：拉取 asr 配置、建连、发送 PCM、发送 end、等待最终结果。

**Step 3:** 解析讯飞实时结果，聚合实时文本，结束后执行“最佳句匹配 + 自动滚动到匹配句”。

**Step 4:** 对匹配句执行逐字 diff，绿色正确/红色错误，并显示本句准确率与第几遍。

### Task 3: 练习记录保存与字段扩展

**Files:**
- Modify: `uniCloud-alipay/cloudfunctions/gw_recite-record/index.js`
- Modify: `uniCloud-alipay/database/gw-recite-records.schema.json`
- Modify: `pages/ancient/read.vue`

**Step 1:** 扩展 `save` 入参，支持 `practice_mode/sentence_index/sentence_text/attempt_no/wrong_chars/sentence_accuracy`。

**Step 2:** `read.vue` 每次长按结束后落库，并容错未登录或保存失败场景（不阻断主流程）。

**Step 3:** 完成样式收口，确保状态颜色符合需求。

### Task 4: 自检与回归

**Files:**
- Modify: `pages/ancient/read.vue`
- Modify: `uniCloud-alipay/cloudfunctions/gw_asr-config/index.js`
- Modify: `uniCloud-alipay/cloudfunctions/gw_recite-record/index.js`
- Modify: `uniCloud-alipay/database/gw-recite-records.schema.json`

**Step 1:** 运行静态检查（ReadLints）并修复新增问题。

**Step 2:** 手工回归路径：
- `read.vue` 长按一句 -> 看到实时文本 -> 松开后跳到匹配句
- 匹配句显示绿/红字与准确率
- 重复朗读同句，遍数递增
- 历史记录可正常加载（新增字段不破坏旧逻辑）

