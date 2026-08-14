/* admin-login.js —— 后台登录门 + 云端同步设置 */
(function () {
  'use strict';
  var overlay = document.getElementById('adminLock');
  if (!overlay) return;

  // 本浏览器已登录过 → 直接放行
  if (localStorage.getItem('om_admin') === '1') overlay.style.display = 'none';

  var titleEl = document.getElementById('alTitle');
  var subEl = document.getElementById('alSub');
  var pwd = document.getElementById('alPwd');
  var pwd2 = document.getElementById('alPwd2');
  var setRow = document.getElementById('alSetRow');
  var btn = document.getElementById('alBtn');
  var errEl = document.getElementById('alErr');

  function showErr(m) { if (errEl) errEl.textContent = m || ''; }

  async function boot() {
    var hasPwd = '';
    try { hasPwd = await CloudCore.getAdminPwd(); } catch (e) {}
    if (!hasPwd) {
      titleEl.textContent = '设置管理员密码';
      subEl.textContent = '首次进入，请设置一个密码；之后换电脑用这个密码登录。';
      setRow.style.display = 'block';
      pwd.placeholder = '设置密码';
    } else {
      titleEl.textContent = '管理员登录';
      subEl.textContent = '请输入后台密码';
      setRow.style.display = 'none';
      pwd.placeholder = '请输入密码';
    }
  }

  if (localStorage.getItem('om_admin') !== '1') boot();

  btn.onclick = async function () {
    var p = (pwd.value || '').trim();
    if (!p) { showErr('请输入密码'); return; }
    var hasPwd = '';
    try { hasPwd = await CloudCore.getAdminPwd(); } catch (e) {}
    if (!hasPwd) {
      var p2 = (pwd2.value || '').trim();
      if (p !== p2) { showErr('两次密码不一致'); return; }
      try { await CloudCore.setAdminPwd(p); } catch (e) {}
      localStorage.setItem('om_admin', '1');
      overlay.style.display = 'none';
    } else {
      var ok = false;
      try { ok = await CloudCore.verifyAdmin(p); } catch (e) {}
      if (ok) { localStorage.setItem('om_admin', '1'); overlay.style.display = 'none'; }
      else { showErr('密码错误'); }
    }
  };

  [pwd, pwd2].forEach(function (el) {
    if (el) el.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
  });

  /* ---- 云端同步设置面板 ---- */
  var cloudModal = document.getElementById('cloudModal');
  var btnCs = document.getElementById('btnCloudSettings');
  if (btnCs) btnCs.onclick = function () {
    if (cloudModal) cloudModal.style.display = 'flex';
    var ei = document.getElementById('envInput');
    if (ei && window.CloudCore) ei.value = CloudCore.envId || '';
  };
  var cloudClose = document.getElementById('cloudClose');
  if (cloudClose) cloudClose.onclick = function () { if (cloudModal) cloudModal.style.display = 'none'; };

  var btnSaveEnv = document.getElementById('btnSaveEnv');
  if (btnSaveEnv) btnSaveEnv.onclick = async function () {
    var v = (document.getElementById('envInput').value || '').trim();
    var st = document.getElementById('envStatus');
    if (!v) { st.textContent = '请输入环境 ID'; return; }
    if (!window.CloudCore) { st.textContent = '云 SDK 未加载，请刷新重试'; return; }
    var ok = CloudCore.setEnv(v);
    if (ok) { st.textContent = '已连接云端，正在刷新…'; setTimeout(function () { location.reload(); }, 700); }
    else { st.textContent = '连接失败：检查环境 ID 或网络/CDN'; }
  };

  var btnSetPwd = document.getElementById('btnSetPwd');
  if (btnSetPwd) btnSetPwd.onclick = async function () {
    var p = prompt('输入新管理员密码：');
    if (!p) return;
    var p2 = prompt('再输入一次新密码：');
    if (p !== p2) { alert('两次不一致'); return; }
    try { await CloudCore.setAdminPwd(p); localStorage.setItem('om_admin', '1'); alert('密码已更新'); }
    catch (e) { alert('设置失败'); }
  };
})();
