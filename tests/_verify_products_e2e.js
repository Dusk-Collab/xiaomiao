/* 商品管理 E2E：批量选择/上架/下架、上架自动分类、图片上传压缩 */
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8932';

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => typeof go === 'function' && typeof D !== 'undefined' && D.products, { timeout: 15000 });
  await page.evaluate(() => go('products'));
  await new Promise(r => setTimeout(r, 300));

  const hasBulk = await page.evaluate(() => !!document.querySelector('.bulk-bar'));
  const hasFile = await page.evaluate(() => !!document.getElementById('fileInput'));
  const hasSelAll = await page.evaluate(() => !!document.getElementById('selAll'));

  await page.evaluate(() => { var cb = document.getElementById('selAll'); cb.checked = true; toggleAll(cb); bulkOff(); });
  const allOff = await page.evaluate(() => Store.read().products.every(p => p.on === false));

  await page.evaluate(() => { var cb = document.getElementById('selAll'); cb.checked = true; toggleAll(cb); bulkOn(); });
  const allOn = await page.evaluate(() => Store.read().products.every(p => p.on === true));

  const auto = await page.evaluate(() => {
    const id = Store.read().products[0].id;
    upd(id, 'name', '黑芝麻奶茶');           // 改名并触发 upd（含自动分类）
    return Store.read().products[0].cat;
  });

  const imgOk = await page.evaluate(() => new Promise(res => {
    const b64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    fetch(b64).then(r => r.blob()).then(b => {
      Store.compressImage(b, 240, 0.6, u => res(!!u && u.indexOf('data:image') === 0));
    }).catch(() => res(false));
  }));

  await browser.close();

  const checks = [
    ['批量操作条渲染', hasBulk],
    ['文件上传控件存在', hasFile],
    ['全选控件存在', hasSelAll],
    ['批量下架生效', allOff],
    ['批量上架生效', allOn],
    ['上架自动分类 奶茶→奶茶拿铁', auto === '奶茶拿铁'],
    ['图片压缩可用', imgOk],
    ['无运行时错误', errors.length === 0]
  ];
  let fail = 0;
  checks.forEach(([n, v]) => { console.log((v ? '  PASS  ' : '  FAIL  ') + n + (v ? '' : '  → ' + JSON.stringify(errors))); if (!v) fail++; });
  console.log(`\n商品管理 E2E：${checks.length - fail} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
