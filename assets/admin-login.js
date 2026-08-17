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
      // 本地模式隐藏"验证码登录"标签（本地没有真实短信通道，验证码只在页面上演示，不会发短信）
      if (!Account.cloudReady()) {
        var tc = $('tabCode'); if (tc) tc.style.display = 'none';
        var tabs = document.querySelector('.al-tabs'); if (tabs) tabs.classList.add('single');
      }
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
  // 把已存的 GitHub token 脱敏显示（prefix + … + 后 4 位）。
  // 用户可在输入框覆盖重写；空串则当未配置。
  function maskToken(t) {
    if (!t) return '';
    if (t.length <= 12) return '••••••';
    return t.substring(0, 8) + '…' + t.substring(t.length - 4);
  }
  if (btnCs) btnCs.onclick = function () {
    if (cloudModal) cloudModal.style.display = 'flex';
    var ei = $('envInput'); if (ei && window.CloudCore) ei.value = CloudCore.envId || '';
    // 回填 git token 状态（仅展示占位，不直接填入 input 防误改）
    var gti = $('gitTokenInput');
    var gts = $('gitTokenStatus');
    var tk = '';
    try { tk = localStorage.getItem('om_cloud_token') || ''; } catch (e) {}
    if (gti) gti.value = '';   // input 始终清空，让用户主动粘
    if (gts) gts.textContent = tk
      ? ('已配置：' + maskToken(tk) + '（输入新 token 可覆盖；清空保存可清除）')
      : '尚未配置 token';
  };
  var cloudClose = $('cloudClose');
  if (cloudClose) cloudClose.onclick = function () { if (cloudModal) cloudModal.style.display = 'none'; };

  /* ---- GitHub token 保存 ---- */
  // token 形式：classic `ghp_xxx`（≥36 字符）/ fine-grained `github_pat_xxx` / server-to-server `ghs_xxx`
  var TOKEN_RE = /^(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|ghs_[A-Za-z0-9]{20,})$/;
  var btnSaveGitToken = $('btnSaveGitToken');
  if (btnSaveGitToken) btnSaveGitToken.onclick = function () {
    var v = ($('gitTokenInput').value || '').trim();
    var st = $('gitTokenStatus');
    var existing = '';
    try { existing = localStorage.getItem('om_cloud_token') || ''; } catch (e) {}
    // 空值 → 视作清除（用户主动清空后保存）
    if (!v) {
      try { localStorage.removeItem('om_cloud_token'); } catch (e) {}
      if (window.CLOUD_CONFIG) window.CLOUD_CONFIG.token = '__PASTE_TOKEN_HERE__';
      if (st) { st.style.color = '#1f7a1f'; st.textContent = '已清除 GitHub token，云端同步已停用。'; }
      return;
    }
    if (!TOKEN_RE.test(v)) {
      if (st) { st.style.color = '#b00'; st.textContent = 'token 格式不对（应以 ghp_ / ghs_ / github_pat_ 开头，长度 ≥ 24）'; }
      return;
    }
    try { localStorage.setItem('om_cloud_token', v); } catch (e) {}
    // 立即让当前页生效
    if (window.CLOUD_CONFIG) window.CLOUD_CONFIG.token = v;
    if (st) { st.style.color = '#1f7a1f'; st.textContent = '已启用 GitHub 同步，3 秒后刷新…'; }
    setTimeout(function () {
      // 刷新以重新拉远端 data.json
      location.reload();
    }, 1500);
  };

  var btnSaveEnv = $('btnSaveEnv');
  if (btnSaveEnv) btnSaveEnv.onclick = function () {
    var v = ($('envInput').value || '').trim();
    var st = $('envStatus');
    if (!v) { st.textContent = '请输入环境 ID'; return; }
    if (!window.CloudCore) { st.textContent = '云 SDK 未加载，请刷新重试'; return; }
    var ok = CloudCore.setEnv(v);
    if (ok) {
      st.textContent = '已连接云端，正在刷新…';
      setTimeout(function () { location.reload(); }, 700);
    } else {
      st.textContent = '连接失败：体验版 CloudBase 不支持网页端调用（官方锁定），请改用上方 A. GitHub Token。';
      st.style.color = '#b00';
    }
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
    if (hint) hint.textContent = Account.cloudReady() ? '云端模式：账户在所有设备通用' : '本地模式：仅本设备有效，可"📲 迁移账户"搬到别的电脑';
  }

  /* ================= 修改密码面板（顶栏 / 账户面板都能打开） ================= */
  var chPwdModal = $('chPwdModal');
  var btnChPwdTop = $('btnChangePwdTop');
  if (btnChPwdTop) btnChPwdTop.onclick = function () { if (chPwdModal) chPwdModal.style.display = 'flex'; refreshChPwd(); };
  var chPwdClose = $('chPwdClose');
  if (chPwdClose) chPwdClose.onclick = function () { if (chPwdModal) chPwdModal.style.display = 'none'; };

  async function refreshChPwd() {
    var errEl = $('chPwdErr'); if (errEl) errEl.textContent = '';
    var r = await Account.status();
    var d = (r && r.data) || {};
    var hint = $('chPwdHint');
    // 本地模式（未配置云端短信）一律用原密码；仅云端且已绑手机才用验证码
    var needCode = !!d.hasPhone && Account.cloudReady();
    var stepOld = $('chPwdStepOld'); if (stepOld) stepOld.style.display = needCode ? 'none' : 'block';
    var stepCode = $('chPwdStepCode'); if (stepCode) stepCode.style.display = needCode ? 'block' : 'none';
    if (hint) hint.textContent = needCode
      ? '已绑定手机号，请用手机验证码修改密码'
      : '请输入原密码以修改（本地模式无短信，用原密码即可）';
  }
  window.openChangePwdModal = function () { if (chPwdModal) chPwdModal.style.display = 'flex'; refreshChPwd(); };
  // 旧"账户面板"里的"🔒 修改密码"按钮也跳到同一个面板（保持原 id 仍能工作）
  var btnAccChangePwd = $('btnAccChangePwd');
  if (btnAccChangePwd) btnAccChangePwd.onclick = function () {
    if (accModal) accModal.style.display = 'none';
    if (chPwdModal) chPwdModal.style.display = 'flex';
    refreshChPwd();
  };

  window.getChPwdCode = async function () {
    var btn = $('btnChPwdGetCode');
    var r = await Account.sendCode({ purpose: 'changePwd', channel: 'sms' });
    if (r.ok) {
      toast('验证码已发送' + (r.data.devCode ? '（演示码：' + r.data.devCode + '）' : ''));
      startCountdown(btn, 60);
    } else { var errEl = $('chPwdErr'); if (errEl) errEl.textContent = r.msg || '获取失败'; }
  };

  var btnChPwdSubmit = $('btnChPwdSubmit');
  if (btnChPwdSubmit) btnChPwdSubmit.onclick = async function () {
    var errEl = $('chPwdErr'); if (errEl) errEl.textContent = '';
    var np = ($('chPwdNew').value || ''); var np2 = ($('chPwdNew2').value || '');
    if (np.length < 6) { if (errEl) errEl.textContent = '新密码至少 6 位'; return; }
    if (np !== np2) { if (errEl) errEl.textContent = '两次新密码不一致'; return; }
    var s = await Account.status(); var needCode = !!(s && s.data && s.data.hasPhone && Account.cloudReady());
    var opts = { newPwd: np };
    if (needCode) {
      var code = ($('chPwdCode').value || '').trim();
      if (!code) { if (errEl) errEl.textContent = '请输入手机验证码'; return; }
      opts.channel = 'sms'; opts.code = code;
    } else {
      var old = ($('chPwdOld').value || '');
      if (!old) { if (errEl) errEl.textContent = '请输入原密码'; return; }
      opts.oldPwd = old;
    }
    var r = await Account.changePwd(opts);
    if (r.ok) { if (errEl) errEl.textContent = ''; toast('密码已修改，请重新登录'); await Account.logout(); location.reload(); }
    else { if (errEl) errEl.textContent = r.msg || '修改失败'; }
  };

  /* ================= 迁移账户面板 ================= */
  var transferModal = $('transferModal');
  var transferClose = $('transferClose');
  if (transferClose) transferClose.onclick = function () { if (transferModal) transferModal.style.display = 'none'; };
  var btnAccTransfer = $('btnAccTransfer');
  if (btnAccTransfer) btnAccTransfer.onclick = function () {
    if (accModal) accModal.style.display = 'none';
    if (transferModal) transferModal.style.display = 'flex';
    switchTransferTab('export');
    regenTransfer();
  };

  window.openTransferModal = function () {
    if (transferModal) transferModal.style.display = 'flex';
    switchTransferTab('export');
    regenTransfer();
  };

  window.switchTransferTab = function (t) {
    $('tabExport').classList.toggle('on', t === 'export');
    $('tabImport').classList.toggle('on', t === 'import');
    $('transferExportBox').style.display = (t === 'export') ? 'block' : 'none';
    $('transferImportBox').style.display = (t === 'import') ? 'block' : 'none';
  };

  async function regenTransferInner() {
    var qrBox = $('transferQrBox'); var codeEl = $('transferCode'); var hintEl = $('transferExpHint');
    if (!qrBox) return;
    qrBox.innerHTML = ''; if (codeEl) codeEl.value = ''; if (hintEl) hintEl.textContent = '正在生成…';
    var r = await Account.exportTransfer();
    if (!r.ok) { if (hintEl) hintEl.textContent = '生成失败：' + (r.msg || '未知错误'); return; }
    var data = r.data || {};
    if (codeEl) codeEl.value = data.token;
    if (data.fitsQr && data.qrText) {
      var canvas = document.createElement('canvas');
      canvas.style.background = '#fff'; canvas.style.borderRadius = '6px';
      qrBox.appendChild(canvas);
      try { if (window.QR && QR.render) QR.render(canvas, data.qrText, 240); }
      catch (e) { qrBox.innerHTML = '<div style="color:#a93;font-size:12.5px;padding:8px">二维码渲染失败，请用下方"迁移码"手动复制</div>'; }
    } else {
      qrBox.innerHTML = '<div style="color:var(--ink-3);font-size:12.5px;padding:14px 8px;line-height:1.5">迁移信息太长，无法显示二维码。<br>请用下方"复制迁移码"按钮，把代码发给另一台设备。</div>';
    }
    var left = Math.max(0, Math.floor(((data.expiresAt || 0) - Date.now()) / 1000));
    var leftMin = Math.floor(left / 60); var leftSec = left % 60;
    if (hintEl) hintEl.textContent = '迁移码 10 分钟内有效，剩余 ' + leftMin + ' 分 ' + leftSec + ' 秒。账号：' + (data.preview && data.preview.phone || '') + (data.preview && data.preview.email ? ' / ' + data.preview.email : '');
    if (left > 0) {
      var tick = setInterval(function () {
        var l = Math.max(0, Math.floor(((data.expiresAt || 0) - Date.now()) / 1000));
        if (hintEl) hintEl.textContent = '迁移码 10 分钟内有效，剩余 ' + Math.floor(l / 60) + ' 分 ' + (l % 60) + ' 秒';
        if (l <= 0) clearInterval(tick);
      }, 1000);
    }
  }
  window.regenTransfer = regenTransferInner;

  window.copyTransferCode = function () {
    var codeEl = $('transferCode'); if (!codeEl) return;
    codeEl.select(); codeEl.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); toast('迁移码已复制，粘贴到另一台设备即可'); }
    catch (e) { toast('复制失败，请手动选择复制'); }
  };

  var btnTransferImport = $('btnTransferImport');
  if (btnTransferImport) btnTransferImport.onclick = async function () {
    var errEl = $('transferImportErr'); if (errEl) errEl.textContent = '';
    var tok = ($('transferInput').value || '').trim();
    if (!tok) { if (errEl) errEl.textContent = '请先粘贴迁移码'; return; }
    var r = await Account.importTransfer({ token: tok });
    if (r.ok) { if (errEl) errEl.textContent = ''; toast('账户已迁移并登录'); if (transferModal) transferModal.style.display = 'none'; location.reload(); }
    else { if (errEl) errEl.textContent = r.msg || '导入失败'; }
  };

  /* ================= 兼容旧提示式入口（不再弹 prompt） ================= */
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

  /* ---- 密码框小眼睛（点一下显示/隐藏密码，再点关闭） ---- */
  function attachEyeToggle(id) {
    var inp = $(id); if (!inp || inp.dataset.eye) return;
    inp.dataset.eye = '1';
    var wrap = document.createElement('div'); wrap.className = 'pwd-wrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    inp.style.paddingRight = '40px';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pwd-eye'; btn.textContent = '👁';
    btn.setAttribute('aria-label', '显示密码');
    wrap.appendChild(btn);
    btn.onclick = function (e) {
      e.preventDefault();
      if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; btn.setAttribute('aria-label', '隐藏密码'); }
      else { inp.type = 'password'; btn.textContent = '👁'; btn.setAttribute('aria-label', '显示密码'); }
    };
  }
  ['regPwd', 'regPwd2', 'alPwd', 'rsPwd', 'chPwdOld', 'chPwdNew', 'chPwdNew2'].forEach(attachEyeToggle);
})();
