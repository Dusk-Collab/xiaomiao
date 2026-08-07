/* 清干净的截图存档：店铺名称、已打烊状态、登录层可弹、购物车阴影小 */
const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 414, height: 800, isMobile: true, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8934/customer.html');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.evaluate(() => {
    Store.reset(); Store.seed();
    Store.update(function (d) {
      d.shop.name = '小淼包子铺';
      d.shop.slogan = '小淼亲手包的哦~';
      d.shop.hours = { start: '06:00', end: '13:00' };
      d.shop.noticeOn = false;     /* 把公告关掉，截图干净 */
      d.shop.logoImg = '';         /* 用 emoji */
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1000));

  /* 不关掉 closed mask，让用户看到软提示；同时登录层在它之上 */
  await page.screenshot({ path: path.join(__dirname, '_closed_with_login.png') });
  await page.evaluate(() => dismissClosed());
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => {
    $('loginName').value = '小张';
    $('loginPhone').value = '13800000000';
    doLogin();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, '_closed_menu.png') });
  await browser.close();
  console.log('Screenshots saved: _closed_with_login.png, _closed_menu.png');
})();
