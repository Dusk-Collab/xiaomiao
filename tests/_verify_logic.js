/* 校验业务逻辑：取餐码递增/跨日重置、营业时段判断（含跨夜）、计价与优惠券规则 */
const fs = require('fs');
const path = require('path');

// mock 浏览器环境
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; }
};
global.window = { addEventListener() {}, localStorage: global.localStorage };
global.BroadcastChannel = undefined;

const src = fs.readFileSync(path.join(__dirname, '..', 'demo', 'assets', 'store.js'), 'utf8');
eval(src);
const Store = global.window.Store;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { console.log('  PASS  ' + name); pass++; }
  else { console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); fail++; }
}

/* --- 1. 种子数据 --- */
const d0 = Store.read();
ok('种子数据加载', d0.products.length === 12 && d0.categories.length === 5, `products=${d0.products.length}`);
ok('默认无订单', d0.orders.length === 0);

/* --- 2. 取餐码递增 --- */
const o1 = Store.createOrder({ items: [{ name: '柠檬水', spec: '', price: 4, qty: 2 }], goodsTotal: 8, deliveryFee: 0, discount: 0, total: 8, mode: 'pickup' });
const o2 = Store.createOrder({ items: [{ name: '奶昔', spec: '', price: 8, qty: 1 }], goodsTotal: 8, deliveryFee: 0, discount: 0, total: 8, mode: 'pickup' });
ok('取餐码格式 A001', o1.code === 'A001', o1.code);
ok('取餐码递增 A002', o2.code === 'A002', o2.code);
ok('新单默认待接单', o1.status === 'pending' && o1.isNew === true);
ok('新单插到列表最前', Store.read().orders[0].id === o2.id);

/* --- 3. 跨日重置 --- */
Store.update(d => { d.codeDate = '2020-01-01'; });
const o3 = Store.createOrder({ items: [], goodsTotal: 0, deliveryFee: 0, discount: 0, total: 0, mode: 'pickup' });
ok('跨日取餐码重置为 A001', o3.code === 'A001', o3.code);

/* --- 4. 状态流转 --- */
Store.setOrderStatus(o1.id, 'making');
Store.setOrderStatus(o1.id, 'ready');
const g1 = Store.getOrder(o1.id);
ok('状态推进到待取餐', g1.status === 'ready', g1.status);
ok('isNew 被清除', g1.isNew === false);
ok('时间线完整记录', g1.timeline.length === 3, JSON.stringify(g1.timeline.map(t => t.s)));

/* --- 5. 营业时段（含跨夜） --- */
function checkHours(start, end, hh, mm, expect, label) {
  const d = Store.read();
  d.shop.hours = { start, end };
  d.shop.manualClose = false; d.shop.isOpen = true;
  Store.write(d, true);
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [2026, 7, 7, hh, mm, 0])); }
    static now() { return RealDate.now(); }
  };
  const r = Store.isOpenNow();
  global.Date = RealDate;
  ok(label, r === expect, `期望 ${expect} 实得 ${r}`);
}
checkHours('08:00', '22:00', 14, 0, true,  '普通时段 14:00 在 08-22 内 → 营业');
checkHours('08:00', '22:00', 23, 30, false, '普通时段 23:30 在 08-22 外 → 打烊');
checkHours('08:00', '22:00', 7, 59, false, '普通时段 07:59 未到点 → 打烊');
checkHours('18:00', '02:00', 23, 0, true,  '跨夜时段 23:00 在 18-02 内 → 营业');
checkHours('18:00', '02:00', 1, 30, true,  '跨夜时段 01:30 在 18-02 内 → 营业');
checkHours('18:00', '02:00', 10, 0, false, '跨夜时段 10:00 在 18-02 外 → 打烊');

/* --- 6. 手动打烊优先级 --- */
Store.update(d => { d.shop.manualClose = true; d.shop.hours = { start: '00:00', end: '23:59' }; });
ok('手动打烊覆盖营业时段', Store.isOpenNow() === false);
Store.update(d => { d.shop.manualClose = false; });
ok('取消手动打烊后恢复营业', Store.isOpenNow() === true);

/* --- 7. 计价规则（复刻 customer.html 的 calcBill） --- */
function calcBill(D, goods, mode, couponId) {
  let ship = (mode === 'delivery' && goods > 0) ? D.settings.deliveryFee : 0;
  const cp = D.coupons.find(c => c.id === couponId && c.on);
  let cut = 0, cname = '';
  if (cp && goods >= cp.threshold) {
    cname = cp.name;
    if (cp.type === 'cash') cut = Math.min(cp.value, goods);
    else if (cp.type === 'ship') cut = ship;
  }
  if (mode === 'delivery' && goods >= D.settings.freeDeliveryAt) { ship = 0; if (cp && cp.type === 'ship') cut = 0; }
  return { ship, cut, total: Math.max(0, goods + ship - cut) };
}
const D = Store.read();  // deliveryFee=3, freeDeliveryAt=25, minOrder=10
ok('自取无配送费',            calcBill(D, 20, 'pickup', null).total === 20);
ok('外送未满门槛收配送费 3',   calcBill(D, 20, 'delivery', null).total === 23);
ok('外送满 25 免配送费',       calcBill(D, 30, 'delivery', null).total === 30);
ok('满20减5 生效',            calcBill(D, 20, 'pickup', 'c2').total === 15);
ok('满20减5 未达门槛不生效',   calcBill(D, 19, 'pickup', 'c2').total === 19);
ok('满30减8 生效',            calcBill(D, 30, 'pickup', 'c3').total === 22);
ok('免运费券（外送未免运）',   calcBill(D, 20, 'delivery', 'c4').total === 20);
ok('免运费券（已自动免运不重复扣）', calcBill(D, 30, 'delivery', 'c4').total === 30);
ok('券面额不超过商品总价',     calcBill(D, 2, 'pickup', 'c1').total === 0);
ok('合计不为负数',            calcBill(D, 1, 'pickup', 'c1').total >= 0);

/* --- 8. 订单上限保护 --- */
Store.update(d => { d.orders = new Array(205).fill(0).map((_, i) => ({ id: 'x' + i, status: 'done', items: [], total: 0, createdAt: Date.now(), timeline: [] })); });
Store.createOrder({ items: [], goodsTotal: 0, deliveryFee: 0, discount: 0, total: 0, mode: 'pickup' });
ok('订单列表截断在 200 条', Store.read().orders.length === 200, String(Store.read().orders.length));

/* --- 9. 金额格式化 --- */
ok('金额格式 ¥8.00', Store.money(8) === '¥8.00', Store.money(8));
ok('金额四舍五入 ¥8.34', Store.money(8.335) === '¥8.34', Store.money(8.335));

/* --- 10. 上架自动分类（按名称关键词） --- */
ok('autoCat 珍珠奶茶→奶茶拿铁', Store.autoCat('珍珠奶茶') === '奶茶拿铁', Store.autoCat('珍珠奶茶'));
ok('autoCat 美式咖啡→咖啡',     Store.autoCat('冰美式咖啡') === '咖啡', Store.autoCat('冰美式咖啡'));
ok('autoCat 炸鸡→小吃',         Store.autoCat('香辣炸鸡') === '小吃', Store.autoCat('香辣炸鸡'));
ok('autoCat 杨枝甘露→鲜果茶',   Store.autoCat('杨枝甘露') === '鲜果茶', Store.autoCat('杨枝甘露'));
ok('autoCat 无法识别→空串',     Store.autoCat('神秘料理') === '', Store.autoCat('神秘料理'));

/* --- 11. 批量上架 + 自动分类（模拟商家后台 bulkOn） --- */
Store.update(d => {
  d.settings.autoCat = true;
  d.products[0].on = false; d.products[0].cat = '';
  d.products[1].on = false; d.products[1].cat = '';
});
Store.update(d => {
  ['p1', 'p2'].forEach(function (id) {
    var p = d.products.find(x => x.id === id);
    p.on = true;
    var c = Store.autoCat(p.name);
    if (c && d.categories.indexOf(c) < 0) d.categories.push(c);
    if (c) p.cat = c;
  });
});
var b = Store.read();
ok('批量上架后 p1.on=true', b.products[0].on === true);
ok('批量上架后 p1 自动归类', b.products[0].cat === Store.autoCat(b.products[0].name), b.products[0].cat);
ok('批量上架后 p2.on=true', b.products[1].on === true);

/* --- 12. 批量移动分类 --- */
Store.update(d => { d.products.forEach(p => { if (p.id === 'p3' || p.id === 'p4') p.cat = '招牌推荐'; }); });
ok('批量移动到「招牌推荐」生效', (function () {
  var d = Store.read();
  return d.products.find(p => p.id === 'p3').cat === '招牌推荐' && d.products.find(p => p.id === 'p4').cat === '招牌推荐';
})());

/* --- 13. 图片字段可写入并同步 --- */
Store.update(d => { d.products[0].img = 'data:image/jpeg;base64,xxx'; });
ok('商品图片字段可写入', Store.read().products[0].img.indexOf('data:image') === 0);

console.log(`\n业务逻辑校验：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
