// pages/customer/customer.js
var Store = require('../../utils/store.js');
var fmt = require('../../utils/format.js');
var cart = require('../../utils/cart.js');

Page({
  data: {
    shop: {}, noticeOn: false, isOpen: false,
    banner: [], categories: ['全部'], activeCat: '全部',
    hot: [], products: [],
    cart: {}, cartCount: 0, cartTotal: 0, cartOpen: false, cartList: [],
    checkoutOpen: false, mode: 'pickup', phone: '', remark: '', table: '',
    coupons: []
  },

  onLoad() {
    Store.initCloud();
    this.unsub = Store.onChange(function (d) { this.render(d); }.bind(this));
    this.setData({ cart: cart.get() });
    this.render(Store.read());
  },
  onShow() { this.setData({ cart: cart.get() }); this.recalcCart(); this.render(Store.read()); },
  onUnload() { if (this.unsub) this.unsub(); },

  render(d) {
    var all = (d.products || []).filter(function (p) { return p.on; });
    var hot = all.filter(function (p) { return p.hot; }).map(withPrice);
    var banner = all.filter(function (p) { return p.banner; }).map(withPrice);
    var cats = ['全部'].concat(d.categories || []);
    var list = this.data.activeCat === '全部'
      ? all
      : all.filter(function (p) { return p.cat === this.data.activeCat; }.bind(this));
    list = list.map(withPrice);
    this.setData({
      shop: d.shop || {},
      noticeOn: !!(d.shop && d.shop.noticeOn),
      isOpen: Store.isOpenNow(d),
      banner: banner, categories: cats, hot: hot, products: list,
      coupons: (d.coupons || []).filter(function (c) { return c.on; })
    });
    this.recalcCart();
  },

  switchCat(e) {
    this.setData({ activeCat: e.currentTarget.dataset.cat });
    this.render(Store.read());
  },

  addCart(e) {
    cart.add(e.currentTarget.dataset.id, 1);
    this.setData({ cart: cart.get() });
    this.recalcCart();
  },
  decCart(e) {
    cart.add(e.currentTarget.dataset.id, -1);
    this.setData({ cart: cart.get() });
    this.recalcCart();
  },
  recalcCart() {
    var d = Store.read();
    var map = {};
    d.products.forEach(function (p) { map[p.id] = p; });
    var list = [], count = 0, total = 0;
    var c = cart.get();
    Object.keys(c).forEach(function (id) {
      var q = c[id]; if (!q) return;
      var p = map[id]; if (!p) return;
      count += q; total += p.price * q;
      list.push({ id: id, name: p.name, price: p.price, emoji: p.emoji, color: p.color, qty: q, sub: fmt.money(p.price * q) });
    }.bind(this));
    this.setData({ cartCount: count, cartTotal: total, cartList: list });
  },

  openCart() { if (this.data.cartCount > 0) this.setData({ cartOpen: true }); },
  closeCart() { this.setData({ cartOpen: false }); },
  stop() {},
  goCheckout() {
    if (this.data.cartCount === 0) return;
    this.setData({ cartOpen: false, checkoutOpen: true });
  },
  setMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },
  inputPhone(e) { this.setData({ phone: e.detail.value }); },
  inputRemark(e) { this.setData({ remark: e.detail.value }); },
  inputTable(e) { this.setData({ table: e.detail.value }); },
  closeCheckout() { this.setData({ checkoutOpen: false }); },

  submitOrder() {
    var d = Store.read(), app = getApp();
    var items = this.data.cartList.map(function (it) {
      return { id: it.id, name: it.name, price: it.price, qty: it.qty };
    });
    var settings = d.settings || {};
    var deliveryFee = this.data.mode === 'delivery' ? (settings.deliveryFee || 0) : 0;
    var goodsTotal = this.data.cartTotal;
    var total = goodsTotal + deliveryFee;
    var payload = {
      customerId: (app.globalData && app.globalData.openid) || '',
      items: items, goodsTotal: goodsTotal, deliveryFee: deliveryFee, discount: 0,
      total: total, mode: this.data.mode, phone: this.data.phone, remark: this.data.remark, table: this.data.table
    };
    Store.createOrder(payload).then(function () {
      cart.clear();
      this.setData({ cart: cart.get(), checkoutOpen: false });
      this.recalcCart();
      wx.showToast({ title: '下单成功', icon: 'success' });
      setTimeout(function () { wx.switchTab({ url: '/pages/order/order' }); }, 600);
    }.bind(this)).catch(function () {
      wx.showToast({ title: '下单失败，请重试', icon: 'none' });
    });
  },

  goProduct(e) {
    wx.navigateTo({ url: '/pages/product/product?id=' + e.currentTarget.dataset.id });
  }
});

function withPrice(p) {
  var o = Object.assign({}, p);
  o.priceText = fmt.money(p.price);
  o.oldText = p.old ? fmt.money(p.old) : '';
  return o;
}
