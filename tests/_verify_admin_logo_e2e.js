// 防 logo / emoji 改动无反应的回归测试
const path = require('path');
process.env.NODE_PATH = 'C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules';
require('module').Module._initPaths();
const puppeteer = require('puppeteer-core');

function ok(msg) { console.log('PASS  ' + msg); pass++; }
function fail(msg) { console.log('FAIL  ' + msg); f++; }
let pass = 0, f = 0;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PE:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('CE:', m.text()); });

  // 监听 prompt，固定返回 '🥟'
  page.on('dialog', async d => {
    if (d.type() === 'prompt') { await d.accept('🥟'); }
    else { await d.dismiss(); }
  });

  await page.goto('http://127.0.0.1:8934/admin.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // 进入店铺设置页（pg=shop）
  await page.evaluate(() => { try { go && go('shop'); } catch (e) {} });
  await new Promise(r => setTimeout(r, 400));

  // ---- 检查 1: compressImage 是 callback 风格（无 .then 支持） ----
  const isCallback = await page.evaluate(() => {
    // 试着当作 Promise 用，应明确不是 Promise
    var p = Store.compressImage(new Blob(['x'], { type: 'image/jpeg' }), 50, 0.5, function () {});
    return !(p && typeof p.then === 'function');
  });
  if (isCallback) ok('compressImage 是 callback 风格（pickShopLogo 必须按 callback 调用）');
  else fail('compressImage 不应是 Promise');

  // ---- 检查 2: 模拟 logoImg 已有值，点"换 emoji"按钮，验证 logoImg 被清空 + logo 字段更新 ----
  await page.evaluate(() => {
    save(function (d) { d.shop.logoImg = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII='; });
    render();
  });
  await new Promise(r => setTimeout(r, 400));

  // 找到"换 emoji"按钮，click
  const clicked = await page.evaluate(() => {
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.indexOf('换 emoji') >= 0) { btns[i].click(); return true; }
    }
    return false;
  });
  if (clicked) ok('找到并点击"换 emoji"按钮');
  else fail('没找到"换 emoji"按钮');
  await new Promise(r => setTimeout(r, 600));

  // 验证结果
  const state = await page.evaluate(() => {
    var d = Store.read();
    return { logoImg: d.shop.logoImg, logo: d.shop.logo };
  });
  if (state.logoImg === '' || state.logoImg == null) ok('换 emoji 后 logoImg 已清空');
  else fail('logoImg 没清空: ' + state.logoImg);
  if (state.logo === '🥟') ok('换 emoji 后 logo 字段更新为 🥟');
  else fail('logo 没更新: ' + state.logo);

  // ---- 检查 3: 上传图片走 callback 流程（模拟文件对象） ----
  const uploadWorked = await page.evaluate(() => new Promise(resolve => {
    // 用一个 1x1 PNG 的 base64 转 Blob 模拟图片
    var b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';
    var bin = atob(b64); var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var blob = new Blob([arr], { type: 'image/png' });
    blob.name = 'test.png'; blob.lastModified = Date.now();
    Store.compressImage(blob, 320, 0.7, function (url) {
      resolve(url && url.indexOf('data:image/') === 0);
    });
  }));
  if (uploadWorked) ok('compressImage callback 正常返回 dataURL');
  else fail('compressImage callback 返回空');

  // 截图存证
  await page.screenshot({ path: '_admin_logo_changed.png' });

  await browser.close();
  console.log(`\nadmin logo/emoji 改动校验：${pass} 通过 / ${f} 失败`);
  process.exit(f > 0 ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });