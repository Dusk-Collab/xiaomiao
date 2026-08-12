// pages/product/product.js
var Store = require('../../utils/store.js');
var fmt = require('../../utils/format.js');
var cart = require('../../utils/cart.js');

Page({
  data: { p: null },
  onLoad(q) {
    var d = Store.read();
    var p = (d.products || []).find(function (x) { return x.id === q.id; });
    if (p) {
      this.setData({ p: Object.assign({}, p, { priceText: fmt.money(p.price), oldText: p.old ? fmt.money(p.old) : '' }) });
    }
  },
  addCart() {
    if (this.data.p) {
      cart.add(this.data.p.id, 1);
      wx.showToast({ title: '已加入购物车' });
    }
  }
});
