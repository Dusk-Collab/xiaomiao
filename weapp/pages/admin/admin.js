// pages/admin/admin.js
var Store = require('../../utils/store.js');
var fmt = require('../../utils/format.js');

Page({
  data: {
    sec: 'orders',
    tab: 'all',
    orders: [], view: [],
    shop: {}, products: []
  },
  onLoad() {
    var self = this;
    this.unsub = Store.watchOrders({}, function (list) { self.setList(list); });
    this.unsubStore = Store.onChange(function (d) { self.render(d); });
    this.render(Store.read());
  },
  onShow() { this.render(Store.read()); },
  onUnload() { if (this.unsub) this.unsub(); if (this.unsubStore) this.unsubStore(); },

  render(d) {
    this.setData({
      shop: d.shop || {},
      products: (d.products || []).map(function (p) {
        return Object.assign({}, p, { priceText: fmt.money(p.price) });
      })
    });
  },
  setList(list) {
    var self = this;
    var orders = (list || []).map(function (o) {
      return Object.assign({}, o, {
        statusText: Store.STATUS_TEXT[o.status] || o.status,
        timeText: fmt.timeStr(o.createdAt),
        totalText: fmt.money(o.total),
        next: Store.STATUS_NEXT[o.status] || ''
      });
    });
    this.setData({ orders: orders });
    this.filter();
  },
  filter() {
    var t = this.data.tab;
    var v = this.data.orders.filter(function (o) { return t === 'all' ? true : o.status === t; });
    this.setData({ view: v });
  },
  switchSec(e) { this.setData({ sec: e.currentTarget.dataset.sec }); },
  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); this.filter(); },

  advance(e) {
    var id = e.currentTarget.dataset.id, status = e.currentTarget.dataset.status;
    Store.setOrderStatus(id, status).catch(function () { wx.showToast({ title: '操作失败', icon: 'none' }); });
  },
  toggleProduct(e) {
    var id = e.currentTarget.dataset.id;
    var val = e.detail.value;
    Store.update(function (d) {
      var p = d.products.find(function (x) { return x.id === id; });
      if (p) p.on = val;
    });
  },
  inputName(e) { this.setData({ 'shop.name': e.detail.value }); },
  inputNotice(e) { this.setData({ 'shop.notice': e.detail.value }); },
  toggleOpen(e) { this.setData({ 'shop.isOpen': e.detail.value }); },
  saveShop() {
    var self = this;
    Store.update(function (d) {
      d.shop.name = self.data.shop.name;
      d.shop.notice = self.data.shop.notice;
      d.shop.isOpen = self.data.shop.isOpen;
    });
    wx.showToast({ title: '已保存并同步', icon: 'success' });
  }
});
