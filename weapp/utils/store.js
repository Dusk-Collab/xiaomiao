// utils/store.js —— 云开发数据层（演示版 localStorage 模拟 → 微信云数据库）
// 架构：
//   collection 'store'   doc 'main'  : 整份店铺数据（shop/settings/products/specs/coupons）
//   collection 'orders'  (独立集合)  : 每笔订单一个文档，避免「顾客下单」与「商家改状态」并发写互相覆盖
//   本地 storage 作离线兜底；doc.watch() 实现多设备实时同步
// 页面业务代码调用的 API（read/write/update/onChange/createOrder/setOrderStatus...）保持不变。
var seedMod = require('./seed.js');
var fmt = require('./format.js');

var STORE_KEY = 'om_store';        // 店铺数据本地兜底
var STORE_DOC = 'main';
var COLL_STORE = 'store';
var COLL_ORDERS = 'orders';

var listeners = [];        // 店铺数据变更订阅
var orderWatchers = [];    // 订单变更订阅 [{query, cb, handler}]
var storeWatcher = null;
var db = null;
var inited = false;

function getDB() {
  if (!db && wx.cloud) db = wx.cloud.database();
  return db;
}
function _() { return wx.cloud.database().command; }

function localStoreRead() {
  try { return wx.getStorageSync(STORE_KEY) || null; } catch (e) { return null; }
}
function localStoreWrite(d) {
  try { wx.setStorageSync(STORE_KEY, d); } catch (e) {}
}
function emit(d) {
  listeners.forEach(function (f) { try { f(d); } catch (e) {} });
}

/* ---------- 店铺数据读写 ---------- */
function read() {
  return localStoreRead() || seedMod.seed();
}

function write(data, silent) {
  data._ts = Date.now();
  localStoreWrite(data);
  if (!silent) emit(data);
  var database = getDB();
  if (database) {
    database.collection(COLL_STORE).doc(STORE_DOC).set({ data: data })
      .catch(function (e) { console.warn('cloud store set fail', e); });
  }
}

function update(fn) {
  var d = read();
  var r = fn(d);
  write(d);
  return r;
}

function onChange(fn) {
  listeners.push(fn);
  return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
}

/* 拉取云端（唯一真源）+ 监听实时变化 */
function initCloud() {
  if (inited) return;
  inited = true;
  var database = getDB();
  if (!database) return;

  database.collection(COLL_STORE).doc(STORE_DOC).get()
    .then(function (res) {
      var cloud = res.data;
      if (cloud && cloud.shop) {
        var local = localStoreRead();
        if (!local || JSON.stringify(local) !== JSON.stringify(cloud)) {
          localStoreWrite(cloud);
          emit(cloud);
        }
      } else {
        // 云端还没有数据，写入种子
        write(seedMod.seed(), true);
      }
    })
    .catch(function (e) { console.warn('cloud store pull fail', e); });

  try {
    storeWatcher = database.collection(COLL_STORE).doc(STORE_DOC).watch({
      onChange: function (snapshot) {
        if (snapshot.docs && snapshot.docs[0]) {
          localStoreWrite(snapshot.docs[0]);
          emit(snapshot.docs[0]);
        }
      },
      onError: function (err) { console.warn('store watch error', err); }
    });
  } catch (e) { console.warn('store watch start fail', e); }
}

/* ---------- 营业状态 ---------- */
function isOpenNow(d) {
  d = d || read();
  if (d.shop.manualClose) return false;
  if (!d.shop.isOpen) return false;
  var now = new Date();
  var cur = fmt.pad(now.getHours()) + ':' + fmt.pad(now.getMinutes());
  var s = d.shop.hours.start, e = d.shop.hours.end;
  if (s <= e) return cur >= s && cur <= e;
  return cur >= s || cur <= e;
}

/* ---------- 订单（独立集合） ---------- */
function makeCode() {
  return 'A' + String(Math.floor(Math.random() * 9000) + 1000);
}

function createOrder(payload) {
  var order = {
    code: makeCode(),
    customerId: payload.customerId || '',
    customerName: payload.customerName || '',
    items: payload.items,
    goodsTotal: payload.goodsTotal,
    deliveryFee: payload.deliveryFee,
    discount: payload.discount,
    couponName: payload.couponName || '',
    total: payload.total,
    mode: payload.mode,            // pickup | delivery
    remark: payload.remark || '',
    phone: payload.phone || '',
    address: payload.address || '',
    table: payload.table || '',
    status: 'pending',
    createdAt: Date.now(),
    timeline: [{ s: 'pending', t: Date.now() }],
    isNew: true
  };
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  return database.collection(COLL_ORDERS).add({ data: order })
    .then(function (res) {
      order._id = res._id;
      notifyOrderWatchers();
      return order;
    });
}

function setOrderStatus(id, status) {
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  return database.collection(COLL_ORDERS).doc(id).update({
    data: { status: status, isNew: false, timeline: _.push({ s: status, t: Date.now() }) }
  }).then(function () { notifyOrderWatchers(); });
}

function markSeen(id) {
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  return database.collection(COLL_ORDERS).doc(id).update({ data: { isNew: false } });
}

function submitReview(id, rating, comment) {
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  return database.collection(COLL_ORDERS).doc(id).update({
    data: { rating: rating, comment: comment, reviewedAt: Date.now() }
  }).then(function () { notifyOrderWatchers(); });
}

function getOrder(id) {
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  return database.collection(COLL_ORDERS).doc(id).get();
}

function getOrders() {
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  return database.collection(COLL_ORDERS).orderBy('createdAt', 'desc').limit(100).get()
    .then(function (res) { return res.data || []; });
}

function getMyOrders(openid) {
  var database = getDB();
  if (!database) return Promise.reject(new Error('no db'));
  var q = database.collection(COLL_ORDERS).orderBy('createdAt', 'desc').limit(50);
  if (openid) q = q.where({ customerId: openid });
  return q.get().then(function (res) { return res.data || []; });
}

/* 实时订阅订单：query 为空订阅全部（后台），否则按 customerId 过滤（顾客） */
function watchOrders(query, cb) {
  var database = getDB();
  if (!database) return function () {};
  var ref = database.collection(COLL_ORDERS).orderBy('createdAt', 'desc');
  if (query && query.customerId) ref = ref.where({ customerId: query.customerId });
  var entry = { query: query, cb: cb };
  try {
    entry.handler = ref.watch({
      onChange: function (snapshot) { cb(snapshot.docs || []); },
      onError: function (err) { console.warn('orders watch error', err); }
    });
  } catch (e) { console.warn('orders watch start fail', e); }
  orderWatchers.push(entry);
  // 立即拉一次
  getOrders().then(function (list) {
    var filtered = (query && query.customerId) ? list.filter(function (o) { return o.customerId === query.customerId; }) : list;
    cb(filtered);
  }).catch(function () {});
  return function () {
    if (entry.handler && entry.handler.close) entry.handler.close();
    orderWatchers = orderWatchers.filter(function (x) { return x !== entry; });
  };
}
function notifyOrderWatchers() {
  getOrders().then(function (list) {
    orderWatchers.forEach(function (w) {
      var filtered = (w.query && w.query.customerId) ? list.filter(function (o) { return o.customerId === w.query.customerId; }) : list;
      try { w.cb(filtered); } catch (e) {}
    });
  }).catch(function () {});
}

module.exports = {
  read: read,
  write: write,
  update: update,
  onChange: onChange,
  initCloud: initCloud,
  isOpenNow: isOpenNow,
  createOrder: createOrder,
  setOrderStatus: setOrderStatus,
  markSeen: markSeen,
  submitReview: submitReview,
  getOrder: getOrder,
  getOrders: getOrders,
  getMyOrders: getMyOrders,
  watchOrders: watchOrders,
  STATUS_TEXT: seedMod.STATUS_TEXT,
  STATUS_NEXT: seedMod.STATUS_NEXT,
  money: fmt.money,
  timeStr: fmt.timeStr,
  today: seedMod.today,
  pad: fmt.pad,
  autoCat: seedMod.autoCat,
  seed: seedMod.seed
};
