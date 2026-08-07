/* 共享数据层
 * 演示版用 localStorage 模拟云数据库，用 storage 事件 + BroadcastChannel 模拟实时监听（onSnapshot）。
 * 上线时把 Store.read/write 换成微信云开发 db.collection(...).watch() 即可，业务代码不用动。
 */
(function (global) {
  'use strict';

  var KEY = 'ordermate_v2';
  var CHANNEL = 'ordermate_sync_v1';
  var SYNC_TOPIC = 'scanorder/demo_v1';
  var bc = ('BroadcastChannel' in global) ? new BroadcastChannel(CHANNEL) : null;
  var listeners = [];
  var syncListeners = [];
  var SYNC_ONLINE = false;
  var enc = ('TextEncoder' in global) ? new TextEncoder() : null;
  var dec = ('TextDecoder' in global) ? new TextDecoder() : null;

  /* ---------- 种子数据 ---------- */
  function seed() {
    return {
      shop: {
        name: '晨光早餐 · 中心街店',
        slogan: '现做热乎 · 5分钟出餐',
        logo: '🥐',
        logoImg: '',
        notice: '今天豆浆油条套餐 6.8 折，欢迎到店自取～ 取餐时请报取餐码。',
        noticeOn: true,
        isOpen: true,
        manualClose: false,
        hours: { start: '06:00', end: '13:00' },
        phone: '13800138000',
        address: '中心街 88 号 1 楼'
      },
      settings: {
        deliveryFee: 3,
        freeDeliveryAt: 25,
        minOrder: 10,
        soundOn: true,
        autoAccept: false,
        autoCat: true
      },
      categories: ['招牌套餐', '中式早餐', '西式面包', '豆浆饮品', '小吃配菜'],
      products: [
        { id: 'p1',  name: '豆浆油条套餐',   price: 6,  old: 8,  cat: '招牌套餐', emoji: '🥢', color: '#FFF1DD', desc: '现磨豆浆 + 现炸油条',     on: true,  stock: 999, hot: true,  sold: 1288 },
        { id: 'p2',  name: '皮蛋瘦肉粥',     price: 8,  old: 10, cat: '中式早餐', emoji: '🍲', color: '#FFE9D6', desc: '现熬 30 分钟，米粒开花', on: true,  stock: 999, hot: true,  sold: 962 },
        { id: 'p3',  name: '小笼包 6 个',    price: 7,  old: 0,  cat: '中式早餐', emoji: '🥟', color: '#F0E2D0', desc: '皮薄馅足，趁热吃',       on: true,  stock: 999, hot: false, sold: 2104 },
        { id: 'p4',  name: '茶叶蛋',         price: 2,  old: 0,  cat: '小吃配菜', emoji: '🥚', color: '#F8E2C5', desc: '卤香入味，每天现卤',     on: true,  stock: 60,  hot: false, sold: 733 },
        { id: 'p5',  name: '现磨豆浆',       price: 4,  old: 0,  cat: '豆浆饮品', emoji: '🥛', color: '#FFF6E5', desc: '黄豆现磨，无添加糖',     on: true,  stock: 40,  hot: false, sold: 512 },
        { id: 'p6',  name: '甜豆浆',         price: 4,  old: 0,  cat: '豆浆饮品', emoji: '☕', color: '#FFEDD0', desc: '现磨豆浆 + 白砂糖',       on: true,  stock: 999, hot: true,  sold: 3011 },
        { id: 'p7',  name: '葱油饼',         price: 5,  old: 7,  cat: '中式早餐', emoji: '🥞', color: '#FFEABF', desc: '现煎两面金黄，外酥里软', on: true,  stock: 30,  hot: false, sold: 288 },
        { id: 'p8',  name: '肉夹馍',         price: 8,  old: 0,  cat: '中式早餐', emoji: '🌮', color: '#F4DEC2', desc: '腊汁肉 + 现烤白吉馍',     on: true,  stock: 999, hot: false, sold: 401 },
        { id: 'p9',  name: '火腿三明治',     price: 9,  old: 0,  cat: '西式面包', emoji: '🥪', color: '#FFE4C6', desc: '现烤吐司 + 火腿 + 生菜', on: true,  stock: 80,  hot: false, sold: 655 },
        { id: 'p10', name: '金枪鱼三明治',   price: 11, old: 0,  cat: '西式面包', emoji: '🥙', color: '#FFE0D6', desc: '沙拉酱 + 玉米粒',         on: true,  stock: 25,  hot: false, sold: 344 },
        { id: 'p11', name: '可颂牛角包',     price: 6,  old: 0,  cat: '西式面包', emoji: '🥐', color: '#FFEFCB', desc: '黄油可颂，烤箱加热',     on: true,  stock: 999, hot: false, sold: 897 },
        { id: 'p12', name: '酸辣萝卜条',     price: 3,  old: 0,  cat: '小吃配菜', emoji: '🥒', color: '#FFF7E0', desc: '解腻开胃，每日现拌',     on: false, stock: 0,   hot: false, sold: 199 }
      ],
      specs: {
        cup:   { label: '杯型', required: true,  options: [{ n: '中杯', p: 0 }, { n: '大杯', p: 2 }] },
        temp:  { label: '温度', required: true,  options: [{ n: '标准冰', p: 0 }, { n: '少冰', p: 0 }, { n: '去冰', p: 0 }, { n: '常温', p: 0 }, { n: '热饮', p: 0 }] },
        sugar: { label: '糖度', required: true,  options: [{ n: '全糖', p: 0 }, { n: '七分糖', p: 0 }, { n: '五分糖', p: 0 }, { n: '三分糖', p: 0 }, { n: '无糖', p: 0 }] },
        extra: { label: '加料', multi: true,     options: [{ n: '珍珠', p: 1 }, { n: '椰果', p: 1 }, { n: '布丁', p: 2 }, { n: '芝士奶盖', p: 3 }] }
      },
      coupons: [
        { id: 'c1', name: '新客立减 3 元', type: 'cash', threshold: 0,  value: 3, on: true },
        { id: 'c2', name: '满 20 减 5',    type: 'cash', threshold: 20, value: 5, on: true },
        { id: 'c3', name: '满 30 减 8',    type: 'cash', threshold: 30, value: 8, on: true },
        { id: 'c4', name: '免配送费',      type: 'ship', threshold: 15, value: 0, on: true }
      ],
      orders: [],
      codeSeq: 0,
      codeDate: today()
    };
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- 读写 ---------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) { var s = seed(); localStorage.setItem(KEY, JSON.stringify(s)); return s; }
      var d = JSON.parse(raw);
      if (!d.products || !d.shop) { var s2 = seed(); localStorage.setItem(KEY, JSON.stringify(s2)); return s2; }
      return d;
    } catch (e) {
      var s3 = seed(); localStorage.setItem(KEY, JSON.stringify(s3)); return s3;
    }
  }

  function write(data, silent) {
    data._ts = Date.now();
    localStorage.setItem(KEY, JSON.stringify(data));
    if (!silent) {
      if (bc) bc.postMessage({ t: data._ts });
      emit(data);
      publishRemote(data);
    }
  }

  function publishRemote(data) {
    if (!SYNC_ONLINE || !global.Sync || !global.Sync.publish || !enc) return;
    try {
      var payload = enc.encode(JSON.stringify({ sender: global.Sync.id, state: data }));
      global.Sync.publish(SYNC_TOPIC, payload);
    } catch (e) { /* 离线或编码失败，静默忽略 */ }
  }

  function applyRemote(wrapper) {
    try {
      if (!wrapper || !wrapper.state) return;
      if (wrapper.sender && global.Sync && wrapper.sender === global.Sync.id) return; // 忽略自己的回声
      var remote = wrapper.state;
      var local = read();
      if (remote._ts && local._ts && remote._ts < local._ts) return; // 只接受更新的状态，防旧数据覆盖
      localStorage.setItem(KEY, JSON.stringify(remote));
      emit(remote); // 通知 UI 重渲染（不触发 publish，避免回环）
    } catch (e) { console.warn('applyRemote fail', e); }
  }

  function notifySyncStatus(s) {
    SYNC_ONLINE = (s === 'online');
    if (global) global.__SYNC__ = s;
    syncListeners.forEach(function (f) { try { f(s); } catch (e) {} });
  }

  function initSync() {
    if (!global.Sync) return;
    global.Sync.init({
      topic: SYNC_TOPIC,
      onStatus: notifySyncStatus,
      onMessage: function (t, bytes) {
        if (t !== SYNC_TOPIC || !dec) return;
        try { applyRemote(JSON.parse(dec.decode(bytes))); }
        catch (e) { console.warn('sync msg parse fail', e); }
      }
    });
  }

  function onSyncStatus(fn) {
    syncListeners.push(fn);
    return function () { syncListeners = syncListeners.filter(function (f) { return f !== fn; }); };
  }

  function update(fn) {
    var d = read();
    var r = fn(d);
    write(d);
    return r;
  }

  function reset() { localStorage.removeItem(KEY); var s = seed(); write(s); return s; }

  /* ---------- 订阅 ---------- */
  function emit(data) { listeners.forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }
  function onChange(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  global.addEventListener('storage', function (e) { if (e.key === KEY) emit(read()); });
  if (bc) bc.onmessage = function () { emit(read()); };

  /* ---------- 业务方法 ---------- */
  function isOpenNow(d) {
    d = d || read();
    if (d.shop.manualClose) return false;
    if (!d.shop.isOpen) return false;
    var now = new Date();
    var cur = pad(now.getHours()) + ':' + pad(now.getMinutes());
    var s = d.shop.hours.start, e = d.shop.hours.end;
    if (s <= e) return cur >= s && cur <= e;
    return cur >= s || cur <= e;   // 跨夜营业
  }

  function nextCode(d) {
    var t = today();
    if (d.codeDate !== t) { d.codeDate = t; d.codeSeq = 0; }
    d.codeSeq++;
    return 'A' + String(d.codeSeq).padStart(3, '0');
  }

  function createOrder(payload) {
    return update(function (d) {
      var code = nextCode(d);
      var order = {
        id: 'o' + Date.now() + Math.floor(Math.random() * 900 + 100),
        code: code,
        items: payload.items,
        goodsTotal: payload.goodsTotal,
        deliveryFee: payload.deliveryFee,
        discount: payload.discount,
        couponName: payload.couponName || '',
        total: payload.total,
        mode: payload.mode,            // pickup | delivery
        remark: payload.remark || '',
        phone: payload.phone || '',
        table: payload.table || '',
        status: 'pending',             // pending -> making -> ready -> done
        createdAt: Date.now(),
        timeline: [{ s: 'pending', t: Date.now() }],
        isNew: true
      };
      d.orders.unshift(order);
      if (d.orders.length > 200) d.orders.length = 200;
      return order;
    });
  }

  function setOrderStatus(id, status) {
    update(function (d) {
      var o = d.orders.find(function (x) { return x.id === id; });
      if (!o) return;
      o.status = status;
      o.isNew = false;
      o.timeline.push({ s: status, t: Date.now() });
    });
  }

  function markSeen(id) {
    update(function (d) {
      var o = d.orders.find(function (x) { return x.id === id; });
      if (o) o.isNew = false;
    });
  }

  function getOrder(id) {
    return read().orders.find(function (x) { return x.id === id; });
  }

  var STATUS_TEXT = { pending: '待接单', making: '制作中', ready: '待取餐', done: '已完成', canceled: '已取消' };
  var STATUS_NEXT = { pending: 'making', making: 'ready', ready: 'done' };

  function money(n) { return '¥' + (Math.round(n * 100) / 100).toFixed(2); }
  function timeStr(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* ---------- 上架自动分类（按名称关键词推断，可手动覆盖） ---------- */
  var KEYWORD_CAT = {
    '奶茶': '奶茶拿铁', '拿铁': '奶茶拿铁', '奶绿': '奶茶拿铁', '牛乳': '奶茶拿铁', '芝士': '奶茶拿铁',
    '咖啡': '咖啡', '美式': '咖啡', '浓缩': '咖啡',
    '柠檬': '鲜果茶', '百香果': '鲜果茶', '果': '鲜果茶', '莓': '鲜果茶', '葡萄': '鲜果茶',
    '芒': '鲜果茶', '椰': '鲜果茶', '杨枝': '鲜果茶', '茶': '鲜果茶', '圣代': '冰淇淋',
    '冰淇淋': '冰淇淋', '雪糕': '冰淇淋',
    '薯': '小吃', '鸡': '小吃', '翅': '小吃', '汉堡': '小吃', '肠': '小吃', '披萨': '小吃', '串': '小吃',
    '推荐': '招牌推荐', '招牌': '招牌推荐', '爆款': '招牌推荐'
  };
  function autoCat(name) {
    if (!name) return '';
    var n = String(name);
    for (var k in KEYWORD_CAT) {
      if (KEYWORD_CAT.hasOwnProperty(k) && n.indexOf(k) >= 0) return KEYWORD_CAT[k];
    }
    return '';
  }

  /* ---------- 图片压缩（浏览器端，上传前压成小图，避免撑爆存储/同步） ---------- */
  function compressImage(file, maxW, quality, cb) {
    if (!file || typeof FileReader === 'undefined' || typeof document === 'undefined') { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var w = img.width || maxW, h = img.height || maxW;
        var scale = Math.min(1, maxW / w);
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        try {
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          cb(cv.toDataURL('image/jpeg', quality || 0.6));
        } catch (err) { cb(reader.result); }
      };
      img.onerror = function () { cb(reader.result); };
      img.src = e.target.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  global.Store = {
    read: read, write: write, update: update, reset: reset, seed: seed,
    onChange: onChange,
    initSync: initSync, onSyncStatus: onSyncStatus,
    isOpenNow: isOpenNow,
    createOrder: createOrder, setOrderStatus: setOrderStatus, markSeen: markSeen, getOrder: getOrder,
    STATUS_TEXT: STATUS_TEXT, STATUS_NEXT: STATUS_NEXT,
    money: money, timeStr: timeStr, today: today, pad: pad,
    autoCat: autoCat, compressImage: compressImage
  };
})(window);
