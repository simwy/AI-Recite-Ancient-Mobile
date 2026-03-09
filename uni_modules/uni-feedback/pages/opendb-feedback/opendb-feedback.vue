<template>
	<view class="container">
		<view class="form-card">
			<uni-forms ref="form" :value="formData" validate-trigger="submit" err-show-type="toast" label-position="top">
				<uni-forms-item name="content" label="留言内容" required>
					<textarea
						@input="binddata('content', $event.detail.value)"
						class="feedback-textarea"
						v-model="formData.content"
						placeholder="请填写留言内容，如纠错类型与具体内容…"
						trim="right"
					></textarea>
				</uni-forms-item>
				<uni-forms-item name="imgs" label="图片列表">
					<uni-file-picker file-mediatype="image" :limit="6" return-type="array" v-model="formData.imgs">
					</uni-file-picker>
				</uni-forms-item>
				<uni-forms-item name="contact" label="联系人">
					<uni-easyinput v-model="formData.contact" trim="both"></uni-easyinput>
				</uni-forms-item>
				<uni-forms-item name="mobile" label="联系电话">
					<uni-easyinput v-model="formData.mobile" trim="both"></uni-easyinput>
				</uni-forms-item>
			</uni-forms>
		</view>
		<view class="bottom-bar">
			<button type="primary" class="submit-btn" @click="submit">提交</button>
		</view>
	</view>
</template>

<script>
	import {
		validator
	} from '../../js_sdk/validator/opendb-feedback.js';
	import { buildFeedbackContentFromOptions } from '@/common/feedbackHelper.js';

	console.log(validator);
	const db = uniCloud.database();
	const dbCollectionName = 'opendb-feedback';

	function getValidator(fields) {
		let result = {}
		for (let key in validator) {
			if (fields.indexOf(key) > -1) {
				result[key] = validator[key]
			}
		}
		return result
	}

	export default {
		data() {
			let formData = {
				"content": "",
				"imgs": [],
				"contact": "",
				"mobile": ""
			}
			return {
				formData,
				formOptions: {},
				rules: {
					...getValidator(Object.keys(formData))
				}
			}
		},
		onLoad(options) {
			const content = buildFeedbackContentFromOptions(options || {})
			if (content) {
				this.formData.content = content
			}
		},
		onReady() {
			this.$refs.form.setRules(this.rules)
		},
		methods: {
			/**
			 * 触发表单提交
			 */
			submit() {
				uni.showLoading({
					mask: true
				})
				this.$refs.form.validate().then((res) => {
					this.submitForm(res)
				}).catch(() => {
					uni.hideLoading()
				})
			},

			submitForm(value) {
				// 使用 clientDB 提交数据
				db.collection(dbCollectionName).add(value).then((res) => {
					uni.showToast({
						icon: 'none',
						title: '提交成功'
					})
					this.getOpenerEventChannel().emit('refreshData')
					setTimeout(() => uni.navigateBack(), 500)
				}).catch((err) => {
					uni.showModal({
						content: err.message || '请求服务失败',
						showCancel: false
					})
				}).finally(() => {
					uni.hideLoading()
				})
			}
		}
	}
</script>

<style scoped>
	.container {
		min-height: 100vh;
		background: #f5f5f5;
		padding: 16rpx;
		padding-bottom: calc(96rpx + env(safe-area-inset-bottom));
		box-sizing: border-box;
	}

	.form-card {
		background: #fff;
		border-radius: 12rpx;
		padding: 16rpx;
		margin-bottom: 16rpx;
		box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
	}

	.feedback-textarea {
		width: 100%;
		min-height: 520rpx;
		padding: 12rpx 16rpx;
		font-size: 28rpx;
		color: #333;
		line-height: 1.55;
		border: 1rpx solid #e5e5e5;
		border-radius: 10rpx;
		box-sizing: border-box;
		background: #fff;
		word-wrap: break-word;
		word-break: break-all;
		overflow-wrap: break-word;
		white-space: pre-wrap;
		overflow: hidden;
	}

	.bottom-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 20rpx 40rpx;
		padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
		background: #fff;
		box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.06);
	}

	.submit-btn {
		width: 100%;
		height: 84rpx;
		line-height: 84rpx;
		font-size: 30rpx;
		border-radius: 12rpx;
		background: #4f46e5;
		color: #fff;
		border: none;
		margin: 0;
		padding: 0;
	}

	.submit-btn::after {
		border: none;
	}
</style>

<style>
	/* 覆盖 uni-forms 在 form-card 内：紧凑排版，label 在上方，为留言内容留出更多区域 */
	.form-card .uni-forms-item {
		flex-direction: column;
		align-items: stretch;
		margin-bottom: 14rpx;
		padding-bottom: 0;
	}
	.form-card .uni-forms-item:last-child {
		margin-bottom: 0;
	}
	.form-card .uni-forms-item__label {
		width: 100% !important;
		min-width: auto !important;
		font-size: 26rpx;
		font-weight: bold;
		color: #333;
		margin-bottom: 6rpx;
		white-space: nowrap;
		padding: 0;
	}
	.form-card .uni-forms-item__content {
		flex: 1;
		min-width: 0;
		padding: 0;
	}
	.form-card .uni-forms-item__error {
		margin-top: 2rpx;
		min-height: auto;
	}
	.form-card .uni-easyinput__content-input {
		font-size: 28rpx;
		color: #333;
		border: 1rpx solid #e5e5e5;
		border-radius: 10rpx;
		padding: 12rpx 16rpx;
		min-height: 56rpx;
		box-sizing: border-box;
	}
	/* 图片选择区域紧凑 */
	.form-card .uni-file-picker {
		padding: 0;
	}
	.form-card .uni-file-picker__container {
		margin-top: 0;
	}
</style>
