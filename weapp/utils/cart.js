// utils/cart.js —— 跨页面共享的购物车（内存态，进程内有效）
var cart = {};
function get() { return cart; }
function add(id, n) {
  n = n || 1;
  cart[id] = (cart[id] || 0) + n;
  if (cart[id] <= 0) delete cart[id];
}
function set(o) { cart = o || {}; }
function clear() { cart = {}; }
module.exports = { get: get, add: add, set: set, clear: clear };
