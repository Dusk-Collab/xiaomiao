/* 截一张"顾客点餐页 + 商家后台"的对比图，仅用于人工核对新配色 / 新图标 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8935';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 820, isMobile: true, deviceScaleFactor: 2 });

  /* 顾客页 */
  await page.goto(BASE + '/customer.html');
  await page.evaluate(() => { localStorage.setItem('om_me', JSON.stringify({ name: '小张', phone: '13800138000', wechat: false })); localStorage.removeItem('om_my_order'); });
  await page.evaluate(() => {
    Store.reset(); Store.seed();
    /* 营业时间宽口径保证截图时不被打烊遮罩挡住 */
    Store.update(function (d) { d.shop.hours = { start: '00:00', end: '23:59' }; d.shop.manualClose = false; d.shop.noticeOn = false; });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    var p = Store.read().products.find(x => x.id === 'p1');
    addToCart(p, '', p.price, 1);
    var p2 = Store.read().products.find(x => x.id === 'p9');
    addToCart(p2, '', p2.price, 1);
  });
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: path.join(__dirname, '_customer_look.png'), fullPage: false });

  /* 商家后台：清缓存强制重新 seed + 演示一条订单 */
  const apage = await browser.newPage();
  await apage.setViewport({ width: 1280, height: 800 });
  await apage.goto(BASE + '/admin.html');
  await apage.evaluate(() => { localStorage.clear(); });
  await apage.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 700));
  /* 演示 1 条订单 */
  await apage.evaluate(() => {
    var order = Store.createOrder({
      items: [{ name: '豆浆油条套餐', spec: '中杯·热', price: 6, qty: 1, emoji: '🥢', color: '#FFF1DD', img: '' }, { name: '茶叶蛋', spec: '', price: 2, qty: 2, emoji: '🥚', color: '#F8E2C5', img: '' }],
      goodsTotal: 10, deliveryFee: 0, discount: 0, couponName: '',
      total: 10, mode: 'pickup', remark: '', table: '3',
      customer: { name: '小张', phone: '13800138000', wechat: false }
    });
    Store.setOrderStatus(order.id, 'making');
  });
  await new Promise(r => setTimeout(r, 250));
  await apage.screenshot({ path: path.join(__dirname, '_admin_look.png'), fullPage: false });

  await browser.close();
  console.log('OK - shots saved');
})().catch(e => { console.error(e); process.exit(1); });
