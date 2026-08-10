/* GitHub 云同步层
 * 把整个店铺数据（商品/店铺/设置/订单…）作为 demo/assets/data.json 存进仓库，
 * 后台改动时提交到 main 分支，其他人打开页面时从仓库拉取最新。
 *
 * 设计要点：
 * - 读取：从 raw.githubusercontent.com 拉 data.json（带缓存击穿参数），无需等待 Pages 构建。
 * - 写入：GET 当前文件 sha → base64 PUT 提交（last-write-wins）。并发冲突时 409 重试一次（拉最新再推）。
 * - 失败时静默降级：本地 localStorage 仍可用，不阻塞业务。
 */
(function (global) {
  'use strict';

  var cfg = global.CLOUD_CONFIG || {};
  var TOKEN = cfg.token;
  var ENABLED = !!(cfg.repo && cfg.branch && cfg.dataPath && TOKEN && TOKEN.indexOf('__') !== 0);
  var API_BASE = cfg.apiBase || 'https://api.github.com';
  var RAW_BASE = cfg.rawBase || 'https://raw.githubusercontent.com';
  var API = API_BASE + '/repos/' + cfg.repo + '/contents/' + cfg.dataPath;

  function authHeaders(extra) {
    var h = { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
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
      .catch(function () { return null; });
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
      return fetch(API, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.ok) return true;
        if (res.status === 409) return retryWithLatest(data); // 并发冲突，拉最新再推
        return res.text().then(function (t) { console.warn('CloudSync.push failed', res.status, t); return false; });
      });
    }).catch(function (e) { console.warn('CloudSync.push error', e); return false; });
  }

  function getSha() {
    return fetch(API + '?ref=' + cfg.branch, { headers: authHeaders() })
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
        return fetch(API, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body)
        }).then(function (res) { return res.ok; }).catch(function () { return false; });
      });
    });
  }

  global.CloudSync = {
    enabled: ENABLED,
    pull: pull,
    push: push
  };
})(window);
