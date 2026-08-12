// pages/order/order.js
var Store = require('../../utils/store.js');
var fmt = require('../../utils/format.js');

Page({
  data: {
    tab: 'all', orders: [], view: [],
    reviewOpen: false, reviewOrder: '', rating: 5, comment: ''
  },
  onLoad() {
    var self = this;
    this.unsub = Store.watchOrders({ customerId: (getApp().globalData.openid || '') }, function (list) { self.setList(list); });
    this.load();
  },
  onShow() { this.load(); },
  onUnload() { if (this.unsub) this.unsub(); },

  load() {
    var self = this;
    Store.getMyOrders(getApp().globalData.openid || '').then(function (list) { self.setList(list); }).catch(function () {});
  },
  setList(list) {
    var orders = (list || []).map(function (o) {
      return Object.assign({}, o, {
        statusText: Store.STATUS_TEXT[o.status] || o.status,
        timeText: fmt.timeStr(o.createdAt),
        canReview: o.status === 'done' && !o.reviewedAt,
        totalText: fmt.money(o.total)
      });
    });
    this.setData({ orders: orders });
    this.filter();
  },
  filter() {
    var t = this.data.tab;
    var v = this.data.orders.filter(function (o) {
      if (t === 'all') return true;
      if (t === 'active') return ['pending', 'making', 'ready'].indexOf(o.status) >= 0;
      if (t === 'done') return o.status === 'done';
      return true;
    });
    this.setData({ view: v });
  },
  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); this.filter(); },

  openReview(e) {
    this.setData({ reviewOpen: true, reviewOrder: e.currentTarget.dataset.id, rating: 5, comment: '' });
  },
  setRating(e) { this.setData({ rating: Number(e.currentTarget.dataset.r) }); },
  inputComment(e) { this.setData({ comment: e.detail.value }); },
  closeReview() { this.setData({ reviewOpen: false }); },
  submitReview() {
    var self = this;
    Store.submitReview(this.data.reviewOrder, this.data.rating, this.data.comment).then(function () {
      self.setData({ reviewOpen: false });
      wx.showToast({ title: '评价成功', icon: 'success' });
      self.load();
    }).catch(function () { wx.showToast({ title: '评价失败', icon: 'none' }); });
  }
});
