// 截图：购物车空 / 有商品 两个状态
const path = require('path');
process.env.NODE_PATH = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules';
require('module').Module._initPaths();
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ========== 空购物车 ==========
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  // 清掉之前测试残留
  await page1.goto('http://127.0.0.1:8934/customer.html', { waitUntil: 'domcontentloaded' });
  await page1.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await page1.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  // 登录
  await page1.evaluate(() => { try { showLogin && showLogin(); } catch (e) {} });
  await new Promise(r => setTimeout(r, 400));
  await page1.evaluate(() => {
    document.getElementById('loginName').value = '老顾客';
    document.getElementById('loginPhone').value = '13800';
    doLogin && doLogin();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page1.evaluate(() => { try { Store && Store.write && Store.write('settings', { ...(D.settings || {}), noticeOn: false }); } catch (e) {} });
  await page1.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await page1.screenshot({ path: '_cart_empty.png', fullPage: false });
  console.log('empty saved');

  // ========== 有商品 ==========
  await page1.evaluate(() => {
    try {
      const p = D.products[0];
      cart.push({ id: p.id, name: p.name, price: p.price, qty: 2, spec: '', unit: '份' });
      renderCart && renderCart();
    } catch (e) { console.log('err', e.message); }
  });
  await new Promise(r => setTimeout(r, 600));
  await page1.screenshot({ path: '_cart_full.png', fullPage: false });
  console.log('full saved');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });