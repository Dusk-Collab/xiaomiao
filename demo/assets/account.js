/* account.js —— 商家账户中心前端 SDK（网页版后台用）
 * 设计：
 *   - 云端模式：环境已配置(CloudCore.ready)时，所有账户操作走云函数 auth（callFunction），
 *     账户真源在云端，任何设备登录同一套凭证、看到同一份数据（解决"电脑登录了手机又要重设"）。
 *   - 本地模式：未配置云环境时，账户存本机 localStorage（单设备可用，便于先体验 UI）。
 *     注意：本地模式仅本机有效，换设备不共享——这是本地模式固有局限，非 bug。
 * 统一对外：Account.status() / register() / login() / loginByCode() / sendCode()
 *          / changePwd() / bindPhone() / bindEmail() / resetPwd() / logout()
 * 所有方法返回 Promise<{ ok, code, msg, data }>
 */
(function (global) {
  'use strict';

  var LK_ACC = 'om_account';      // 本地模式账户
  var LK_CODE = 'om_authcodes';   // 本地模式验证码（仅本地模式用，dev 兜底）
  var LK_TOKEN = 'om_actoken';    // 登录会话 token

  function cloudReady() { return !!(global.CloudCore && global.CloudCore.ready() && global.CloudCore.app); }
  function mode() { return cloudReady() ? 'cloud' : 'local'; }

  /* ---- 云函数调用（带匿名登录保活） ---- */
  var authPromise = null;
  function ensureAuth() {
    if (!cloudReady()) return Promise.reject(new Error('NO_CLOUD'));
    var app = global.CloudCore.app;
    if (authPromise) return authPromise;
    try {
      authPromise = app.auth({ persistence: 'local' }).signInAnonymously()
        .then(function () { return app; })
        .catch(function (e) { authPromise = null; throw e; });
    } catch (e) { authPromise = null; return Promise.reject(e); }
    return authPromise;
  }
  function callCloud(action, data) {
    return ensureAuth().then(function (app) {
      return app.callFunction({ name: 'auth', data: Object.assign({ action: action }, data || {}) });
    }).then(function (res) {
      var r = res && res.result;
      if (!r) return { ok: false, code: 'BAD_RESP', msg: '云函数无返回' };
      return r;   // { ok, code, msg, data }
    }).catch(function (e) {
      return { ok: false, code: 'CLOUD_ERR', msg: (e && e.message) ? e.message : '云端调用失败' };
    });
  }

  /* ---- 本地模式工具 ---- */
  function lkGet(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lkSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function lkDel(key) { try { localStorage.removeItem(key); } catch (e) {} }

  function maskPhone(v) { var s = String(v || ''); return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s; }
  function maskEmail(v) {
    var s = String(v || ''); var i = s.indexOf('@');
    if (i < 1) return s; var name = s.slice(0, i);
    var keep = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
    return keep + '***' + s.slice(i);
  }
  function newCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

  async function hashPwd(pwd) {
    if (global.CloudCore && global.CloudCore.hashPwd) return await global.CloudCore.hashPwd(pwd);
    return 'plain:' + pwd;   // 极端降级（不会发生，CloudCore 必在 account.js 之前加载）
  }

  function storeCodes() { var c = lkGet(LK_CODE, {}); var now = Date.now(); for (var k in c) if (c[k].expireAt < now) delete c[k]; return c; }
  function saveLocalCode(target, purpose, code) {
    var c = storeCodes(); c[target + '|' + purpose] = { code: code, createdAt: Date.now(), expireAt: Date.now() + 5 * 60 * 1000, used: false, tries: 0 };
    lkSet(LK_CODE, c); return code;
  }
  function consumeLocalCode(target, purpose, code) {
    var c = storeCodes(); var k = target + '|' + purpose; var d = c[k];
    if (!d) return { ok: false, code: 'CODE_NOT_FOUND', msg: '请先获取验证码' };
    if (d.expireAt < Date.now()) return { ok: false, code: 'CODE_EXPIRED', msg: '验证码已过期' };
    if (d.used) return { ok: false, code: 'CODE_USED', msg: '验证码已使用' };
    if ((d.tries || 0) >= 5) return { ok: false, code: 'CODE_LOCKED', msg: '次数过多' };
    if (String(d.code) !== String(code || '').trim()) { d.tries = (d.tries || 0) + 1; c[k] = d; lkSet(LK_CODE, c); return { ok: false, code: 'CODE_WRONG', msg: '验证码不正确' }; }
    d.used = true; c[k] = d; lkSet(LK_CODE, c); return { ok: true };
  }

  function localStatus() {
    var a = lkGet(LK_ACC, null);
    return { ok: true, data: { hasAccount: !!(a && a.pwdHash), phone: a && a.phone ? maskPhone(a.phone) : '', email: a && a.email ? maskEmail(a.email) : '', hasPhone: !!(a && a.phone), hasEmail: !!(a && a.email), smsReady: false, emailReady: false, pwdUpdatedAt: (a && a.pwdUpdatedAt) || 0, mode: 'local' } };
  }
  function localRegister(e) {
    var a = lkGet(LK_ACC, null);
    if (a && a.pwdHash) return Promise.resolve({ ok: false, code: 'ALREADY_REGISTERED', msg: '账户已存在，请直接登录' });
    if (!/^1[3-9]\d{9}$/.test(String(e.phone || '').trim())) return Promise.resolve({ ok: false, code: 'BAD_PHONE', msg: '请输入正确的 11 位手机号' });
    var pwd = String(e.pwd || '');
    if (pwd.length < 6) return Promise.resolve({ ok: false, code: 'WEAK_PWD', msg: '密码至少 6 位' });
    return hashPwd(pwd).then(function (h) {
      var now = Date.now();
      lkSet(LK_ACC, { phone: String(e.phone).trim(), email: '', salt: 'local', pwdHash: h, createdAt: now, pwdUpdatedAt: now });
      var tok = 'local_' + now + '_' + Math.random().toString(36).slice(2);
      lkSet(LK_TOKEN, { token: tok, expireAt: now + (e.remember ? 7 : 0.5) * 24 * 3600 * 1000 });
      return { ok: true, data: { token: tok, expireAt: now + (e.remember ? 7 : 0.5) * 24 * 3600 * 1000 } };
    });
  }
  function localLogin(e) {
    var a = lkGet(LK_ACC, null);
    if (!a || !a.pwdHash) return Promise.resolve({ ok: false, code: 'NO_ACCOUNT', msg: '还没有账户，请先创建' });
    if (String(e.phone || '').trim() !== a.phone) return Promise.resolve({ ok: false, code: 'BAD_LOGIN', msg: '手机号或密码不正确' });
    return hashPwd(String(e.pwd || '')).then(function (h) {
      if (h !== a.pwdHash) return { ok: false, code: 'BAD_LOGIN', msg: '手机号或密码不正确' };
      var now = Date.now();
      var tok = 'local_' + now + '_' + Math.random().toString(36).slice(2);
      lkSet(LK_TOKEN, { token: tok, expireAt: now + (e.remember ? 7 : 0.5) * 24 * 3600 * 1000 });
      return { ok: true, data: { token: tok, expireAt: now + (e.remember ? 7 : 0.5) * 24 * 3600 * 1000 } };
    });
  }
  function localSendCode(e) {
    var purpose = String(e.purpose || 'login');
    var channel = String(e.channel || 'sms');
    var a = lkGet(LK_ACC, null);
    var target = String(e.target || '').trim();
    if (purpose === 'bindPhone' || purpose === 'bindEmail') {
      if (!getToken()) return Promise.resolve({ ok: false, code: 'NEED_LOGIN', msg: '请先登录' });
    }
    if (purpose === 'login' || purpose === 'reset' || purpose === 'changePwd') {
      if (!a) return Promise.resolve({ ok: false, code: 'NO_ACCOUNT', msg: '还没有账户' });
      if (channel === 'sms') { if (target && target !== a.phone) return Promise.resolve({ ok: false, code: 'PHONE_MISMATCH', msg: '手机号不一致' }); target = a.phone; }
      else { if (target && target !== a.email) return Promise.resolve({ ok: false, code: 'EMAIL_MISMATCH', msg: '邮箱不一致' }); target = a.email; if (!target) return Promise.resolve({ ok: false, code: 'NO_EMAIL', msg: '未绑定邮箱' }); }
    } else if (purpose === 'bindPhone') { if (!/^1[3-9]\d{9}$/.test(target)) return Promise.resolve({ ok: false, code: 'BAD_PHONE', msg: '手机号格式不对' }); channel = 'sms'; }
    else if (purpose === 'bindEmail') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return Promise.resolve({ ok: false, code: 'BAD_EMAIL', msg: '邮箱格式不对' }); channel = 'email'; }
    var code = saveLocalCode(target, purpose, newCode());
    // 本地模式无短信网关：把验证码回传给前端做"开发演示"，真实上线由云函数发短信/邮件
    return Promise.resolve({ ok: true, data: { channel: channel, target: channel === 'sms' ? maskPhone(target) : maskEmail(target), ttl: 300, devCode: code } });
  }
  function localLoginByCode(e) {
    var a = lkGet(LK_ACC, null); if (!a || !a.pwdHash) return Promise.resolve({ ok: false, code: 'NO_ACCOUNT', msg: '还没有账户' });
    var ch = String(e.channel || 'sms'); var target = ch === 'sms' ? a.phone : a.email;
    if (!target) return Promise.resolve({ ok: false, code: ch === 'sms' ? 'NO_PHONE' : 'NO_EMAIL', msg: '未绑定该方式' });
    var r = consumeLocalCode(target, 'login', e.code); if (!r.ok) return Promise.resolve(r);
    var now = Date.now(); var tok = 'local_' + now + '_' + Math.random().toString(36).slice(2);
    lkSet(LK_TOKEN, { token: tok, expireAt: now + (e.remember ? 7 : 0.5) * 24 * 3600 * 1000 });
    return Promise.resolve({ ok: true, data: { token: tok, expireAt: now + (e.remember ? 7 : 0.5) * 24 * 3600 * 1000 } });
  }
  function localChangePwd(e) {
    var a = lkGet(LK_ACC, null); if (!a || !a.pwdHash) return Promise.resolve({ ok: false, code: 'NO_ACCOUNT', msg: '还没有账户' });
    var newPwd = String(e.newPwd || ''); if (newPwd.length < 6) return Promise.resolve({ ok: false, code: 'WEAK_PWD', msg: '新密码至少 6 位' });
    if (a.phone) {
      var r = consumeLocalCode(a.phone, 'changePwd', e.code); if (!r.ok) return Promise.resolve(r);
    } else {
      // 未绑定手机：用原密码校验
      return hashPwd(String(e.oldPwd || '')).then(function (h) {
        if (h !== a.pwdHash) return { ok: false, code: 'BAD_OLD_PWD', msg: '原密码不正确' };
        return finishLocalPwd(a, newPwd);
      });
    }
    return finishLocalPwd(a, newPwd);
  }
  function finishLocalPwd(a, newPwd) {
    return hashPwd(newPwd).then(function (h) {
      a.pwdHash = h; a.pwdUpdatedAt = Date.now(); lkSet(LK_ACC, a);
      lkDel(LK_TOKEN); var now = Date.now(); var tok = 'local_' + now + '_' + Math.random().toString(36).slice(2);
      lkSet(LK_TOKEN, { token: tok, expireAt: now + 7 * 24 * 3600 * 1000 });
      return { ok: true, data: { token: tok } };
    });
  }
  function localResetPwd(e) {
    var a = lkGet(LK_ACC, null); if (!a || !a.pwdHash) return Promise.resolve({ ok: false, code: 'NO_ACCOUNT', msg: '还没有账户' });
    var ch = String(e.channel || 'sms'); var target = ch === 'sms' ? a.phone : a.email; if (!target) return Promise.resolve({ ok: false, code: 'NO_TARGET', msg: '未绑定该方式' });
    var r = consumeLocalCode(target, 'reset', e.code); if (!r.ok) return Promise.resolve(r);
    var newPwd = String(e.newPwd || ''); if (newPwd.length < 6) return Promise.resolve({ ok: false, code: 'WEAK_PWD', msg: '新密码至少 6 位' });
    return finishLocalPwd(a, newPwd);
  }
  function localBindPhone(e) {
    if (!getToken()) return Promise.resolve({ ok: false, code: 'NEED_LOGIN', msg: '请先登录' });
    var a = lkGet(LK_ACC, null); var r = consumeLocalCode(String(e.phone || '').trim(), 'bindPhone', e.code); if (!r.ok) return Promise.resolve(r);
    a.phone = String(e.phone).trim(); a.phoneBoundAt = Date.now(); lkSet(LK_ACC, a); return Promise.resolve({ ok: true, data: { phone: maskPhone(a.phone) } });
  }
  function localBindEmail(e) {
    if (!getToken()) return Promise.resolve({ ok: false, code: 'NEED_LOGIN', msg: '请先登录' });
    var a = lkGet(LK_ACC, null); var r = consumeLocalCode(String(e.email || '').trim(), 'bindEmail', e.code); if (!r.ok) return Promise.resolve(r);
    a.email = String(e.email).trim(); a.emailBoundAt = Date.now(); lkSet(LK_ACC, a); return Promise.resolve({ ok: true, data: { email: maskEmail(a.email) } });
  }
  function localLogout() { lkDel(LK_TOKEN); return Promise.resolve({ ok: true }); }

  /* ---- token 管理 ---- */
  function getToken() { var t = lkGet(LK_TOKEN, null); if (!t) return ''; if (t.expireAt < Date.now()) { lkDel(LK_TOKEN); return ''; } return t.token; }
  function setToken() {}
  function isLoggedIn() { return !!getToken(); }

  /* ---- 统一对外：云端优先，本地兜底 ---- */
  function route(action, e, localFn) {
    if (cloudReady()) return callCloud(action, e);
    return localFn(e);
  }

  global.Account = {
    mode: mode,
    cloudReady: cloudReady,
    isLoggedIn: isLoggedIn,
    getToken: getToken,
    status: function () { return route('status', {}, localStatus); },
    register: function (e) { return route('register', e, localRegister); },
    login: function (e) { return route('login', e, localLogin); },
    loginByCode: function (e) { return route('loginByCode', e, localLoginByCode); },
    sendCode: function (e) { return route('sendCode', e, localSendCode); },
    changePwd: function (e) { return route('changePwd', e, localChangePwd); },
    resetPwd: function (e) { return route('resetPwd', e, localResetPwd); },
    bindPhone: function (e) { return route('bindPhone', e, localBindPhone); },
    bindEmail: function (e) { return route('bindEmail', e, localBindEmail); },
    logout: function () { return route('logout', {}, localLogout); }
  };
})(window);
