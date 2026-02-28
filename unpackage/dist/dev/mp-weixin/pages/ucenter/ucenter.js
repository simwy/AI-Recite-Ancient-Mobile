"use strict";
const common_vendor = require("../../common/vendor.js");
const uni_modules_uniUpgradeCenterApp_utils_callCheckVersion = require("../../uni_modules/uni-upgrade-center-app/utils/call-check-version.js");
const uni_modules_uniIdPages_common_store = require("../../uni_modules/uni-id-pages/common/store.js");
const db = common_vendor.tr.database();
const _sfc_main = {
  data() {
    return {
      gridList: [
        {
          "label": "背诵时间",
          "value": "0秒"
        },
        {
          "label": "背诵文章数",
          "value": "0"
        },
        {
          "label": "背诵次数",
          "value": "0"
        },
        {
          "label": "背诵准确率",
          "value": "0%"
        }
      ],
      ucenterList: [
        [
          {
            "title": this.$t("mine.signIn"),
            "event": "signIn",
            "icon": "compose"
          },
          {
            "title": "背诵历史",
            "to": "/pages/ancient/history",
            "icon": "calendar"
          }
          // {
          // 	"title":this.$t('mine.readArticles'),
          // 	"to": '/pages/ucenter/read-news-log/read-news-log',
          // 	"icon": "flag"
          // },
          // {
          // 	"title": this.$t('mine.myScore'),
          // 	"to": '',
          // 	"event": 'getScore',
          // 	"icon": "paperplane"
          // }
        ],
        [{
          "title": this.$t("mine.feedback"),
          "to": "/uni_modules/uni-feedback/pages/opendb-feedback/opendb-feedback",
          "icon": "help"
        }, {
          "title": this.$t("mine.settings"),
          "to": "/pages/ucenter/settings/settings",
          "icon": "gear"
        }]
      ],
      listStyles: {
        "height": "150rpx",
        // 边框高度
        "width": "150rpx",
        // 边框宽度
        "border": {
          // 如果为 Boolean 值，可以控制边框显示与否
          "color": "#eee",
          // 边框颜色
          "width": "1px",
          // 边框宽度
          "style": "solid",
          // 边框样式
          "radius": "100%"
          // 边框圆角，支持百分比
        }
      }
    };
  },
  onLoad() {
  },
  onShow() {
    this.loadReciteStats();
  },
  computed: {
    userInfo() {
      return uni_modules_uniIdPages_common_store.store.userInfo;
    },
    hasLogin() {
      return uni_modules_uniIdPages_common_store.store.hasLogin;
    },
    appConfig() {
      return getApp().globalData.config;
    }
  },
  methods: {
    toSettings() {
      common_vendor.index.navigateTo({
        url: "/pages/ucenter/settings/settings"
      });
    },
    signIn() {
      this.$refs.signIn.open();
    },
    signInByAd() {
      this.$refs.signIn.showRewardedVideoAd();
    },
    /**
     * 个人中心项目列表点击事件
     */
    ucenterListClick(item) {
      if (!item.to && item.event) {
        this[item.event]();
      }
    },
    async checkVersion() {
      let res = await uni_modules_uniUpgradeCenterApp_utils_callCheckVersion.callCheckVersion();
      common_vendor.index.__f__("log", "at pages/ucenter/ucenter.vue:205", res);
      if (res.result.code > 0)
        ;
      else {
        common_vendor.index.showToast({
          title: res.result.message,
          icon: "none"
        });
      }
    },
    toUserInfo() {
      common_vendor.index.navigateTo({
        url: "/uni_modules/uni-id-pages/pages/userinfo/userinfo"
      });
    },
    tapGrid(index) {
    },
    async loadReciteStats() {
      if (!this.hasLogin) {
        this.gridList = [
          {
            label: "总背诵时间",
            value: "0秒"
          },
          {
            label: "总背诵文章数",
            value: "0"
          },
          {
            label: "总背诵次数",
            value: "0"
          },
          {
            label: "总背诵准确率",
            value: "0%"
          }
        ];
        return;
      }
      try {
        const pageSize = 100;
        let page = 1;
        let total = 0;
        const records = [];
        while (true) {
          const res = await common_vendor.tr.callFunction({
            name: "gw_recite-record",
            data: {
              action: "list",
              data: {
                page,
                pageSize
              }
            }
          });
          const result = res && res.result || {};
          if (result.code !== 0 || !result.data) {
            throw new Error(result.msg || "加载背诵统计失败");
          }
          const list = result.data.list || [];
          total = result.data.total || 0;
          records.push(...list);
          if (records.length >= total || list.length === 0)
            break;
          page++;
        }
        const textSet = /* @__PURE__ */ new Set();
        let totalDurationSeconds = 0;
        let totalAccuracy = 0;
        let accuracyCount = 0;
        records.forEach((item) => {
          if (item && item.text_id) {
            textSet.add(item.text_id);
          }
          const duration = Number(
            item.duration_seconds || item.duration || item.recite_duration || item.reciteDuration || 0
          );
          if (Number.isFinite(duration) && duration > 0) {
            totalDurationSeconds += Math.floor(duration);
          }
          const accuracy = Number(item.accuracy);
          if (Number.isFinite(accuracy)) {
            totalAccuracy += accuracy;
            accuracyCount++;
          }
        });
        const avgAccuracy = accuracyCount > 0 ? (totalAccuracy / accuracyCount).toFixed(1) : "0";
        this.gridList = [
          {
            label: "背诵时间",
            value: this.formatDuration(totalDurationSeconds)
          },
          {
            label: "背诵文章数",
            value: String(textSet.size)
          },
          {
            label: "背诵次数",
            value: String(records.length)
          },
          {
            label: "背诵准确率",
            value: `${avgAccuracy}%`
          }
        ];
      } catch (e) {
        common_vendor.index.__f__("error", "at pages/ucenter/ucenter.vue:311", "加载背诵统计失败", e);
      }
    },
    formatDuration(totalSeconds) {
      const seconds = Number(totalSeconds) || 0;
      if (seconds <= 0)
        return "0秒";
      const h = Math.floor(seconds / 3600);
      const m = Math.floor(seconds % 3600 / 60);
      const s = seconds % 60;
      if (h > 0) {
        return `${h}小时${m}分`;
      }
      if (m > 0) {
        return `${m}分${s}秒`;
      }
      return `${s}秒`;
    },
    /**
     * 去应用市场评分
     */
    gotoMarket() {
    },
    /**
     * 获取积分信息
     */
    getScore() {
      if (!this.userInfo)
        return common_vendor.index.showToast({
          title: this.$t("mine.checkScore"),
          icon: "none"
        });
      common_vendor.index.showLoading({
        mask: true
      });
      db.collection("uni-id-scores").where('"user_id" == $env.uid').field("score,balance").orderBy("create_date", "desc").limit(1).get().then((res) => {
        common_vendor.index.__f__("log", "at pages/ucenter/ucenter.vue:369", res);
        const data = res.result.data[0];
        let msg = "";
        msg = data ? this.$t("mine.currentScore") + data.balance : this.$t("mine.noScore");
        common_vendor.index.showToast({
          title: msg,
          icon: "none"
        });
      }).finally(() => {
        common_vendor.index.hideLoading();
      });
    },
    async share() {
      let { result } = await db.collection("uni-id-users").where("'_id' == $cloudEnv_uid").field("my_invite_code").get();
      let myInviteCode = result.data[0].my_invite_code;
      if (!myInviteCode) {
        return common_vendor.index.showToast({
          title: "请检查uni-config-center中uni-id配置，是否已启用 autoSetInviteCode",
          icon: "none"
        });
      }
      common_vendor.index.__f__("log", "at pages/ucenter/ucenter.vue:390", { myInviteCode });
      this.appConfig.about;
    }
  }
};
if (!Array) {
  const _easycom_uni_sign_in2 = common_vendor.resolveComponent("uni-sign-in");
  const _easycom_cloud_image2 = common_vendor.resolveComponent("cloud-image");
  const _easycom_uni_icons2 = common_vendor.resolveComponent("uni-icons");
  const _easycom_uni_grid_item2 = common_vendor.resolveComponent("uni-grid-item");
  const _easycom_uni_grid2 = common_vendor.resolveComponent("uni-grid");
  const _easycom_uni_list_item2 = common_vendor.resolveComponent("uni-list-item");
  const _easycom_uni_list2 = common_vendor.resolveComponent("uni-list");
  (_easycom_uni_sign_in2 + _easycom_cloud_image2 + _easycom_uni_icons2 + _easycom_uni_grid_item2 + _easycom_uni_grid2 + _easycom_uni_list_item2 + _easycom_uni_list2)();
}
const _easycom_uni_sign_in = () => "../../uni_modules/uni-sign-in/components/uni-sign-in/uni-sign-in.js";
const _easycom_cloud_image = () => "../../uni_modules/uni-id-pages/components/cloud-image/cloud-image.js";
const _easycom_uni_icons = () => "../../uni_modules/uni-icons/components/uni-icons/uni-icons.js";
const _easycom_uni_grid_item = () => "../../uni_modules/uni-grid/components/uni-grid-item/uni-grid-item.js";
const _easycom_uni_grid = () => "../../uni_modules/uni-grid/components/uni-grid/uni-grid.js";
const _easycom_uni_list_item = () => "../../uni_modules/uni-list/components/uni-list-item/uni-list-item.js";
const _easycom_uni_list = () => "../../uni_modules/uni-list/components/uni-list/uni-list.js";
if (!Math) {
  (_easycom_uni_sign_in + _easycom_cloud_image + _easycom_uni_icons + _easycom_uni_grid_item + _easycom_uni_grid + _easycom_uni_list_item + _easycom_uni_list)();
}
function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
  return common_vendor.e({
    a: common_vendor.sr("signIn", "b6546e32-0"),
    b: $options.hasLogin && $options.userInfo.avatar_file && $options.userInfo.avatar_file.url
  }, $options.hasLogin && $options.userInfo.avatar_file && $options.userInfo.avatar_file.url ? {
    c: common_vendor.p({
      width: "150rpx",
      height: "150rpx",
      src: $options.userInfo.avatar_file.url
    })
  } : {
    d: common_vendor.p({
      color: "#ffffff",
      size: "50",
      type: "person-filled"
    })
  }, {
    e: $options.hasLogin
  }, $options.hasLogin ? {
    f: common_vendor.t($options.userInfo.nickname || $options.userInfo.username || $options.userInfo.mobile)
  } : {
    g: common_vendor.t(_ctx.$t("mine.notLogged"))
  }, {
    h: common_vendor.o((...args) => $options.toUserInfo && $options.toUserInfo(...args)),
    i: common_vendor.f($data.gridList, (item, index, i0) => {
      return {
        a: common_vendor.t(item.value),
        b: common_vendor.t(item.label),
        c: common_vendor.o(($event) => $options.tapGrid(index), index),
        d: index,
        e: "b6546e32-4-" + i0 + ",b6546e32-3"
      };
    }),
    j: common_vendor.p({
      column: 4,
      showBorder: false,
      square: true
    }),
    k: common_vendor.f($data.ucenterList, (sublist, index, i0) => {
      return {
        a: common_vendor.f(sublist, (item, i, i1) => {
          return common_vendor.e({
            a: item.showBadge
          }, item.showBadge ? {
            b: common_vendor.t(item.rightText)
          } : {}, {
            c: i,
            d: common_vendor.o(($event) => $options.ucenterListClick(item), i),
            e: "b6546e32-6-" + i0 + "-" + i1 + "," + ("b6546e32-5-" + i0),
            f: common_vendor.p({
              title: item.title,
              link: true,
              rightText: item.rightText,
              clickable: true,
              to: item.to,
              ["show-extra-icon"]: true,
              extraIcon: {
                type: item.icon,
                color: "#999"
              }
            })
          });
        }),
        b: index,
        c: "b6546e32-5-" + i0
      };
    })
  });
}
const MiniProgramPage = /* @__PURE__ */ common_vendor._export_sfc(_sfc_main, [["render", _sfc_render], ["__scopeId", "data-v-b6546e32"]]);
wx.createPage(MiniProgramPage);
//# sourceMappingURL=../../../.sourcemap/mp-weixin/pages/ucenter/ucenter.js.map
