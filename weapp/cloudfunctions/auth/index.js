/* 云函数 auth —— 商家账户中心（网页版与小程序共用）
 *
 * 设计要点：
 *   1. 密码永不明文落库：scrypt + 每账户随机 salt。
 *   2. 前端不直接读 accounts 集合（集合权限设为"仅后端可读写"），一切经本云函数。
 *   3. 验证码存 authcodes，6 位、5 分钟过期、60 秒内不可重发、最多试 5 次。
 *   4. 会话 token 存 sessions，remember 时 7 天，否则 12 小时。
 *   5. 短信走腾讯云 SMS（TC3 手写签名，零额外依赖）；邮件走 nodemailer SMTP。
 *      通道密钥存 authconfig/main（同样只有本云函数能读）。未配置则返回明确错误码。
 *
 * 统一返回：{ ok: true, data } 或 { ok: false, code, msg }
 */
const crypto = require('crypto');
const https = require('https');

// 延迟初始化：模块加载阶段不碰 cloud SDK，避免云端环境差异导致进程启动即崩溃。
// 首次调用 ensureCloud() 时再 require + init，便于捕获错误返回而非进程退出。
let cloud = null, db = null, _ = null;
async function ensureCloud() {
  if (cloud) return;
  const ENV = process.env.TCB_ENV || '';
  let app;
  try {
    const c = require('@cloudbase/node-sdk');   // 独立 CloudBase：init() 返回 app 实例
    app = c.init(ENV ? { env: ENV } : {});
  } catch (e) {
    const c = require('wx-server-sdk');          // 微信云开发兜底：init 不返回实例，用全局 cloud
    c.init(ENV ? { env: ENV } : {});
    app = c;
  }
  cloud = app;
  db = app.database();
  _ = db.command;
  console.log('[auth] cloud ready');
}

const COL_ACC = 'accounts';
const COL_CODE = 'authcodes';
const COL_SESS = 'sessions';
const COL_CFG = 'authconfig';
const ACC_ID = 'owner';
const CFG_ID = 'main';

const CODE_TTL = 5 * 60 * 1000;      // 验证码有效期
const CODE_RESEND = 60 * 1000;       // 重发间隔
const CODE_MAX_TRY = 5;              // 最多校验次数
const TTL_REMEMBER = 7 * 24 * 3600 * 1000;
const TTL_SHORT = 12 * 3600 * 1000;

/* ---------------- 通用工具 ---------------- */
function ok(data) { return { ok: true, data: data || {} }; }
function err(code, msg) { return { ok: false, code: code, msg: msg }; }

function hashPwd(pwd, salt) {
  return crypto.scryptSync(String(pwd), String(salt), 64).toString('hex');
}
function newSalt() { return crypto.randomBytes(16).toString('hex'); }
function newToken() { return crypto.randomBytes(32).toString('hex'); }
function newCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

function isPhone(v) { return /^1[3-9]\d{9}$/.test(String(v || '').trim()); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function maskPhone(v) {
  var s = String(v || '');
  return s.length === 11 ? s.slice(0, 3) + '****' + s.slice(7) : s;
}
function maskEmail(v) {
  var s = String(v || '');
  var i = s.indexOf('@');
  if (i < 1) return s;
  var name = s.slice(0, i);
  var keep = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return keep + '***' + s.slice(i);
}

/* 集合不存在时自动创建，避免首次使用报 -502005 */
async function ensureColl(name) {
  try { await db.createCollection(name); } catch (e) { /* 已存在，忽略 */ }
}

async function getDoc(coll, id) {
  try {
    var res = await db.collection(coll).doc(id).get();
    if (res && res.data) return Array.isArray(res.data) ? (res.data[0] || null) : res.data;
    return null;
  } catch (e) { return null; }
}

async function getAcc() { return await getDoc(COL_ACC, ACC_ID); }
async function getCfg() { return (await getDoc(COL_CFG, CFG_ID)) || {}; }

async function setDoc(coll, id, data) {
  await ensureColl(coll);
  try {
    await db.collection(coll).doc(id).set({ data: data });
  } catch (e) {
    // 部分环境 set 需 update 语义兜底
    await db.collection(coll).doc(id).update({ data: data });
  }
}
async function updateDoc(coll, id, data) {
  await ensureColl(coll);
  try {
    await db.collection(coll).doc(id).update({ data: data });
  } catch (e) {
    await db.collection(coll).doc(id).set({ data: data });
  }
}

/* ---------------- 会话 ---------------- */
async function issueToken(remember) {
  await ensureColl(COL_SESS);
  var token = newToken();
  var now = Date.now();
  var expireAt = now + (remember ? TTL_REMEMBER : TTL_SHORT);
  await db.collection(COL_SESS).add({ data: { token: token, createdAt: now, expireAt: expireAt } });
  // 顺手清理过期会话
  try { await db.collection(COL_SESS).where({ expireAt: _.lt(now) }).remove(); } catch (e) {}
  return { token: token, expireAt: expireAt };
}

async function checkToken(token) {
  if (!token) return false;
  try {
    var res = await db.collection(COL_SESS).where({ token: String(token) }).limit(1).get();
    var s = res && res.data && res.data[0];
    if (!s) return false;
    if (s.expireAt < Date.now()) return false;
    return true;
  } catch (e) { return false; }
}

/* ---------------- 验证码 ---------------- */
async function saveCode(target, channel, purpose, code) {
  await ensureColl(COL_CODE);
  var now = Date.now();
  // 同 target+purpose 的旧码作废
  try {
    await db.collection(COL_CODE).where({ target: target, purpose: purpose, used: false }).update({ data: { used: true } });
  } catch (e) {}
  await db.collection(COL_CODE).add({
    data: {
      target: target, channel: channel, purpose: purpose, code: code,
      createdAt: now, expireAt: now + CODE_TTL, used: false, tries: 0
    }
  });
}

async function lastCodeTime(target, purpose) {
  try {
    var res = await db.collection(COL_CODE)
      .where({ target: target, purpose: purpose })
      .orderBy('createdAt', 'desc').limit(1).get();
    var d = res && res.data && res.data[0];
    return d ? d.createdAt : 0;
  } catch (e) { return 0; }
}

/* 校验验证码；成功后标记已用 */
async function consumeCode(target, purpose, code) {
  await ensureColl(COL_CODE);
  var res;
  try {
    res = await db.collection(COL_CODE)
      .where({ target: target, purpose: purpose, used: false })
      .orderBy('createdAt', 'desc').limit(1).get();
  } catch (e) { return err('CODE_NOT_FOUND', '请先获取验证码'); }

  var d = res && res.data && res.data[0];
  if (!d) return err('CODE_NOT_FOUND', '请先获取验证码');
  if (d.expireAt < Date.now()) return err('CODE_EXPIRED', '验证码已过期，请重新获取');
  if ((d.tries || 0) >= CODE_MAX_TRY) return err('CODE_LOCKED', '验证次数过多，请重新获取验证码');

  if (String(d.code) !== String(code || '').trim()) {
    try { await db.collection(COL_CODE).doc(d._id).update({ data: { tries: (d.tries || 0) + 1 } }); } catch (e) {}
    return err('CODE_WRONG', '验证码不正确');
  }
  try { await db.collection(COL_CODE).doc(d._id).update({ data: { used: true } }); } catch (e) {}
  return ok();
}

/* ---------------- 短信发送（腾讯云 SMS，TC3 手写签名） ---------------- */
function sha256hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hmac(key, s) { return crypto.createHmac('sha256', key).update(s, 'utf8').digest(); }

function tcRequest(cfg, payloadObj) {
  return new Promise(function (resolve, reject) {
    var host = 'sms.tencentcloudapi.com';
    var service = 'sms';
    var action = 'SendSms';
    var version = '2021-01-11';
    var payload = JSON.stringify(payloadObj);
    var ts = Math.floor(Date.now() / 1000);
    var date = new Date(ts * 1000).toISOString().slice(0, 10);

    var ct = 'application/json; charset=utf-8';
    var canonicalHeaders = 'content-type:' + ct + '\n' + 'host:' + host + '\n' + 'x-tc-action:' + action.toLowerCase() + '\n';
    var signedHeaders = 'content-type;host;x-tc-action';
    var canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256hex(payload)].join('\n');

    var credScope = date + '/' + service + '/tc3_request';
    var stringToSign = ['TC3-HMAC-SHA256', ts, credScope, sha256hex(canonicalRequest)].join('\n');

    var kDate = hmac('TC3' + cfg.secretKey, date);
    var kService = hmac(kDate, service);
    var kSigning = hmac(kService, 'tc3_request');
    var signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    var authorization = 'TC3-HMAC-SHA256 Credential=' + cfg.secretId + '/' + credScope +
      ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

    var req = https.request({
      host: host, method: 'POST', path: '/',
      headers: {
        'Authorization': authorization,
        'Content-Type': ct,
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Timestamp': String(ts),
        'X-TC-Version': version,
        'X-TC-Region': cfg.region || 'ap-guangzhou'
      }
    }, function (res) {
      var buf = '';
      res.on('data', function (c) { buf += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('短信接口返回异常: ' + buf.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function sendSms(cfg, phone, code) {
  var sms = cfg.sms || {};
  if (!sms.secretId || !sms.secretKey || !sms.sdkAppId || !sms.signName || !sms.templateId) {
    return err('SMS_NOT_CONFIGURED', '短信服务未配置');
  }
  var resp = await tcRequest(sms, {
    PhoneNumberSet: ['+86' + phone],
    SmsSdkAppId: String(sms.sdkAppId),
    SignName: String(sms.signName),
    TemplateId: String(sms.templateId),
    TemplateParamSet: [code, '5']
  });
  var r = resp && resp.Response;
  if (r && r.Error) return err('SMS_FAIL', '短信发送失败：' + (r.Error.Message || r.Error.Code));
  var st = r && r.SendStatusSet && r.SendStatusSet[0];
  if (st && st.Code !== 'Ok') return err('SMS_FAIL', '短信发送失败：' + (st.Message || st.Code));
  return ok();
}

/* ---------------- 邮件发送（nodemailer SMTP） ---------------- */
async function sendEmail(cfg, to, code, purposeText) {
  var smtp = cfg.smtp || {};
  if (!smtp.host || !smtp.user || !smtp.pass) return err('EMAIL_NOT_CONFIGURED', '邮件服务未配置');
  var nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (e) { return err('EMAIL_LIB_MISSING', '邮件组件未安装'); }

  var transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 465),
    secure: smtp.secure === false ? false : true,
    auth: { user: smtp.user, pass: smtp.pass }
  });
  try {
    await transporter.sendMail({
      from: (smtp.fromName || '店铺后台') + ' <' + smtp.user + '>',
      to: to,
      subject: '【店铺后台】验证码 ' + code,
      text: '您的验证码是 ' + code + '，用于' + (purposeText || '身份验证') + '，5 分钟内有效。请勿转发给他人。'
    });
    return ok();
  } catch (e) {
    return err('EMAIL_FAIL', '邮件发送失败：' + (e && e.message ? e.message : '未知错误'));
  }
}

const PURPOSE_TEXT = {
  login: '登录',
  reset: '重置密码',
  changePwd: '修改密码',
  bindPhone: '绑定手机号',
  bindEmail: '绑定邮箱'
};

/* ================= 动作实现 ================= */

async function actStatus() {
  var acc = await getAcc();
  var cfg = await getCfg();
  return ok({
    hasAccount: !!(acc && acc.pwdHash),
    phone: acc && acc.phone ? maskPhone(acc.phone) : '',
    email: acc && acc.email ? maskEmail(acc.email) : '',
    hasPhone: !!(acc && acc.phone),
    hasEmail: !!(acc && acc.email),
    smsReady: !!(cfg.sms && cfg.sms.secretId && cfg.sms.templateId),
    emailReady: !!(cfg.smtp && cfg.smtp.host && cfg.smtp.user),
    pwdUpdatedAt: (acc && acc.pwdUpdatedAt) || 0
  });
}

/* 首次开号：只允许一次 */
async function actRegister(e) {
  var acc = await getAcc();
  if (acc && acc.pwdHash) return err('ALREADY_REGISTERED', '账户已存在，请直接登录');
  if (!isPhone(e.phone)) return err('BAD_PHONE', '请输入正确的 11 位手机号');
  var pwd = String(e.pwd || '');
  if (pwd.length < 6) return err('WEAK_PWD', '密码至少 6 位');

  var salt = newSalt();
  var now = Date.now();
  await setDoc(COL_ACC, ACC_ID, {
    phone: String(e.phone).trim(),
    email: '',
    salt: salt,
    pwdHash: hashPwd(pwd, salt),
    createdAt: now,
    pwdUpdatedAt: now
  });
  var sess = await issueToken(!!e.remember);
  return ok(sess);
}

async function actLogin(e) {
  var acc = await getAcc();
  if (!acc || !acc.pwdHash) return err('NO_ACCOUNT', '还没有账户，请先创建');
  if (String(e.phone || '').trim() !== String(acc.phone)) return err('BAD_LOGIN', '手机号或密码不正确');
  if (hashPwd(String(e.pwd || ''), acc.salt) !== acc.pwdHash) return err('BAD_LOGIN', '手机号或密码不正确');
  var sess = await issueToken(!!e.remember);
  return ok(sess);
}

async function actSendCode(e) {
  var purpose = String(e.purpose || 'login');
  var channel = String(e.channel || 'sms');
  var acc = await getAcc();
  var cfg = await getCfg();
  var target = String(e.target || '').trim();

  // 绑定类动作需要已登录
  if (purpose === 'bindPhone' || purpose === 'bindEmail' || purpose === 'changePwd') {
    if (!(await checkToken(e.token))) return err('NEED_LOGIN', '请先登录');
  }

  // 目标校验：登录/重置/改密 必须命中已绑定的手机或邮箱
  if (purpose === 'login' || purpose === 'reset' || purpose === 'changePwd') {
    if (!acc) return err('NO_ACCOUNT', '还没有账户，请先创建');
    if (channel === 'sms') {
      if (!acc.phone) return err('NO_PHONE', '账户还没绑定手机号');
      if (target && target !== acc.phone) return err('PHONE_MISMATCH', '手机号与账户不一致');
      target = acc.phone;
    } else {
      if (!acc.email) return err('NO_EMAIL', '账户还没绑定邮箱');
      if (target && target !== acc.email) return err('EMAIL_MISMATCH', '邮箱与账户不一致');
      target = acc.email;
    }
  } else if (purpose === 'bindPhone') {
    if (!isPhone(target)) return err('BAD_PHONE', '请输入正确的 11 位手机号');
    channel = 'sms';
  } else if (purpose === 'bindEmail') {
    if (!isEmail(target)) return err('BAD_EMAIL', '请输入正确的邮箱地址');
    channel = 'email';
  }

  // 重发节流
  var last = await lastCodeTime(target, purpose);
  var wait = CODE_RESEND - (Date.now() - last);
  if (last && wait > 0) return err('TOO_FREQUENT', '请 ' + Math.ceil(wait / 1000) + ' 秒后再获取');

  var code = newCode();
  var sent = channel === 'sms'
    ? await sendSms(cfg, target, code)
    : await sendEmail(cfg, target, code, PURPOSE_TEXT[purpose]);
  if (!sent.ok) return sent;

  await saveCode(target, channel, purpose, code);
  return ok({ channel: channel, target: channel === 'sms' ? maskPhone(target) : maskEmail(target), ttl: CODE_TTL / 1000 });
}

async function actLoginByCode(e) {
  var acc = await getAcc();
  if (!acc || !acc.pwdHash) return err('NO_ACCOUNT', '还没有账户，请先创建');
  var channel = String(e.channel || 'sms');
  var target = channel === 'sms' ? acc.phone : acc.email;
  if (!target) return err(channel === 'sms' ? 'NO_PHONE' : 'NO_EMAIL', '账户未绑定该验证方式');
  var r = await consumeCode(target, 'login', e.code);
  if (!r.ok) return r;
  var sess = await issueToken(!!e.remember);
  return ok(sess);
}

async function actChangePwd(e) {
  if (!(await checkToken(e.token))) return err('NEED_LOGIN', '请先登录');
  var acc = await getAcc();
  if (!acc || !acc.pwdHash) return err('NO_ACCOUNT', '还没有账户');
  var newPwd = String(e.newPwd || '');
  if (newPwd.length < 6) return err('WEAK_PWD', '新密码至少 6 位');

  if (acc.phone) {
    // 已绑手机：必须验证码（短信不可用时允许邮箱验证码）
    var ch = String(e.channel || 'sms');
    var target = ch === 'sms' ? acc.phone : acc.email;
    if (!target) return err('NO_TARGET', '验证方式不可用');
    var v = await consumeCode(target, 'changePwd', e.code);
    if (!v.ok) return v;
  } else {
    // 未绑手机：用原密码
    if (hashPwd(String(e.oldPwd || ''), acc.salt) !== acc.pwdHash) return err('BAD_OLD_PWD', '原密码不正确');
  }

  var salt = newSalt();
  await updateDoc(COL_ACC, ACC_ID, { salt: salt, pwdHash: hashPwd(newPwd, salt), pwdUpdatedAt: Date.now() });
  // 改密后清掉所有旧会话，其他设备需重新登录
  try { await db.collection(COL_SESS).where({ token: _.exists(true) }).remove(); } catch (e2) {}
  var sess = await issueToken(true);
  return ok(sess);
}

async function actResetPwd(e) {
  var acc = await getAcc();
  if (!acc || !acc.pwdHash) return err('NO_ACCOUNT', '还没有账户');
  var channel = String(e.channel || 'sms');
  var target = channel === 'sms' ? acc.phone : acc.email;
  if (!target) return err('NO_TARGET', '账户未绑定该验证方式');
  var newPwd = String(e.newPwd || '');
  if (newPwd.length < 6) return err('WEAK_PWD', '新密码至少 6 位');

  var v = await consumeCode(target, 'reset', e.code);
  if (!v.ok) return v;

  var salt = newSalt();
  await updateDoc(COL_ACC, ACC_ID, { salt: salt, pwdHash: hashPwd(newPwd, salt), pwdUpdatedAt: Date.now() });
  try { await db.collection(COL_SESS).where({ token: _.exists(true) }).remove(); } catch (e2) {}
  var sess = await issueToken(true);
  return ok(sess);
}

async function actBindPhone(e) {
  if (!(await checkToken(e.token))) return err('NEED_LOGIN', '请先登录');
  var phone = String(e.phone || '').trim();
  if (!isPhone(phone)) return err('BAD_PHONE', '请输入正确的 11 位手机号');
  var v = await consumeCode(phone, 'bindPhone', e.code);
  if (!v.ok) return v;
  await updateDoc(COL_ACC, ACC_ID, { phone: phone, phoneBoundAt: Date.now() });
  return ok({ phone: maskPhone(phone) });
}

async function actBindEmail(e) {
  if (!(await checkToken(e.token))) return err('NEED_LOGIN', '请先登录');
  var email = String(e.email || '').trim();
  if (!isEmail(email)) return err('BAD_EMAIL', '请输入正确的邮箱地址');
  var v = await consumeCode(email, 'bindEmail', e.code);
  if (!v.ok) return v;
  await updateDoc(COL_ACC, ACC_ID, { email: email, emailBoundAt: Date.now() });
  return ok({ email: maskEmail(email) });
}

async function actVerifyToken(e) {
  var valid = await checkToken(e.token);
  return ok({ valid: valid });
}

async function actLogout(e) {
  try { await db.collection(COL_SESS).where({ token: String(e.token || '') }).remove(); } catch (err2) {}
  return ok();
}

/* 配置短信/邮件通道（需登录）。写入后前端只能读到"是否已配置"，读不到密钥 */
async function actSetChannel(e) {
  if (!(await checkToken(e.token))) return err('NEED_LOGIN', '请先登录');
  var cfg = await getCfg();
  var next = {};
  if (e.sms) {
    next.sms = {
      secretId: String(e.sms.secretId || (cfg.sms && cfg.sms.secretId) || ''),
      secretKey: String(e.sms.secretKey || (cfg.sms && cfg.sms.secretKey) || ''),
      sdkAppId: String(e.sms.sdkAppId || (cfg.sms && cfg.sms.sdkAppId) || ''),
      signName: String(e.sms.signName || (cfg.sms && cfg.sms.signName) || ''),
      templateId: String(e.sms.templateId || (cfg.sms && cfg.sms.templateId) || ''),
      region: String(e.sms.region || (cfg.sms && cfg.sms.region) || 'ap-guangzhou')
    };
  }
  if (e.smtp) {
    next.smtp = {
      host: String(e.smtp.host || (cfg.smtp && cfg.smtp.host) || ''),
      port: Number(e.smtp.port || (cfg.smtp && cfg.smtp.port) || 465),
      secure: e.smtp.secure === false ? false : true,
      user: String(e.smtp.user || (cfg.smtp && cfg.smtp.user) || ''),
      pass: String(e.smtp.pass || (cfg.smtp && cfg.smtp.pass) || ''),
      fromName: String(e.smtp.fromName || (cfg.smtp && cfg.smtp.fromName) || '店铺后台')
    };
  }
  if (!next.sms && !next.smtp) return err('NOTHING_TO_SAVE', '没有需要保存的配置');
  await updateDoc(COL_CFG, CFG_ID, next);
  return ok();
}

/* ================= 入口 ================= */
async function dispatch(e) {
  var action = String((e && e.action) || '');
  try {
    await ensureCloud();
    switch (action) {
      case 'status': return await actStatus();
      case 'register': return await actRegister(e);
      case 'login': return await actLogin(e);
      case 'sendCode': return await actSendCode(e);
      case 'loginByCode': return await actLoginByCode(e);
      case 'changePwd': return await actChangePwd(e);
      case 'resetPwd': return await actResetPwd(e);
      case 'bindPhone': return await actBindPhone(e);
      case 'bindEmail': return await actBindEmail(e);
      case 'verifyToken': return await actVerifyToken(e);
      case 'logout': return await actLogout(e);
      case 'setChannel': return await actSetChannel(e);
      default: return err('BAD_ACTION', '未知操作：' + action);
    }
  } catch (ex) {
    console.error('auth error', action, ex);
    return err('SERVER_ERROR', (ex && ex.message) ? ex.message : '服务异常');
  }
}

exports.main = async function (event) {
  // 兼容事件触发：Web SDK callFunction（event={action,...}）或 HTTP 函数包装（event.httpMethod+body）
  var isHttp = !!(event && event.httpMethod);
  var e;
  if (isHttp) {
    if (event.httpMethod === 'OPTIONS') {   // 浏览器跨域预检
      return { statusCode: 204, headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }, body: '' };
    }
    var raw = event.body;
    try { e = (typeof raw === 'string') ? JSON.parse(raw || '{}') : (raw || {}); }
    catch (_) { e = {}; }
  } else {
    e = event || {};
  }
  var result = await dispatch(e);
  if (isHttp) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(result) };
  }
  return result;
};

/* Web 函数模式：scf_bootstrap 以 `node index.js` 启动（已 export PORT=9000），
 * 必须自行监听端口，否则函数无法对外提供服务。
 * 网页端直接 fetch 云函数 URL 即可调用，自带 CORS 头，绕过 Web 安全域名白名单限制（体验版不支持）。 */
if (require.main === module || process.env.PORT) {
  var httpMod = require('http');
  var PORT = process.env.PORT || 9000;
  var server = httpMod.createServer(function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    var body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', async function () {
      var e = {};
      try { e = body ? JSON.parse(body) : {}; } catch (_) { e = {}; }
      var result = await dispatch(e);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(result));
    });
  });
  server.listen(PORT, function () { console.log('[auth] http server listening on ' + PORT); });
}
