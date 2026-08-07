/* 登录流程 + 新购物车图标 + 店铺图标的端到端验证 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8934';

const LOG = path.join(__dirname, '_login_e2e_log.txt');
function say(s) { try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {} }

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-features=IsolateOrigins,site-per-process']
  });
  let pass = 0, fail = 0;
  const ok = (n, v, extra) => { if (v) { pass++; say('PASS  ' + n); }
    else { fail++; say('FAIL  ' + n + (extra ? ' :: ' + extra : '')); } };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 414, height: 800, isMobile: true, deviceScaleFactor: 2 });
    page.on('console', m => { if (m.type() === 'error') say('JS_ERR ' + m.text()); });
    page.on('pageerror', e => say('PAGEERR ' + e.message));

    /* === 清理 localStorage，确保首次访问会弹登录 === */
    await page.goto(BASE + '/customer.html');
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 600));

    ok('1. 登录弹窗出现', await page.$eval('#loginMask', el => getComputedStyle(el).display !== 'none'));
    ok('2. 购物车图标使用 SVG 而非 emoji',
       await page.$eval('#cartIcon', el => el.querySelector('svg') !== null && el.textContent.indexOf('🛒') === -1));
    ok('3. 标题包含登录入口',
       await page.$eval('#loginMask', el => el.textContent.indexOf('开始点餐') >= 0));

    /* === 微信一键登录 === */
    await page.evaluate(() => document.querySelector('#loginMask button:nth-of-type(2)').click());
    await new Promise(r => setTimeout(r, 250));
    ok('4. 微信登录后登录层关闭', await page.$eval('#loginMask', el => getComputedStyle(el).display === 'none'));
    ok('5. 用户悬浮按钮出现', await page.$eval('#userFab', el => getComputedStyle(el).display !== 'none'));

    /* === 添加商品，新购物车按钮启用 + 不再是 empty 状态 === */
    await page.evaluate(() => { try { Store.reset(); Store.seed(); } catch (e) {} });
    await page.evaluate(() => {
      var p = Store.read().products.find(x => x.id === 'p1');
      addToCart(p, '', p.price, 1);
    });
    await new Promise(r => setTimeout(r, 200));
    ok('6. 购物车总数变 1 且非 empty 状态',
       await page.$eval('#cartIcon', el => el.classList.contains('empty') === false && document.getElementById('cartDot').textContent === '1'));

    /* === 上传店铺图标（用 base64） → 顾客端显示图片 === */
    await page.evaluate(() => {
      Store.update(function (d) {
        d.shop.logoImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAEAYAAAHMfHdlAAAAEklEQVR42mP8//8/AyUY434BAAgUCv7T/3tBAAAAAElFTkSuQmCC';
      });
    });
    await new Promise(r => setTimeout(r, 150));
    await page.evaluate(() => renderShop());
    await new Promise(r => setTimeout(r, 100));
    ok('7. 顾客端 hero-logo 显示 <img>',
       await page.$eval('#shopLogo', el => el.querySelector('img') !== null && el.classList.contains('has-img')));

    /* === 退出登录：登录层再次出现 === */
    page.on('dialog', d => d.accept());
    await page.evaluate(() => { $('userFab'); toggleUserMenu(); logout(); });
    await new Promise(r => setTimeout(r, 250));
    ok('8. 退出登录后弹窗再次出现', await page.$eval('#loginMask', el => getComputedStyle(el).display !== 'none'));

    /* === 配色已经是早餐店暖橙 === */
    var brand = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
    ok('9. 主色调为早餐店暖橙 #' + brand, brand.toLowerCase() === '#e8841c', 'actual=' + brand);
    var bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    var expected = 'rgb(251, 245, 235)';
    ok('10. body 背景为奶油米色 ' + bg, bg === expected, 'actual=' + bg);

    /* === 截图存档（不要放在首页必备，只是开发验证） === */
    await page.screenshot({ path: path.join(__dirname, '_login_e2e.png'), fullPage: false });
  } catch (e) {
    fail++; say('EXC  ' + e.message + '\n' + e.stack);
  } finally {
    await browser.close();
    say(`\n登录 & 新UI 校验：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
  }
})();
