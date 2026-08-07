/* 修复验证：1) 打烊时仍可登录浏览；2) 下单链路被拦截；
   3) 浏览器标签的 title 跟着店铺名动态变；4) 购物车阴影变小 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8934';
const LOG = path.join(__dirname, '_closed_e2e_log.txt');
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

    await page.goto(BASE + '/customer.html');
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => sessionStorage.clear());

    /* === 强制把店铺改成"小淼包子铺" + 打烊时间（全天不在营业时段内） === */
    await page.evaluate(() => {
      Store.reset();
      Store.seed();
      Store.update(function (d) {
        d.shop.name = '小淼包子铺';
        d.shop.slogan = '小淼亲手包的哦~';
        /* 当前 14:43，必然不在 06:00-13:00 之内 */
        d.shop.hours = { start: '06:00', end: '13:00' };
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 700));

    /* 1. 店铺名 / 营业状态徽章 */
    ok('1. 店铺名已变成"小淼包子铺"',
       await page.$eval('#shopName', el => el.textContent.trim() === '小淼包子铺'));

    var storeOpen = await page.evaluate(() => Store.isOpenNow(Store.read()));
    ok('2. 当前时段 Store.isOpenNow 返回 false（已打烊）', storeOpen === false);

    var badge = await page.$eval('#openBadge', el => el.textContent);
    ok('3. 顶部徽章显示"已打烊"', badge === '已打烊');

    /* 2. 打烊遮罩要点透过，让登录层显示 */
    var closedShowing = await page.$eval('#closedMask', el => el.classList.contains('show'));
    var loginShowing = await page.$eval('#loginMask', el => getComputedStyle(el).display !== 'none');
    ok('4. 打烊遮罩是软提示（show=true），不影响登录层弹出', closedShowing && loginShowing);

    var closedZ = await page.evaluate(() => parseInt(getComputedStyle(document.getElementById('closedMask')).zIndex));
    var loginZ  = await page.evaluate(() => parseInt(getComputedStyle(document.getElementById('loginMask')).zIndex));
    ok('5. closedMask z-index(' + closedZ + ') < loginMask z-index(' + loginZ + ')',
       closedZ < loginZ);

    /* 3. 登录流程在打烊时仍然能完成 */
    await page.evaluate(() => {
      $('loginName').value = '打烊测试客';
      $('loginPhone').value = '13800001111';
      doLogin();
    });
    await new Promise(r => setTimeout(r, 250));
    ok('6. 打烊时仍可登录（loginMask 关闭 + userFab 出现）',
       !(await page.$eval('#loginMask', el => el.classList.contains('show'))) &&
       (await page.$eval('#userFab', el => getComputedStyle(el).display !== 'none')));

    /* 4. 欢迎后，"看看都有些啥" 按钮把打烊盒子收起来，菜单可点击 */
    var dismissBtnExists = await page.$eval('#closedMask', el => el.textContent.indexOf('看看都有些啥') >= 0);
    ok('7. 打烊盒子有"看看都有些啥"按钮', dismissBtnExists);

    await page.evaluate(() => dismissClosed());
    await new Promise(r => setTimeout(r, 200));
    ok('8. 点"看看都有些啥"后遮罩关闭', !(await page.$eval('#closedMask', el => el.classList.contains('show'))));
    await page.evaluate(() => sessionStorage.removeItem('om_closed_seen'));

    /* 5. 标题动态化 */
    var title = await page.title();
    ok('9. document.title 含店铺名 "' + title + '"', title.indexOf('小淼包子铺') >= 0);
    ok('10. document.title 含"扫码点餐"', title.indexOf('扫码点餐') >= 0);

    /* 6. 下单链路被拦截：quickAdd 应当弹 toast 后返回 */
    await page.evaluate(() => {
      window._closedAddToast = '';
      var _toast = toast;
      window.toast = function (m) { window._closedAddToast = m; _toast(m); };
    });
    await page.evaluate(() => quickAdd('p1'));
    await new Promise(r => setTimeout(r, 200));
    ok('11. quickAdd 在打烊时弹"本店已打烊"且购物车不变',
       (await page.evaluate(() => window._closedAddToast)).indexOf('打烊') >= 0 &&
       (await page.evaluate(() => cart.length === 0)));

    /* 7. submitOrder 也被拦截（即使绕过 quickAdd 也不会创建订单） */
    var orderCount1 = await page.evaluate(() => Object.keys(Store.read().orders || {}).length);
    await page.evaluate(() => {
      var p = Store.read().products[0];
      addToCart(p, '', p.price, 1);   /* 这里同样会被拦截，但万一…… */
      submitOrder();
    });
    await new Promise(r => setTimeout(r, 800));
    var orderCount2 = await page.evaluate(() => Object.keys(Store.read().orders || {}).length);
    ok('12. submitOrder 在打烊时不会创建新订单（' + orderCount1 + ' → ' + orderCount2 + '）',
       orderCount1 === orderCount2);

    /* 8. 购物车阴影已收紧 */
    var cartBox = await page.evaluate(() => {
      var s = getComputedStyle(document.getElementById('cartIcon'));
      return { w: s.width, h: s.height, mt: s.marginTop, bs: s.boxShadow };
    });
    ok('13. 购物车阴影收紧（blur ≤ 12px）: ' + cartBox.bs,
       /(\d+)px\s+(\d+)px\s+(\d+)px/.test(cartBox.bs) && (parseInt(RegExp.$3) <= 12));
    ok('14. 购物车尺寸适中 / 抬起量减小: ' + cartBox.w + 'x' + cartBox.h + ' mt=' + cartBox.mt,
       parseInt(cartBox.w) <= 50 && parseInt(cartBox.mt) >= -22);

    /* === 截图 === */
    await page.screenshot({ path: path.join(__dirname, '_closed_e2e.png'), fullPage: false });
  } catch (e) {
    fail++; say('EXC  ' + e.message + '\n' + e.stack);
  } finally {
    await browser.close();
    say(`\n打烊场景：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
  }
})();
