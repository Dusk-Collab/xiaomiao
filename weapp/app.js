// app.js —— 小程序入口，初始化云开发环境
App({
  globalData: {
    // 在微信公众平台拿到 AppID 后，把下面两个占位符替换成你自己的
    env: 'YOUR_CLOUD_ENV_ID',   // 云开发环境 ID（在云开发控制台查看）
    openid: ''                  // 登录后回填，用于「我的订单」按用户隔离
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库不支持云开发，请使用 2.2.3 或以上版本');
      return;
    }
    wx.cloud.init({
      env: this.globalData.env,
      traceUser: true
    });

    // 获取 openid（用于「我的订单」按用户隔离）
    wx.cloud.callFunction({ name: 'login' })
      .then(res => {
        if (res && res.result && res.result.openid) {
          this.globalData.openid = res.result.openid;
        }
      })
      .catch(err => console.warn('login cloud fn fail', err));
  }
});
