/* 跨页面共享购物车（localStorage + BroadcastChannel）
 * customer.html / product.html 都用同一份购物车，加完自动同步。
 */
(function (global) {
  'use strict';

  var KEY = 'om_cart_v1';
  var CHAN = 'om_cart_sync';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }
  function save(cart) {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); }
    catch (e) {}
    try {
      if ('BroadcastChannel' in window) {
        var bc = new BroadcastChannel(CHAN);
        bc.postMessage({ t: Date.now() });
        setTimeout(function () { bc.close(); }, 80);
      }
    } catch (e) {}
  }
  function add(p, spec, unit, qty) {
    var cart = load();
    var key = p.id + '|' + spec;
    var item = cart.find(function (c) { return c.key === key; });
    if (item) item.qty += qty;
    else cart.push({
      key: key, pid: p.id, name: p.name, emoji: p.emoji, color: p.color || '#FFF1DD',
      img: p.img || '', price: unit, spec: spec || '', qty: qty
    });
    save(cart);
    return cart;
  }
  function remove(key) {
    var cart = load().filter(function (c) { return c.key !== key; });
    save(cart);
    return cart;
  }
  function setQty(key, qty) {
    var cart = load();
    var item = cart.find(function (c) { return c.key === key; });
    if (!item) return cart;
    if (qty <= 0) {
      cart = cart.filter(function (c) { return c.key !== key; });
    } else {
      item.qty = qty;
    }
    save(cart);
    return cart;
  }
  function count() {
    return load().reduce(function (s, c) { return s + c.qty; }, 0);
  }
  function total() {
    return load().reduce(function (s, c) { return s + c.price * c.qty; }, 0);
  }
  function clear() { save([]); }

  function onChange(cb) {
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) { try { cb(); } catch (err) {} }
    });
    try {
      if ('BroadcastChannel' in window) {
        var bc = new BroadcastChannel(CHAN);
        bc.onmessage = function () { try { cb(); } catch (err) {} };
      }
    } catch (e) {}
  }

  global.SCart = {
    load: load, save: save, add: add, remove: remove, setQty: setQty,
    count: count, total: total, clear: clear, onChange: onChange
  };
})(window);