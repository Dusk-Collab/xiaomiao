/* 端到端校验：真实浏览器里跑完整下单链路，并验证双端实时同步 */
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8931';

const fs = require('fs');
const LOG = __dirname + '/_e2e_log.txt';
try { fs.unlinkSync(LOG); } catch (e) {}
function say(s) { fs.appendFileSync(LOG, s + '\n'); console.log(s); }
let pass = 0, fail = 0;
const errors = [];
function ok(name, cond, extra) {
  if (cond) { say('  PASS  ' + name); pass++; }
  else { say('  FAIL  ' + name + (extra ? '  → ' + extra : '')); fail++; }
}
function step(s) { fs.appendFileSync(LOG, '    ..' + s + '\n'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });

  // 同一 browser context 下的两个页面共享 localStorage + BroadcastChannel
  const cust = await browser.newPage();
  const admin = await browser.newPage();

  for (const [name, pg] of [['customer', cust], ['admin', admin]]) {
    pg.on('pageerror', e => { errors.push(`[${name}] pageerror: ${e.message}`); });
    pg.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] console.error: ${m.text()}`); });
    pg.on('requestfailed', r => { errors.push(`[${name}] 资源加载失败: ${r.url()}`); });
    pg.on('dialog', async d => { await d.accept(); });
  }

  /* ---------- 1. 入口页 ---------- */
  await cust.goto(BASE + '/index.html', { waitUntil: 'networkidle0' });
  const qrDrawn = await cust.evaluate(() => {
    const c = document.getElementById('qr');
    if (!c || !c.width) return false;
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
    return dark > 200;   // 确实画出了黑色模块
  });
  ok('入口页二维码已渲染', qrDrawn);

  /* ---------- 2. 顾客端加载 ---------- */
  await cust.goto(BASE + '/customer.html', { waitUntil: 'networkidle0' });
  await cust.evaluate(() => localStorage.removeItem('om_my_order'));
  await cust.reload({ waitUntil: 'networkidle0' });
  await sleep(600);
  await cust.evaluate(() => { const m = document.getElementById('noticeMask'); if (m) m.classList.remove('show'); });

  const shopName = await cust.$eval('#shopName', el => el.textContent);
  ok('顾客端店铺名渲染', shopName.includes('甜时光'), shopName);
  const goodsCount = await cust.$$eval('.item', els => els.length);
  ok('商品列表渲染（招牌推荐 2 款）', goodsCount === 2, String(goodsCount));

  /* ---------- 3. 商家端加载 ---------- */
  await admin.goto(BASE + '/admin.html', { waitUntil: 'networkidle0' });
  await admin.evaluate(() => { window.Store.update(d => { d.orders = []; d.codeSeq = 0; d.shop.manualClose = false; }); window.render(); });
  await sleep(300);
  const navCount = await admin.$$eval('.nav-item', els => els.length);
  ok('商家端导航渲染 6 项', navCount === 6, String(navCount));

  /* ---------- 4. 顾客端下单（走真实 UI） ---------- */
  step('reload顾客端');
  await cust.reload({ waitUntil: 'networkidle0' });
  await sleep(500);
  step('关闭公告');
  await cust.evaluate(() => { const m = document.getElementById('noticeMask'); if (m) m.classList.remove('show'); });

  step('点击选规格');
  await cust.evaluate(() => document.querySelector('.item .add-btn.spec').click());          // 招牌推荐第一款 → 选规格
  await sleep(350);
  const specOpen = await cust.$eval('#specMask', el => el.classList.contains('show'));
  ok('规格弹窗打开', specOpen);

  await cust.evaluate(() => {
    const opts = document.querySelectorAll('#specSheet .opt');
    opts[1].click();                                 // 大杯 +2
  });
  await sleep(200);
  await cust.evaluate(() => {
    const btns = [...document.querySelectorAll('#specSheet .opt')];
    const extra = btns.find(b => b.textContent.includes('珍珠'));
    if (extra) extra.click();                        // 加珍珠 +1
  });
  await sleep(200);
  await cust.evaluate(() => {
    [...document.querySelectorAll('#specSheet button')].find(b => b.textContent.includes('加入购物车')).click();
  });
  await sleep(350);

  const cartTotal = await cust.$eval('#cartTotal', el => el.textContent);
  ok('购物车金额含规格加价（4+2+1=7）', cartTotal === '¥7.00', cartTotal);

  step('打开购物车');
  await cust.evaluate(() => document.getElementById('cartGo').click());
  await sleep(350);
  const cartOpen = await cust.$eval('#cartMask', el => el.classList.contains('show'));
  ok('购物车弹窗打开', cartOpen);

  // 选优惠券：新客立减 3（无门槛）
  await cust.evaluate(() => window.pickCoupon('c1'));
  await sleep(300);
  const afterCoupon = await cust.$eval('#cartTotal', el => el.textContent);
  ok('优惠券生效（7-3=4）', afterCoupon === '¥4.00', afterCoupon);

  step('提交订单');
  await cust.evaluate(() => window.submitOrder());
  await sleep(1400);

  step('读取取餐码');
  const codeShown = await cust.$eval('.code-num', el => el.textContent.trim()).catch(() => null);
  ok('下单成功并展示取餐码', codeShown === 'A001', String(codeShown));

  /* ---------- 5. 商家端实时收到 ---------- */
  await sleep(900);
  const adminState = await admin.evaluate(() => {
    const d = window.Store.read();
    return {
      total: d.orders.length,
      code: d.orders[0] && d.orders[0].code,
      isNew: d.orders[0] && d.orders[0].isNew,
      title: document.title,
      cardCount: document.querySelectorAll('.ocard').length,
      cardCode: document.querySelector('.o-code') && document.querySelector('.o-code').textContent,
      amount: d.orders[0] && d.orders[0].total
    };
  });
  ok('商家端实时收到订单（无需刷新）', adminState.total === 1 && adminState.code === 'A001', JSON.stringify(adminState));
  ok('订单卡片已渲染到看板', adminState.cardCount === 1 && adminState.cardCode === 'A001', JSON.stringify({ n: adminState.cardCount, c: adminState.cardCode }));
  ok('新单标题告警', /新订单/.test(adminState.title), adminState.title);
  ok('金额同步正确 ¥4', adminState.amount === 4, String(adminState.amount));

  /* ---------- 6. 商家推进状态 → 顾客端自动更新 ---------- */
  await admin.evaluate(() => {
    const id = window.Store.read().orders[0].id;
    window.setSt(id, 'making');
  });
  await sleep(800);
  let custStatus = await cust.$eval('.status-pill', el => el.textContent.trim());
  ok('顾客端自动变「制作中」', custStatus.includes('制作中'), custStatus);

  await admin.evaluate(() => {
    const id = window.Store.read().orders[0].id;
    window.setSt(id, 'ready');
  });
  await sleep(800);
  custStatus = await cust.$eval('.status-pill', el => el.textContent.trim());
  ok('顾客端自动变「待取餐」', custStatus.includes('待取餐'), custStatus);

  /* ---------- 7. 商家改价 → 顾客端同步 ---------- */
  await admin.evaluate(() => { window.go('products'); });
  await sleep(400);
  await admin.evaluate(() => {
    const d = window.Store.read();
    const p = d.products.find(x => x.name === '珍珠奶茶');
    window.upd(p.id, 'price', 3);
  });
  await sleep(900);
  const newPrice = await cust.evaluate(() => {
    window.switchCat(2);   // 奶茶拿铁
    const items = [...document.querySelectorAll('.item')];
    const t = items.find(i => i.textContent.includes('珍珠奶茶'));
    return t ? t.querySelector('.price').textContent : null;
  });
  ok('改价实时同步到顾客端（¥3）', newPrice === '¥3', String(newPrice));

  /* ---------- 8. 一键打烊 → 顾客端遮罩 ---------- */
  await admin.evaluate(() => { window.go('shop'); });
  await sleep(300);
  await admin.evaluate(() => window.toggleClose());
  await sleep(900);
  const closed = await cust.$eval('#closedMask', el => el.classList.contains('show'));
  ok('一键打烊 → 顾客端弹出打烊遮罩', closed);
  await admin.evaluate(() => window.toggleClose());
  await sleep(600);
  const reopened = await cust.$eval('#closedMask', el => !el.classList.contains('show'));
  ok('恢复营业 → 遮罩消失', reopened);

  /* ---------- 9. 商家端各页面无报错 ---------- */
  for (const p of ['orders', 'products', 'coupons', 'shop', 'qrcode', 'stats']) {
    await admin.evaluate(k => window.go(k), p);
    await sleep(280);
  }
  const qrOK = await admin.evaluate(async () => {
    window.go('qrcode');
    await new Promise(r => setTimeout(r, 400));
    const c = document.getElementById('qrCanvas');
    if (!c || !c.width) return false;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
    return dark > 200;
  });
  ok('后台点餐码 canvas 渲染成功', qrOK);

  /* ---------- 10. 模拟来单 ---------- */
  await admin.evaluate(() => { window.go('orders'); window.testOrder(); });
  await sleep(600);
  const n2 = await admin.evaluate(() => window.Store.read().orders.length);
  ok('模拟来单功能可用', n2 === 2, String(n2));

  /* ---------- 收尾 ---------- */
  await admin.evaluate(() => { window.Store.reset(); });
  await sleep(200);
  await browser.close();

  say('');
  if (errors.length) {
    say('运行时错误 / 警告：');
    [...new Set(errors)].forEach(e => say('  ! ' + e));
    fail += errors.length;
  } else {
    say('运行时错误：无 ✓');
  }
  console.log(`\n端到端校验：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  require('fs').writeFileSync(__dirname + '/_e2e_error.txt', String(e && e.stack || e));
  console.log('\n>>> 测试异常：' + (e && e.message || e));
  console.log('>>> 已收集的页面错误：\n' + [...new Set(errors)].map(x => '    ' + x).join('\n'));
  setTimeout(() => process.exit(1), 100);
});
