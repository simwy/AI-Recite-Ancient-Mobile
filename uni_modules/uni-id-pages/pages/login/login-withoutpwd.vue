<!-- 免密登录页 - 简约风格 -->
<template>
	<view class="uni-content login-page">
		<view class="login-head">
			<text class="login-title">登录</text>
			<text class="login-tip" v-if="['apple','weixin', 'weixinMobile', 'huawei', 'huaweiMobile'].includes(type)">使用第三方账号快捷登录</text>
			<text class="login-tip" v-else>输入手机号，验证码登录</text>
		</view>

		<!-- 第三方快捷登录：统一用简约文字按钮 -->
		<template v-if="['apple','weixin', 'weixinMobile', 'huawei', 'huaweiMobile'].includes(type)">
			<view class="quick-login-block">
				<text class="quick-tip">将根据授权范围获取你的信息</text>
				<view class="quick-login">
					<!-- 微信 / 苹果 / 华为（非手机号）→ 文字按钮 -->
					<template v-if="type !== 'weixinMobile' && type !== 'huaweiMobile'">
						<button type="primary" class="quick-btn-primary" :class="'quick-btn--' + type" @click="quickLogin">{{ quickLoginBtnText }}</button>
					</template>
					<!-- 微信手机号 / 华为手机号 → 需 open-type -->
					<view v-else class="quick-btn-wrap">
						<button v-if="type === 'weixinMobile'" type="primary" open-type="getPhoneNumber" @getphonenumber="quickLogin" class="quick-btn-primary quick-btn--weixin">微信手机号登录</button>
						<!-- #ifdef APP-HARMONY -->
						<app-harmony-get-phone-number v-if="type === 'huaweiMobile'" @getphonenumber="quickLogin">
							<button class="quick-btn-primary quick-btn--huawei">华为手机号登录</button>
						</app-harmony-get-phone-number>
						<!-- #endif -->
						<!-- #ifdef MP-HARMONY -->
						<button v-if="type === 'huaweiMobile'" open-type="getPhoneNumber" @getphonenumber="quickLogin" class="quick-btn-primary quick-btn--huawei">华为手机号登录</button>
						<!-- #endif -->
						<view v-if="needAgreements && !agree" class="mobile-login-agreement-layer" @click="showAgreementModal"></view>
					</view>
				</view>
				<view class="agreement-wrap">
					<uni-id-pages-agreements scope="register" ref="agreements"></uni-id-pages-agreements>
				</view>
			</view>
		</template>

		<!-- 手机号验证码登录 -->
		<template v-else>
			<view class="form-block">
				<view class="phone-row">
					<view @click="chooseArea" class="area-code">+86</view>
					<uni-easyinput
						trim="both"
						:focus="focusPhone"
						@blur="focusPhone = false"
						class="phone-input"
						type="number"
						:inputBorder="false"
						v-model="phone"
						maxlength="11"
						placeholder="请输入手机号"
					/>
				</view>
				<uni-id-pages-agreements scope="register" ref="agreements"></uni-id-pages-agreements>
				<button class="submit-btn" type="primary" @click="toSmsPage">获取验证码</button>
			</view>
		</template>

		<uni-id-pages-fab-login ref="uniFabLogin"></uni-id-pages-fab-login>
	</view>
</template>

<script>
	let currentWebview; //当前窗口对象
	import config from '@/uni_modules/uni-id-pages/config.js'
	import mixin from '@/uni_modules/uni-id-pages/common/login-page.mixin.js';
	export default {
		mixins: [mixin],
		data() {
			return {
				type: "", //快捷登录方式
				phone: "", //手机号码
				focusPhone: false,
				logo: "/static/logo.png"
			}
		},
		computed: {
			async loginTypes() { //读取配置的登录优先级
				return config.loginTypes
			},
			isPhone() { //手机号码校验正则
				return /^1\d{10}$/.test(this.phone);
			},
			imgSrc() { //大快捷登录按钮图（保留供 fab 等使用）
				const images = {
					weixin: '/uni_modules/uni-id-pages/static/login/weixin.png',
					apple: '/uni_modules/uni-id-pages/static/app/apple.png',
					huawei: '/uni_modules/uni-id-pages/static/login/huawei.png',
					huaweiMobile: '/uni_modules/uni-id-pages/static/login/huawei-mobile.png',
				}
				return images[this.type]
			},
			quickLoginBtnText() {
				const map = { weixin: '微信登录', apple: '苹果登录', huawei: '华为登录' }
				return map[this.type] || '登录'
			}
		},
		async onLoad(e) {
			//获取通过url传递的参数type设置当前登录方式，如果没传递直接默认以配置的登录
			let type = e.type || config.loginTypes[0]
			this.type = type

			// console.log("this.type: -----------",this.type);
			if (type != 'univerify') {
				this.focusPhone = true
			}
			this.$nextTick(() => {
				//关闭重复显示的登录快捷方式
				if (['weixin', 'apple', 'huawei', 'huaweiMobile'].includes(type)) {
					this.$refs.uniFabLogin.servicesList = this.$refs.uniFabLogin.servicesList.filter(item =>
						item.id != type)
				}
			})
			uni.$on('uni-id-pages-setLoginType', type => {
				this.type = type
			})
		},
		onShow() {
			// #ifdef H5
			document.onkeydown = event => {
				var e = event || window.event;
				if (e && e.keyCode == 13) { //回车键的键值为13
					this.toSmsPage()
				}
			};
			// #endif
		},
		onUnload() {
			uni.$off('uni-id-pages-setLoginType')
		},
		onReady() {
			// 是否优先启动一键登录。即：页面一加载就启动一键登录
			//#ifdef APP-PLUS
			if (config.loginTypes.includes('univerify') && this.type == "univerify") {
				uni.preLogin({
					provider: 'univerify',
					success: () => {
						const pages = getCurrentPages();
						currentWebview = pages[pages.length - 1].$getAppWebview();
						currentWebview.setStyle({
							"top": "2000px" // 隐藏当前页面窗体
						})
						// this.type == this.loginTypes[1]
						// console.log('开始一键登录');
						this.$refs.uniFabLogin.login_before('univerify')
					},
					fail: (err) => {
						console.log(err);
						if (config.loginTypes.length > 1) {
							this.$refs.uniFabLogin.login_before(config.loginTypes[1])
						} else {
							uni.showModal({
								content: err.message,
								showCancel: false
							});
						}
					}
				})
			}
			//#endif
		},
		methods: {
			showCurrentWebview(){
				// 恢复当前页面窗体的显示 一键登录，默认不显示当前窗口
				currentWebview.setStyle({
					"top": 0
				})
			},
			showAgreementModal () {
				this.$refs.agreements.popup()
			},
			quickLogin(e) {
				let options = {}
				console.log(e)
				if (e.detail?.code) {
					options.phoneNumberCode = e.detail.code
				}

				if ((this.type === 'weixinMobile' || this.type === 'huaweiMobile') && !e.detail?.code) return

				this.$refs.uniFabLogin.login_before(this.type, true, options)
			},
			toSmsPage() {
				if (!this.isPhone) {
					this.focusPhone = true
					return uni.showToast({
						title: "手机号码格式不正确",
						icon: 'none',
						duration: 3000
					});
				}
				if (this.needAgreements && !this.agree) {
					return this.$refs.agreements.popup(this.toSmsPage)
				}
				// 发送验证吗
				uni.navigateTo({
					url: '/uni_modules/uni-id-pages/pages/login/login-smscode?phoneNumber=' + this.phone
				});
			},
			//去密码登录页
			toPwdLogin() {
				uni.navigateTo({
					url: '../login/password'
				})
			},
			chooseArea() {
				uni.showToast({
					title: '暂不支持其他国家',
					icon: 'none',
					duration: 3000
				});
			},
		}
	}
</script>

<style lang="scss" scoped>
	@import "@/uni_modules/uni-id-pages/common/login-page.scss";

	/* 简约风格：与 App 主色、标题色统一 */
	.login-page.uni-content {
		padding: 80rpx 48rpx 48rpx;
		min-height: 100vh;
		box-sizing: border-box;
		/* #ifndef APP-NVUE */
		display: flex;
		flex-direction: column;
		/* #endif */
	}

	.login-head {
		margin-bottom: 56rpx;
	}
	.login-title {
		display: block;
		font-size: 44rpx;
		font-weight: 600;
		color: #2C405A;
		letter-spacing: 0.5rpx;
		margin-bottom: 16rpx;
	}
	.login-tip {
		display: block;
		font-size: 26rpx;
		color: #999;
		line-height: 1.4;
	}

	/* 手机号表单 */
	.form-block {
		/* #ifndef APP-NVUE */
		display: flex;
		flex-direction: column;
		/* #endif */
	}
	.phone-row {
		position: relative;
		/* #ifndef APP-NVUE */
		display: flex;
		align-items: center;
		/* #endif */
		background: #f5f5f5;
		border-radius: 16rpx;
		margin-bottom: 32rpx;
		overflow: hidden;
	}
	.area-code {
		padding: 0 24rpx;
		font-size: 28rpx;
		color: #333;
		flex-shrink: 0;
		/* #ifndef APP-NVUE */
		line-height: 88rpx;
		/* #endif */
	}
	.area-code::after {
		content: "";
		border: 4rpx solid transparent;
		border-top-color: #666;
		margin-left: 8rpx;
		vertical-align: 4rpx;
		display: inline-block;
	}
	/* #ifdef MP */
	.phone-row ::v-deep .uni-easyinput__content,
	/* #endif */
	.phone-input,
	.phone-row ::v-deep .uni-easyinput__content {
		flex: 1;
		height: 88rpx;
		background: transparent !important;
		border: none;
		font-size: 28rpx;
		padding-left: 0;
		margin-bottom: 0;
		border-radius: 0;
	}
	.submit-btn {
		height: 88rpx;
		line-height: 88rpx;
		border-radius: 16rpx;
		font-size: 32rpx;
		font-weight: 500;
		background: #007aff !important;
		color: #fff !important;
		border: none;
		margin: 0;
	}

	/* 第三方快捷登录 */
	.quick-login-block {
		/* #ifndef APP-NVUE */
		display: flex;
		flex-direction: column;
		align-items: center;
		/* #endif */
		flex: 1;
		padding-top: 24rpx;
	}
	.quick-tip {
		font-size: 24rpx;
		color: #999;
		margin-bottom: 48rpx;
	}
	.quick-login {
		width: 100%;
		/* #ifndef APP-NVUE */
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		/* #endif */
	}
	.quick-btn-wrap {
		position: relative;
		width: 100%;
		/* #ifndef APP-NVUE */
		display: flex;
		justify-content: center;
		/* #endif */
	}
	.quick-btn-primary {
		width: 100%;
		max-width: 400rpx;
		height: 88rpx;
		line-height: 88rpx;
		border-radius: 16rpx;
		font-size: 30rpx;
		font-weight: 500;
		color: #fff !important;
		border: none;
	}
	.quick-btn--weixin {
		background: #07c160 !important;
	}
	.quick-btn--apple {
		background: #000 !important;
	}
	.quick-btn--huawei {
		background: #007aff !important;
	}
	.agreement-wrap {
		margin-top: 32rpx;
		width: 100%;
	}
	.agreement-wrap ::v-deep .checkbox-box {
		align-items: center;
	}
	.agreement-wrap ::v-deep .text {
		font-size: 24rpx;
		color: #999;
	}
	.agreement-wrap ::v-deep .agreement {
		color: #007aff;
	}
	/* 底部「账号登录」等入口：简约小字 */
	.login-page ::v-deep .fab-login-box {
		margin-top: 48rpx;
		padding-top: 32rpx;
		border-top: 1rpx solid #eee;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 32rpx;
		flex-wrap: wrap;
	}
	.login-page ::v-deep .fab-login-box .item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8rpx;
	}
	.login-page ::v-deep .fab-login-box .logo {
		width: 48rpx;
		height: 48rpx;
	}
	.login-page ::v-deep .fab-login-box .login-title {
		font-size: 24rpx;
		color: #999;
	}

	.mobile-login-agreement-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	@media screen and (min-width: 690px) {
		.login-page.uni-content {
			padding: 60px 48px 48px;
			max-width: 400px;
			margin: 0 auto;
			min-height: auto;
		}
		.quick-login-block {
			flex: none;
		}
	}
</style>
