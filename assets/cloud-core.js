/* cloud-core.js —— 微信云开发 Web SDK 封装（网页版实时同步后端）
 * 依赖：HTML 中先引入 <script src="https://static.cloudbase.com/cloudbase/js-sdk/1.6.4/cloudbase.full.js"></script>（全局 cloud）
 * 设计：
 *   - 环境 ID 存 localStorage('om_cloud_env')，没配置则自动降级本地模式（不影响现有演示）。
 *   - 店铺数据在云数据库 collection 'store' doc 'main'；管理员密码单独存 doc 'config'，互不污染。
 *   - watch() 实现多设备秒级实时同步。
 */
(function (global) {
  'use strict';

  var ENV_KEY = 'om_cloud_env';
  var LOCAL_PWD = 'om_adminpwd';      // 本地降级时缓存的管理员密码哈希
  var SALT = 'xiaomiao@2026';
  var app = null, db = null, readyFlag = false;

  function init() {
    var env = localStorage.getItem(ENV_KEY);
    if (!env || !global.cloud) { readyFlag = false; return false; }
    try {
      app = global.cloud.init({ env: env });
      db = app.database();
      readyFlag = true;
      return true;
    } catch (e) { console.warn('CloudCore.init fail', e); readyFlag = false; return false; }
  }

  // 简单 SHA-256 加盐哈希（Web Crypto）
  async function hashPwd(pwd) {
    if (!global.crypto || !global.crypto.subtle) return 'plain:' + pwd;   // 极端降级
    try {
      var data = new TextEncoder().encode(SALT + '|' + pwd);
      var buf = await global.crypto.subtle.digest('SHA-256', data);
      var arr = Array.from(new Uint8Array(buf));
      return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    } catch (e) { return 'plain:' + pwd; }
  }

  function getConfigDoc() {
    if (!readyFlag || !db) return Promise.resolve(null);
    return db.collection('store').doc('config').get()
      .then(function (res) { return (res.data && res.data[0]) || null; })
      .catch(function () { return null; });
  }

  async function getAdminPwd() {
    var doc = await getConfigDoc();
    if (doc && doc.adminPwd) return doc.adminPwd;
    try { return localStorage.getItem(LOCAL_PWD) || ''; } catch (e) { return ''; }
  }

  async function verifyAdmin(pwd) {
    var want = await getAdminPwd();
    if (!want) return true;                 // 还没设密码（首次进入时设置）
    var h = await hashPwd(pwd);
    return h === want;
  }

  async function setAdminPwd(pwd) {
    var h = await hashPwd(pwd);
    if (readyFlag && db) {
      // config 文档只放 adminPwd，绝不动 store/main，避免改菜单时把密码冲掉
      await db.collection('store').doc('config').set({ adminPwd: h }).catch(function (e) { console.warn('setAdminPwd cloud fail', e); });
    }
    try { localStorage.setItem(LOCAL_PWD, h); } catch (e) {}
    return h;
  }

  global.CloudCore = {
    init: init,
    ready: function () { return readyFlag; },
    get db() { return db; },
    get app() { return app; },        // 供 account.js 复用同一实例调用云函数（只读）
    get envId() { return localStorage.getItem(ENV_KEY) || ''; },
    setEnv: function (id) {
      localStorage.setItem(ENV_KEY, id || '');
      readyFlag = false; app = null; db = null;
      return init();
    },
    hashPwd: hashPwd,
    getAdminPwd: getAdminPwd,
    verifyAdmin: verifyAdmin,
    setAdminPwd: setAdminPwd
  };

  init();   // 加载即按本地环境 ID 初始化（没配置则 ready=false，自动降级本地）
})(window);
