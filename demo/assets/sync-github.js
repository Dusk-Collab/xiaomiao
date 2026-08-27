/* GitHub 云同步层
 * 把整个店铺数据（商品/店铺/设置/订单…）作为 demo/assets/data.json 存进仓库，
 * 后台改动时提交到 main 分支，其他人打开页面时从仓库拉取最新。
 *
 * 两种写入模式（由 cloud-config.js 决定）：
 *  - 手动模式：浏览器带 token 直连 GitHub API（token 来自本机 localStorage）。
 *  - 代理模式：proxyBase 非空时，写入请求走 Cloudflare Worker 代理，
 *    浏览器不持有 token，实现“零粘贴、跨设备自动同步”。
 *
 * 读取统一从 raw.githubusercontent.com 拉 data.json（公开、无需 token）。
 * 写入：GET 当前文件 sha → base64 PUT 提交（last-write-wins）；并发冲突 409 重试一次。
 * 失败时静默降级：本地 localStorage 仍可用，不阻塞业务。
 */
(function (global) {
  'use strict';

  var cfg = global.CLOUD_CONFIG || {};
  var TOKEN = cfg.token;
  // 关键修复：后台「☁ 云端同步设置」粘的 token 只存本机 localStorage，刷新后
  // CLOUD_CONFIG.token 会回到占位符，必须从 localStorage 读回，否则同步永远不启用。
  try {
    var _lsTok = global.localStorage && global.localStorage.getItem('om_cloud_token');
    if (_lsTok && _lsTok.indexOf('__') !== 0) TOKEN = _lsTok;
  } catch (e) {}
  var PROXY = (cfg.proxyBase && cfg.proxyBase.indexOf('http') === 0) ? cfg.proxyBase : '';
  // 2026-08-27 修复：一旦浏览器里有有效 token（后台「云端同步设置」粘贴），
  // 一律走 api.github.com 直连，忽略 proxyBase——原 Worker 代理域名在大陆网络
  // 已被 DNS 污染不可达，若继续优先代理会导致"贴了 token 也推不上去"。
  if (TOKEN && TOKEN.indexOf('__') !== 0) PROXY = '';
  var ENABLED = !!(cfg.repo && cfg.branch && cfg.dataPath) &&
    ((!!TOKEN && TOKEN.indexOf('__') !== 0) || !!PROXY);
  var API_BASE = cfg.apiBase || 'https://api.github.com';
  var RAW_BASE = cfg.rawBase || 'https://raw.githubusercontent.com';
  var API = API_BASE + '/repos/' + cfg.repo + '/contents/' + cfg.dataPath;

  function authHeaders(extra) {
    var h = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function proxyHeaders(extra) {
    var h = { 'Content-Type': 'application/json' };
    if (cfg.proxyKey) h['x-admin-key'] = cfg.proxyKey;
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }

  function reqHeaders(extra) {
    return PROXY ? proxyHeaders(extra) : authHeaders(extra);
  }

  // 代理模式：所有请求走代理（路径通过 ?path= 传），代理内部已绑定仓库/分支/token
  function apiUrlFor() {
    if (PROXY) return PROXY + '/?path=' + encodeURIComponent(cfg.dataPath);
    return API;
  }

  // 取 sha 用的地址：代理模式不带 ?ref（代理内部已绑定分支），直连模式需带
  function shaUrlFor() {
    if (PROXY) return PROXY + '/?path=' + encodeURIComponent(cfg.dataPath);
    return API + '?ref=' + cfg.branch;
  }

  // 把 UTF-8 字符串转 base64（浏览器 btoa 只认 Latin1，需先 encodeURIComponent 转义）
  function toBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  function pull() {
    if (!ENABLED) return Promise.resolve(null);
    var url = RAW_BASE + '/' + cfg.repo + '/' + cfg.branch + '/' + cfg.dataPath + '?t=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .catch(function () { return null; })
      .then(function (j) {
        if (j && j.shop) return j;
        // raw.githubusercontent 被墙/DNS 污染时兜底：直接读本站同目录下的
        // data.json（站点本身能打开就一定能读到，最多滞后 Pages CDN ~10 分钟）。
        return fetch('assets/' + (cfg.dataPath || '').split('/').pop() + '?t=' + Date.now(), { cache: 'no-store' })
          .then(function (res) { return res.ok ? res.json() : null; })
          .catch(function () { return null; });
      });
  }

  function push(data) {
    if (!ENABLED) return Promise.resolve(false);
    return getSha().then(function (sha) {
      var body = {
        message: 'sync: update store data (cloud)',
        content: toBase64(JSON.stringify(data, null, 2)),
        branch: cfg.branch
      };
      if (sha) body.sha = sha;
      return fetch(apiUrlFor(), {
        method: 'PUT',
        headers: reqHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.ok) return true;
        if (res.status === 409) return retryWithLatest(data); // 并发冲突，拉最新再推
        return res.text().then(function (t) { console.warn('CloudSync.push failed', res.status, t); return false; });
      });
    }).catch(function (e) { console.warn('CloudSync.push error', e); return false; });
  }

  function getSha() {
    return fetch(shaUrlFor(), { headers: reqHeaders() })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (j) { return j && j.sha ? j.sha : null; })
      .catch(function () { return null; });
  }

  // 409：说明别人先提交了。拉最新 -> 用最新做底，覆盖式再推一次（last-write-wins）。
  function retryWithLatest(data) {
    return pull().then(function (latest) {
      if (!latest) return push(data); // 拉不到就原样再试
      // 合并订单（按 id 去重），其余字段以本地（data）为准，但 _ts 取较新
      if (Array.isArray(latest.orders) && Array.isArray(data.orders)) {
        var byId = {};
        latest.orders.concat(data.orders).forEach(function (o) { byId[o.id] = o; });
        data.orders = Object.keys(byId).map(function (k) { return byId[k]; });
      }
      data._ts = Math.max(data._ts || 0, latest._ts || 0);
      return getSha().then(function (sha) {
        var body = {
          message: 'sync: merge store data (cloud)',
          content: toBase64(JSON.stringify(data, null, 2)),
          branch: cfg.branch
        };
        if (sha) body.sha = sha;
        return fetch(apiUrlFor(), {
          method: 'PUT',
          headers: reqHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        }).then(function (res) { return res.ok; }).catch(function () { return false; });
      });
    });
  }

  global.CloudSync = {
    enabled: ENABLED,
    proxyMode: !!PROXY,
    pull: pull,
    push: push
  };
})(window);
