"use strict";
const common_vendor = require("./vendor.js");
const uniStarter_config = require("../uni-starter.config.js");
const db = common_vendor.tr.database();
async function initApp() {
  uniStarter_config.config.debug;
  setTimeout(() => {
    getApp({
      allowDefault: true
    }).globalData.config = uniStarter_config.config;
  }, 1);
  function onDBError({
    code,
    // 错误码详见https://uniapp.dcloud.net.cn/uniCloud/clientdb?id=returnvalue
    message
  }) {
    common_vendor.index.__f__("log", "at common/appInit.js:32", "onDBError", {
      code,
      message
    });
    common_vendor.index.__f__("error", "at common/appInit.js:37", code, message);
  }
  db.on("error", onDBError);
  common_vendor.tr.interceptObject({
    async invoke({
      objectName,
      // 云对象名称
      methodName,
      // 云对象的方法名称
      params
      // 参数列表
    }) {
      if (objectName == "uni-id-co" && (methodName.includes("loginBy") || ["login", "registerUser"].includes(methodName))) {
        common_vendor.index.__f__("log", "at common/appInit.js:56", "执行登录相关云对象");
        params[0].inviteCode = await new Promise((callBack) => {
          common_vendor.index.getClipboardData({
            success: function(res) {
              common_vendor.index.__f__("log", "at common/appInit.js:60", "剪切板内容：" + res.data);
              if (res.data.slice(0, 18) == "uniInvitationCode:") {
                let uniInvitationCode = res.data.slice(18, 38);
                common_vendor.index.__f__("log", "at common/appInit.js:63", "当前用户是其他用户推荐下载的,推荐者的code是：" + uniInvitationCode);
                callBack(uniInvitationCode);
              } else {
                callBack();
              }
            },
            fail() {
              common_vendor.index.__f__("log", "at common/appInit.js:75", "error--");
              callBack();
            },
            complete() {
              common_vendor.index.hideToast();
            }
          });
        });
      }
    },
    success(e) {
      common_vendor.index.__f__("log", "at common/appInit.js:90", e);
    },
    complete() {
    },
    fail(e) {
      common_vendor.index.__f__("error", "at common/appInit.js:96", e);
    }
  });
}
exports.initApp = initApp;
//# sourceMappingURL=../../.sourcemap/mp-weixin/common/appInit.js.map
