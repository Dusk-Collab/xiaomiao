/* 真实用户评价数据层
 * 顾客下单后（订单内商品）可写 5 星 + 文字 + 图片评价，存 localStorage（演示用，无后端）。
 * 与订单绑定：同一订单同一商品只能评一次（hasReviewed 防重复）。
 * 商品详情页读 getByProduct(pid) 展示真实评价；无评价返回空，由页面显示空态引导。
 */
(function (global) {
  'use strict';

  var KEY = 'om_reviews_v1';
  var AVATAR_COLORS = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6BCB77', '#C589E8', '#FF8DC3',
    '#5DADE2', '#F39C12', '#8E44AD', '#16A085', '#E91E63', '#607D8B'];

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & 0xFFFFFFFF;
    }
    return Math.abs(h);
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); }
    catch (e) { console.warn('review save fail (可能超出 localStorage 配额)', e); }
  }

  // 商品标识：pid 优先，老订单无 pid 时用 name 兜底
  function matchProduct(r, pid) {
    if (!pid) return false;
    return r.pid === pid || r.gkey === pid || (!r.pid && r.name === pid);
  }

  function getByProduct(pid) {
    if (!pid) return [];
    return load().filter(function (r) { return matchProduct(r, pid); })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function hasReviewed(orderId, gkey) {
    if (!orderId || !gkey) return false;
    return load().some(function (r) {
      return r.orderId === orderId && (r.gkey === gkey || (!r.pid && r.name === gkey));
    });
  }

  function add(rev) {
    var list = load();
    var rec = {
      id: 'r' + Date.now() + Math.floor(Math.random() * 900 + 100),
      orderId: rev.orderId || '',
      gkey: rev.gkey || rev.pid || rev.name || '',
      pid: rev.pid || (rev.gkey && rev.gkey.indexOf('p') === 0 ? rev.gkey : ''),
      name: rev.name || '',
      user: rev.user || '匿名食客',
      color: rev.color || avatarColor(rev.user || '匿名食客'),
      initial: rev.initial || (rev.user || '匿').charAt(0),
      stars: rev.stars || 5,
      text: rev.text || '',
      images: rev.images || [],
      createdAt: Date.now(),
      time: formatDate(Date.now())
    };
    list.unshift(rec);
    save(list);
    return rec;
  }

  function stats(pid) {
    var list = getByProduct(pid);
    if (!list.length) return null;
    var sum = list.reduce(function (s, r) { return s + (r.stars || 5); }, 0);
    var avg = sum / list.length;
    var good = list.filter(function (r) { return (r.stars || 5) >= 4; }).length;
    return {
      count: list.length,
      avg: Math.round(avg * 10) / 10,
      percent: Math.round(good / list.length * 100)
    };
  }

  function formatDate(ts) {
    var d = new Date(ts);
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function avatarColor(name) {
    return AVATAR_COLORS[hash(name || '匿名') % AVATAR_COLORS.length];
  }

  function initial(name) {
    name = name || '匿';
    return name.charAt(0);
  }

  global.ReviewStore = {
    load: load, save: save,
    getByProduct: getByProduct, hasReviewed: hasReviewed, add: add, stats: stats,
    avatarColor: avatarColor, initial: initial
  };
})(window);
