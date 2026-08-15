/* admin-login.js —— 商家账户登录门 + 云端同步设置 + 账户与安全面板 */
(function () {
  'use strict';

  var overlay = document.getElementById('adminLock');
  if (!overlay) return;
  if (!window.Account) { console.error('Account SDK 未加载'); return; }

  function $(id) { return document.getElementById(id); }
  function showErr(m) { var el = $('alErr'); if (el) el.textContent = m || ''; }
  function showWarn(m) { var el = $('alWarn'); if (el) el.textContent = m || ''; }
  function toast(m) { if (typeof window.toast === 'function') window.toast(m); else alert(m); }

  /* 已登录（本设备会话未过期）→ 直接放行 */
  if (Account.isLoggedIn()) { overlay.style.display = 'none'; }

  var curTab = 'pwd';
  var mode = 'login';   // login | reg | reset

  function showBox(which) {
    mode = which;
    ['regBox', 'loginBox', 'resetBox'].forEach(function (b) { var el = $(b); if (el) el.style.display = (b === which + 'Box') ? 'block' : 'none'; });
    showErr('');
  }
  window.switchToLogin = function () { showBox('login'); };
  window.switchTab = function (t) {
    curTab = t;
    $('tabPwd').classList.toggle('on', t === 'pwd');
    $('tabCode').classList.toggle('on', t === 'code');
    $('alPwd').style.display = (t === 'pwd') ? 'block' : 'none';
    $('codeRow').style.display = (t === 'code') ? 'block' : 'none';
    showErr('');
  };
  window.toReset = function () { showBox('reset'); };

  async function boot() {
    try {
      var r = await Account.status();
      var hasAcc = r && r.data && r.data.hasAccount;
      showWarn(Account.cloudReady() ? '' : '当前为本地模式：账户仅保存在本设备。配置云端后可在任意电脑/手机共用同一账户。');
      if (!hasAcc) {
        $('alTitle').textContent = '创建商家账户';
        $('alSub').textContent = '用手机号注册一个商家账户，换设备也能登录';
        showBox('reg');
      } else {
        $('alTitle').textContent = '商家登录';
        $('alSub').textContent = '用手机号登录商家后台';
        showBox('login');
      }
    } catch (e) {
      showBox('login');
    }
  }
  if (!Account.isLoggedIn()) boot();

  /* ---- 注册 ---- */
  $('regBtn').onclick = async function () {
    var phone = ($('regPhone').value || '').trim();
    var p1 = ($('regPwd').value || '');
    var p2 = ($('regPwd').value || '');
    if (!/^1[3-9]\d{9}$/.test(phone)) { showErr('请输入正确的 11 位手机号'); return; }
    if (p1.length < 6) { showErr('密码至少 6 位'); return; }
    if (p1 !== p2) { showErr('两次密码不一致'); return; }
    showErr('');
    var r = await Account.register({ phone: phone, pwd: p1, remember: $('regRemember').checked });
    if (r.ok) { toast('账户已创建，已登录'); overlay.style.display = 'none'; location.reload(); }
    else { showErr(r.msg || '创建失败'); }
  };

  /* ---- 登录（密码） ---- */
  $('alBtn').onclick = async function () {
    var phone = ($('alPhone').value || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { showErr('请输入正确的 11 位手机号'); return; }
    if (curTab === 'pwd') {
      var pwd = ($('alPwd').value || '');
      if (!pwd) { showErr('请输入密码'); return; }
      var r = await Account.login({ phone: phone, pwd: pwd, remember: $('alRemember').checked });
      if (r.ok) { overlay.style.display = 'none'; location.reload(); }
      else { showErr(r.msg || '登录失败'); }
    } else {
      await loginByCode(phone);
    }
  };

  async function loginByCode(phone) {
    var code = ($('alCode').value || '').trim();
    if (!code) { showErr('请输入验证码'); return; }
    var r = await Account.loginByCode({ channel: 'sms', code: code, remember: $('alRemember').checked });
    if (r.ok) { overlay.style.display = 'none'; location.reload(); }
    else { showErr(r.msg || '登录失败'); }
  }

  /* ---- 获取登录验证码 ---- */
  window.getLoginCode = async function () {
    var phone = ($('alPhone').value || '').trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { showErr('请输入正确的 11 位手机号'); return; }
    var r = await Account.sendCode({ purpose: 'login', channel: 'sms', target: phone });
    if (r.ok) {
      toast('验证码已发送' + (r.data.devCode ? '（演示码：' + r.data.devCode + '）' : ''));
      startCountdown($('btnGetCode'), 60);
    } else { showErr(r.msg || '获取失败'); }
  };

  /* ---- 找回密码 ---- */
  window.getResetCode = async function () {
    var t = ($('rsTarget').value || '').trim();
    var isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
    var isPhone = /^1[3-9]\d{9}$/.test(t);
    if (!isPhone && !isEmail) { showErr('请输入手机号或邮箱'); return; }
    var r = await Account.sendCode({ purpose: 'reset', channel: isEmail ? 'email' : 'sms', target: t });
    if (r.ok) { toast('验证码已发送' + (r.data.devCode ? '（演示码：' + r.data.devCode + '）' : '')); startCountdown($('btnRsCode'), 60); }
    else { showErr(r.msg || '获取失败'); }
  };
  $('rsBtn').onclick = async function () {
    var t = ($('rsTarget').value || '').trim();
    var code = ($('rsCode').value || '').trim();
    var np = ($('rsPwd').value || '');
    if (np.length < 6) { showErr('新密码至少 6 位'); return; }
    var isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
    var r = await Account.resetPwd({ channel: isEmail ? 'email' : 'sms', target: t, code: code, newPwd: np });
    if (r.ok) { toast('密码已重置，已登录'); overlay.style.display = 'none'; location.reload(); }
    else { showErr(r.msg || '重置失败'); }
  };

  /* ---- 倒计时 ---- */
  function startCountdown(btn, sec) {
    if (!btn) return;
    var n = sec, timer = setInterval(function () {
      n--; btn.textContent = n + ' 秒后重试'; btn.disabled = true;
      if (n <= 0) { clearInterval(timer); btn.textContent = '获取验证码'; btn.disabled = false; }
    }, 1000);
  }

  [['regPhone'], ['regPwd'], ['regPwd2']].forEach(function (ids) {
    var el = $(ids[0]); if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('regBtn').click(); });
  });
  ['alPhone', 'alPwd', 'alCode'].forEach(function (id) {
    var el = $(id); if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('alBtn').click(); });
  });

  /* ================= 云端同步设置面板 ================= */
  var cloudModal = $('cloudModal');
  var btnCs = $('btnCloudSettings');
  if (btnCs) btnCs.onclick = function () {
    if (cloudModal) cloudModal.style.display = 'flex';
    var ei = $('envInput'); if (ei && window.CloudCore) ei.value = CloudCore.envId || '';
  };
  var cloudClose = $('cloudClose');
  if (cloudClose) cloudClose.onclick = function () { if (cloudModal) cloudModal.style.display = 'none'; };
  var btnSaveEnv = $('btnSaveEnv');
  if (btnSaveEnv) btnSaveEnv.onclick = function () {
    var v = ($('envInput').value || '').trim();
    var st = $('envStatus');
    if (!v) { st.textContent = '请输入环境 ID'; return; }
    if (!window.CloudCore) { st.textContent = '云 SDK 未加载，请刷新重试'; return; }
    var ok = CloudCore.setEnv(v);
    if (ok) { st.textContent = '已连接云端，正在刷新…'; setTimeout(function () { location.reload(); }, 700); }
    else { st.textContent = '连接失败：检查环境 ID 或网络/CDN'; }
  };

  /* ================= 账户与安全面板 ================= */
  var accModal = $('accModal');
  var btnAcc = $('btnAccount');
  if (btnAcc) btnAcc.onclick = function () {
    if (accModal) accModal.style.display = 'flex';
    refreshAccPanel();
  };
  var accClose = $('accClose');
  if (accClose) accClose.onclick = function () { if (accModal) accModal.style.display = 'none'; };

  async function refreshAccPanel() {
    var r = await Account.status();
    var d = (r && r.data) || {};
    $('accPhone').textContent = d.phone || '未绑定';
    $('accEmail').textContent = d.email || '未绑定';
    var hint = $('accHint');
    if (hint) hint.textContent = Account.cloudReady() ? '云端模式：账户在所有设备通用' : '本地模式：仅本设备有效，配置云端后跨设备通用';
  }

  // 修改密码
  var btnChPwd = $('btnAccChangePwd');
  if (btnChPwd) btnChPwd.onclick = async function () {
    var r0 = await Account.status();
    var needCode = r0 && r0.data && r0.data.hasPhone;
    var np = prompt('输入新密码（至少 6 位）：');
    if (!np || np.length < 6) { if (np !== null) alert('密码至少 6 位'); return; }
    if (needCode) {
      var code = prompt('已绑定手机，请输入手机验证码（点"获取验证码"可得，本地模式为演示码）：');
      if (!code) return;
      var r = await Account.changePwd({ channel: 'sms', code: code, newPwd: np });
      if (r.ok) { alert('密码已修改，请重新登录'); await Account.logout(); location.reload(); }
      else alert(r.msg || '修改失败');
    } else {
      var old = prompt('未绑定手机，请输入原密码：');
      if (!old) return;
      var r2 = await Account.changePwd({ oldPwd: old, newPwd: np });
      if (r2.ok) { alert('密码已修改，请重新登录'); await Account.logout(); location.reload(); }
      else alert(r2.msg || '修改失败');
    }
  };

  // 绑定手机
  var btnBindPhone = $('btnAccBindPhone');
  if (btnBindPhone) btnBindPhone.onclick = async function () {
    var phone = prompt('输入要绑定的手机号：');
    if (!/^1[3-9]\d{9}$/.test((phone || '').trim())) { if (phone) alert('手机号格式不对'); return; }
    var r = await Account.sendCode({ purpose: 'bindPhone', channel: 'sms', target: phone.trim() });
    if (!r.ok) { alert(r.msg || '获取验证码失败'); return; }
    var code = prompt('验证码已发送' + (r.data.devCode ? '（演示码：' + r.data.devCode + '）' : '') + '，请输入：');
    if (!code) return;
    var r2 = await Account.bindPhone({ phone: phone.trim(), code: code });
    if (r2.ok) { toast('手机号已绑定'); refreshAccPanel(); }
    else alert(r2.msg || '绑定失败');
  };

  // 绑定邮箱
  var btnBindEmail = $('btnAccBindEmail');
  if (btnBindEmail) btnBindEmail.onclick = async function () {
    var email = prompt('输入要绑定的邮箱：');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())) { if (email) alert('邮箱格式不对'); return; }
    var r = await Account.sendCode({ purpose: 'bindEmail', channel: 'email', target: email.trim() });
    if (!r.ok) { alert(r.msg || '获取验证码失败'); return; }
    var code = prompt('验证码已发送' + (r.data.devCode ? '（演示码：' + r.data.devCode + '）' : '') + '，请输入：');
    if (!code) return;
    var r2 = await Account.bindEmail({ email: email.trim(), code: code });
    if (r2.ok) { toast('邮箱已绑定'); refreshAccPanel(); }
    else alert(r2.msg || '绑定失败');
  };

  // 退出登录
  var btnLogout = $('btnAccLogout');
  if (btnLogout) btnLogout.onclick = async function () {
    await Account.logout(); location.reload();
  };
})();
